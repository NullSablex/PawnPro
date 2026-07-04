import * as vscode from 'vscode';
import type { PawnProConfigManager } from '../core/config.js';
import { brandAnimationCss, brandAnimationJs } from './brandAnimation.js';
import { msg } from './nls.js';

let panel: vscode.WebviewPanel | undefined;
let cfgManager: PawnProConfigManager | undefined;

/**
 * Item do catálogo da loja. Espelha os campos que um manifesto real precisaria
 * (ver `docs/store-plan.md`). Os campos além dos básicos alimentam a página de
 * detalhe; são opcionais para que o motor real possa preenchê-los aos poucos.
 */
interface StoreItem {
  id: string;
  name: string;
  author: string;
  kind: 'plugin' | 'filterscript' | 'include' | 'gamemode';
  source: 'pawnpro' | 'openmp';
  /** Versões disponíveis (mais recente primeiro). `version` é a padrão. */
  versions?: string[];
  version: string;
  short: string;
  description: string;
  tags?: string[];
  license?: string;
  size?: string;
  downloads?: number;
  updated?: string;
  repository?: string;
  documentation?: string;
  dependencies?: string[];
  /** URLs de screenshots/preview (no mock, placeholders coloridos por CSS). */
  screenshots?: string[];
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
    versions: ['2.13.8', '2.13.7', '2.13.0', '2.12.0'],
    short: 'Especificadores de formato para extrair dados de strings.',
    description:
      'Plugin clássico de parsing de strings — extrai inteiros, floats, strings e mais a partir de um formato. Usado em praticamente todo sistema de comandos para validar e converter os argumentos do jogador de uma só vez, com mensagens de erro automáticas.',
    tags: ['parsing', 'comandos', 'strings'],
    license: 'MPL-2.0',
    size: '180 KB',
    downloads: 1_240_000,
    updated: '2024-11-02',
    repository: 'https://github.com/Y-Less/sscanf',
    documentation: 'https://github.com/Y-Less/sscanf/blob/master/README.md',
    dependencies: [],
    screenshots: ['a', 'b'],
  },
  {
    id: 'mysql',
    name: 'MySQL',
    author: 'pBlueG / maddinat0r',
    kind: 'plugin',
    source: 'openmp',
    version: 'R41-4',
    versions: ['R41-4', 'R41-3', 'R40'],
    short: 'Driver MySQL com pool de conexões e consultas assíncronas.',
    description:
      'Acesso a banco MySQL/MariaDB com threads, prepared statements e cache. Base de praticamente todo gamemode persistente — contas, propriedades, economia. As consultas rodam fora da thread principal, evitando travar o servidor.',
    tags: ['banco de dados', 'mysql', 'async', 'persistência'],
    license: 'BSD-3-Clause',
    size: '1.4 MB',
    downloads: 890_000,
    updated: '2024-08-19',
    repository: 'https://github.com/pBlueG/SA-MP-MySQL',
    documentation: 'https://github.com/pBlueG/SA-MP-MySQL/wiki',
    dependencies: [],
    screenshots: ['a', 'b', 'c'],
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
      'Contorna os limites de objetos/pickups/labels/checkpoints do servidor transmitindo dinamicamente por proximidade do jogador. Permite mapas enormes sem estourar os limites nativos do SA-MP.',
    tags: ['objetos', 'streaming', 'mapas', 'áreas'],
    license: 'Apache-2.0',
    size: '720 KB',
    downloads: 1_010_000,
    updated: '2023-12-30',
    repository: 'https://github.com/samp-incognito/samp-streamer-plugin',
    documentation: 'https://github.com/samp-incognito/samp-streamer-plugin/wiki',
    dependencies: ['sscanf'],
    screenshots: ['a', 'b'],
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
      'Sistema de comandos flexível do YSI, com aliases, permissões, listas de comandos e parsing integrado ao sscanf. Substitui o OnPlayerCommandText manual por uma estrutura organizada e extensível.',
    tags: ['comandos', 'ysi', 'include'],
    license: 'MPL-2.0',
    size: '95 KB',
    downloads: 430_000,
    updated: '2024-05-11',
    repository: 'https://github.com/pawn-lang/YSI-Includes',
    documentation: 'https://github.com/pawn-lang/YSI-Includes/wiki',
    dependencies: ['sscanf'],
    screenshots: ['a'],
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
      'Consulta a altura do mapa de San Andreas para posicionar objetos/jogadores no chão sem cair pelo mundo. Útil para spawn dinâmico, teleporte e geração de mapas.',
    tags: ['mapa', 'coordenadas', 'terreno'],
    license: 'MIT',
    size: '12 MB',
    downloads: 210_000,
    updated: '2022-03-07',
    repository: 'https://github.com/philip1337/samp-plugin-mapandreas',
    dependencies: [],
    screenshots: ['a', 'b'],
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
      'Exemplo de filterscript curado pela loja PawnPro — comandos básicos de moderação (kick, ban, mute, teleporte). Serve de demonstração do catálogo próprio e de ponto de partida para um painel admin.',
    tags: ['admin', 'moderação', 'exemplo'],
    license: 'MIT',
    size: '24 KB',
    downloads: 1_500,
    updated: '2025-01-10',
    documentation: 'https://pawnpro.nullsablex.com/',
    dependencies: ['sscanf', 'y_commands'],
    screenshots: ['a'],
  },
  {
    id: 'rp-base',
    name: 'Roleplay Base (exemplo)',
    author: 'PawnPro',
    kind: 'gamemode',
    source: 'pawnpro',
    version: '0.3',
    versions: ['0.3', '0.2', '0.1'],
    short: 'Gamemode de roleplay enxuto para começar um projeto.',
    description:
      'Base de roleplay com contas, login/registro, dinheiro e comandos essenciais — pronta para estender. Demonstra um gamemode completo no catálogo da loja, integrando MySQL e sscanf.',
    tags: ['roleplay', 'gamemode', 'base', 'exemplo'],
    license: 'MIT',
    size: '210 KB',
    downloads: 3_400,
    updated: '2025-02-18',
    documentation: 'https://pawnpro.nullsablex.com/',
    dependencies: ['mysql', 'sscanf'],
    screenshots: ['a', 'b', 'c'],
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
      panel.webview.html = getHtml(logoUri.toString(), panel.webview.cspSource);
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
    case 'add':
    case 'remove': {
      // Mock: ainda não há motor real (ver docs/store-plan.md). Atualiza só o
      // estado em memória e avisa, para a UI refletir Adicionar/Remover.
      const id = m['id'];
      const item = typeof id === 'string' ? MOCK_CATALOG.find(i => i.id === id) : undefined;
      if (item) {
        if (m['type'] === 'add') addedIds.add(item.id);
        else addedIds.delete(item.id);
        void vscode.window.showInformationMessage(
          m['type'] === 'add' ? msg.store.installMock(item.name) : msg.store.removeMock(item.name),
        );
      } else {
        void vscode.window.showInformationMessage(msg.store.installUnavailable());
      }
      if (panel) sendState(panel);
      break;
    }
  }
}

function buildI18n() {
  const s = msg.store;
  return {
    title: s.title(),
    searchPlaceholder: s.searchPlaceholder(),
    install: s.install(),
    remove: s.remove(),
    added: s.added(),
    filterAdded: s.filterAdded(),
    back: s.back(),
    empty: s.empty(),
    emptyAdded: s.emptyAdded(),
    mockNote: s.mockNote(),
    kindPlugin: s.kindPlugin(),
    kindFilterscript: s.kindFilterscript(),
    kindInclude: s.kindInclude(),
    kindGamemode: s.kindGamemode(),
    // Tipos rotacionados no subtítulo (um por vez, no plural).
    rotatorWords: [
      s.kindPlugin() + 's',
      s.kindFilterscript() + 's',
      s.kindInclude() + 's',
      s.kindGamemode() + 's',
    ],
    sourcePawnpro: s.sourcePawnpro(),
    sourceOpenmp: s.sourceOpenmp(),
    byAuthor: s.byAuthor(),
    filterAll: s.filterAll(),
    filterKind: s.filterKind(),
    filterSource: s.filterSource(),
    sortLabel: s.sortLabel(),
    sortRelevance: s.sortRelevance(),
    sortName: s.sortName(),
    sortDownloads: s.sortDownloads(),
    sortUpdated: s.sortUpdated(),
    clearSearch: s.clearSearch(),
    resultCount: s.resultCount('{0}'),
    secDescription: s.secDescription(),
    secScreenshots: s.secScreenshots(),
    secDependencies: s.secDependencies(),
    secInfo: s.secInfo(),
    secLinks: s.secLinks(),
    infoLicense: s.infoLicense(),
    infoSize: s.infoSize(),
    infoDownloads: s.infoDownloads(),
    infoUpdated: s.infoUpdated(),
    infoVersion: s.infoVersion(),
    linkRepository: s.linkRepository(),
    linkDocs: s.linkDocs(),
    noScreenshots: s.noScreenshots(),
    noDependencies: s.noDependencies(),
    secUsage: s.secUsage(),
    usageInstall: s.usageInstall('{0}'),
    usageInclude: s.usageInclude('{0}'),
    usageDocs: s.usageDocs(),
    selectVersion: s.selectVersion(),
  };
}

/**
 * Recursos "adicionados" ao projeto (MOCK). Pré-populado para demonstrar a
 * visualização de adicionados e os botões Adicionar/Remover. Sem motor real: o
 * conjunto vive em memória nesta prévia (não altera o projeto de verdade).
 */
const addedIds = new Set<string>(['sscanf', 'streamer']);

function sendState(p: vscode.WebviewPanel): void {
  const animateTitle = cfgManager?.getAll().ui.animateTitle ?? false;
  p.webview.postMessage({
    type: 'state',
    items: MOCK_CATALOG,
    added: [...addedIds],
    i18n: buildI18n(),
    animateTitle,
  });
}

function getHtml(logoUri: string, cspSource: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; img-src https: data: ${cspSource}; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src ${cspSource};">
<style>
  :root {
    color-scheme: light dark;
    /* Padding horizontal fluido: encolhe em painéis estreitos sem breakpoints. */
    --pad-x: clamp(12px, 4vw, 20px);
  }
  /* Foco coerente com a marca (não o focusBorder amarelo do tema): anel fino na
     cor de botão, em vez do outline nativo grosso. Acessível e discreto. */
  input:focus-visible, select:focus-visible, button:focus-visible {
    outline: 1px solid var(--vscode-button-background);
    outline-offset: 1px;
  }
  body {
    font-family: var(--vscode-font-family);
    /* Base um pouco maior que o padrão do editor (~13px) para a página inteira
       respirar; tudo que usa em escala junto. */
    font-size: 14px;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    margin: 0; padding: 0;
  }
  header {
    display: flex; align-items: center; gap: 10px;
    padding: 14px var(--pad-x); border-bottom: 1px solid var(--vscode-panel-border, #333);
  }
  header img { width: 26px; height: 26px; }
  header .title { font-size: 1.15em; font-weight: 600; }
  header .subtitle { font-size: 0.85em; opacity: 0.7; margin-left: 4px; }
  .rotator { display: inline-block; transition: opacity 0.35s; min-width: 90px; }
  .rotator.out { opacity: 0; }
  .mock-banner {
    margin: 12px var(--pad-x) 0;
    padding: 8px 12px; border-radius: 4px; font-size: 0.85em;
    background: var(--vscode-inputValidation-warningBackground, rgba(255,200,0,0.1));
    border: 1px solid var(--vscode-inputValidation-warningBorder, #cc9900);
  }
  .toolbar {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: 14px var(--pad-x) 4px;
  }
  .search-box { position: relative; flex: 1; min-width: 200px; display: flex; align-items: center; }
  .search-box .icon {
    position: absolute; left: 10px; opacity: 0.55; pointer-events: none; font-size: 0.95em;
  }
  .search-box input[type="search"] {
    flex: 1; padding: 7px 30px 7px 30px; border-radius: 4px;
    border: 1px solid var(--vscode-input-border, #555);
    background: var(--vscode-input-background); color: var(--vscode-input-foreground);
    font-size: 0.95em;
  }
  .search-box input[type="search"]::-webkit-search-cancel-button { display: none; }
  .search-box .clear {
    position: absolute; right: 6px; background: none; border: none; cursor: pointer;
    color: var(--vscode-foreground); opacity: 0.6; font-size: 1.1em; line-height: 1;
    padding: 2px 5px; display: none;
  }
  .search-box .clear:hover { opacity: 1; }
  .search-box.has-text .clear { display: block; }
  .toolbar select {
    padding: 6px 8px; border-radius: 4px; font-size: 0.85em;
    border: 1px solid var(--vscode-input-border, #555);
    background: var(--vscode-dropdown-background, var(--vscode-input-background));
    color: var(--vscode-dropdown-foreground, var(--vscode-input-foreground));
  }
  .filters {
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    padding: 6px var(--pad-x) 2px;
  }
  .chip {
    font-size: 0.88em; padding: 5px 13px; border-radius: 13px; cursor: pointer;
    border: 1px solid var(--vscode-input-border, #555);
    background: transparent; color: var(--vscode-foreground); opacity: 0.75;
    transition: background 0.1s, opacity 0.1s, border-color 0.1s;
  }
  .chip:hover { opacity: 1; }
  .chip.active {
    opacity: 1; border-color: transparent;
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
  }
  .chip-sep { width: 1px; align-self: stretch; background: var(--vscode-panel-border, #333); margin: 2px 4px; }

  /* Chip "Adicionados" é de natureza diferente (estado, não filtro de catálogo):
     destaque verde discreto + um ✓, para não confundir com os filtros Tipo/Fonte.
     Inativo: contorno/texto verde sobre fundo transparente. Ativo: fundo verde
     bem suave (não saturado), mantendo o texto sempre legível. */
  #chip-added {
    border-color: var(--vscode-charts-green, #3fb950);
    color: var(--vscode-charts-green, #3fb950); opacity: 0.95;
  }
  #chip-added::before { content: '✓'; margin-right: 4px; font-weight: 700; }
  #chip-added:hover { opacity: 1; background: color-mix(in srgb, var(--vscode-charts-green, #3fb950) 10%, transparent); }
  #chip-added.active {
    opacity: 1;
    background: color-mix(in srgb, var(--vscode-charts-green, #3fb950) 18%, transparent);
    border-color: var(--vscode-charts-green, #3fb950);
    color: var(--vscode-charts-green, #3fb950);
  }
  /* Contador de resultados: maior e com respiro acima (separa dos filtros) e
     abaixo (separa da grade). */
  .result-count { font-size: 0.92em; opacity: 0.7; padding: 14px var(--pad-x) 8px; }
  main { padding: 8px var(--pad-x) 24px; }

  /* Grade (cards) — fluida: o card-mínimo encolhe com o painel (min() evita que
     uma coluna de 240px estoure a largura quando o painel fica < 240px). */
  .grid {
    display: grid; gap: clamp(10px, 2vw, 14px);
    grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr));
  }
  .card {
    border: 1px solid var(--vscode-panel-border, #333); border-radius: 8px;
    padding: 14px; display: flex; flex-direction: column; gap: 8px; cursor: pointer;
    transition: border-color 0.1s, background 0.1s, transform 0.06s;
  }
  .card:hover { border-color: var(--vscode-button-background, #07c); background: var(--vscode-list-hoverBackground); }
  .card:active { transform: scale(0.995); }
  .card .name { font-weight: 600; font-size: 1.05em; }
  .card .short { font-size: 0.92em; opacity: 0.8; flex: 1; line-height: 1.45; }

  .badges { display: flex; gap: 6px; flex-wrap: wrap; }
  .badge {
    font-size: 0.8em; padding: 2px 9px; border-radius: 10px;
    border: 1px solid var(--vscode-badge-background, #555);
    background: var(--vscode-badge-background, #444); color: var(--vscode-badge-foreground, #fff);
  }
  .badge.src-openmp { background: transparent; }
  /* Selo "Adicionado": verde discreto (fundo suave + texto verde), legível e
     consistente com o chip — sinaliza "no projeto" sem berrar. */
  .badge.badge-added {
    background: color-mix(in srgb, var(--vscode-charts-green, #3fb950) 18%, transparent);
    border-color: color-mix(in srgb, var(--vscode-charts-green, #3fb950) 45%, transparent);
    color: var(--vscode-charts-green, #3fb950);
  }
  .meta { font-size: 0.85em; opacity: 0.7; }

  .btn-install {
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
    border: none; border-radius: 4px; padding: 8px 18px; cursor: pointer; font-size: 0.9em;
  }
  .btn-install:hover { background: var(--vscode-button-hoverBackground, var(--vscode-button-background)); }
  /* Remover: botão secundário (não tão chamativo quanto o de adicionar). */
  .btn-remove {
    background: var(--vscode-button-secondaryBackground, transparent);
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    border: 1px solid var(--vscode-input-border, #555); border-radius: 4px;
    padding: 8px 18px; cursor: pointer; font-size: 0.9em; font-weight: 600;
  }
  .btn-remove:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground)); }
  .empty { opacity: 0.6; padding: 40px 0; text-align: center; }

  /* Detalhe rico */
  .detail { display: none; padding: 0 var(--pad-x) 30px; }
  .detail.open { display: block; }
  .detail .back {
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--vscode-button-secondaryBackground, transparent);
    color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
    border: 1px solid var(--vscode-input-border, #555); border-radius: 4px;
    cursor: pointer; font-size: 0.85em; padding: 6px 12px; margin: 14px 0 18px;
  }
  .detail .back:hover { background: var(--vscode-list-hoverBackground); }
  .detail-head {
    display: flex; align-items: flex-start; gap: 18px; flex-wrap: wrap;
    padding-bottom: 22px; border-bottom: 1px solid var(--vscode-panel-border, #333);
  }
  .detail-head .icon {
    /* Ícone fluido: encolhe em painel estreito sem breakpoint. */
    width: clamp(52px, 12vw, 72px); height: clamp(52px, 12vw, 72px);
    border-radius: clamp(12px, 3vw, 16px); flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: clamp(1.6em, 5vw, 2.1em); font-weight: 700;
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
  }
  /* min-width fluido evita estouro: o cabeçalho empilha sozinho quando aperta. */
  .detail-head .head-main { flex: 1; min-width: min(220px, 100%); display: flex; flex-direction: column; gap: 9px; }
  .detail-head h2 { margin: 0; font-size: clamp(1.3em, 4.5vw, 1.85em); line-height: 1.15; }
  .detail-head .badges .badge { font-size: 0.82em; padding: 3px 11px; border-radius: 12px; }
  .detail-head .meta { font-size: 0.9em; opacity: 0.75; }
  .detail-head .head-actions { display: flex; align-items: center; gap: 10px; margin-top: 4px; }

  /* Instalar + versão: dois controles SEPARADOS lado a lado (não grudados — o
     split grudado deixava o select espremido "corroendo" o botão). */
  .install-split { display: inline-flex; align-items: center; gap: 8px; }
  .install-split .btn-install {
    border-radius: 4px; padding: 8px 22px; font-size: 0.95em; font-weight: 600;
  }
  /* Seletor de versão com cara de input (não de botão), bem espaçado e com a seta
     nativa respirando. */
  .install-split .ver-select {
    cursor: pointer; border-radius: 4px;
    background: var(--vscode-dropdown-background, var(--vscode-input-background));
    color: var(--vscode-dropdown-foreground, var(--vscode-input-foreground));
    border: 1px solid var(--vscode-dropdown-border, var(--vscode-input-border, #555));
    padding: 7px 10px; font-size: 0.85em;
  }
  .install-split .ver-select:hover { border-color: var(--vscode-button-background); }

  /* Conteúdo (largo) + sidebar (estreita). Mantém a proporção ~2:1 e quebra para
     uma coluna só quando aperta — via flex-wrap, sem media query. O conteúdo tem
     base maior que a sidebar; ambos crescem, mas o conteúdo domina. */
  .detail-grid {
    display: flex; flex-wrap: wrap; margin-top: 24px; gap: clamp(40px, 6vw, 72px);
  }
  .detail-grid > :first-child { flex: 1 1 360px; min-width: 0; }
  .detail-grid > :last-child  { flex: 0 1 240px; min-width: 0; }
  .detail h3 {
    font-size: 0.78em; text-transform: uppercase; letter-spacing: 0.05em;
    opacity: 0.6; margin: 0 0 10px;
  }
  .detail section { margin-bottom: 26px; }
  .detail .desc { line-height: 1.6; margin: 0; }
  .tags { display: flex; gap: 6px; flex-wrap: wrap; }
  .tag {
    font-size: 0.78em; padding: 3px 10px; border-radius: 4px;
    background: var(--vscode-badge-background, #333); color: var(--vscode-badge-foreground, #ccc);
  }

  /* Bloco instalar/usar */
  .usage { display: flex; flex-direction: column; gap: 8px; }
  .usage .step { font-size: 0.9em; line-height: 1.5; }
  .usage code {
    background: var(--vscode-textCodeBlock-background, rgba(127,127,127,0.15));
    border-radius: 4px; padding: 1px 6px; font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.92em;
  }

  .shots { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(180px, 100%), 1fr)); gap: 10px; }
  .shot {
    aspect-ratio: 16 / 10; border-radius: 6px; overflow: hidden; cursor: zoom-in;
    border: 1px solid var(--vscode-panel-border, #333);
    transition: border-color 0.1s, transform 0.06s;
  }
  .shot:hover { border-color: var(--vscode-button-background, #07c); }
  .shot:active { transform: scale(0.99); }
  .shot img { width: 100%; height: 100%; object-fit: cover; display: block; }

  /* Lightbox */
  .lightbox {
    position: fixed; inset: 0; background: rgba(0,0,0,0.8);
    display: none; align-items: center; justify-content: center; z-index: 100; cursor: zoom-out;
  }
  .lightbox.open { display: flex; }
  .lightbox img { max-width: 92%; max-height: 92%; border-radius: 6px; box-shadow: 0 8px 40px rgba(0,0,0,0.6); }

  /* Informações: rótulo e valor com largura natural (max-content), juntos com um
     pequeno vão — sem o valor esticar até a borda. */
  .info-table { display: grid; grid-template-columns: max-content max-content; gap: 14px 12px; font-size: 0.88em; }
  .info-table dt { opacity: 0.6; white-space: nowrap; }
  .info-table dd { margin: 0; }
  .dep-list { display: flex; flex-direction: column; gap: 5px; }
  .dep-list .dep {
    font-size: 0.88em; cursor: pointer; color: var(--vscode-textLink-foreground);
    background: none; border: none; padding: 0; text-align: left;
  }
  .dep-list .dep:hover { text-decoration: underline; }
  .links { display: flex; flex-direction: column; gap: 6px; }
  .links a { color: var(--vscode-textLink-foreground); font-size: 0.88em; }
  .muted { opacity: 0.55; font-size: 0.85em; }

${brandAnimationCss()}
</style>
</head>
<body>
<header>
  <img src="${logoUri}" alt="" />
  <span class="title brand" id="brand" data-i18n="title"></span>
  <span class="subtitle"><span class="rotator" id="rotator"></span></span>
</header>

<div class="mock-banner" data-i18n="mockNote"></div>

<div id="browse">
  <div class="toolbar">
    <div class="search-box" id="search-box">
      <svg class="icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
        <circle cx="6.5" cy="6.5" r="4.5"/><line x1="10" y1="10" x2="14" y2="14"/>
      </svg>
      <input type="search" id="search" data-i18n-ph="searchPlaceholder" oninput="onSearchInput()" />
      <button class="clear" id="clear-search" onclick="clearSearch()" aria-label="">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
          <line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/>
        </svg>
      </button>
    </div>
    <select id="sort" onchange="render()" data-i18n-title="sortLabel">
      <option value="relevance" data-i18n="sortRelevance"></option>
      <option value="name"      data-i18n="sortName"></option>
      <option value="downloads" data-i18n="sortDownloads"></option>
      <option value="updated"   data-i18n="sortUpdated"></option>
    </select>
  </div>
  <div class="filters" id="filters">
    <button class="chip active" data-kind="*" onclick="toggleKind('*')" data-i18n="filterAll"></button>
    <button class="chip" data-kind="plugin" onclick="toggleKind('plugin')" data-i18n="kindPlugin"></button>
    <button class="chip" data-kind="filterscript" onclick="toggleKind('filterscript')" data-i18n="kindFilterscript"></button>
    <button class="chip" data-kind="include" onclick="toggleKind('include')" data-i18n="kindInclude"></button>
    <button class="chip" data-kind="gamemode" onclick="toggleKind('gamemode')" data-i18n="kindGamemode"></button>
    <span class="chip-sep"></span>
    <button class="chip active" data-source="*" onclick="toggleSource('*')" data-i18n="filterAll"></button>
    <button class="chip" data-source="pawnpro" onclick="toggleSource('pawnpro')" data-i18n="sourcePawnpro"></button>
    <button class="chip" data-source="openmp" onclick="toggleSource('openmp')" data-i18n="sourceOpenmp"></button>
    <span class="chip-sep"></span>
    <button class="chip" id="chip-added" onclick="toggleAdded()" data-i18n="filterAdded"></button>
  </div>
  <div class="result-count" id="count"></div>
  <main id="results"></main>
</div>

<div class="detail" id="detail"></div>

<div class="lightbox" id="lightbox" onclick="closeLightbox()"><img id="lightbox-img" src="" alt="" /></div>

<script>
const vscode = acquireVsCodeApi();
let _i18n = {};
let _items = [];
// Conjunto de ids adicionados ao projeto (mock).
let _added = new Set();
// Multi-seleção: conjuntos de tipos/fontes ativos. Vazio = todos.
const _kinds = new Set();
const _sources = new Set();
// Filtro "só adicionados" ligado?
let _onlyAdded = false;
// Id do item aberto no detalhe (para re-renderizar ao mudar o estado).
let _openId = null;

window.addEventListener('message', e => {
  const msg = e.data;
  if (msg.type === 'state') {
    _i18n = msg.i18n || {};
    _items = msg.items || [];
    _added = new Set(msg.added || []);
    applyI18n();
    applyBrandAnimation(msg.animateTitle);
    startRotator();
    // Se o detalhe está aberto, re-renderiza ele (para o botão refletir o estado).
    const det = document.getElementById('detail');
    if (det && det.classList.contains('open') && _openId) openDetail(_openId);
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
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const k = el.getAttribute('data-i18n-title');
    if (_i18n[k] !== undefined) el.setAttribute('title', _i18n[k]);
  });
}

function kindLabel(k) {
  return k === 'plugin' ? _i18n.kindPlugin
       : k === 'filterscript' ? _i18n.kindFilterscript
       : k === 'gamemode' ? _i18n.kindGamemode
       : _i18n.kindInclude;
}
function sourceLabel(s) {
  return s === 'pawnpro' ? _i18n.sourcePawnpro : _i18n.sourceOpenmp;
}

// Subtítulo: rotaciona um tipo (plural) por vez, com fade.
let _rotTimer = null;
function startRotator() {
  const el = document.getElementById('rotator');
  const words = _i18n.rotatorWords || [];
  if (!el || !words.length) return;
  if (_rotTimer) clearInterval(_rotTimer);
  let n = 0;
  el.textContent = words[0];
  _rotTimer = setInterval(() => {
    el.classList.add('out');
    setTimeout(() => {
      n = (n + 1) % words.length;
      el.textContent = words[n];
      el.classList.remove('out');
    }, 350);
  }, 2200);
}

function onSearchInput() {
  const box = document.getElementById('search-box');
  box.classList.toggle('has-text', !!document.getElementById('search').value);
  render();
}
function clearSearch() {
  const el = document.getElementById('search');
  el.value = '';
  document.getElementById('search-box').classList.remove('has-text');
  el.focus();
  render();
}
// Alterna um valor no conjunto; '*' (Todos) limpa o conjunto. Atualiza os chips
// ativos e o estado "Todos" (ativo quando nada específico está selecionado).
function toggleIn(set, val, group) {
  if (val === '*') set.clear();
  else { set.has(val) ? set.delete(val) : set.add(val); }
  document.querySelectorAll('#filters .chip[data-' + group + ']').forEach(c => {
    const v = c.getAttribute('data-' + group);
    c.classList.toggle('active', v === '*' ? set.size === 0 : set.has(v));
  });
  render();
}
function toggleKind(k) { toggleIn(_kinds, k, 'kind'); }
function toggleSource(s) { toggleIn(_sources, s, 'source'); }
function toggleAdded() {
  _onlyAdded = !_onlyAdded;
  const chip = document.getElementById('chip-added');
  if (chip) chip.classList.toggle('active', _onlyAdded);
  render();
}

function filtered() {
  const q = (document.getElementById('search').value || '').toLowerCase().trim();
  let list = _items.filter(i =>
    (!_onlyAdded || _added.has(i.id)) &&
    (_kinds.size === 0 || _kinds.has(i.kind)) &&
    (_sources.size === 0 || _sources.has(i.source)) &&
    (!q ||
      i.name.toLowerCase().includes(q) ||
      i.short.toLowerCase().includes(q) ||
      i.author.toLowerCase().includes(q) ||
      (i.tags || []).some(t => t.toLowerCase().includes(q))));

  const sort = document.getElementById('sort').value;
  if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'downloads') list.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
  else if (sort === 'updated') list.sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
  return list;
}

function badges(i) {
  return '<span class="badge">' + kindLabel(i.kind) + '</span>' +
         '<span class="badge src-' + i.source + '">' + sourceLabel(i.source) + '</span>';
}

function fmtNum(n) {
  if (n == null) return '—';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\\.0$/, '') + 'k';
  return String(n);
}

function render() {
  const host = document.getElementById('results');
  const items = filtered();
  const count = document.getElementById('count');
  count.textContent = (_i18n.resultCount || '{0}').replace('{0}', String(items.length));
  if (items.length === 0) {
    const txt = _onlyAdded ? (_i18n.emptyAdded || '') : (_i18n.empty || '');
    host.innerHTML = '<div class="empty">' + txt + '</div>';
    return;
  }
  host.innerHTML = '<div class="grid">' + items.map(cardHtml).join('') + '</div>';
}

function cardHtml(i) {
  // Selo "Adicionado" no card quando o recurso já está no projeto.
  const addedTag = _added.has(i.id)
    ? '<span class="badge badge-added">' + (_i18n.added || '') + '</span>'
    : '';
  return '<div class="card" onclick="openDetail(\\'' + i.id + '\\')">' +
    '<div class="name">' + esc(i.name) + '</div>' +
    '<div class="badges">' + badges(i) + addedTag + '</div>' +
    '<div class="short">' + esc(i.short) + '</div>' +
    '<div class="meta">' + (_i18n.byAuthor || '') + ' ' + esc(i.author) + ' · v' + esc(i.version) + '</div>' +
    '</div>';
}

function section(title, inner) {
  return '<section><h3>' + esc(title) + '</h3>' + inner + '</section>';
}

// Placeholder de captura via placeholder.co (imagem externa, https). Quando o
// motor real existir, troca-se pela URL da screenshot do pacote.
function shotUrl(item, n, big) {
  const size = big ? '960x600' : '360x225';
  const label = encodeURIComponent(item.name + ' ' + (n + 1));
  return 'https://placehold.co/' + size + '/1e2630/8bb8e8?text=' + label;
}

function usageSteps(i) {
  const steps = [];
  steps.push('<div class="step">1. ' + esc((_i18n.usageInstall || '{0}').replace('{0}', i.name)) + '</div>');
  if (i.kind === 'include') {
    steps.push('<div class="step">2. ' +
      (_i18n.usageInclude || '{0}').replace('{0}', '<code>' + esc(i.id) + '</code>') + '</div>');
  }
  steps.push('<div class="step">' + (i.kind === 'include' ? '3' : '2') + '. ' + esc(_i18n.usageDocs || '') + '</div>');
  return '<div class="usage">' + steps.join('') + '</div>';
}

function openDetail(id) {
  const i = _items.find(x => x.id === id);
  if (!i) return;
  _openId = id;
  document.getElementById('browse').style.display = 'none';
  const d = document.getElementById('detail');
  d.classList.add('open');
  window.scrollTo(0, 0);

  const initial = (i.name[0] || '?').toUpperCase();

  // Coluna principal: descrição + tags, instalar/usar, capturas, dependências.
  let main = section(_i18n.secDescription || '', '<p class="desc">' + esc(i.description) + '</p>' +
    (i.tags && i.tags.length
      ? '<div class="tags" style="margin-top:12px">' +
        i.tags.map(t => '<span class="tag">' + esc(t) + '</span>').join('') + '</div>'
      : ''));
  main += section(_i18n.secUsage || '', usageSteps(i));
  const shots = (i.screenshots || []);
  main += section(_i18n.secScreenshots || '',
    shots.length
      ? '<div class="shots">' + shots.map((s, n) =>
          '<div class="shot" onclick="openLightbox(\\'' + esc(shotUrl(i, n, true)) + '\\')">' +
            '<img src="' + esc(shotUrl(i, n, false)) + '" alt="" loading="lazy" />' +
          '</div>').join('') + '</div>'
      : '<div class="muted">' + esc(_i18n.noScreenshots || '') + '</div>');
  const deps = (i.dependencies || []);
  main += section(_i18n.secDependencies || '',
    deps.length
      ? '<div class="dep-list">' + deps.map(dep => {
          const found = _items.find(x => x.id === dep || x.name === dep);
          return found
            ? '<button class="dep" onclick="openDetail(\\'' + found.id + '\\')">' + esc(found.name) + '</button>'
            : '<span class="muted">' + esc(dep) + '</span>';
        }).join('') + '</div>'
      : '<div class="muted">' + esc(_i18n.noDependencies || '') + '</div>');

  // Coluna lateral: informações + links.
  const info = [
    [_i18n.infoVersion, esc(i.version)],
    [_i18n.infoLicense, esc(i.license || '—')],
    [_i18n.infoSize, esc(i.size || '—')],
    [_i18n.infoDownloads, fmtNum(i.downloads)],
    [_i18n.infoUpdated, esc(i.updated || '—')],
  ].map(r => '<dt>' + esc(r[0] || '') + '</dt><dd>' + r[1] + '</dd>').join('');
  let side = section(_i18n.secInfo || '', '<dl class="info-table">' + info + '</dl>');
  const links = [];
  if (i.repository) links.push('<a href="' + esc(i.repository) + '">' + esc(_i18n.linkRepository || '') + '</a>');
  if (i.documentation) links.push('<a href="' + esc(i.documentation) + '">' + esc(_i18n.linkDocs || '') + '</a>');
  if (links.length) side += section(_i18n.secLinks || '', '<div class="links">' + links.join('') + '</div>');

  // Ações: se já adicionado → "Remover" (sem seletor de versão); senão →
  // "Adicionar" + seletor de versão (mais recente primeiro).
  const isAdded = _added.has(i.id);
  let actions;
  if (isAdded) {
    actions =
      '<div class="install-split">' +
        '<button class="btn-remove" onclick="removeItem(\\'' + i.id + '\\')">' + (_i18n.remove || '') + '</button>' +
      '</div>';
  } else {
    const versions = (i.versions && i.versions.length) ? i.versions : [i.version];
    const verOptions = versions.map(v => '<option value="' + esc(v) + '">v' + esc(v) + '</option>').join('');
    actions =
      '<div class="install-split">' +
        '<button class="btn-install" onclick="install(\\'' + i.id + '\\')">' + (_i18n.install || '') + '</button>' +
        '<select id="ver-select" class="ver-select" title="' + esc(_i18n.selectVersion || '') + '">' + verOptions + '</select>' +
      '</div>';
  }
  const installSplit = actions;

  d.innerHTML =
    '<button class="back" onclick="closeDetail()">' +
      '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">' +
        '<polyline points="9,3 4,8 9,13"/></svg>' + (_i18n.back || '') + '</button>' +
    '<div class="detail-head">' +
      '<div class="icon">' + esc(initial) + '</div>' +
      '<div class="head-main">' +
        '<h2>' + esc(i.name) + '</h2>' +
        '<div class="badges">' + badges(i) + '</div>' +
        '<div class="meta">' + (_i18n.byAuthor || '') + ' ' + esc(i.author) + '</div>' +
        '<div class="head-actions">' + installSplit + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="detail-grid"><div>' + main + '</div><div>' + side + '</div></div>';
}

function closeDetail() {
  _openId = null;
  document.getElementById('detail').classList.remove('open');
  document.getElementById('detail').innerHTML = '';
  document.getElementById('browse').style.display = '';
}

function openLightbox(url) {
  const lb = document.getElementById('lightbox');
  document.getElementById('lightbox-img').src = url;
  lb.classList.add('open');
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.getElementById('lightbox-img').src = '';
}

function install(id) {
  const sel = document.getElementById('ver-select');
  vscode.postMessage({ type: 'add', id, version: sel ? sel.value : undefined });
}
function removeItem(id) {
  vscode.postMessage({ type: 'remove', id });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
</script>
</body>
</html>`;
}
