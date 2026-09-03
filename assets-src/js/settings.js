const vscode = acquireVsCodeApi();
let _i18n = {};
const STYLE_OPTIONS = ['camelCase', 'snake_case', 'PascalCase', 'UPPER_CASE', 'Capitalized_Snake'];

function set(key, value) {
  vscode.postMessage({ type: 'set', key, value });
}

// Detecção automática ligada: o caminho manual é irrelevante (válido é usado,
// inválido/vazio cai na detecção), então o campo é ocultado.
function onAutoDetectChange(on) {
  set('compiler.autoDetect', on);
  toggleCompilerPath(on);
}
function toggleCompilerPath(autoOn) {
  const row = document.querySelector('.compiler-path-row');
  if (row) row.style.display = autoOn ? 'none' : '';
}


window.addEventListener('message', e => {
  const msg = e.data;
  if (msg.type === 'state') {
    if (msg.i18n) applyI18n(msg.i18n);
    applyState(msg.payload);
    const banner = document.getElementById('naming-migrate-banner');
    if (banner) banner.style.display = msg.hasInlineNaming ? '' : 'none';
    // Recalcula o espaçador após o conteúdo assentar.
    requestAnimationFrame(sizeScrollSpacer);
  }
});

function migrateNaming() {
  vscode.postMessage({ type: 'migrateNaming' });
}

vscode.postMessage({ type: 'requestState' });

function applyI18n(i18n) {
  _i18n = i18n;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (i18n[key] !== undefined) el.textContent = i18n[key];
  });
  // Campos sem rótulo visível levam o nome em aria-label, que textContent não
  // alcança.
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const key = el.getAttribute('data-i18n-aria');
    if (i18n[key] !== undefined) el.setAttribute('aria-label', i18n[key]);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const key = el.getAttribute('data-i18n-ph');
    if (i18n[key] !== undefined) el.setAttribute('placeholder', i18n[key]);
  });

  const note = document.getElementById('note-text');
  if (note) {
    // Nós montados, não innerHTML: o texto vem de um bundle de tradução, e
    // interpretá-lo como HTML deixaria um bundle alterado injetar marcação.
    note.textContent = '';
    const configPaths = /(~?\/?\.pawnpro\/config\.json)/g;
    for (const [i, part] of (i18n.noteText || '').split(configPaths).entries()) {
      if (!part) continue;
      // Os índices ímpares são os grupos capturados — os caminhos.
      note.appendChild(
        i % 2 ? Object.assign(document.createElement('code'), { textContent: part })
              : document.createTextNode(part),
      );
    }
  }
}

function applyState(cfg) {
  applyBrandAnimation(cfg.ui?.animateTitle ?? false);
  setCheck('ui-animateTitle', cfg.ui?.animateTitle ?? false);
  setInput('compiler-path',     cfg.compiler?.path ?? '');
  const autoDetect = cfg.compiler?.autoDetect ?? true;
  setCheck('compiler-autoDetect', autoDetect);
  toggleCompilerPath(autoDetect);
  setArray('compiler-args-editor', 'compiler.args', cfg.compiler?.args ?? []);
  setArray('includePaths-editor',  'includePaths',   cfg.includePaths ?? []);
  setCheck('build-showCommand',  cfg.build?.showCommand ?? false);
  setSelect('output-encoding',   cfg.output?.encoding ?? 'windows1252');
  setCheck('analysis-warnUnusedInInc',          cfg.analysis?.warnUnusedInInc ?? false);
  setCheck('analysis-suppressDiagnosticsInInc', cfg.analysis?.suppressDiagnosticsInInc ?? false);
  setSelect('analysis-sdk-platform', cfg.analysis?.sdk?.platform ?? 'omp');
  setInput('analysis-sdk-filePath',  cfg.analysis?.sdk?.filePath ?? '');
  const fmtPreset = cfg.format?.preset ?? 'allman';
  markPresetCard(fmtPreset);
  setSelect('format-braceStyle',            cfg.format?.braceStyle ?? 'nextLine');
  setCheck('format-spaceAroundOperators',   cfg.format?.spaceAroundOperators ?? true);
  setCheck('format-emptyBlockSameLine',     cfg.format?.emptyBlockSameLine ?? true);
  setCheck('format-preserveArrayAlignment', cfg.format?.preserveArrayAlignment ?? false);
  toggleFormatCustom(fmtPreset);
  const naming = cfg.analysis?.naming ?? {};
  setCheck('naming-enabled', naming.enabled ?? false);
  setInput('naming-minLength', naming.minLength ?? 2);
  setInput('naming-maxListMb', Math.round((naming.maxListFileBytes ?? 33554432) / 1048576));
  for (const cat of ['functions', 'globals', 'locals', 'constants', 'macros', 'parameters']) {
    const accepted = Array.isArray(naming.style?.[cat]) ? naming.style[cat] : [];
    for (const st of STYLE_OPTIONS) {
      setCheck('naming-style-' + cat + '-' + st, accepted.includes(st));
    }
    // O padrão próprio é o item entre barras; os demais são os embutidos.
    setInput('naming-regex-' + cat, accepted.find(isRegexRule) ?? '');
    updateRegexStatus(cat, true);
    updateNamingPreview(cat, accepted);
  }
  setSelect('syntax-scheme',        cfg.syntax?.scheme ?? 'none');
  setCheck('syntax-applyOnStartup', cfg.syntax?.applyOnStartup ?? false);
  const accent = cfg.ui?.accent ?? '';
  const accentRadio = document.querySelector('input[name="accent"][value="' + accent + '"]');
  if (accentRadio) accentRadio.checked = true;
  setCheck('ui-showIncludePaths',   cfg.ui?.showIncludePaths ?? false);
  setSelect('ui-locale',            cfg.ui?.locale ?? '');
  setSelect('locale',               cfg.locale ?? '');
  setSelect('server-type',          cfg.server?.type ?? 'auto');
  setInput('server-path',           cfg.server?.path ?? '');
  setInput('server-cwd',            cfg.server?.cwd ?? '\${workspaceFolder}');
  setArray('server-args-editor',    'server.args', cfg.server?.args ?? []);
  setArray('server-sensitive-editor', 'server.history.sensitiveCommands', cfg.server?.history?.sensitiveCommands ?? []);

  setCheck('server-clearOnStart',   cfg.server?.clearOnStart ?? true);
  setCheck('server-history-enabled', cfg.server?.history?.enabled ?? true);
  setSelect('server-output-follow', cfg.server?.output?.follow ?? 'visible');
  setInput('server-logPath',        cfg.server?.logPath ?? '');
  setSelect('server-logEncoding',   cfg.server?.logEncoding ?? 'windows1252');
}

function setInput(id, value) {
  const el = document.getElementById(id);
  if (el && document.activeElement !== el) el.value = value;
}
function setCheck(id, value) {
  const el = document.getElementById(id);
  if (el) el.checked = !!value;
}
function setSelect(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  for (const opt of el.options) opt.selected = opt.value === value;
}
// Seleção de preset via cartão: persiste, marca o cartão e mostra/oculta os
// ajustes finos (que só valem no 'custom').
function selectPreset(preset) {
  set('format.preset', preset);
  markPresetCard(preset);
  toggleFormatCustom(preset);
}

// Realça o cartão do preset ativo.
function markPresetCard(preset) {
  for (const card of document.querySelectorAll('.preset-card')) {
    card.classList.toggle('selected', card.getAttribute('data-preset') === preset);
  }
}

// Ajustes finos de formatação só fazem sentido no preset 'custom'; nos presets
// prontos eles são definidos pela engine, então ficam ocultos.
function toggleFormatCustom(preset) {
  const show = preset === 'custom';
  for (const el of document.querySelectorAll('.format-custom')) {
    el.style.display = show ? '' : 'none';
  }
}

// Palavras-base por categoria — identificadores temáticos do mundo SA-MP/RP em
// vez de um genérico "player_score" repetido em toda categoria. Cada item é uma
// lista de palavras minúsculas que styleSample combina conforme a convenção.
const NAMING_WORDS = {
  functions:  ['carregar', 'lixeiras'],
  globals:    ['total', 'jogadores'],
  locals:     ['caixa', 'eletronico'],
  constants:  ['vida', 'maxima'],
  macros:     ['nome', 'servidor'],
  parameters: ['prot', 'z'],
};

// Combina as palavras-base de uma categoria na convenção de caixa escolhida,
// para ilustrar concretamente cada estilo no preview.
function styleSample(category, style) {
  const words = NAMING_WORDS[category] ?? ['player', 'score'];
  const cap = w => w.charAt(0).toUpperCase() + w.slice(1);
  switch (style) {
    case 'camelCase':  return words.map((w, i) => i === 0 ? w : cap(w)).join('');
    case 'snake_case': return words.join('_');
    case 'PascalCase': return words.map(cap).join('');
    case 'UPPER_CASE': return words.join('_').toUpperCase();
    case 'Capitalized_Snake': return words.map(cap).join('_');
    default:           return null; // estilo desconhecido — ignorado no preview
  }
}

// Cada categoria mostra um trecho de código Pawn REAL daquela categoria, com o
// identificador no estilo escolhido — assim fica claro o que a regra pega.
// O marcador chaveado é substituído pelo identificador de exemplo.
const NAMING_TEMPLATE = {
  functions:  'stock {}() { }',
  globals:    'new {};',
  locals:     'new {} = 0;',
  constants:  'const {} = 100;',
  macros:     '#define {} ...',
  parameters: 'foo({})',
};

// Lê os critérios de uma categoria: as etiquetas marcadas mais o padrão
// próprio, quando houver um válido. A engine aceita o nome que casar com
// QUALQUER item da lista, então os dois convivem.
function readAcceptedStyles(category) {
  const styles = STYLE_OPTIONS.filter(st => {
    const el = document.getElementById('naming-style-' + category + '-' + st);
    return el && el.checked;
  });
  const input = document.getElementById('naming-regex-' + category);
  const raw = input ? input.value.trim() : '';
  if (raw && isRegexRule(raw) && compileRule(raw)) styles.push(raw);
  return styles;
}

// Marca/desmarca um estilo aceito e persiste a lista resultante da categoria.
function toggleNamingStyle(category, style, checked) {
  const accepted = readAcceptedStyles(category);
  set('analysis.naming.style.' + category, accepted);
  updateNamingPreview(category, accepted);
}

// Um critério é regex quando vem entre barras — mesma convenção da engine.
function isRegexRule(v) {
  return typeof v === 'string' && v.length >= 2 && v.startsWith('/') && v.endsWith('/');
}

// Compila o padrão como a engine faz: âncora ^(?:...)$ para descrever o nome
// inteiro, e o agrupamento impede que uma alternância ancore só os extremos.
// Devolve null se o padrão for inválido.
//
// Limite de tamanho: o motor de regex do JS faz backtracking, então um padrão
// como (a+)+ leva tempo exponencial no comprimento da entrada. A engine (crate
// regex do Rust) tem tempo linear garantido e não se importa; quem precisa se
// defender é esta pré-visualização. Um padrão de nome de identificador não
// precisa ser longo.
const MAX_PATTERN_LEN = 200;

function compileRule(raw) {
  const body = raw.slice(1, -1);
  if (!body) return null;
  try {
    return new RegExp('^(?:' + body + ')$');
  } catch {
    return null;
  }
}

// Padrão que pode travar a PRÉ-VISUALIZAÇÃO. Não diz nada sobre ele ser
// válido nem sobre poder ser salvo: a engine tem tempo linear garantido e o
// aplica sem restrição.
//
// O risco é o backtracking catastrófico do motor do JavaScript, e ele NÃO vem
// do tamanho — /^(a+)+$/ tem sete caracteres e leva dezenas de segundos numa
// única sonda. Vem da forma: um grupo quantificado cujo interior também
// quantifica ou alterna faz o motor tentar exponenciais divisões da entrada.
//
// O orçamento de tempo não cobre este caso, porque é conferido ANTES de cada
// teste — quando a página volta a responder, já travou.
function riskyForPreview(raw) {
  const body = raw.slice(1, -1);
  // Teto de comprimento como segunda linha: não é o risco principal, mas
  // padrão gigante custa a cada tecla mesmo sendo benigno.
  if (body.length > MAX_PATTERN_LEN) return true;
  return NESTED_QUANTIFIER.test(body);
}

// Grupo seguido de quantificador cujo interior quantifica ou alterna:
// (a+)+, (a*)*, (a|aa)+, (\\w+\\s?)*. É a forma dos padrões catastróficos.
const NESTED_QUANTIFIER = /\\([^()]*(?:[*+]|\\{\\d|\\|)[^()]*\\)\\s*(?:[*+]|\\{\\d)/;

// Comprimento máximo do nome testado. É o limite que de fato protege: uma vez
// iniciado, re.test roda até o fim — não há como interromper JS de fora —, e
// o custo do backtracking cresce com o tamanho da ENTRADA. Cortá-la é o que
// impede o congelamento; o orçamento abaixo só evita somar muitos testes caros.
// Nome de identificador não passa disto.
const MAX_PROBE_LEN = 40;

// Testa um nome contra o padrão. Só a pré-visualização passa por aqui: um
// padrão patológico deixa de responder em vez de travar a página. O resultado
// que vale é sempre o da engine, cujo motor tem tempo linear garantido.
function testWithBudget(re, name, budget) {
  // Sonda longa demais é PULADA, não é fim de orçamento: devolver o mesmo
  // 'null' nos dois casos fazia quem varre a lista parar na primeira sonda
  // impossivel, como se o tempo tivesse acabado.
  if (name.length > MAX_PROBE_LEN) return false;
  if (budget.left <= 0) return null;
  const t0 = Date.now();
  let hit;
  try {
    hit = re.test(name);
  } catch {
    return null;
  }
  budget.left -= Date.now() - t0;
  return hit;
}

// Nomes testados contra o padrão do usuário: os cinco estilos embutidos daquela
// categoria, mais variantes com prefixo, que é o caso real mais comum.
function regexProbes(category, raw) {
  const out = [];
  for (const st of STYLE_OPTIONS) {
    const sample = styleSample(category, st);
    if (sample) out.push(sample);
  }
  const base = out[0];
  if (!base) return out;

  // Variantes do nome, uma por exigência que um padrão pode fazer sobre o
  // trecho depois do prefixo: camelCase, inicial maiúscula, tudo minúsculo e as
  // duas formas curtas (uma palavra só), para padrões que limitam o tamanho
  // com quantificador. Com apenas a base em camelCase, cada uma dessas
  // exigências deixava o campo sem exemplo nenhum.
  const short = (NAMING_WORDS[category] ?? [])[0] ?? '';
  const capitalize = w => w.charAt(0).toUpperCase() + w.slice(1);
  const bases = [base, capitalize(base), base.toLowerCase()];
  if (short && short !== base) bases.push(short, capitalize(short));

  // Prefixos: os literais do próprio padrão (o caso comum é /^g_[a-z].../,
  // e sem eles o exemplo prefixado usaria uma letra fixa que não casaria) e o
  // sublinhado, convenção de "privado". Vazio também é prefixo — é o nome sem
  // nada na frente, já coberto pelos estilos acima.
  for (const prefix of [...literalPrefixes(raw), '_']) {
    for (const b of bases) {
      const cand = prefix + b;
      if (!out.includes(cand)) out.push(cand);
    }
  }
  return out;
}

// Prefixos literais possíveis no início do padrão, antes de qualquer
// metacaractere. Lista vazia quando não há nenhum — aí não há prefixo a
// exemplificar.
//
// Com alternância no início (/^(g|s)_.../), cada ramo é um prefixo: antes só se
// lia literal contíguo, a alternância devolvia '' e nenhuma sonda ganhava
// prefixo, deixando o campo sem exemplo.
// Teto do prefixo extraído do padrão: é por ele que a sonda cresce, e entrada
// longa é o que torna caro um padrão com backtracking.
const MAX_PREFIX = 12;

function literalPrefixes(raw) {
  if (!isRegexRule(raw)) return [];
  let body = raw.slice(1, -1);
  if (body.startsWith('^')) body = body.slice(1);

  // As barras invertidas vão DOBRADAS: este código vive dentro de um template
  // literal, e uma barra simples antes do parêntese seria consumida no escape
  // da string — a regex chegaria ao navegador sem ela, casando qualquer início
  // e devolvendo o padrão inteiro como se fosse prefixo.
  // Sem grupo aninhado: `(?:\|[^()|]+)+` dentro de `[^()|]+` faz o motor
  // tentar divisões exponenciais da entrada — o CodeQL apontou, e 26
  // repetições já levavam 2 s. A verificação da barra passa para o código.
  const group = /^\(([^()]+)\)/.exec(body);
  if (group) {
    // O que vem depois do grupo pode ser literal também: em (g|s)_ o
    // sublinhado pertence aos dois ramos.
    const rest = leadingLiteral(body.slice(group[0].length));
    const seen = [];
    // O grupo só vale como alternância se tiver barra: `(abc)` é agrupamento
    // simples, e tratá-lo como ramo daria um prefixo que o padrão não aceita.
    if (!group[1].includes('|')) return [];
    for (const branch of group[1].split('|')) {
      const p = (branch + rest).slice(0, MAX_PREFIX);
      if (p && !seen.includes(p)) seen.push(p);
    }
    return seen;
  }

  const lit = leadingLiteral(body).slice(0, MAX_PREFIX);
  return lit ? [lit] : [];
}

// Literal contíguo no início de um trecho de padrão, sem metacaracteres.
function leadingLiteral(body) {
  const m = /^[A-Za-z0-9_]+/.exec(body);
  if (!m) return '';
  // Um literal seguido de quantificador pertence ao quantificador, não ao
  // prefixo: em ab* o b é opcional.
  const lit = m[0];
  const next = body.charAt(lit.length);
  return '*?+{'.includes(next) ? lit.slice(0, -1) : lit;
}

// Mostra se o padrão é válido e quais exemplos ele aceita — o usuário vê o
// efeito da regra antes de salvá-la.
//
// O parâmetro settled distingue quem está digitando de quem terminou: na
// digitação o texto passa por estados incompletos (a barra final é o último
// caractere), e acusá-los como erro a cada tecla seria ruído. O que não
// pode acontecer em nenhum dos dois casos é o preview mostrar exemplos de um
// padrão diferente do que está no campo.
function updateRegexStatus(category, settled) {
  const input = document.getElementById('naming-regex-' + category);
  if (!input) return;
  const raw = input.value.trim();

  // A validação marca o CAMPO; o exemplo do padrão sai junto dos demais, no
  // preview da categoria. Enquanto se digita não há erro a apontar: o texto
  // passa por estados incompletos até a barra final.
  // Só erro de FORMA: falta de barras e regex que não compila. Não casar com os
  // exemplos não é erro — as sondas são nomes que a página inventa para ilustrar
  // o padrão, não uma definição do que é válido. Um padrão correto que não bata
  // com nenhuma delas era marcado em vermelho, acusando o usuário de um
  // problema que é da lista de sondas.
  let error = '';
  if (raw && settled) {
    if (!isRegexRule(raw)) error = _i18n.namingRegexNeedsSlashes;
    // O limite é da PRÉ-VISUALIZAÇÃO, que roda a cada tecla em JavaScript: um
    // padrão longo pode estar correto, e chamá-lo de inválido seria mentira.
    else if (riskyForPreview(raw)) error = _i18n.namingRegexNoPreview;
    else if (!compileRule(raw)) error = _i18n.namingRegexInvalid;
  }
  input.classList.toggle('invalid', error !== '');
  input.title = error;
  const warn = document.getElementById('naming-regex-erro-' + category);
  if (warn) {
    warn.textContent = error;
    warn.hidden = error === '';
  }
}

// Enquanto digita: mostra o efeito do que já é um padrão completo, sem gravar
// a cada tecla e sem acusar como erro o que ainda está pela metade.
function onNamingRegexInput(category) {
  updateRegexStatus(category, false);
  // O exemplo acompanha a digitação: readAcceptedStyles só inclui o padrão
  // quando ele já é válido, então enquanto está pela metade a linha some.
  updateNamingPreview(category, readAcceptedStyles(category));
}

// Ao confirmar: grava junto dos estilos marcados. Um padrão inválido não é
// persistido — gravá-lo faria a engine descartá-lo em silêncio, e o usuário
// ficaria com uma regra que não existe.
function commitNamingRegex(category) {
  const input = document.getElementById('naming-regex-' + category);
  if (!input) return;
  const raw = input.value.trim();
  // Agora sim vale apontar o que está errado: o usuário terminou de escrever.
  updateRegexStatus(category, true);
  // Um padrão longo demais para a pré-visualização ainda é um padrão VÁLIDO:
  // descartá-lo apagaria silenciosamente o que o usuário escreveu. Só o que
  // está malformado é recusado.
  if (raw && (!isRegexRule(raw) || !compileRule(raw))) return;
  const accepted = readAcceptedStyles(category);
  set('analysis.naming.style.' + category, accepted);
  updateNamingPreview(category, accepted);
}

// Pede ao host para abrir o arquivo de lista (.ban / .allow), criando-o se
// ainda não existir.
function openNamingFile(which) {
  vscode.postMessage({ type: 'openNamingFile', which });
}

// Mostra um exemplo de código por estilo aceito (um por linha). Vazio = oculta.
function updateNamingPreview(category, accepted) {
  const el = document.getElementById('naming-preview-' + category);
  if (!el) return;
  const tpl = NAMING_TEMPLATE[category] ?? '{}';
  // Uma linha por critério aceito, embutido ou padrão próprio: são a mesma
  // configuração e saem na mesma caixa. Para o regex o nome não se deriva do
  // estilo — vem do primeiro exemplo que o padrão aceita.
  const lines = (accepted ?? [])
    .map(st => (isRegexRule(st) ? regexSample(category, st) : styleSample(category, st)))
    .filter(Boolean)
    .map(ident => tpl.replace('{}', ident));
  el.hidden = lines.length === 0;
  el.textContent = lines.join('\\n');

  // Sem critério, a caixa de exemplo some e nada explicaria por quê.
  const empty = document.getElementById('naming-vazio-' + category);
  if (empty) {
    empty.hidden = lines.length > 0;
    const txt = document.getElementById('naming-vazio-texto-' + category);
    if (txt) txt.textContent = _i18n.namingSemRegra || '';
  }

  // A caixa mostra um exemplo por critério. Um padrão costuma aceitar mais de
  // um nome, e o botão dá acesso à lista inteira — sem ele nada revelaria que
  // /^(g|s)_.../ também aceita nomes com s_.
  const more = document.getElementById('naming-more-' + category);
  if (!more) return;
  const pattern = (accepted ?? []).find(st => isRegexRule(st));
  const total = pattern ? regexSamples(category, pattern).length : 0;
  more.hidden = total < 2;
  if (total < 2) return;
  more.textContent = _i18n.namingAlsoAccepts + ' (' + total + ')';
  more.onclick = () => showPatternExamples(category, pattern);
}

// Primeiro nome de exemplo que o padrão aceita, ou null se nenhum passa (ou se
// o padrão é caro demais para testar aqui — a análise real é da engine).
function regexSample(category, raw) {
  return regexSamples(category, raw)[0] ?? null;
}

// Todos os nomes-sonda que o padrão aceita, na ordem em que foram gerados.
//
// O preview usa o primeiro como exemplo; os demais alimentam a lista completa,
// que é o que mostra o alcance real de um padrão — /^(g|s)_.../ aceita nomes
// com s_ e o exemplo sozinho nunca deixaria isso claro.
function regexSamples(category, raw) {
  // O teto vale aqui, onde o custo existe: um padrão longo não gera exemplos,
  // mas continua sendo salvo e aplicado pela engine.
  if (riskyForPreview(raw)) return [];
  const re = compileRule(raw);
  if (!re) return [];
  // O orçamento protege contra padrão com backtracking, e é por sonda testada:
  // 50 ms para a lista inteira, não por chamada.
  const budget = { left: 50 };
  const hits = [];
  for (const probe of regexProbes(category, raw)) {
    const hit = testWithBudget(re, probe, budget);
    // Tempo esgotado: devolve o que já se sabe em vez de descartar tudo.
    if (hit === null) break;
    if (hit) hits.push(probe);
  }
  return hits;
}

// Abre a lista de exemplos de UM padrão. Recebe o padrão e a categoria; a
// lista sai daí, não de quem chama.
// O teto vem do HTML: é a extensão que o define, e duplicá-lo aqui
// criaria dois números para manter em sincronia.
const MAX_EXAMPLES = Number(document.body.dataset.maxExamples) || 300;

function showPatternExamples(category, raw) {
  const dlg = document.getElementById('exemplos-modal');
  const h = document.getElementById('exemplos-modal-titulo');
  const ul = document.getElementById('exemplos-modal-lista');
  const counter = document.getElementById('exemplos-modal-conta');
  const search = document.getElementById('exemplos-modal-busca');
  const empty = document.getElementById('exemplos-modal-vazio');
  const cut = document.getElementById('exemplos-modal-corte');
  const close = document.getElementById('exemplos-modal-fechar');
  if (!dlg || !h || !ul) return;

  h.textContent = raw;
  const accepted = regexSamples(category, raw);
  const all = accepted.slice(0, MAX_EXAMPLES);
  // Cortar em silêncio faria o total parecer o número real de nomes aceitos.
  if (cut) cut.hidden = accepted.length <= MAX_EXAMPLES;

  // Redesenha a lista pelo termo digitado. O contador mostra o que está à
  // vista sobre o total, para a filtragem não esconder o tamanho real.
  const render = term => {
    const needle = (term || '').trim().toLowerCase();
    const shown = needle ? all.filter(n => n.toLowerCase().includes(needle)) : all;
    ul.textContent = '';
    for (const name of shown) {
      const li = document.createElement('li');
      li.textContent = name;
      ul.appendChild(li);
    }
    if (counter) {
      counter.textContent = shown.length === all.length
        ? String(all.length)
        : shown.length + '/' + all.length;
    }
    if (empty) empty.hidden = shown.length > 0;
    ul.hidden = shown.length === 0;
  };

  if (search) {
    search.value = '';
    search.oninput = () => render(search.value);
  }
  render('');
  if (close) close.onclick = () => dlg.close();
  dlg.showModal();
  if (search) search.focus();
}

const arrayState = {};

function setArray(containerId, key, items) {
  arrayState[key] = [...items];
  renderArray(containerId, key);
}

function renderArray(containerId, key) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const items = arrayState[key] ?? [];
  container.innerHTML = '';

  const list = document.createElement('div');
  list.className = 'array-items';

  items.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'array-item';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = item;
    input.addEventListener('change', () => {
      arrayState[key][idx] = input.value;
      set(key, [...arrayState[key]]);
    });

    const del = document.createElement('button');
    del.className = 'btn-remove';
    del.title = _i18n.btnRemove || 'Remove';
    del.textContent = 'x';
    del.addEventListener('click', () => {
      arrayState[key].splice(idx, 1);
      set(key, [...arrayState[key]]);
      renderArray(containerId, key);
    });

    row.appendChild(input);
    row.appendChild(del);
    list.appendChild(row);
  });

  const add = document.createElement('button');
  add.className = 'btn-add';
  add.textContent = _i18n.btnAdd || '+ Add';
  add.addEventListener('click', () => {
    arrayState[key].push('');
    renderArray(containerId, key);
    const inputs = container.querySelectorAll('input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });

  container.appendChild(list);
  container.appendChild(add);
}

const sections = document.querySelectorAll('.section');
const navLinks = document.querySelectorAll('.nav-link');
const mainEl = document.querySelector('main');

// Espaçador final dimensionado para a última seção poder subir ao topo (e ser
// destacada na nav) sem deixar um vão exagerado. = altura visível − altura da
// última seção − folga; nunca negativo.
function sizeScrollSpacer() {
  const spacer = document.getElementById('scroll-spacer');
  const last = sections[sections.length - 1];
  if (!spacer || !last) return;
  const need = mainEl.clientHeight - last.offsetHeight - 28;
  spacer.style.height = Math.max(0, need) + 'px';
}
window.addEventListener('resize', sizeScrollSpacer);

navLinks.forEach(a => {
  a.addEventListener('click', () => {
    const id = a.getAttribute('data-target');
    const target = document.getElementById(id);
    if (target) mainEl.scrollTo({ top: target.offsetTop - 28, behavior: 'smooth' });
  });
});

mainEl.addEventListener('scroll', () => {
  let current = '';
  sections.forEach(s => {
    if (s.offsetTop - mainEl.scrollTop <= 60) current = s.id;
  });
  navLinks.forEach(a => {
    a.classList.toggle('active', a.getAttribute('data-target') === current);
  });
});
