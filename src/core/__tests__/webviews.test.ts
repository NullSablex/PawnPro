import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';

/**
 * O contrato de segurança das páginas WebView.
 *
 * A política delas usa nonce, e nonce não vale para atributo de evento: um
 * `onclick="…"` no HTML é bloqueado pelo navegador, e o sintoma é a página
 * inteira parar de responder — sem erro no console comum, porque violação de
 * CSP dispara `securitypolicyviolation`, não `error`. Já aconteceu, e custou
 * caro para achar.
 *
 * Estes testes leem o código-fonte das páginas: é lá que o HTML é montado.
 */

// Os testes rodam da raiz do repositório; o código-fonte é lido de lá, e não
// da pasta compilada.
const RAIZ = process.cwd();
const EDITOR = path.join(RAIZ, 'src', 'editor');
const PAGINAS = ['settingsView.ts', 'storeView.ts', 'serverView.ts'];

function fonte(nome: string): string {
  return fs.readFileSync(path.join(EDITOR, nome), 'utf8');
}

test('nenhuma página usa atributo de evento no HTML', () => {
  for (const pagina of PAGINAS) {
    const encontrados = fonte(pagina).match(/\son(click|change|input|submit)="/g) ?? [];
    assert.deepEqual(
      encontrados,
      [],
      `${pagina} tem atributo de evento, que a política bloqueia — use data-on/data-action`,
    );
  }
});

test('toda página com nonce no CSP marca seus scripts com ele', () => {
  for (const pagina of PAGINAS) {
    const texto = fonte(pagina);
    if (!/script-src 'nonce-/.test(texto)) continue;
    // `type="application/json"` é dado, não script executável.
    const scripts = (texto.match(/<script(?![^>]*application\/json)[^>]*>/g) ?? []);
    for (const tag of scripts) {
      assert.match(tag, /nonce=/, `${pagina}: <script> sem nonce seria bloqueado -> ${tag}`);
    }
  }
});

test('nenhuma página relaxa a política para script', () => {
  for (const pagina of PAGINAS) {
    const texto = fonte(pagina);
    assert.doesNotMatch(
      texto,
      /script-src[^;"]*'unsafe-inline'/,
      `${pagina}: 'unsafe-inline' em script-src derrota o nonce`,
    );
    assert.doesNotMatch(
      texto,
      /script-src-attr/,
      `${pagina}: permitir atributo de evento é o atalho que os data-* substituem`,
    );
  }
});

test('toda ação declarada no HTML existe no script da página', () => {
  // Um `data-action` sem função correspondente deixa o controle mudo — o mesmo
  // sintoma que estes testes existem para impedir.
  const casos: { pagina: string; script: string }[] = [
    { pagina: 'settingsView.ts', script: path.join(RAIZ, 'assets-src', 'js', 'settings.js') },
    { pagina: 'storeView.ts', script: '' },
  ];

  for (const { pagina, script } of casos) {
    const html = fonte(pagina);
    const js = script ? fs.readFileSync(script, 'utf8') : html;
    const declaradas = new Set(
      [...html.matchAll(/data-action(?:-\w+)?="(\w+)"/g)].map((m) => m[1]),
    );
    const registro = /const ACTIONS = \{([\s\S]*?)\};/.exec(js);
    assert.ok(registro, `${pagina}: não há registro de ações no script`);
    const conhecidas = new Set(
      registro[1]
        .split(',')
        .map((n) => n.trim().split(':')[0].trim())
        .filter(Boolean),
    );
    for (const acao of declaradas) {
      assert.ok(conhecidas.has(acao), `${pagina}: "${acao}" não está no ACTIONS do script`);
    }
    assert.ok(declaradas.size > 0, `${pagina}: nenhuma ação declarada — a varredura falhou`);
  }
});

test('nenhum controle repete atributo no mesmo elemento', () => {
  // O HTML fica só com a primeira ocorrência de um atributo repetido. Dois
  // `data-on`/`data-action` no campo de padrão próprio faziam o `change` nunca
  // chegar, e o padrão digitado não era gravado.
  for (const pagina of PAGINAS) {
    const tags = fonte(pagina).match(/<[a-z][a-z0-9-]*\s[^<>]*>/g) ?? [];
    assert.ok(tags.length > 0, `${pagina}: nenhuma tag encontrada — a varredura falhou`);
    for (const tag of tags) {
      const names = [...tag.matchAll(/\s([a-z][\w-]*)=/g)].map((m) => m[1]);
      const repeated = names.filter((name, i) => names.indexOf(name) !== i);
      assert.deepEqual(repeated, [], `${pagina}: atributo repetido em ${tag}`);
    }
  }
});
