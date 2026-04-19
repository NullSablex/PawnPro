import * as path from 'path';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import { resolveInclude } from './utils.js';
import type { NativeEntry, PawnProConfig } from './types.js';

const NATIVE_RX = /^\s*(?:forward\s+)?native\s+(?:[A-Za-z_]\w*:)?\s*([A-Za-z_]\w*)\s*\(([^)]*)\)\s*;/gm;

/* ─── Include path resolution ───────────────────────────────────── */

function existsDir(p: string): boolean {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

function getIncludePathsFromArgs(args: string[]): string[] {
  return args.filter(a => a.startsWith('-i')).map(a => a.slice(2));
}

export function buildIncludePaths(config: PawnProConfig, workspaceRoot: string): string[] {
  const fromSettings = config.includePaths;
  const fromArgs = getIncludePathsFromArgs(config.compiler.args);
  const defaults = [
    path.join(workspaceRoot, 'qawno', 'include'),  // open.mp
    path.join(workspaceRoot, 'pawno', 'include'),
    path.join(workspaceRoot, 'include'),
  ].filter(existsDir);

  const all = [...fromSettings, ...fromArgs, ...defaults]
    .map(p => path.normalize(p))
    .filter((p, i, arr) => p && arr.indexOf(p) === i && existsDir(p));

  return all;
}

/* ─── Include token collection (comment-aware) ──────────────────── */

export function collectIncludeTokens(text: string): string[] {
  const clean = stripCommentsWhole(text);
  const tokens = new Set<string>();
  let m: RegExpExecArray | null;
  const rx = /#\s*include\s*(<|")\s*([^>"]+)\s*(>|")/g;
  while ((m = rx.exec(clean))) tokens.add(m[2].trim());
  return [...tokens];
}

/* ─── Comment stripping ─────────────────────────────────────────── */

function getStringSpans(line: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  const quotes = ['"', "'"];
  let i = 0;
  while (i < line.length) {
    const q = quotes.find(q => line[i] === q);
    if (!q) { i++; continue; }
    const start = i++;
    while (i < line.length) {
      if (line[i] === q && line[i - 1] !== '\\') { spans.push({ start, end: i }); i++; break; }
      i++;
    }
  }
  return spans;
}

function posInAnyString(ch: number, line: string, spans?: Array<{ start: number; end: number }>): boolean {
  const ss = spans ?? getStringSpans(line);
  return ss.some(sp => ch >= sp.start && ch <= sp.end);
}

function stripCommentsPreserveColumns(
  line: string,
  inBlock: boolean,
): { text: string; mask: boolean[]; inBlock: boolean } {
  const spans = getStringSpans(line);
  const out = line.split('');
  const mask = new Array<boolean>(line.length).fill(false);

  const mark = (i: number) => { out[i] = ' '; mask[i] = true; };

  let i = 0;
  while (i < line.length) {
    if (!inBlock) {
      if (!posInAnyString(i, line, spans) && line[i] === '/' && i + 1 < line.length) {
        const nxt = line[i + 1];
        if (nxt === '/') {
          for (let k = i; k < line.length; k++) mark(k);
          break;
        }
        if (nxt === '*') {
          mark(i); mark(i + 1);
          i += 2;
          inBlock = true;
          continue;
        }
      }
      i++;
    } else {
      if (line[i] === '*' && i + 1 < line.length && line[i + 1] === '/') {
        mark(i); mark(i + 1);
        i += 2;
        inBlock = false;
        continue;
      }
      mark(i);
      i++;
    }
  }

  return { text: out.join(''), mask, inBlock };
}

function stripCommentsWhole(text: string): string {
  const lines = text.split(/\r?\n/);
  let inBlock = false;
  const out: string[] = [];
  for (const ln of lines) {
    const r = stripCommentsPreserveColumns(ln, inBlock);
    inBlock = r.inBlock;
    out.push(r.text);
  }
  return out.join('\n');
}

/* ─── Recursive file listing ────────────────────────────────────── */

export async function listIncFilesRecursive(root: string, maxDepth = 20): Promise<string[]> {
  const out: string[] = [];
  const visited = new Set<string>(); // Prevent symlink loops

  async function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;

    // Resolve real path to detect symlink loops
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

/* ─── Parse natives from a file ─────────────────────────────────── */

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

