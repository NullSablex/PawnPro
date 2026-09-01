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

/** Estrela contornada, em tamanho grande, para o estado vazio dos favoritos. */
const ICON_EMPTY_STAR = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
  <path d="${STAR_PATH}" fill="none" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>
</svg>`;

/** Terminal, para o estado vazio do histórico. */
const ICON_EMPTY_HISTORY = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
  <path d="M2 2.5A1.5 1.5 0 0 1 3.5 1h9A1.5 1.5 0 0 1 14 2.5v11a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5v-11Zm1.5-.5a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-11a.5.5 0 0 0-.5-.5h-9Z"/>
  <path d="M4.6 5.15a.5.5 0 0 1 .7-.05L7.9 7.3a.5.5 0 0 1 0 .76L5.3 10.3a.5.5 0 0 1-.65-.76L6.8 7.68 4.65 5.85a.5.5 0 0 1-.05-.7ZM8.5 10a.5.5 0 0 1 .5-.5h2.5a.5.5 0 0 1 0 1H9a.5.5 0 0 1-.5-.5Z"/>
</svg>`;

/** Lupa, para quando a busca não encontra nada. */
const ICON_EMPTY_SEARCH = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
  <path d="M6.75 1.5a5.25 5.25 0 1 0 3.2 9.41l3.42 3.42a.75.75 0 0 0 1.06-1.06l-3.42-3.42A5.25 5.25 0 0 0 6.75 1.5Zm-3.75 5.25a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0Z"/>
</svg>`;

/** X: limpar o texto da busca. */
const ICON_CLOSE = `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
  <path d="M4.3 3.3 8 7l3.7-3.7a.7.7 0 1 1 1 1L9 8l3.7 3.7a.7.7 0 1 1-1 1L8 9l-3.7 3.7a.7.7 0 1 1-1-1L7 8 3.3 4.3a.7.7 0 0 1 1-1Z"/>
</svg>`;

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
const COMANDOS_SENSIVEIS = [
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
const ROTULOS_DE_SEGREDO =
  /^-{0,2}(pass|passwd|password|senha|pwd|token|key|chave|secret|segredo|auth|apikey)$/i;

/**
 * `true` se o termo parece uma credencial solta.
 *
 * Deliberadamente conservador: só entra o que mistura letras e dígitos e é
 * longo o suficiente. Um `kick 0`, um `weather 11` ou um `setpos 1.5 -2.0`
 * são argumentos comuns e não podem sumir do histórico por engano — o custo
 * de um falso positivo aqui é o recurso deixar de servir.
 */
function pareceSegredo(termo: string): boolean {
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
  if (COMANDOS_SENSIVEIS.some(rx => rx.test(t))) return true;

  const termos = t.split(/\s+/);
  const nome = termos[0].toLowerCase();
  if (extras.some(e => e.trim().toLowerCase() === nome)) return true;

  for (let i = 1; i < termos.length; i++) {
    // `--senha 1234`: o rótulo entrega o próximo termo.
    if (ROTULOS_DE_SEGREDO.test(termos[i]) && i + 1 < termos.length) return true;
    // `--senha=1234` num termo só.
    const [chave, ...resto] = termos[i].split('=');
    if (resto.length > 0 && ROTULOS_DE_SEGREDO.test(chave)) return true;
    if (pareceSegredo(termos[i])) return true;
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
    /* Altura mínima de uma linha da lista, para todas ficarem iguais. */
    --row-h: 30px;
    --radius: 8px;
    --bg: var(--vscode-sideBar-background);
    --fg: var(--vscode-foreground);
    --border: var(--vscode-panel-border);
    --btn-bg: var(--vscode-button-background);
    --btn-fg: var(--vscode-button-foreground);
    --btn-hover: var(--vscode-button-hoverBackground);
    --input-bg: var(--vscode-input-background);
    --input-fg: var(--vscode-input-foreground);
    --list-bg: var(--vscode-editorWidget-background);
    --list-border: var(--vscode-widget-border);
    --muted: var(--vscode-descriptionForeground);
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin:0; padding: var(--pad); background: var(--bg); color: var(--fg);
    font: 12px/1.4 var(--vscode-font-family);
    /* O painel inteiro é uma coluna: a lista fica com a altura que sobra, e
       só ela rola. Sem isso o body rolava por fora enquanto a lista rolava
       por dentro — dois scrolls concorrendo no mesmo gesto. */
    display: flex; flex-direction: column; overflow: hidden;
    /* A unidade vw mede a janela inteira, não este painel: numa janela
       estreita as fontes encolhiam mesmo havendo espaço aqui. Declarar o
       container faz as consultas abaixo medirem o painel. */
    container-type: inline-size;
  }
  .row { display: flex; gap: var(--gap-sm); align-items: stretch; flex: 0 0 auto; }
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
  .section {
    /* O recuo interno vive numa variável própria porque as abas se estendem
       até a borda cancelando-o; mudar um sem o outro desalinharia a régua. */
    --section-pad: var(--gap-sm);
    margin-top: var(--gap-md); border: 1px solid var(--list-border);
    border-radius: var(--radius); background: var(--list-bg);
    padding: var(--section-pad);
    /* Ocupa a altura restante e não deixa o conteúdo empurrá-lo além dela. */
    display: flex; flex-direction: column;
    flex: 1 1 auto; min-height: 0;
  }
  /* A barra usa as cores do tema, em vez da padrão do navegador — larga e
     clara, destoando do painel. */
  .items {
    display: grid; gap: var(--gap-xs); align-content: start;
    /* A altura vem do espaço disponível, não de um número fixo de linhas:
       alargar o painel faz o scroll sumir sozinho. */
    flex: 1 1 auto; min-height: 0;
    overflow-y: auto; overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--vscode-scrollbarSlider-background) transparent;
  }
  .items::-webkit-scrollbar { width: 10px; }
  .items::-webkit-scrollbar-track { background: transparent; }
  .items::-webkit-scrollbar-thumb {
    background: var(--vscode-scrollbarSlider-background);
    border: 3px solid transparent; border-radius: 6px; background-clip: content-box;
  }
  .items::-webkit-scrollbar-thumb:hover {
    background: var(--vscode-scrollbarSlider-hoverBackground);
    background-clip: content-box;
  }
  .items::-webkit-scrollbar-thumb:active {
    background: var(--vscode-scrollbarSlider-activeBackground);
    background-clip: content-box;
  }
  /* Ocupa a área da lista em vez de ficar encolhido num canto: o vazio é a
     primeira coisa que se vê num painel novo. */
  /* A lista é uma grade alinhada ao topo, então o vazio ficava encostado no
     campo de busca com a área toda livre abaixo. Ocupar a altura inteira o
     mantém centrado no espaço da lista, que é onde o olho procura. */
  .empty {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: var(--gap-sm);
    height: 100%; min-height: 96px; padding: var(--gap-md);
    text-align: center;
  }
  /* Cada ícone recebe a cor do que representa: a estrela dos favoritos usa o
     mesmo amarelo da estrela marcada, e a lupa da busca sem resultado o tom
     de aviso. As cores vêm da paleta de gráficos do tema, que existe para
     acentos assim e acompanha o claro e o escuro. */
  .empty svg { width: 28px; height: 28px; fill: currentColor; opacity: .55; }
  .empty-icon { line-height: 0; }
  .empty-icon.hist   { color: var(--vscode-charts-blue, #4a9eff); }
  .empty-icon.fav    { color: var(--vscode-charts-yellow, #d7ba7d); }
  .empty-icon.search { color: var(--vscode-charts-orange, #d18616); }
  /* O título usa a cor normal do texto: é a resposta à pergunta "o que há
     aqui?" e precisa ser lido primeiro. */
  .empty-title { color: var(--fg); font-size: 12px; font-weight: 600; }
  /* A dica é secundária, mas legível — antes somava a cor apagada com mais
     opacidade por cima, e o texto quase sumia. */
  .empty-hint {
    color: var(--muted); font-size: 11px;
    max-width: 28ch; line-height: 1.5;
  }
  .cmd-row {
    display: flex; gap: var(--gap-sm); align-items: center;
    min-height: var(--row-h);
    padding: var(--gap-xs) var(--gap-sm); border-radius: 6px;
    border: 1px solid transparent;
    background: transparent;
  }
  .cmd-row:hover { border-color: var(--border); background: rgba(255,255,255,.04); }
  /* Um comando longo encolhe com reticências em vez de empurrar os botões
     para fora da linha; o texto inteiro fica no title. O min-width é o que
     autoriza o flex a encolher abaixo do conteúdo. */
  .cmd-text {
    flex: 1 1 auto; min-width: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
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
    flex: 0 0 auto;
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
  /* Cabe até 3 dígitos (o histórico vai a 200) sem empurrar o rótulo. */
  .tab-count { margin-left: var(--gap-xs); opacity: .7; font-weight: 400; font-variant-numeric: tabular-nums; }

  /* O X é um botão nosso, e não o nativo do input de busca: aquele vive no
     shadow DOM, onde nem a cor do tema nem uma máscara declarada aqui chegam
     — ficava azul do sistema ou invisível. */
  .search-box { position: relative; margin-bottom: var(--gap-sm); flex: 0 0 auto; }
  .search {
    width: 100%; height: 24px;
    padding: 0 25px 0 var(--control-pad); border-radius: var(--radius);
    border: 1px solid var(--vscode-input-border, var(--border));
    background: var(--input-bg); color: var(--input-fg);
    font-size: 11px; outline: none;
  }
  .search:focus { border-color: var(--vscode-focusBorder); }
  .search-clear {
    position: absolute; right: 5px; top: 50%; transform: translateY(-50%);
    display: inline-flex; align-items: center; justify-content: center;
    width: 16px; height: 16px; padding: 0;
    border: none; border-radius: 3px; background: transparent;
    color: var(--vscode-errorForeground, #f14c4c);
    cursor: pointer; opacity: .8;
  }
  .search-clear:hover { opacity: 1; background: rgba(255,255,255,.1); }
  .search-clear svg { width: 10px; height: 10px; fill: currentColor; }
  .load-more { width: 100%; margin-top: var(--gap-sm); flex: 0 0 auto; }
  .tab-actions { margin-left: auto; display: flex; align-items: center; flex: 0 0 auto; }
  /* Antes o botão acumulava as classes mini (recuo próprio) e icon-btn
     (medida fixa) ao mesmo tempo, e as duas brigavam. Aqui tem medida única,
     discreta como as abas e destacando-se só ao passar o mouse. */
  .tab-action {
    display: inline-flex; align-items: center; justify-content: center;
    width: 28px; height: 26px; padding: 0;
    border: none; border-radius: 5px;
    background: transparent; color: var(--muted);
    cursor: pointer;
  }
  .tab-action:hover {
    background: rgba(255,255,255,.07);
    color: var(--vscode-errorForeground, var(--fg));
  }
  .tab-action svg { width: 16px; height: 16px; fill: currentColor; }
  [hidden] { display: none !important; }

  /* Só quando o painel em si aperta é que algo cede — primeiro o respiro
     lateral, depois a contagem, que é o menos essencial. O rótulo mantém o
     tamanho: é ele que identifica a aba. */
  @container (max-width: 230px) {
    .tab { padding: 5px var(--gap-sm); }
    .tab-action { width: 24px; }
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
      <button id="searchClear" class="search-clear" title="${esc(msg.serverView.clearSearch())}" aria-label="${esc(msg.serverView.clearSearch())}" hidden>${ICON_CLOSE}</button>
    </div>
    <div id="histItems" class="items" role="tabpanel"></div>
    <div id="favItems" class="items" role="tabpanel" hidden></div>
    <button id="loadMore" class="mini ghost load-more" hidden>${esc(msg.serverView.loadMore())}</button>
  </div>

<script>
  const vscode = acquireVsCodeApi();
  // Mesmo traço do botão principal, reaproveitado nas linhas da lista.
  const ICON_MARKUP = ${JSON.stringify(ICON_SEND)};
  const ICON_STAR = { on: ${JSON.stringify(ICON_STAR_ON)}, off: ${JSON.stringify(ICON_STAR_OFF)} };
  const ICON_EMPTY = {
    hist: ${JSON.stringify(ICON_EMPTY_HISTORY)},
    fav: ${JSON.stringify(ICON_EMPTY_STAR)},
    search: ${JSON.stringify(ICON_EMPTY_SEARCH)},
  };
  const T = ${JSON.stringify({
    send: msg.serverView.send(),
    emptyHistory: msg.serverView.emptyHistory(),
    emptyFavorites: msg.serverView.emptyFavorites(),
    addFavorite: msg.serverView.addFavorite(),
    removeFavorite: msg.serverView.removeFavorite(),
    noMatches: msg.serverView.noMatches(),
    noMatchesHint: msg.serverView.noMatchesHint(),
    emptyHistoryHint: msg.serverView.emptyHistoryHint(),
    emptyFavoritesHint: msg.serverView.emptyFavoritesHint(),
  })};
  const $ = sel => document.querySelector(sel);
  const input = $('#cmd');
  const btn = $('#send');
  const histItems = $('#histItems');
  const favItems  = $('#favItems');
  const histClear = $('#histClear');
  const favClear  = $('#favClear');
  const search    = $('#search');
  const searchBox = $('#searchBox');
  const searchClear = $('#searchClear');
  const loadMore  = $('#loadMore');
  const tabHist   = $('#tabHist');
  const tabFav    = $('#tabFav');
  const histCount = $('#histCount');
  const favCount  = $('#favCount');

  let history = [];
  let favorites = [];
  let cursor = -1;
  let tab = 'hist';
  let query = '';
  // Quantos itens a lista mostra de uma vez. Cresce ao pedir mais, e volta ao
  // início a cada troca de aba ou busca — a página não faz sentido sobre outro
  // conjunto.
  const PAGE = 20;
  let shown = PAGE;

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

  function filtered(list) {
    const q = query.trim().toLowerCase();
    return q ? list.filter(c => c.toLowerCase().includes(q)) : list;
  }

  function mkEmpty(tipo, title, hint) {
    const box = document.createElement('div');
    box.className = 'empty';
    const ico = document.createElement('div');
    ico.className = 'empty-icon ' + tipo;
    ico.innerHTML = ICON_EMPTY[tipo];
    const t = document.createElement('div');
    t.className = 'empty-title';
    t.textContent = title;
    const h = document.createElement('div');
    h.className = 'empty-hint';
    h.textContent = hint;
    box.append(ico, t, h);
    return box;
  }

  function renderList(container, kind, list, emptyText, hintText, starOf) {
    container.innerHTML = '';
    const items = filtered(list);
    if (!items.length) {
      // Distingue "não há nada" de "a busca não achou nada": a saída para
      // cada caso é diferente.
      const buscando = list.length > 0;
      container.appendChild(mkEmpty(
        buscando ? 'search' : kind,
        buscando ? T.noMatches : emptyText,
        buscando ? T.noMatchesHint : hintText,
      ));
      return 0;
    }
    items.slice(0, shown).forEach(cmd => {
      container.appendChild(mkCmdRow(cmd, { star: starOf(cmd) }));
    });
    return items.length;
  }

  function renderFavorites() {
    return renderList(favItems, 'fav', favorites, T.emptyFavorites, T.emptyFavoritesHint, () => true);
  }

  function renderHistory() {
    return renderList(histItems, 'hist', history, T.emptyHistory, T.emptyHistoryHint, cmd => favorites.includes(cmd));
  }

  function render() {
    const total = tab === 'fav' ? renderFavorites() : renderHistory();
    loadMore.hidden = total <= shown;
    renderCounts();
  }

  // A aba escolhida sobrevive ao re-render; o botão "Limpar" segue a aba
  // visível, para não haver dois com o mesmo rótulo e alvos diferentes.
  function selectTab(which) {
    const fav = which === 'fav';
    tab = which;
    shown = PAGE;
    query = '';
    search.value = '';
    searchClear.hidden = true;
    tabFav.setAttribute('aria-selected', String(fav));
    tabHist.setAttribute('aria-selected', String(!fav));
    favItems.hidden = !fav;
    histItems.hidden = fav;
    favClear.hidden = !fav;
    histClear.hidden = fav;
    updateSearchVisibility();
    render();
  }

  // A busca só aparece quando há o que buscar.
  function updateSearchVisibility() {
    const list = tab === 'fav' ? favorites : history;
    searchBox.hidden = list.length <= PAGE / 2;
  }

  // Acima de 99 o número deixa de informar e só rouba espaço do rótulo.
  function badge(n) {
    return n ? '(' + (n > 99 ? '99+' : n) + ')' : '';
  }

  function renderCounts() {
    histCount.textContent = badge(history.length);
    favCount.textContent = badge(favorites.length);
  }

  function applyState(payload) {
    const p = payload || {};
    history = Array.isArray(p.history) ? p.history : [];
    favorites = Array.isArray(p.favorites) ? p.favorites : [];
    cursor = -1;
    updateSearchVisibility();
    render();
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

  search.addEventListener('input', () => {
    query = search.value;
    searchClear.hidden = !query;
    shown = PAGE;
    render();
  });
  searchClear.addEventListener('click', () => {
    search.value = '';
    query = '';
    searchClear.hidden = true;
    shown = PAGE;
    render();
    search.focus();
  });
  loadMore.addEventListener('click', () => { shown += PAGE; render(); });

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
