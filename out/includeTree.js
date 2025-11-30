import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
// Só precisamos do regex de natives para detalhar os itens filhos
const NATIVE_RX = /^\s*(?:forward\s+)?native\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*;/gm;
class BaseItem extends vscode.TreeItem {
}
class IncludeItem extends BaseItem {
    filePath;
    kind = 'include';
    constructor(filePath) {
        super(path.basename(filePath), vscode.TreeItemCollapsibleState.Collapsed);
        this.filePath = filePath;
        const showPaths = vscode.workspace.getConfiguration()
            .get('pawnpro.showIncludePaths', false); // ← padrão desativado
        this.description = showPaths ? vscode.workspace.asRelativePath(filePath) : undefined;
        this.resourceUri = vscode.Uri.file(filePath);
        this.iconPath = new vscode.ThemeIcon('file-code');
        this.tooltip = vscode.workspace.asRelativePath(filePath);
    }
}
class NativeItem extends BaseItem {
    name;
    signature;
    filePath;
    line;
    kind = 'native';
    constructor(name, signature, filePath, line) {
        super(name, vscode.TreeItemCollapsibleState.None);
        this.name = name;
        this.signature = signature;
        this.filePath = filePath;
        this.line = line;
        this.description = signature;
        this.iconPath = new vscode.ThemeIcon('symbol-method');
        this.command = {
            command: 'vscode.open',
            title: 'Open',
            arguments: [
                vscode.Uri.file(filePath),
                {
                    preview: true,
                    selection: new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, 0)),
                },
            ],
        };
        this.tooltip = `${name}(${signature}) — ${vscode.workspace.asRelativePath(filePath)}:${line + 1}`;
    }
}
function isIncludeItem(node) {
    return node.kind === 'include';
}
export class IncludesTreeProvider {
    getIncludePaths;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    constructor(getIncludePaths) {
        this.getIncludePaths = getIncludePaths;
    }
    refresh() { this._onDidChangeTreeData.fire(); }
    getTreeItem(el) { return el; }
    async getChildren(el) {
        if (!el) {
            const root = await this.pickIncludeRoot();
            if (!root)
                return [];
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
    async pickIncludeRoot() {
        const includePaths = await this.getIncludePaths();
        for (const dir of includePaths) {
            try {
                const st = await fs.stat(dir);
                if (st.isDirectory())
                    return dir;
            }
            catch { /* ignore */ }
        }
        return undefined;
    }
    /** Lista todos os .inc (recursivo) dentro do diretório raiz de includes. */
    async listIncFilesRecursive(root) {
        const out = [];
        async function walk(dir) {
            let entries;
            try {
                entries = await fs.readdir(dir, { withFileTypes: true });
            }
            catch {
                return;
            }
            for (const e of entries) {
                const p = path.join(dir, e.name);
                if (e.isDirectory()) {
                    // Ignorar pastas comuns que não interessam
                    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.vscode')
                        continue;
                    await walk(p);
                }
                else if (e.isFile() && e.name.toLowerCase().endsWith('.inc')) {
                    out.push(p);
                }
            }
        }
        await walk(root);
        return out;
    }
    async listNatives(filePath) {
        let text = '';
        try {
            const buf = await fs.readFile(filePath);
            text = Buffer.from(buf).toString('utf8');
        }
        catch {
            return [];
        }
        // 🔧 reset da regex global
        NATIVE_RX.lastIndex = 0;
        // mapa de offsets de linha
        const lineOffsets = [0];
        for (let i = 0; i < text.length; i++)
            if (text[i] === '\n')
                lineOffsets.push(i + 1);
        const posToLine = (pos) => {
            let lo = 0, hi = lineOffsets.length - 1;
            while (lo <= hi) {
                const mid = (lo + hi) >>> 1;
                if (lineOffsets[mid] <= pos)
                    lo = mid + 1;
                else
                    hi = mid - 1;
            }
            return Math.max(0, lo - 1);
        };
        const out = [];
        let m;
        while ((m = NATIVE_RX.exec(text))) {
            const name = m[1];
            const params = (m[2] ?? '').trim();
            out.push(new NativeItem(name, params, filePath, posToLine(m.index)));
        }
        out.sort((a, b) => a.name.localeCompare(b.name));
        return out;
    }
}
export function registerIncludesContainer(context, getIncludePaths) {
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
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('pawnpro.includePaths') ||
            e.affectsConfiguration('pawnpro.showIncludePaths') // ← exibe/oculta caminhos
        ) {
            provider.refresh();
        }
    }));
    // Refresh quando pastas do workspace mudarem (abrir/fechar/adicionar)
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => provider.refresh()));
    provider.refresh(); // primeiro load
}
//# sourceMappingURL=includeTree.js.map