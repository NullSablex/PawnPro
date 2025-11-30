import * as fs from 'fs/promises';
import * as path from 'path';
import * as iconv from 'iconv-lite';
const fileCache = new Map();
const indexCache = new Map();
function decodeWithFallback(buf) {
    // Prefer utf8, fallback para windows-1252 se houver muitos caracteres substituídos.
    const utf8 = buf.toString('utf8');
    const replacements = (utf8.match(/\uFFFD/g) || []).length;
    if (replacements > Math.max(2, Math.floor(utf8.length * 0.01))) {
        return iconv.decode(buf, 'windows1252');
    }
    return utf8;
}
async function readText(file) {
    const buf = await fs.readFile(file);
    return decodeWithFallback(buf);
}
function isPawnFile(file) {
    const f = file.toLowerCase();
    return f.endsWith('.inc') || f.endsWith('.pwn');
}
async function* walk(dir) {
    let ents;
    try {
        ents = await fs.readdir(dir, { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const ent of ents) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            yield* walk(p);
        }
        else if (ent.isFile() && isPawnFile(p)) {
            yield p;
        }
    }
}
const RX_NATIVE = /^\s*(?:forward\s+)?native\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*;\s*$/gm;
const RX_FORWARD = /^\s*forward\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*;\s*$/gm;
/** Captura o bloco de comentário imediatamente acima do índice informado. */
function extractDocAbove(text, startIdx) {
    // Caminha para cima ignorando linhas em branco.
    let out = [];
    let sawComment = false;
    function pushLine(line) { out.unshift(line); }
    const lines = text.split(/\r?\n/);
    let off = 0;
    for (let ln = 0; ln < lines.length; ln++) {
        const l = lines[ln];
        const next = off + l.length + 1; // inclui newline
        if (next > startIdx) {
            // ln é a linha que contém startIdx → varre acima
            for (let k = ln - 1; k >= 0; k--) {
                const s = lines[k];
                if (/^\s*$/.test(s)) {
                    if (sawComment)
                        break;
                    continue;
                }
                if (/^\s*\/\/(.*)$/.test(s)) {
                    pushLine(s.trim());
                    sawComment = true;
                    continue;
                }
                if (/\*\/\s*$/.test(s)) {
                    // comentário de bloco — coleta até o início
                    pushLine(s.trim());
                    sawComment = true;
                    for (let j = k - 1; j >= 0; j--) {
                        pushLine(lines[j].trim());
                        if (/\/\*/.test(lines[j])) {
                            return out.join('\n');
                        }
                    }
                    return out.join('\n');
                }
                break; // não é comentário contíguo
            }
            break;
        }
        off = next;
    }
    if (!sawComment)
        return undefined;
    return out.join('\n');
}
function parseFileFunctions(file, text) {
    const map = new Map();
    function add(name, sig, startIdx) {
        const signature = `${name}(${sig.trim()})`;
        const doc = extractDocAbove(text, startIdx);
        map.set(name, { name, signature, doc, file });
    }
    let m;
    while ((m = RX_NATIVE.exec(text))) {
        add(m[1], m[2], m.index);
    }
    while ((m = RX_FORWARD.exec(text))) {
        add(m[1], m[2], m.index);
    }
    return map;
}
async function buildForFile(file) {
    try {
        const st = await fs.stat(file);
        const prev = fileCache.get(file);
        if (prev && prev.mtimeMs === st.mtimeMs) {
            return prev.funcs;
        }
        const text = await readText(file);
        const funcs = parseFileFunctions(file, text);
        fileCache.set(file, { mtimeMs: st.mtimeMs, funcs });
        return funcs;
    }
    catch {
        return new Map();
    }
}
export async function buildFunctionsIndex(includePaths) {
    const key = JSON.stringify([...includePaths].map(p => path.normalize(p)).sort());
    const cached = indexCache.get(key);
    if (cached)
        return cached;
    const index = new Map();
    for (const dir of includePaths) {
        for await (const file of walk(dir)) {
            const funcs = await buildForFile(file);
            for (const [name, entry] of funcs) {
                if (!index.has(name))
                    index.set(name, entry);
            }
        }
    }
    indexCache.set(key, index);
    return index;
}
export async function findFunction(name, includePaths) {
    const idx = await buildFunctionsIndex(includePaths);
    return idx.get(name);
}
//# sourceMappingURL=apiIndex.js.map