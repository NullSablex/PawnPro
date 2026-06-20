import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { msg } from './nls.js';

const VERSION_KEY = 'pawnpro.lastSeenVersion';

function getVersion(context: vscode.ExtensionContext): string {
  return context.extension.packageJSON.version as string;
}

export function registerWhatsNew(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('pawnpro.whatsNew', () => showPanel(context)),
  );

  const version = getVersion(context);
  const lastSeen = context.globalState.get<string>(VERSION_KEY);
  if (lastSeen !== version) {
    void context.globalState.update(VERSION_KEY, version);
    showPanel(context);
  }
}

function showPanel(context: vscode.ExtensionContext): void {
  const version = getVersion(context);
  const panel = vscode.window.createWebviewPanel(
    'pawnpro.whatsNew',
    msg.whatsNew.panelTitle(),
    vscode.ViewColumn.One,
    {
      enableScripts: false,
      retainContextWhenHidden: false,
      localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'images'))],
    },
  );
  panel.webview.html = buildHtml(context, panel.webview, version);
}

function extractSection(changelogPath: string, version: string): string {
  let raw: string;
  try {
    raw = fs.readFileSync(changelogPath, 'utf8');
  } catch {
    return '';
  }

  const lines = raw.split(/\r?\n/);
  const sectionLines: string[] = [];
  let inside = false;

  for (const line of lines) {
    if (/^##\s*\[/.test(line)) {
      if (inside) break;
      const bracket = line.match(/^##\s*\[([^\]]*)\]/)?.[1];
      if (bracket === version || bracket?.startsWith(`${version}-`) || bracket?.startsWith(`${version}.`)) inside = true;
      continue;
    }
    if (inside) sectionLines.push(line);
  }

  return sectionLines.join('\n').trim();
}

function mdToHtml(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  // Pilha de níveis de lista abertos, pela indentação (espaços) que os abriu.
  const listStack: number[] = [];

  const inline = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // [texto](url) → link (após o escape de < >, então a URL está segura)
      .replace(
        /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
        '<a href="$2">$1</a>',
      );

  let cardOpen = false;

  const closeLists = (toIndent = -1) => {
    while (listStack.length > 0 && listStack[listStack.length - 1] > toIndent) {
      out.push('</ul>');
      listStack.pop();
    }
  };
  // Cada seção (### / ####) é um card; fecha o anterior antes de abrir o próximo.
  const closeCard = () => {
    closeLists();
    if (cardOpen) { out.push('</div>'); cardOpen = false; }
  };
  const openCard = (title: string) => {
    closeCard();
    out.push(`<div class="card-section"><div class="card-title">${title}</div>`);
    cardOpen = true;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line.trim()) { closeLists(); continue; }

    if (/^[-*_]{3,}\s*$/.test(line.trim())) { closeCard(); continue; }

    // Versão (##): título solto fora de card; fecha o card anterior.
    if (/^##\s+(?!#)/.test(line)) {
      closeCard();
      out.push(`<h2>${inline(line.replace(/^##\s+/, ''))}</h2>`);
      continue;
    }

    // Seção (#### antes de ###): abre um novo card.
    if (/^####\s+/.test(line)) { openCard(inline(line.replace(/^####\s+/, ''))); continue; }
    if (/^###\s+/.test(line))  { openCard(inline(line.replace(/^###\s+/, '')));  continue; }

    // Item de lista, possivelmente indentado (sub-listas aninhadas).
    const m = /^(\s*)[-*]\s+(.*)$/.exec(line);
    if (m) {
      const indent = m[1].length;
      closeLists(indent);
      if (listStack.length === 0 || indent > listStack[listStack.length - 1]) {
        out.push('<ul>');
        listStack.push(indent);
      }
      out.push(`<li>${inline(m[2])}</li>`);
      continue;
    }

    closeLists();
    out.push(`<p>${inline(line)}</p>`);
  }

  closeCard();
  return out.join('\n');
}

function buildHtml(context: vscode.ExtensionContext, webview: vscode.Webview, version: string): string {
  // vsce may lowercase the filename
  const changelogPath = [
    path.join(context.extensionPath, 'CHANGELOG.md'),
    path.join(context.extensionPath, 'changelog.md'),
  ].find(candidate => fs.existsSync(candidate)) ?? path.join(context.extensionPath, 'CHANGELOG.md');
  const sectionMd = extractSection(changelogPath, version);
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
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${webview.cspSource};">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 2.5rem 3rem;
    max-width: 820px;
    margin: 0 auto;
    line-height: 1.6;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 1.5rem;
    margin-bottom: 2rem;
    border-bottom: 1px solid var(--vscode-panel-border, #444);
    flex-wrap: wrap;
    gap: .75rem;
  }
  .logo { height: 72px; width: auto; display: block; }
  .badge {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    padding: .25rem .7rem;
    border-radius: 20px;
    font-size: .75rem;
    font-weight: 600;
  }
  h2 {
    font-size: .7rem;
    text-transform: uppercase;
    letter-spacing: .1em;
    color: var(--vscode-textPreformat-foreground, #9cdcfe);
    margin: 1.75rem 0 .6rem;
  }
  /* Cada seção (Adicionado, Corrigido, ...) é UM card com seus itens dentro. */
  .card-section {
    background: var(--vscode-sideBar-background, rgba(255,255,255,.04));
    border-radius: 8px;
    border-left: 3px solid var(--vscode-activityBarBadge-background, #007acc);
    padding: .9rem 1.1rem 1rem;
    margin: .9rem 0;
  }
  .card-title {
    font-size: .92rem;
    font-weight: 600;
    color: var(--vscode-foreground);
    margin-bottom: .5rem;
  }
  /* Itens do card: lista com bullets; sub-itens recuados, dentro do item-pai. */
  .card-section ul {
    list-style: disc;
    margin: 0;
    padding-left: 1.2rem;
    display: flex;
    flex-direction: column;
    gap: .35rem;
  }
  .card-section li {
    font-size: .9rem;
    overflow-wrap: break-word;
    word-break: break-word;
  }
  .card-section ul ul {
    margin: .3rem 0 .15rem;
    gap: .2rem;
    list-style: circle;
  }
  .card-section ul ul li { font-size: .86rem; opacity: .9; }
  p { color: var(--vscode-descriptionForeground); font-size: .88rem; margin-top: .5rem; }
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
