# Assistente de nomes

Verificação de qualidade de nomes no código Pawn do usuário, com o diagnóstico
`PP0018`. **Offline e determinística**: sem modelo de IA, sem rede, sem enviar
código para fora — só regras sobre o que a engine já extrai do código.

A convenção é **genérica e configurável**: a ferramenta não impõe um padrão da
comunidade (`playerid`, `Iter_`…); ela aponta nomes pobres e confere o estilo
de caixa escolhido para cada categoria de identificador.

Para o uso e as chaves, veja [Configuração](configuration.md#nomenclatura-assistente-de-nomes).
Esta página descreve o funcionamento por dentro.

## Por que não IA

| Opção | Veredito |
|-------|----------|
| Modelo local embarcado | Infla o pacote (centenas de MB), consome RAM e CPU, e nomeia mal. ❌ |
| API externa | Exige chave e rede, e **envia o código do gamemode para fora**. ❌ |
| Regras determinísticas | Leves, instantâneas, privadas e sem dependências. ✅ |

## O que é verificado

Desligado por padrão (`analysis.naming.enabled: false`). Ligado, avalia:

- **Funções** definidas pelo usuário (`stock`, `public`, `static` e sem palavra-chave)
  e seus **parâmetros**. Nativas e `forward` de include ficam de fora: são API
  externa.
- **Variáveis globais**, **constantes** (`const`, membros de `enum`) e **macros**
  (`#define`).
- **Variáveis locais** — `new`/`static` dentro de corpo, inclusive listas
  (`new a, b, c`), tags (`Float:x`), dimensões e inicializadores.

As regras, da mais específica para a mais geral — o primeiro motivo encontrado
é o reportado:

1. **Placeholder** — o nome está na lista de proibidos (`tmp`, `foo`…), sem
   diferenciar maiúsculas.
2. **Comprimento** — mais curto que `minLength`, exceto os índices de loop
   tolerados num cabeçalho de loop e o descarte `_`.
3. **Estilo** — a caixa não casa com nenhum critério da categoria. Lista vazia
   desliga a checagem daquela categoria.

A severidade é sempre `hint`: é estilo, não erro.

## Estilos e padrão próprio

Cada categoria (`functions`, `globals`, `locals`, `constants`, `macros`,
`parameters`) aceita uma lista; o nome passa se casar com **qualquer** item.

- **Estilos embutidos:** `camelCase`, `snake_case`, `PascalCase`, `UPPER_CASE` e
  `Capitalized_Snake`. As regras de cada um estão em
  [Nomenclaturas aceitas](configuration.md#nomenclaturas-aceitas).
- **Padrão próprio:** um item entre barras (`/^g_[a-z][a-zA-Z0-9]*$/`) é lido
  como expressão regular, ancorado como `^(?:…)$` — descreve o nome inteiro.
  Um padrão inválido é ignorado sem derrubar os demais critérios. O motor de
  regex do Rust tem tempo linear garantido, então um padrão custoso não trava a
  análise.

## Correções oferecidas

- **Quick fix** — sobre um identificador, oferece convertê-lo para cada estilo
  embutido presente na configuração, de qualquer categoria
  (`playerHealth` → `player_health`), aplicado como renomeação. Só com o
  assistente ligado. Um padrão próprio não gera sugestão: de um regex
  arbitrário dá para saber se o nome passa, não como reescrevê-lo.
- **Renomear (`F2`)** funciona em qualquer identificador, sinalizado ou não, e
  respeita escopo: um local só no bloco dele, um parâmetro só na própria função.

A sugestão é só normalização de caixa. Derivar um nome do tipo (`Float:`) ou do
inicializador (`GetPoolSize()` → `poolSize`) não está implementado: a heurística
é arriscada e poderia sugerir algo pior que o original.

## Onde fica o código

Em `pawnpro-core/crates/engine/src/`:

| Arquivo | Papel |
|---|---|
| `naming/mod.rs` | `analyze` (avalia os identificadores) e `suggestions_for` (quick fix) |
| `naming/rules.rs` | As três regras, na ordem acima |
| `naming/style.rs` | Reconhecer os estilos embutidos e os padrões próprios |
| `naming/suggest.rs` | Converter um nome para um estilo |
| `naming/locals.rs` | Extrair as variáveis locais dos tokens |
| `analyzer/naming.rs` | Transformar o resultado em `PP0018` |
| `intellisense/rename.rs` | Renomeação com escopo |

As listas de proibidos e de índices de loop vêm dos arquivos `.ban`/`.allow`,
lidos pelo núcleo — ver [Listas de nomes](naming-lists.md).
