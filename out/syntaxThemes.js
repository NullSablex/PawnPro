import * as vscode from 'vscode';
const SCHEME_FILES = {
    classic_white: './syntaxes/themes/classic_white.json',
    modern_white: './syntaxes/themes/modern_white.json',
    classic_dark: './syntaxes/themes/classic_dark.json',
    modern_dark: './syntaxes/themes/modern_dark.json',
};
let isApplying = false;
let lastAppliedKey = '';
async function clearTokenColorsAllScopes() {
    const cfg = vscode.workspace.getConfiguration();
    const targets = [
        vscode.ConfigurationTarget.Workspace,
        vscode.ConfigurationTarget.Global
    ];
    for (const t of targets) {
        await cfg.update('editor.tokenColorCustomizations', undefined, t);
    }
}
function themedKey(name) {
    return `${name}|${vscode.window.activeColorTheme.kind}`;
}
async function readSchemeFromFile(ctx, name) {
    const rel = SCHEME_FILES[name];
    if (!rel)
        return null;
    try {
        const uri = vscode.Uri.joinPath(ctx.extensionUri, rel);
        const buf = await vscode.workspace.fs.readFile(uri);
        return JSON.parse(Buffer.from(buf).toString('utf8'));
    }
    catch {
        return null;
    }
}
function samePawnRules(a, b) {
    const norm = (arr) => JSON.stringify((arr ?? []).map(r => ({
        scope: Array.isArray(r.scope) ? [...r.scope].sort() : r.scope,
        settings: r.settings
    })));
    return norm(a) === norm(b);
}
async function mergeTokenColors(update) {
    const cfg = vscode.workspace.getConfiguration();
    const current = cfg.get('editor.tokenColorCustomizations') ?? {};
    const clone = { ...current };
    const existing = Array.isArray(clone.textMateRules) ? clone.textMateRules : [];
    const withoutPawn = existing.filter((r) => {
        const scopes = Array.isArray(r.scope) ? r.scope : [r.scope];
        return !scopes?.some((s) => typeof s === 'string' && (s.includes('.pawn') || s.includes('source.pawn')));
    });
    const nextRules = update ? [...withoutPawn, ...update.textMateRules] : withoutPawn;
    if (samePawnRules(existing, nextRules))
        return;
    if (nextRules.length > 0) {
        clone.textMateRules = nextRules;
    }
    else {
        if ('textMateRules' in clone)
            delete clone.textMateRules;
        if (Object.keys(clone).length === 0) {
            await cfg.update('editor.tokenColorCustomizations', {}, vscode.ConfigurationTarget.Workspace);
            return;
        }
    }
    await cfg.update('editor.tokenColorCustomizations', clone, vscode.ConfigurationTarget.Workspace);
}
function pickAutoScheme() {
    const k = vscode.window.activeColorTheme.kind;
    const { Dark, HighContrast } = vscode.ColorThemeKind;
    return (k === Dark || k === HighContrast) ? 'classic_dark' : 'classic_white';
}
export async function applySchemeByName(context, name) {
    if (isApplying)
        return;
    isApplying = true;
    try {
        const cfg = vscode.workspace.getConfiguration();
        if (name === 'none') {
            await clearTokenColorsAllScopes();
            await cfg.update('pawnpro.syntax.scheme', 'none', vscode.ConfigurationTarget.Workspace);
            lastAppliedKey = 'none';
            return;
        }
        const resolved = (name === 'auto') ? pickAutoScheme() : name;
        const key = themedKey(resolved);
        if (lastAppliedKey === key)
            return;
        const scheme = await readSchemeFromFile(context, resolved);
        if (!scheme) {
            vscode.window.showWarningMessage(`[PawnPro] Esquema não encontrado: ${resolved}`);
            return;
        }
        await mergeTokenColors(scheme);
        lastAppliedKey = key;
        // Persistir escolha (auto/classic_white/modern_dark/classic_dark/modern_dark)
        await cfg.update('pawnpro.syntax.scheme', name, vscode.ConfigurationTarget.Workspace);
    }
    finally {
        isApplying = false;
    }
}
export function registerSyntaxSchemeCommands(context) {
    context.subscriptions.push(vscode.commands.registerCommand('pawnpro.applySyntaxScheme', async () => {
        const cfg = vscode.workspace.getConfiguration();
        const autoApply = cfg.get('pawnpro.syntax.applyOnStartup') ?? false;
        if (!autoApply) {
            // se estava desativado, ativar só para a aplicação manual atual
            await cfg.update('pawnpro.syntax.applyOnStartup', true, vscode.ConfigurationTarget.Workspace);
        }
        const entries = [
            { label: 'Automático', value: 'auto' },
            { label: 'Clássico (Claro)', value: 'classic_white' },
            { label: 'Moderno (Claro)', value: 'modern_white' },
            { label: 'Clássico (Escuro)', value: 'classic_dark' },
            { label: 'Moderno (Escuro)', value: 'modern_dark' },
            { label: 'Nenhum', value: 'none' }
        ];
        const picked = await vscode.window.showQuickPick(entries.map(e => e.label), {
            placeHolder: 'Escolha o esquema de sintaxe PawnPro'
        });
        if (!picked)
            return;
        const choice = entries.find(e => e.label === picked).value;
        await applySchemeByName(context, choice);
        vscode.window.showInformationMessage(`PawnPro: esquema aplicado → ${picked}`);
    }), vscode.commands.registerCommand('pawnpro.resetSyntaxScheme', async () => {
        const cfg = vscode.workspace.getConfiguration();
        await cfg.update('pawnpro.syntax.scheme', 'none', vscode.ConfigurationTarget.Workspace);
        await cfg.update('pawnpro.syntax.applyOnStartup', false, vscode.ConfigurationTarget.Workspace);
        await clearTokenColorsAllScopes();
        lastAppliedKey = 'none';
        vscode.window.showInformationMessage('PawnPro: sintaxe restaurada (removidas regras PawnPro).');
    }), vscode.workspace.onDidChangeConfiguration(async (e) => {
        if (e.affectsConfiguration('pawnpro.syntax.scheme') || e.affectsConfiguration('pawnpro.syntax.applyOnStartup')) {
            const cfg = vscode.workspace.getConfiguration();
            const auto = cfg.get('pawnpro.syntax.applyOnStartup') ?? true;
            const name = cfg.get('pawnpro.syntax.scheme') ?? 'auto';
            if (auto)
                await applySchemeByName(context, name);
        }
    }));
    // re-aplica em 'auto' ao trocar o tema
    let timer;
    context.subscriptions.push(vscode.window.onDidChangeActiveColorTheme(() => {
        const cfg = vscode.workspace.getConfiguration();
        const name = cfg.get('pawnpro.syntax.scheme') ?? 'auto';
        const auto = cfg.get('pawnpro.syntax.applyOnStartup') ?? true;
        if (!(auto && name === 'auto'))
            return;
        if (timer)
            clearTimeout(timer);
        timer = setTimeout(() => { void applySchemeByName(context, 'auto'); }, 120);
    }));
}
export async function applySchemeOnActivate(context) {
    const cfg = vscode.workspace.getConfiguration();
    const auto = cfg.get('pawnpro.syntax.applyOnStartup') ?? true;
    const name = cfg.get('pawnpro.syntax.scheme') ?? 'auto';
    if (auto)
        await applySchemeByName(context, name);
}
//# sourceMappingURL=syntaxThemes.js.map