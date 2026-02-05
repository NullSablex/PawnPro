import * as fs from 'fs';
import * as path from 'path';
import type { PawnProState } from './types.js';

const DEFAULTS: PawnProState = {
  server: { favorites: [], history: [] },
};

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : null;
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

export class PawnProStateManager {
  private filePath: string;
  private data: PawnProState = structuredClone(DEFAULTS);

  constructor(projectRoot: string) {
    this.filePath = path.join(projectRoot, '.pawnpro', 'state.json');
    this.load();
  }

  get stateFilePath(): string { return this.filePath; }

  load(): void {
    const raw = readJsonFile(this.filePath);
    if (!raw) {
      this.data = structuredClone(DEFAULTS);
      return;
    }
    this.data = {
      server: {
        favorites: Array.isArray((raw.server as any)?.favorites)
          ? (raw.server as any).favorites
          : [],
        history: Array.isArray((raw.server as any)?.history)
          ? (raw.server as any).history
          : [],
      },
    };
  }

  save(): void {
    writeJsonFile(this.filePath, this.data);
  }

  getAll(): Readonly<PawnProState> {
    return this.data;
  }

  get<K extends keyof PawnProState>(key: K): PawnProState[K] {
    return this.data[key];
  }

  update<K extends keyof PawnProState>(key: K, value: PawnProState[K]): void {
    this.data[key] = value;
    this.save();
  }
}
