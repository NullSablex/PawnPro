import * as vscode from 'vscode';
import * as path from 'path';
import { listIncFilesRecursive, listNatives, buildIncludePaths } from '../core/includes.js';
import { PawnProConfigManager } from '../core/config.js';
import { getWorkspaceRoot } from './configBridge.js';

/* ─── Tree items ────────────────────────────────────────────────── */

abstract class BaseItem extends vscode.TreeItem {
  abstract readonly kind: 'include' | 'native';
}

class IncludeItem extends BaseItem {
  readonly kind = 'include' as const;
  constructor(
    public readonly filePath: string,
    showPaths: boolean,
  ) {
    super(path.basename(filePath), vscode.TreeItemCollapsibleState.Collapsed);
    this.description = showPaths ? vscode.workspace.asRelativePath(filePath) : undefined;
    this.resourceUri = vscode.Uri.file(filePath);
    this.iconPath = new vscode.ThemeIcon('file-code');
    this.tooltip = vscode.workspace.asRelativePath(filePath);
  }
}

class NativeItem extends BaseItem {
  readonly kind = 'native' as const;
  constructor(
    public readonly name: string,
    public readonly signature: string,
    public readonly filePath: string,
    public readonly line: number,
  ) {
    super(name, vscode.TreeItemCollapsibleState.None);
    this.description = signature;
    this.iconPath = new vscode.ThemeIcon('symbol-method');
    this.command = {
      command: 'vscode.open',
      title: 'Open',
      arguments: [
        vscode.Uri.file(filePath),
        <vscode.TextDocumentShowOptions>{
          preview: true,
          selection: new vscode.Range(
            new vscode.Position(line, 0),
            new vscode.Position(line, 0),
          ),
        },
      ],
    };
    this.tooltip = `${name}(${signature}) — ${vscode.workspace.asRelativePath(filePath)}:${line + 1}`;
  }
}

type Item = IncludeItem | NativeItem;
function isIncludeItem(node: Item): node is IncludeItem {
  return node.kind === 'include';
}

/* ─── Tree data provider ────────────────────────────────────────── */

class IncludesTreeProvider implements vscode.TreeDataProvider<Item> {
  private _onDidChangeTreeData = new vscode.EventEmitter<Item | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly config: PawnProConfigManager) {}

  refresh(): void { this._onDidChangeTreeData.fire(); }

  getTreeItem(el: Item) { return el; }

  async getChildren(el?: Item): Promise<Item[]> {
    if (!el) {
      const root = await this.pickIncludeRoot();
      if (!root) return [];
      const incs = await listIncFilesRecursive(root);
      const uniq = [...new Set(incs)].sort((a, b) => a.localeCompare(b));
      const showPaths = this.config.getAll().ui.showIncludePaths;
      return uniq.map(fp => new IncludeItem(fp, showPaths));
    }
    if (isIncludeItem(el)) {
      const entries = await listNatives(el.filePath);
      return entries.map(e => new NativeItem(e.name, e.signature, e.filePath, e.line));
    }
    return [];
  }

  private async pickIncludeRoot(): Promise<string | undefined> {
    const cfg = this.config.getAll();
    const ws = getWorkspaceRoot();
    const paths = buildIncludePaths(cfg, ws);
    for (const dir of paths) {
      try {
        const { statSync } = await import('fs');
        if (statSync(dir).isDirectory()) return dir;
      } catch { /* ignore */ }
    }
    return undefined;
  }
}

/* ─── Registration ──────────────────────────────────────────────── */

export function registerIncludesContainer(
  context: vscode.ExtensionContext,
  config: PawnProConfigManager,
) {
  const provider = new IncludesTreeProvider(config);

  const viewContainer = vscode.window.createTreeView('pawnpro.includesView', {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  context.subscriptions.push(viewContainer);

  const viewExplorer = vscode.window.createTreeView('pawnpro.includesView.explorer', {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  context.subscriptions.push(viewExplorer);

  // Auto-refresh on .inc file changes
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.inc');
  watcher.onDidCreate(() => provider.refresh());
  watcher.onDidChange(() => provider.refresh());
  watcher.onDidDelete(() => provider.refresh());
  context.subscriptions.push(watcher);

  // Refresh on config changes
  config.onChange(() => provider.refresh());

  // Refresh when workspace folders change
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => provider.refresh()),
  );

  provider.refresh();
}
