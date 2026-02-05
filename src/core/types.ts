/* ─── Configuration ─────────────────────────────────────────────── */

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
  separateContainer: boolean;
  showIncludePaths: boolean;
}

export interface ServerOutputConfig {
  follow: 'visible' | 'always' | 'off';
}

export interface ServerConfig {
  path: string;
  cwd: string;
  args: string[];
  clearOnStart: boolean;
  logPath: string;
  logEncoding: string;
  output: ServerOutputConfig;
}

export interface PawnProConfig {
  compiler: CompilerConfig;
  includePaths: string[];
  output: OutputConfig;
  build: BuildConfig;
  syntax: SyntaxConfig;
  ui: UiConfig;
  server: ServerConfig;
}

/* ─── State ─────────────────────────────────────────────────────── */

export interface ServerState {
  favorites: string[];
  history: string[];
}

export interface PawnProState {
  server: ServerState;
}

/* ─── Hover ─────────────────────────────────────────────────────── */

export type HoverSection =
  | { kind: 'text'; content: string }
  | { kind: 'code'; content: string; language: string }
  | { kind: 'link'; label: string; command: string; args: unknown[] }
  | { kind: 'fileLink'; label: string; filePath: string; line: number };

export interface HoverData {
  sections: HoverSection[];
}

export interface HoverParams {
  text: string;
  filePath: string;
  line: number;
  character: number;
  lineText: string;
  workspaceRoot: string;
  includePaths: string[];
  extensionDir?: string;
}

/* ─── Diagnostics ───────────────────────────────────────────────── */

export interface DiagnosticData {
  startOffset: number;
  endOffset: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  source: string;
}

/* ─── Include Tree ──────────────────────────────────────────────── */

export interface IncludeFileEntry {
  filePath: string;
  baseName: string;
}

export interface NativeEntry {
  name: string;
  signature: string;
  filePath: string;
  line: number;
}

/* ─── Compiler ──────────────────────────────────────────────────── */

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

/* ─── Server ────────────────────────────────────────────────────── */

export type ServerRunState = 'stopped' | 'starting' | 'running';

export interface SampCfgData {
  rconPassword: string;
  port: number;
  host: string;
  cfgPath: string;
}

/* ─── Themes ────────────────────────────────────────────────────── */

export type ThemeKind = 'dark' | 'light' | 'highContrast';

export interface TokenColorRule {
  scope: string[] | string;
  settings: Record<string, unknown>;
}

export interface TokenColorScheme {
  textMateRules: TokenColorRule[];
}

/* ─── Output interface (for LogTailer and similar) ──────────────── */

export interface OutputSink {
  clear(): void;
  append(text: string): void;
  appendLine(text: string): void;
  show(preserveFocus: boolean): void;
}
