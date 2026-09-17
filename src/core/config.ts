import { onNotification, request } from './client.js';
import type { PawnProConfig } from './types.js';

/**
 * Pasta de configuração do PawnPro, no projeto e no diretório do usuário.
 *
 * O nome estava repetido em oito lugares, entre o core e a camada do editor:
 * renomeá-la exigiria achar todos.
 */
export const PAWNPRO_DIR = '.pawnpro';

/**
 * Prazo da primeira carga.
 *
 * Um núcleo que não responde não pode segurar a ativação: passado o prazo, a
 * extensão segue com os padrões. Se a resposta chegar depois, a notificação
 * `config.changed` a entrega do mesmo jeito.
 */
const LOAD_TIMEOUT_MS = 5_000;

/**
 * Os padrões da configuração, valendo só enquanto o núcleo não respondeu.
 *
 * Quem lê e mescla a configuração é o núcleo; estes valores existem para a
 * extensão abrir sem ele. `config.test.ts` exige que sejam iguais aos dele.
 */
export const DEFAULTS: PawnProConfig = {
  compiler: { path: '', args: [], autoDetect: true },
  includePaths: ['${workspaceFolder}/pawno/include'],
  output: { encoding: 'windows1252' },
  build: { showCommand: false },
  syntax: { scheme: 'none', applyOnStartup: false },
  ui: { showIncludePaths: false, animateTitle: false, locale: '', accent: '' },
  server: {
    type: 'auto', path: '', cwd: '${workspaceFolder}', args: [],
    clearOnStart: true, logPath: '',
    logEncoding: 'windows1252',
    output: { follow: 'visible' },
    history: { enabled: true, sensitiveCommands: [] },
  },
  analysis: {
    warnUnusedInInc: false,
    suppressDiagnosticsInInc: false,
    sdk: { platform: 'auto', filePath: '' },
    naming: {
      enabled: false,
      minLength: 2,
      allowShortInLoops: ['i', 'j', 'k'],
      blocklist: ['tmp', 'temp', 'aux', 'foo', 'bar', 'data', 'var'],
      blocklistFile: '${workspaceFolder}/.pawnpro/naming-blocklist.ban',
      loopIndicesFile: '${workspaceFolder}/.pawnpro/naming-loop-indices.allow',
      maxListFileBytes: 32 * 1024 * 1024,
      style: {
        functions: [],
        globals: [],
        locals: [],
        constants: [],
        macros: [],
        parameters: [],
      },
    },
  },
  format: {
    preset: 'allman',
    braceStyle: 'nextLine',
    spaceAroundOperators: true,
    emptyBlockSameLine: true,
    preserveArrayAlignment: false,
  },
  locale: '',
  diagnostics: { level: 'off' },
};

type Listener = (cfg: PawnProConfig) => void;
type Scope = 'global' | 'project';

/** O que o núcleo devolve a cada leitura ou escrita. */
export interface ConfigSnapshot {
  config: PawnProConfig;
  globalPath: string;
  projectPath: string;
  /** Chaves ignoradas por terem o tipo errado. */
  rejected: string[];
}

/** Quantos termos a migração moveu de cada lista. */
export interface NamingMigrationResult {
  blocklist: number;
  loopIndices: number;
}

/** A gravação foi pedida sem o núcleo de pé. */
export class ConfigUnavailableError extends Error {
  constructor() {
    super('configuração indisponível: o núcleo do PawnPro não está em execução');
    this.name = 'ConfigUnavailableError';
  }
}

/**
 * A configuração do projeto, como o núcleo a resolveu.
 *
 * Quem lê, mescla e grava os `config.json` é o núcleo. Aqui fica a última
 * versão que ele mandou — por isso as leituras continuam síncronas — e as
 * escritas viram pedidos. O núcleo avisa toda mudança por `config.changed`
 * antes de responder ao pedido que a causou: quando o `await` de uma escrita
 * termina, o cache já está atualizado.
 */
export class PawnProConfigManager {
  private snapshot: ConfigSnapshot | null = null;
  private listeners: Listener[] = [];

  private constructor(private readonly projectRoot: string) {}

  /**
   * Cria o gerenciador e passa a ouvir o núcleo. A carga vem em `load()`:
   * separar as duas deixa a ativação registrar o que precisa antes de esperar.
   */
  static create(projectRoot: string): PawnProConfigManager {
    const manager = new PawnProConfigManager(projectRoot);
    onNotification('config.changed', (params) => manager.apply(params as ConfigSnapshot));
    return manager;
  }

  /** Pede ao núcleo a configuração do projeto. `false` deixa os padrões valendo. */
  async load(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('o núcleo não respondeu a tempo')), LOAD_TIMEOUT_MS);
    });
    try {
      const opened = request<ConfigSnapshot>('config.open', { workspaceRoot: this.projectRoot });
      this.apply(await Promise.race([opened, timeout]));
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /** `true` quando a configuração veio do núcleo, e não dos padrões. */
  get loaded(): boolean {
    return this.snapshot !== null;
  }

  get globalConfigPath(): string {
    return this.snapshot?.globalPath ?? '';
  }

  get projectConfigPath(): string {
    return this.snapshot?.projectPath ?? '';
  }

  /** Chaves que o núcleo ignorou por terem o tipo errado. */
  get rejectedKeys(): readonly string[] {
    return this.snapshot?.rejected ?? [];
  }

  getAll(): Readonly<PawnProConfig> {
    return this.snapshot?.config ?? DEFAULTS;
  }

  get<K extends keyof PawnProConfig>(section: K): PawnProConfig[K] {
    return this.getAll()[section];
  }

  /** Grava campos de uma seção, numa escrita só. */
  async set<K extends keyof PawnProConfig>(
    section: K,
    value: Partial<PawnProConfig[K]>,
    scope: Scope,
  ): Promise<void> {
    const isSection = typeof value === 'object' && value !== null && !Array.isArray(value);
    const entries = isSection
      ? Object.entries(value).map(([key, v]) => ({ key: `${String(section)}.${key}`, value: v }))
      : [{ key: String(section), value }];
    await this.write('config.set', { entries, scope });
  }

  async setKey(dotPath: string, value: unknown, scope: Scope): Promise<void> {
    await this.write('config.set', { entries: [{ key: dotPath, value }], scope });
  }

  /** Remove uma chave do JSON do escopo (no-op se ausente). */
  async deleteKey(dotPath: string, scope: Scope): Promise<void> {
    await this.write('config.delete', { key: dotPath, scope });
  }

  /** Pede ao núcleo que releia os arquivos agora, sem esperar o observador. */
  async reload(): Promise<void> {
    if (!this.loaded) return;
    await this.write('config.reload', {});
  }

  /** Cria os arquivos `.ban`/`.allow` que ainda não existem. */
  async ensureNamingFiles(): Promise<void> {
    await this.write('config.ensureNamingFiles', {});
  }

  /** Salva em `path` só os termos que a migração vai mover. */
  async backupNaming(path: string): Promise<string | null> {
    this.requireLoaded();
    const saved = await request<{ path: string | null }>('config.backupNaming', { path });
    return saved.path;
  }

  /** Move as listas inline para os arquivos e as tira do JSON. */
  async migrateNaming(): Promise<NamingMigrationResult> {
    this.requireLoaded();
    const done = await request<{ moved: NamingMigrationResult; snapshot: ConfigSnapshot }>(
      'config.migrateNaming',
    );
    this.apply(done.snapshot);
    return done.moved;
  }

  onChange(listener: Listener): { dispose(): void } {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const idx = this.listeners.indexOf(listener);
        if (idx >= 0) this.listeners.splice(idx, 1);
      },
    };
  }

  private async write(method: string, params: Record<string, unknown>): Promise<void> {
    this.requireLoaded();
    this.apply(await request<ConfigSnapshot>(method, params));
  }

  /**
   * Sem núcleo não há quem mescle e grave com segurança: gravar por fora
   * recriaria o segundo dono da configuração que o núcleo existe para evitar.
   */
  private requireLoaded(): void {
    if (!this.loaded) throw new ConfigUnavailableError();
  }

  /**
   * O núcleo avisa a mudança e em seguida responde com o mesmo estado: sem a
   * comparação, cada escrita chegaria duas vezes a quem assina.
   */
  private apply(next: ConfigSnapshot): void {
    const same = this.snapshot !== null && JSON.stringify(this.snapshot) === JSON.stringify(next);
    this.snapshot = next;
    if (same) return;
    for (const fn of this.listeners) {
      try { fn(next.config); } catch { /* um assinante com defeito não cala os outros */ }
    }
  }
}
