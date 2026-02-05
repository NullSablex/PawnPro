import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as iconv from 'iconv-lite';
import { detectSupportedFlags, computeMinimalArgs } from './flags.js';
/* ─── Path helpers ──────────────────────────────────────────────── */
function normalizeInputPath(p) {
    if (!p)
        return undefined;
    const unq = p.trim().replace(/^["']|["']$/g, '');
    if (!unq)
        return undefined;
    return unq.startsWith('~')
        ? path.join(process.env.HOME || process.env.USERPROFILE || '', unq.slice(1))
        : unq;
}
function existsExecutable(p) {
    try {
        if (!fs.existsSync(p))
            return false;
        if (fs.statSync(p).isDirectory())
            return false;
        if (process.platform !== 'win32')
            fs.accessSync(p, fs.constants.X_OK);
        return true;
    }
    catch {
        return false;
    }
}
function scanPathFor(names) {
    const envPath = process.env.PATH || '';
    const sep = process.platform === 'win32' ? ';' : ':';
    const exts = process.platform === 'win32'
        ? (process.env.PATHEXT || '.EXE;.BAT;.CMD').split(';')
        : [''];
    const dirs = envPath.split(sep).filter(Boolean);
    for (const d of dirs) {
        for (const n of names) {
            if (process.platform === 'win32') {
                for (const e of exts) {
                    const p = path.join(d, n.toLowerCase().endsWith(e.toLowerCase()) ? n : n + e);
                    if (existsExecutable(p))
                        return p;
                }
            }
            else {
                const p = path.join(d, n);
                if (existsExecutable(p))
                    return p;
            }
        }
    }
    return undefined;
}
function inPathTry() {
    const names = process.platform === 'win32'
        ? ['pawncc.exe', 'pawncc64.exe', 'pawncc', 'pawncc.bat']
        : ['pawncc'];
    return scanPathFor(names);
}
function workspaceCandidates(workspaceRoot) {
    if (!workspaceRoot)
        return [];
    const names = process.platform === 'win32'
        ? ['pawncc.exe', 'pawncc64.exe', 'pawncc.bat']
        : ['pawncc'];
    const dirs = [
        path.join(workspaceRoot, 'pawno'),
        path.join(workspaceRoot, 'include'),
        path.join(workspaceRoot, 'tools'),
        path.join(workspaceRoot, 'bin'),
    ];
    const out = [];
    for (const d of dirs)
        for (const n of names)
            out.push(path.join(d, n));
    return out;
}
function commonCandidates() {
    if (process.platform === 'win32') {
        return [
            'C:\\Program Files\\Pawn\\pawncc.exe',
            'C:\\Program Files (x86)\\Pawn\\pawncc.exe',
            'pawncc.exe',
            'pawncc64.exe',
            'pawncc.bat',
        ];
    }
    return [
        '/usr/local/bin/pawncc',
        '/usr/bin/pawncc',
        '/opt/pawn/pawncc',
        'pawncc',
    ];
}
/* ─── Detection ─────────────────────────────────────────────────── */
export function detectPawncc(explicitPathRaw, autoDetect, workspaceRoot) {
    const envPath = normalizeInputPath(process.env.PAWNCC);
    if (envPath && existsExecutable(envPath))
        return envPath;
    const normalized = normalizeInputPath(explicitPathRaw);
    if (normalized && normalized.trim()) {
        let p = normalized;
        if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
            const name = process.platform === 'win32' ? 'pawncc.exe' : 'pawncc';
            p = path.join(p, name);
        }
        if (existsExecutable(p))
            return p;
        if (!autoDetect) {
            throw new Error(`pawncc not found at: ${normalized}`);
        }
    }
    const fromPath = inPathTry();
    if (fromPath)
        return fromPath;
    for (const c of workspaceCandidates(workspaceRoot)) {
        if (existsExecutable(c))
            return c;
    }
    for (const c of commonCandidates()) {
        if (existsExecutable(c))
            return c;
    }
    throw new Error('Could not detect pawncc executable. Configure compiler.path in .pawnpro/config.json.');
}
/* ─── Argument building ─────────────────────────────────────────── */
function captureFlagKey(a) {
    if (/^-\(/.test(a))
        return '(';
    if (/^-;/.test(a))
        return ';';
    if (/^-\\/.test(a))
        return '\\';
    if (/^-\^/.test(a))
        return '^';
    if (/^-XD\b/i.test(a))
        return 'XD';
    const m = a.match(/^-(\w)/);
    return m ? m[1] : null;
}
export function sanitizeUserArgs(baseArgs, supported) {
    let args = baseArgs.map(a => (a.startsWith('/') ? '-' + a.slice(1) : a));
    args = args.filter(a => !(a.startsWith('-i') || a.startsWith('-o')));
    args = args.map(a => (a === '-(' ? '-(+' : a));
    args = args.map(a => (a === '-;' ? '-;+' : a));
    const kept = [];
    const removed = [];
    for (const a of args) {
        const key = captureFlagKey(a);
        if (!key) {
            kept.push(a);
            continue;
        }
        const ok = key.length === 1 ? supported.single.has(key) : supported.multi.has(key);
        if (ok)
            kept.push(a);
        else
            removed.push(a);
    }
    return { kept, removed };
}
export function buildCompileArgs(opts) {
    const { config, filePath, workspaceRoot } = opts;
    const { compiler, includePaths, output } = config;
    const exe = detectPawncc(compiler.path || undefined, compiler.autoDetect, workspaceRoot);
    const supported = detectSupportedFlags(exe);
    let rawArgs = compiler.args.slice();
    let removedFlags = [];
    if (rawArgs.length === 0) {
        rawArgs = computeMinimalArgs(supported);
    }
    const { kept, removed } = sanitizeUserArgs(rawArgs, supported);
    removedFlags = removed;
    const args = [...kept];
    const resolvedIncludes = includePaths.map(p => process.platform === 'win32' ? path.normalize(p) : p);
    resolvedIncludes.forEach(p => args.push(`-i${p}`));
    const fileDir = path.dirname(filePath);
    const out = path.join(fileDir, path.parse(filePath).name + '.amx');
    args.push(`-o${process.platform === 'win32' ? path.normalize(out) : out}`);
    args.push(filePath);
    return { exe, args, cwd: fileDir, removedFlags };
}
/* ─── Compile execution ─────────────────────────────────────────── */
export function runCompile(exe, args, cwd, encoding) {
    return new Promise((resolve, reject) => {
        const proc = spawn(exe, args, { cwd, shell: false });
        const chunks = [];
        proc.stdout.on('data', (d) => chunks.push(d));
        proc.stderr.on('data', (d) => chunks.push(d));
        proc.on('error', reject);
        proc.on('close', (code, signal) => {
            const output = iconv.decode(Buffer.concat(chunks), encoding || 'windows1252');
            resolve({
                exitCode: code,
                signal: signal ?? null,
                output,
            });
        });
    });
}
//# sourceMappingURL=compiler.js.map