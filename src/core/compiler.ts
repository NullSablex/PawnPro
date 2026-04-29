import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as iconv from 'iconv-lite';
import { detectSupportedFlags, computeMinimalArgs, type Supported } from './flags.js';
import { buildIncludePaths } from './includes.js';
import type { CompileResult, CompileArgs, PawnProConfig } from './types.js';

function normalizeInputPath(p?: string): string | undefined {
  if (!p) return undefined;
  const unquoted = p.trim().replace(/^["']|["']$/g, '');
  if (!unquoted) return undefined;
  return unquoted.startsWith('~')
    ? path.join(process.env.HOME ?? process.env.USERPROFILE ?? '', unquoted.slice(1))
    : unquoted;
}

function existsExecutable(p: string): boolean {
  try {
    if (!fs.existsSync(p)) return false;
    if (fs.statSync(p).isDirectory()) return false;
    if (process.platform !== 'win32') fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function scanPathFor(names: string[]): string | undefined {
  const envPath = process.env.PATH ?? '';
  const sep = process.platform === 'win32' ? ';' : ':';
  const exts = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.EXE;.BAT;.CMD').split(';')
    : [''];
  const dirs = envPath.split(sep).filter(Boolean);

  for (const dir of dirs) {
    for (const name of names) {
      if (process.platform === 'win32') {
        for (const ext of exts) {
          const candidate = path.join(dir, name.toLowerCase().endsWith(ext.toLowerCase()) ? name : name + ext);
          if (existsExecutable(candidate)) return candidate;
        }
      } else {
        const candidate = path.join(dir, name);
        if (existsExecutable(candidate)) return candidate;
      }
    }
  }
  return undefined;
}

function findInPath(): string | undefined {
  const names = process.platform === 'win32'
    ? ['pawncc.exe', 'pawncc64.exe', 'pawncc', 'pawncc.bat']
    : ['pawncc'];
  return scanPathFor(names);
}

function workspaceCandidates(workspaceRoot?: string): string[] {
  if (!workspaceRoot) return [];
  const names = process.platform === 'win32'
    ? ['pawncc.exe', 'pawncc64.exe', 'pawncc.bat']
    : ['pawncc'];
  const dirs = [
    path.join(workspaceRoot, 'qawno'),
    path.join(workspaceRoot, 'pawno'),
    path.join(workspaceRoot, 'include'),
    path.join(workspaceRoot, 'tools'),
    path.join(workspaceRoot, 'bin'),
  ];
  return dirs.flatMap(d => names.map(n => path.join(d, n)));
}

function commonCandidates(): string[] {
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

export function detectPawncc(
  explicitPathRaw: string | undefined,
  autoDetect: boolean,
  workspaceRoot?: string,
): string {
  const envPath = normalizeInputPath(process.env.PAWNCC);
  if (envPath && existsExecutable(envPath)) return envPath;

  const normalized = normalizeInputPath(explicitPathRaw);
  if (normalized?.trim()) {
    let candidate = normalized;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      candidate = path.join(candidate, process.platform === 'win32' ? 'pawncc.exe' : 'pawncc');
    }
    if (existsExecutable(candidate)) return candidate;
    if (!autoDetect) throw new Error(`pawncc not found at: ${normalized}`);
  }

  const fromPath = findInPath();
  if (fromPath) return fromPath;

  for (const c of workspaceCandidates(workspaceRoot)) {
    if (existsExecutable(c)) return c;
  }

  for (const c of commonCandidates()) {
    if (existsExecutable(c)) return c;
  }

  throw new Error('Could not detect pawncc executable. Configure compiler.path in .pawnpro/config.json.');
}

function captureFlagKey(arg: string): string | null {
  if (/^-\(/.test(arg)) return '(';
  if (/^-;/.test(arg)) return ';';
  if (/^-\\/.test(arg)) return '\\';
  if (/^-\^/.test(arg)) return '^';
  if (/^-XD\b/i.test(arg)) return 'XD';
  const m = arg.match(/^-(\w)/);
  return m ? m[1] : null;
}

export function sanitizeUserArgs(
  baseArgs: string[],
  supported: Supported,
): { kept: string[]; removed: string[] } {
  let args = baseArgs
    .map(a => a.startsWith('/') ? '-' + a.slice(1) : a)
    .filter(a => !a.startsWith('-i') && !a.startsWith('-o'))
    .map(a => a === '-(' ? '-(+' : a)
    .map(a => a === '-;' ? '-;+' : a);

  const kept: string[] = [];
  const removed: string[] = [];
  for (const a of args) {
    const key = captureFlagKey(a);
    if (!key) { kept.push(a); continue; }
    const ok = key.length === 1 ? supported.single.has(key) : supported.multi.has(key);
    (ok ? kept : removed).push(a);
  }
  return { kept, removed };
}

export function buildCompileArgs(opts: {
  config: PawnProConfig;
  filePath: string;
  workspaceRoot: string;
}): CompileArgs {
  const { config, filePath, workspaceRoot } = opts;
  const { compiler } = config;

  const exe = detectPawncc(compiler.path || undefined, compiler.autoDetect, workspaceRoot);
  const supported = detectSupportedFlags(exe);

  const rawArgs = compiler.args.length > 0 ? compiler.args.slice() : computeMinimalArgs(supported);
  const { kept, removed } = sanitizeUserArgs(rawArgs, supported);

  const fileDir = path.dirname(filePath);
  const includePaths = buildIncludePaths(config, workspaceRoot, fileDir).map(p =>
    process.platform === 'win32' ? path.normalize(p) : p,
  );

  const args = [
    ...kept,
    ...includePaths.map(p => `-i${p}`),
    `-o${process.platform === 'win32' ? path.normalize(path.join(fileDir, path.parse(filePath).name + '.amx')) : path.join(fileDir, path.parse(filePath).name + '.amx')}`,
    filePath,
  ];

  return { exe, args, cwd: fileDir, removedFlags: removed };
}

export function runCompile(
  exe: string,
  args: string[],
  cwd: string,
  encoding: string,
): Promise<CompileResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(exe, args, { cwd, shell: false });
    const chunks: Buffer[] = [];

    proc.stdout.on('data', (d: Buffer) => chunks.push(d));
    proc.stderr.on('data', (d: Buffer) => chunks.push(d));
    proc.on('error', reject);
    proc.on('close', (code, signal) => {
      resolve({
        exitCode: code,
        signal: signal ?? null,
        output: iconv.decode(Buffer.concat(chunks), encoding || 'windows1252'),
      });
    });
  });
}
