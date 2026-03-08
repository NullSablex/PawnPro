import * as vscode from 'vscode';
import { isPawnFile } from '../core/utils.js';
import { detectPawncc, buildCompileArgs, runCompile } from '../core/compiler.js';
import { computeMinimalArgs, detectSupportedFlags } from '../core/flags.js';
import { PawnProConfigManager } from '../core/config.js';
import { getWorkspaceRoot } from './configBridge.js';

let buildChannel: vscode.OutputChannel | undefined;
function getBuildChannel(context: vscode.ExtensionContext): vscode.OutputChannel {
  if (!buildChannel) {
    buildChannel = vscode.window.createOutputChannel('Pawn Build');
    context.subscriptions.push(buildChannel);
  }
  return buildChannel;
}

export function registerCompileCommand(
  context: vscode.ExtensionContext,
  config: PawnProConfigManager,
) {
  // Command: detect compiler
  context.subscriptions.push(
    vscode.commands.registerCommand('pawnpro.detectCompiler', async () => {
      try {
        const cfg = config.getAll();
        const ws = getWorkspaceRoot();
        const exe = detectPawncc(cfg.compiler.path || undefined, cfg.compiler.autoDetect, ws);
        config.setKey('compiler.path', exe, 'project');
        vscode.window.showInformationMessage(`pawncc detectado: ${exe}`);
      } catch (e: any) {
        vscode.window.showErrorMessage(e?.message || String(e));
      }
    }),
  );

  // Command: compile current file
  const cmd = vscode.commands.registerCommand('pawnpro.compileCurrent', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !isPawnFile(editor.document.fileName)) {
      vscode.window.showWarningMessage('Abra um arquivo .pwn para compilar.');
      return;
    }
    await editor.document.save();

    const channel = getBuildChannel(context);
    channel.clear();
    channel.show(true);

    const cfg = config.getAll();
    const ws = getWorkspaceRoot();

    try {
      const compileArgs = buildCompileArgs({
        config: cfg,
        filePath: editor.document.fileName,
        workspaceRoot: ws,
      });

      // Log removed flags
      for (const flag of compileArgs.removedFlags) {
        channel.appendLine(`[PawnPro] Removendo flag nao suportada para este pawncc: ${flag}`);
      }

      // If compiler.args was empty, we used a preset - save it
      if (cfg.compiler.args.length === 0) {
        const exe = detectPawncc(cfg.compiler.path || undefined, cfg.compiler.autoDetect, ws);
        const supported = detectSupportedFlags(exe);
        const preset = computeMinimalArgs(supported);
        config.setKey('compiler.args', preset, 'project');
        channel.appendLine(`[PawnPro] Nenhum argumento configurado. Aplicando preset minimo: ${preset.join(' ')}`);
      }

      // Log command if configured
      if (cfg.build.showCommand) {
        const show = (s: string) => (/\s/.test(s) ? `"${s}"` : s);
        channel.appendLine(`[PawnPro] cwd=${compileArgs.cwd}`);
        channel.appendLine(`[PawnPro] ${show(compileArgs.exe)} ${compileArgs.args.map(show).join(' ')}`);
      }

      // Run compilation
      const result = await runCompile(
        compileArgs.exe,
        compileArgs.args,
        compileArgs.cwd,
        cfg.output.encoding,
      );

      channel.append(result.output);

      if (result.exitCode === 0) {
        vscode.window.showInformationMessage('Compilado com sucesso.');
      } else {
        vscode.window.showErrorMessage(
          `Compilacao falhou. code=${result.exitCode ?? 'null'} signal=${result.signal ?? 'none'}`,
        );
      }
    } catch (e: any) {
      vscode.window.showErrorMessage(`Falha ao iniciar pawncc: ${e?.message || e}`);
    }
  });

  context.subscriptions.push(cmd);
}
