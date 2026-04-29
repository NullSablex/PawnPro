import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node.js';
import type { PawnProConfigManager } from '../core/config.js';
import { buildIncludePaths } from '../core/includes.js';

export function resolveSdkFilePath(
  platform: string,
  configuredPath: string,
  includePaths: string[],
  workspaceRoot: string,
): string | null {
  if (platform === 'none') return null;

  if (configuredPath) {
    return fs.existsSync(configuredPath) ? configuredPath : null;
  }

  if (platform === 'omp' || platform === 'auto') {
    const wsDefault = path.join(workspaceRoot, 'qawno', 'include', 'open.mp.inc');
    if (fs.existsSync(wsDefault)) return wsDefault;
    for (const dir of includePaths) {
      const candidate = path.join(dir, 'open.mp.inc');
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return null;
}

let client: LanguageClient | null = null;
let savedContext: vscode.ExtensionContext | null = null;
let savedConfig: PawnProConfigManager | null = null;
let savedWorkspaceRoot: string | undefined;

type EngineSettings = { resolvedPaths: string[]; sdkFilePath: string };

function buildEngineSettings(
  cfg: ReturnType<import('../core/config.js').PawnProConfigManager['getAll']>,
  workspaceRoot: string | undefined,
): EngineSettings {
  const resolvedPaths = buildIncludePaths(cfg, workspaceRoot ?? '');
  const sdkFilePath = resolveSdkFilePath(
    cfg.analysis.sdk.platform,
    cfg.analysis.sdk.filePath,
    resolvedPaths,
    workspaceRoot ?? '',
  ) ?? '';
  return { resolvedPaths, sdkFilePath };
}

function resolveLocale(cfg: ReturnType<PawnProConfigManager['getAll']>): string {
  return cfg.locale || vscode.env.language;
}

function findBinary(context: vscode.ExtensionContext): string | null {
  const ext      = process.platform === 'win32' ? '.exe' : '';
  const name     = `pawnpro-engine${ext}`;
  const artifact = `pawnpro-engine-${process.platform}-${process.arch}${ext}`;

  const candidates = [
    path.join(context.extensionPath, 'engines', artifact),
    path.join(context.extensionPath, '..', 'pawnpro-engine', 'target', 'debug', name),
    path.join(context.extensionPath, '..', 'pawnpro-engine', 'target', 'release', name),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

export async function startLspClient(
  context: vscode.ExtensionContext,
  config: PawnProConfigManager,
  workspaceRoot: string | undefined,
): Promise<boolean> {
  const binaryPath = findBinary(context);

  if (!binaryPath) {
    console.log('[PawnPro] engine binary not found — IntelliSense unavailable');
    return false;
  }

  console.log(`[PawnPro] engine found: ${binaryPath}`);

  savedContext = context;
  savedConfig = config;
  savedWorkspaceRoot = workspaceRoot;

  if (process.platform !== 'win32') {
    try { fs.chmodSync(binaryPath, 0o755); } catch {}
  }

  const cfg = config.getAll();
  const { resolvedPaths, sdkFilePath } = buildEngineSettings(cfg, workspaceRoot);

  const serverOptions: ServerOptions = {
    run:   { command: binaryPath, transport: TransportKind.stdio },
    debug: { command: binaryPath, transport: TransportKind.stdio },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'pawn' }],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher('**/*.{pwn,inc,p,pawn}'),
    },
    initializationOptions: {
      workspaceFolder: workspaceRoot ?? '',
      includePaths: resolvedPaths,
      warnUnusedInInc: cfg.analysis.warnUnusedInInc,
      suppressDiagnosticsInInc: cfg.analysis.suppressDiagnosticsInInc,
      sdkFilePath,
      locale: resolveLocale(cfg),
    },
    progressOnInitialization: false,
  };

  client = new LanguageClient(
    'pawnpro-engine',
    'PawnPro Engine',
    serverOptions,
    clientOptions,
  );

  context.subscriptions.push(client);
  await client.start();
  console.log('[PawnPro] LSP engine started');
  return true;
}

export async function stopLspClient(): Promise<void> {
  if (client) {
    await client.stop();
    client = null;
  }
}

export async function restartLspClient(): Promise<void> {
  if (!client || !savedContext || !savedConfig) return;
  await client.stop();
  client = null;
  await startLspClient(savedContext, savedConfig, savedWorkspaceRoot);
}

export function sendConfigurationToEngine(
  config: PawnProConfigManager,
  workspaceRoot: string | undefined,
): void {
  if (!client) return;
  const cfg = config.getAll();
  const { resolvedPaths, sdkFilePath } = buildEngineSettings(cfg, workspaceRoot);
  void client.sendNotification('workspace/didChangeConfiguration', {
    settings: {
      includePaths: resolvedPaths,
      warnUnusedInInc: cfg.analysis.warnUnusedInInc,
      suppressDiagnosticsInInc: cfg.analysis.suppressDiagnosticsInInc,
      sdkFilePath,
      locale: resolveLocale(cfg),
    },
  });
}
