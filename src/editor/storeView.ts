import * as vscode from 'vscode';
import type { PawnProConfigManager } from '../core/config.js';
import { brandAnimationCss, brandAnimationJs } from './brandAnimation.js';
import { msg } from './nls.js';

let panel: vscode.WebviewPanel | undefined;
let cfgManager: PawnProConfigManager | undefined;

/**
 * Item do catálogo da loja. Estrutura mínima do mock — espelha os campos que um
 * manifesto real precisaria (ver `docs/store-plan.md`).
 */
interface StoreItem {
  id: string;
  name: string;
  author: string;
  kind: 'plugin' | 'filterscript' | 'include';
  source: 'pawnpro' | 'openmp';
  version: string;
  short: string;
  description: string;
}

/**
 * Catálogo MOCK — dados de exemplo para validar a experiência da loja antes do
 * motor de instalação real. Nada aqui instala de verdade.
 */
const MOCK_CATALOG: StoreItem[] = [
  {
    id: 'sscanf',
    name: 'sscanf2',
    author: 'Y_Less',
    kind: 'plugin',
    source: 'openmp',
    version: '2.13.8',
    short: 'Especificadores de formato para extrair dados de strings.',
    description:
      'Plugin clássico de parsing de strings — extrai inteiros, floats, strings e mais a partir de um formato, muito usado em comandos.',
  },
  {
    id: 'mysql',
    name: 'MySQL',
    author: 'pBlueG / maddinat0r',
    kind: 'plugin',
    source: 'openmp',
    version: 'R41-4',
    short: 'Driver MySQL com pool de conexões e consultas assíncronas.',
    description:
      'Acesso a banco MySQL/MariaDB com threads, prepared statements e cache. Base de praticamente todo gamemode persistente.',
  },
  {
    id: 'streamer',
    name: 'Streamer',
    author: 'Incognito',
    kind: 'plugin',
    source: 'openmp',
    version: '2.9.6',
    short: 'Streaming dinâmico de objetos, pickups, áreas e mais.',
    description:
      'Contorna os limites de objetos/pickups/labels do servidor transmitindo dinamicamente por proximidade do jogador.',
  },
  {
    id: 'ycmd',
    name: 'y_commands',
    author: 'Y_Less',
    kind: 'include',
    source: 'openmp',
    version: '5.x',
    short: 'Processador de comandos do YSI.',
    description:
      'Sistema de comandos flexível do YSI, com aliases, permissões e parsing integrado ao sscanf.',
  },
  {
    id: 'mapfix',
    name: 'MapAndreas',
    author: 'Comunidade',
    kind: 'plugin',
    source: 'pawnpro',
    version: '1.2',
    short: 'Altura do terreno (Z) a partir de X/Y.',
    description:
      'Consulta a altura do mapa de San Andreas para posicionar objetos/jogadores no chão sem cair pelo mundo.',
  },
  {
    id: 'admin-fs',
    name: 'Painel Admin (exemplo)',
    author: 'PawnPro',
    kind: 'filterscript',
    source: 'pawnpro',
    version: '0.1',
    short: 'Filterscript de administração de exemplo.',
    description:
      'Exemplo de filterscript curado pela loja PawnPro — comandos básicos de moderação. Serve de demonstração do catálogo próprio.',
  },
];

export function registerStoreView(
  context: vscode.ExtensionContext,
  config: PawnProConfigManager,
): void {
  cfgManager = config;
  context.subscriptions.push(
    vscode.commands.registerCommand('pawnpro.openStore', () => {
      if (panel) {
        panel.reveal();
        return;
      }

      panel = vscode.window.createWebviewPanel(
        'pawnpro.store',
        msg.store.title(),
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'images')],
        },
      );
      // Ícone da aba (em vez do genérico de arquivo).
      panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'images', 'icon.svg');

      const logoUri = panel.webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, 'images', 'icon.svg'),
      );
      panel.webview.html = getHtml(logoUri.toString());
      sendState(panel);

      panel.webview.onDidReceiveMessage((message: unknown) => {
        if (!message || typeof message !== 'object') return;
        handleMessage(message as Record<string, unknown>);
      });

      panel.onDidDispose(() => {
        panel = undefined;
      });
    }),
  );
}

function handleMessage(m: Record<string, unknown>): void {
  switch (m['type']) {
    case 'requestState':
      if (panel) sendState(panel);
      break;
    case 'install': {
      // Mock: ainda não há motor de instalação (ver docs/store-plan.md).
      const id = m['id'];
      const item = MOCK_CATALOG.find(i => i.id === id);
      void vscode.window.showInformationMessage(
        item ? msg.store.installMock(item.name) : msg.store.installUnavailable(),
      );
      break;
    }
  }
}

function buildI18n() {
  const s = msg.store;
  return {
    title: s.title(),
    subtitle: s.subtitle(),
    searchPlaceholder: s.searchPlaceholder(),
    viewList: s.viewList(),
    viewGrid: s.viewGrid(),
    install: s.install(),
    back: s.back(),
    empty: s.empty(),
    mockNote: s.mockNote(),
    kindPlugin: s.kindPlugin(),
    kindFilterscript: s.kindFilterscript(),
    kindInclude: s.kindInclude(),
    sourcePawnpro: s.sourcePawnpro(),
    sourceOpenmp: s.sourceOpenmp(),
    byAuthor: s.byAuthor(),
  };
}

function sendState(p: vscode.WebviewPanel): void {
  const animateTitle = cfgManager?.getAll().ui.animateTitle ?? false;
  p.webview.postMessage({ type: 'state', items: MOCK_CATALOG, i18n: buildI18n(), animateTitle });
}

function getHtml(logoUri: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    margin: 0; padding: 0;
  }
  header {
    display: flex; align-items: center; gap: 10px;
    padding: 14px 20px; border-bottom: 1px solid var(--vscode-panel-border, #333);
  }
  header img { width: 26px; height: 26px; }
  header .title { font-size: 1.15em; font-weight: 600; }
  header .subtitle { font-size: 0.85em; opacity: 0.7; margin-left: 4px; }
  .mock-banner {
    margin: 12px 20px 0;
    padding: 8px 12px; border-radius: 4px; font-size: 0.85em;
    background: var(--vscode-inputValidation-warningBackground, rgba(255,200,0,0.1));
    border: 1px solid var(--vscode-inputValidation-warningBorder, #cc9900);
  }
  .toolbar {
    display: flex; align-items: center; gap: 10px;
    padding: 14px 20px;
  }
  .toolbar input[type="search"] {
    flex: 1; padding: 7px 10px; border-radius: 4px;
    border: 1px solid var(--vscode-input-border, #555);
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    font-size: 0.95em;
  }
  .view-toggle { display: flex; gap: 4px; }
  .view-toggle button {
    background: transparent; color: var(--vscode-foreground);
    border: 1px solid var(--vscode-input-border, #555); border-radius: 4px;
    padding: 6px 10px; cursor: pointer; font-size: 0.85em;
  }
  .view-toggle button.active {
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    border-color: transparent;
  }
  main { padding: 0 20px 24px; }

  /* Grade (cards) */
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 14px; }
  .card {
    border: 1px solid var(--vscode-panel-border, #333); border-radius: 6px;
    padding: 14px; display: flex; flex-direction: column; gap: 8px; cursor: pointer;
    transition: border-color 0.1s, background 0.1s;
  }
  .card:hover { border-color: var(--vscode-focusBorder, #07c); }
  .card .name { font-weight: 600; }
  .card .short { font-size: 0.85em; opacity: 0.8; flex: 1; }

  /* Lista */
  .list { display: flex; flex-direction: column; }
  .list .row {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 4px; border-bottom: 1px solid var(--vscode-panel-border, #2a2a2a);
    cursor: pointer;
  }
  .list .row:hover { background: var(--vscode-list-hoverBackground); }
  .list .row .info { flex: 1; min-width: 0; }
  .list .row .name { font-weight: 600; }
  .list .row .short {
    font-size: 0.85em; opacity: 0.75;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .badges { display: flex; gap: 6px; flex-wrap: wrap; }
  .badge {
    font-size: 0.72em; padding: 1px 7px; border-radius: 10px;
    border: 1px solid var(--vscode-badge-background, #555);
    background: var(--vscode-badge-background, #444); color: var(--vscode-badge-foreground, #fff);
  }
  .badge.src-openmp { background: transparent; }
  .meta { font-size: 0.78em; opacity: 0.65; }

  .btn-install {
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    border: none; border-radius: 4px; padding: 5px 14px; cursor: pointer; font-size: 0.85em;
    align-self: flex-start;
  }

  /* Detalhe */
  .detail { display: none; }
  .detail.open { display: block; }
  .detail .back {
    background: none; border: none; color: var(--vscode-textLink-foreground);
    cursor: pointer; font-size: 0.9em; padding: 0; margin-bottom: 14px;
  }
  .detail h2 { margin: 0 0 4px; }
  .detail .desc { margin: 14px 0; line-height: 1.5; }
  .empty { opacity: 0.6; padding: 30px 0; text-align: center; }

${brandAnimationCss()}
</style>
</head>
<body>
<header>
  <img src="${logoUri}" alt="" />
  <span class="title brand" id="brand" data-i18n="title"></span>
  <span class="subtitle" data-i18n="subtitle"></span>
</header>

<div class="mock-banner" data-i18n="mockNote"></div>

<div id="browse">
  <div class="toolbar">
    <input type="search" id="search" data-i18n-ph="searchPlaceholder" oninput="render()" />
    <div class="view-toggle">
      <button id="btn-list" onclick="setView('list')" data-i18n="viewList"></button>
      <button id="btn-grid" class="active" onclick="setView('grid')" data-i18n="viewGrid"></button>
    </div>
  </div>
  <main id="results"></main>
</div>

<div class="detail" id="detail"></div>

<script>
const vscode = acquireVsCodeApi();
let _i18n = {};
let _items = [];
let _view = 'grid';

window.addEventListener('message', e => {
  const msg = e.data;
  if (msg.type === 'state') {
    _i18n = msg.i18n || {};
    _items = msg.items || [];
    applyI18n();
    applyBrandAnimation(msg.animateTitle);
    render();
  }
});

${brandAnimationJs()}
vscode.postMessage({ type: 'requestState' });

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const k = el.getAttribute('data-i18n');
    if (_i18n[k] !== undefined) el.textContent = _i18n[k];
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const k = el.getAttribute('data-i18n-ph');
    if (_i18n[k] !== undefined) el.setAttribute('placeholder', _i18n[k]);
  });
}

function setView(v) {
  _view = v;
  document.getElementById('btn-list').classList.toggle('active', v === 'list');
  document.getElementById('btn-grid').classList.toggle('active', v === 'grid');
  render();
}

function kindLabel(k) {
  return k === 'plugin' ? _i18n.kindPlugin
       : k === 'filterscript' ? _i18n.kindFilterscript
       : _i18n.kindInclude;
}
function sourceLabel(s) {
  return s === 'pawnpro' ? _i18n.sourcePawnpro : _i18n.sourceOpenmp;
}

function filtered() {
  const q = (document.getElementById('search').value || '').toLowerCase().trim();
  if (!q) return _items;
  return _items.filter(i =>
    i.name.toLowerCase().includes(q) ||
    i.short.toLowerCase().includes(q) ||
    i.author.toLowerCase().includes(q));
}

function badges(i) {
  return '<span class="badge">' + kindLabel(i.kind) + '</span>' +
         '<span class="badge src-' + i.source + '">' + sourceLabel(i.source) + '</span>';
}

function render() {
  const host = document.getElementById('results');
  const items = filtered();
  if (items.length === 0) {
    host.innerHTML = '<div class="empty">' + (_i18n.empty || '') + '</div>';
    return;
  }
  if (_view === 'grid') {
    host.className = '';
    host.innerHTML = '<div class="grid">' + items.map(cardHtml).join('') + '</div>';
  } else {
    host.className = '';
    host.innerHTML = '<div class="list">' + items.map(rowHtml).join('') + '</div>';
  }
}

function cardHtml(i) {
  return '<div class="card" onclick="openDetail(\\'' + i.id + '\\')">' +
    '<div class="name">' + esc(i.name) + '</div>' +
    '<div class="badges">' + badges(i) + '</div>' +
    '<div class="short">' + esc(i.short) + '</div>' +
    '<div class="meta">' + (_i18n.byAuthor || '') + ' ' + esc(i.author) + ' · v' + esc(i.version) + '</div>' +
    '</div>';
}

function rowHtml(i) {
  return '<div class="row" onclick="openDetail(\\'' + i.id + '\\')">' +
    '<div class="info">' +
      '<div class="name">' + esc(i.name) + '</div>' +
      '<div class="short">' + esc(i.short) + '</div>' +
    '</div>' +
    '<div class="badges">' + badges(i) + '</div>' +
    '</div>';
}

function openDetail(id) {
  const i = _items.find(x => x.id === id);
  if (!i) return;
  document.getElementById('browse').style.display = 'none';
  const d = document.getElementById('detail');
  d.classList.add('open');
  d.innerHTML =
    '<button class="back" onclick="closeDetail()">← ' + (_i18n.back || '') + '</button>' +
    '<h2>' + esc(i.name) + '</h2>' +
    '<div class="badges">' + badges(i) + '</div>' +
    '<div class="meta">' + (_i18n.byAuthor || '') + ' ' + esc(i.author) + ' · v' + esc(i.version) + '</div>' +
    '<p class="desc">' + esc(i.description) + '</p>' +
    '<button class="btn-install" onclick="install(\\'' + i.id + '\\')">' + (_i18n.install || '') + '</button>';
}

function closeDetail() {
  document.getElementById('detail').classList.remove('open');
  document.getElementById('browse').style.display = '';
}

function install(id) {
  vscode.postMessage({ type: 'install', id });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
</script>
</body>
</html>`;
}
