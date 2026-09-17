import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeMessage, FramingError, MessageReader } from '../dapFraming.js';
import { greeting } from '../channel.js';

test('uma mensagem cortada em qualquer ponto é remontada', () => {
  const message = { seq: 1, type: 'event', event: 'output', body: { output: 'olá' } };
  const bytes = encodeMessage(message);
  // Cada corte possível, inclusive no meio do cabeçalho e do `á` de dois bytes.
  for (let cut = 1; cut < bytes.length; cut++) {
    const reader = new MessageReader();
    assert.deepEqual(reader.push(bytes.subarray(0, cut)), []);
    assert.deepEqual(reader.push(bytes.subarray(cut)), [message]);
  }
});

test('o comprimento é em bytes, não em caracteres', () => {
  const bytes = encodeMessage({ text: 'ação' });
  const header = bytes.toString('utf8').split('\r\n')[0];
  // `{"text":"ação"}` tem 15 caracteres e 17 bytes.
  assert.equal(header, 'Content-Length: 17');
});

test('várias mensagens num pedaço só saem todas, na ordem', () => {
  const reader = new MessageReader();
  const chunk = Buffer.concat([encodeMessage({ seq: 1 }), encodeMessage({ seq: 2 })]);
  assert.deepEqual(reader.push(chunk), [{ seq: 1 }, { seq: 2 }]);
});

test('um cabeçalho sem comprimento é erro, não espera infinita', () => {
  const reader = new MessageReader();
  assert.throws(() => reader.push(Buffer.from('X-Other: 1\r\n\r\n{}')), FramingError);
});

test('a apresentação é a que o core entende', () => {
  // O core recusa qualquer outra forma; ver `gateway/greeting.rs` no core.
  assert.equal(greeting('lsp'), 'PAWNPRO/1 lsp\n');
  assert.equal(greeting('dap'), 'PAWNPRO/1 dap\n');
});
