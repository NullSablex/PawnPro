import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DebugCycle, type CycleAction } from '../debugCycle.js';

/** Aplica uma sequência de mensagens e diz se a barra terminou aberta. */
function barOpenAfter(steps: [kind: 'request' | 'event' | 'response', name: string][]): boolean {
  const cycle = new DebugCycle();
  let open = false;
  for (const [kind, name] of steps) {
    const action: CycleAction =
      kind === 'request' ? cycle.onRequest(name)
        : kind === 'event' ? cycle.onEvent(name)
          : cycle.onResponse(name);
    if (action === 'close') open = false;
    else if (action) open = true;
  }
  return open;
}

test('parar pelo editor não deixa a barra presa', () => {
  // A sequência real do botão Parar: o `disconnect` chega depois do fim.
  assert.equal(
    barOpenAfter([
      ['request', 'terminate'],
      ['response', 'terminate'],
      ['event', 'terminated'],
      ['request', 'disconnect'],
      ['response', 'disconnect'],
    ]),
    false,
  );
});

test('disconnect direto também fecha pela resposta', () => {
  assert.equal(
    barOpenAfter([
      ['request', 'disconnect'],
      ['response', 'disconnect'],
    ]),
    false,
  );
});

test('reiniciar fecha quando o servidor novo está de pé', () => {
  assert.equal(barOpenAfter([['request', 'restart']]), true, 'aberta durante o ciclo');
  assert.equal(
    barOpenAfter([
      ['request', 'restart'],
      ['event', 'pawnproRebuild'],
      ['event', 'continued'],
    ]),
    false,
  );
});

test('depois do fim nada reabre a barra', () => {
  const cycle = new DebugCycle();
  cycle.onEvent('terminated');
  assert.equal(cycle.onRequest('disconnect'), null);
});
