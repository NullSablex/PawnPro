import * as fsp from 'fs/promises';
import * as path from 'path';
import * as iconv from 'iconv-lite';
import { resolveInclude } from './utils.js';
import { stripCommentsPreserveColumns } from './includes.js';

/* ─── Types ────────────────────────────────────────────────────── */

export type SigInfo = {
  name: string;
  signature: string;
  params: string[];
  minArgs: number;
  maxArgs: number | null;
  kind: 'native' | 'forward' | 'public' | 'stock' | 'plain' | 'api';
  file?: string;
};

export type LocalFunc = {
  name: string;
  signature: string;
  line: number;
  kind: 'public' | 'stock' | 'forward' | 'native';
};

export type FuncEntry = {
  name: string;
  signature: string;
  doc?: string;
  file: string;
};

type CacheEntry<T> = {
  mtimeMs: number;
  data: T;
};

type IncludesCacheEntry = {
  rootMtimeMs: number;
  files: string[];
};

/* ─── Cache Storage ────────────────────────────────────────────── */

const textCache = new Map<string, CacheEntry<string>>();
const identsCache = new Map<string, CacheEntry<Set<string>>>();
const symbolsCache = new Map<string, CacheEntry<{ sigs: Map<string, SigInfo>; macros: Set<string> }>>();
const funcsCache = new Map<string, CacheEntry<LocalFunc[]>>();
const apiCache = new Map<string, CacheEntry<Map<string, FuncEntry>>>();
const includesCache = new Map<string, IncludesCacheEntry>();
const apiIndexCache = new Map<string, Map<string, FuncEntry>>();

const MAX_TEXT_ENTRIES = 100;
const MAX_IDENTS_ENTRIES = 150;
const MAX_SYMBOLS_ENTRIES = 100;
const MAX_FUNCS_ENTRIES = 100;
const MAX_API_ENTRIES = 100;
const MAX_INCLUDES_ENTRIES = 20;

/* ─── Helpers ──────────────────────────────────────────────────── */

function evictOldest<K, V>(cache: Map<K, V>, maxSize: number): void {
  if (cache.size > maxSize) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
}

async function getMtime(filePath: string): Promise<number | null> {
  try {
    const st = await fsp.stat(filePath);
    return st.mtimeMs;
  } catch {
    return null;
  }
}

function decodeWithFallback(buf: Buffer): string {
  const utf8 = buf.toString('utf8');
  const replacements = (utf8.match(/\uFFFD/g) || []).length;
  if (replacements > Math.max(2, Math.floor(utf8.length * 0.01))) {
    return iconv.decode(buf, 'windows1252');
  }
  return utf8;
}

/* ─── File Text Cache ──────────────────────────────────────────── */

export async function getFileText(filePath: string): Promise<string | null> {
  const norm = path.normalize(filePath);

  // Check for unsaved-document entry first (pseudo mtime is negative).
  // This must come before getMtime() so in-memory edits are always preferred
  // over the on-disk snapshot.
  const cached = textCache.get(norm);
  if (cached && cached.mtimeMs < 0) {
    return cached.data;
  }

  const mtime = await getMtime(filePath);
  if (mtime === null) return null;

  if (cached && cached.mtimeMs === mtime) {
    return cached.data;
  }

  try {
    const buf = await fsp.readFile(filePath);
    const text = decodeWithFallback(buf);
    textCache.set(norm, { mtimeMs: mtime, data: text });
    evictOldest(textCache, MAX_TEXT_ENTRIES);
    return text;
  } catch {
    return null;
  }
}

/* ─── File Identifiers Cache (for unused detection) ───────────── */

export async function getFileIdents(filePath: string): Promise<Set<string>> {
  const norm = path.normalize(filePath);
  const mtime = await getMtime(filePath);
  if (mtime === null) return new Set();

  const cached = identsCache.get(norm);
  if (cached && cached.mtimeMs === mtime) {
    return cached.data;
  }

  const text = await getFileText(filePath);
  if (!text) return new Set();

  const idents = new Set<string>();
  const rxIdent = /\b([A-Za-z_]\w*)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = rxIdent.exec(text))) {
    idents.add(m[1]);
  }

  identsCache.set(norm, { mtimeMs: mtime, data: idents });
  evictOldest(identsCache, MAX_IDENTS_ENTRIES);
  return idents;
}

/* ─── File Symbols Cache (for IntelliSense) ────────────────────── */

const CONTROL_KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'return', 'sizeof', 'tagof', 'assert', 'else', 'do',
]);

function splitArgs(raw: string): string[] {
  const args: string[] = [];
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
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      args.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

function parseArgRange(params: string[]): { minArgs: number; maxArgs: number | null } {
  let minArgs = 0;
  let total = 0;
  let variadic = false;
  for (const p of params) {
    const t = p.trim();
    if (!t) continue;
    if (t === '...' || t.endsWith('...')) {
      variadic = true;
      continue;
    }
    total++;
    if (!t.includes('=')) minArgs++;
  }
  return { minArgs, maxArgs: variadic ? null : total };
}

function updateBraceDepth(line: string, currentDepth: number): number {
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
    if (inSingle || inDouble) continue;
    if (ch === '{') depth++;
    else if (ch === '}') depth = Math.max(0, depth - 1);
  }
  return depth;
}

function parseTextSymbols(text: string, file?: string): { sigs: Map<string, SigInfo>; macros: Set<string> } {
  const sigs = new Map<string, SigInfo>();
  const macros = new Set<string>();
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
      if (dm) macros.add(dm[1]);

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
      } else {
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
        } else {
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
              kind: mPS[1] as 'public' | 'stock',
              file,
            });
          } else {
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

export async function getFileSymbols(filePath: string): Promise<{ sigs: Map<string, SigInfo>; macros: Set<string> }> {
  const norm = path.normalize(filePath);
  const mtime = await getMtime(filePath);
  if (mtime === null) return { sigs: new Map(), macros: new Set() };

  const cached = symbolsCache.get(norm);
  if (cached && cached.mtimeMs === mtime) {
    return cached.data;
  }

  const text = await getFileText(filePath);
  if (!text) return { sigs: new Map(), macros: new Set() };

  const parsed = parseTextSymbols(text, norm);
  symbolsCache.set(norm, { mtimeMs: mtime, data: parsed });
  evictOldest(symbolsCache, MAX_SYMBOLS_ENTRIES);
  return parsed;
}

/* ─── File Functions Cache (for Hover) ─────────────────────────── */

function parseTextFunctions(text: string): LocalFunc[] {
  const lines = text.split(/\r?\n/);
  const out: LocalFunc[] = [];

  const rxFunc = /^\s*(public|stock|forward)\s+(?:[A-Za-z_]\w*:)?\s*([A-Za-z_]\w*)\s*\(([^)]*)\)/;
  const rxNative = /^\s*(?:forward\s+)?native\s+(?:[A-Za-z_]\w*:)?\s*([A-Za-z_]\w*)\s*\(([^)]*)\)\s*;/;

  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const stripped = stripCommentsPreserveColumns(lines[i], inBlock);
    inBlock = stripped.inBlock;
    const line = stripped.text;

    const mFunc = rxFunc.exec(line);
    if (mFunc) {
      out.push({
        name: mFunc[2],
        signature: `${mFunc[2]}(${(mFunc[3] ?? '').trim()})`,
        line: i,
        kind: mFunc[1] as LocalFunc['kind'],
      });
      continue;
    }

    const mNative = rxNative.exec(line);
    if (mNative) {
      out.push({
        name: mNative[1],
        signature: `${mNative[1]}(${(mNative[2] ?? '').trim()})`,
        line: i,
        kind: 'native',
      });
    }
  }

  return out;
}

function chooseBestFuncs(funcs: LocalFunc[]): LocalFunc[] {
  const rank: Record<LocalFunc['kind'], number> = { forward: 0, stock: 1, public: 1, native: 2 };
  const byName = new Map<string, LocalFunc>();
  for (const f of funcs) {
    const cur = byName.get(f.name);
    if (!cur || rank[f.kind] > rank[cur.kind]) byName.set(f.name, f);
  }
  return [...byName.values()];
}

export async function getFileFunctions(filePath: string): Promise<LocalFunc[]> {
  const norm = path.normalize(filePath);
  const mtime = await getMtime(filePath);
  if (mtime === null) return [];

  const cached = funcsCache.get(norm);
  if (cached && cached.mtimeMs === mtime) {
    return cached.data;
  }

  const text = await getFileText(filePath);
  if (!text) return [];

  const funcs = chooseBestFuncs(parseTextFunctions(text));
  funcsCache.set(norm, { mtimeMs: mtime, data: funcs });
  evictOldest(funcsCache, MAX_FUNCS_ENTRIES);
  return funcs;
}

/* ─── API Functions Cache (for apiIndex) ───────────────────────── */

const RX_NATIVE = /^\s*(?:forward\s+)?native\s+(?:[A-Za-z_]\w*:)?\s*([A-Za-z_]\w*)\s*\(([^)]*)\)\s*;\s*$/gm;
const RX_FORWARD = /^\s*forward\s+(?:[A-Za-z_]\w*:)?\s*([A-Za-z_]\w*)\s*\(([^)]*)\)\s*;\s*$/gm;

function extractDocAbove(text: string, startIdx: number): string | undefined {
  const out: string[] = [];
  let sawComment = false;

  const lines = text.split(/\r?\n/);
  let off = 0;
  for (let ln = 0; ln < lines.length; ln++) {
    const l = lines[ln];
    const next = off + l.length + 1;
    if (next > startIdx) {
      for (let k = ln - 1; k >= 0; k--) {
        const s = lines[k];
        if (/^\s*$/.test(s)) {
          if (sawComment) break;
          continue;
        }
        if (/^\s*\/\/(.*)$/.test(s)) {
          out.unshift(s.trim());
          sawComment = true;
          continue;
        }
        if (/\*\/\s*$/.test(s)) {
          out.unshift(s.trim());
          sawComment = true;
          for (let j = k - 1; j >= 0; j--) {
            out.unshift(lines[j].trim());
            if (/\/\*/.test(lines[j])) {
              return out.join('\n');
            }
          }
          return out.join('\n');
        }
        break;
      }
      break;
    }
    off = next;
  }
  if (!sawComment) return undefined;
  return out.join('\n');
}

function parseApiFile(file: string, text: string): Map<string, FuncEntry> {
  const map = new Map<string, FuncEntry>();

  function add(name: string, sig: string, startIdx: number) {
    const signature = `${name}(${sig.trim()})`;
    const doc = extractDocAbove(text, startIdx);
    map.set(name, { name, signature, doc, file });
  }

  RX_NATIVE.lastIndex = 0;
  RX_FORWARD.lastIndex = 0;

  let m: RegExpExecArray | null;
  while ((m = RX_NATIVE.exec(text))) {
    add(m[1], m[2], m.index);
  }
  while ((m = RX_FORWARD.exec(text))) {
    add(m[1], m[2], m.index);
  }
  return map;
}

export async function getApiFileFunctions(filePath: string): Promise<Map<string, FuncEntry>> {
  const norm = path.normalize(filePath);
  const mtime = await getMtime(filePath);
  if (mtime === null) return new Map();

  const cached = apiCache.get(norm);
  if (cached && cached.mtimeMs === mtime) {
    return cached.data;
  }

  const text = await getFileText(filePath);
  if (!text) return new Map();

  const funcs = parseApiFile(norm, text);
  apiCache.set(norm, { mtimeMs: mtime, data: funcs });
  evictOldest(apiCache, MAX_API_ENTRIES);
  return funcs;
}

async function* walkIncludePaths(dir: string): AsyncGenerator<string> {
  let ents;
  try {
    ents = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of ents) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      yield* walkIncludePaths(p);
    } else if (ent.isFile()) {
      const lc = ent.name.toLowerCase();
      if (lc.endsWith('.inc') || lc.endsWith('.pwn')) {
        yield p;
      }
    }
  }
}

export async function getApiIndex(includePaths: string[]): Promise<Map<string, FuncEntry>> {
  const key = JSON.stringify([...includePaths].map(p => path.normalize(p)).sort());
  const cached = apiIndexCache.get(key);
  if (cached) return cached;

  const index = new Map<string, FuncEntry>();
  for (const dir of includePaths) {
    for await (const file of walkIncludePaths(dir)) {
      const funcs = await getApiFileFunctions(file);
      for (const [name, entry] of funcs) {
        if (!index.has(name)) index.set(name, entry);
      }
    }
  }

  apiIndexCache.set(key, index);

  if (apiIndexCache.size > 5) {
    const first = apiIndexCache.keys().next().value;
    if (first) apiIndexCache.delete(first);
  }

  return index;
}

/* ─── Included Files Cache ─────────────────────────────────────── */

const INCLUDE_RX = /#\s*include\s*(?:<([^>]+)>|"([^"]+)")/;

function collectIncludeTokens(text: string): string[] {
  const tokens = new Set<string>();
  const lines = text.split(/\r?\n/);
  let inBlock = false;
  for (const rawLine of lines) {
    const stripped = stripCommentsPreserveColumns(rawLine, inBlock);
    inBlock = stripped.inBlock;
    const m = INCLUDE_RX.exec(stripped.text);
    if (m) tokens.add((m[1] ?? m[2]).trim());
  }
  return [...tokens];
}

export async function getIncludedFiles(
  rootFilePath: string,
  includePaths: string[],
  maxDepth = 5,
  maxFiles = 100,
): Promise<string[]> {
  const rootMtime = await getMtime(rootFilePath);
  if (rootMtime === null) return [];

  const cacheKey = rootFilePath + '\0' + includePaths.join('\0');
  const cached = includesCache.get(cacheKey);
  if (cached && cached.rootMtimeMs === rootMtime) {
    return cached.files;
  }

  const out: string[] = [];
  const seen = new Set<string>();
  const queue: Array<{ filePath: string; depth: number }> = [];

  const rootDir = path.dirname(rootFilePath);
  const rootText = await getFileText(rootFilePath);
  if (!rootText) return [];

  for (const tk of collectIncludeTokens(rootText)) {
    const resolved = resolveInclude(tk, rootDir, includePaths);
    if (resolved && !seen.has(path.normalize(resolved))) {
      seen.add(path.normalize(resolved));
      queue.push({ filePath: resolved, depth: 1 });
    }
  }

  while (queue.length && out.length < maxFiles) {
    const { filePath, depth } = queue.shift()!;
    out.push(filePath);
    if (depth >= maxDepth) continue;

    const text = await getFileText(filePath);
    if (!text) continue;

    const baseDir = path.dirname(filePath);
    for (const tk of collectIncludeTokens(text)) {
      const resolved = resolveInclude(tk, baseDir, includePaths);
      if (!resolved) continue;
      const norm = path.normalize(resolved);
      if (!seen.has(norm)) {
        seen.add(norm);
        queue.push({ filePath: resolved, depth: depth + 1 });
      }
    }
  }

  includesCache.set(cacheKey, { rootMtimeMs: rootMtime, files: out });
  evictOldest(includesCache, MAX_INCLUDES_ENTRIES);
  return out;
}

/* ─── Document Text Injection (for unsaved documents) ──────────── */

export function setDocumentText(filePath: string, text: string, version: number): void {
  const norm = path.normalize(filePath);
  // Use negative mtime to indicate it's a document version, not file mtime
  const pseudoMtime = -version;
  textCache.set(norm, { mtimeMs: pseudoMtime, data: text });
  // Invalidate derived caches so they rebuild with new text
  identsCache.delete(norm);
  symbolsCache.delete(norm);
  funcsCache.delete(norm);
  apiCache.delete(norm);
  // Invalidate include graph entries where this file is the root,
  // since #include directives may have changed in the unsaved edit.
  for (const key of includesCache.keys()) {
    if (key.split('\0')[0] === norm) includesCache.delete(key);
  }
}

/* ─── Cache Invalidation ───────────────────────────────────────── */

export function invalidateFile(filePath: string): void {
  const norm = path.normalize(filePath);
  textCache.delete(norm);
  identsCache.delete(norm);
  symbolsCache.delete(norm);
  funcsCache.delete(norm);
  apiCache.delete(norm);

  for (const [key, entry] of includesCache) {
    // key format: "<rootFilePath>\0<paths...>"
    const rootOfKey = key.split('\0')[0];
    if (entry.files.includes(norm) || rootOfKey === norm) {
      includesCache.delete(key);
    }
  }

  apiIndexCache.clear();
}

export function invalidateAll(): void {
  textCache.clear();
  identsCache.clear();
  symbolsCache.clear();
  funcsCache.clear();
  apiCache.clear();
  includesCache.clear();
  apiIndexCache.clear();
}

/* ─── Pre-warming ──────────────────────────────────────────────── */

export async function prewarmCache(rootFiles: string[], includePaths: string[]): Promise<void> {
  for (const root of rootFiles) {
    const includes = await getIncludedFiles(root, includePaths);
    for (const fp of includes) {
      await getFileFunctions(fp);
      await getFileSymbols(fp);
    }
  }

  await getApiIndex(includePaths);
}

/* ─── Stats (for debugging) ────────────────────────────────────── */

export function getCacheStats(): {
  text: number;
  idents: number;
  symbols: number;
  funcs: number;
  api: number;
  includes: number;
  apiIndex: number;
} {
  return {
    text: textCache.size,
    idents: identsCache.size,
    symbols: symbolsCache.size,
    funcs: funcsCache.size,
    api: apiCache.size,
    includes: includesCache.size,
    apiIndex: apiIndexCache.size,
  };
}
