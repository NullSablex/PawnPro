import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { PawnProConfig } from './types.js';

const DEFAULTS: PawnProConfig = {
  compiler: { path: '', args: [], autoDetect: true },
  includePaths: ['${workspaceFolder}/pawno/include'],
  output: { encoding: 'windows1252' },
  build: { showCommand: false },
  syntax: { scheme: 'none', applyOnStartup: false },
  ui: { showIncludePaths: false },
  server: {
    type: 'auto', path: '', cwd: '${workspaceFolder}', args: [],
    clearOnStart: true, logPath: '',
    logEncoding: 'windows1252',
    output: { follow: 'visible' },
  },
  analysis: {
    warnUnusedInInc: false,
    sdk: { platform: 'omp', filePath: '' },
  },
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
  private externalDefaults: Record<string, unknown> = {};
  private listeners: Listener[] = [];

  constructor(private projectRoot: string) {
    this.globalPath = path.join(os.homedir(), '.pawnpro', 'config.json');
    this.projectPath = path.join(projectRoot, '.pawnpro', 'config.json');
    this.reload();
  }

  /**
   * Define defaults externos (ex: settings do VS Code) com prioridade menor que os
   * arquivos de config. Ordem: DEFAULTS < externalDefaults < global < project.
   */
  setExternalDefaults(overrides: Record<string, unknown>): void {
    this.externalDefaults = overrides;
    this.applyMerge();
  }

  private applyMerge(): void {
    const merged = deepMerge(
      deepMerge(
        deepMerge(structuredClone(DEFAULTS) as unknown as Record<string, unknown>, this.externalDefaults),
        this.raw.global,
      ),
      this.raw.project,
    ) as unknown as PawnProConfig;

    this.merged = substituteWorkspace(merged, this.projectRoot) as PawnProConfig;
    this.notify();
  }

  get globalConfigPath(): string { return this.globalPath; }
  get projectConfigPath(): string { return this.projectPath; }

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
    if (parts.some(p => !isSafeKey(p))) {
      throw new Error('Invalid config key: prototype pollution attempt');
    }

    let cursor: Record<string, unknown> = current;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (!isPlainObject(cursor[key])) {
        cursor[key] = {};
      }
      cursor = cursor[key] as Record<string, unknown>;
    }
    cursor[parts[parts.length - 1]] = value;

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

  hasProjectConfig(): boolean {
    try {
      return fs.existsSync(this.projectPath);
    } catch {
      return false;
    }
  }

  hasGlobalConfig(): boolean {
    try {
      return fs.existsSync(this.globalPath);
    } catch {
      return false;
    }
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
