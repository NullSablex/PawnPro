import * as vscode from 'vscode';
import { createMsg, type Msg } from './nls.js';
import { makeUiTranslator, resolveUiLocale } from '../core/uiLocale.js';
import type { PawnProConfigManager } from '../core/config.js';

/**
 * Cria uma instância de `msg` para as páginas WebView, traduzida pelo idioma da
 * interface (`ui.locale`) em vez do idioma do editor. Cada página chama isto na
 * abertura/render, obtendo sua própria instância — sem estado global.
 *
 * O locale efetivo: `ui.locale` da config; vazio → idioma do editor; fallback
 * PT-BR. A fonte de tradução são os bundles `l10n/` (mesma dos textos nativos).
 */
export function createWebviewMsg(
  context: vscode.ExtensionContext,
  config: PawnProConfigManager,
): Msg {
  const uiLocale = config.getAll().ui.locale;
  const locale = resolveUiLocale(uiLocale, vscode.env.language);
  const translate = makeUiTranslator(context.extensionPath, locale);
  return createMsg(translate);
}
