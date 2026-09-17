import * as vscode from 'vscode';
import { detectPawncc, buildCompileArgs, runCompile } from '../core/compiler.js';
import { PawnProConfigManager } from '../core/config.js';
import { getWorkspaceRoot } from './configBridge.js';
import { msg } from './nls.js';
import { logError, logInfo } from '../core/logger.js';

let buildChannel: vscode.OutputChannel | undefined;
function getBuildChannel(context: vscode.ExtensionContext): vscode.OutputChannel {
  if (!buildChannel) {
    buildChannel = vscode.window.createOutputChannel('Pawn Build');
    context.subscriptions.push(buildChannel);
  }
  return buildChannel;
}

const compilingFiles = new Set<string>();

export function registerCompileCommand(
  context: vscode.ExtensionContext,
  config: PawnProConfigManager,
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('pawnpro.detectCompiler', async () => {
      try {
        const cfg = config.getAll();
        const ws = getWorkspaceRoot();
        const exe = await detectPawncc(cfg.compiler.path || undefined, cfg.compiler.autoDetect, ws);
        await config.setKey('compiler.path', exe, 'project');
        vscode.window.showInformationMessage(msg.compiler.detected(exe));
      } catch (err: unknown) {
        vscode.window.showErrorMessage(err instanceof Error ? err.message : String(err));
      }
    }),
  );

  const cmd = vscode.commands.registerCommand('pawnpro.compileCurrent', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'pawn') {
      vscode.window.showWarningMessage(msg.compiler.notPawnFile());
      return;
    }

    const filePath = editor.document.fileName;
    const baseName = filePath.split(/[\\/]/).pop() || filePath;

    if (compilingFiles.has(filePath)) {
      vscode.window.showWarningMessage(msg.compiler.alreadyCompiling(baseName));
      return;
    }

    compilingFiles.add(filePath);

    try {
      await editor.document.save();

      const channel = getBuildChannel(context);
      channel.clear();
      channel.show(true);

      const cfg = config.getAll();

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: msg.compiler.compiling(baseName),
          cancellable: false,
        },
        async () => {
          const { args: compileArgs, presetArgs } = await buildCompileArgs({ filePath });

          for (const flag of compileArgs.removedFlags) {
            channel.appendLine(`[PawnPro] Removendo flag não suportada para este pawncc: ${flag}`);
          }

          // O núcleo montou com o preset porque a configuração não trazia
          // argumentos; gravá-lo deixa à vista o que passou a valer.
          if (presetArgs) {
            await config.setKey('compiler.args', presetArgs, 'project');
            channel.appendLine(`[PawnPro] Nenhum argumento configurado. Aplicando preset mínimo: ${presetArgs.join(' ')}`);
          }

          if (cfg.build.showCommand) {
            const show = (s: string) => (/\s/.test(s) ? `"${s}"` : s);
            channel.appendLine(`[PawnPro] cwd=${compileArgs.cwd}`);
            channel.appendLine(`[PawnPro] ${show(compileArgs.exe)} ${compileArgs.args.map(show).join(' ')}`);
          }

          logInfo('compiler', `compilando ${baseName} com ${compileArgs.exe} ${compileArgs.args.join(' ')}`);
          const result = await runCompile(compileArgs.exe, compileArgs.args, compileArgs.cwd);

          channel.append(result.output);

          if (result.exitCode === 0) {
            logInfo('compiler', `${baseName} compilado`);
            vscode.window.showInformationMessage(msg.compiler.success(baseName));
          } else {
            logError('compiler', `${baseName} falhou (código ${result.exitCode})`);
            vscode.window.showErrorMessage(msg.compiler.failed(baseName));
          }
        },
      );
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      logError('compiler', `a compilação não chegou a rodar: ${detail}`);
      vscode.window.showErrorMessage(`${msg.compiler.compilerNotFound('')}: ${detail}`);
    } finally {
      compilingFiles.delete(filePath);
    }
  });

  context.subscriptions.push(cmd);
}
