/**
 * O Markdown da seção do changelog vira HTML para a página "O que há de novo".
 *
 * É um subconjunto do Markdown — o que o changelog usa: títulos, listas com
 * sub-listas, blocos de código cercados, citações, negrito, código inline e
 * links. Um renderizador completo seria uma dependência a mais no VSIX para
 * pouco ganho.
 *
 * Fica aqui, longe do `vscode`, para ser testável: o resultado é uma string.
 */
export function mdToHtml(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  // Uma entrada por lista aberta, do nível externo ao interno. `indent` é a
  // indentação que abriu a lista; `liOpen` diz se o item corrente daquele
  // nível ainda está aberto — cada nível tem o seu, e um booleano único não
  // dava conta de uma sub-lista dentro de um item que ainda vai receber texto.
  const listStack: { indent: number; liOpen: boolean }[] = [];
  const topo = () => listStack[listStack.length - 1];

  const escape = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const inline = (s: string) =>
    escape(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // [texto](url) → link (após o escape de < >, então a URL está segura)
      .replace(
        /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
        '<a href="$2">$1</a>',
      );

  let cardOpen = false;
  let quoteOpen = false;
  // Bloco cercado por ``` : o conteúdo é literal, então nada dentro dele passa
  // pela marcação inline. `null` quando não há bloco aberto.
  let fenceLang: string | null = null;
  let fenceLines: string[] = [];
  // Indentação da cerca: num bloco aninhado numa lista, ela recua o conteúdo
  // todo e apareceria dentro do código.
  let fenceIndent = 0;
  // Um item fica aberto enquanto puder receber continuação (um bloco de
  // código indentado, um parágrafo); sem isso o conteúdo cairia dentro do
  // <ul> e fora de qualquer <li>, o que é inválido.

  /** Fecha o item corrente do nível mais interno, se houver um aberto. */
  const closeLi = () => {
    const t = topo();
    if (t?.liOpen) { out.push('</li>'); t.liOpen = false; }
  };

  /**
   * Fecha as listas mais internas que `toIndent`, deixando o conteúdo
   * seguinte no nível certo.
   *
   * O item de cada nível fechado sai depois do `</ul>` que estava dentro
   * dele; o item do nível de destino permanece aberto, porque é ele que vai
   * receber o que vem a seguir.
   */
  const closeLists = (toIndent = -1) => {
    while (listStack.length > 0 && topo()!.indent > toIndent) {
      // Fecha o item corrente desta lista e a própria lista. O item do nível
      // que resta é o dono do que vem a seguir, então continua aberto — quem
      // precisar fechá-lo (um item irmão, por exemplo) chama `closeLi`.
      closeLi();
      out.push('</ul>');
      listStack.pop();
    }
  };
  // Cada seção (### / ####) é um card; fecha o anterior antes de abrir o próximo.
  const closeQuote = () => {
    if (quoteOpen) { out.push('</blockquote>'); quoteOpen = false; }
  };
  const closeCard = () => {
    closeQuote();
    closeLists();
    if (cardOpen) { out.push('</div>'); cardOpen = false; }
  };
  const openCard = (title: string) => {
    closeCard();
    out.push(`<div class="card-section"><div class="card-title">${title}</div>`);
    cardOpen = true;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    // A cerca vem antes de tudo: dentro dela, `-` e `#` são código, não
    // marcação.
    const fence = /^(\s*)```(\w*)\s*$/.exec(line);
    if (fence) {
      if (fenceLang === null) {
        fenceIndent = fence[1].length;
        // Um bloco indentado pertence ao item de lista acima — fechar a lista
        // aqui transformaria o texto seguinte num parágrafo solto, com outra
        // cor. Só uma cerca na margem encerra a lista.
        if (fenceIndent === 0) closeLists();
        fenceLang = fence[2] || '';
        fenceLines = [];
      } else {
        const cls = fenceLang ? ` class="language-${fenceLang}"` : '';
        out.push(`<pre><code${cls}>${escape(fenceLines.join('\n'))}</code></pre>`);
        fenceLang = null;
        fenceLines = [];
      }
      continue;
    }
    if (fenceLang !== null) { fenceLines.push(raw.slice(fenceIndent)); continue; }

    // Uma linha em branco não encerra a lista: em Markdown, só o conteúdo
    // seguinte decide isso, quando volta à margem. Fechar aqui quebrava o
    // vínculo entre um item e o bloco de código indentado abaixo dele.
    if (!line.trim()) continue;

    if (/^[-*_]{3,}\s*$/.test(line.trim())) { closeCard(); continue; }

    // Citação (`>`): o resumo da versão costuma vir assim. Sem isto, o `>`
    // aparecia como texto na página.
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      closeLists();
      if (!quoteOpen) { out.push('<blockquote>'); quoteOpen = true; }
      if (quote[1].trim()) out.push(`<p>${inline(quote[1].trim())}</p>`);
      continue;
    }
    closeQuote();

    // Versão (##): título solto fora de card; fecha o card anterior.
    if (/^##\s+(?!#)/.test(line)) {
      closeCard();
      out.push(`<h2>${inline(line.replace(/^##\s+/, ''))}</h2>`);
      continue;
    }

    // Seção (#### antes de ###): abre um novo card.
    if (/^####\s+/.test(line)) { openCard(inline(line.replace(/^####\s+/, ''))); continue; }
    if (/^###\s+/.test(line))  { openCard(inline(line.replace(/^###\s+/, '')));  continue; }

    // Item de lista, possivelmente indentado (sub-listas aninhadas).
    const m = /^(\s*)[-*]\s+(.*)$/.exec(line);
    if (m) {
      const indent = m[1].length;
      if (listStack.length > 0 && indent > topo()!.indent) {
        // Sub-lista: pertence ao item acima, que segue aberto e a contém.
        out.push('<ul>');
        listStack.push({ indent, liOpen: false });
      } else {
        // Mesmo nível ou acima: fecha o que for mais interno e o item irmão.
        closeLists(indent);
        if (listStack.length === 0) {
          out.push('<ul>');
          listStack.push({ indent, liOpen: false });
        } else {
          closeLi();
        }
      }
      out.push(`<li>${inline(m[2])}`);
      topo()!.liOpen = true;
      continue;
    }

    // Texto indentado continua o item do nível que ele excede — não
    // necessariamente o mais interno: depois de uma sub-lista, um parágrafo
    // recuado em 2 espaços pertence ao item de nível 0, e a sub-lista fecha.
    const indent = line.length - line.trimStart().length;
    const dono = [...listStack].reverse().find(l => indent > l.indent);
    if (dono) {
      closeLists(dono.indent);
      out.push(`<p class="cont">${inline(line.trim())}</p>`);
      continue;
    }
    closeLists();
    out.push(`<p>${inline(line.trim())}</p>`);
  }

  // Uma citação aberta no fim do texto fecha junto com o resto.
  closeQuote();
  // Uma cerca não fechada no fim do texto ainda deve render o que já veio.
  if (fenceLang !== null && fenceLines.length) {
    const cls = fenceLang ? ` class="language-${fenceLang}"` : '';
    out.push(`<pre><code${cls}>${escape(fenceLines.join('\n'))}</code></pre>`);
  }
  closeCard();
  return out.join('\n');
}
