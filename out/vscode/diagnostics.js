import * as vscode from 'vscode';
import { isPawnFile } from '../core/utils.js';
import { analyzeIncludes, buildIncludePaths } from '../core/includes.js';
import { analyzeUnusedSymbols } from '../core/unusedAnalyzer.js';
import { analyzeSemantics } from '../core/semanticAnalyzer.js';
import { getWorkspaceRoot } from './configBridge.js';
import { buildIncludeErrorMessage, msg } from './nls.js';
export function activateDiagnostics(context, config) {
    const collection = vscode.languages.createDiagnosticCollection('pawn-includes');
    context.subscriptions.push(collection);
    const runTokenByUri = new Map();
    const timerByUri = new Map();
    const run = async (doc, token) => {
        if (!isPawnFile(doc.fileName))
            return;
        const cfg = config.getAll();
        const ws = getWorkspaceRoot();
        const includePaths = buildIncludePaths(cfg, ws);
        const text = doc.getText();
        // Analyze includes with NLS message builder
        const includeResults = analyzeIncludes(text, doc.fileName, includePaths, buildIncludeErrorMessage);
        // Analyze declaration structure (sync)
        const semanticResults = analyzeSemantics(text);
        // Analyze unused symbols with NLS message builder
        const unusedResults = await analyzeUnusedSymbols(text, doc.fileName, includePaths, {
            unusedVariable: msg.diagnostics.unusedVariable,
            unusedStock: msg.diagnostics.unusedStock,
        }).catch(() => []);
        const allResults = [...includeResults, ...semanticResults, ...unusedResults];
        if (runTokenByUri.get(doc.uri.toString()) !== token)
            return;
        const diagnostics = allResults.map(d => {
            const range = new vscode.Range(doc.positionAt(d.startOffset), doc.positionAt(d.endOffset));
            const diag = new vscode.Diagnostic(range, d.message, d.severity === 'error'
                ? vscode.DiagnosticSeverity.Error
                : d.severity === 'warning'
                    ? vscode.DiagnosticSeverity.Warning
                    : vscode.DiagnosticSeverity.Information);
            diag.source = d.source;
            // Mark unused symbols with faded style
            if (d.source === 'pawnpro' && d.severity === 'warning') {
                diag.tags = [vscode.DiagnosticTag.Unnecessary];
            }
            return diag;
        });
        collection.set(doc.uri, diagnostics);
    };
    const scheduleRun = (doc, delayMs = 250) => {
        if (!isPawnFile(doc.fileName))
            return;
        const uri = doc.uri.toString();
        const nextToken = (runTokenByUri.get(uri) ?? 0) + 1;
        runTokenByUri.set(uri, nextToken);
        const prevTimer = timerByUri.get(uri);
        if (prevTimer)
            clearTimeout(prevTimer);
        const timer = setTimeout(() => {
            timerByUri.delete(uri);
            void run(doc, nextToken);
        }, delayMs);
        timerByUri.set(uri, timer);
    };
    const runActive = () => {
        const ed = vscode.window.activeTextEditor;
        if (ed)
            scheduleRun(ed.document, 50);
    };
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(doc => scheduleRun(doc, 50)), vscode.workspace.onDidSaveTextDocument(doc => scheduleRun(doc, 0)), vscode.workspace.onDidChangeTextDocument(e => scheduleRun(e.document)), vscode.workspace.onDidCloseTextDocument(doc => {
        const uri = doc.uri.toString();
        const timer = timerByUri.get(uri);
        if (timer)
            clearTimeout(timer);
        timerByUri.delete(uri);
        runTokenByUri.delete(uri);
        collection.delete(doc.uri);
    }), vscode.workspace.onDidChangeWorkspaceFolders(() => runActive()));
    config.onChange(() => runActive());
    runActive();
}
//# sourceMappingURL=diagnostics.js.map