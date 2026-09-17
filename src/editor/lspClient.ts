import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  StreamInfo,
} from 'vscode-languageclient/node';
import type { PawnProConfigManager } from '../core/config.js';
import { connectChannel } from '../core/channel.js';
import { request, startCore } from '../core/client.js';

/**
 * A engine não é mais um processo à parte: ela vive dentro do core, que a
 * hospeda num soquete local e é quem lhe entrega a configuração. Aqui só
 * pedimos o endereço e ligamos o cliente nele — nada de
 * `initializationOptions`, que a engine passou a ignorar de propósito para não
 * haver duas fontes.
 */

let client: LanguageClient | null = null;
let savedContext: vscode.ExtensionContext | null = null;
let savedConfig: PawnProConfigManager | null = null;
let savedWorkspaceRoot: string | undefined;

export async function startLspClient(
  context: vscode.ExtensionContext,
  config: PawnProConfigManager,
  workspaceRoot: string | undefined,
): Promise<boolean> {
  savedContext = context;
  savedConfig = config;
  savedWorkspaceRoot = workspaceRoot;

  if (!startCore(context.extensionPath)) {
    console.log('[PawnPro] core não encontrado — IntelliSense indisponível');
    return false;
  }

  let address: string;
  try {
    // O core lê a configuração do projeto e a entrega à engine antes de ela
    // começar a atender; quando esta chamada volta, já está tudo no lugar.
    const started = await request<{ address: string }>('engine.start', {
      workspaceRoot: workspaceRoot ?? '',
      editorLanguage: vscode.env.language,
    });
    address = started.address;
  } catch (e) {
    console.error('[PawnPro] o core recusou subir a engine:', e);
    return false;
  }

  const serverOptions: ServerOptions = () => {
    const socket = connectChannel(address, 'lsp');
    const info: StreamInfo = { reader: socket, writer: socket };
    return Promise.resolve(info);
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'pawn' }],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher('**/*.{pwn,inc,p,pawn}'),
    },
    progressOnInitialization: false,
  };

  client = new LanguageClient('pawnpro-engine', 'PawnPro Engine', serverOptions, clientOptions);

  context.subscriptions.push(client);
  await client.start();
  console.log(`[PawnPro] engine atendendo em ${address}`);
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
