import * as vscode from 'vscode';
import { msg } from './nls.js';

const MATERIAL_ICON_THEME_ID = 'pkief.material-icon-theme';
const DISMISS_KEY = 'pawnpro.iconThemeSuggestionDismissed';

/**
 * Sugere (sem impor) o Material Icon Theme na ativação, quando o usuário ainda
 * não o tem instalado. É apenas um complemento visual (ícones das pastas) — por isso a sugestão é
 * dispensável de vez ("Não perguntar de novo") e nunca reaparece se o tema já
 * estiver presente. Isolada de qualquer await de ativação: puramente cosmética.
 */
export function suggestIconTheme(context: vscode.ExtensionContext): void {
  if (vscode.extensions.getExtension(MATERIAL_ICON_THEME_ID)) return;
  if (context.globalState.get<boolean>(DISMISS_KEY)) return;

  void promptIconTheme(context);
}

async function promptIconTheme(context: vscode.ExtensionContext): Promise<void> {
  const choice = await vscode.window.showInformationMessage(
    msg.iconTheme.suggestion(),
    msg.iconTheme.install(),
    msg.iconTheme.notNow(),
    msg.iconTheme.dontAskAgain(),
  );

  if (choice === msg.iconTheme.install()) {
    // O editor exibe seu próprio prompt para ativar o tema após instalar.
    await vscode.commands.executeCommand(
      'workbench.extensions.installExtension',
      MATERIAL_ICON_THEME_ID,
    );
    // Já instalado: não perguntar novamente.
    await context.globalState.update(DISMISS_KEY, true);
  } else if (choice === msg.iconTheme.dontAskAgain()) {
    await context.globalState.update(DISMISS_KEY, true);
  }
  // "Agora não" (ou fechar): mantém o estado — reaparece na próxima ativação.
}
