import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLoopbackHost } from '../server.js';

// `isLoopbackHost` decide se a senha do RCON pode sair em texto claro e filtra
// as respostas do `pingServer` — a sondagem em que TODO controle se baseia.
// Um falso positivo aqui vaza credencial; um falso negativo quebra o painel.
test('isLoopbackHost: aceita as formas de loopback', () => {
  for (const h of ['127.0.0.1', '127.1.2.3', 'localhost', 'LOCALHOST', '::1', '[::1]', ' 127.0.0.1 ']) {
    assert.equal(isLoopbackHost(h), true, h);
  }
});

test('isLoopbackHost: 0.0.0.0 NÃO é loopback', () => {
  // Curinga "todas as interfaces", não loopback: tratá-lo como local mandaria
  // a senha do RCON para fora da máquina.
  assert.equal(isLoopbackHost('0.0.0.0'), false);
});

test('isLoopbackHost: recusa endereços externos e lixo', () => {
  for (const h of ['10.0.0.1', '8.8.8.8', '128.0.0.1', '126.255.255.255', '', 'exemplo.com']) {
    assert.equal(isLoopbackHost(h), false, h);
  }
});

test('isLoopbackHost: octeto fora de 0–255 não é IPv4', () => {
  // A regex sozinha casaria `999.0.0.1`; aceitá-lo daria loopback a um nome
  // que o resolvedor mandaria para outro lugar.
  assert.equal(isLoopbackHost('999.0.0.1'), false);
  assert.equal(isLoopbackHost('127.0.0.999'), false);
});

// A propriedade de um processo — o que separa "encerrar o servidor do projeto"
// de "encerrar um serviço do sistema" — passou para o core, e a cobertura foi
// junto: `an_empty_executable_matches_nothing`, `a_missing_pid_matches_nothing`,
// `a_different_executable_does_not_match` e `project_servers_applies_the_owner_filter`
// em `crates/core/src/server/process.rs`.
