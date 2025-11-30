import * as path from 'path';
import * as fs from 'fs';

export function isPawnFile(file: string): boolean {
  const f = file.toLowerCase();
  return f.endsWith('.pwn') || f.endsWith('.inc');
}

export function pathExists(p: string): boolean {
  try { fs.accessSync(p, fs.constants.F_OK); return true; } catch { return false; }
}

export function quoteIfNeeded(p: string): string {
  return /\s/.test(p) ? `"${p}"` : p;
}

/**
 * Resolve um include conforme a regra:
 * - Se o token tiver caminho (., .., / ou \) → resolve apenas relativo ao arquivo (fromDir).
 * - Caso contrário (nome simples) → procura apenas em includePaths.
 * - Se não houver extensão, também tenta acrescentar ".inc".
 */
export function resolveInclude(
  token: string,
  fromDir: string,
  includePaths: string[]
): string | undefined {
  const raw = token.trim();
  if (!raw) return undefined;

  const makeVariants = (p: string) => {
    const norm = p.replace(/\\/g, '/');
    return norm.toLowerCase().endsWith('.inc') ? [norm] : [norm, `${norm}.inc`];
  };

  // Absoluto
  if (path.isAbsolute(raw)) {
    const variants = makeVariants(raw);
    for (const v of variants) {
      const cand = path.normalize(v);
      if (pathExists(cand)) return cand;
    }
    return undefined;
  }

  // Tem caminho explícito? ./ ../ ou separador
  const hasPath = raw.startsWith('.') || raw.startsWith('..') || /[\\/]/.test(raw);

  const candidates: string[] = [];
  if (hasPath) {
    // Apenas relativo ao arquivo
    for (const v of makeVariants(raw)) {
      candidates.push(path.resolve(fromDir, v));
    }
  } else {
    // Apenas includePaths
    for (const base of includePaths) {
      for (const v of makeVariants(raw)) {
        candidates.push(path.resolve(base, v));
      }
    }
  }

  // Dedup + exists
  const seen = new Set<string>();
  for (const c of candidates.map(path.normalize)) {
    if (seen.has(c)) continue;
    seen.add(c);
    if (pathExists(c)) return c;
  }
  return undefined;
}