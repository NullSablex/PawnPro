import * as vscode from 'vscode';
import { activateConfigBridge, getWorkspaceRoot } from './configBridge.js';
import { activateDiagnostics } from './diagnostics.js';
import { registerCompileCommand } from './compiler.js';
import { registerSyntaxSchemeCommands, applySchemeOnActivate, cleanupThemeCustomizations } from './themes.js';
import { registerIncludesContainer } from './includeTree.js';
import { registerServerControls } from './server.js';
import { registerIncludeHover } from './hover.js';
import { registerCodeLens } from './codelens.js';
import { registerSignatureHelp } from './signatureHelp.js';
import { registerCompletion } from './completion.js';
import { prewarmCache, getCacheStats } from '../core/fileCache.js';
import { buildIncludePaths } from '../core/includes.js';
import { msg } from './nls.js';
import { registerWhatsNew } from './whatsNew.js';
import { registerTemplates } from './templates.js';
export function activate(context) {
    try {
        console.log('[PawnPro] activating...');
        // Initialize config/state bridge (must be first)
        const { config, state } = activateConfigBridge(context);
        // Diagnostics and build
        activateDiagnostics(context, config);
        registerCompileCommand(context, config);
        // Syntax themes
        registerSyntaxSchemeCommands(context, config);
        void applySchemeOnActivate(context, config);
        // Include tree, hover, and CodeLens
        registerIncludesContainer(context, config);
        registerIncludeHover(context, config);
        registerCodeLens(context, config);
        registerSignatureHelp(context, config);
        registerCompletion(context, config);
        // Server controls
        registerServerControls(context, config, state);
        // What's New panel (shows on first run or version change)
        registerWhatsNew(context);
        // File templates
        registerTemplates(context);
        // Focus container once on activation (not on every config change)
        if (config.getAll().ui.separateContainer) {
            void vscode.commands.executeCommand('workbench.view.extension.pawnpro');
        }
        // Debug: cache statistics command
        context.subscriptions.push(vscode.commands.registerCommand('pawnpro.cacheStats', () => {
            const s = getCacheStats();
            const detail = `text:${s.text}  idents:${s.idents}  symbols:${s.symbols}  funcs:${s.funcs}  api:${s.api}  includes:${s.includes}  apiIndex:${s.apiIndex}`;
            vscode.window.showInformationMessage(msg.debug.cacheStatsTitle(), { detail, modal: true });
        }));
        // Pre-warm cache in background
        const ws = getWorkspaceRoot();
        if (ws) {
            const cfg = config.getAll();
            const includePaths = buildIncludePaths(cfg, ws);
            vscode.workspace.findFiles('**/*.pwn', null, 10).then(async (files) => {
                const rootFiles = files.map(f => f.fsPath);
                await prewarmCache(rootFiles, includePaths);
                console.log('[PawnPro] cache pre-warmed');
            });
        }
        console.log('[PawnPro] activated');
    }
    catch (err) {
        console.error('[PawnPro] activation error:', err);
        vscode.window.showErrorMessage(`[PawnPro] activation error: ${err?.message || err}`);
        throw err;
    }
}
export function deactivate() {
    void cleanupThemeCustomizations();
}
//# sourceMappingURL=extension.js.map