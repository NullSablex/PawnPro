import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

// Só precisamos do regex de natives para detalhar os itens filhos
const NATIVE_RX  = /^\s*(?:forward\s+)?native\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*;/gm;

type GetIncludePaths = () => Promise<string[]>;

abstract class BaseItem extends vscode.TreeItem {
  abstract readonly kind: 'include' | 'native';
}

class IncludeItem extends BaseItem {
  readonly kind = 'include' as const;
  constructor(public readonly filePath: string) {
    super(path.basename(filePath), vscode.TreeItemCollapsibleState.Collapsed);

    const showPaths = vscode.workspace.getConfiguration()
      .get<boolean>('pawnpro.showIncludePaths', false); // ← padrão desativado
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
    public readonly line: number
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
            new vscode.Position(line, 0)
          ),
        },
      ],
    };
    this.tooltip = `${name}(${signature}) — ${vscode.workspace.asRelativePath(filePath)}:${line + 1}`;
  }
}

// —— Tipos auxiliares —— //
type Item = IncludeItem | NativeItem;
function isIncludeItem(node: Item): node is IncludeItem {
  return node.kind === 'include';
}

export class IncludesTreeProvider implements vscode.TreeDataProvider<Item> {
  private _onDidChangeTreeData = new vscode.EventEmitter<Item | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly getIncludePaths: GetIncludePaths) {}

  refresh(): void { this._onDidChangeTreeData.fire(); }

  getTreeItem(el: Item) { return el; }

  async getChildren(el?: Item): Promise<Item[]> {
    if (!el) {
      const root = await this.pickIncludeRoot();
      if (!root) return [];
      const incs = await this.listIncFilesRecursive(root);
      const uniq = [...new Set(incs)].sort((a, b) => a.localeCompare(b));
      return uniq.map(fp => new IncludeItem(fp));
    }
    if (isIncludeItem(el)) {
      return this.listNatives(el.filePath);
    }
    return [];
  }

  /** Escolhe APENAS UMA pasta de include: a primeira existente dentre as configuradas. */
  private async pickIncludeRoot(): Promise<string | undefined> {
    const includePaths = await this.getIncludePaths();
    for (const dir of includePaths) {
      try {
        const st = await fs.stat(dir);
        if (st.isDirectory()) return dir;
      } catch { /* ignore */ }
    }
    return undefined;
  }

  /** Lista todos os .inc (recursivo) dentro do diretório raiz de includes. */
  private async listIncFilesRecursive(root: string): Promise<string[]> {
    const out: string[] = [];
    async function walk(dir: string) {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          // Ignorar pastas comuns que não interessam
          if (e.name === 'node_modules' || e.name === '.git' || e.name === '.vscode') continue;
          await walk(p);
        } else if (e.isFile() && e.name.toLowerCase().endsWith('.inc')) {
          out.push(p);
        }
      }
    }
    await walk(root);
    return out;
  }

  private async listNatives(filePath: string): Promise<Item[]> {
    let text = '';
    try {
      const buf = await fs.readFile(filePath);
      text = Buffer.from(buf).toString('utf8');
    } catch {
      return [];
    }

    // 🔧 reset da regex global
    NATIVE_RX.lastIndex = 0;

    // mapa de offsets de linha
    const lineOffsets: number[] = [0];
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineOffsets.push(i + 1);
    const posToLine = (pos: number) => {
      let lo = 0, hi = lineOffsets.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        if (lineOffsets[mid] <= pos) lo = mid + 1; else hi = mid - 1;
      }
      return Math.max(0, lo - 1);
    };

    const out: NativeItem[] = [];
    let m: RegExpExecArray | null;
    while ((m = NATIVE_RX.exec(text))) {
      const name = m[1];
      const params = (m[2] ?? '').trim();
      out.push(new NativeItem(name, params, filePath, posToLine(m.index)));
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }
}

export function registerIncludesContainer(
  context: vscode.ExtensionContext,
  getIncludePaths: GetIncludePaths
) {
  const provider = new IncludesTreeProvider(getIncludePaths);

  // View no container PawnPro
  const viewContainer = vscode.window.createTreeView('pawnpro.includesView', {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  context.subscriptions.push(viewContainer);

  // View no Explorer
  const viewExplorer = vscode.window.createTreeView('pawnpro.includesView.explorer', {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  context.subscriptions.push(viewExplorer);

  // Auto-refresh: qualquer .inc alterado
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.inc');
  watcher.onDidCreate(() => provider.refresh());
  watcher.onDidChange(() => provider.refresh());
  watcher.onDidDelete(() => provider.refresh());
  context.subscriptions.push(watcher);

  // Refresh em mudanças de configuração relevantes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (
        e.affectsConfiguration('pawnpro.includePaths') ||
        e.affectsConfiguration('pawnpro.showIncludePaths') // ← exibe/oculta caminhos
      ) {
        provider.refresh();
      }
    })
  );

  // Refresh quando pastas do workspace mudarem (abrir/fechar/adicionar)
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => provider.refresh())
  );

  provider.refresh(); // primeiro load
}
