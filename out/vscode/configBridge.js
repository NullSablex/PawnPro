import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PawnProConfigManager } from '../core/config.js';
import { PawnProStateManager } from '../core/state.js';
let configManager;
let stateManager;
export function getConfig() {
    if (!configManager)
        throw new Error('PawnPro config not initialized');
    return configManager;
}
export function getState() {
    if (!stateManager)
        throw new Error('PawnPro state not initialized');
    return stateManager;
}
export function getWorkspaceRoot() {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
}
function syncSeparateContainer(cfg) {
    const current = vscode.workspace.getConfiguration()
        .get('pawnpro.ui.separateContainer');
    if (current !== cfg.ui.separateContainer) {
        void vscode.workspace.getConfiguration().update('pawnpro.ui.separateContainer', cfg.ui.separateContainer, vscode.ConfigurationTarget.Global);
    }
}
async function migrateFromVsCodeSettings(projectRoot, config, state, context) {
    if (config.hasProjectConfig())
        return;
    const cfg = vscode.workspace.getConfiguration();
    const partial = {};
    let hasValues = false;
    const migrate = (vsKey, section, key, defaultVal) => {
        const val = cfg.get(vsKey);
        if (val !== undefined && val !== defaultVal) {
            if (!partial[section])
                partial[section] = {};
            partial[section][key] = val;
            hasValues = true;
        }
    };
    const migrateFlat = (vsKey, key, defaultVal) => {
        const val = cfg.get(vsKey);
        if (val !== undefined && val !== defaultVal) {
            partial[key] = val;
            hasValues = true;
        }
    };
    migrate('pawnpro.compiler.path', 'compiler', 'path', '');
    migrate('pawnpro.compiler.args', 'compiler', 'args', []);
    migrate('pawnpro.compiler.autoDetect', 'compiler', 'autoDetect', true);
    migrateFlat('pawnpro.includePaths', 'includePaths', ['${workspaceFolder}/pawno/include']);
    migrate('pawnpro.output.encoding', 'output', 'encoding', 'windows1252');
    migrate('pawnpro.build.showCommand', 'build', 'showCommand', false);
    migrate('pawnpro.syntax.scheme', 'syntax', 'scheme', 'none');
    migrate('pawnpro.syntax.applyOnStartup', 'syntax', 'applyOnStartup', false);
    migrate('pawnpro.ui.separateContainer', 'ui', 'separateContainer', false);
    migrateFlat('pawnpro.showIncludePaths', 'showIncludePaths', false);
    migrate('pawnpro.server.path', 'server', 'path', '');
    migrate('pawnpro.server.cwd', 'server', 'cwd', '${workspaceFolder}');
    migrate('pawnpro.server.args', 'server', 'args', []);
    migrate('pawnpro.server.clearOnStart', 'server', 'clearOnStart', true);
    migrate('pawnpro.server.logPath', 'server', 'logPath', '${workspaceFolder}/server_log.txt');
    migrate('pawnpro.server.logEncoding', 'server', 'logEncoding', 'windows1252');
    migrate('pawnpro.server.output.follow', 'server', 'follow', 'visible');
    // Migrate workspaceState
    const favorites = context.workspaceState.get('pawnpro.server.favorites');
    const history = context.workspaceState.get('pawnpro.server.history');
    if ((favorites && favorites.length > 0) || (history && history.length > 0)) {
        state.update('server', {
            favorites: favorites ?? [],
            history: history ?? [],
        });
        hasValues = true;
    }
    if (hasValues) {
        const dir = path.dirname(config.projectConfigPath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(config.projectConfigPath, JSON.stringify(partial, null, 2) + '\n', 'utf8');
        config.reload();
        vscode.window.showInformationMessage('PawnPro: Settings migrated to .pawnpro/config.json');
    }
}
export function activateConfigBridge(context) {
    const projectRoot = getWorkspaceRoot();
    configManager = new PawnProConfigManager(projectRoot);
    stateManager = new PawnProStateManager(projectRoot);
    // Sync separateContainer to VS Code for when clauses
    syncSeparateContainer(configManager.getAll());
    configManager.onChange((cfg) => syncSeparateContainer(cfg));
    // Watch project .pawnpro/config.json
    if (projectRoot) {
        const pattern = new vscode.RelativePattern(projectRoot, '.pawnpro/config.json');
        const watcher = vscode.workspace.createFileSystemWatcher(pattern);
        const reload = () => configManager?.reload();
        watcher.onDidCreate(reload);
        watcher.onDidChange(reload);
        watcher.onDidDelete(reload);
        context.subscriptions.push(watcher);
    }
    // Watch global ~/.pawnpro/config.json
    const globalPath = configManager.globalConfigPath;
    try {
        const dir = path.dirname(globalPath);
        if (fs.existsSync(dir)) {
            const fsWatcher = fs.watch(dir, (_, filename) => {
                if (filename === 'config.json')
                    configManager?.reload();
            });
            context.subscriptions.push({ dispose: () => fsWatcher.close() });
        }
    }
    catch {
        // Global config dir doesn't exist yet, that's OK
    }
    // Watch .pawnpro/state.json for external changes
    if (projectRoot) {
        const statePattern = new vscode.RelativePattern(projectRoot, '.pawnpro/state.json');
        const stateWatcher = vscode.workspace.createFileSystemWatcher(statePattern);
        const reloadState = () => stateManager?.load();
        stateWatcher.onDidChange(reloadState);
        context.subscriptions.push(stateWatcher);
    }
    // Migration from VS Code settings (async, best-effort)
    void migrateFromVsCodeSettings(projectRoot, configManager, stateManager, context);
    return { config: configManager, state: stateManager };
}
//# sourceMappingURL=configBridge.js.map