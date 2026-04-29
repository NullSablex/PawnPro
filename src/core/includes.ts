import * as path from 'path';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import type { NativeEntry, PawnProConfig } from './types.js';

const NATIVE_RX = /^\s*(?:forward\s+)?native\s+(?:[A-Za-z_]\w*:)?\s*([A-Za-z_]\w*)\s*\(([^)]*)\)\s*;/gm;

function existsDir(p: string): boolean {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function getIncludePathsFromArgs(args: string[]): string[] {
  return args.filter(a => a.startsWith('-i')).map(a => a.slice(2));
}

function findIncludeRootsFromDir(startDir: string, stopAt: string): string[] {
  const found: string[] = [];
  let dir = startDir;
  while (true) {
    for (const sub of ['qawno/include', 'pawno/include', 'include']) {
      const candidate = path.join(dir, sub);
      if (existsDir(candidate)) found.push(candidate);
    }
    if (found.length > 0) break;
    if (dir === stopAt) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return found;
}

export function buildIncludePaths(config: PawnProConfig, workspaceRoot: string, fileDir?: string): string[] {
  const fromSettings = config.includePaths;
  const fromArgs = getIncludePathsFromArgs(config.compiler.args);

  const searchRoot = workspaceRoot || fileDir || '';
  const defaults = searchRoot
    ? [
        path.join(searchRoot, 'qawno', 'include'),
        path.join(searchRoot, 'pawno', 'include'),
        path.join(searchRoot, 'include'),
      ].filter(existsDir)
    : [];

  const fallback = defaults.length === 0 && fileDir && workspaceRoot
    ? findIncludeRootsFromDir(fileDir, workspaceRoot)
    : [];

  const all = [...fromSettings, ...fromArgs, ...defaults, ...fallback]
    .map(p => path.normalize(p))
    .filter((p, i, arr) => p && arr.indexOf(p) === i && existsDir(p));

  return all;
}

export async function listIncFilesRecursive(root: string, maxDepth = 20): Promise<string[]> {
  const out: string[] = [];
  const visited = new Set<string>();

  async function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;

    let realDir: string;
    try {
      realDir = await fsp.realpath(dir);
    } catch {
      return;
    }
    if (visited.has(realDir)) return;
    visited.add(realDir);

    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.git' || e.name === '.vscode' || e.name === '.pawnpro') continue;
        await walk(p, depth + 1);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.inc')) {
        out.push(p);
      }
    }
  }
  await walk(root, 0);
  return out;
}

export async function listNatives(filePath: string): Promise<NativeEntry[]> {
  let text = '';
  try {
    const buf = await fsp.readFile(filePath);
    text = Buffer.from(buf).toString('utf8');
  } catch {
    return [];
  }

  NATIVE_RX.lastIndex = 0;

  const lineOffsets: number[] = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineOffsets.push(i + 1);
  const posToLine = (pos: number) => {
    let lo = 0, hi = lineOffsets.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (lineOffsets[mid] <= pos) lo = mid + 1; else hi = mid - 1;
    }
    return Math.max(0, lo - 1);
  };

  const out: NativeEntry[] = [];
  let m: RegExpExecArray | null;
  while ((m = NATIVE_RX.exec(text))) {
    out.push({
      name: m[1],
      signature: (m[2] ?? '').trim(),
      filePath,
      line: posToLine(m.index),
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

