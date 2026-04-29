import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PawnProConfigManager } from '../core/config.js';
import { PawnProStateManager } from '../core/state.js';
import { sendConfigurationToEngine } from './lspClient.js';

let configManager: PawnProConfigManager | undefined;
let stateManager: PawnProStateManager | undefined;

export function getConfig(): PawnProConfigManager {
  if (!configManager) throw new Error('PawnPro config not initialized');
  return configManager;
}


export function getWorkspaceRoot(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
}

export function activateConfigBridge(
  context: vscode.ExtensionContext,
): { config: PawnProConfigManager; state: PawnProStateManager } {
  const projectRoot = getWorkspaceRoot();

  configManager = new PawnProConfigManager(projectRoot);
  stateManager = new PawnProStateManager(projectRoot);

  context.subscriptions.push(
    configManager.onChange(() => sendConfigurationToEngine(configManager!, projectRoot)),
  );

  if (projectRoot) {
    const pattern = new vscode.RelativePattern(projectRoot, '.pawnpro/config.json');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const reload = () => configManager?.reload();
    watcher.onDidCreate(reload);
    watcher.onDidChange(reload);
    watcher.onDidDelete(reload);
    context.subscriptions.push(watcher);
  }

  const globalPath = configManager.globalConfigPath;
  try {
    const dir = path.dirname(globalPath);
    if (fs.existsSync(dir)) {
      const fsWatcher = fs.watch(dir, (_: string, filename: string | null) => {
        if (filename === 'config.json') configManager?.reload();
      });
      context.subscriptions.push({ dispose: () => fsWatcher.close() });
    }
  } catch {
    // diretório global pode não existir ainda
  }

  if (projectRoot) {
    const statePattern = new vscode.RelativePattern(projectRoot, '.pawnpro/state.json');
    const stateWatcher = vscode.workspace.createFileSystemWatcher(statePattern);
    stateWatcher.onDidChange(() => stateManager?.load());
    context.subscriptions.push(stateWatcher);
  }

  return { config: configManager, state: stateManager };
}
