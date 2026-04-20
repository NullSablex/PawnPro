import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PawnProConfigManager } from '../core/config.js';
import { PawnProStateManager } from '../core/state.js';
import { msg } from './nls.js';
import { sendConfigurationToEngine } from './lspClient.js';

let configManager: PawnProConfigManager | undefined;
let stateManager: PawnProStateManager | undefined;

export function getConfig(): PawnProConfigManager {
  if (!configManager) throw new Error('PawnPro config not initialized');
  return configManager;
}

export function getState(): PawnProStateManager {
  if (!stateManager) throw new Error('PawnPro state not initialized');
  return stateManager;
}

export function getWorkspaceRoot(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
}

// Mapa de chaves VS Code → dot-path no config JSON
const VS_TO_JSON: [string, string][] = [
  ['pawnpro.includePaths',             'includePaths'],
  ['pawnpro.compiler.path',            'compiler.path'],
  ['pawnpro.compiler.args',            'compiler.args'],
  ['pawnpro.compiler.autoDetect',      'compiler.autoDetect'],
  ['pawnpro.output.encoding',          'output.encoding'],
  ['pawnpro.build.showCommand',        'build.showCommand'],
  ['pawnpro.syntax.scheme',            'syntax.scheme'],
  ['pawnpro.syntax.applyOnStartup',    'syntax.applyOnStartup'],
  ['pawnpro.ui.showIncludePaths',      'ui.showIncludePaths'],
  ['pawnpro.analysis.warnUnusedInInc', 'analysis.warnUnusedInInc'],
  ['pawnpro.analysis.sdk.platform',    'analysis.sdk.platform'],
  ['pawnpro.analysis.sdk.filePath',    'analysis.sdk.filePath'],
  ['pawnpro.server.path',              'server.path'],
  ['pawnpro.server.cwd',               'server.cwd'],
  ['pawnpro.server.args',              'server.args'],
  ['pawnpro.server.clearOnStart',      'server.clearOnStart'],
  ['pawnpro.server.logPath',           'server.logPath'],
  ['pawnpro.server.logEncoding',       'server.logEncoding'],
  ['pawnpro.server.output.follow',     'server.output.follow'],
  ['pawnpro.server.type',              'server.type'],
];

// Propaga mudanças da UI do VS Code para ~/.pawnpro/config.json (escopo global)
// e limpa o setting do VS Code para evitar duplicidade.
function propagateVsCodeSettingsToConfig(
  e: vscode.ConfigurationChangeEvent,
  config: PawnProConfigManager,
): void {
  if (!e.affectsConfiguration('pawnpro')) return;
  const vscfg = vscode.workspace.getConfiguration();
  for (const [vsKey, jsonPath] of VS_TO_JSON) {
    if (!e.affectsConfiguration(vsKey)) continue;
    const val = vscfg.inspect(vsKey);
    // Só propaga se o usuário explicitamente configurou (global ou workspace)
    const userValue = val?.globalValue ?? val?.workspaceValue;
    if (userValue === undefined) continue;
    config.setKey(jsonPath, userValue, 'global');
    // Remove do VS Code settings após persistir no config JSON.
    void vscfg.update(vsKey, undefined, vscode.ConfigurationTarget.Global);
    if (val?.workspaceValue !== undefined) {
      void vscfg.update(vsKey, undefined, vscode.ConfigurationTarget.Workspace);
    }
  }
}

async function migrateFromVsCodeSettings(
  config: PawnProConfigManager,
  state: PawnProStateManager,
  context: vscode.ExtensionContext,
): Promise<void> {
  if (config.hasProjectConfig()) return;

  const cfg = vscode.workspace.getConfiguration();
  const partial: Record<string, unknown> = {};
  let hasValues = false;

  const migrate = (vsKey: string, section: string, key: string, defaultVal: unknown) => {
    const val = cfg.get(vsKey);
    if (val !== undefined && val !== defaultVal) {
      if (!partial[section]) partial[section] = {};
      (partial[section] as Record<string, unknown>)[key] = val;
      hasValues = true;
    }
  };

  const migrateFlat = (vsKey: string, key: string, defaultVal: unknown) => {
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
  // sdk.platform e sdk.filePath precisam ser merged no mesmo objeto sdk
  const sdkPlatform = cfg.get('pawnpro.analysis.sdk.platform');
  const sdkFilePath = cfg.get('pawnpro.analysis.sdk.filePath');
  if (sdkPlatform !== undefined && sdkPlatform !== 'omp' || sdkFilePath !== undefined && sdkFilePath !== '') {
    if (!partial['analysis']) partial['analysis'] = {};
    const analysis = partial['analysis'] as Record<string, unknown>;
    const sdk: Record<string, unknown> = {};
    if (sdkPlatform !== undefined && sdkPlatform !== 'omp') sdk['platform'] = sdkPlatform;
    if (sdkFilePath !== undefined && sdkFilePath !== '') sdk['filePath'] = sdkFilePath;
    if (Object.keys(sdk).length > 0) { analysis['sdk'] = sdk; hasValues = true; }
  }
  migrateFlat('pawnpro.showIncludePaths', 'showIncludePaths', false);
  migrate('pawnpro.server.path', 'server', 'path', '');
  migrate('pawnpro.server.cwd', 'server', 'cwd', '${workspaceFolder}');
  migrate('pawnpro.server.args', 'server', 'args', []);
  migrate('pawnpro.server.clearOnStart', 'server', 'clearOnStart', true);
  migrate('pawnpro.server.logPath', 'server', 'logPath', '${workspaceFolder}/server_log.txt');
  migrate('pawnpro.server.logEncoding', 'server', 'logEncoding', 'windows1252');
  migrate('pawnpro.server.output.follow', 'server', 'follow', 'visible');

  const favorites = context.workspaceState.get<string[]>('pawnpro.server.favorites');
  const history = context.workspaceState.get<string[]>('pawnpro.server.history');
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
    vscode.window.showInformationMessage(msg.general.settingsMigrated());
  }
}

function readVsCodeSettings(): Record<string, unknown> {
  const cfg = vscode.workspace.getConfiguration('pawnpro');
  const result: Record<string, unknown> = {};

  const paths = cfg.get<string[]>('includePaths');
  if (paths !== undefined) result['includePaths'] = paths;

  const compilerPath = cfg.get<string>('compiler.path');
  const compilerArgs = cfg.get<string[]>('compiler.args');
  const compilerAutoDetect = cfg.get<boolean>('compiler.autoDetect');
  if (compilerPath !== undefined || compilerArgs !== undefined || compilerAutoDetect !== undefined) {
    result['compiler'] = {
      ...(compilerPath !== undefined ? { path: compilerPath } : {}),
      ...(compilerArgs !== undefined ? { args: compilerArgs } : {}),
      ...(compilerAutoDetect !== undefined ? { autoDetect: compilerAutoDetect } : {}),
    };
  }

  const outputEncoding = cfg.get<string>('output.encoding');
  if (outputEncoding !== undefined) result['output'] = { encoding: outputEncoding };

  const showCommand = cfg.get<boolean>('build.showCommand');
  if (showCommand !== undefined) result['build'] = { showCommand };

  const syntaxScheme = cfg.get<string>('syntax.scheme');
  const syntaxApply = cfg.get<boolean>('syntax.applyOnStartup');
  if (syntaxScheme !== undefined || syntaxApply !== undefined) {
    result['syntax'] = {
      ...(syntaxScheme !== undefined ? { scheme: syntaxScheme } : {}),
      ...(syntaxApply !== undefined ? { applyOnStartup: syntaxApply } : {}),
    };
  }

  const showIncludePaths = cfg.get<boolean>('ui.showIncludePaths');
  if (showIncludePaths !== undefined) {
    result['ui'] = { ...(result['ui'] as object ?? {}), showIncludePaths };
  }

  const warnUnused = cfg.get<boolean>('analysis.warnUnusedInInc');
  const sdkPlatform = cfg.get<string>('analysis.sdk.platform');
  const sdkFilePath = cfg.get<string>('analysis.sdk.filePath');
  if (warnUnused !== undefined || sdkPlatform !== undefined || sdkFilePath !== undefined) {
    result['analysis'] = {
      ...(warnUnused !== undefined ? { warnUnusedInInc: warnUnused } : {}),
      ...(sdkPlatform !== undefined || sdkFilePath !== undefined ? {
        sdk: {
          ...(sdkPlatform !== undefined ? { platform: sdkPlatform } : {}),
          ...(sdkFilePath !== undefined ? { filePath: sdkFilePath } : {}),
        },
      } : {}),
    };
  }

  const serverPath = cfg.get<string>('server.path');
  const serverCwd = cfg.get<string>('server.cwd');
  const serverArgs = cfg.get<string[]>('server.args');
  const serverClear = cfg.get<boolean>('server.clearOnStart');
  const serverLogPath = cfg.get<string>('server.logPath');
  const serverLogEncoding = cfg.get<string>('server.logEncoding');
  const serverFollow = cfg.get<string>('server.output.follow');
  const serverType = cfg.get<string>('server.type');
  if (serverPath !== undefined || serverCwd !== undefined || serverArgs !== undefined ||
      serverClear !== undefined || serverLogPath !== undefined || serverLogEncoding !== undefined ||
      serverFollow !== undefined || serverType !== undefined) {
    result['server'] = {
      ...(serverPath !== undefined ? { path: serverPath } : {}),
      ...(serverCwd !== undefined ? { cwd: serverCwd } : {}),
      ...(serverArgs !== undefined ? { args: serverArgs } : {}),
      ...(serverClear !== undefined ? { clearOnStart: serverClear } : {}),
      ...(serverLogPath !== undefined ? { logPath: serverLogPath } : {}),
      ...(serverLogEncoding !== undefined ? { logEncoding: serverLogEncoding } : {}),
      ...(serverFollow !== undefined ? { output: { follow: serverFollow } } : {}),
      ...(serverType !== undefined ? { type: serverType } : {}),
    };
  }

  return result;
}

export function activateConfigBridge(
  context: vscode.ExtensionContext,
): { config: PawnProConfigManager; state: PawnProStateManager } {
  const projectRoot = getWorkspaceRoot();

  configManager = new PawnProConfigManager(projectRoot);
  stateManager = new PawnProStateManager(projectRoot);

  configManager.setExternalDefaults(readVsCodeSettings());

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('pawnpro')) {
        propagateVsCodeSettingsToConfig(e, configManager!);
        configManager?.setExternalDefaults(readVsCodeSettings());
        sendConfigurationToEngine(configManager!, projectRoot);
      }
    }),
  );

  if (projectRoot) {
    const pattern = new vscode.RelativePattern(projectRoot, '.pawnpro/config.json');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const reload = () => {
      configManager?.reload();
      sendConfigurationToEngine(configManager!, projectRoot);
    };
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
        if (filename === 'config.json') {
          configManager?.reload();
          sendConfigurationToEngine(configManager!, projectRoot);
        }
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

  void migrateFromVsCodeSettings(configManager, stateManager, context);

  return { config: configManager, state: stateManager };
}
