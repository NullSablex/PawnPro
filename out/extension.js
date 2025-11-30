import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { fileURLToPath } from 'url';
import * as path from 'path';
const __filename = fileURLToPath(import.meta.url);
nls.config({ messageFormat: nls.MessageFormat.file })(__filename);
import { activateIncludeDiagnostics } from './includeDiagnostics.js';
import { registerCompileCommand } from './compiler.js';
import { registerSyntaxSchemeCommands, applySchemeOnActivate } from './syntaxThemes.js';
import { registerIncludesContainer } from './includeTree.js';
import { registerServerControls } from './server.js';
import { registerIncludeHover } from './includeHover.js';
export function activate(context) {
    try {
        console.log('[PawnPro] activating...');
        // diagnósticos e build
        activateIncludeDiagnostics(context);
        registerCompileCommand(context);
        // temas de sintaxe
        registerSyntaxSchemeCommands(context);
        void applySchemeOnActivate(context);
        // includePaths (cache simples)
        let cachedIncludePaths = null;
        const getIncludePaths = async () => {
            if (cachedIncludePaths)
                return cachedIncludePaths;
            const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
            const fromSettings = (vscode.workspace.getConfiguration().get('pawnpro.includePaths') || [])
                .map(p => p.replace('${workspaceFolder}', ws));
            // defaults
            const all = [...fromSettings, path.join(ws, 'pawno', 'include'), path.join(ws, 'include')];
            // normaliza e dedup
            const norm = all
                .map(p => path.normalize(p))
                .filter((p, i, arr) => p && arr.indexOf(p) === i);
            cachedIncludePaths = norm;
            return cachedIncludePaths;
        };
        // includes (árvore) e hover
        registerIncludesContainer(context, getIncludePaths);
        registerIncludeHover(context, getIncludePaths);
        // servidor (registra webview view)
        registerServerControls(context);
        // ----- focar container quando a config exigir -----
        const focusContainerIfNeeded = () => {
            const separate = vscode.workspace
                .getConfiguration()
                .get('pawnpro.ui.separateContainer', false);
            if (separate) {
                // garante que o container apareça/foco na Activity Bar
                void vscode.commands.executeCommand('workbench.view.extension.pawnpro');
            }
            else {
                // opcional: voltar para o Explorer
                // void vscode.commands.executeCommand('workbench.view.explorer');
            }
        };
        // aplica na ativação
        focusContainerIfNeeded();
        // invalida cache quando a config/workspace mudar + reage ao toggle
        context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('pawnpro.includePaths')) {
                cachedIncludePaths = null;
            }
            if (e.affectsConfiguration('pawnpro.ui.separateContainer')) {
                focusContainerIfNeeded();
            }
        }), vscode.workspace.onDidChangeWorkspaceFolders(() => { cachedIncludePaths = null; }));
        console.log('[PawnPro] activated');
    }
    catch (err) {
        console.error('[PawnPro] activation error:', err);
        vscode.window.showErrorMessage(`[PawnPro] activation error: ${err?.message || err}`);
        throw err;
    }
}
export function deactivate() { }
//# sourceMappingURL=extension.js.map