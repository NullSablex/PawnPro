import * as vscode from 'vscode';
import { isPawnFile } from '../core/utils.js';
import { analyzeIncludes, buildIncludePaths } from '../core/includes.js';
import { PawnProConfigManager } from '../core/config.js';
import { getWorkspaceRoot } from './configBridge.js';

export function activateDiagnostics(
  context: vscode.ExtensionContext,
  config: PawnProConfigManager,
) {
  const collection = vscode.languages.createDiagnosticCollection('pawn-includes');
  context.subscriptions.push(collection);

  const run = (doc: vscode.TextDocument) => {
    if (!isPawnFile(doc.fileName)) return;

    const cfg = config.getAll();
    const ws = getWorkspaceRoot();
    const includePaths = buildIncludePaths(cfg, ws);
    const text = doc.getText();

    const results = analyzeIncludes(text, doc.fileName, includePaths);

    const diagnostics = results.map(d => {
      const range = new vscode.Range(
        doc.positionAt(d.startOffset),
        doc.positionAt(d.endOffset),
      );
      const diag = new vscode.Diagnostic(
        range,
        d.message,
        d.severity === 'error'
          ? vscode.DiagnosticSeverity.Error
          : d.severity === 'warning'
            ? vscode.DiagnosticSeverity.Warning
            : vscode.DiagnosticSeverity.Information,
      );
      diag.source = d.source;
      return diag;
    });

    collection.set(doc.uri, diagnostics);
  };

  const runActive = () => {
    const ed = vscode.window.activeTextEditor;
    if (ed) run(ed.document);
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc => run(doc)),
    vscode.workspace.onDidSaveTextDocument(doc => run(doc)),
    vscode.workspace.onDidChangeTextDocument(e => run(e.document)),
    vscode.workspace.onDidCloseTextDocument(doc => collection.delete(doc.uri)),
    vscode.workspace.onDidChangeWorkspaceFolders(() => runActive()),
  );

  // Also re-run diagnostics when config changes
  config.onChange(() => runActive());

  runActive();
}
