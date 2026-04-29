import * as fs from 'fs';
import * as path from 'path';
import type { PawnProState, ServerState } from './types.js';

const DEFAULTS: PawnProState = {
  server: { favorites: [], history: [] },
};

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
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

function parseServerState(raw: Record<string, unknown>): ServerState {
  const server = raw['server'];
  const s = typeof server === 'object' && server !== null ? (server as Record<string, unknown>) : {};
  return {
    favorites: Array.isArray(s['favorites']) ? (s['favorites'] as string[]) : [],
    history: Array.isArray(s['history']) ? (s['history'] as string[]) : [],
  };
}

export class PawnProStateManager {
  private readonly filePath: string;
  private data: PawnProState = structuredClone(DEFAULTS);

  constructor(projectRoot: string) {
    this.filePath = path.join(projectRoot, '.pawnpro', 'state.json');
    this.load();
  }

  get stateFilePath(): string { return this.filePath; }

  load(): void {
    const raw = readJsonFile(this.filePath);
    this.data = raw ? { server: parseServerState(raw) } : structuredClone(DEFAULTS);
  }

  save(): void {
    writeJsonFile(this.filePath, this.data);
  }

  getAll(): Readonly<PawnProState> {
    return structuredClone(this.data);
  }

  get<K extends keyof PawnProState>(key: K): PawnProState[K] {
    return structuredClone(this.data[key]);
  }

  update<K extends keyof PawnProState>(key: K, value: PawnProState[K]): void {
    this.data[key] = structuredClone(value);
    this.save();
  }
}
