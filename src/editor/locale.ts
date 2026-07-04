import * as vscode from 'vscode';
import type { PawnProConfigManager } from '../core/config.js';

/**
 * Locale a usar nas mensagens localizadas dos componentes externos (engine LSP e
 * adaptador de depuração): a config `pawnpro.locale` tem prioridade; vazia → o
 * idioma do editor. Fonte única compartilhada para que todos os componentes
 * sigam o mesmo idioma.
 */
export function resolveLocale(cfg: ReturnType<PawnProConfigManager['getAll']>): string {
  return cfg.locale || vscode.env.language;
}
