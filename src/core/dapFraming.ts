/**
 * Enquadramento das mensagens DAP num stream: `Content-Length: N\r\n\r\n`
 * seguido de N **bytes** de JSON em UTF-8.
 *
 * O comprimento é em bytes, não em caracteres: um acento no corpo muda a
 * conta, e contar caracteres cortaria a mensagem no meio.
 */

const SEPARATOR = Buffer.from('\r\n\r\n');

/** Serializa uma mensagem com o cabeçalho. */
export function encodeMessage(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]);
}

/** Erro de enquadramento: o que chegou não é DAP. */
export class FramingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FramingError';
  }
}

/**
 * Remonta mensagens a partir de pedaços do stream, que podem cortar o
 * cabeçalho ou o corpo em qualquer ponto.
 */
export class MessageReader {
  private buffer = Buffer.alloc(0);

  /**
   * Acrescenta um pedaço e devolve as mensagens que ficaram completas.
   *
   * @throws {FramingError} quando o cabeçalho não traz um `Content-Length` válido
   * ou o corpo não é JSON.
   */
  push(chunk: Buffer): unknown[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: unknown[] = [];
    for (;;) {
      const end = this.buffer.indexOf(SEPARATOR);
      if (end < 0) break;
      const header = this.buffer.subarray(0, end).toString('ascii');
      const match = /^Content-Length:\s*(\d+)\s*$/im.exec(header);
      if (!match) {
        throw new FramingError(`cabeçalho DAP sem Content-Length: ${JSON.stringify(header)}`);
      }
      const start = end + SEPARATOR.length;
      const length = Number(match[1]);
      if (this.buffer.length < start + length) break;
      const body = this.buffer.subarray(start, start + length).toString('utf8');
      this.buffer = this.buffer.subarray(start + length);
      try {
        messages.push(JSON.parse(body));
      } catch {
        throw new FramingError('corpo DAP não é JSON');
      }
    }
    return messages;
  }
}
