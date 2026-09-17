import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PAWNPRO_DIR, PawnProConfigManager, type NamingMigrationResult } from '../core/config.js';
import { PawnProStateManager } from '../core/state.js';
import { request } from '../core/client.js';

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
 * normal (que faria o núcleo ignorá-lo e tudo quebrar). Lê o JSON CRU sem o
 * teto, extrai as listas de naming para os arquivos `.ban`/`.allow`, faz backup
 * dos itens e remove-os do JSON, devolvendo-o a um tamanho são.
 *
 * É a única escrita no `config.json` fora do núcleo, e de propósito: o núcleo
 * recusa ler o arquivo acima do teto, justamente o caso a recuperar. Ao fim, o
 * núcleo relê.
 *
 * Devolve `{ removed, backup }` em caso de sucesso, ou `null` se não havia nada
 * a recuperar / o arquivo não pôde ser lido ou parseado.
 */
export async function recoverLargeConfig(): Promise<{ removed: number; backup: string | null } | null> {
  const root = getWorkspaceRoot();
  if (!root) return null;
  const cfgPath = path.join(root, PAWNPRO_DIR, 'config.json');

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
  const backupPath = makeBackupPath(root);
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
      path.join(root, PAWNPRO_DIR, 'naming-blocklist.ban'),
      'PawnPro — nomes proibidos',
      blocklist,
    );
    delete naming['blocklist'];
  }
  if (loop.length > 0) {
    appendListFile(
      path.join(root, PAWNPRO_DIR, 'naming-loop-indices.allow'),
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
  await configManager?.reload();
  return { removed, backup };
}

/**
 * Caminho do backup dos itens de nomenclatura, carimbado pela hora.
 *
 * Os dois lugares que gravam backup montavam o mesmo caminho, cada um com sua
 * cópia do carimbo — mudar o formato exigiria lembrar dos dois.
 */
function makeBackupPath(root: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(root, PAWNPRO_DIR, `naming-backup-${stamp}.json`);
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
 * (`.ban`/`.allow`), semeados com os padrões da config quando ausentes. Não
 * sobrescreve arquivos existentes (respeita edições do dev).
 */
export async function ensureNamingFiles(config: PawnProConfigManager): Promise<void> {
  await config.ensureNamingFiles();
}

/**
 * Se ainda há listas inline obsoletas no JSON do projeto, e quantos bytes a
 * migração gravaria (para o aviso de tamanho). Quem lê o JSON é o núcleo.
 */
export function inlineNamingLists(): Promise<{ present: boolean; bytes: number }> {
  return request<{ present: boolean; bytes: number }>('config.inlineNamingLists');
}

/**
 * Migra as listas inline obsoletas do JSON do projeto para os arquivos
 * `.ban`/`.allow`, anexando aos termos já presentes no arquivo (sem perder
 * edições) e removendo o inline do JSON. O arquivo passa a ser a fonte única.
 */
export async function migrateNamingLists(config: PawnProConfigManager): Promise<NamingMigrationResult> {
  return config.migrateNaming();
}

/**
 * Salva um backup APENAS dos itens das chaves a migrar (blocklist /
 * allowShortInLoops) — não do config.json inteiro. Devolve o caminho do backup,
 * ou `null` se não houver nada a salvar / falha. O dev confere e apaga depois.
 */
export async function backupNamingLists(config: PawnProConfigManager): Promise<string | null> {
  const root = getWorkspaceRoot();
  if (!root) return null;
  try {
    return await config.backupNaming(makeBackupPath(root));
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
    const fresh = items.filter(t => !present.has(t.trim()));
    if (fresh.length === 0) return;
    const base = existing || listFileHeader(title);
    const sep = base.endsWith('\n') || base === '' ? '' : '\n';
    fs.writeFileSync(filePath, base + sep + fresh.join('\n') + '\n');
  } catch {
    // Falha não é fatal — o inline permanece e a engine usa o fallback.
  }
}

/**
 * Cria a configuração e o estado do projeto.
 *
 * `ready` resolve quando a configuração chegou do núcleo — `false` se ele não
 * respondeu, e os padrões seguem valendo. Quem precisa registrar algo antes de
 * qualquer espera (o depurador) registra antes de aguardá-la.
 *
 * O núcleo observa os `config.json` sozinho e avisa pela notificação; a
 * extensão não vigia mais esses arquivos, e não reenvia nada à engine — o
 * núcleo entrega a ela diretamente.
 */
export function activateConfigBridge(
  context: vscode.ExtensionContext,
): { config: PawnProConfigManager; state: PawnProStateManager; ready: Promise<boolean> } {
  const projectRoot = getWorkspaceRoot();

  configManager = PawnProConfigManager.create(projectRoot);
  stateManager = PawnProStateManager.create(projectRoot);
  const config = configManager;
  const state = stateManager;

  // Semeia os arquivos de lista quando o assistente de nomes está ligado, para
  // o dev tê-los prontos para editar em vez de mantê-los no JSON.
  const seedNamingFiles = () => {
    if (config.loaded && config.getAll().analysis.naming.enabled) {
      void config.ensureNamingFiles().catch(() => undefined);
    }
  };

  // O estado vem junto: o painel do servidor lê os favoritos ao abrir. A falha
  // dele não pesa em `ready` — sem ele o painel só começa vazio.
  const ready = Promise.all([config.load(), state.load()]).then(([loaded]) => {
    seedNamingFiles();
    return loaded;
  });

  context.subscriptions.push(config.onChange(seedNamingFiles));

  // Outra janela do mesmo projeto também grava o estado.
  if (projectRoot) {
    const statePattern = new vscode.RelativePattern(projectRoot, '.pawnpro/state.json');
    const stateWatcher = vscode.workspace.createFileSystemWatcher(statePattern);
    stateWatcher.onDidChange(() => void state.load());
    context.subscriptions.push(stateWatcher);
  }

  return { config, state, ready };
}
