import * as fs from 'fs';
import * as path from 'path';
import { PAWNPRO_DIR } from './config.js';
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

/**
 * Garante que `.pawnpro/` tenha um `.gitignore` cobrindo o estado local.
 *
 * `state.json` guarda o histórico de comandos do servidor — dados da operação
 * de quem desenvolve, que não pertencem ao repositório. Um `.gitignore` dentro
 * da própria pasta protege sem exigir que cada projeto lembre de listá-la, e
 * sem tocar no `.gitignore` da raiz, que é do usuário.
 */
function ensureIgnored(dir: string): void {
  const file = path.join(dir, '.gitignore');
  try {
    if (fs.existsSync(file)) return;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      file,
      '# Estado local do PawnPro — não pertence ao repositório.\n'
        + 'state.json\n',
      'utf8',
    );
  } catch {
    // Sem permissão de escrita, o estado ainda funciona; só não se autoprotege.
  }
}

function writeJsonFile(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + '.tmp';
  // 0600: o histórico guarda o que se digitou no painel do servidor. Mesmo
  // filtrando o que parece credencial, o resto revela a operação do servidor —
  // não há motivo para outros usuários da máquina lerem. Em Windows o modo é
  // ignorado pelo sistema, e a ACL do diretório é quem vale.
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, filePath);
  // `rename` preserva o modo do arquivo temporário, mas um arquivo que já
  // existia de uma versão anterior mantém a permissão antiga.
  try { fs.chmodSync(filePath, 0o600); } catch { /* sistema sem suporte */ }
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
    this.filePath = path.join(projectRoot, PAWNPRO_DIR, 'state.json');
    ensureIgnored(path.dirname(this.filePath));
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
