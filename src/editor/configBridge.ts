import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PawnProConfigManager } from '../core/config.js';
import { PawnProStateManager } from '../core/state.js';
import { sendConfigurationToEngine } from './lspClient.js';

let configManager: PawnProConfigManager | undefined;
let stateManager: PawnProStateManager | undefined;

export function getConfig(): PawnProConfigManager {
  if (!configManager) throw new Error('PawnPro config not initialized');
  return configManager;
}


export function getWorkspaceRoot(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
}

/**
 * Recuperação de emergência para um `config.json` grande demais para o teto
 * normal (que faria a extensão ignorá-lo e tudo quebrar). Lê o JSON CRU sem o
 * teto, extrai as listas de naming para os arquivos `.ban`/`.allow`, faz backup
 * dos itens e remove-os do JSON, devolvendo-o a um tamanho são.
 *
 * Devolve `{ removed, backup }` em caso de sucesso, ou `null` se não havia nada
 * a recuperar / o arquivo não pôde ser lido ou parseado.
 */
export function recoverLargeConfig(): { removed: number; backup: string | null } | null {
  const root = getWorkspaceRoot();
  if (!root) return null;
  const cfgPath = path.join(root, '.pawnpro', 'config.json');

  let parsed: unknown;
  try {
    // Lê o cru SEM aplicar o teto — é justamente o caso em que o teto barraria.
    parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  } catch {
    return null;
  }
  if (!isObject(parsed)) return null;

  const naming = getNested(parsed, ['analysis', 'naming']);
  if (!isObject(naming)) return null;

  const blocklist = asStringArray(naming['blocklist']);
  const loop = asStringArray(naming['allowShortInLoops']);
  const removed = blocklist.length + loop.length;
  if (removed === 0) return null;

  // Backup dos itens (não do config inteiro) antes de mexer.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(root, '.pawnpro', `naming-backup-${stamp}.json`);
  let backup: string | null = null;
  try {
    fs.writeFileSync(
      backupPath,
      JSON.stringify({ blocklist, allowShortInLoops: loop }, null, 2) + '\n',
    );
    backup = backupPath;
  } catch {
    backup = null;
  }

  // Escreve as listas nos arquivos e remove-as do JSON cru.
  if (blocklist.length > 0) {
    appendListFile(
      path.join(root, '.pawnpro', 'naming-blocklist.ban'),
      'PawnPro — nomes proibidos',
      blocklist,
    );
    delete naming['blocklist'];
  }
  if (loop.length > 0) {
    appendListFile(
      path.join(root, '.pawnpro', 'naming-loop-indices.allow'),
      'PawnPro — índices de loop tolerados',
      loop,
    );
    delete naming['allowShortInLoops'];
  }

  try {
    fs.writeFileSync(cfgPath, JSON.stringify(parsed, null, 2) + '\n');
  } catch {
    return null;
  }
  configManager?.reload();
  return { removed, backup };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function getNested(obj: Record<string, unknown>, keys: string[]): unknown {
  let cur: unknown = obj;
  for (const k of keys) {
    if (!isObject(cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Cabeçalho explicativo escrito no topo de um arquivo de lista gerado. */
function listFileHeader(title: string): string {
  return [
    `# ${title}`,
    '# Um termo por linha. Linhas em branco e iniciadas por # são ignoradas.',
    '# Editável livremente — o PawnPro relê a cada alteração.',
    '',
  ].join('\n');
}

/**
 * Garante a existência dos arquivos de lista do assistente de nomes
 * (`.ban`/`.allow`) na pasta `.pawnpro/`, semeando-os com os padrões da config
 * quando ausentes. Não sobrescreve arquivos existentes (respeita edições do dev).
 */
export function ensureNamingFiles(config: PawnProConfigManager): void {
  const naming = config.getAll().analysis.naming;
  seedListFile(naming.blocklistFile, 'PawnPro — nomes proibidos', naming.blocklist);
  seedListFile(
    naming.loopIndicesFile,
    'PawnPro — índices de loop tolerados',
    naming.allowShortInLoops,
  );
}

function seedListFile(filePath: string, title: string, items: string[]): void {
  if (!filePath || fs.existsSync(filePath)) return;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, listFileHeader(title) + items.join('\n') + '\n');
  } catch {
    // Falha ao semear não é fatal — a engine cai no fallback inline.
  }
}

/** Há listas inline obsoletas (não-vazias) no JSON do projeto a migrar? */
export function hasInlineNamingLists(config: PawnProConfigManager): boolean {
  return (
    config.rawProjectNamingList('blocklist').length > 0 ||
    config.rawProjectNamingList('allowShortInLoops').length > 0
  );
}

/** Total de bytes que a migração escreveria (para o aviso de tamanho). */
export function inlineNamingBytes(config: PawnProConfigManager): number {
  const join = (items: string[]) => Buffer.byteLength(items.join('\n'), 'utf8');
  return (
    join(config.rawProjectNamingList('blocklist')) +
    join(config.rawProjectNamingList('allowShortInLoops'))
  );
}

/**
 * Migra as listas inline obsoletas do JSON do projeto para os arquivos
 * `.ban`/`.allow`, anexando aos termos já presentes no arquivo (sem perder
 * edições) e removendo o inline do JSON. O arquivo passa a ser a fonte única.
 */
export interface NamingMigrationResult {
  /** Termos movidos da blocklist inline para o `.ban`. */
  blocklist: number;
  /** Termos movidos dos índices de loop inline para o `.allow`. */
  loopIndices: number;
}

export function migrateNamingLists(config: PawnProConfigManager): NamingMigrationResult {
  const naming = config.getAll().analysis.naming;
  const migrateOne = (
    filePath: string,
    title: string,
    inline: string[],
    key: 'blocklist' | 'allowShortInLoops',
  ): number => {
    if (inline.length === 0) return 0;
    appendListFile(filePath, title, inline);
    config.deleteKey(`analysis.naming.${key}`, 'project');
    return inline.length;
  };
  return {
    blocklist: migrateOne(
      naming.blocklistFile,
      'PawnPro — nomes proibidos',
      config.rawProjectNamingList('blocklist'),
      'blocklist',
    ),
    loopIndices: migrateOne(
      naming.loopIndicesFile,
      'PawnPro — índices de loop tolerados',
      config.rawProjectNamingList('allowShortInLoops'),
      'allowShortInLoops',
    ),
  };
}

/**
 * Salva um backup APENAS dos itens das chaves a migrar (blocklist /
 * allowShortInLoops) — não do config.json inteiro. Devolve o caminho do backup,
 * ou `null` se não houver nada a salvar / falha. O dev confere e apaga depois.
 */
export function backupNamingLists(config: PawnProConfigManager): string | null {
  const blocklist = config.rawProjectNamingList('blocklist');
  const loop = config.rawProjectNamingList('allowShortInLoops');
  if (blocklist.length === 0 && loop.length === 0) return null;

  const root = getWorkspaceRoot();
  if (!root) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(root, '.pawnpro', `naming-backup-${stamp}.json`);
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify({ blocklist, allowShortInLoops: loop }, null, 2) + '\n');
    return dest;
  } catch {
    return null;
  }
}

/** Anexa termos a um arquivo de lista (criando-o com cabeçalho se ausente),
 *  sem duplicar termos já presentes. */
function appendListFile(filePath: string, title: string, items: string[]): void {
  if (!filePath) return;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    const present = new Set(
      existing
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#')),
    );
    const novos = items.filter(t => !present.has(t.trim()));
    if (novos.length === 0) return;
    const base = existing || listFileHeader(title);
    const sep = base.endsWith('\n') || base === '' ? '' : '\n';
    fs.writeFileSync(filePath, base + sep + novos.join('\n') + '\n');
  } catch {
    // Falha não é fatal — o inline permanece e a engine usa o fallback.
  }
}

export function activateConfigBridge(
  context: vscode.ExtensionContext,
): { config: PawnProConfigManager; state: PawnProStateManager } {
  const projectRoot = getWorkspaceRoot();

  configManager = new PawnProConfigManager(projectRoot);
  stateManager = new PawnProStateManager(projectRoot);

  // Semeia os arquivos de lista quando o assistente de nomes está ligado, para
  // o dev tê-los prontos para editar em vez de mantê-los no JSON.
  if (configManager.getAll().analysis.naming.enabled) {
    ensureNamingFiles(configManager);
  }

  context.subscriptions.push(
    configManager.onChange(() => {
      sendConfigurationToEngine(configManager!, projectRoot);
      if (configManager!.getAll().analysis.naming.enabled) {
        ensureNamingFiles(configManager!);
      }
    }),
  );

  if (projectRoot) {
    const pattern = new vscode.RelativePattern(projectRoot, '.pawnpro/config.json');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const reload = () => configManager?.reload();
    watcher.onDidCreate(reload);
    watcher.onDidChange(reload);
    watcher.onDidDelete(reload);
    context.subscriptions.push(watcher);
  }

  const globalPath = configManager.globalConfigPath;
  try {
    const dir = path.dirname(globalPath);
    if (fs.existsSync(dir)) {
      const fsWatcher = fs.watch(dir, (_: string, filename: string | null) => {
        if (filename === 'config.json') configManager?.reload();
      });
      context.subscriptions.push({ dispose: () => fsWatcher.close() });
    }
  } catch {
    // diretório global pode não existir ainda
  }

  if (projectRoot) {
    const statePattern = new vscode.RelativePattern(projectRoot, '.pawnpro/state.json');
    const stateWatcher = vscode.workspace.createFileSystemWatcher(statePattern);
    stateWatcher.onDidChange(() => stateManager?.load());
    context.subscriptions.push(stateWatcher);
  }

  return { config: configManager, state: stateManager };
}
