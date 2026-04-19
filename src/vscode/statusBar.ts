import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { PawnProConfigManager } from '../core/config.js';
import { msg } from './nls.js';
import { restartLspClient } from './lspClient.js';

let statusBarItem: vscode.StatusBarItem | undefined;

export function activateStatusBar(
  context: vscode.ExtensionContext,
  config: PawnProConfigManager,
): void {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.text = '$(bracket-dot) PawnPro';
  statusBarItem.tooltip = msg.statusBar.tooltip(msg.statusBar.modeRust());
  statusBarItem.command = 'pawnpro.statusBarMenu';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('pawnpro.statusBarMenu', () => showStatusBarMenu(config)),
  );
}

// ─── Menu ────────────────────────────────────────────────────────────────────

type MenuItem = vscode.QuickPickItem & { action: () => Promise<void> | void };

function cmd(label: string, command: string, args?: unknown): MenuItem {
  return { label, action: () => { void vscode.commands.executeCommand(command, args); } };
}

function sep(label: string): MenuItem {
  return { label, kind: vscode.QuickPickItemKind.Separator, action: () => {} };
}

async function showStatusBarMenu(config: PawnProConfigManager): Promise<void> {
  const items: MenuItem[] = [
    {
      label: `$(sync) ${msg.statusBar.restartEngine()}`,
      detail: msg.statusBar.restartEngineDetail(),
      action: async () => {
        await restartLspClient();
        vscode.window.showInformationMessage(msg.statusBar.engineRestarted());
      },
    },
    {
      label: `$(file-code) ${msg.statusBar.openConfig()}`,
      detail: msg.statusBar.openConfigDetail(),
      action: () => openProjectConfig(),
    },

    sep(msg.statusBar.sectionServer()),
    cmd(`$(play) ${msg.statusBar.serverStart()}`,   'pawnpro.server.start'),
    cmd(`$(debug-stop) ${msg.statusBar.serverStop()}`,    'pawnpro.server.stop'),
    cmd(`$(debug-restart) ${msg.statusBar.serverRestart()}`, 'pawnpro.server.restart'),
    {
      label: `$(settings-gear) ${msg.statusBar.editServerCfg()}`,
      detail: msg.statusBar.editServerCfgDetail(),
      action: () => openServerCfg(config),
    },

    sep(msg.statusBar.sectionTemplates()),
    cmd(`$(file-add) ${msg.statusBar.newGamemode()}`,     'pawnpro.newScript', 'gamemode'),
    cmd(`$(file-add) ${msg.statusBar.newFilterscript()}`, 'pawnpro.newScript', 'filterscript'),
    cmd(`$(file-add) ${msg.statusBar.newInclude()}`,      'pawnpro.newScript', 'include'),
  ];

  const picked = await vscode.window.showQuickPick(items, {
    title: msg.statusBar.menuTitle(),
    placeHolder: '',
  });

  if (picked) await picked.action();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function openProjectConfig(): void {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    vscode.window.showWarningMessage(msg.statusBar.configNotFound());
    return;
  }

  const configPath = path.join(root, '.pawnpro', 'config.json');
  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, '{}\n', 'utf8');
  }

  void vscode.window.showTextDocument(vscode.Uri.file(configPath));
}

function openServerCfg(config: PawnProConfigManager): void {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    vscode.window.showWarningMessage(msg.statusBar.configNotFound());
    return;
  }

  const cfg = config.getAll();
  const cwd = cfg.server.cwd.replace('${workspaceFolder}', root);

  // OMP usa config.json, SA-MP usa server.cfg
  const ompCfg  = path.join(cwd, 'config.json');
  const sampCfg = path.join(cwd, 'server.cfg');

  const cfgPath = cfg.server.type === 'omp'
    ? ompCfg
    : cfg.server.type === 'samp'
      ? sampCfg
      : (fs.existsSync(ompCfg) ? ompCfg : sampCfg);

  if (!fs.existsSync(cfgPath)) {
    vscode.window.showWarningMessage(msg.statusBar.serverCfgNotFound(cfgPath));
    return;
  }

  void vscode.window.showTextDocument(vscode.Uri.file(cfgPath));
}
