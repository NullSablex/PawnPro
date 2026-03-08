import * as vscode from 'vscode';
import { isPawnFile } from '../core/utils.js';
import { stripCommentsPreserveColumns, buildIncludePaths } from '../core/includes.js';
import { getFileText, getIncludedFiles } from '../core/fileCache.js';
import { PawnProConfigManager } from '../core/config.js';
import { getWorkspaceRoot } from './configBridge.js';
import { msg } from './nls.js';

type FunctionDecl = {
  name: string;
  line: number;
  col: number;
  kind: 'public' | 'stock' | 'forward' | 'native';
};

/* ─── Parse functions in a file ────────────────────────────────── */

function parseFunctions(text: string): FunctionDecl[] {
  const lines = text.split(/\r?\n/);
  const funcs: FunctionDecl[] = [];
  let inBlock = false;

  const rxFunc = /^\s*(public|stock|forward)\s+(?:[A-Za-z_]\w*:)?\s*([A-Za-z_]\w*)\s*\(/;
  const rxNative = /^\s*(?:forward\s+)?native\s+(?:[A-Za-z_]\w*:)?\s*([A-Za-z_]\w*)\s*\(/;
  // Macro-based public declarations: PREFIX::FuncName(params)
  // e.g. BPR::IsAMoto(carid) or ACC::OnPlayerConnect(playerid)
  // In SA-MP Pawn, IDENTIFIER:: at the start of a line is always a
  // macro declaration (expands to forward+public), never a call expression.
  const rxMacroPublic = /^\s*[A-Za-z_]\w*::([A-Za-z_]\w*)\s*\(/;

  for (let i = 0; i < lines.length; i++) {
    const stripped = stripCommentsPreserveColumns(lines[i], inBlock);
    inBlock = stripped.inBlock;
    const line = stripped.text;

    const mFunc = rxFunc.exec(line);
    if (mFunc) {
      const col = line.indexOf(mFunc[2], mFunc.index);
      funcs.push({
        name: mFunc[2],
        line: i,
        col: col >= 0 ? col : 0,
        kind: mFunc[1] as FunctionDecl['kind'],
      });
      continue;
    }

    const mNative = rxNative.exec(line);
    if (mNative) {
      const col = line.indexOf(mNative[1], mNative.index);
      funcs.push({
        name: mNative[1],
        line: i,
        col: col >= 0 ? col : 0,
        kind: 'native',
      });
      continue;
    }

    const mMacro = rxMacroPublic.exec(line);
    if (mMacro) {
      const name = mMacro[1];
      const col = line.indexOf(name, mMacro.index);
      funcs.push({
        name,
        line: i,
        col: col >= 0 ? col : 0,
        kind: 'public',
      });
    }
  }

  return funcs;
}

/* ─── Count references in text ─────────────────────────────────── */

function countReferences(
  text: string,
  fnNames: Set<string>,
  mainDeclPos?: Map<string, Map<number, Set<number>>>,
): Map<string, number> {
  const lines = text.split(/\r?\n/);
  const refs = new Map<string, number>();
  let inBlock = false;

  const rxCall = /\b([A-Za-z_]\w*)\s*\(/g;

  for (let i = 0; i < lines.length; i++) {
    const stripped = stripCommentsPreserveColumns(lines[i], inBlock);
    inBlock = stripped.inBlock;

    let m: RegExpExecArray | null;
    rxCall.lastIndex = 0;
    while ((m = rxCall.exec(stripped.text))) {
      const name = m[1];
      if (!fnNames.has(name)) continue;

      if (mainDeclPos?.get(name)?.has(i)) {
        const col = m.index + m[0].indexOf(name);
        if (mainDeclPos.get(name)?.get(i)?.has(col)) {
          continue;
        }
      }

      refs.set(name, (refs.get(name) ?? 0) + 1);
    }
  }

  return refs;
}

function findReferencesInText(
  text: string,
  uri: vscode.Uri,
  fnName: string,
  declLine?: number,
  declCol?: number,
): vscode.Location[] {
  const lines = text.split(/\r?\n/);
  const out: vscode.Location[] = [];
  let inBlock = false;

  const rxCall = /\b([A-Za-z_]\w*)\s*\(/g;

  for (let i = 0; i < lines.length; i++) {
    const stripped = stripCommentsPreserveColumns(lines[i], inBlock);
    inBlock = stripped.inBlock;

    let m: RegExpExecArray | null;
    rxCall.lastIndex = 0;
    while ((m = rxCall.exec(stripped.text))) {
      const name = m[1];
      if (name !== fnName) continue;

      const col = m.index + m[0].indexOf(name);
      if (declLine === i && declCol === col) continue;

      out.push(
        new vscode.Location(
          uri,
          new vscode.Range(i, col, i, col + fnName.length),
        ),
      );
    }
  }

  return out;
}

/* ─── CodeLens Provider ────────────────────────────────────────── */

type CodeLensCache = {
  version: number;
  lenses: vscode.CodeLens[];
};
const codeLensCache = new Map<string, CodeLensCache>();

class PawnCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
  private refreshTimer: NodeJS.Timeout | undefined;

  refresh() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
    this._onDidChangeCodeLenses.fire();
  }

  scheduleRefresh(delayMs = 500) {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      this._onDidChangeCodeLenses.fire();
    }, delayMs);
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken,
  ): Promise<vscode.CodeLens[]> {
    if (!isPawnFile(document.fileName)) return [];

    const uri = document.uri.toString();
    const version = document.version;

    const cached = codeLensCache.get(uri);
    if (cached && cached.version === version) {
      return cached.lenses;
    }

    const text = document.getText();
    const funcs = parseFunctions(text);
    if (funcs.length === 0) {
      codeLensCache.set(uri, { version, lenses: [] });
      return [];
    }

    const fnNames = new Set(funcs.map(f => f.name));

    const mainDeclPos = new Map<string, Map<number, Set<number>>>();
    for (const func of funcs) {
      const byLine = mainDeclPos.get(func.name) ?? new Map<number, Set<number>>();
      const cols = byLine.get(func.line) ?? new Set<number>();
      cols.add(func.col);
      byLine.set(func.line, cols);
      mainDeclPos.set(func.name, byLine);
    }

    const localRefs = countReferences(text, fnNames, mainDeclPos);

    const lenses: vscode.CodeLens[] = [];
    for (const func of funcs) {
      const refs = localRefs.get(func.name) ?? 0;
      const range = new vscode.Range(func.line, func.col, func.line, func.col + func.name.length);

      const lens = new vscode.CodeLens(range, {
        title: refs === 1 ? msg.codelens.reference() : msg.codelens.references(refs),
        command: 'pawnpro.showReferences',
        arguments: [document.uri, func.line, func.col, func.name],
        tooltip: msg.codelens.showReferences(),
      });

      lenses.push(lens);
    }

    codeLensCache.set(uri, { version, lenses });

    if (codeLensCache.size > 20) {
      const first = codeLensCache.keys().next().value;
      if (first) codeLensCache.delete(first);
    }

    return lenses;
  }
}

/* ─── Registration ─────────────────────────────────────────────── */

export function registerCodeLens(
  context: vscode.ExtensionContext,
  config: PawnProConfigManager,
) {
  const provider = new PawnCodeLensProvider();

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'pawn', scheme: 'file' },
      provider,
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'pawnpro.showReferences',
      async (uri: vscode.Uri, line: number, col: number, fnName: string) => {
        const doc = await vscode.workspace.openTextDocument(uri);
        const cfg = config.getAll();
        const ws = getWorkspaceRoot();
        const includePaths = buildIncludePaths(cfg, ws);

        const locations = findReferencesInText(doc.getText(), doc.uri, fnName, line, col);

        const includedFiles = await getIncludedFiles(doc.fileName, includePaths);
        for (const fp of includedFiles) {
          if (fp === doc.fileName) continue;
          const incText = await getFileText(fp);
          if (!incText) continue;
          const incUri = vscode.Uri.file(fp);
          locations.push(...findReferencesInText(incText, incUri, fnName));
        }

        await vscode.commands.executeCommand(
          'editor.action.showReferences',
          uri,
          new vscode.Position(line, col),
          locations,
        );
      },
    ),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(e => {
      if (isPawnFile(e.document.fileName)) provider.scheduleRefresh();
    }),
    vscode.workspace.onDidSaveTextDocument(() => provider.refresh()),
  );
}
