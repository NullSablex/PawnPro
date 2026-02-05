import * as fs from 'fs';
import * as path from 'path';
const SCHEME_FILES = {
    classic_white: './syntaxes/themes/classic_white.json',
    modern_white: './syntaxes/themes/modern_white.json',
    classic_dark: './syntaxes/themes/classic_dark.json',
    modern_dark: './syntaxes/themes/modern_dark.json',
};
/* ─── Read scheme from extension directory ──────────────────────── */
export function readSchemeFromFile(extensionDir, name) {
    const rel = SCHEME_FILES[name];
    if (!rel)
        return null;
    try {
        const filePath = path.join(extensionDir, rel);
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
/* ─── Rule comparison ───────────────────────────────────────────── */
export function samePawnRules(a, b) {
    const norm = (arr) => JSON.stringify((arr ?? []).map(r => ({
        scope: Array.isArray(r.scope) ? [...r.scope].sort() : r.scope,
        settings: r.settings,
    })));
    return norm(a) === norm(b);
}
/* ─── Merge token colors ────────────────────────────────────────── */
export function mergeTokenColors(currentRules, update) {
    const withoutPawn = currentRules.filter((r) => {
        const scopes = Array.isArray(r.scope) ? r.scope : [r.scope];
        return !scopes?.some((s) => typeof s === 'string' && (s.includes('.pawn') || s.includes('source.pawn')));
    });
    if (!update)
        return withoutPawn;
    return [...withoutPawn, ...update.textMateRules];
}
/* ─── Auto scheme selection ─────────────────────────────────────── */
export function pickAutoScheme(themeKind) {
    return (themeKind === 'dark' || themeKind === 'highContrast') ? 'classic_dark' : 'classic_white';
}
/* ─── Exported scheme names ─────────────────────────────────────── */
export const AVAILABLE_SCHEMES = [
    { label: 'Automatico', value: 'auto' },
    { label: 'Classico (Claro)', value: 'classic_white' },
    { label: 'Moderno (Claro)', value: 'modern_white' },
    { label: 'Classico (Escuro)', value: 'classic_dark' },
    { label: 'Moderno (Escuro)', value: 'modern_dark' },
    { label: 'Nenhum', value: 'none' },
];
//# sourceMappingURL=themes.js.map