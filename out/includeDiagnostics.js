import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { fileURLToPath } from 'url';
import * as path from 'path';
import * as fs from 'fs';
import { isPawnFile, resolveInclude } from './utils.js';
const __filename = fileURLToPath(import.meta.url);
const localize = nls.loadMessageBundle(__filename);
const INCLUDE_RX_GLOBAL = /#\s*include\s*(<|")\s*([^>"]+)\s*(>|")/g;
function existsDir(p) {
    try {
        return fs.statSync(p).isDirectory();
    }
    catch {
        return false;
    }
}
function expandWS(p) {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    return p.replace('${workspaceFolder}', ws);
}
function getIncludePathsFromArgs(args) {
    return args.filter(a => a.startsWith('-i')).map(a => expandWS(a.slice(2)));
}
export async function buildIncludePaths() {
    const cfg = vscode.workspace.getConfiguration();
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const fromSettings = (cfg.get('pawnpro.includePaths') || []).map(expandWS);
    const fromArgs = getIncludePathsFromArgs(cfg.get('pawnpro.compiler.args') || []);
    const defaults = [path.join(ws, 'pawno', 'include'), path.join(ws, 'include')].filter(existsDir);
    const all = [...fromSettings, ...fromArgs, ...defaults]
        .map(p => path.normalize(p))
        .filter((p, i, arr) => p && arr.indexOf(p) === i && existsDir(p));
    return all;
}
export function activateIncludeDiagnostics(context) {
    const collection = vscode.languages.createDiagnosticCollection('pawn-includes');
    context.subscriptions.push(collection);
    const run = async (doc) => {
        if (!isPawnFile(doc.fileName))
            return;
        const includePaths = await buildIncludePaths();
        const diagnostics = [];
        const text = doc.getText();
        let m;
        while ((m = INCLUDE_RX_GLOBAL.exec(text))) {
            const token = m[2].trim();
            const idx = m.index;
            const len = m[0].length;
            const range = new vscode.Range(doc.positionAt(idx), doc.positionAt(idx + len));
            const fromDir = path.dirname(doc.fileName);
            const resolved = resolveInclude(token, fromDir, includePaths);
            if (!resolved) {
                const d = new vscode.Diagnostic(range, localize('include.notFound', 'Include não encontrado: {0}', token), vscode.DiagnosticSeverity.Error);
                d.source = 'PawnPro';
                diagnostics.push(d);
            }
        }
        collection.set(doc.uri, diagnostics);
    };
    const runActive = () => {
        const ed = vscode.window.activeTextEditor;
        if (ed)
            void run(ed.document);
    };
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(doc => void run(doc)), vscode.workspace.onDidSaveTextDocument(doc => void run(doc)), vscode.workspace.onDidChangeTextDocument(e => void run(e.document)), vscode.workspace.onDidCloseTextDocument(doc => collection.delete(doc.uri)), vscode.workspace.onDidChangeWorkspaceFolders(() => runActive()));
    runActive();
}
//# sourceMappingURL=includeDiagnostics.js.map