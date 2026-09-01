import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { Msg } from './nls.js';
import { createWebviewMsg } from './webviewNls.js';
import type { PawnProConfigManager } from '../core/config.js';

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
      localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'images'))],
    },
  );
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'images', 'icon.svg');
  panel.webview.html = buildHtml(context, panel.webview, version, msg);
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

  const escape = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const inline = (s: string) =>
    escape(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // [texto](url) → link (após o escape de < >, então a URL está segura)
      .replace(
        /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
        '<a href="$2">$1</a>',
      );

  let cardOpen = false;
  // Bloco cercado por ``` : o conteúdo é literal, então nada dentro dele passa
  // pela marcação inline. `null` quando não há bloco aberto.
  let fenceLang: string | null = null;
  let fenceLines: string[] = [];
  // Indentação da cerca: num bloco aninhado numa lista, ela recua o conteúdo
  // todo e apareceria dentro do código.
  let fenceIndent = 0;
  // Um item fica aberto enquanto puder receber continuação (um bloco de
  // código indentado, um parágrafo); sem isso o conteúdo cairia dentro do
  // <ul> e fora de qualquer <li>, o que é inválido.
  let liOpen = false;

  const closeLi = () => {
    if (liOpen) { out.push('</li>'); liOpen = false; }
  };
  const closeLists = (toIndent = -1) => {
    if (listStack.length > 0) closeLi();
    while (listStack.length > 0 && listStack[listStack.length - 1] > toIndent) {
      out.push('</ul>');
      listStack.pop();
      // Ao sair de uma sub-lista, o item que a continha ainda está aberto:
      // ele só termina agora, depois do </ul> que estava dentro dele.
      if (listStack.length > 0) out.push('</li>');
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

    // A cerca vem antes de tudo: dentro dela, `-` e `#` são código, não
    // marcação.
    const fence = /^(\s*)```(\w*)\s*$/.exec(line);
    if (fence) {
      if (fenceLang === null) {
        fenceIndent = fence[1].length;
        // Um bloco indentado pertence ao item de lista acima — fechar a lista
        // aqui transformaria o texto seguinte num parágrafo solto, com outra
        // cor. Só uma cerca na margem encerra a lista.
        if (fenceIndent === 0) closeLists();
        fenceLang = fence[2] || '';
        fenceLines = [];
      } else {
        const cls = fenceLang ? ` class="language-${fenceLang}"` : '';
        out.push(`<pre><code${cls}>${escape(fenceLines.join('\n'))}</code></pre>`);
        fenceLang = null;
        fenceLines = [];
      }
      continue;
    }
    if (fenceLang !== null) { fenceLines.push(raw.slice(fenceIndent)); continue; }

    // Uma linha em branco não encerra a lista: em Markdown, só o conteúdo
    // seguinte decide isso, quando volta à margem. Fechar aqui quebrava o
    // vínculo entre um item e o bloco de código indentado abaixo dele.
    if (!line.trim()) continue;

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
      const aninha = listStack.length > 0 && indent > listStack[listStack.length - 1];
      if (aninha) {
        // A sub-lista pertence ao item acima, então ele continua aberto: o
        // <ul> aninhado entra dentro dele, como no Markdown de referência.
        out.push('<ul>');
        listStack.push(indent);
      } else {
        closeLists(indent);
        if (listStack.length === 0) {
          out.push('<ul>');
          listStack.push(indent);
        }
        closeLi();
      }
      out.push(`<li>${inline(m[2])}`);
      liOpen = true;
      continue;
    }

    // Texto indentado logo abaixo de um item continua aquele item; na margem,
    // é um parágrafo do card.
    const indent = line.length - line.trimStart().length;
    if (listStack.length > 0 && indent > listStack[listStack.length - 1]) {
      out.push(`<p class="cont">${inline(line.trim())}</p>`);
      continue;
    }
    closeLists();
    out.push(`<p>${inline(line.trim())}</p>`);
  }

  // Uma cerca não fechada no fim do texto ainda deve render o que já veio.
  if (fenceLang !== null && fenceLines.length) {
    const cls = fenceLang ? ` class="language-${fenceLang}"` : '';
    out.push(`<pre><code${cls}>${escape(fenceLines.join('\n'))}</code></pre>`);
  }
  closeCard();
  return out.join('\n');
}

function buildHtml(context: vscode.ExtensionContext, webview: vscode.Webview, version: string, msg: Msg): string {
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
  /* Continuação de um item: mesma cor e tamanho do item. O recuo já vem do
     próprio <li>, então nada é somado aqui — um margin extra afastaria o
     texto além do que o Markdown pede. */
  .card-section p.cont {
    color: inherit;
    font-size: .9rem;
    margin: .5rem 0 0;
  }
  strong { color: var(--vscode-foreground); }
  code {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: .85em;
    background: var(--vscode-textCodeBlock-background, rgba(255,255,255,.08));
    padding: .1em .35em;
    border-radius: 3px;
  }
  pre {
    margin: .75rem 0;
    padding: .75rem 1rem;
    border: 1px solid var(--vscode-panel-border, #444);
    border-radius: 6px;
    background: var(--vscode-textCodeBlock-background, rgba(255,255,255,.05));
    overflow-x: auto;
  }
  /* Dentro do bloco, o fundo e o recuo já vêm do elemento externo; repeti-los
     aqui desenharia uma caixa dentro da outra. */
  pre code {
    display: block;
    padding: 0;
    background: none;
    border-radius: 0;
    font-size: .82rem;
    line-height: 1.5;
    color: var(--vscode-editor-foreground, var(--vscode-foreground));
    white-space: pre;
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
