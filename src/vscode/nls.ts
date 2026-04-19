import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

/* ─── Compiler Messages ────────────────────────────────────────── */

export const msg = {
  compiler: {
    alreadyCompiling: (file: string) => localize('compiler.alreadyCompiling', '"{0}" já está sendo compilado.', file),
    compiling: (file: string) => localize('compiler.compiling', 'Compilando: {0}', file),
    success: (file: string) => localize('compiler.success', 'Compilação bem-sucedida: {0}', file),
    failed: (file: string) => localize('compiler.failed', 'Compilação falhou: {0}', file),
    notPawnFile: () => localize('compiler.notPawnFile', 'Abra um arquivo .pwn para compilar.'),
    noCompiler: () => localize('compiler.noCompiler', 'Compilador não configurado. Use "PawnPro: Detectar compilador" ou configure em .pawnpro/config.json'),
    compilerNotFound: (path: string) => localize('compiler.compilerNotFound', 'Falha ao iniciar pawncc: {0}', path),
    detecting: () => localize('compiler.detecting', 'Detectando compilador...'),
    detected: (path: string) => localize('compiler.detected', 'pawncc detectado: {0}', path),
    notDetected: () => localize('compiler.notDetected', 'Compilador não detectado automaticamente.'),
  },

  server: {
    starting: () => localize('server.starting', 'Iniciando servidor...'),
    started: () => localize('server.started', 'Servidor iniciado'),
    stopping: () => localize('server.stopping', 'Parando servidor...'),
    stopped: () => localize('server.stopped', 'Servidor parado'),
    restarting: () => localize('server.restarting', 'Reiniciando servidor...'),
    notConfigured: () => localize('server.notConfigured', 'Configure "server.path" em .pawnpro/config.json (executável do servidor).'),
    notFound: (path: string) => localize('server.notFound', 'Servidor não encontrado: {0}', path),
    alreadyRunning: () => localize('server.alreadyRunning', 'Servidor já está em execução.'),
    notRunning: () => localize('server.notRunning', 'Servidor não está em execução.'),
    failedStart: (err: string) => localize('server.failedStart', 'Falha ao iniciar servidor: {0}', err),
    rconFailed: (err: string) => localize('server.rconFailed', 'Falha ao enviar RCON: {0}', err),
    rconInvalidPassword: () => localize('server.rconInvalidPassword', 'Senha RCON vazia ou inválida ("changename"). Comando não enviado.'),
    rconHint: () => localize('server.rconHint', 'Envie apenas o comando, ex.: "gmx" ou "say oii".'),
  },

  general: {
    settingsMigrated: () => localize('general.settingsMigrated', 'PawnPro: Configurações migradas para .pawnpro/config.json'),
  },

  themes: {
    schemeNotFound: (name: string) => localize('themes.schemeNotFound', '[PawnPro] Esquema não encontrado: {0}', name),
    schemePicker: () => localize('themes.schemePicker', 'Escolha o esquema de sintaxe PawnPro'),
    schemeApplied: (name: string) => localize('themes.schemeApplied', 'PawnPro: esquema aplicado: {0}', name),
    syntaxRestored: () => localize('themes.syntaxRestored', 'PawnPro: sintaxe restaurada (removidas regras PawnPro).'),
  },

  extension: {
    cacheCleaned: () => localize('extension.cacheCleaned', 'PawnPro: cache limpo.'),
    activationError: (err: string) => localize('extension.activationError', '[PawnPro] Erro de ativação: {0}', err),
    sdkFileNotFound: (platform: string) => localize('extension.sdkFileNotFound', 'PawnPro: arquivo SDK ({0}) não encontrado. Configure "analysis.sdk.filePath" em .pawnpro/config.json.', platform),
  },

  statusBar: {
    tooltip: (mode: string) => localize('statusBar.tooltip', 'PawnPro — {0}', mode),
    modeRust: () => localize('statusBar.modeRust', 'Motor Rust LSP ativo'),
    menuTitle: () => localize('statusBar.menuTitle', 'PawnPro — Ações'),
    restartEngine: () => localize('statusBar.restartEngine', 'Reiniciar motor'),
    restartEngineDetail: () => localize('statusBar.restartEngineDetail', 'Reinicia o servidor LSP e limpa o cache'),
    openConfig: () => localize('statusBar.openConfig', 'Abrir .pawnpro/config.json'),
    openConfigDetail: () => localize('statusBar.openConfigDetail', 'Edita as configurações do projeto'),
    engineRestarted: () => localize('statusBar.engineRestarted', 'PawnPro: motor reiniciado.'),
    configNotFound: () => localize('statusBar.configNotFound', 'Nenhum workspace aberto.'),
    sectionServer: () => localize('statusBar.sectionServer', 'Servidor'),
    serverStart: () => localize('statusBar.serverStart', 'Iniciar servidor'),
    serverStop: () => localize('statusBar.serverStop', 'Parar servidor'),
    serverRestart: () => localize('statusBar.serverRestart', 'Reiniciar servidor'),
    editServerCfg: () => localize('statusBar.editServerCfg', 'Editar configuração do servidor'),
    editServerCfgDetail: () => localize('statusBar.editServerCfgDetail', 'Abre server.cfg (SA-MP) ou config.json (open.mp)'),
    serverCfgNotFound: (p: string) => localize('statusBar.serverCfgNotFound', 'Arquivo de configuração não encontrado em: {0}', p),
    sectionTemplates: () => localize('statusBar.sectionTemplates', 'Novo script'),
    newGamemode: () => localize('statusBar.newGamemode', 'Novo Gamemode'),
    newFilterscript: () => localize('statusBar.newFilterscript', 'Novo Filterscript'),
    newInclude: () => localize('statusBar.newInclude', 'Novo Include'),
  },
};

/* ─── Include error message builder (for core/includes.ts) ─────── */

export function buildIncludeErrorMessage(
  token: string,
  hasExtension: boolean,
  isRelative: boolean,
  fromDir: string,
  includePaths: string[],
): string {
  let message = `Include não encontrada: "${token}"`;

  if (!hasExtension) {
    message += ` (tentou: ${token}.inc)`;
  }

  if (isRelative) {
    message += `. Caminho relativo a: ${fromDir}`;
  } else if (includePaths.length > 0) {
    const pathsStr = includePaths.slice(0, 2).join(', ') + (includePaths.length > 2 ? '...' : '');
    message += `. Buscado em: ${pathsStr}`;
  } else {
    message += '. Nenhum includePaths configurado.';
  }

  return message;
}
