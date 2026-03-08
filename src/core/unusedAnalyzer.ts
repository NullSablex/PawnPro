import { stripCommentsPreserveColumns } from './includes.js';
import { getFileIdents, getIncludedFiles } from './fileCache.js';
import type { DiagnosticData } from './types.js';

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type SymbolDecl = {
  name: string;
  kind: 'variable' | 'stock';
  line: number;
  col: number;
};

/* ─── Build line offset table ──────────────────────────────────── */

function buildLineOffsets(text: string): number[] {
  const offsets: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') {
      offsets.push(i + 1);
    }
  }
  return offsets;
}

/* ─── Strip comments and get clean lines ───────────────────────── */

function getCleanLines(text: string): { cleanLines: string[]; originalLines: string[] } {
  const originalLines = text.split(/\r?\n/);
  const cleanLines: string[] = [];
  let inBlock = false;

  for (const ln of originalLines) {
    const r = stripCommentsPreserveColumns(ln, inBlock);
    inBlock = r.inBlock;
    cleanLines.push(r.text);
  }

  return { cleanLines, originalLines };
}

/* ─── Parse declarations ───────────────────────────────────────── */

function parseVariableDeclarations(cleanLines: string[], originalLines: string[]): SymbolDecl[] {
  const decls: SymbolDecl[] = [];
  const rxVar = /\b(new|static|const)\s+([A-Za-z_]\w*)/g;

  for (let lineIdx = 0; lineIdx < cleanLines.length; lineIdx++) {
    const cleanLine = cleanLines[lineIdx];
    const originalLine = originalLines[lineIdx];

    if (!cleanLine.trim()) continue;

    let m: RegExpExecArray | null;
    rxVar.lastIndex = 0;

    while ((m = rxVar.exec(cleanLine))) {
      const name = m[2];

      if (['true', 'false', 'null', 'sizeof', 'tagof', 'Float', 'bool', 'char', 'String'].includes(name)) continue;

      const keyword = m[1];
      const searchPattern = new RegExp(`\\b${escapeRe(keyword)}\\s+${escapeRe(name)}\\b`);
      const originalMatch = searchPattern.exec(originalLine);

      if (originalMatch) {
        const col = originalMatch.index + originalMatch[0].indexOf(name);

        decls.push({
          name,
          kind: 'variable',
          line: lineIdx,
          col,
        });
      }
    }
  }

  return decls;
}

function parseStockFunctions(cleanLines: string[], originalLines: string[]): SymbolDecl[] {
  const decls: SymbolDecl[] = [];
  const rxStock = /^\s*stock\s+(?:[A-Za-z_]\w*:)?\s*([A-Za-z_]\w*)\s*\(/;

  for (let lineIdx = 0; lineIdx < cleanLines.length; lineIdx++) {
    const cleanLine = cleanLines[lineIdx];
    const originalLine = originalLines[lineIdx];

    const m = rxStock.exec(cleanLine);
    if (!m) continue;

    const name = m[1];

    const searchPattern = new RegExp(`\\bstock\\s+(?:[A-Za-z_]\\w*:)?\\s*(${escapeRe(name)})\\s*\\(`);
    const originalMatch = searchPattern.exec(originalLine);

    if (originalMatch) {
      const col = originalMatch.index + originalMatch[0].indexOf(name);

      decls.push({
        name,
        kind: 'stock',
        line: lineIdx,
        col,
      });
    }
  }

  return decls;
}

/* ─── Collect usages ───────────────────────────────────────────── */

function collectIdentifierUsages(cleanLines: string[], decls: SymbolDecl[]): Set<string> {
  const usages = new Set<string>();
  const declNames = new Set(decls.map(d => d.name));
  const declByLineAndName = new Map<number, Map<string, SymbolDecl>>();
  for (const decl of decls) {
    const byName = declByLineAndName.get(decl.line) ?? new Map<string, SymbolDecl>();
    if (!byName.has(decl.name)) byName.set(decl.name, decl);
    declByLineAndName.set(decl.line, byName);
  }

  const rxIdent = /\b([A-Za-z_]\w*)\b/g;

  for (let lineIdx = 0; lineIdx < cleanLines.length; lineIdx++) {
    const line = cleanLines[lineIdx];
    let m: RegExpExecArray | null;
    rxIdent.lastIndex = 0;

    while ((m = rxIdent.exec(line))) {
      const name = m[1];
      if (!declNames.has(name)) continue;

      const decl = declByLineAndName.get(lineIdx)?.get(name);

      if (decl) {
        if (decl.kind === 'variable') {
          const declPattern = new RegExp(`\\b(new|static|const)\\s+${escapeRe(name)}\\b`);
          const declMatch = declPattern.exec(line);
          if (declMatch) {
            const declEndPos = declMatch.index + declMatch[0].length;
            if (m.index < declEndPos) continue;
          }
        } else if (decl.kind === 'stock') {
          const stockPattern = /^\s*stock\s+/;
          if (stockPattern.test(line)) continue;
        }
      }

      usages.add(name);
    }
  }

  return usages;
}

/* ─── Analyze single file ──────────────────────────────────────── */

function analyzeFile(text: string): { decls: SymbolDecl[]; usages: Set<string>; lineOffsets: number[] } {
  const { cleanLines, originalLines } = getCleanLines(text);
  const lineOffsets = buildLineOffsets(text);

  const varDecls = parseVariableDeclarations(cleanLines, originalLines);
  const stockDecls = parseStockFunctions(cleanLines, originalLines);
  const decls = [...varDecls, ...stockDecls];

  const usages = collectIdentifierUsages(cleanLines, decls);

  return { decls, usages, lineOffsets };
}

/* ─── Message builder type ─────────────────────────────────────── */

export type UnusedMsgBuilder = {
  unusedVariable: (name: string) => string;
  unusedStock: (name: string) => string;
};

const defaultMsg: UnusedMsgBuilder = {
  unusedVariable: (name) => `"${name}" variável declarada mas não utilizada`,
  unusedStock: (name) => `"${name}" função stock declarada mas não utilizada`,
};

/* ─── Main analysis function ───────────────────────────────────── */

export async function analyzeUnusedSymbols(
  text: string,
  filePath: string,
  includePaths: string[],
  buildMsg: UnusedMsgBuilder = defaultMsg,
): Promise<DiagnosticData[]> {
  const diagnostics: DiagnosticData[] = [];

  const { decls, usages, lineOffsets } = analyzeFile(text);
  if (decls.length === 0) return diagnostics;

  const variables = decls.filter(d => d.kind === 'variable');
  const stocks = decls.filter(d => d.kind === 'stock');

  // Variables: only check local usages
  for (const decl of variables) {
    if (!usages.has(decl.name)) {
      const startOffset = lineOffsets[decl.line] + decl.col;
      diagnostics.push({
        startOffset,
        endOffset: startOffset + decl.name.length,
        message: buildMsg.unusedVariable(decl.name),
        severity: 'warning',
        source: 'pawnpro',
      });
    }
  }

  // Stock functions: check local + includes (using shared cache)
  if (stocks.length > 0) {
    const stockNames = new Set(stocks.map(s => s.name));
    const usedStocks = new Set<string>();

    for (const name of stockNames) {
      if (usages.has(name)) usedStocks.add(name);
    }

    if (usedStocks.size < stockNames.size) {
      try {
        const includedFiles = await getIncludedFiles(filePath, includePaths);
        for (const fp of includedFiles) {
          if (fp === filePath) continue;
          const idents = await getFileIdents(fp);
          for (const name of stockNames) {
            if (!usedStocks.has(name) && idents.has(name)) {
              usedStocks.add(name);
            }
          }
          if (usedStocks.size >= stockNames.size) break;
        }
      } catch {
        // Ignore include errors
      }
    }

    for (const decl of stocks) {
      if (!usedStocks.has(decl.name)) {
        const startOffset = lineOffsets[decl.line] + decl.col;
        diagnostics.push({
          startOffset,
          endOffset: startOffset + decl.name.length,
          message: buildMsg.unusedStock(decl.name),
          severity: 'warning',
          source: 'pawnpro',
        });
      }
    }
  }

  return diagnostics;
}
