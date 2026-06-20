export interface CompilerConfig {
  path: string;
  args: string[];
  autoDetect: boolean;
}

export interface OutputConfig {
  encoding: string;
}

export interface BuildConfig {
  showCommand: boolean;
}

export type SyntaxScheme =
  | 'auto'
  | 'classic_white'
  | 'modern_white'
  | 'classic_dark'
  | 'modern_dark'
  | 'none';

export interface SyntaxConfig {
  scheme: SyntaxScheme;
  applyOnStartup: boolean;
}

export interface UiConfig {
  showIncludePaths: boolean;
  /** Anima sutilmente o título "PawnPro" no topo das páginas. Padrão desligado. */
  animateTitle: boolean;
}

export interface ServerOutputConfig {
  follow: 'visible' | 'always' | 'off';
}

export type ServerType = 'auto' | 'samp' | 'omp';

export interface ServerConfig {
  type: ServerType;
  path: string;
  cwd: string;
  args: string[];
  clearOnStart: boolean;
  logPath: string;
  logEncoding: string;
  output: ServerOutputConfig;
}

export type SdkPlatform = 'auto' | 'omp' | 'samp' | 'none';

export interface AnalysisSdkConfig {
  platform: SdkPlatform;
  filePath: string;
}

export interface AnalysisConfig {
  warnUnusedInInc: boolean;
  suppressDiagnosticsInInc: boolean;
  sdk: AnalysisSdkConfig;
  naming: NamingConfig;
}

/** Estilo de caixa. Cada categoria aceita uma lista; vazia = não checa. */
export type NameCase = 'camelCase' | 'snake_case' | 'PascalCase' | 'UPPER_CASE' | 'Capitalized_Snake';

/**
 * Estilos de caixa aceitos por categoria. Cada campo é uma lista: um nome é
 * aceito se casar com QUALQUER estilo dela; lista vazia desliga a checagem.
 */
export interface NamingStyleConfig {
  functions: NameCase[];
  globals: NameCase[];
  locals: NameCase[];
  /** Constantes tipadas: `const`, membros de enum. */
  constants: NameCase[];
  /** Macros do preprocessador: `#define`. */
  macros: NameCase[];
  parameters: NameCase[];
}

export interface NamingConfig {
  /** Liga o assistente de nomes (PP0018). Padrão desligado. */
  enabled: boolean;
  /** Comprimento mínimo de identificador antes de sinalizar (exceto índices de loop). */
  minLength: number;
  /** Nomes de 1 letra tolerados em cabeçalho de `for` (fallback do arquivo). */
  allowShortInLoops: string[];
  /** Identificadores genéricos sempre sinalizados (fallback do arquivo). */
  blocklist: string[];
  /** Caminho do arquivo `.ban` com os nomes proibidos (tem prioridade). */
  blocklistFile: string;
  /** Caminho do arquivo `.allow` com os índices de loop tolerados (tem prioridade). */
  loopIndicesFile: string;
  /**
   * Limite de processamento (bytes) de cada arquivo `.ban`/`.allow`. Acima disto
   * a engine/extensão não processa o arquivo, por segurança — não impede o dev
   * de escrevê-lo.
   */
  maxListFileBytes: number;
  /** Estilo de caixa esperado por categoria. */
  style: NamingStyleConfig;
}

export type FormatPreset = 'allman' | 'knr' | 'compact' | 'custom';
export type FormatBraceStyle = 'nextLine' | 'sameLine';

export interface FormatConfig {
  /** Preset de estilo: allman, knr, compact ou custom (libera os ajustes finos). */
  preset: FormatPreset;
  /** Posição da chave de abertura de bloco. Só aplicado quando preset = custom. */
  braceStyle: FormatBraceStyle;
  /** Espaço em volta de operadores binários. Só aplicado quando preset = custom. */
  spaceAroundOperators: boolean;
  /** Mantém blocos vazios colados (`if (a) {}`). Só aplicado quando preset = custom. */
  emptyBlockSameLine: boolean;
}

export interface PawnProConfig {
  compiler: CompilerConfig;
  includePaths: string[];
  output: OutputConfig;
  build: BuildConfig;
  syntax: SyntaxConfig;
  ui: UiConfig;
  server: ServerConfig;
  analysis: AnalysisConfig;
  format: FormatConfig;
  locale: string;
}

export interface ServerState {
  favorites: string[];
  history: string[];
}

export interface PawnProState {
  server: ServerState;
}


export interface NativeEntry {
  name: string;
  signature: string;
  filePath: string;
  line: number;
}

export interface CompileResult {
  exitCode: number | null;
  signal: string | null;
  output: string;
}

export interface CompileArgs {
  exe: string;
  args: string[];
  cwd: string;
  removedFlags: string[];
}

export type ServerRunState = 'stopped' | 'starting' | 'running';

export interface SampCfgData {
  rconPassword: string;
  port: number;
  host: string;
  cfgPath: string;
}

export type ThemeKind = 'dark' | 'light' | 'highContrast';

export interface TokenColorRule {
  scope: string[] | string;
  settings: Record<string, unknown>;
}

export interface TokenColorScheme {
  textMateRules: TokenColorRule[];
  semanticRules?: Record<string, Record<string, unknown>>;
}

export interface OutputSink {
  clear(): void;
  append(text: string): void;
  appendLine(text: string): void;
  show(preserveFocus: boolean): void;
}
