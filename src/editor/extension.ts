import * as vscode from 'vscode';
import { activateConfigBridge, getWorkspaceRoot, recoverLargeConfig } from './configBridge.js';
import { registerCompileCommand } from './compiler.js';
import { registerSyntaxSchemeCommands, applySchemeOnActivate, cleanupThemeCustomizations } from './themes.js';
import { registerIncludesContainer } from './includeTree.js';
import { registerServerControls } from './server.js';
import { msg } from './nls.js';
import { registerWhatsNew } from './whatsNew.js';
import { suggestIconTheme } from './recommendIconTheme.js';
import { registerColorProvider } from './colorProvider.js';
import { registerHelpView } from './helpView.js';
import { registerTemplates } from './templates.js';
import { startLspClient, stopLspClient, restartLspClient } from './lspClient.js';
import { onNotification, startCore, stopCore } from '../core/client.js';
import { logError, logInfo, logWarn } from '../core/logger.js';
import { applyLoggingFromConfig, registerDiagnosticsCommands } from './diagnosticsView.js';
import { resolveSdkFile } from '../core/includes.js';
import { activateStatusBar } from './statusBar.js';
import { registerSettingsView } from './settingsView.js';
import { registerStoreView } from './storeView.js';
import { registerDebugAdapter } from './debugAdapter.js';

export async function activate(context: vscode.ExtensionContext) {
  try {
    // O core primeiro: é ele que responde sobre processos, portas, RCON e
    // compilador. Sem ele a extensão ainda abre, só sem essas respostas.
    const coreUp = startCore(context.extensionPath);
    watchSubsystems();

    const { config, state, ready } = activateConfigBridge(context);

    // Debugger (tipo `pawn`) registrado CEDO, antes de qualquer `await` que
    // possa atrasar/abortar a ativação — senão o provider de debug não estaria
    // pronto quando o usuário aperta F5. Ele só lê a configuração ao iniciar a
    // sessão, então pode vir antes da carga. Isolado: falha aqui não derruba o
    // resto.
    try {
      registerDebugAdapter(context, config, getWorkspaceRoot);
    } catch (e) {
      console.error('[PawnPro] falha ao registrar o debugger:', e);
    }

    // O resto lê a configuração ao registrar: espera o núcleo entregá-la. A
    // espera tem prazo próprio, e sem resposta seguem os padrões.
    const configLoaded = await ready;

    // O registro antes de tudo o mais: o que interessa diagnosticar costuma
    // acontecer justamente durante a ativação.
    applyLoggingFromConfig(config, getWorkspaceRoot());
    registerDiagnosticsCommands(context, config, getWorkspaceRoot);
    logInfo('activate', `PawnPro ${context.extension.packageJSON.version} ativando`);
    if (coreUp && configLoaded) {
      logInfo('activate', 'núcleo iniciado');
      if (config.rejectedKeys.length > 0) {
        logWarn('config', `valor de tipo inválido ignorado: ${config.rejectedKeys.join(', ')}`);
      }
    } else {
      logError(
        'activate',
        coreUp
          ? 'o núcleo não entregou a configuração — seguem os padrões, sem gravação'
          : 'núcleo não encontrado — configuração, IntelliSense, servidor e compilação indisponíveis',
      );
      void vscode.window.showWarningMessage(msg.extension.coreMissing());
    }
    context.subscriptions.push(
      config.onChange(() => applyLoggingFromConfig(config, getWorkspaceRoot())),
    );

    registerCompileCommand(context, config);
    registerSyntaxSchemeCommands(context, config);
    void applySchemeOnActivate(context, config);
    registerIncludesContainer(context, config);
    registerServerControls(context, config, state);
    registerWhatsNew(context, config);
    suggestIconTheme(context);
    registerHelpView(context, config);
    registerTemplates(context);
    registerColorProvider(context);

    context.subscriptions.push(
      vscode.commands.registerCommand('pawnpro.clearEngineCache', async () => {
        await restartLspClient();
        vscode.window.showInformationMessage(msg.extension.cacheCleaned());
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('pawnpro.recoverConfig', async () => {
        const result = await recoverLargeConfig();
        if (!result) {
          vscode.window.showInformationMessage(msg.naming.recoverNothing());
          return;
        }
        vscode.window.showInformationMessage(
          result.backup
            ? msg.naming.recoverDoneBackup(result.removed, result.backup)
            : msg.naming.recoverDone(result.removed),
        );
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

    const cfg = config.getAll();
    const sdkPlatform = cfg.analysis.sdk.platform;
    // Avisa apenas quando o usuário escolheu explicitamente omp ou samp+filePath
    // e o arquivo não foi encontrado. 'auto' nunca avisa — ausência de open.mp.inc
    // simplesmente significa SA-MP, o que é esperado.
    const mayWarn =
      sdkPlatform === 'omp' || (sdkPlatform === 'samp' && !!cfg.analysis.sdk.filePath);
    if (mayWarn) {
      // Quem resolve é o núcleo, com o mesmo cálculo que entrega o SDK à
      // engine: o aviso diz o que a análise de fato usa. Sem `await`: a
      // resposta não pode atrasar os registros abaixo, e sem núcleo não há o
      // que afirmar sobre o SDK.
      void resolveSdkFile().then(
        (resolved) => {
          if (!resolved) {
            void vscode.window.showWarningMessage(msg.extension.sdkFileNotFound(sdkPlatform));
          }
        },
        () => undefined,
      );
    }

    registerSettingsView(context, config);
    registerStoreView(context, config);
    activateStatusBar(context, config);

    // O LSP por último, e sem `await`: subir a engine passa por uma conversa
    // com o core, e a ativação não pode ficar refém dela. Quando isto estava
    // no meio do `activate`, uma resposta que não vinha deixava a tela de
    // configurações, a loja e a barra de status sem registrar — e o editor não
    // dava nenhum sinal de que a ativação tinha parado no meio.
    logInfo('activate', 'registros concluídos; subindo o IntelliSense');
    void startLspClient(context, config, ws).catch((err: unknown) => {
      const detail = err instanceof Error ? err.message : String(err);
      logError('lsp', `falha ao iniciar o IntelliSense: ${detail}`);
      console.error('[PawnPro] falha ao iniciar o IntelliSense:', err);
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logError('activate', `a ativação parou: ${message}`);
    vscode.window.showErrorMessage(msg.extension.activationError(message));
    throw err;
  }
}

/**
 * O supervisor do core avisa quando um subsistema cai, reinicia ou desiste.
 * Sem isto, a engine parar de responder seria silencioso para o usuário.
 */
function watchSubsystems(): void {
  onNotification('core.subsystemStatus', (params) => {
    const status = params as { subsystem?: string; health?: string; restarts?: number };
    if (status.subsystem !== 'engine') return;
    if (status.health === 'failed') {
      logError('supervisor', 'a engine desistiu de subir');
      void vscode.window.showErrorMessage(msg.extension.engineFailed());
    } else if (status.health === 'running' && (status.restarts ?? 0) > 0) {
      logWarn('supervisor', `a engine voltou depois de ${status.restarts ?? 0} queda(s)`);
      void vscode.window.showWarningMessage(msg.extension.engineRestarted(status.restarts ?? 0));
    }
  });
}

export async function deactivate() {
  await stopLspClient();
  // Fechar o stdin é como o core encerra: ele para a engine e apaga o soquete
  // antes de sair.
  stopCore();
  void cleanupThemeCustomizations();
}
