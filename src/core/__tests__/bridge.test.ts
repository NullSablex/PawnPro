import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { startCore, stopCore, coreIsRunning, request } from '../client.js';

/**
 * A ponte entre a extensão e o binário.
 *
 * Aqui não se testa o que o core faz — isso é a suíte em Rust. Testa-se o
 * acordo entre os dois: o método existe com esse nome, aceita esses
 * parâmetros e devolve um objeto com os campos que o TypeScript lê. Um
 * `filePath` que chega como `file_path` não quebra nada visível: o recurso
 * simplesmente para de funcionar.
 *
 * Pulado quando o binário não está compilado.
 */

// O `startCore` procura o binário a partir do diretório da extensão. Os testes
// rodam da raiz do repositório, e é dela que o caminho para o core vizinho sai.
const extensionPath = process.cwd();
const available = startCore(extensionPath);

before(() => {
  if (!available) {
    console.log('[bridge] binário do core ausente — testes pulados');
  }
});

after(() => {
  stopCore();
});

test('o core sobe e responde a quem pergunta o que ele sabe fazer', { skip: !available }, async () => {
  assert.ok(coreIsRunning());
  const version = await request<{ version: string; methods: string[] }>('core.version');
  assert.match(version.version, /^\d+\.\d+\.\d+$/);
  // Todo método que a extensão chama precisa estar na lista que o core anuncia.
  for (const method of [
    'server.detectType',
    'server.detectExecutable',
    'server.loadConfig',
    'server.pidsOnPort',
    'server.projectServersOnPort',
    'server.kill',
    'server.ping',
    'rcon.send',
    'debug.preflight',
    'compiler.detect',
    'compiler.buildArgs',
    'includes.paths',
    'includes.listFiles',
    'includes.listNatives',
    'includes.resolveSdk',
    'engine.start',
    'engine.stop',
    'engine.status',
    'engine.reload',
    'config.open',
    'config.get',
    'config.set',
    'config.delete',
    'config.reload',
    'config.ensureNamingFiles',
    'config.backupNaming',
    'config.migrateNaming',
    'state.get',
    'state.updateServer',
  ]) {
    assert.ok(version.methods.includes(method), `o core não anuncia ${method}`);
  }
});

test('a configuração do servidor volta com os campos que o painel lê', { skip: !available }, async () => {
  const cfg = await request<Record<string, unknown>>('server.loadConfig', { cwd: os.tmpdir() });
  for (const field of ['rconPassword', 'port', 'host', 'rconEnabled']) {
    assert.ok(field in cfg, `falta \`${field}\` em server.loadConfig`);
  }
});

test('o preflight da depuração volta com os campos que o adaptador lê', { skip: !available }, async () => {
  const pre = await request<Record<string, unknown>>('debug.preflight', { cwd: os.tmpdir() });
  for (const field of ['ok', 'pluginFilePresent', 'pluginRegistered', 'recommendedPath']) {
    assert.ok(field in pre, `falta \`${field}\` em debug.preflight`);
  }
});

test('o estado grava, relê e volta com os campos que o painel lê', { skip: !available }, async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pawnpro-state-'));
  try {
    const empty = await request<{ server: { favorites: string[]; history: string[] } }>(
      'state.get',
      { workspaceRoot: projectDir },
    );
    assert.deepEqual(empty, { server: { favorites: [], history: [] } });

    await request('state.updateServer', {
      workspaceRoot: projectDir,
      server: { favorites: ['gmx'], history: ['players', 'gmx'] },
    });
    const reread = await request<{ server: { favorites: string[]; history: string[] } }>(
      'state.get',
      { workspaceRoot: projectDir },
    );
    assert.deepEqual(reread.server, { favorites: ['gmx'], history: ['players', 'gmx'] });

    // O histórico é da operação de quem desenvolve: só o dono lê.
    if (process.platform !== 'win32') {
      const mode = fs.statSync(path.join(projectDir, '.pawnpro', 'state.json')).mode & 0o777;
      assert.equal(mode, 0o600);
    }
  } finally {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});

test('as natives voltam em camelCase', { skip: !available }, async () => {
  const file = path.join(os.tmpdir(), `pawnpro-bridge-${process.pid}.inc`);
  fs.writeFileSync(file, 'native MinhaNative(valor);\n');
  try {
    const natives = await request<{ name: string; filePath: string; line: number }[]>(
      'includes.listNatives',
      { file },
    );
    assert.equal(natives.length, 1);
    assert.equal(natives[0].name, 'MinhaNative');
    assert.equal(typeof natives[0].filePath, 'string');
  } finally {
    fs.unlinkSync(file);
  }
});

test('a porta livre não tem dono, e o filtro exige o executável', { skip: !available }, async () => {
  assert.deepEqual(await request<number[]>('server.pidsOnPort', { port: 59999 }), []);
  assert.deepEqual(
    await request<number[]>('server.projectServersOnPort', { port: 59999, exe: process.execPath }),
    [],
  );
});

test('encerrar um processo que não é o servidor do projeto é recusado', { skip: !available }, async () => {
  // A política de dono vive no core: a extensão não a contorna pedindo direto.
  await assert.rejects(
    () => request('server.kill', { pid: process.pid, exe: '/bin/sh' }),
    /não é o servidor deste projeto/,
  );
});

test('o RCON recusa o que precisa recusar, com o motivo', { skip: !available }, async () => {
  const answer = await request<{ error?: { kind: string } }>('rcon.send', {
    host: '10.0.0.1',
    port: 7777,
    password: 'x',
    command: 'echo',
  });
  // Fora do loopback a senha viajaria em texto claro; o core recusa antes do
  // envio e diz por quê, para o painel escolher a mensagem.
  assert.equal(answer.error?.kind, 'remoteBlocked');
});

test('a engine sobe e informa onde atende', { skip: !available }, async () => {
  const started = await request<{ address: string }>('engine.start', {
    workspaceRoot: os.tmpdir(),
    editorLanguage: 'pt-br',
  });
  assert.ok(started.address.length > 0);

  const status = await request<{ running: boolean; address: string }>('engine.status');
  assert.equal(status.running, true);
  assert.equal(status.address, started.address);

  // No Unix o endereço é um soquete de verdade, e só o dono o alcança.
  if (process.platform !== 'win32') {
    assert.ok(fs.existsSync(started.address), 'o soquete não existe');
    const mode = fs.statSync(path.dirname(started.address)).mode & 0o777;
    assert.equal(mode, 0o700);
  }

  assert.equal(await request<boolean>('engine.reload'), true);
  assert.equal(await request<boolean>('engine.stop'), true);
});

test('o registro de diagnóstico só grava quando é ligado', { skip: !available }, async () => {
  const projectDir = path.join(os.tmpdir(), `pawnpro-log-${process.pid}`);
  const logs = path.join(projectDir, '.pawnpro', 'logs');
  fs.rmSync(projectDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(projectDir, '.pawnpro'), { recursive: true });

  try {
    // Desligado: nem a pasta aparece.
    await request('log.configure', { workspaceRoot: projectDir, level: 'off' });
    await request('log.write', { level: 'error', source: 'extension/teste', message: 'silêncio' });
    assert.equal(fs.existsSync(logs), false, 'criou log com o registro desligado');

    // Ligado: o evento vai para o unificado e para o arquivo do componente.
    await request('log.configure', { workspaceRoot: projectDir, level: 'info' });
    await request('log.write', { level: 'error', source: 'extension/teste', message: 'uma falha' });

    const unified = fs.readFileSync(path.join(logs, 'pawnpro.log'), 'utf8');
    assert.match(unified, /ERROR extension\/teste {2}uma falha/);
    assert.match(
      fs.readFileSync(path.join(logs, 'extension.log'), 'utf8'),
      /uma falha/,
    );

    // O core registra o que ele mesmo faz, no mesmo arquivo. `detectType` é
    // uma ação; a sondagem periódica da porta é silenciada de propósito, para
    // não afogar o log com uma linha a cada poucos segundos.
    await request('server.detectType', { cwd: projectDir });
    const coreLog = fs.readFileSync(path.join(logs, 'core.log'), 'utf8');
    assert.match(coreLog, /server\.detectType/);
    await request('server.pidsOnPort', { port: 59999 });
    assert.ok(
      !fs.readFileSync(path.join(logs, 'core.log'), 'utf8').includes('pidsOnPort'),
      'a sondagem periódica não deve entrar no log',
    );

    // E os logs não entram no repositório de quem usa.
    const ignore = fs.readFileSync(path.join(projectDir, '.pawnpro', '.gitignore'), 'utf8');
    assert.match(ignore, /^logs\/$/m);

    // O nível filtra: com `error`, o `info` não passa.
    await request('log.configure', { workspaceRoot: projectDir, level: 'error' });
    await request('log.clear', { workspaceRoot: projectDir });
    await request('log.write', { level: 'info', source: 'extension/teste', message: 'curso normal' });
    await request('log.write', { level: 'error', source: 'extension/teste', message: 'outra falha' });

    const filtered = fs.readFileSync(path.join(logs, 'pawnpro.log'), 'utf8');
    assert.ok(filtered.includes('outra falha'));
    assert.ok(!filtered.includes('curso normal'), `o info passou com o nível em error: ${filtered}`);
  } finally {
    await request('log.configure', { workspaceRoot: projectDir, level: 'off' }).catch(() => undefined);
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
});
