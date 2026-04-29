import * as vscode from 'vscode';
import { detectPawncc, buildCompileArgs, runCompile } from '../core/compiler.js';
import { computeMinimalArgs, detectSupportedFlags } from '../core/flags.js';
import { PawnProConfigManager } from '../core/config.js';
import { getWorkspaceRoot } from './configBridge.js';
import { msg } from './nls.js';

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
        const exe = detectPawncc(cfg.compiler.path || undefined, cfg.compiler.autoDetect, ws);
        config.setKey('compiler.path', exe, 'project');
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
      const ws = getWorkspaceRoot();

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: msg.compiler.compiling(baseName),
          cancellable: false,
        },
        async () => {
          const compileArgs = buildCompileArgs({
            config: cfg,
            filePath,
            workspaceRoot: ws,
          });

          for (const flag of compileArgs.removedFlags) {
            channel.appendLine(`[PawnPro] Removendo flag não suportada para este pawncc: ${flag}`);
          }

          if (cfg.compiler.args.length === 0) {
            const exe = detectPawncc(cfg.compiler.path || undefined, cfg.compiler.autoDetect, ws);
            const supported = detectSupportedFlags(exe);
            const preset = computeMinimalArgs(supported);
            config.setKey('compiler.args', preset, 'project');
            channel.appendLine(`[PawnPro] Nenhum argumento configurado. Aplicando preset mínimo: ${preset.join(' ')}`);
          }

          if (cfg.build.showCommand) {
            const show = (s: string) => (/\s/.test(s) ? `"${s}"` : s);
            channel.appendLine(`[PawnPro] cwd=${compileArgs.cwd}`);
            channel.appendLine(`[PawnPro] ${show(compileArgs.exe)} ${compileArgs.args.map(show).join(' ')}`);
          }

          const result = await runCompile(
            compileArgs.exe,
            compileArgs.args,
            compileArgs.cwd,
            cfg.output.encoding,
          );

          channel.append(result.output);

          if (result.exitCode === 0) {
            vscode.window.showInformationMessage(msg.compiler.success(baseName));
          } else {
            vscode.window.showErrorMessage(msg.compiler.failed(baseName));
          }
        },
      );
    } catch (err: unknown) {
      vscode.window.showErrorMessage(`${msg.compiler.compilerNotFound('')}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      compilingFiles.delete(filePath);
    }
  });

  context.subscriptions.push(cmd);
}
