import * as fs from 'fs';
import * as path from 'path';
import type { TokenColorRule, TokenColorScheme, ThemeKind } from './types.js';

const SCHEME_FILES: Record<string, string> = {
  classic_white: './syntaxes/themes/classic_white.json',
  modern_white:  './syntaxes/themes/modern_white.json',
  classic_dark:  './syntaxes/themes/classic_dark.json',
  modern_dark:   './syntaxes/themes/modern_dark.json',
};

export function readSchemeFromFile(extensionDir: string, name: string): TokenColorScheme | null {
  const rel = SCHEME_FILES[name];
  if (!rel) return null;
  try {
    const raw = fs.readFileSync(path.join(extensionDir, rel), 'utf8');
    return JSON.parse(raw) as TokenColorScheme;
  } catch {
    return null;
  }
}

export function samePawnRules(a?: TokenColorRule[], b?: TokenColorRule[]): boolean {
  const normalize = (arr?: TokenColorRule[]) =>
    JSON.stringify((arr ?? []).map(r => ({
      scope: Array.isArray(r.scope) ? [...r.scope].sort() : r.scope,
      settings: r.settings,
    })));
  return normalize(a) === normalize(b);
}

export function mergeTokenColors(
  currentRules: TokenColorRule[],
  update: TokenColorScheme | null,
): TokenColorRule[] {
  const withoutPawn = currentRules.filter((r) => {
    const scopes = Array.isArray(r.scope) ? r.scope : [r.scope];
    return !scopes.some(s => typeof s === 'string' && (s.includes('.pawn') || s.includes('source.pawn')));
  });
  return update ? [...withoutPawn, ...update.textMateRules] : withoutPawn;
}

export function pickAutoScheme(themeKind: ThemeKind): 'classic_white' | 'classic_dark' {
  return themeKind === 'dark' || themeKind === 'highContrast' ? 'classic_dark' : 'classic_white';
}

export const AVAILABLE_SCHEMES = [
  { label: 'Automático',       value: 'auto' },
  { label: 'Clássico (Claro)', value: 'classic_white' },
  { label: 'Moderno (Claro)',  value: 'modern_white' },
  { label: 'Clássico (Escuro)', value: 'classic_dark' },
  { label: 'Moderno (Escuro)', value: 'modern_dark' },
  { label: 'Nenhum',           value: 'none' },
] as const;
