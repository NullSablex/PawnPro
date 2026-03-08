import * as path from 'path';
import { stripCommentsPreserveColumns, buildIncludePaths } from '../core/includes.js';
import { buildFunctionsIndex } from '../core/apiIndex.js';
import { getFileSymbols, getIncludedFiles } from '../core/fileCache.js';
import { getWorkspaceRoot } from './configBridge.js';
const docIntelliCache = new Map();
const CONTROL_KEYWORDS = new Set([
    'if', 'for', 'while', 'switch', 'return', 'sizeof', 'tagof', 'assert', 'else', 'do',
]);
function splitArgs(raw) {
    const args = [];
    let cur = '';
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        const prev = i > 0 ? raw[i - 1] : '';
        if (ch === '"' && !inSingle && prev !== '\\') {
            inDouble = !inDouble;
            cur += ch;
            continue;
        }
        if (ch === "'" && !inDouble && prev !== '\\') {
            inSingle = !inSingle;
            cur += ch;
            continue;
        }
        if (inSingle || inDouble) {
            cur += ch;
            continue;
        }
        if (ch === '(' || ch === '[' || ch === '{')
            depth++;
        if (ch === ')' || ch === ']' || ch === '}')
            depth = Math.max(0, depth - 1);
        if (ch === ',' && depth === 0) {
            args.push(cur.trim());
            cur = '';
            continue;
        }
        cur += ch;
    }
    if (cur.trim())
        args.push(cur.trim());
    return args;
}
function parseArgRange(params) {
    let minArgs = 0;
    let total = 0;
    let variadic = false;
    for (const p of params) {
        const t = p.trim();
        if (!t)
            continue;
        if (t === '...' || t.endsWith('...')) {
            variadic = true;
            continue;
        }
        total++;
        if (!t.includes('='))
            minArgs++;
    }
    return { minArgs, maxArgs: variadic ? null : total };
}
function normalizeExternalBounds(sig) {
    if (sig.maxArgs === null)
        return sig;
    const hasFlexibleMarkers = sig.signature.includes('=') ||
        sig.signature.includes('...') ||
        /\{[^}]*,[^}]*\}/.test(sig.signature);
    if (!hasFlexibleMarkers)
        return sig;
    return { ...sig, maxArgs: null };
}
function normalizeName(token) {
    if (token.includes('::')) {
        const parts = token.split('::');
        return parts[parts.length - 1];
    }
    return token;
}
function updateBraceDepth(line, currentDepth) {
    let depth = currentDepth;
    let inSingle = false;
    let inDouble = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        const prev = i > 0 ? line[i - 1] : '';
        if (ch === '"' && !inSingle && prev !== '\\') {
            inDouble = !inDouble;
            continue;
        }
        if (ch === "'" && !inDouble && prev !== '\\') {
            inSingle = !inSingle;
            continue;
        }
        if (inSingle || inDouble)
            continue;
        if (ch === '{')
            depth++;
        else if (ch === '}')
            depth = Math.max(0, depth - 1);
    }
    return depth;
}
function parseTextSymbols(text, file) {
    const sigs = new Map();
    const macros = new Set();
    const lines = text.split(/\r?\n/);
    const rxNative = /^\s*(?:forward\s+)?native\s+(?:(?:[A-Za-z_]\w*::)*|(?:[A-Za-z_]\w*:))?\s*([A-Za-z_]\w*)\s*\(([^)]*)\)/;
    const rxForward = /^\s*forward\s+(?:(?:[A-Za-z_]\w*::)*|(?:[A-Za-z_]\w*:))?\s*([A-Za-z_]\w*)\s*\(([^)]*)\)/;
    const rxPublicStock = /^\s*(public|stock)\s+(?:(?:[A-Za-z_]\w*::)*|(?:[A-Za-z_]\w*:))?\s*([A-Za-z_]\w*)\s*\(([^)]*)\)/;
    const rxPlain = /^\s*(?:[A-Za-z_]\w*::)*([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(\{)?/;
    const rxDefine = /^\s*#\s*define\s+([A-Za-z_]\w*)\b/;
    let inBlock = false;
    let depth = 0;
    for (const rawLine of lines) {
        const stripped = stripCommentsPreserveColumns(rawLine, inBlock);
        inBlock = stripped.inBlock;
        const line = stripped.text;
        const topLevel = depth === 0;
        if (topLevel) {
            const dm = rxDefine.exec(line);
            if (dm)
                macros.add(dm[1]);
            const mNative = rxNative.exec(line);
            if (mNative) {
                const name = mNative[1];
                const params = splitArgs(mNative[2] ?? '').filter(Boolean);
                const range = parseArgRange(params);
                sigs.set(name, {
                    name,
                    signature: `${name}(${(mNative[2] ?? '').trim()})`,
                    params,
                    minArgs: range.minArgs,
                    maxArgs: range.maxArgs,
                    kind: 'native',
                    file,
                });
            }
            else {
                const mForward = rxForward.exec(line);
                if (mForward) {
                    const name = mForward[1];
                    const params = splitArgs(mForward[2] ?? '').filter(Boolean);
                    const range = parseArgRange(params);
                    sigs.set(name, {
                        name,
                        signature: `${name}(${(mForward[2] ?? '').trim()})`,
                        params,
                        minArgs: range.minArgs,
                        maxArgs: range.maxArgs,
                        kind: 'forward',
                        file,
                    });
                }
                else {
                    const mPS = rxPublicStock.exec(line);
                    if (mPS) {
                        const name = mPS[2];
                        const params = splitArgs(mPS[3] ?? '').filter(Boolean);
                        const range = parseArgRange(params);
                        sigs.set(name, {
                            name,
                            signature: `${name}(${(mPS[3] ?? '').trim()})`,
                            params,
                            minArgs: range.minArgs,
                            maxArgs: range.maxArgs,
                            kind: mPS[1],
                            file,
                        });
                    }
                    else {
                        const mPlain = rxPlain.exec(line);
                        if (mPlain) {
                            const name = mPlain[1];
                            if (!CONTROL_KEYWORDS.has(name)) {
                                const params = splitArgs(mPlain[2] ?? '').filter(Boolean);
                                const range = parseArgRange(params);
                                sigs.set(name, {
                                    name,
                                    signature: `${name}(${(mPlain[2] ?? '').trim()})`,
                                    params,
                                    minArgs: range.minArgs,
                                    maxArgs: range.maxArgs,
                                    kind: 'plain',
                                    file,
                                });
                            }
                        }
                    }
                }
            }
        }
        depth = updateBraceDepth(line, depth);
    }
    return { sigs, macros };
}
export function getCallContext(lineText, character) {
    const before = lineText.slice(0, character);
    const open = before.lastIndexOf('(');
    if (open < 0)
        return undefined;
    const nameMatch = /([A-Za-z_][\w:]*)\s*$/.exec(before.slice(0, open));
    if (!nameMatch)
        return undefined;
    const name = normalizeName(nameMatch[1]);
    let depth = 0;
    let activeParam = 0;
    let inSingle = false;
    let inDouble = false;
    const argsPart = before.slice(open + 1);
    for (let i = 0; i < argsPart.length; i++) {
        const ch = argsPart[i];
        const prev = i > 0 ? argsPart[i - 1] : '';
        if (ch === '"' && !inSingle && prev !== '\\') {
            inDouble = !inDouble;
            continue;
        }
        if (ch === "'" && !inDouble && prev !== '\\') {
            inSingle = !inSingle;
            continue;
        }
        if (inSingle || inDouble)
            continue;
        if (ch === '(' || ch === '[' || ch === '{')
            depth++;
        else if (ch === ')' || ch === ']' || ch === '}')
            depth = Math.max(0, depth - 1);
        else if (ch === ',' && depth === 0)
            activeParam++;
    }
    return { name, activeParam };
}
export async function buildIntelliData(document, config) {
    const uri = document.uri.toString();
    const version = document.version;
    const cached = docIntelliCache.get(uri);
    if (cached && cached.version === version) {
        return { sigs: cached.sigs, macros: cached.macros };
    }
    const cfg = config.getAll();
    const ws = getWorkspaceRoot();
    const includePaths = buildIncludePaths(cfg, ws);
    const local = parseTextSymbols(document.getText(), document.fileName);
    const sigs = new Map(local.sigs);
    const macros = new Set(local.macros);
    // Include API index (already cached internally)
    const apiIndex = await buildFunctionsIndex(includePaths);
    for (const [name, entry] of apiIndex) {
        if (sigs.has(name))
            continue;
        const open = entry.signature.indexOf('(');
        const close = entry.signature.lastIndexOf(')');
        const paramsRaw = open >= 0 && close > open ? entry.signature.slice(open + 1, close) : '';
        const params = splitArgs(paramsRaw).filter(Boolean);
        const range = parseArgRange(params);
        const extSig = {
            name,
            signature: entry.signature,
            params,
            minArgs: range.minArgs,
            maxArgs: range.maxArgs,
            kind: 'api',
            file: entry.file,
        };
        sigs.set(name, normalizeExternalBounds(extSig));
    }
    // Include project-specific included files (uses shared cache)
    try {
        const includedFiles = await getIncludedFiles(document.fileName, includePaths);
        for (const fp of includedFiles) {
            if (fp === document.fileName)
                continue;
            const fromFile = await getFileSymbols(fp);
            for (const [name, sig] of fromFile.sigs) {
                if (!sigs.has(name))
                    sigs.set(name, normalizeExternalBounds(sig));
            }
            for (const m of fromFile.macros)
                macros.add(m);
        }
    }
    catch {
        // Ignore include scan errors
    }
    docIntelliCache.set(uri, { version, sigs, macros });
    if (docIntelliCache.size > 20) {
        const first = docIntelliCache.keys().next().value;
        if (first)
            docIntelliCache.delete(first);
    }
    return { sigs, macros };
}
export function signatureToDetail(sig) {
    const where = sig.file ? path.basename(sig.file) : 'workspace';
    return `${sig.kind} • ${where}`;
}
//# sourceMappingURL=intellisense.js.map