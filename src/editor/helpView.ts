import * as vscode from 'vscode';
import * as path from 'path';
import type { Msg } from './nls.js';
import { createWebviewMsg } from './webviewNls.js';
import type { PawnProConfigManager } from '../core/config.js';
import { webviewThemeCss } from './webviewTheme.js';

const DOCS_URL = 'https://pawnpro.nullsablex.com';
const DEBUG_DOCS_URL = 'https://pawnpro.nullsablex.com/debugging/';
const SERVER_DOCS_URL = 'https://pawnpro.nullsablex.com/server/';
const EXTENSION_REPO = 'https://github.com/NullSablex/PawnPro';
const ISSUES_URL = 'https://github.com/NullSablex/PawnPro/issues';
const OPENMP_COMPILER_URL = 'https://github.com/openmultiplayer/compiler/releases';
const COMPILERS_DOCS_URL = 'https://pawnpro.nullsablex.com/compilers/';

interface PackageJson {
  version: string;
  engineVersion?: string;
  engineRepository?: string;
  debuggerVersion?: string;
  debuggerRepository?: string;
}

export function registerHelpView(
  context: vscode.ExtensionContext,
  config: PawnProConfigManager,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('pawnpro.help', () => showPanel(context, config)),
  );
}

function showPanel(context: vscode.ExtensionContext, config: PawnProConfigManager): void {
  const msg = createWebviewMsg(context, config);
  const panel = vscode.window.createWebviewPanel(
    'pawnpro.help',
    msg.help.panelTitle(),
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
  // Ícone da aba: webviews ignoram <link rel="icon"> no HTML — é `iconPath` que
  // define o ícone mostrado no título do painel.
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'images', 'icon.svg');
  panel.webview.html = buildHtml(context, panel.webview, msg, webviewThemeCss(config));
}

/** Escapa HTML e resolve **negrito**, `código` e [texto](url) para tags seguras. */
function inline(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

function row(label: string, value: string): string {
  return `<div class="row"><span class="row-label">${inline(label)}</span><span class="badge">${value}</span></div>`;
}

function link(label: string, url: string): string {
  return `<li><a href="${url}">${inline(label)}</a></li>`;
}

function buildHtml(context: vscode.ExtensionContext, webview: vscode.Webview, msg: Msg, themeCss: string): string {
  const cssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'out', 'assets', 'css', 'help.min.css'),
  );
  const pkg = context.extension.packageJSON as PackageJson;
  const engineVersion = pkg.engineVersion ?? '—';
  const debuggerVersion = pkg.debuggerVersion ?? '—';
  const engineRepo = pkg.engineRepository ?? EXTENSION_REPO;
  const debuggerRepo = pkg.debuggerRepository ?? EXTENSION_REPO;

  const logoUri = webview.asWebviewUri(
    vscode.Uri.file(path.join(context.extensionPath, 'images', 'logo.png')),
  );

  const components = [
    row(msg.help.extensionLabel(), `v${pkg.version}`),
    row(msg.help.engineLabel(), `v${engineVersion}`),
    row(msg.help.debuggerLabel(), `v${debuggerVersion}`),
  ].join('\n');

  const links = [
    link(msg.help.linkDocs(), DOCS_URL),
    link(msg.help.linkServerGuide(), SERVER_DOCS_URL),
    link(msg.help.linkExtension(), EXTENSION_REPO),
    link(msg.help.linkEngine(), engineRepo),
    link(msg.help.linkDebugger(), debuggerRepo),
    link(msg.help.linkIssues(), ISSUES_URL),
  ].join('\n');

  const debuggerReleases = `${debuggerRepo}/releases`;

  return /* html */`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource};">
<title>${msg.help.panelTitle()}</title>
<link rel="stylesheet" href="${cssUri}">
<style>
${themeCss}
</style>
</head>
<body>
<header>
  <img class="logo" src="${logoUri}" alt="PawnPro">
  <span class="badge">v${pkg.version}</span>
</header>
<p class="subtitle">${inline(msg.help.subtitle())}</p>

<div class="callout">
  <div class="callout-title">⚠ ${inline(msg.help.compilerTitle())}</div>
  <p>${inline(msg.help.compilerBody())}</p>
  <p><a href="${OPENMP_COMPILER_URL}">${inline(msg.help.compilerLink())} →</a></p>
  <p><a href="${COMPILERS_DOCS_URL}">${inline(msg.help.compilerListLink())} →</a></p>
</div>

<h2>${inline(msg.help.componentsTitle())}</h2>
<div class="card-section">
${components}
</div>

<h2>${inline(msg.help.linksTitle())}</h2>
<div class="card-section">
<ul>
${links}
</ul>
</div>

<h2>${inline(msg.help.debuggerTitle())}</h2>
<div class="card-section steps">
<p>${inline(msg.help.debuggerIntro())}</p>
<p>${inline(msg.help.stepDownload().replace('{0}', debuggerReleases))}</p>
<p>${inline(msg.help.stepInstallOmp())}</p>
<p>${inline(msg.help.stepInstallSamp())}</p>
</div>

<h2>${inline(msg.help.usageTitle())}</h2>
<div class="card-section steps">
<p>${inline(msg.help.usageBody())}</p>
<p><a href="${DEBUG_DOCS_URL}">${inline(msg.help.fullGuide())} →</a></p>
</div>

<footer>
  <span>PawnPro v${pkg.version}</span>
  <span>${msg.help.reopenHint()}</span>
</footer>
</body>
</html>`;
}
