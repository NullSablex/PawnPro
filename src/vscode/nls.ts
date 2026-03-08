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

  diagnostics: {
    includeNotFound: (token: string) => localize('diagnostics.includeNotFound', 'Include não encontrada: "{0}"', token),
    triedExtension: (token: string) => localize('diagnostics.triedExtension', ' (tentou: {0}.inc)', token),
    relativePath: (dir: string) => localize('diagnostics.relativePath', '. Caminho relativo a: {0}', dir),
    searchedIn: (paths: string) => localize('diagnostics.searchedIn', '. Buscado em: {0}', paths),
    noIncludePaths: () => localize('diagnostics.noIncludePaths', '. Nenhum includePaths configurado.'),
    unusedVariable: (name: string) => localize('diagnostics.unusedVariable', '"{0}" variável declarada mas não utilizada', name),
    unusedStock: (name: string) => localize('diagnostics.unusedStock', '"{0}" função stock declarada mas não utilizada', name),
  },

  hover: {
    openFile: () => localize('hover.openFile', 'Abrir arquivo'),
    fileNotFound: () => localize('hover.fileNotFound', 'Arquivo não encontrado nas include paths.'),
    aliasOf: () => localize('hover.aliasOf', '— alias de:'),
    goToLine: () => localize('hover.goToLine', 'Ir para a linha'),
    line: (n: number) => localize('hover.line', ' linha {0}', n),
  },

  codelens: {
    reference: () => localize('codelens.reference', '1 referência'),
    references: (n: number) => localize('codelens.references', '{0} referências', n),
    showReferences: () => localize('codelens.showReferences', 'Mostrar todas as referências'),
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
    cachePrewarmed: () => localize('general.cachePrewarmed', 'Cache pré-aquecido'),
    cacheStats: (stats: string) => localize('general.cacheStats', 'Estatísticas do cache: {0}', stats),
  },

  debug: {
    cacheStatsTitle: () => localize('debug.cacheStatsTitle', 'PawnPro: Estatísticas do Cache'),
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
  let message = msg.diagnostics.includeNotFound(token);

  if (!hasExtension) {
    message += msg.diagnostics.triedExtension(token);
  }

  if (isRelative) {
    message += msg.diagnostics.relativePath(fromDir);
  } else if (includePaths.length > 0) {
    const pathsStr = includePaths.slice(0, 2).join(', ') + (includePaths.length > 2 ? '...' : '');
    message += msg.diagnostics.searchedIn(pathsStr);
  } else {
    message += msg.diagnostics.noIncludePaths();
  }

  return message;
}
