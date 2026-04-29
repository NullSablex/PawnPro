import * as vscode from 'vscode';
import { activateConfigBridge, getWorkspaceRoot } from './configBridge.js';
import { registerCompileCommand } from './compiler.js';
import { registerSyntaxSchemeCommands, applySchemeOnActivate, cleanupThemeCustomizations } from './themes.js';
import { registerIncludesContainer } from './includeTree.js';
import { registerServerControls } from './server.js';
import { msg } from './nls.js';
import { registerWhatsNew } from './whatsNew.js';
import { registerTemplates } from './templates.js';
import { startLspClient, stopLspClient, restartLspClient, resolveSdkFilePath } from './lspClient.js';
import { buildIncludePaths } from '../core/includes.js';
import { activateStatusBar } from './statusBar.js';
import { registerSettingsView } from './settingsView.js';

export async function activate(context: vscode.ExtensionContext) {
  try {
    const { config, state } = activateConfigBridge(context);

    registerCompileCommand(context, config);
    registerSyntaxSchemeCommands(context, config);
    void applySchemeOnActivate(context, config);
    registerIncludesContainer(context, config);
    registerServerControls(context, config, state);
    registerWhatsNew(context);
    registerTemplates(context);

    context.subscriptions.push(
      vscode.commands.registerCommand('pawnpro.clearEngineCache', async () => {
        await restartLspClient();
        vscode.window.showInformationMessage(msg.extension.cacheCleaned());
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(
        'pawnpro.findReferences',
        async (...rawArgs: unknown[]) => {
          let uriStr: string | undefined;
          let line: number | undefined;
          let character: number | undefined;

          const first = rawArgs[0];
          if (typeof first === 'string') {
            uriStr    = first;
            line      = typeof rawArgs[1] === 'number' ? rawArgs[1] as number : undefined;
            character = typeof rawArgs[2] === 'number' ? rawArgs[2] as number : undefined;
          } else if (Array.isArray(first)) {
            const [a, b, c] = first as unknown[];
            uriStr    = typeof a === 'string' ? a : undefined;
            line      = typeof b === 'number' ? b : undefined;
            character = typeof c === 'number' ? c : undefined;
          }

          if (!uriStr || line === undefined || character === undefined) {
            return;
          }

          try {
            const uri      = vscode.Uri.parse(uriStr);
            const position = new vscode.Position(line, character);

            const locations = await vscode.commands.executeCommand<vscode.Location[]>(
              'vscode.executeReferenceProvider',
              uri,
              position,
            );

            if (locations && locations.length > 0) {
              await vscode.commands.executeCommand(
                'editor.action.showReferences',
                uri,
                position,
                locations,
              );
            }
          } catch {
            // Silencioso — o usuário pode usar Shift+F12 como alternativa
          }
        },
      ),
    );

    const ws = getWorkspaceRoot();
    await startLspClient(context, config, ws);

    const cfg = config.getAll();
    const sdkPlatform = cfg.analysis.sdk.platform;
    if (sdkPlatform !== 'none') {
      const resolved = resolveSdkFilePath(
        sdkPlatform,
        cfg.analysis.sdk.filePath,
        buildIncludePaths(cfg, ws),
        ws,
      );
      // Avisa apenas quando o usuário escolheu explicitamente omp ou samp+filePath
      // e o arquivo não foi encontrado. 'auto' nunca avisa — ausência de open.mp.inc
      // simplesmente significa SA-MP, o que é esperado.
      const shouldWarn = !resolved && (
        sdkPlatform === 'omp' ||
        (sdkPlatform === 'samp' && !!cfg.analysis.sdk.filePath)
      );
      if (shouldWarn) {
        void vscode.window.showWarningMessage(
          msg.extension.sdkFileNotFound(sdkPlatform),
        );
      }
    }

    registerSettingsView(context, config);
    activateStatusBar(context, config);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(msg.extension.activationError(message));
    throw err;
  }
}

export async function deactivate() {
  await stopLspClient();
  void cleanupThemeCustomizations();
}
