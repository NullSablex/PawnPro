import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { Msg } from './nls.js';
import { createWebviewMsg } from './webviewNls.js';
import type { PawnProConfigManager } from '../core/config.js';
import { webviewThemeCss } from './webviewTheme.js';

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
  panel.webview.html = buildHtml(context, panel.webview, version, msg, webviewThemeCss(config));
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
  // Uma entrada por lista aberta, do nível externo ao interno. `indent` é a
  // indentação que abriu a lista; `liOpen` diz se o item corrente daquele
  // nível ainda está aberto — cada nível tem o seu, e um booleano único não
  // dava conta de uma sub-lista dentro de um item que ainda vai receber texto.
  const listStack: { indent: number; liOpen: boolean }[] = [];
  const topo = () => listStack[listStack.length - 1];

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

  /** Fecha o item corrente do nível mais interno, se houver um aberto. */
  const closeLi = () => {
    const t = topo();
    if (t?.liOpen) { out.push('</li>'); t.liOpen = false; }
  };

  /**
   * Fecha as listas mais internas que `toIndent`, deixando o conteúdo
   * seguinte no nível certo.
   *
   * O item de cada nível fechado sai depois do `</ul>` que estava dentro
   * dele; o item do nível de destino permanece aberto, porque é ele que vai
   * receber o que vem a seguir.
   */
  const closeLists = (toIndent = -1) => {
    while (listStack.length > 0 && topo()!.indent > toIndent) {
      // Fecha o item corrente desta lista e a própria lista. O item do nível
      // que resta é o dono do que vem a seguir, então continua aberto — quem
      // precisar fechá-lo (um item irmão, por exemplo) chama `closeLi`.
      closeLi();
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
      if (listStack.length > 0 && indent > topo()!.indent) {
        // Sub-lista: pertence ao item acima, que segue aberto e a contém.
        out.push('<ul>');
        listStack.push({ indent, liOpen: false });
      } else {
        // Mesmo nível ou acima: fecha o que for mais interno e o item irmão.
        closeLists(indent);
        if (listStack.length === 0) {
          out.push('<ul>');
          listStack.push({ indent, liOpen: false });
        } else {
          closeLi();
        }
      }
      out.push(`<li>${inline(m[2])}`);
      topo()!.liOpen = true;
      continue;
    }

    // Texto indentado continua o item do nível que ele excede — não
    // necessariamente o mais interno: depois de uma sub-lista, um parágrafo
    // recuado em 2 espaços pertence ao item de nível 0, e a sub-lista fecha.
    const indent = line.length - line.trimStart().length;
    const dono = [...listStack].reverse().find(l => indent > l.indent);
    if (dono) {
      closeLists(dono.indent);
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

function buildHtml(context: vscode.ExtensionContext, webview: vscode.Webview, version: string, msg: Msg, themeCss: string): string {
  const cssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'out', 'assets', 'css', 'whats-new.min.css'),
  );
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
