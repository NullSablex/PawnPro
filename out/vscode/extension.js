import * as vscode from 'vscode';
import { activateConfigBridge } from './configBridge.js';
import { activateDiagnostics } from './diagnostics.js';
import { registerCompileCommand } from './compiler.js';
import { registerSyntaxSchemeCommands, applySchemeOnActivate, cleanupThemeCustomizations } from './themes.js';
import { registerIncludesContainer } from './includeTree.js';
import { registerServerControls } from './server.js';
import { registerIncludeHover } from './hover.js';
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
        // Include tree and hover
        registerIncludesContainer(context, config);
        registerIncludeHover(context, config);
        // Server controls
        registerServerControls(context, config, state);
        // Focus container once on activation (not on every config change)
        if (config.getAll().ui.separateContainer) {
            void vscode.commands.executeCommand('workbench.view.extension.pawnpro');
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