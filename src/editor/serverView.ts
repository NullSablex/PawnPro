import * as vscode from 'vscode';
import { randomBytes } from 'crypto';
import { PawnProStateManager } from '../core/state.js';
import type { PawnProConfigManager } from '../core/config.js';
import { webviewThemeCss } from './webviewTheme.js';
import { createWebviewMsg } from './webviewNls.js';

/**
 * Ícone de envio, desenhado inline.
 *
 * A fonte de codicons do editor não chega à WebView (o CSP é
 * `default-src 'none'`, sem `font-src`), então o traço vem no próprio HTML.
 * `currentColor` faz o ícone acompanhar a cor do botão em qualquer tema.
 */
const STAR_PATH =
  'M8 1.6l1.9 4 4.3.6-3.1 3 .75 4.3L8 11.5l-3.85 2 .75-4.3-3.1-3 4.3-.6z';

/**
 * Os ícones como dados, não como markup.
 *
 * A WebView monta os nós SVG a partir disto. Entregar a string pronta exigiria
 * que o script a parseasse, e parsear markup — mesmo o nosso — é o padrão que
 * o CodeQL sinaliza e que não vale defender caso a caso.
 */
type IconPath = { d: string; attrs?: Record<string, string> };

const STROKE = (width: string): Record<string, string> => ({
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': width,
  'stroke-linejoin': 'round',
});

const ICON_SEND: IconPath[] = [
  { d: 'M1.7 1.2 14.8 7.6a.45.45 0 0 1 0 .8L1.7 14.8a.45.45 0 0 1-.64-.5l1.3-5.2L8.6 8 2.36 6.9l-1.3-5.2a.45.45 0 0 1 .64-.5Z' },
];

/**
 * Estrela dos favoritos, em dois estados.
 *
 * O emoji `⭐`/`☆` traz cor própria (ignora o tema) e o contorno é fino a ponto
 * de sumir no fundo do painel — daí o traço próprio, preenchido quando marcado
 * e contornado quando não.
 */
const ICON_STAR_ON: IconPath[] = [{ d: STAR_PATH }];
const ICON_STAR_OFF: IconPath[] = [{ d: STAR_PATH, attrs: STROKE('1.3') }];

/** Estrela contornada, em tamanho grande, para o estado vazio dos favoritos. */
const ICON_EMPTY_STAR: IconPath[] = [{ d: STAR_PATH, attrs: STROKE('1') }];

/** Terminal, para o estado vazio do histórico. */
const ICON_EMPTY_HISTORY: IconPath[] = [
  { d: 'M2 2.5A1.5 1.5 0 0 1 3.5 1h9A1.5 1.5 0 0 1 14 2.5v11a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5v-11Zm1.5-.5a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-11a.5.5 0 0 0-.5-.5h-9Z' },
  { d: 'M4.6 5.15a.5.5 0 0 1 .7-.05L7.9 7.3a.5.5 0 0 1 0 .76L5.3 10.3a.5.5 0 0 1-.65-.76L6.8 7.68 4.65 5.85a.5.5 0 0 1-.05-.7ZM8.5 10a.5.5 0 0 1 .5-.5h2.5a.5.5 0 0 1 0 1H9a.5.5 0 0 1-.5-.5Z' },
];

/** Lupa, para quando a busca não encontra nada. */
const ICON_EMPTY_SEARCH: IconPath[] = [
  { d: 'M6.75 1.5a5.25 5.25 0 1 0 3.2 9.41l3.42 3.42a.75.75 0 0 0 1.06-1.06l-3.42-3.42A5.25 5.25 0 0 0 6.75 1.5Zm-3.75 5.25a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0Z' },
];

/** X: limpar o texto da busca. */
const ICON_CLOSE: IconPath[] = [
  { d: 'M4.3 3.3 8 7l3.7-3.7a.7.7 0 1 1 1 1L9 8l3.7 3.7a.7.7 0 1 1-1 1L8 9l-3.7 3.7a.7.7 0 1 1-1-1L7 8 3.3 4.3a.7.7 0 0 1 1-1Z' },
];

/** O mesmo ícone como markup, para os pontos do HTML servido pela extensão. */
function iconMarkup(paths: IconPath[]): string {
  const body = paths
    .map((p) => {
      const attrs = Object.entries(p.attrs ?? {})
        .map(([k, v]) => ` ${k}="${v}"`)
        .join('');
      return `<path d="${p.d}"${attrs}/>`;
    })
    .join('');
  return `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** Lixeira: limpar a lista da aba visível. */
const ICON_TRASH = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
  <path d="M6.5 1a.5.5 0 0 0-.5.5V2H3a.5.5 0 0 0 0 1h.44l.63 10.06A1.5 1.5 0 0 0 5.57 14.5h4.86a1.5 1.5 0 0 0 1.5-1.44L12.56 3H13a.5.5 0 0 0 0-1h-3v-.5a.5.5 0 0 0-.5-.5h-3ZM7 2h2v-.5H7V2Zm-.44 3a.5.5 0 0 1 .5.47l.3 6a.5.5 0 1 1-1 .06l-.3-6a.5.5 0 0 1 .5-.53Zm2.88 0a.5.5 0 0 1 .5.53l-.3 6a.5.5 0 1 1-1-.06l.3-6a.5.5 0 0 1 .5-.47Z"/>
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
 * Comandos cujo nome já indica credencial.
 *
 * O histórico e os favoritos vão para `.pawnpro/state.json`, em texto claro e
 * dentro do projeto — um `login` ali seria commitado junto. O comando ainda é
 * enviado; só não fica registrado.
 */
const SENSITIVE_COMMANDS = [
  /^login(\s|$)/i,
  /^rcon_password(\s|$)/i,
  /^password(\s|$)/i,
  /^changepass(word)?(\s|$)/i,
  /^setpass(word)?(\s|$)/i,
];

/**
 * Palavras que, num argumento, anunciam que o próximo termo é credencial —
 * `meucomando --senha 1234`, `auth token abc`.
 */
const SECRET_LABELS =
  /^-{0,2}(pass|passwd|password|senha|pwd|token|key|chave|secret|segredo|auth|apikey)$/i;

/**
 * `true` se o termo parece uma credencial solta.
 *
 * Deliberadamente conservador: só entra o que mistura letras e dígitos e é
 * longo o suficiente. Um `kick 0`, um `weather 11` ou um `setpos 1.5 -2.0`
 * são argumentos comuns e não podem sumir do histórico por engano — o custo
 * de um falso positivo aqui é o recurso deixar de servir.
 */
function looksLikeSecret(termo: string): boolean {
  if (termo.length < 8) return false;
  if (/^[\d.,:-]+$/.test(termo)) return false;          // números, ip, coordenada
  if (!/[a-z]/i.test(termo) || !/\d/.test(termo)) return false;
  return true;
}

/**
 * `true` se o comando traz credencial e não deve ser guardado.
 *
 * Três camadas: o nome do comando, os comandos que o projeto declarou em
 * `server.history.sensitiveCommands`, e um argumento que se anuncie como
 * segredo ou pareça um.
 */
export function isSensitiveCommand(cmd: string, extras: string[] = []): boolean {
  const t = cmd.trim().replace(/^\/?rcon\s+/i, '');
  if (!t) return false;
  if (SENSITIVE_COMMANDS.some(rx => rx.test(t))) return true;

  const parts = t.split(/\s+/);
  const head = parts[0].toLowerCase();
  if (extras.some(e => e.trim().toLowerCase() === head)) return true;

  for (let i = 1; i < parts.length; i++) {
    // `--senha 1234`: o rótulo entrega o próximo termo.
    if (SECRET_LABELS.test(parts[i]) && i + 1 < parts.length) return true;
    // `--senha=1234` num termo só.
    const [key, ...rest] = parts[i].split('=');
    if (rest.length > 0 && SECRET_LABELS.test(key)) return true;
    if (looksLikeSecret(parts[i])) return true;
  }
  return false;
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

  /**
   * Remove do estado gravado o que hoje seria recusado.
   *
   * Antes da filtragem, um `login <senha>` podia ter sido guardado em
   * `.pawnpro/state.json`; limpar só na escrita deixaria esses registros para
   * trás, no arquivo e à vista no painel.
   */
  private purgeSensitive() {
    const cfg = this.historyCfg;
    // Com o registro desligado, não basta parar de gravar: o que já está lá
    // precisa sair.
    if (!cfg.enabled) {
      if (this.favorites.length || this.history.length) this.save([], []);
      return;
    }
    const extras = cfg.sensitiveCommands;
    const favs = this.favorites.filter(c => !isSensitiveCommand(c, extras));
    const hist = this.history.filter(c => !isSensitiveCommand(c, extras));
    if (favs.length !== this.favorites.length || hist.length !== this.history.length) {
      this.save(favs, hist);
    }
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

  /** Ajustes de histórico do projeto, com o padrão quando não configurados. */
  private get historyCfg() {
    return this.config.getAll().server.history ?? { enabled: true, sensitiveCommands: [] };
  }

  private record(cmd: string) {
    const cfg = this.historyCfg;
    if (!cfg.enabled) return;
    if (isSensitiveCommand(cmd, cfg.sensitiveCommands)) return;
    const newHistory = this.unshiftUnique([...this.history], cmd, 200);
    this.save(this.favorites, newHistory);
    this.broadcast();
  }

  private addFavorite(cmd: string) {
    if (isSensitiveCommand(cmd, this.historyCfg.sensitiveCommands)) return;
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
    // Limpa o que foi gravado antes desta filtragem existir.
    this.purgeSensitive();
    this.views.add(view);
    view.onDidDispose(() => this.views.delete(view));

    view.webview.options = {
      enableScripts: true,
      // Permite carregar a folha de estilo minificada de out/assets/.
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'out', 'assets')],
    };
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
    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'out', 'assets', 'css', 'server.min.css'),
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'out', 'assets', 'js', 'server.min.js'),
    );
    // Nonce por render: com ele o CSP libera SÓ o script que a extensão gerou,
    // em vez do 'unsafe-inline', que permitiria qualquer injeção.
    const nonce = randomBytes(16).toString('base64');
    const msg = createWebviewMsg(this.context, this.config);
    // `cspSource` libera a folha de estilo servida de out/assets/; o
    // 'unsafe-inline' permanece para o <style> com a cor de destaque.
    const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource}; script-src 'nonce-${nonce}';`;
    return `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="${cssUri}">
<style>
${webviewThemeCss(this.config)}
</style>
</head>
<body>
  <div class="row">
    <input id="cmd" type="text" placeholder="${esc(msg.serverView.inputPlaceholder())}" />
    <button id="send" class="icon-btn" title="${esc(msg.serverView.send())}" aria-label="${esc(msg.serverView.send())}">
      ${iconMarkup(ICON_SEND)}
    </button>
  </div>

  <div class="section">
    <div class="tabs" role="tablist">
      <button id="tabHist" class="tab" role="tab" aria-selected="true" aria-controls="histItems">
        ${esc(msg.serverView.tabHistory())}<span id="histCount" class="tab-count"></span>
      </button>
      <button id="tabFav" class="tab" role="tab" aria-selected="false" aria-controls="favItems">
        ${esc(msg.serverView.tabFavorites())}<span id="favCount" class="tab-count"></span>
      </button>
      <div class="tab-actions">
        <button id="histClear" class="tab-action" title="${esc(msg.serverView.clear())}" aria-label="${esc(msg.serverView.clear())}">${ICON_TRASH}</button>
        <button id="favClear" class="tab-action" title="${esc(msg.serverView.clear())}" aria-label="${esc(msg.serverView.clear())}" hidden>${ICON_TRASH}</button>
      </div>
    </div>
    <div id="searchBox" class="search-box" hidden>
      <input id="search" class="search" type="text" placeholder="${esc(msg.serverView.search())}" aria-label="${esc(msg.serverView.search())}" />
      <button id="searchClear" class="search-clear" title="${esc(msg.serverView.clearSearch())}" aria-label="${esc(msg.serverView.clearSearch())}" hidden>${iconMarkup(ICON_CLOSE)}</button>
    </div>
    <div id="histItems" class="items" role="tabpanel"></div>
    <div id="favItems" class="items" role="tabpanel" hidden></div>
    <button id="loadMore" class="mini ghost load-more" hidden>${esc(msg.serverView.loadMore())}</button>
  </div>

<!-- Dados para o script: ícones e traduções são da extensão, e um arquivo
     externo não pode interpolá-los. O tipo application/json não é executável,
     então o CSP o permite sem nonce. -->
<script id="dados-painel" type="application/json">${JSON.stringify({
      icons: {
        send: ICON_SEND,
        starOn: ICON_STAR_ON,
        starOff: ICON_STAR_OFF,
        empty: {
          hist: ICON_EMPTY_HISTORY,
          fav: ICON_EMPTY_STAR,
          search: ICON_EMPTY_SEARCH,
        },
      },
      i18n: {
        send: msg.serverView.send(),
        emptyHistory: msg.serverView.emptyHistory(),
        emptyFavorites: msg.serverView.emptyFavorites(),
        addFavorite: msg.serverView.addFavorite(),
        removeFavorite: msg.serverView.removeFavorite(),
        noMatches: msg.serverView.noMatches(),
        noMatchesHint: msg.serverView.noMatchesHint(),
        emptyHistoryHint: msg.serverView.emptyHistoryHint(),
        emptyFavoritesHint: msg.serverView.emptyFavoritesHint(),
      },
    })}</script>
<script nonce="${nonce}" src="${jsUri}"></script>
</body>
</html>`;
  }
}
