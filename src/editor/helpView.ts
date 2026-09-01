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
      localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'images'))],
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
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${webview.cspSource};">
<title>${msg.help.panelTitle()}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    /* Recuo fluido: em painel estreito 3rem de cada lado comiam 30% da
       largura. Em tela larga o valor é o mesmo de antes. */
    padding: 2.5rem clamp(14px, 5vw, 3rem);
    max-width: 820px;
    margin: 0 auto;
    line-height: 1.6;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 1.5rem;
    margin-bottom: 1rem;
    border-bottom: 1px solid var(--vscode-panel-border, #444);
    flex-wrap: wrap;
    gap: .75rem;
  }
  .logo { height: 72px; width: auto; display: block; }
  .subtitle { color: var(--vscode-descriptionForeground); font-size: .88rem; margin-bottom: 1.5rem; }
  h2 {
    font-size: .7rem;
    text-transform: uppercase;
    letter-spacing: .1em;
    color: var(--vscode-textPreformat-foreground, #9cdcfe);
    margin: 1.75rem 0 .6rem;
  }
  .card-section {
    background: var(--vscode-sideBar-background, rgba(255,255,255,.04));
    border-radius: 8px;
    border-left: 3px solid var(--vscode-activityBarBadge-background, #007acc);
    padding: .9rem 1.1rem 1rem;
    margin: .9rem 0;
  }
  /* Callout de destaque para a recomendação mais importante (compilador). */
  .callout {
    background: var(--vscode-inputValidation-warningBackground, rgba(255,204,0,.08));
    border-left: 3px solid var(--vscode-inputValidation-warningBorder, #cca700);
    border-radius: 8px;
    padding: .9rem 1.1rem 1rem;
    margin: .5rem 0 1.5rem;
  }
  .callout .callout-title {
    font-size: .95rem;
    font-weight: 600;
    color: var(--vscode-foreground);
    margin-bottom: .4rem;
    display: flex;
    align-items: center;
    gap: .4rem;
  }
  .callout p { color: var(--vscode-foreground); font-size: .9rem; margin: 0 0 .5rem; }
  .callout p:last-child { margin-bottom: 0; }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: .35rem 0;
    font-size: .9rem;
  }
  .row + .row { border-top: 1px solid var(--vscode-panel-border, rgba(255,255,255,.08)); }
  .badge {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    padding: .15rem .6rem;
    border-radius: 20px;
    font-size: .75rem;
    font-weight: 600;
    font-family: var(--vscode-editor-font-family, monospace);
  }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .4rem; }
  .card-section ul li { font-size: .9rem; }
  .steps { display: flex; flex-direction: column; gap: .6rem; }
  .steps p { color: var(--vscode-foreground); font-size: .9rem; margin: 0; }
  a { color: var(--vscode-textLink-foreground); text-decoration: none; }
  a:hover { text-decoration: underline; }
  p { color: var(--vscode-descriptionForeground); font-size: .88rem; }
  strong { color: var(--vscode-foreground); }
  code {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: .85em;
    background: var(--vscode-textCodeBlock-background, rgba(255,255,255,.08));
    padding: .1em .35em;
    border-radius: 3px;
  }
  footer {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid var(--vscode-panel-border, #444);
    color: var(--vscode-descriptionForeground);
    font-size: .8rem;
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: .5rem;
  }
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
