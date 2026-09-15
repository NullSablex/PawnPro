import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { startCore, stopCore, request } from '../client.js';
import { DEFAULTS, PawnProConfigManager, type ConfigSnapshot } from '../config.js';
import type { PawnProConfig } from '../types.js';

/**
 * A configuração atravessa o RPC: o núcleo lê, mescla e grava; a extensão
 * guarda o que ele mandou.
 *
 * O núcleo herda o ambiente deste processo. Com o diretório do usuário numa
 * pasta vazia, a configuração global de quem roda os testes não entra no
 * resultado — sem isso eles passariam ou falhariam conforme a máquina.
 *
 * Pulado quando o binário não está compilado.
 */

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'pawnpro-config-test-'));
const home = path.join(sandbox, 'home');
const project = path.join(sandbox, 'project');
const projectFile = path.join(project, '.pawnpro', 'config.json');
fs.mkdirSync(home);
fs.mkdirSync(path.dirname(projectFile), { recursive: true });
process.env.HOME = home;
process.env.USERPROFILE = home;

const available = startCore(process.cwd());

after(() => {
  stopCore();
  fs.rmSync(sandbox, { recursive: true, force: true });
});

/** Os padrões com `${workspaceFolder}` resolvido, como o núcleo entrega. */
function resolved(value: unknown): unknown {
  if (typeof value === 'string') return value.split('${workspaceFolder}').join(project);
  if (Array.isArray(value)) return value.map(resolved);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolved(v)]));
  }
  return value;
}

// Primeiro de todos: os outros testes gravam, e o núcleo notifica todas as
// fachadas deste processo — esta deixaria de estar descarregada.
test('sem a configuração do núcleo, a gravação é recusada', async () => {
  const offline = PawnProConfigManager.create(project);
  assert.equal(offline.loaded, false);
  assert.deepEqual(offline.getAll(), DEFAULTS);
  await assert.rejects(() => offline.setKey('locale', 'ru', 'project'), /núcleo/);
});

test('os padrões do núcleo são os mesmos da extensão', { skip: !available }, async () => {
  // Os `DEFAULTS` do TypeScript valem enquanto o núcleo não responde. Se
  // divergirem dos dele, a extensão muda de comportamento conforme o núcleo
  // esteja de pé ou não.
  const snapshot = await request<ConfigSnapshot>('config.open', { workspaceRoot: project });
  assert.deepEqual(snapshot.config, resolved(DEFAULTS) as PawnProConfig);
  assert.deepEqual(snapshot.rejected, []);
});

test('uma escrita chega uma vez, e o cache já está certo quando ela termina', { skip: !available }, async () => {
  const config = PawnProConfigManager.create(project);
  assert.ok(await config.load());

  let calls = 0;
  config.onChange(() => calls++);

  await config.setKey('locale', 'ru', 'project');
  assert.equal(config.getAll().locale, 'ru', 'o await terminou antes de o cache mudar');
  assert.equal(calls, 1, 'a escrita avisou mais de uma vez');
  assert.equal(JSON.parse(fs.readFileSync(projectFile, 'utf8')).locale, 'ru');

  // Uma seção inteira também é uma escrita só.
  await config.set('syntax', { scheme: 'classic_dark', applyOnStartup: true }, 'project');
  assert.equal(calls, 2, 'a seção avisou uma vez por campo');
  assert.equal(config.getAll().syntax.scheme, 'classic_dark');
  assert.equal(config.getAll().syntax.applyOnStartup, true);
});

test('um valor de tipo errado não derruba o resto da configuração', { skip: !available }, async () => {
  const config = PawnProConfigManager.create(project);
  assert.ok(await config.load());

  fs.writeFileSync(projectFile, JSON.stringify({ locale: 5, compiler: { path: '/x/pawncc' } }));
  await config.reload();

  assert.equal(config.getAll().compiler.path, '/x/pawncc');
  assert.equal(config.getAll().locale, '');
  assert.deepEqual(config.rejectedKeys, ['locale']);
});
