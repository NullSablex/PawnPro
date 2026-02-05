import * as vscode from 'vscode';
import { readSchemeFromFile, samePawnRules, mergeTokenColors, pickAutoScheme, AVAILABLE_SCHEMES, } from '../core/themes.js';
let isApplying = false;
let lastAppliedKey = '';
let schemeWasApplied = false;
function getThemeKind() {
    const k = vscode.window.activeColorTheme.kind;
    if (k === vscode.ColorThemeKind.Dark || k === vscode.ColorThemeKind.HighContrast)
        return 'dark';
    if (k === vscode.ColorThemeKind.HighContrastLight)
        return 'light';
    return 'light';
}
function themedKey(name) {
    return `${name}|${vscode.window.activeColorTheme.kind}`;
}
async function clearTokenColors() {
    const cfg = vscode.workspace.getConfiguration();
    await cfg.update('editor.tokenColorCustomizations', undefined, vscode.ConfigurationTarget.Global);
}
async function applySchemeByName(extensionDir, name) {
    if (isApplying)
        return;
    isApplying = true;
    try {
        if (name === 'none') {
            await clearTokenColors();
            lastAppliedKey = 'none';
            schemeWasApplied = false;
            return;
        }
        const resolved = name === 'auto' ? pickAutoScheme(getThemeKind()) : name;
        const key = themedKey(resolved);
        if (lastAppliedKey === key)
            return;
        const scheme = readSchemeFromFile(extensionDir, resolved);
        if (!scheme) {
            vscode.window.showWarningMessage(`[PawnPro] Esquema nao encontrado: ${resolved}`);
            return;
        }
        // Get current token color rules
        const vscfg = vscode.workspace.getConfiguration();
        const current = vscfg.get('editor.tokenColorCustomizations') ?? {};
        const existingRules = Array.isArray(current.textMateRules)
            ? current.textMateRules
            : [];
        const nextRules = mergeTokenColors(existingRules, scheme);
        if (!samePawnRules(existingRules, nextRules)) {
            const clone = { ...current };
            if (nextRules.length > 0) {
                clone.textMateRules = nextRules;
            }
            else {
                if ('textMateRules' in clone)
                    delete clone.textMateRules;
                if (Object.keys(clone).length === 0) {
                    await vscfg.update('editor.tokenColorCustomizations', {}, vscode.ConfigurationTarget.Global);
                    lastAppliedKey = key;
                    schemeWasApplied = true;
                    return;
                }
            }
            await vscfg.update('editor.tokenColorCustomizations', clone, vscode.ConfigurationTarget.Global);
        }
        lastAppliedKey = key;
        schemeWasApplied = true;
    }
    finally {
        isApplying = false;
    }
}
export function registerSyntaxSchemeCommands(context, config) {
    const extensionDir = context.extensionUri.fsPath;
    context.subscriptions.push(vscode.commands.registerCommand('pawnpro.applySyntaxScheme', async () => {
        const entries = AVAILABLE_SCHEMES.map(e => e.label);
        const picked = await vscode.window.showQuickPick(entries, {
            placeHolder: 'Escolha o esquema de sintaxe PawnPro',
        });
        if (!picked)
            return;
        const choice = AVAILABLE_SCHEMES.find(e => e.label === picked).value;
        // Persist choice first (single write, triggers onChange → applySchemeByName)
        config.set('syntax', { scheme: choice, applyOnStartup: true }, 'project');
        vscode.window.showInformationMessage(`PawnPro: esquema aplicado -> ${picked}`);
    }), vscode.commands.registerCommand('pawnpro.resetSyntaxScheme', async () => {
        // Single config write, then clear visuals
        config.set('syntax', { scheme: 'none', applyOnStartup: false }, 'project');
        await clearTokenColors();
        lastAppliedKey = 'none';
        schemeWasApplied = false;
        vscode.window.showInformationMessage('PawnPro: sintaxe restaurada (removidas regras PawnPro).');
    }));
    // Re-apply on config change (read-only, no config writes)
    config.onChange(async (cfg) => {
        if (cfg.syntax.applyOnStartup) {
            await applySchemeByName(extensionDir, cfg.syntax.scheme);
        }
    });
    // Re-apply auto scheme on theme change
    let timer;
    context.subscriptions.push(vscode.window.onDidChangeActiveColorTheme(() => {
        const cfg = config.getAll();
        if (!(cfg.syntax.applyOnStartup && cfg.syntax.scheme === 'auto'))
            return;
        if (timer)
            clearTimeout(timer);
        timer = setTimeout(() => {
            void applySchemeByName(extensionDir, 'auto');
        }, 120);
    }));
}
export async function applySchemeOnActivate(context, config) {
    const cfg = config.getAll();
    if (cfg.syntax.applyOnStartup) {
        await applySchemeByName(context.extensionUri.fsPath, cfg.syntax.scheme);
    }
}
export async function cleanupThemeCustomizations() {
    if (schemeWasApplied) {
        try {
            // Remove only Pawn rules from global token colors
            const vscfg = vscode.workspace.getConfiguration();
            const current = vscfg.get('editor.tokenColorCustomizations') ?? {};
            const existingRules = Array.isArray(current.textMateRules)
                ? current.textMateRules
                : [];
            const cleaned = mergeTokenColors(existingRules, null);
            if (cleaned.length !== existingRules.length) {
                const clone = { ...current };
                if (cleaned.length > 0) {
                    clone.textMateRules = cleaned;
                }
                else {
                    delete clone.textMateRules;
                }
                if (Object.keys(clone).length === 0) {
                    await vscfg.update('editor.tokenColorCustomizations', undefined, vscode.ConfigurationTarget.Global);
                }
                else {
                    await vscfg.update('editor.tokenColorCustomizations', clone, vscode.ConfigurationTarget.Global);
                }
            }
        }
        catch {
            // deactivate has limited time, ignore errors
        }
    }
}
//# sourceMappingURL=themes.js.map