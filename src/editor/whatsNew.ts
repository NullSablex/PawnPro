import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { Msg } from './nls.js';
import { createWebviewMsg } from './webviewNls.js';
import type { PawnProConfigManager } from '../core/config.js';
import { request } from '../core/client.js';
import { logWarn } from '../core/logger.js';
import { webviewThemeCss } from './webviewTheme.js';
import { mdToHtml } from '../core/changelogHtml.js';

const VERSION_KEY = 'pawnpro.lastSeenVersion';

function getVersion(context: vscode.ExtensionContext): string {
  return context.extension.packageJSON.version as string;
}

export function registerWhatsNew(
  context: vscode.ExtensionContext,
  config: PawnProConfigManager,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('pawnpro.whatsNew', () => showPanel(context, config)),
  );

  const version = getVersion(context);
  const lastSeen = context.globalState.get<string>(VERSION_KEY);
  if (lastSeen !== version) {
    void context.globalState.update(VERSION_KEY, version);
    showPanel(context, config);
  }
}

function showPanel(context: vscode.ExtensionContext, config: PawnProConfigManager): void {
  const msg = createWebviewMsg(context, config);
  const version = getVersion(context);
  const panel = vscode.window.createWebviewPanel(
    'pawnpro.whatsNew',
    msg.whatsNew.panelTitle(),
    vscode.ViewColumn.One,
    {
      enableScripts: false,
      retainContextWhenHidden: false,
      localResourceRoots: [
        vscode.Uri.file(path.join(context.extensionPath, 'images')),
        vscode.Uri.file(path.join(context.extensionPath, 'out', 'assets')),
      ],
    },
  );
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'images', 'icon.svg');
  void changelogSection(context, version).then((sectionMd) => {
    panel.webview.html = buildHtml(context, panel.webview, version, msg, webviewThemeCss(config), sectionMd);
  });
}

/**
 * A seção da versão instalada no `CHANGELOG.md`, extraída pelo núcleo. Vazia
 * quando não há arquivo, a versão não está nele ou o núcleo não respondeu —
 * e a página diz que não há registro.
 */
async function changelogSection(context: vscode.ExtensionContext, version: string): Promise<string> {
  // O vsce pode gravar o nome em minúsculas.
  const changelogPath = [
    path.join(context.extensionPath, 'CHANGELOG.md'),
    path.join(context.extensionPath, 'changelog.md'),
  ].find(candidate => fs.existsSync(candidate)) ?? path.join(context.extensionPath, 'CHANGELOG.md');
  try {
    return await request<string>('project.changelogSection', { path: changelogPath, version });
  } catch (e) {
    logWarn('whatsNew', `changelog indisponível: ${e instanceof Error ? e.message : String(e)}`);
    return '';
  }
}


function buildHtml(
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
  version: string,
  msg: Msg,
  themeCss: string,
  sectionMd: string,
): string {
  const cssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'out', 'assets', 'css', 'whats-new.min.css'),
  );
  const sectionHtml = sectionMd
    ? mdToHtml(sectionMd)
    : `<p>${msg.whatsNew.noChangelog()}</p>`;

  const logoUri = webview.asWebviewUri(
    vscode.Uri.file(path.join(context.extensionPath, 'images', 'logo.png')),
  );

  return /* html */`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource};">
<link rel="stylesheet" href="${cssUri}">
<style>
${themeCss}
</style>
</head>
<body>
<header>
  <img class="logo" src="${logoUri}" alt="PawnPro">
  <span class="badge">v${version}</span>
</header>

${sectionHtml}

<footer>
  <span>PawnPro v${version}</span>
  <span>${msg.whatsNew.reopenHint()}</span>
</footer>
</body>
</html>`;
}
