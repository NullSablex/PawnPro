import * as vscode from 'vscode';
import * as path from 'path';
import type { PawnProConfigManager } from '../core/config.js';
import { configureLogging, logLevel, type LogLevel } from '../core/logger.js';
import { coreIsRunning, request } from '../core/client.js';
import { msg } from './nls.js';

/**
 * Os comandos do registro de diagnóstico.
 *
 * O nível vive no `config.json` do projeto (`diagnostics.level`), para valer
 * entre sessões e poder ser lido pelo core. Estes comandos existem para o
 * usuário não precisar editar o arquivo à mão quando quiser investigar algo.
 */

const LEVELS: LogLevel[] = ['off', 'error', 'warn', 'info'];

/** Aplica ao core e à extensão o nível que está na configuração. */
export function applyLoggingFromConfig(config: PawnProConfigManager, root: string): void {
  const level = normalize(config.getAll().diagnostics?.level);
  configureLogging(root, level);
  if (coreIsRunning() && root) {
    void request('log.configure', { workspaceRoot: root, level }).catch(() => {
      /* sem core, o registro local já está valendo */
    });
  }
}

function normalize(value: unknown): LogLevel {
  const name = typeof value === 'string' ? value.toLowerCase() : '';
  return (LEVELS as string[]).includes(name) ? (name as LogLevel) : 'off';
}

export function registerDiagnosticsCommands(
  context: vscode.ExtensionContext,
  config: PawnProConfigManager,
  workspaceRoot: () => string,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('pawnpro.diagnostics.setLevel', async () => {
      const current = logLevel();
      const pick = await vscode.window.showQuickPick(
        LEVELS.map((level) => ({
          label: msg.diagnostics.levelLabel(level),
          description: level === current ? msg.diagnostics.levelCurrent() : '',
          level,
        })),
        { title: msg.diagnostics.pickTitle() },
      );
      if (!pick) return;

      await config.setKey('diagnostics.level', pick.level, 'project');
      applyLoggingFromConfig(config, workspaceRoot());
      void vscode.window.showInformationMessage(msg.diagnostics.levelSet(pick.level));
    }),

    vscode.commands.registerCommand('pawnpro.diagnostics.openLog', async () => {
      const root = workspaceRoot();
      if (!root) {
        void vscode.window.showWarningMessage(msg.diagnostics.noWorkspace());
        return;
      }
      const file = path.join(root, '.pawnpro', 'logs', 'pawnpro.log');
      try {
        const doc = await vscode.workspace.openTextDocument(file);
        await vscode.window.showTextDocument(doc);
      } catch {
        // Não existir é o esperado enquanto o registro está desligado.
        void vscode.window.showInformationMessage(msg.diagnostics.emptyLog());
      }
    }),

    vscode.commands.registerCommand('pawnpro.diagnostics.clear', async () => {
      const root = workspaceRoot();
      if (!root) return;
      if (coreIsRunning()) {
        await request('log.clear', { workspaceRoot: root }).catch(() => undefined);
      }
      void vscode.window.showInformationMessage(msg.diagnostics.cleared());
    }),
  );
}
