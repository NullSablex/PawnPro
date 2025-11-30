import * as vscode from 'vscode';
import * as path from 'path';
import { resolveInclude } from './utils.js';
import { findFunction, FuncEntry } from './apiIndex.js';

const INCLUDE_RX = /#\s*include\s*(<|")\s*([^>"]+)\s*(>|")/;

type GetIncludePaths = () => Promise<string[]>;
type LocalFunc = { name: string; signature: string; line: number; kind: 'public'|'stock'|'forward' };

type DefineAlias = { name: string; target: string };
type DefineFn = { name: string; params: string; body: string };
type DefinePlaceholder = { macroBase: string; body: string }; // e.g., BPR::%0(%1)

function commandLink(label: string, command: string, args: any): string {
  const enc = encodeURIComponent(JSON.stringify(args));
  return `[${label}](command:${command}?${enc} "${label}")`;
}
function fileOpenLink(label: string, fileUri: vscode.Uri, line: number): string {
  const args = [fileUri.toString(), { selection: { start: { line, character: 0 }, end: { line, character: 0 } } }];
  return commandLink(label, 'vscode.open', args);
}

function prettyPath(resolved: string): string {
  return resolved.replace(/\\/g, '/');
}

function prettyPathFromDoc(resolved: string, doc: vscode.TextDocument): string {
  const wsFolder = vscode.workspace.getWorkspaceFolder(doc.uri)?.uri.fsPath
    || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!wsFolder) return prettyPath(resolved);
  const normWs = path.normalize(wsFolder + path.sep);
  const normRes = path.normalize(resolved);
  if (normRes.startsWith(normWs)) {
    const rel = normRes.slice(normWs.length).replace(/\\/g, '/');
    return rel.startsWith('/') ? rel : '/' + rel;
  }
  return prettyPath(resolved);
}

/* ===========================
   Utilitários: strings & comentários
   =========================== */

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
function posInAnyString(ch: number, line: string, spans?: Array<{start:number;end:number}>): boolean {
  const ss = spans ?? getStringSpans(line);
  return ss.some(sp => ch >= sp.start && ch <= sp.end);
}

/**
 * Remove comentários da linha preservando colunas (caracteres comentados viram espaço).
 * Retorna também uma máscara booleana indicando quais posições pertencem a comentários.
 */
function stripCommentsPreserveColumns(
  line: string,
  inBlock: boolean
): { text: string; mask: boolean[]; inBlock: boolean } {
  const spans = getStringSpans(line);
  const out = line.split('');
  const mask = new Array<boolean>(line.length).fill(false);

  const mark = (i: number) => { out[i] = ' '; mask[i] = true; };

  let i = 0;
  while (i < line.length) {
    if (!inBlock) {
      // ignore marcadores de comentário se dentro de string
      if (!posInAnyString(i, line, spans) && line[i] === '/' && i + 1 < line.length) {
        const nxt = line[i + 1];
        if (nxt === '/') {
          // comentário de linha: do i ao fim
          for (let k = i; k < line.length; k++) mark(k);
          break;
        }
        if (nxt === '*') {
          // inicia bloco
          mark(i); mark(i + 1);
          i += 2;
          inBlock = true;
          continue;
        }
      }
      i++;
    } else {
      // dentro de bloco: consome tudo até "*/"
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

/** Remove comentários do texto inteiro (mantendo quebras de linha) */
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

/* ===========================
   Parsers (baseados em linhas, agora comment-aware)
   =========================== */

function parseLocalFunctionsByLines(doc: vscode.TextDocument): LocalFunc[] {
  const out: LocalFunc[] = [];
  const rx = /^\s*(public|stock|forward)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/;

  let inBlock = false;
  for (let i = 0; i < doc.lineCount; i++) {
    const lineText = doc.lineAt(i).text;
    const stripped = stripCommentsPreserveColumns(lineText, inBlock);
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

function parseMacroLocalFunctionsByLines(doc: vscode.TextDocument, defs: { placeholder: DefinePlaceholder[] }): LocalFunc[] {
  if (!defs.placeholder.length) return [];
  const bases = new Set(defs.placeholder.map(p => p.macroBase));
  const out: LocalFunc[] = [];
  const rx = /^\s*([A-Za-z_][\w:]*)::([A-Za-z_]\w*)\s*\(([^)]*)\)/;

  let inBlock = false;
  for (let i = 0; i < doc.lineCount; i++) {
    const lineText = doc.lineAt(i).text;
    const stripped = stripCommentsPreserveColumns(lineText, inBlock);
    inBlock = stripped.inBlock;

    const m = rx.exec(stripped.text);
    if (!m) continue;
    if (!bases.has(m[1])) continue; // apenas se houver placeholder correspondente
    const name = m[2];
    const params = (m[3] ?? '').trim();
    out.push({ name, signature: `${name}(${params})`, line: i, kind: 'forward' });
  }
  return out;
}

function parseDefines(text: string): { alias: DefineAlias[]; fn: DefineFn[]; placeholder: DefinePlaceholder[] } {
  // IMPORTANT: ignora defines comentados
  const clean = stripCommentsWhole(text);

  const alias: DefineAlias[] = [];
  const fn: DefineFn[] = [];
  const placeholder: DefinePlaceholder[] = [];

  // Alias simples: #define Msg SendClientMessage
  {
    const rxAlias = /^\s*#\s*define\s+([A-Za-z_][\w:]*?)\s+([A-Za-z_][\w:]*)\s*$/gm;
    let m: RegExpExecArray | null;
    while ((m = rxAlias.exec(clean))) alias.push({ name: m[1], target: m[2] });
  }

  // Tipo função: #define Foo(a,b) corpo...
  {
    const rxFn = /^\s*#\s*define\s+([A-Za-z_][\w:]*?)\s*\(([^)]*)\)\s*([^\r\n]*)/gm;
    let m: RegExpExecArray | null;
    while ((m = rxFn.exec(clean))) {
      if (m[1].includes('%0')) continue; // placeholders tratados abaixo
      fn.push({ name: m[1], params: m[2], body: m[3] });
    }
  }

  // Placeholder base como BPR::%0(%1)
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

/* ================
   Utilitários linha
   ================ */

function rangeInAnyString(range: vscode.Range, line: string, spans?: Array<{start:number;end:number}>): boolean {
  const ss = spans ?? getStringSpans(line);
  const s = range.start.character, e = range.end.character;
  return ss.some(sp => s >= sp.start && e <= sp.end);
}

function scanParenClose(line: string, openIdx: number, spans: Array<{start:number;end:number}>): number {
  let depth = 0;
  for (let k = openIdx; k < line.length; k++) {
    if (posInAnyString(k, line, spans)) { const sp = spans.find(s => k >= s.start && k <= s.end)!; k = sp.end; continue; }
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

  // placeholders Base::Nome(...)
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

  // chamadas simples Nome(...)
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
function innermostCallAt(line: string, ch: number): { ident: string, span: [number, number] } | undefined {
  const calls = collectCalls(line)
    .filter(c => ch >= c.start && ch <= c.end)
    .sort((a, b) => (a.end - a.start) - (b.end - b.start));
  if (!calls.length) return undefined;
  const pick = calls[0];
  return { ident: pick.ident, span: [pick.start, pick.end] };
}
function wordLooksLikeCall(line: string, range: vscode.Range, spans?: Array<{start:number;end:number}>): boolean {
  const ss = spans ?? getStringSpans(line);
  if (rangeInAnyString(range, line, ss)) return false;
  let j = range.end.character;
  while (j < line.length && /\s/.test(line[j])) j++;
  return line[j] === '(';
}
function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function isHoveringOwnDecl(ident: string, lineText: string, char: number): boolean {
  // public/stock/forward
  {
    const rx = new RegExp(String.raw`^\s*(?:public|stock|forward)\s+(${escapeRe(ident)})\s*\(`, 'i');
    const m = rx.exec(lineText);
    if (m) {
      const start = m.index + m[0].indexOf(m[1]);
      const end = start + m[1].length;
      if (char >= start && char <= end) return true;
    }
  }
  // Base::Nome
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

/* ======================================
   Preferir definição (public/stock) à fwd
   ====================================== */
function chooseBestLocals(locals: LocalFunc[]): LocalFunc[] {
  const rank: Record<LocalFunc['kind'], number> = { forward: 0, stock: 1, public: 1 };
  const byName = new Map<string, LocalFunc>();
  for (const f of locals) {
    const cur = byName.get(f.name);
    if (!cur || rank[f.kind] > rank[cur.kind]) byName.set(f.name, f);
  }
  return [...byName.values()];
}

/* ================================
   Includes: coleta e varredura rec (comment-aware)
   ================================ */

function collectIncludeTokens(text: string): string[] {
  const clean = stripCommentsWhole(text); // ignora includes comentados
  const tokens = new Set<string>();
  let m: RegExpExecArray | null;
  const rx = /#\s*include\s*(<|")\s*([^>"]+)\s*(>|")/g;
  while ((m = rx.exec(clean))) tokens.add(m[2].trim());
  return [...tokens];
}

async function gatherIncludedUris(rootDoc: vscode.TextDocument, includePaths: string[], maxDepth = 3, maxFiles = 30): Promise<vscode.Uri[]> {
  const out: vscode.Uri[] = [];
  const seen = new Set<string>();
  const queue: Array<{ uri: vscode.Uri; depth: number }> = [];

  // seeds: includes do root
  const fromDir = path.dirname(rootDoc.fileName);
  for (const tk of collectIncludeTokens(rootDoc.getText())) {
    const resolved = resolveInclude(tk, fromDir, includePaths);
    if (resolved) {
      const uri = vscode.Uri.file(resolved);
      if (!seen.has(uri.fsPath)) { seen.add(uri.fsPath); queue.push({ uri, depth: 1 }); }
    }
  }

  while (queue.length && out.length < maxFiles) {
    const { uri, depth } = queue.shift()!;
    out.push(uri);
    if (depth >= maxDepth) continue;
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const baseDir = path.dirname(uri.fsPath);
      for (const tk of collectIncludeTokens(doc.getText())) {
        const resolved = resolveInclude(tk, baseDir, includePaths);
        if (!resolved) continue;
        const child = vscode.Uri.file(resolved);
        if (!seen.has(child.fsPath)) {
          seen.add(child.fsPath);
          queue.push({ uri: child, depth: depth + 1 });
        }
      }
    } catch {
      // ignora arquivos que não abriram
    }
  }

  return out;
}

async function findInIncludedFiles(ident: string, curDoc: vscode.TextDocument, includePaths: string[]): Promise<{ uri: vscode.Uri; def: LocalFunc } | undefined> {
  const uris = await gatherIncludedUris(curDoc, includePaths);
  for (const uri of uris) {
    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      const defs = chooseBestLocals([
        ...parseLocalFunctionsByLines(doc),
        ...parseMacroLocalFunctionsByLines(doc, parseDefines(doc.getText()))
      ]);
      const hit = defs.find(d => d.name === ident);
      if (hit) return { uri, def: hit };
    } catch {
      // continua
    }
  }
  return undefined;
}

/* =======================
   Hover provider (final)
   ======================= */

export function registerIncludeHover(context: vscode.ExtensionContext, getIncludePaths: GetIncludePaths) {

  const provider = vscode.languages.registerHoverProvider('pawn', {
    async provideHover(doc, pos) {
      const text = doc.getText();
      const lineText = doc.lineAt(pos.line).text;

      // 0) Se o cursor estiver EM COMENTÁRIO na linha, não mostra hover
      //    (usamos o mesmo strip de comentários para obter uma máscara por caractere)
      let inBlock = false;
      for (let i = 0; i < pos.line; i++) {
        const r = stripCommentsPreserveColumns(doc.lineAt(i).text, inBlock);
        inBlock = r.inBlock;
      }
      const current = stripCommentsPreserveColumns(lineText, inBlock);
      if (current.mask[pos.character]) return undefined;

      // 1) Hover em #include (usa regex direta na linha original, mas a seleção é pela posição)
      {
        const inc = INCLUDE_RX.exec(lineText);
        if (inc) {
          const full = inc[0];
          const start = lineText.indexOf(full);
          const end = start + full.length;
          if (pos.character >= start && pos.character <= end) {
            const token = inc[2].trim();
            const includePaths = await getIncludePaths();
            const fromDir = path.dirname(doc.fileName);
            const resolved = resolveInclude(token, fromDir, includePaths);

            const md = new vscode.MarkdownString(undefined, true);
            md.isTrusted = true;
            md.supportHtml = false;
            md.supportThemeIcons = true;

            md.appendMarkdown(`**${token}**\n\n`);

            if (resolved) {
              const norm = prettyPathFromDoc(resolved, doc);
              md.appendMarkdown(`Caminho: \`${norm}\`\n\n`);
              const fileUri = vscode.Uri.file(resolved);
              const folderUri = vscode.Uri.file(path.dirname(resolved));
              const openArgs = encodeURIComponent(JSON.stringify([fileUri.toString()]));
              const revealArgs = encodeURIComponent(JSON.stringify(fileUri.toString()));
              md.appendMarkdown(`[Abrir arquivo](command:vscode.open?${openArgs} "Abrir arquivo") · [Abrir pasta](command:revealFileInOS?${revealArgs} "Abrir pasta")`);
            } else {
              md.appendMarkdown('_Não encontrado nas include paths._');
            }

            return new vscode.Hover(md);
          }
        }
      }

      // 2) Ignora hover dentro de string
      const spans = getStringSpans(lineText);
      if (posInAnyString(pos.character, lineText, spans)) return undefined;

      // 3) Palavra sob o cursor x chamada mais interna
      const wordRange = doc.getWordRangeAtPosition(pos, /[A-Za-z_][\w:]*/);
      const wordIdent = wordRange ? doc.getText(wordRange) : undefined;
      const wordIsCall = wordRange ? wordLooksLikeCall(lineText, wordRange, spans) : false;

      const innerCall = innermostCallAt(lineText, pos.character);
      let callIdent = innerCall?.ident;
      if (innerCall && wordRange) {
        const calleeStart = innerCall.span[0];
        const calleeEnd = calleeStart + innerCall.ident.length; // apenas o nome do callee
        const wrs = wordRange.start.character;
        const wre = wordRange.end.character;
        const overlapsCalleeName = !(wre <= calleeStart || wrs >= calleeEnd);
        if (!overlapsCalleeName) callIdent = undefined;
      }

      const tryIdentsInOrder = [wordIsCall ? wordIdent : undefined, callIdent].filter(Boolean) as string[];

      const includePaths = await getIncludePaths();
      const defs = parseDefines(text); // já comment-aware

      // —— Locais (baseados em linhas, comment-aware) ——
      const localsBase = parseLocalFunctionsByLines(doc);
      const localsMacro = parseMacroLocalFunctionsByLines(doc, defs);
      const locals = chooseBestLocals([...localsBase, ...localsMacro]);

      for (const ident of tryIdentsInOrder) {
        // 4.1) Placeholder Base::Nome — expandir
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
              const md = new vscode.MarkdownString(undefined, true);
              md.isTrusted = true;
              md.appendMarkdown(`**${macroBase}::${phMatch.groups!.name}**  \n`);
              md.appendCodeblock(expanded, 'pawn');
              return new vscode.Hover(md);
            }
          }
        }

        // 4.2) Macro alias simples
        const alias = defs.alias.find(a => a.name === ident);
        if (alias) {
          const md = new vscode.MarkdownString(undefined, true);
          md.isTrusted = true;
          md.appendMarkdown(`**#define ${alias.name}**  \n`);
          md.appendCodeblock(`#define ${alias.name} ${alias.target}`, 'pawn');

          const targetEntry = await (async () => {
            const hitLocal = locals.find(f => f.name === alias.target);
            if (hitLocal) {
              return { name: alias.target, signature: hitLocal.signature, file: '', doc: undefined } as FuncEntry;
            }
            // tenta includes de projeto
            const cross = await findInIncludedFiles(alias.target, doc, includePaths);
            if (cross) {
              return { name: alias.target, signature: cross.def.signature, file: cross.uri.fsPath, doc: undefined } as FuncEntry;
            }
            // por fim, índice global (includes padrão)
            return findFunction(alias.target, includePaths);
          })();

          if (targetEntry) {
            md.appendMarkdown('\n— alias de:\n\n');
            md.appendCodeblock(`${targetEntry.signature};`, 'pawn');
            if (targetEntry.doc && targetEntry.doc.trim()) {
              md.appendMarkdown('\n');
              md.appendCodeblock(targetEntry.doc.trim(), 'pawn');
            }
          }
          return new vscode.Hover(md);
        }

        // 4.3) Macro tipo função
        const defFn = defs.fn.find(d => d.name === ident);
        if (defFn) {
          const md = new vscode.MarkdownString(undefined, true);
          md.isTrusted = true;
          md.appendMarkdown(`**#define ${defFn.name}(${defFn.params})**  \n`);
          const body = defFn.body.replace(/\\\s*/g, '\n').trim();
          if (body) md.appendCodeblock(body, 'pawn');
          return new vscode.Hover(md);
        }

        // 4.4) Locais no mesmo arquivo
        const local = locals.find(f => f.name === ident);
        if (local) {
          const md = new vscode.MarkdownString(undefined, true);
          md.isTrusted = true;
          const lineOneBased = local.line + 1;
          const hoveringOwn = isHoveringOwnDecl(local.name, lineText, pos.character);
          md.appendMarkdown(`**${local.name}**  \n`);
          if (!hoveringOwn) {
            const jump = commandLink('Ir para a linha', 'revealLine', { lineNumber: local.line, at: 'center' });
            md.appendMarkdown(`linha ${lineOneBased} — ${jump}\n\n`);
          } else {
            md.appendMarkdown('\n');
          }
          md.appendCodeblock(local.signature + ';', 'pawn');
          return new vscode.Hover(md);
        }

        // 4.5) Procurar em arquivos incluídos do projeto
        const cross = await findInIncludedFiles(ident, doc, includePaths);
        if (cross) {
          const { uri, def } = cross;
          const md = new vscode.MarkdownString(undefined, true);
          md.isTrusted = true;
          const lineOneBased = def.line + 1;
          md.appendMarkdown(`**${def.name}**  \n`);
          md.appendMarkdown(`${prettyPathFromDoc(uri.fsPath, doc)}\n\n`);
          const jump = fileOpenLink('Ir para a linha', uri, def.line);
          md.appendMarkdown(`linha ${lineOneBased} — ${jump}\n\n`);
          md.appendCodeblock(def.signature + ';', 'pawn');
          return new vscode.Hover(md);
        }

        // 4.6) Index de includes (natives/forwards de libs padrão)
        const fn = await findFunction(ident, includePaths);
        if (fn) {
          const md = new vscode.MarkdownString(undefined, true);
          md.isTrusted = true;
          md.appendMarkdown(`**${fn.name}**  \n`);
          if (fn.file) md.appendMarkdown(`${prettyPathFromDoc(fn.file, doc)}\n\n`);
          md.appendCodeblock(fn.signature + ';', 'pawn');
          if (fn.doc && fn.doc.trim()) {
            md.appendMarkdown('\n');
            md.appendCodeblock(fn.doc.trim(), 'pawn');
          }
          return new vscode.Hover(md);
        }
      }

      return undefined;
    }
  });

  context.subscriptions.push(provider);
}
