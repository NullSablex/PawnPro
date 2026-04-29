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
