import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { PawnProConfig } from './types.js';

/**
 * Teto de tamanho do config.json. Config legítima fica em KB; é uma barreira de
 * segurança contra arquivos absurdos (memória/parse), não restrição de uso.
 * Acima disto, o arquivo é ignorado. Fixo (não exposto na configuração).
 */
const MAX_CONFIG_BYTES = 32 * 1024 * 1024;

const DEFAULTS: PawnProConfig = {
  compiler: { path: '', args: [], autoDetect: true },
  includePaths: ['${workspaceFolder}/pawno/include'],
  output: { encoding: 'windows1252' },
  build: { showCommand: false },
  syntax: { scheme: 'none', applyOnStartup: false },
  ui: { showIncludePaths: false, animateTitle: false },
  server: {
    type: 'auto', path: '', cwd: '${workspaceFolder}', args: [],
    clearOnStart: true, logPath: '',
    logEncoding: 'windows1252',
    output: { follow: 'visible' },
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
  },
  locale: '',
};

type Listener = (cfg: PawnProConfig) => void;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isSafeKey(key: string): boolean {
  return !FORBIDDEN_KEYS.has(key);
}

function deepMerge<T extends Record<string, unknown>>(base: T, override: Record<string, unknown>): T {
  const result = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(override)) {
    if (!isSafeKey(key)) continue;
    const bv = result[key];
    const ov = override[key];
    if (isPlainObject(bv) && isPlainObject(ov)) {
      result[key] = deepMerge(bv as Record<string, unknown>, ov);
    } else if (ov !== undefined) {
      result[key] = ov;
    }
  }
  return result as T;
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    // Barra arquivos absurdamente grandes antes de ler/parsear.
    if (fs.statSync(filePath).size > MAX_CONFIG_BYTES) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeJsonFile(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, filePath);
}

function substituteWorkspace(value: unknown, workspaceRoot: string): unknown {
  if (typeof value === 'string') {
    return value.replace(/\$\{workspaceFolder\}/g, workspaceRoot);
  }
  if (Array.isArray(value)) {
    return value.map(v => substituteWorkspace(v, workspaceRoot));
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = substituteWorkspace(v, workspaceRoot);
    }
    return out;
  }
  return value;
}

export class PawnProConfigManager {
  private globalPath: string;
  private projectPath: string;
  private merged: PawnProConfig = structuredClone(DEFAULTS);
  private raw: { global: Record<string, unknown>; project: Record<string, unknown> } = {
    global: {},
    project: {},
  };
  private listeners: Listener[] = [];

  constructor(private projectRoot: string) {
    this.globalPath = path.join(os.homedir(), '.pawnpro', 'config.json');
    this.projectPath = path.join(projectRoot, '.pawnpro', 'config.json');
    this.reload();
  }

  private applyMerge(): void {
    const merged = deepMerge(
      deepMerge(structuredClone(DEFAULTS) as unknown as Record<string, unknown>, this.raw.global),
      this.raw.project,
    ) as unknown as PawnProConfig;

    this.merged = substituteWorkspace(merged, this.projectRoot) as PawnProConfig;
    this.notify();
  }

  get globalConfigPath(): string { return this.globalPath; }
  get projectConfigPath(): string { return this.projectPath; }

  /**
   * Lista de uma chave de naming tal como escrita no JSON do projeto (não o
   * merged com defaults). Usado pela migração para saber o que o dev de fato
   * colocou inline. Vazio se ausente ou não for um array de strings.
   */
  rawProjectNamingList(key: 'blocklist' | 'allowShortInLoops'): string[] {
    const analysis = this.raw.project['analysis'];
    if (!isPlainObject(analysis)) return [];
    const naming = analysis['naming'];
    if (!isPlainObject(naming)) return [];
    const list = naming[key];
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string') : [];
  }

  reload(): void {
    this.raw.global = readJsonFile(this.globalPath) ?? {};
    this.raw.project = readJsonFile(this.projectPath) ?? {};
    this.applyMerge();
  }

  getAll(): Readonly<PawnProConfig> {
    return this.merged;
  }

  get<K extends keyof PawnProConfig>(section: K): PawnProConfig[K] {
    return this.merged[section];
  }

  set<K extends keyof PawnProConfig>(
    section: K,
    value: Partial<PawnProConfig[K]>,
    scope: 'global' | 'project',
  ): void {
    if (!isSafeKey(section as string)) {
      throw new Error('Invalid config section');
    }
    const filePath = scope === 'global' ? this.globalPath : this.projectPath;
    const current = readJsonFile(filePath) ?? {};

    if (isPlainObject(current[section]) && isPlainObject(value)) {
      const merged: Record<string, unknown> = { ...(current[section] as Record<string, unknown>) };
      for (const key of Object.keys(value as Record<string, unknown>)) {
        if (isSafeKey(key)) merged[key] = (value as Record<string, unknown>)[key];
      }
      current[section] = merged;
    } else {
      current[section] = value as unknown;
    }

    writeJsonFile(filePath, current);
    this.reload();
  }

  setKey(dotPath: string, value: unknown, scope: 'global' | 'project'): void {
    const filePath = scope === 'global' ? this.globalPath : this.projectPath;
    const current = readJsonFile(filePath) ?? {};

    const parts = dotPath.split('.');

    let cursor: Record<string, unknown> = current;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      // Validação no ponto de uso: a chave é checada imediatamente antes de
      // indexar o objeto, bloqueando __proto__/constructor/prototype.
      if (!isSafeKey(key)) {
        throw new Error('Invalid config key: prototype pollution attempt');
      }
      if (!isPlainObject(cursor[key])) {
        cursor[key] = {};
      }
      cursor = cursor[key] as Record<string, unknown>;
    }
    const leaf = parts[parts.length - 1];
    if (!isSafeKey(leaf)) {
      throw new Error('Invalid config key: prototype pollution attempt');
    }
    cursor[leaf] = value;

    writeJsonFile(filePath, current);
    this.reload();
  }

  /** Remove uma chave do JSON do escopo (no-op se ausente). */
  deleteKey(dotPath: string, scope: 'global' | 'project'): void {
    const filePath = scope === 'global' ? this.globalPath : this.projectPath;
    const current = readJsonFile(filePath);
    if (!current) return;

    const parts = dotPath.split('.');
    if (parts.some(p => !isSafeKey(p))) {
      throw new Error('Invalid config key: prototype pollution attempt');
    }

    let cursor: Record<string, unknown> = current;
    for (let i = 0; i < parts.length - 1; i++) {
      const next = cursor[parts[i]];
      if (!isPlainObject(next)) return; // caminho não existe — nada a remover
      cursor = next;
    }
    delete cursor[parts[parts.length - 1]];

    writeJsonFile(filePath, current);
    this.reload();
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

  static get defaults(): Readonly<PawnProConfig> {
    return DEFAULTS;
  }

  private notify(): void {
    for (const fn of this.listeners) {
      try { fn(this.merged); } catch { /* ignore listener errors */ }
    }
  }
}
