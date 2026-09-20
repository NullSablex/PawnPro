import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import { mdToHtml } from '../changelogHtml.js';

test('a citação do resumo vira blockquote, não texto com ">"', () => {
  const html = mdToHtml('> **O que muda.** Resumo da versão.\n>\n> Segundo parágrafo.');
  assert.match(html, /<blockquote>/);
  assert.match(html, /<\/blockquote>/);
  assert.equal(html.match(/<p>/g)?.length, 2);
  assert.doesNotMatch(html, /&gt;/, 'o marcador da citação não pode aparecer no texto');
});

test('a citação fecha antes da seção seguinte', () => {
  const html = mdToHtml('> Resumo.\n\n### Adicionado\n\n- Item');
  assert.match(html, /<\/blockquote>\s*<div class="card-section">/);
});

test('cada seção vira um card com seus itens', () => {
  const html = mdToHtml('### Adicionado\n\n- Um\n- Dois\n\n### Corrigido\n\n- Três');
  assert.equal(html.match(/card-section/g)?.length, 2);
  assert.equal(html.match(/<li>/g)?.length, 3);
});

test('sub-item fica dentro do item que o contém', () => {
  const html = mdToHtml('- Pai\n  - Filho');
  assert.match(html, /<li>Pai\s*<ul>\s*<li>Filho/);
});

test('bloco de código não vira marcação', () => {
  const html = mdToHtml('```bash\n# comentário\n- não é item\n```');
  assert.match(html, /<pre><code class="language-bash">/);
  assert.match(html, /# comentário/);
  assert.doesNotMatch(html, /<li>/);
});

test('negrito, código e link são reconhecidos', () => {
  const html = mdToHtml('- **forte**, `codigo` e [texto](https://exemplo.test/a)');
  assert.match(html, /<strong>forte<\/strong>/);
  assert.match(html, /<code>codigo<\/code>/);
  assert.match(html, /<a href="https:\/\/exemplo\.test\/a">texto<\/a>/);
});

test('HTML do changelog é escapado', () => {
  // O changelog cita tipos e tags; renderizá-los cruamente injetaria marcação
  // na página. A caixa do que veio no texto não importa: o escape é por
  // caractere, e a verificação também tem de ser — procurar só por `<script>`
  // minúsculo deixaria passar o dia em que ela deixasse de ser.
  const html = mdToHtml(
    '- um `<ScRiPt>` , a & comercial e um <img src=x onerror=alert(1)>',
  );
  assert.match(html, /&lt;ScRiPt&gt;/);
  assert.match(html, /&amp;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  // Nenhuma marcação do texto sobrevive: o que abre tag no resultado é só o
  // que o renderizador emitiu.
  for (const tag of [...html.matchAll(/<\/?([a-zA-Z][\w-]*)/g)].map((m) => m[1].toLowerCase())) {
    assert.ok(
      ['ul', 'li', 'p', 'code', 'strong', 'a', 'em', 'pre', 'div', 'h2', 'blockquote'].includes(tag),
      `tag inesperada no resultado: ${tag}`,
    );
  }
});

test('o changelog real da 4.0.0 não deixa marcador solto', () => {
  const raw = fs.readFileSync('CHANGELOG.md', 'utf8');
  const start = raw.indexOf('## [4.0.0]');
  const section = raw.slice(raw.indexOf('\n', start), raw.indexOf('\n## ', start + 10));
  const html = mdToHtml(section);
  assert.doesNotMatch(html, /<p>&gt;/, 'citação renderizada como texto');
  assert.doesNotMatch(html, /<p>#{1,4}\s/, 'título renderizado como texto');
  assert.match(html, /<blockquote>/);
});
