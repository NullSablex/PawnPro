import * as vscode from 'vscode';
import { PawnProStateManager } from '../core/state.js';
import type { PawnProConfigManager } from '../core/config.js';
import { createWebviewMsg } from './webviewNls.js';

/**
 * Ícone de envio, desenhado inline.
 *
 * A fonte de codicons do editor não chega à WebView (o CSP é
 * `default-src 'none'`, sem `font-src`), então o traço vem no próprio HTML.
 * `currentColor` faz o ícone acompanhar a cor do botão em qualquer tema.
 */
const ICON_SEND = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
  <path d="M1.7 1.2 14.8 7.6a.45.45 0 0 1 0 .8L1.7 14.8a.45.45 0 0 1-.64-.5l1.3-5.2L8.6 8 2.36 6.9l-1.3-5.2a.45.45 0 0 1 .64-.5Z"/>
</svg>`;

/**
 * Estrela dos favoritos, em dois estados.
 *
 * O emoji `⭐`/`☆` traz cor própria (ignora o tema) e o contorno é fino a ponto
 * de sumir no fundo do painel — daí o traço próprio, preenchido quando marcado
 * e contornado quando não.
 */
const STAR_PATH =
  'M8 1.6l1.9 4 4.3.6-3.1 3 .75 4.3L8 11.5l-3.85 2 .75-4.3-3.1-3 4.3-.6z';
const ICON_STAR_ON = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
  <path d="${STAR_PATH}"/>
</svg>`;
const ICON_STAR_OFF = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
  <path d="${STAR_PATH}" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
</svg>`;

/**
 * Escapa texto para interpolação em HTML.
 *
 * As strings vêm dos bundles de tradução e caem tanto em texto quanto dentro
 * de atributos (`title`, `placeholder`), onde uma aspa fecharia o atributo.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escapa e converte os trechos entre crases em `<code>`.
 *
 * A ordem importa: escapar primeiro e marcar depois garante que só as tags
 * geradas aqui cheguem ao HTML — um `<` vindo da tradução já virou `&lt;`.
 */
function escWithCode(value: string): string {
  return esc(value).replace(/`([^`]+)`/g, '<code>$1</code>');
}

export class ServerViewProvider implements vscode.WebviewViewProvider {
  private views = new Set<vscode.WebviewView>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly config: PawnProConfigManager,
    private readonly state: PawnProStateManager,
    private readonly onSend: (text: string) => void,
  ) {}

  /** Re-renderiza as views abertas — usado quando `ui.locale` muda. */
  refresh() {
    for (const v of this.views) v.webview.html = this.getHtml(v.webview);
  }

  private get favorites(): string[] { return this.state.get('server').favorites; }
  private get history(): string[] { return this.state.get('server').history; }

  private save(favorites: string[], history: string[]) {
    this.state.update('server', { favorites, history });
  }

  private snapshot() {
    return { favorites: [...this.favorites], history: [...this.history] };
  }

  private broadcast() {
    for (const v of this.views) this.postState(v);
  }

  private postState(view: vscode.WebviewView) {
    view.webview.postMessage({ type: 'state', payload: this.snapshot() });
  }

  private unshiftUnique(arr: string[], item: string, limit?: number): string[] {
    const s = (item || '').trim();
    if (!s) return arr;
    const filtered = arr.filter(v => v !== s);
    filtered.unshift(s);
    if (typeof limit === 'number' && limit > 0 && filtered.length > limit) {
      filtered.length = limit;
    }
    return filtered;
  }

  private record(cmd: string) {
    const newHistory = this.unshiftUnique([...this.history], cmd, 200);
    this.save(this.favorites, newHistory);
    this.broadcast();
  }

  private addFavorite(cmd: string) {
    const newFavs = this.unshiftUnique([...this.favorites], cmd);
    this.save(newFavs, this.history);
    this.broadcast();
  }

  private removeFavorite(cmd: string) {
    const newFavs = this.favorites.filter(c => c !== cmd);
    this.save(newFavs, this.history);
    this.broadcast();
  }

  private clearHistory() {
    this.save(this.favorites, []);
    this.broadcast();
  }

  private clearFavorites() {
    this.save([], this.history);
    this.broadcast();
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this.views.add(view);
    view.onDidDispose(() => this.views.delete(view));

    view.webview.options = { enableScripts: true };
    view.webview.html = this.getHtml(view.webview);
    this.postState(view);

    view.webview.onDidReceiveMessage((raw: unknown) => {
      if (!raw || typeof raw !== 'object') return;
      const msg = raw as Record<string, unknown>;
      switch (msg['type']) {
        case 'requestState':
          this.postState(view);
          break;
        case 'send': {
          const line = typeof msg['text'] === 'string' ? msg['text'].trim() : '';
          if (!line) break;
          this.onSend(line);
          this.record(line);
          break;
        }
        case 'addFavorite': {
          const cmd = typeof msg['command'] === 'string' ? msg['command'].trim() : '';
          if (cmd) this.addFavorite(cmd);
          break;
        }
        case 'removeFavorite': {
          const cmd = typeof msg['command'] === 'string' ? msg['command'].trim() : '';
          if (cmd) this.removeFavorite(cmd);
          break;
        }
        case 'clearHistory':
          this.clearHistory();
          break;
        case 'clearFavorites':
          this.clearFavorites();
          break;
      }
    });
  }

  private getHtml(webview: vscode.Webview) {
    const msg = createWebviewMsg(this.context, this.config);
    const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src ${webview.cspSource}; script-src 'unsafe-inline';`;
    return `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root {
    --pad: 8px;
    /* Escala de espaçamento: os valores eram avulsos (6, 10, 4...) e o
       ritmo vertical saía irregular. */
    --gap-xs: 4px;
    --gap-sm: 6px;
    --gap-md: 10px;
    /* Altura dos controles da primeira linha e recuo do texto dentro deles —
       a legenda alinha por este mesmo valor. */
    --control-h: 28px;
    --control-pad: 9px;
    --radius: 8px;
    --bg: var(--vscode-sideBar-background);
    --fg: var(--vscode-foreground);
    --border: var(--vscode-panel-border);
    --btn-bg: var(--vscode-button-background);
    --btn-fg: var(--vscode-button-foreground);
    --btn-hover: var(--vscode-button-hoverBackground);
    --input-bg: var(--vscode-input-background);
    --input-fg: var(--vscode-input-foreground);
    --hint: var(--vscode-descriptionForeground);
    --list-bg: var(--vscode-editorWidget-background);
    --list-border: var(--vscode-widget-border);
    --muted: var(--vscode-descriptionForeground);
  }
  * { box-sizing: border-box; }
  body {
    margin:0; padding: var(--pad); background: var(--bg); color: var(--fg);
    font: 12px/1.4 var(--vscode-font-family);
    /* A unidade vw mede a janela inteira, não este painel: numa janela
       estreita as fontes encolhiam mesmo havendo espaço aqui. Declarar o
       container faz as consultas abaixo medirem o painel. */
    container-type: inline-size;
  }
  .row { display: flex; gap: var(--gap-sm); align-items: stretch; }
  input[type="text"]{
    flex: 1 1 auto; min-width: 0; height: var(--control-h);
    padding: 0 var(--control-pad);
    border-radius: var(--radius);
    border: 1px solid var(--vscode-input-border, var(--border));
    background: var(--input-bg); color: var(--input-fg); outline: none;
  }
  button {
    padding: var(--gap-sm) var(--gap-md); border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--btn-bg); color: var(--btn-fg); cursor: pointer;
  }
  button:hover { background: var(--btn-hover); }
  /* Legenda do campo: colada nele e alinhada ao texto do input, para ser
     lida como parte do campo e não como um aviso solto. */
  .hint {
    margin: var(--gap-xs) 0 0; padding-left: var(--control-pad);
    color: var(--hint); font-size: 11px;
  }
  .hint code {
    padding: 0 3px; border-radius: 3px;
    background: var(--vscode-textCodeBlock-background, rgba(255,255,255,.07));
    font-family: var(--vscode-editor-font-family, monospace); font-size: 10px;
  }
  .section {
    /* O recuo interno vive numa variável própria porque as abas se estendem
       até a borda cancelando-o; mudar um sem o outro desalinharia a régua. */
    --section-pad: var(--gap-sm);
    margin-top: var(--gap-md); border: 1px solid var(--list-border);
    border-radius: var(--radius); background: var(--list-bg);
    padding: var(--section-pad);
  }
  .items { display: grid; gap: var(--gap-xs); max-height: 180px; overflow: auto; }
  .empty { opacity:.7; font-style: italic; }
  .cmd-row {
    display: flex; gap: var(--gap-sm); align-items: center;
    padding: var(--gap-xs) var(--gap-sm); border-radius: 6px;
    border: 1px solid transparent;
    background: transparent;
  }
  .cmd-row:hover { border-color: var(--border); background: rgba(255,255,255,.04); }
  .cmd-text { flex:1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mini { padding: 3px var(--gap-sm); font-size: 11px; border-radius: 6px; }
  .ghost { background: transparent; border-color: var(--list-border); color: var(--fg); }
  .ghost:hover { background: rgba(255,255,255,.06); }
  .muted { color: var(--muted); }

  /* Botão de enviar: só o ícone, quadrado e alinhado à altura do input. */
  .icon-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 30px; height: var(--control-h); padding: 0; flex: 0 0 auto;
  }
  .icon-btn svg { width: 14px; height: 14px; fill: currentColor; }
  /* Nas linhas da lista os botões são menores, e o ícone acompanha — sem
     isso o traço fica maior que o botão. */
  .cmd-row .icon-btn { width: 24px; height: 22px; }
  .cmd-row .icon-btn svg { width: 13px; height: 13px; }

  /* A estrela precisa se distinguir do fundo em ambos os estados: contorno
     apagado quando não é favorito, cheia e destacada quando é. */
  .star-btn { color: var(--muted); }
  .star-btn:hover { color: var(--fg); }
  .star-btn.is-on { color: var(--vscode-charts-yellow, #d7ba7d); }
  .star-btn.is-on:hover { color: var(--vscode-charts-yellow, #d7ba7d); opacity: .8; }

  /* Abas: Recentes e Favoritos dividem o mesmo espaço.
     O painel lateral pode ficar bem estreito, então os rótulos encolhem
     truncam antes de empurrar o "Limpar" para fora. */
  .tabs {
    display: flex; align-items: stretch; gap: 2px;
    /* Puxa a régua até as bordas do bloco: a aba ativa passa a sentar sobre
       uma linha que atravessa o painel, em vez de flutuar num traço curto. */
    margin: calc(var(--section-pad) * -1) calc(var(--section-pad) * -1) var(--gap-sm);
    padding: 0 var(--section-pad);
    border-bottom: 1px solid var(--list-border);
  }
  .tab {
    min-width: 0; flex: 0 1 auto;
    padding: 5px var(--gap-md);
    border: none; border-bottom: 2px solid transparent; border-radius: 0;
    background: transparent; color: var(--muted);
    font-size: 12px; font-weight: 600;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    cursor: pointer;
  }
  .tab:hover { background: rgba(255,255,255,.04); color: var(--fg); }
  .tab[aria-selected="true"] {
    color: var(--fg);
    border-bottom-color: var(--vscode-focusBorder, var(--btn-bg));
  }
  .tab-count { margin-left: var(--gap-xs); opacity: .7; font-weight: 400; }
  .tab-actions { margin-left: auto; display: flex; align-items: center; flex: 0 0 auto; }
  .tab-actions .mini { white-space: nowrap; }
  [hidden] { display: none !important; }

  /* Só quando o painel em si aperta é que algo cede — primeiro o respiro
     lateral, depois a contagem, que é o menos essencial. O rótulo mantém o
     tamanho: é ele que identifica a aba. */
  @container (max-width: 230px) {
    .tab { padding: 5px var(--gap-sm); }
    .tab-actions .mini { padding: 3px 5px; }
  }
  @container (max-width: 190px) {
    .tab-count { display: none; }
  }
</style>
</head>
<body>
  <div class="row">
    <input id="cmd" type="text" placeholder="${esc(msg.serverView.inputPlaceholder())}" />
    <button id="send" class="icon-btn" title="${esc(msg.serverView.send())}" aria-label="${esc(msg.serverView.send())}">
      ${ICON_SEND}
    </button>
  </div>
  <div class="hint">${escWithCode(msg.serverView.hint())}</div>

  <div class="section">
    <div class="tabs" role="tablist">
      <button id="tabHist" class="tab" role="tab" aria-selected="true" aria-controls="histItems">
        ${esc(msg.serverView.tabHistory())}<span id="histCount" class="tab-count"></span>
      </button>
      <button id="tabFav" class="tab" role="tab" aria-selected="false" aria-controls="favItems">
        ${esc(msg.serverView.tabFavorites())}<span id="favCount" class="tab-count"></span>
      </button>
      <div class="tab-actions">
        <button id="histClear" class="mini ghost">${esc(msg.serverView.clear())}</button>
        <button id="favClear" class="mini ghost" hidden>${esc(msg.serverView.clear())}</button>
      </div>
    </div>
    <div id="histItems" class="items" role="tabpanel"><div class="empty">${esc(msg.serverView.emptyHistory())}</div></div>
    <div id="favItems" class="items" role="tabpanel" hidden><div class="empty">${esc(msg.serverView.emptyFavorites())}</div></div>
  </div>

<script>
  const vscode = acquireVsCodeApi();
  // Mesmo traço do botão principal, reaproveitado nas linhas da lista.
  const ICON_MARKUP = ${JSON.stringify(ICON_SEND)};
  const ICON_STAR = { on: ${JSON.stringify(ICON_STAR_ON)}, off: ${JSON.stringify(ICON_STAR_OFF)} };
  const T = ${JSON.stringify({
    send: msg.serverView.send(),
    emptyHistory: msg.serverView.emptyHistory(),
    emptyFavorites: msg.serverView.emptyFavorites(),
    addFavorite: msg.serverView.addFavorite(),
    removeFavorite: msg.serverView.removeFavorite(),
  })};
  const $ = sel => document.querySelector(sel);
  const input = $('#cmd');
  const btn = $('#send');
  const histItems = $('#histItems');
  const favItems  = $('#favItems');
  const histClear = $('#histClear');
  const favClear  = $('#favClear');
  const tabHist   = $('#tabHist');
  const tabFav    = $('#tabFav');
  const histCount = $('#histCount');
  const favCount  = $('#favCount');

  let history = [];
  let favorites = [];
  let cursor = -1;

  function escapeAttr(s) {
    return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function mkCmdRow(text, opts = {}) {
    const safeText = String(text || '');
    const row = document.createElement('div');
    row.className = 'cmd-row';
    const span = document.createElement('div');
    span.className = 'cmd-text';
    span.setAttribute('title', escapeAttr(safeText));
    span.textContent = safeText;
    row.appendChild(span);

    if (opts.star !== undefined) {
      const star = document.createElement('button');
      star.className = 'mini ghost icon-btn star-btn';
      if (opts.star) star.classList.add('is-on');
      star.innerHTML = opts.star ? ICON_STAR.on : ICON_STAR.off;
      star.title = opts.star ? T.removeFavorite : T.addFavorite;
      star.setAttribute('aria-label', star.title);
      star.setAttribute('aria-pressed', String(!!opts.star));
      star.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({ type: opts.star ? 'removeFavorite' : 'addFavorite', command: safeText });
      });
      row.appendChild(star);
    }

    if (opts.send !== false) {
      const send = document.createElement('button');
      send.className = 'mini';
      send.innerHTML = ICON_MARKUP;
      send.classList.add('icon-btn');
      send.title = T.send;
      send.setAttribute('aria-label', T.send);
      send.addEventListener('click', (e) => { e.stopPropagation(); sendCmd(safeText); });
      row.appendChild(send);
    }

    row.addEventListener('click', () => {
      input.value = safeText;
      input.focus();
      setTimeout(() => input.setSelectionRange(input.value.length, input.value.length), 0);
    });
    return row;
  }

  function renderFavorites() {
    favItems.innerHTML = '';
    if (!favorites.length) {
      const div = document.createElement('div');
      div.className = 'empty';
      div.textContent = T.emptyFavorites;
      favItems.appendChild(div);
      return;
    }
    favorites.forEach(cmd => favItems.appendChild(mkCmdRow(cmd, { star: true })));
  }

  function renderHistory() {
    histItems.innerHTML = '';
    if (!history.length) {
      const div = document.createElement('div');
      div.className = 'empty';
      div.textContent = T.emptyHistory;
      histItems.appendChild(div);
      return;
    }
    history.forEach(cmd => histItems.appendChild(mkCmdRow(cmd, { star: favorites.includes(cmd) })));
  }

  // A aba escolhida sobrevive ao re-render; o botão "Limpar" segue a aba
  // visível, para não haver dois com o mesmo rótulo e alvos diferentes.
  function selectTab(which) {
    const fav = which === 'fav';
    tabFav.setAttribute('aria-selected', String(fav));
    tabHist.setAttribute('aria-selected', String(!fav));
    favItems.hidden = !fav;
    histItems.hidden = fav;
    favClear.hidden = !fav;
    histClear.hidden = fav;
  }

  function renderCounts() {
    histCount.textContent = history.length ? '(' + history.length + ')' : '';
    favCount.textContent = favorites.length ? '(' + favorites.length + ')' : '';
  }

  function applyState(payload) {
    const p = payload || {};
    history = Array.isArray(p.history) ? p.history : [];
    favorites = Array.isArray(p.favorites) ? p.favorites : [];
    cursor = -1;
    renderFavorites();
    renderHistory();
    renderCounts();
  }

  function sendCmd(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return;
    vscode.postMessage({ type: 'send', text: trimmed });
  }

  function sendFromInput() {
    const text = input.value.trim();
    if (!text) return;
    sendCmd(text);
    input.value = '';
    cursor = -1;
    input.focus();
  }

  btn.addEventListener('click', sendFromInput);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); sendFromInput(); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!history.length) return;
      if (e.key === 'ArrowUp') { if (cursor < history.length - 1) cursor++; }
      else { if (cursor > -1) cursor--; }
      input.value = cursor === -1 ? '' : history[cursor];
      setTimeout(() => input.setSelectionRange(input.value.length, input.value.length), 0);
    }
  });

  tabHist.addEventListener('click', () => selectTab('hist'));
  tabFav.addEventListener('click', () => selectTab('fav'));

  histClear.addEventListener('click', () => { vscode.postMessage({ type: 'clearHistory' }); input.focus(); });
  favClear.addEventListener('click', () => { vscode.postMessage({ type: 'clearFavorites' }); input.focus(); });

  window.addEventListener('message', (ev) => {
    const { type, payload } = ev.data || {};
    if (type === 'state') applyState(payload);
  });

  vscode.postMessage({ type: 'requestState' });
  input.focus();
</script>
</body>
</html>`;
  }
}
