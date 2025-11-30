//serverView.ts:
import * as vscode from 'vscode';

export class ServerViewProvider implements vscode.WebviewViewProvider {
  private views = new Set<vscode.WebviewView>();
  private favorites: string[] = [];
  private history: string[] = [];

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly onSend: (text: string) => void
  ) {
    this.favorites = ctx.workspaceState.get<string[]>('pawnpro.server.favorites', []) ?? [];
    this.history   = ctx.workspaceState.get<string[]>('pawnpro.server.history',   []) ?? [];
  }

  // ── persistência/snapshot ────────────────────────────────────────────────────
  private save() {
    void this.ctx.workspaceState.update('pawnpro.server.favorites', this.favorites);
    void this.ctx.workspaceState.update('pawnpro.server.history',   this.history);
  }
  private snapshot() {
    return {
      favorites: [...this.favorites],
      history:   [...this.history],
    };
  }
  private broadcast() {
    for (const v of this.views) this.postState(v);
  }
  private postState(view: vscode.WebviewView) {
    view.webview.postMessage({ type: 'state', payload: this.snapshot() });
  }

  // ── helpers de estado ───────────────────────────────────────────────────────
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
    this.history = this.unshiftUnique(this.history, cmd, 200);
    this.save();
    this.broadcast();
  }

  private addFavorite(cmd: string) {
    this.favorites = this.unshiftUnique(this.favorites, cmd);
    this.save();
    this.broadcast();
  }

  private removeFavorite(cmd: string) {
    this.favorites = this.favorites.filter(c => c !== cmd);
    this.save();
    this.broadcast();
  }

  private clearHistory() {
    this.history = [];
    this.save();
    this.broadcast();
  }

  private clearFavorites() {
    this.favorites = [];
    this.save();
    this.broadcast();
  }

  // ── webview lifecycle ───────────────────────────────────────────────────────
  resolveWebviewView(view: vscode.WebviewView) {
    this.views.add(view);
    view.onDidDispose(() => this.views.delete(view));

    view.webview.options = { enableScripts: true };
    view.webview.html = this.getHtml(view.webview);
    this.postState(view); // hidrata a UI

    view.webview.onDidReceiveMessage((msg: any) => {
      if (!msg || typeof msg !== 'object') return;
      switch (msg.type) {
        case 'requestState':
          this.postState(view);
          break;
        case 'send': {
          const line = typeof msg.text === 'string' ? msg.text.trim() : '';
          if (!line) break;
          this.onSend(line);
          this.record(line); // histórico compartilhado
          break;
        }
        case 'addFavorite': {
          const cmd = typeof msg.command === 'string' ? msg.command.trim() : '';
          if (cmd) this.addFavorite(cmd);
          break;
        }
        case 'removeFavorite': {
          const cmd = typeof msg.command === 'string' ? msg.command.trim() : '';
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
  body { margin:0; padding: var(--pad); background: var(--bg); color: var(--fg); font: 12px/1.4 var(--vscode-font-family); }
  .row { display: flex; gap: 6px; }
  input[type="text"]{
    flex: 1; padding: 6px 8px; border-radius: var(--radius);
    border: 1px solid var(--vscode-input-border, var(--border));
    background: var(--input-bg); color: var(--input-fg); outline: none;
  }
  button {
    padding: 6px 10px; border-radius: var(--radius); border: 1px solid var(--border);
    background: var(--btn-bg); color: var(--btn-fg); cursor: pointer;
  }
  button:hover { background: var(--btn-hover); }
  .hint { margin-top: 6px; color: var(--hint); }

  .section {
    margin-top: 10px; border: 1px solid var(--list-border); border-radius: var(--radius); background: var(--list-bg);
    padding: 6px;
  }
  .section-header{
    display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;
    font-weight: 600; opacity:.9;
  }
  .items { display: grid; gap: 4px; max-height: 180px; overflow: auto; }
  .empty { opacity:.7; font-style: italic; }

  .cmd-row {
    display:flex; gap:6px; align-items:center;
    padding: 4px 6px; border-radius: 6px; border: 1px solid transparent;
    background: transparent;
  }
  .cmd-row:hover { border-color: var(--border); background: rgba(255,255,255,.04); }
  .cmd-text {
    flex:1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .mini {
    padding: 3px 6px; font-size: 11px;
    border-radius: 6px;
  }
  .ghost {
    background: transparent; border-color: var(--list-border); color: var(--fg);
  }
  .ghost:hover { background: rgba(255,255,255,.06); }
  .muted { color: var(--muted); }
</style>
</head>
<body>
  <div class="row">
    <input id="cmd" type="text" placeholder="Digite um comando do servidor e pressione Enter..." />
    <button id="send" title="Enviar para o servidor">Enviar</button>
  </div>
  <div class="hint">Dica: ↑/↓ percorrem o histórico • Clique em um item para reutilizar • ⭐ fixa nos Favoritos</div>

  <div class="section" id="fav-sec">
    <div class="section-header">
      <span>Favoritos</span>
      <div>
        <button id="favClear" class="mini ghost">Limpar</button>
      </div>
    </div>
    <div id="favItems" class="items"><div class="empty">Nenhum favorito.</div></div>
  </div>

  <div class="section">
    <div class="section-header">
      <span>Últimos comandos</span>
      <div>
        <button id="histClear" class="mini ghost">Limpar</button>
      </div>
    </div>
    <div id="histItems" class="items"><div class="empty">Sem histórico ainda.</div></div>
  </div>

<script>
  const vscode = acquireVsCodeApi();
  const $ = sel => document.querySelector(sel);

  const input = $('#cmd');
  const btn = $('#send');
  const histItems = $('#histItems');
  const favItems  = $('#favItems');
  const histClear = $('#histClear');
  const favClear  = $('#favClear');

  let history = [];
  let favorites = [];
  let cursor = -1;

  function mkCmdRow(text, opts = {}) {
    const row = document.createElement('div');
    row.className = 'cmd-row';

    const span = document.createElement('div');
    span.className = 'cmd-text';
    span.title = text;
    span.textContent = text;
    row.appendChild(span);

    if (opts.star !== undefined) {
      const star = document.createElement('button');
      star.className = 'mini ghost';
      star.textContent = opts.star ? '⭐' : '☆';
      star.title = opts.star ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
      star.addEventListener('click', (e) => {
        e.stopPropagation();
        vscode.postMessage({
          type: opts.star ? 'removeFavorite' : 'addFavorite',
          command: text
        });
      });
      row.appendChild(star);
    }

    if (opts.send !== false) {
      const send = document.createElement('button');
      send.className = 'mini';
      send.textContent = 'Enviar';
      send.title = 'Enviar para o servidor';
      send.addEventListener('click', (e) => {
        e.stopPropagation();
        sendCmd(text);
      });
      row.appendChild(send);
    }

    // Clique na linha: copiar para o input
    row.addEventListener('click', () => {
      input.value = text;
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
      div.textContent = 'Nenhum favorito.';
      favItems.appendChild(div);
      return;
    }
    favorites.forEach(cmd => {
      const row = mkCmdRow(cmd, { star: true });
      favItems.appendChild(row);
    });
  }

  function renderHistory() {
    histItems.innerHTML = '';
    if (!history.length) {
      const div = document.createElement('div');
      div.className = 'empty';
      div.textContent = 'Sem histórico ainda.';
      histItems.appendChild(div);
      return;
    }
    history.forEach((cmd) => {
      const isFav = favorites.includes(cmd);
      const row = mkCmdRow(cmd, { star: isFav ? true : false });
      histItems.appendChild(row);
    });
  }

  function applyState(payload) {
    const p = payload || {};
    history = Array.isArray(p.history) ? p.history : [];
    favorites = Array.isArray(p.favorites) ? p.favorites : [];
    cursor = -1;
    renderFavorites();
    renderHistory();
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

    // Histórico ↑/↓
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!history.length) return;
      if (e.key === 'ArrowUp') {
        if (cursor < history.length - 1) cursor++;
      } else {
        if (cursor > -1) cursor--;
      }
      if (cursor === -1) {
        input.value = '';
      } else {
        input.value = history[cursor];
      }
      setTimeout(() => input.setSelectionRange(input.value.length, input.value.length), 0);
    }
  });

  histClear.addEventListener('click', () => {
    vscode.postMessage({ type: 'clearHistory' });
    input.focus();
  });

  favClear.addEventListener('click', () => {
    vscode.postMessage({ type: 'clearFavorites' });
    input.focus();
  });

  // recebe estado do provider
  window.addEventListener('message', (ev) => {
    const { type, payload } = ev.data || {};
    if (type === 'state') applyState(payload);
  });

  // solicita estado inicial
  vscode.postMessage({ type: 'requestState' });

  // foco inicial
  input.focus();
</script>
</body>
</html>`;
  }
}