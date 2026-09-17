import * as net from 'net';

/**
 * O soquete único do core.
 *
 * Engine e depurador atendem no mesmo endereço local. Quem conecta diz a que
 * veio numa primeira linha, antes de qualquer byte do protocolo — LSP e DAP
 * usam o mesmo enquadramento, e o core não adivinha pelo conteúdo.
 */

/** Os canais que a extensão abre. O terceiro, `plugin`, é do servidor. */
export type Channel = 'lsp' | 'dap';

/** A linha de apresentação, com o `\n` final. */
export function greeting(channel: Channel): string {
  return `PAWNPRO/1 ${channel}\n`;
}

/**
 * Conecta no core e se apresenta.
 *
 * A apresentação é escrita antes de a conexão completar: o socket a guarda e
 * envia primeiro, então nada do protocolo passa na frente dela.
 */
export function connectChannel(address: string, channel: Channel): net.Socket {
  const socket = net.connect(address);
  socket.write(greeting(channel));
  return socket;
}
