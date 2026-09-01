import type { PawnProConfigManager } from '../core/config.js';
import { accentCss } from '../core/accent.js';

/**
 * CSS de tema das WebViews, para injetar no fim do `<style>` de qualquer página.
 *
 * Existe para a cor de destaque ser lida num lugar só: as páginas não precisam
 * saber que ela existe, nem carregá-la pelas próprias assinaturas. Uma cor nova
 * ou uma variável a mais se resolve aqui e vale para todas.
 *
 * Vazio no modo automático — sem regra, as páginas caem nas variáveis do tema
 * do editor, que é o comportamento original.
 */
export function webviewThemeCss(config: PawnProConfigManager): string {
  return accentCss(config.getAll().ui?.accent ?? '');
}
