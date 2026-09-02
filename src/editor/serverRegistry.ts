import * as vscode from 'vscode';
import { pingServer } from '../core/server.js';

/** Como o servidor que está no ar foi iniciado. */
export type ServerOrigin =
  /** Pelo painel: existe um terminal do editor por trás. */
  | 'terminal'
  /** Por uma sessão de depuração: o processo é filho do adaptador. */
  | 'debug'
  /** Estava no ar antes, ou foi iniciado fora do editor. */
  | 'externo'
  /** Nada respondendo na porta. */
  | 'nenhum';

export interface ServerStatus {
  vivo: boolean;
  origem: ServerOrigin;
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
export class ServerRegistry implements vscode.Disposable {
  private origem: ServerOrigin = 'nenhum';
  private ultimo: ServerStatus | null = null;
  private timer: NodeJS.Timeout | null = null;

  private readonly _onChange = new vscode.EventEmitter<ServerStatus>();
  /** Dispara quando o servidor sobe, cai ou muda de origem. */
  readonly onChange = this._onChange.event;

  /** Quem iniciou declara a origem; a vida continua sendo sondada. */
  marcarOrigem(origem: ServerOrigin): void {
    this.origem = origem;
  }

  /**
   * Estado atual, sondando a porta. `origem` só é considerada quando há
   * resposta — um servidor morto não tem origem.
   */
  async status(host: string, port: number): Promise<ServerStatus> {
    const vivo = await pingServer(host, port);
    const st: ServerStatus = {
      vivo,
      origem: vivo ? (this.origem === 'nenhum' ? 'externo' : this.origem) : 'nenhum',
      host,
      port,
    };
    if (!vivo) this.origem = 'nenhum';

    const mudou =
      !this.ultimo || this.ultimo.vivo !== st.vivo || this.ultimo.origem !== st.origem;
    this.ultimo = st;
    if (mudou) this._onChange.fire(st);
    return st;
  }

  /** Último estado conhecido, sem sondar. */
  ultimoConhecido(): ServerStatus | null {
    return this.ultimo;
  }

  /**
   * Sonda periodicamente enquanto a extensão vive.
   *
   * É o que mantém o painel honesto sem depender de evento nenhum: se o
   * servidor cair sozinho, ou alguém o subir por fora, o estado acompanha. O
   * intervalo é folgado de propósito — a sondagem custa um datagrama, mas não
   * há razão para saber em menos de alguns segundos.
   */
  vigiar(host: () => { host: string; port: number }, intervaloMs = 4000): void {
    this.parar();
    this.timer = setInterval(() => {
      const { host: h, port: p } = host();
      void this.status(h, p);
    }, intervaloMs);
  }

  parar(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  dispose(): void {
    this.parar();
    this._onChange.dispose();
  }
}
