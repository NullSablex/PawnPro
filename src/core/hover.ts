import * as path from 'path';
import * as fsp from 'fs/promises';
import { resolveInclude } from './utils.js';
import { findFunction, type FuncEntry } from './apiIndex.js';
import {
  stripCommentsPreserveColumns,
  getStringSpans,
  posInAnyString,
  collectIncludeTokens,
  gatherIncludedFiles,
} from './includes.js';
import type { HoverData, HoverSection, HoverParams } from './types.js';

const INCLUDE_RX = /#\s*include\s*(<|")\s*([^>"]+)\s*(>|")/;

type LocalFunc = { name: string; signature: string; line: number; kind: 'public' | 'stock' | 'forward' };
type DefineAlias = { name: string; target: string };
type DefineFn = { name: string; params: string; body: string };
type DefinePlaceholder = { macroBase: string; body: string };

/* ─── Pure getWordRangeAtPosition ───────────────────────────────── */

export function getWordRangeAtPosition(
  lineText: string,
  character: number,
  pattern: RegExp,
): { start: number; end: number } | undefined {
  const rx = new RegExp(pattern.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = rx.exec(lineText))) {
    const start = m.index;
    const end = start + m[0].length;
    if (character >= start && character < end) {
      return { start, end };
    }
    if (start >= character) break;
  }
  return undefined;
}

/* ─── Parsers (line-based, comment-aware) ───────────────────────── */

function parseLocalFunctionsByLines(lines: string[]): LocalFunc[] {
  const out: LocalFunc[] = [];
  const rx = /^\s*(public|stock|forward)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/;

  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const stripped = stripCommentsPreserveColumns(lines[i], inBlock);
    inBlock = stripped.inBlock;

    const m = rx.exec(stripped.text);
    if (!m) continue;
    const kind = m[1] as LocalFunc['kind'];
    const name = m[2];
    const params = (m[3] ?? '').trim();
    out.push({ name, signature: `${name}(${params})`, line: i, kind });
  }
  return out;
}

function parseMacroLocalFunctionsByLines(
  lines: string[],
  defs: { placeholder: DefinePlaceholder[] },
): LocalFunc[] {
  if (!defs.placeholder.length) return [];
  const bases = new Set(defs.placeholder.map(p => p.macroBase));
  const out: LocalFunc[] = [];
  const rx = /^\s*([A-Za-z_][\w:]*)::([A-Za-z_]\w*)\s*\(([^)]*)\)/;

  let inBlock = false;
  for (let i = 0; i < lines.length; i++) {
    const stripped = stripCommentsPreserveColumns(lines[i], inBlock);
    inBlock = stripped.inBlock;

    const m = rx.exec(stripped.text);
    if (!m) continue;
    if (!bases.has(m[1])) continue;
    const name = m[2];
    const params = (m[3] ?? '').trim();
    out.push({ name, signature: `${name}(${params})`, line: i, kind: 'forward' });
  }
  return out;
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

function parseDefines(text: string): { alias: DefineAlias[]; fn: DefineFn[]; placeholder: DefinePlaceholder[] } {
  const clean = stripCommentsWhole(text);

  const alias: DefineAlias[] = [];
  const fn: DefineFn[] = [];
  const placeholder: DefinePlaceholder[] = [];

  {
    const rxAlias = /^\s*#\s*define\s+([A-Za-z_][\w:]*?)\s+([A-Za-z_][\w:]*)\s*$/gm;
    let m: RegExpExecArray | null;
    while ((m = rxAlias.exec(clean))) alias.push({ name: m[1], target: m[2] });
  }

  {
    const rxFn = /^\s*#\s*define\s+([A-Za-z_][\w:]*?)\s*\(([^)]*)\)\s*([^\r\n]*)/gm;
    let m: RegExpExecArray | null;
    while ((m = rxFn.exec(clean))) {
      if (m[1].includes('%0')) continue;
      fn.push({ name: m[1], params: m[2], body: m[3] });
    }
  }

  {
    const rxPH = /^\s*#\s*define\s+([A-Za-z_][\w:]*)::%0\s*\(%1\)\s*([^\r\n]*)/gm;
    let m: RegExpExecArray | null;
    while ((m = rxPH.exec(clean))) placeholder.push({ macroBase: m[1], body: m[2] });
  }

  return { alias, fn, placeholder };
}

function expandPlaceholderBody(body: string, name: string, args: string): string {
  let s = body.replace(/%0/g, name).replace(/%1/g, args);
  s = s.replace(/\\\s*/g, '\n').trim();
  return s;
}

/* ─── Call collection ───────────────────────────────────────────── */

function rangeInAnyString(start: number, end: number, line: string, spans?: Array<{ start: number; end: number }>): boolean {
  const ss = spans ?? getStringSpans(line);
  return ss.some(sp => start >= sp.start && end <= sp.end);
}

function scanParenClose(line: string, openIdx: number, spans: Array<{ start: number; end: number }>): number {
  let depth = 0;
  for (let k = openIdx; k < line.length; k++) {
    if (posInAnyString(k, line, spans)) {
      const sp = spans.find(s => k >= s.start && k <= s.end)!;
      k = sp.end;
      continue;
    }
    const c = line[k];
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return k; }
  }
  return line.length - 1;
}

function collectCalls(line: string): Array<{ ident: string; start: number; end: number }> {
  const results: Array<{ ident: string; start: number; end: number }> = [];
  const spans = getStringSpans(line);

  function pushCall(ident: string, nameStart: number, openIdx: number) {
    const closeIdx = scanParenClose(line, openIdx, spans);
    let end = closeIdx + 1;
    while (end < line.length && /\s/.test(line[end])) end++;
    if (line[end] === ';') end++;
    results.push({ ident, start: nameStart, end });
  }

  {
    const rxPH = /([A-Za-z_][\w:]*)::([A-Za-z_]\w*)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = rxPH.exec(line))) {
      const ident = `${m[1]}::${m[2]}`;
      const nameStart = m.index;
      const openIdx = rxPH.lastIndex - 1;
      if (posInAnyString(openIdx, line, spans)) continue;
      pushCall(ident, nameStart, openIdx);
    }
  }

  {
    const rxSimple = /([A-Za-z_]\w*)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = rxSimple.exec(line))) {
      const ident = m[1];
      const nameStart = m.index;
      const openIdx = rxSimple.lastIndex - 1;
      if (posInAnyString(openIdx, line, spans)) continue;
      pushCall(ident, nameStart, openIdx);
    }
  }

  return results;
}

function innermostCallAt(line: string, ch: number): { ident: string; span: [number, number] } | undefined {
  const calls = collectCalls(line)
    .filter(c => ch >= c.start && ch <= c.end)
    .sort((a, b) => (a.end - a.start) - (b.end - b.start));
  if (!calls.length) return undefined;
  const pick = calls[0];
  return { ident: pick.ident, span: [pick.start, pick.end] };
}

function wordLooksLikeCall(line: string, range: { start: number; end: number }, spans?: Array<{ start: number; end: number }>): boolean {
  const ss = spans ?? getStringSpans(line);
  if (rangeInAnyString(range.start, range.end, line, ss)) return false;
  let j = range.end;
  while (j < line.length && /\s/.test(line[j])) j++;
  return line[j] === '(';
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isHoveringOwnDecl(ident: string, lineText: string, char: number): boolean {
  {
    const rx = new RegExp(String.raw`^\s*(?:public|stock|forward)\s+(${escapeRe(ident)})\s*\(`, 'i');
    const m = rx.exec(lineText);
    if (m) {
      const start = m.index + m[0].indexOf(m[1]);
      const end = start + m[1].length;
      if (char >= start && char <= end) return true;
    }
  }
  {
    const rx = new RegExp(String.raw`^\s*[A-Za-z_][\w:]*::(${escapeRe(ident)})\s*\(`, 'i');
    const m = rx.exec(lineText);
    if (m) {
      const start = m.index + m[0].indexOf(m[1]);
      const end = start + m[1].length;
      if (char >= start && char <= end) return true;
    }
  }
  return false;
}

/* ─── Best local selection ──────────────────────────────────────── */

function chooseBestLocals(locals: LocalFunc[]): LocalFunc[] {
  const rank: Record<LocalFunc['kind'], number> = { forward: 0, stock: 1, public: 1 };
  const byName = new Map<string, LocalFunc>();
  for (const f of locals) {
    const cur = byName.get(f.name);
    if (!cur || rank[f.kind] > rank[cur.kind]) byName.set(f.name, f);
  }
  return [...byName.values()];
}

/* ─── Cross-file search ─────────────────────────────────────────── */

async function findInIncludedFiles(
  ident: string,
  rootFilePath: string,
  includePaths: string[],
): Promise<{ filePath: string; def: LocalFunc } | undefined> {
  const filePaths = await gatherIncludedFiles(rootFilePath, includePaths);
  for (const fp of filePaths) {
    try {
      const text = await fsp.readFile(fp, 'utf8');
      const lines = text.split(/\r?\n/);
      const defs = chooseBestLocals([
        ...parseLocalFunctionsByLines(lines),
        ...parseMacroLocalFunctionsByLines(lines, parseDefines(text)),
      ]);
      const hit = defs.find(d => d.name === ident);
      if (hit) return { filePath: fp, def: hit };
    } catch {
      // continue
    }
  }
  return undefined;
}

/* ─── Path utilities ────────────────────────────────────────────── */

function prettyPath(resolved: string): string {
  return resolved.replace(/\\/g, '/');
}

function prettyPathFromWorkspace(resolved: string, workspaceRoot: string): string {
  if (!workspaceRoot) return prettyPath(resolved);
  const normWs = path.normalize(workspaceRoot + path.sep);
  const normRes = path.normalize(resolved);
  if (normRes.startsWith(normWs)) {
    const rel = normRes.slice(normWs.length).replace(/\\/g, '/');
    return rel.startsWith('/') ? rel : '/' + rel;
  }
  return prettyPath(resolved);
}

/* ─── Main hover computation ────────────────────────────────────── */

export async function computeHover(params: HoverParams): Promise<HoverData | null> {
  const { text, filePath, line, character, lineText, workspaceRoot, includePaths } = params;
  const lines = text.split(/\r?\n/);

  // Check if cursor is in a comment
  let inBlock = false;
  for (let i = 0; i < line; i++) {
    const r = stripCommentsPreserveColumns(lines[i], inBlock);
    inBlock = r.inBlock;
  }
  const current = stripCommentsPreserveColumns(lineText, inBlock);
  if (current.mask[character]) return null;

  // 1) Hover on #include
  {
    const inc = INCLUDE_RX.exec(lineText);
    if (inc) {
      const full = inc[0];
      const start = lineText.indexOf(full);
      const end = start + full.length;
      if (character >= start && character <= end) {
        const token = inc[2].trim();
        const fromDir = path.dirname(filePath);
        const resolved = resolveInclude(token, fromDir, includePaths);

        const sections: HoverSection[] = [];
        sections.push({ kind: 'text', content: `**${token}**\n\n` });

        if (resolved) {
          const norm = prettyPathFromWorkspace(resolved, workspaceRoot);
          sections.push({ kind: 'text', content: `Caminho: \`${norm}\`\n\n` });
          sections.push({
            kind: 'fileLink',
            label: 'Abrir arquivo',
            filePath: resolved,
            line: 0,
          });
        } else {
          sections.push({ kind: 'text', content: '_Nao encontrado nas include paths._' });
        }

        return { sections };
      }
    }
  }

  // 2) Skip hover inside strings
  const spans = getStringSpans(lineText);
  if (posInAnyString(character, lineText, spans)) return null;

  // 3) Word under cursor vs innermost call
  const wordRange = getWordRangeAtPosition(lineText, character, /[A-Za-z_][\w:]*/);
  const wordIdent = wordRange ? lineText.slice(wordRange.start, wordRange.end) : undefined;
  const wordIsCall = wordRange ? wordLooksLikeCall(lineText, wordRange, spans) : false;

  const innerCall = innermostCallAt(lineText, character);
  let callIdent = innerCall?.ident;
  if (innerCall && wordRange) {
    const calleeStart = innerCall.span[0];
    const calleeEnd = calleeStart + innerCall.ident.length;
    const overlapsCalleeName = !(wordRange.end <= calleeStart || wordRange.start >= calleeEnd);
    if (!overlapsCalleeName) callIdent = undefined;
  }

  const tryIdentsInOrder = [wordIsCall ? wordIdent : undefined, callIdent].filter(Boolean) as string[];

  const defs = parseDefines(text);
  const localsBase = parseLocalFunctionsByLines(lines);
  const localsMacro = parseMacroLocalFunctionsByLines(lines, defs);
  const locals = chooseBestLocals([...localsBase, ...localsMacro]);

  for (const ident of tryIdentsInOrder) {
    // 4.1) Placeholder Base::Name
    if (ident.includes('::')) {
      const phMatch = /^(?<base>[A-Za-z_][\w:]*?)::(?<name>[A-Za-z_]\w*)$/.exec(ident);
      if (phMatch) {
        let args = '';
        if (innerCall && innerCall.ident === ident) {
          const slice = lineText.slice(innerCall.span[0], innerCall.span[1]);
          const argMatch = /\(([^)]*)\)/.exec(slice);
          args = (argMatch?.[1] ?? '').trim();
        }
        const macroBase = phMatch.groups!.base;
        const matchPH = defs.placeholder.find(p => p.macroBase === macroBase);
        if (matchPH) {
          const expanded = expandPlaceholderBody(matchPH.body, phMatch.groups!.name, args);
          return {
            sections: [
              { kind: 'text', content: `**${macroBase}::${phMatch.groups!.name}**  \n` },
              { kind: 'code', content: expanded, language: 'pawn' },
            ],
          };
        }
      }
    }

    // 4.2) Simple alias macro
    const alias = defs.alias.find(a => a.name === ident);
    if (alias) {
      const sections: HoverSection[] = [
        { kind: 'text', content: `**#define ${alias.name}**  \n` },
        { kind: 'code', content: `#define ${alias.name} ${alias.target}`, language: 'pawn' },
      ];

      const targetEntry = await (async () => {
        const hitLocal = locals.find(f => f.name === alias.target);
        if (hitLocal) {
          return { name: alias.target, signature: hitLocal.signature, file: '', doc: undefined } as FuncEntry;
        }
        const cross = await findInIncludedFiles(alias.target, filePath, includePaths);
        if (cross) {
          return { name: alias.target, signature: cross.def.signature, file: cross.filePath, doc: undefined } as FuncEntry;
        }
        return findFunction(alias.target, includePaths);
      })();

      if (targetEntry) {
        sections.push({ kind: 'text', content: '\n— alias de:\n\n' });
        sections.push({ kind: 'code', content: `${targetEntry.signature};`, language: 'pawn' });
        if (targetEntry.doc && targetEntry.doc.trim()) {
          sections.push({ kind: 'text', content: '\n' });
          sections.push({ kind: 'code', content: targetEntry.doc.trim(), language: 'pawn' });
        }
      }
      return { sections };
    }

    // 4.3) Function-like macro
    const defFn = defs.fn.find(d => d.name === ident);
    if (defFn) {
      const sections: HoverSection[] = [
        { kind: 'text', content: `**#define ${defFn.name}(${defFn.params})**  \n` },
      ];
      const body = defFn.body.replace(/\\\s*/g, '\n').trim();
      if (body) sections.push({ kind: 'code', content: body, language: 'pawn' });
      return { sections };
    }

    // 4.4) Local functions in same file
    const local = locals.find(f => f.name === ident);
    if (local) {
      const sections: HoverSection[] = [];
      const lineOneBased = local.line + 1;
      const hoveringOwn = isHoveringOwnDecl(local.name, lineText, character);
      sections.push({ kind: 'text', content: `**${local.name}**  \n` });
      if (!hoveringOwn) {
        sections.push({
          kind: 'link',
          label: 'Ir para a linha',
          command: 'revealLine',
          args: [{ lineNumber: local.line, at: 'center' }],
        });
        sections.push({ kind: 'text', content: ` linha ${lineOneBased}\n\n` });
      } else {
        sections.push({ kind: 'text', content: '\n' });
      }
      sections.push({ kind: 'code', content: local.signature + ';', language: 'pawn' });
      return { sections };
    }

    // 4.5) Cross-file included functions
    const cross = await findInIncludedFiles(ident, filePath, includePaths);
    if (cross) {
      const { filePath: crossPath, def } = cross;
      const lineOneBased = def.line + 1;
      return {
        sections: [
          { kind: 'text', content: `**${def.name}**  \n` },
          { kind: 'text', content: `${prettyPathFromWorkspace(crossPath, workspaceRoot)}\n\n` },
          { kind: 'fileLink', label: 'Ir para a linha', filePath: crossPath, line: def.line },
          { kind: 'text', content: ` linha ${lineOneBased}\n\n` },
          { kind: 'code', content: def.signature + ';', language: 'pawn' },
        ],
      };
    }

    // 4.6) Standard includes index (natives/forwards)
    const fn = await findFunction(ident, includePaths);
    if (fn) {
      const sections: HoverSection[] = [
        { kind: 'text', content: `**${fn.name}**  \n` },
      ];
      if (fn.file) sections.push({ kind: 'text', content: `${prettyPathFromWorkspace(fn.file, workspaceRoot)}\n\n` });
      sections.push({ kind: 'code', content: fn.signature + ';', language: 'pawn' });
      if (fn.doc && fn.doc.trim()) {
        sections.push({ kind: 'text', content: '\n' });
        sections.push({ kind: 'code', content: fn.doc.trim(), language: 'pawn' });
      }
      return { sections };
    }
  }

  return null;
}
