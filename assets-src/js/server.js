const vscode = acquireVsCodeApi();

// Ícones e traduções vêm do <script type="application/json"> no HTML: são
// dados da extensão, e um script externo não pode interpolá-los.
const _dados = JSON.parse(document.getElementById('dados-painel').textContent);

// Os ícones são SVG da própria extensão, mas passam pelo DOMParser em vez de
// `innerHTML`: o navegador constrói os nós sem executar script, e a origem
// deixa de importar. Era o que o CodeQL apontava como xss-through-dom.
//
// `text/html`, e não `image/svg+xml`: o parser XML exige `xmlns` no elemento,
// que os ícones não declaram — sem ele o nó sai fora do namespace SVG e não
// renderiza. Em HTML o namespace é aplicado pelo próprio parser.
function setIcon(el, svg) {
  el.textContent = '';
  const doc = new DOMParser().parseFromString(svg, 'text/html');
  for (const node of [...doc.body.childNodes]) el.appendChild(node);
}
// Mesmo traço do botão principal, reaproveitado nas linhas da lista.
const ICON_MARKUP = _dados.icons.send;
const ICON_STAR = { on: _dados.icons.starOn, off: _dados.icons.starOff };
const ICON_EMPTY = _dados.icons.empty;
const T = _dados.i18n;
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
    setIcon(star, opts.star ? ICON_STAR.on : ICON_STAR.off);
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
    setIcon(send, ICON_MARKUP);
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
  setIcon(ico, ICON_EMPTY[tipo]);
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
  container.textContent = '';
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
