import * as vscode from 'vscode';
import type * as net from 'net';
import { encodeMessage, MessageReader } from '../core/dapFraming.js';

/**
 * A sessão de depuração do core, vista pelo editor.
 *
 * O editor tem um descritor pronto para soquete (`DebugAdapterNamedPipeServer`),
 * mas ele não deixa escrever nada antes do DAP — e o core só atende quem se
 * apresenta. Por isso o adaptador é inline: ele só enquadra as mensagens nos
 * dois sentidos sobre o soquete já apresentado.
 */
export class SocketDebugAdapter implements vscode.DebugAdapter {
  private readonly emitter = new vscode.EventEmitter<vscode.DebugProtocolMessage>();
  private readonly reader = new MessageReader();
  /** Mensagens próprias precisam de `seq`; o core usa faixas que não chegam aqui. */
  private seq = 2_000_000_000;
  /** Já houve `terminated`, do core ou daqui: não repetir. */
  private terminated = false;
  private disposed = false;

  readonly onDidSendMessage = this.emitter.event;

  constructor(private readonly socket: net.Socket) {
    socket.on('data', (chunk: Buffer) => {
      let messages: unknown[];
      try {
        messages = this.reader.push(chunk);
      } catch (e) {
        this.fail(e instanceof Error ? e.message : String(e));
        return;
      }
      for (const message of messages) {
        const m = message as { type?: string; event?: string };
        if (m.type === 'event' && m.event === 'terminated') this.terminated = true;
        this.emitter.fire(message as vscode.DebugProtocolMessage);
      }
    });
    socket.on('error', (e) => this.fail(e.message));
    // Conexão fechada sem `terminated`: o core encerrou ou a sessão caiu. Sem
    // avisar, o editor mostraria uma sessão de pé sem nada por trás.
    socket.on('close', () => this.fail());
  }

  handleMessage(message: vscode.DebugProtocolMessage): void {
    if (this.socket.destroyed) return;
    this.socket.write(encodeMessage(message));
  }

  dispose(): void {
    this.disposed = true;
    this.socket.destroy();
    this.emitter.dispose();
  }

  /** Encerra a sessão no editor, com o motivo no console quando há um. */
  private fail(reason?: string): void {
    if (this.disposed || this.terminated) return;
    this.terminated = true;
    if (reason) {
      this.emit('output', { category: 'stderr', output: `PawnPro: ${reason}\n` });
    }
    this.emit('terminated', undefined);
    this.socket.destroy();
  }

  private emit(event: string, body: unknown): void {
    this.emitter.fire({ seq: ++this.seq, type: 'event', event, body } as vscode.DebugProtocolMessage);
  }
}
