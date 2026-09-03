import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLoopbackHost, isProjectServer } from '../server.js';

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

// `isProjectServer` é o que separa "encerrar o servidor do projeto" de
// "encerrar um serviço do sistema". Na dúvida, precisa devolver false.
test('isProjectServer: sem executável configurado, não encerra nada', () => {
  assert.equal(isProjectServer(process.pid, ''), false);
});

test('isProjectServer: PID inexistente não casa', () => {
  assert.equal(isProjectServer(0x7ffffff0, process.execPath), false);
});

test('isProjectServer: reconhece o próprio processo pelo executável', () => {
  // O teste roda sob node, então `process.execPath` é o "servidor do projeto"
  // e o PID atual é o "processo na porta": mesmo binário, mesmo usuário.
  // Windows não tem como ligar PID a executável de forma barata e sempre
  // devolve false — lá `pidsOnPort` também é vazio, então nada é encerrado.
  const supported = process.platform === 'linux' || process.platform === 'darwin';
  assert.equal(isProjectServer(process.pid, process.execPath), supported);
});

test('isProjectServer: processo de outro executável não casa', () => {
  // Mesmo PID vivo, executável diferente: não é o servidor do projeto. É o que
  // impede um `"port": 53` no config.json de encerrar um serviço do sistema.
  assert.equal(isProjectServer(process.pid, '/bin/sh'), false);
});

// `projectServersOnPort` unifica a busca na porta com o filtro de dono. O teste
// garante que o filtro continua aplicado: sem ele, um `"port": 53` no
// config.json do repositório viraria uma arma contra serviços do sistema.
test('projectServersOnPort: sem executável, não devolve ninguém', async () => {
  const { projectServersOnPort } = await import('../server.js');
  assert.deepEqual(projectServersOnPort(7777, ''), []);
});

test('projectServersOnPort: porta improvável não devolve ninguém', async () => {
  const { projectServersOnPort } = await import('../server.js');
  assert.deepEqual(projectServersOnPort(59999, process.execPath), []);
});
