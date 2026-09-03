import * as vscode from 'vscode';
import { pingServer } from '../core/server.js';

/** Como o servidor que está no ar foi iniciado. */
export type ServerOrigin =
  /** Pelo painel: existe um terminal do editor por trás. */
  | 'terminal'
  /** Estava no ar antes, iniciado fora do painel — inclusive pelo depurador. */
  | 'external'
  /** Nada respondendo na porta. */
  | 'none';

export interface ServerStatus {
  alive: boolean;
  /**
   * `true` só quando a porta respondeu **nesta** sondagem.
   *
   * `vivo` tolera algumas perdas seguidas para o painel não piscar, e por isso
   * não serve para decidir bloquear uma ação do usuário: quem for barrar um
   * `start` precisa de resposta de fato, não de inércia.
   */
  responded: boolean;
  origin: ServerOrigin;
  host: string;
  port: number;
}

/**
 * Fonte única de verdade sobre "há um servidor no ar".
 *
 * A pergunta é respondida **pela porta**, não por um terminal: o servidor pode
 * ter sido iniciado pelo painel, por uma sessão de depuração ou por fora do
 * editor, e em todos os casos o painel precisa saber que ele está lá. Antes o
 * estado vinha de `ServerController.term`, então tudo que não passasse por
 * aquele terminal ficava invisível — o servidor da depuração aparecia como
 * parado, e um processo órfão não aparecia de forma alguma.
 *
 * A origem é registrada por quem inicia; a vida, sondada. Quando as duas
 * discordam (a origem diz `terminal`, mas a porta não responde), quem manda é a
 * porta.
 */
/**
 * Sondagens perdidas seguidas antes de dar o servidor por morto. Com o
 * intervalo de 4 s, são ~12 s de silêncio — bem acima de qualquer perda
 * isolada, e ainda rápido para quem desliga o servidor.
 */
const FAILURES_UNTIL_DEAD = 3;

export class ServerRegistry implements vscode.Disposable {
  private origin: ServerOrigin = 'none';
  private last: ServerStatus | null = null;
  private timer: NodeJS.Timeout | null = null;
  /**
   * Sondagens sem resposta desde a última bem-sucedida.
   *
   * A sondagem é um único datagrama UDP, sem retransmissão: um pacote perdido
   * ou um atraso acima do prazo devolve "morto" com o servidor no ar. Um
   * `false` isolado fazia o painel oscilar, e cada oscilação reiniciava o tail
   * do log — que limpava a saída do console.
   */
  private consecutiveFailures = 0;

  private readonly _onChange = new vscode.EventEmitter<ServerStatus>();
  /** Dispara quando o servidor sobe, cai ou muda de origem. */
  readonly onChange = this._onChange.event;

  /** Quem iniciou declara a origem; a vida continua sendo sondada. */
  markOrigin(origin: ServerOrigin): void {
    this.origin = origin;
  }

  /**
   * Estado atual, sondando a porta. `origem` só é considerada quando há
   * resposta — um servidor morto não tem origem.
   */
  async status(host: string, port: number): Promise<ServerStatus> {
    const responded = await pingServer(host, port);
    this.consecutiveFailures = responded ? 0 : this.consecutiveFailures + 1;
    // A tolerância só vale para quem já esteve no ar: uma falha isolada é
    // indistinguível de um datagrama perdido, mas sem nunca ter respondido não
    // há nada a preservar — insistir ali daria "no ar" para um servidor que não
    // existe, e a origem herdada travaria o próximo `start`.
    const respondeuAntes = this.last?.alive === true;
    const alive = responded || (respondeuAntes && this.consecutiveFailures < FAILURES_UNTIL_DEAD);
    const st: ServerStatus = {
      alive,
      responded,
      origin: alive ? (this.origin === 'none' ? 'external' : this.origin) : 'none',
      host,
      port,
    };
    if (!alive) this.origin = 'none';

    const mudou =
      !this.last || this.last.alive !== st.alive || this.last.origin !== st.origin;
    this.last = st;
    if (mudou) this._onChange.fire(st);
    return st;
  }

  /** Último estado conhecido, sem sondar. */
  lastKnown(): ServerStatus | null {
    return this.last;
  }

  /**
   * Dá o servidor por parado agora, sem esperar a tolerância expirar.
   *
   * A tolerância de `FALHAS_ATE_MORTO` existe para a vigilância periódica, onde
   * uma sondagem perdida é indistinguível de um servidor caído. Quando é o
   * painel que manda parar, não há essa dúvida: a porta já foi confirmada muda
   * por quem chamou. Sem isto o estado seguia `vivo` por ~12 s depois da
   * parada, e o `start` do reinício encontrava origem e vida de um servidor que
   * já não existia — e tratava o resto como órfão na porta.
   */
  markStopped(): void {
    this.origin = 'none';
    this.consecutiveFailures = FAILURES_UNTIL_DEAD;
    if (this.last?.alive) {
      const st: ServerStatus = { ...this.last, alive: false, responded: false, origin: 'none' };
      this.last = st;
      this._onChange.fire(st);
    }
  }

  /**
   * Sonda periodicamente enquanto a extensão vive.
   *
   * É o que mantém o painel honesto sem depender de evento nenhum: se o
   * servidor cair sozinho, ou alguém o subir por fora, o estado acompanha. O
   * intervalo é folgado de propósito — a sondagem custa um datagrama, mas não
   * há razão para saber em menos de alguns segundos.
   */
  watch(host: () => { host: string; port: number }, intervalMs = 4000): void {
    this.stopWatching();
    // Contagem nova a cada vigilância: falhas de um ciclo anterior não podem
    // fazer a nova começar já perto do limite.
    this.consecutiveFailures = 0;
    this.timer = setInterval(() => {
      const { host: h, port: p } = host();
      void this.status(h, p);
    }, intervalMs);
  }

  stopWatching(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  dispose(): void {
    this.stopWatching();
    this._onChange.dispose();
  }
}
