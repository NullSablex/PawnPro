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
  ui: { separateContainer: false, showIncludePaths: false },
  server: {
    path: '', cwd: '${workspaceFolder}', args: [],
    clearOnStart: true, logPath: '${workspaceFolder}/server_log.txt',
    logEncoding: 'windows1252',
    output: { follow: 'visible' },
  },
};

type Listener = (cfg: PawnProConfig) => void;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepMerge<T extends Record<string, unknown>>(base: T, override: Record<string, unknown>): T {
  const result = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(override)) {
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
  private listeners: Listener[] = [];

  constructor(private projectRoot: string) {
    this.globalPath = path.join(os.homedir(), '.pawnpro', 'config.json');
    this.projectPath = path.join(projectRoot, '.pawnpro', 'config.json');
    this.reload();
  }

  get globalConfigPath(): string { return this.globalPath; }
  get projectConfigPath(): string { return this.projectPath; }

  reload(): void {
    this.raw.global = readJsonFile(this.globalPath) ?? {};
    this.raw.project = readJsonFile(this.projectPath) ?? {};

    const merged = deepMerge(
      deepMerge(structuredClone(DEFAULTS) as unknown as Record<string, unknown>, this.raw.global),
      this.raw.project,
    ) as unknown as PawnProConfig;

    this.merged = substituteWorkspace(merged, this.projectRoot) as PawnProConfig;
    this.notify();
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
    const filePath = scope === 'global' ? this.globalPath : this.projectPath;
    const current = readJsonFile(filePath) ?? {};

    if (isPlainObject(current[section]) && isPlainObject(value)) {
      current[section] = { ...(current[section] as Record<string, unknown>), ...value };
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
    // Guard against prototype pollution
    const forbidden = ['__proto__', 'constructor', 'prototype'];
    if (parts.some(p => forbidden.includes(p))) {
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
