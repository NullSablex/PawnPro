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
  /**
   * Idioma da interface da extensão (páginas WebView: Configurações, Ajuda, O que
   * há de novo). Independente de `locale` (que é o idioma da engine/debugger).
   * Vazio = segue o idioma do editor. Tags aceitas: "pt-BR", "en", "es", "ro", "ru".
   */
  locale: string;
  /**
   * Cor de destaque das páginas da extensão (botões, item ativo, foco). Vazio =
   * automático: herda do tema do editor, como sempre foi. Paleta fechada porque
   * o valor entra em CSS e precisa ter contraste garantido nos dois temas.
   * Não afeta o realce de sintaxe, que tem seu próprio esquema.
   */
  accent: AccentColor;
}

/** Vazio = segue o tema do editor. */
export type AccentColor = '' | 'blue' | 'purple' | 'green' | 'amber' | 'pink' | 'teal';

export interface ServerOutputConfig {
  follow: 'visible' | 'always' | 'off';
}

export type ServerType = 'auto' | 'samp' | 'omp';

/** Como o painel guarda os comandos enviados. */
export interface ServerHistoryConfig {
  /** `false` desliga o registro: nada é gravado em `.pawnpro/state.json`. */
  enabled: boolean;
  /**
   * Comandos do gamemode que não devem ser guardados, além dos que a extensão
   * já reconhece. Comparados pelo primeiro termo, sem diferenciar maiúsculas.
   */
  sensitiveCommands: string[];
}

export interface ServerConfig {
  type: ServerType;
  history: ServerHistoryConfig;
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
export type NameCaseBuiltin =
  | 'camelCase'
  | 'snake_case'
  | 'PascalCase'
  | 'UPPER_CASE'
  | 'Capitalized_Snake';

/**
 * Critério de nomenclatura: um dos estilos embutidos ou um regex do usuário no
 * formato `/padrão/`. A engine âncora o padrão como `^(?:…)$` — ele descreve o
 * nome inteiro. Um regex inválido é ignorado por lá, não invalida a config.
 */
export type NameCase = NameCaseBuiltin | `/${string}/`;

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
  /**
   * Preserva o alinhamento manual em colunas de inicializadores de array `{ }`
   * multi-linha (o miolo sai intacto). Ortogonal ao preset — aplicado sempre.
   */
  preserveArrayAlignment: boolean;
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

export interface SampCfgData {
  rconPassword: string;
  port: number;
  host: string;
  cfgPath: string;
  /**
   * `false` quando o `config.json` do open.mp traz `rcon.enable: false` — o
   * servidor não escuta comandos RCON. No SA-MP é sempre `true`: não há chave
   * equivalente.
   */
  rconEnabled: boolean;
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
