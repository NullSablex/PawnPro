import { request } from './client.js';
import { logError } from './logger.js';
import type { PawnProState } from './types.js';

/**
 * O estado local do projeto: favoritos e histórico do painel do servidor.
 *
 * Quem lê e grava `.pawnpro/state.json` é o núcleo — com escrita atômica,
 * permissão restrita ao dono e o `.gitignore` que protege o arquivo. Aqui fica
 * a cópia desta janela.
 *
 * A gravação é otimista: o cache muda na hora e o pedido vai ao núcleo em
 * seguida, na ordem. O painel lê os favoritos logo depois de gravá-los, e esta
 * janela é a única que escreve — o cache já é a verdade, e a resposta do
 * núcleo não o sobrescreve. Se sobrescrevesse, a resposta de uma gravação
 * chegando depois da seguinte desfaria a mais nova.
 */
export class PawnProStateManager {
  private data: PawnProState = { server: { favorites: [], history: [] } };
  /** Gravações enviadas e ainda sem resposta. */
  private pending = 0;
  private warnedOffline = false;

  private constructor(private readonly projectRoot: string) {}

  static create(projectRoot: string): PawnProStateManager {
    return new PawnProStateManager(projectRoot);
  }

  /**
   * Relê do núcleo. `false` quando ele não respondeu, e o que está em memória
   * continua valendo.
   *
   * Com gravação pendente a releitura é descartada: o arquivo ainda não tem o
   * que o cache tem, e aplicá-lo desfaria a mudança por um instante.
   */
  async load(): Promise<boolean> {
    try {
      const state = await request<PawnProState>('state.get', { workspaceRoot: this.projectRoot });
      if (this.pending === 0) this.data = state;
      return true;
    } catch {
      return false;
    }
  }

  getAll(): Readonly<PawnProState> {
    return structuredClone(this.data);
  }

  get<K extends keyof PawnProState>(key: K): PawnProState[K] {
    return structuredClone(this.data[key]);
  }

  update<K extends keyof PawnProState>(key: K, value: PawnProState[K]): void {
    this.data[key] = structuredClone(value);
    void this.persist();
  }

  /**
   * Sem núcleo, favoritos e histórico valem só nesta sessão. Recusar a
   * gravação quebraria o painel no meio do uso; gravar por fora recriaria um
   * segundo dono do arquivo.
   */
  private async persist(): Promise<void> {
    this.pending++;
    try {
      await request('state.updateServer', {
        workspaceRoot: this.projectRoot,
        server: this.data.server,
      });
    } catch (err: unknown) {
      if (!this.warnedOffline) {
        this.warnedOffline = true;
        const detail = err instanceof Error ? err.message : String(err);
        logError('state', `favoritos e histórico não foram gravados: ${detail}`);
      }
    } finally {
      this.pending--;
    }
  }
}
