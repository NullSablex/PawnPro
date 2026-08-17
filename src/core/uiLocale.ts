import * as fs from 'fs';
import * as path from 'path';

/**
 * Tradução da interface (páginas WebView) por idioma escolhido pelo usuário,
 * independente do `vscode.l10n` — que fixa o idioma da extensão pelo do editor e
 * não pode ser trocado em runtime.
 *
 * A fonte de tradução são os mesmos bundles `l10n/bundle.l10n.<lang>.json` usados
 * pelo l10n nativo: a chave é a string PT (fonte) e o valor é a tradução. Assim
 * não há duplicação — um único conjunto de traduções serve nls nativo e WebViews.
 *
 * Puro (sem `vscode`): recebe `extensionDir` e o locale já resolvido.
 */

const SUPPORTED = ['pt-BR', 'en', 'es', 'ro', 'ru'] as const;

/** Mapeia uma tag de idioma (ex.: "es-ES", "pt") para um bundle suportado, ou null. */
export function normalizeUiLocale(tag: string): string | null {
  const t = tag.toLowerCase();
  if (t.startsWith('pt')) return 'pt-BR';
  if (t.startsWith('en')) return 'en';
  if (t.startsWith('es')) return 'es';
  if (t.startsWith('ro')) return 'ro';
  if (t.startsWith('ru')) return 'ru';
  return null;
}

/**
 * Resolve o locale efetivo da interface: `configured` (config `ui.locale`) tem
 * prioridade; vazio ou não suportado cai em `editorLang` (idioma do editor); se
 * nem esse for suportado, PT-BR (a língua-fonte das chaves).
 */
export function resolveUiLocale(configured: string, editorLang: string): string {
  return (
    (configured && normalizeUiLocale(configured)) ||
    normalizeUiLocale(editorLang) ||
    'pt-BR'
  );
}

const cache = new Map<string, Record<string, string>>();

function loadBundle(extensionDir: string, locale: string): Record<string, string> {
  const key = `${extensionDir}::${locale}`;
  const cached = cache.get(key);
  if (cached) return cached;

  // PT-BR é a própria chave (não há bundle "pt-BR"; o bundle base é o default).
  // Para os demais, lê o bundle específico; falha → objeto vazio (cai na chave PT).
  let bundle: Record<string, string> = {};
  if (locale !== 'pt-BR') {
    try {
      const raw = fs.readFileSync(
        path.join(extensionDir, 'l10n', `bundle.l10n.${locale}.json`),
        'utf8',
      );
      bundle = JSON.parse(raw) as Record<string, string>;
    } catch {
      bundle = {};
    }
  }
  cache.set(key, bundle);
  return bundle;
}

function applyArgs(template: string, args: readonly (string | number)[]): string {
  return template.replace(/\{(\d+)\}/g, (m, i) => {
    const idx = Number(i);
    return idx < args.length ? String(args[idx]) : m;
  });
}

/**
 * Cria um tradutor para o locale dado. `t(ptKey, ...args)` devolve a tradução do
 * bundle (ou a própria `ptKey` se não houver), com `{0}`, `{1}`… substituídos.
 */
export function makeUiTranslator(
  extensionDir: string,
  locale: string,
): (ptKey: string, ...args: (string | number)[]) => string {
  const bundle = loadBundle(extensionDir, locale);
  return (ptKey, ...args) => applyArgs(bundle[ptKey] ?? ptKey, args);
}

export { SUPPORTED as SUPPORTED_UI_LOCALES };
