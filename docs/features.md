# Recursos

## Motor IntelliSense (Rust LSP)

A análise de código é feita por um motor nativo em Rust ([pawnpro-engine](https://github.com/NullSablex/PawnPro-Engine)) que roda como servidor LSP separado. O motor é iniciado automaticamente pela extensão se o binário estiver presente no diretório `engines/`.

## Diagnósticos

| Código | Nível | Descrição |
|--------|-------|-----------|
| `PP0001` | Erro | `#include` não encontrado |
| `PP0002` | Erro | `native` com corpo `{}` |
| `PP0003` | Erro | `forward` com corpo `{}` |
| `PP0004` | Aviso | `public`/`stock`/`static` sem corpo |
| `PP0005` | Aviso¹ | Variável declarada e não utilizada |
| `PP0006` | Aviso¹ | Função `stock`/`static` não utilizada |
| `PP0007` | Aviso | Uso de símbolo marcado com `@DEPRECATED`, ou símbolo de include depreciado |
| `PP0008` | Aviso | `#include` marcado com `@DEPRECATED` |
| `PP0009` | Hint | Parâmetro de função não utilizado |
| `PP0010` | Aviso | Função chamada não declarada em nenhum include ativo |
| `PP0011` | Hint | `#define` declarado mas não utilizado |
| `PP0012` | Hint | `#include` cujos símbolos não são utilizados |
| `PP0013` | Hint | `#tryinclude` não resolvido |
| `PP0014` | Hint | `native` declarada mas nunca chamada |
| `PP0015` | Hint | `forward` declarado mas nunca chamado |
| `PP0016` | Hint | Função sem keyword declarada mas nunca chamada |
| `PP0017` | Aviso | Indentação inconsistente dentro de um bloco (equivale ao `warning 217` do compilador) |
| `PP0018` | Hint | Nome de identificador pobre (assistente de nomes; desligado por padrão) |

> ¹ Marcados com `unnecessary` — o editor exibe o símbolo desbotado/riscado além do sublinhado de aviso.

> Stocks em `.inc` **não** geram `PP0006` por padrão. Habilite com `analysis.warnUnusedInInc: true`.

> Diagnósticos em arquivos `.inc` podem ser suprimidos por completo com `analysis.suppressDiagnosticsInInc: true`.

## IntelliSense

- **Auto-complete** — funções (`native`, `stock`, `public`, `forward`, `static`), macros (`#define`) e variáveis de todos os includes transitivos; parâmetros com snippets; itens depreciados marcados visivelmente.
- **Hover** — assinatura e comentário de documentação; em `#include` exibe o caminho resolvido e o doc do topo do arquivo.
- **Signature Help** — parâmetro ativo destacado ao digitar `(` e `,`.
- **CodeLens** — contagem de referências acima de cada função; clique para listar todas no painel.
- **Semantic Tokens** — coloração semântica para funções, incluindo chamadas multiline.
- **Semantic Tokens** — coloração semântica para funções, incluindo chamadas multiline.
- **Renomeação (`F2`)** — renomeia o símbolo sob o cursor em todas as ocorrências do projeto aberto.
- **Snippets** — estruturas prontas para controle de fluxo, funções, variáveis, includes, callbacks SA-MP/open.mp e utilitários como `CMD`, `SetTimer` e `fmsg`. Lista completa em [docs/snippets.md](snippets.md).

## Formatação de código

Formatação guiada pela estrutura do código (não por heurística de texto), validada contra o compilador `pawncc`.

- **Documento inteiro** — formatação padrão do editor.
- **Apenas a seleção** — atalho `Ctrl+K Ctrl+F`.
- **Presets** — `allman` (padrão), `knr`, `compact` e `custom` (libera ajustes finos: posição da chave, espaço em operadores, bloco vazio na mesma linha). Configurável pela chave `format` ou pela seção **Formatação** da página de configurações, com cartões de *preview*.

## Assistente de nomes (`PP0018`)

Verificação de qualidade de nomes, **offline e determinística** (sem IA, sem rede). Desligada por padrão; ativável na seção **Nomenclatura** da página de configurações.

- Sinaliza nomes **curtos** (com tolerância a índices de loop), **genéricos** (`tmp`, `foo`, … — lista editável) e **fora do estilo** de caixa configurado.
- **Estilo por categoria, multi-seleção** — funções, globais, locais, constantes, macros e parâmetros aceitam um ou mais estilos (`camelCase`/`snake_case`/`PascalCase`/`UPPER_CASE`/`Capitalized_Snake`); o nome é aceito se casar com qualquer um deles. A referência de cada convenção (o que casa e o que não casa) está em [Nomenclaturas aceitas](configuration.md#nomenclaturas-aceitas).
- **Quick-fix** — code action que oferece converter o nome para o estilo configurado.
- **Listas em arquivos** — nomes proibidos e índices de loop ficam em arquivos `.ban`/`.allow` editáveis (com realce próprio). Ver o [guia de listas](naming-lists.md).

## Idiomas

Interface e mensagens em **Português (BR)** e **Inglês**, com esqueletos para **Espanhol, Russo e Romeno** (a traduzir). Detalhes em [Idiomas (i18n)](i18n.md).

## Depreciação com `@DEPRECATED`

O marcador `@DEPRECATED` (case-insensitive) pode ser usado de três formas:

```pawn
// @DEPRECATED
stock MinhaFuncaoAntiga() { ... }

stock OutraFuncao() { ... } // @deprecated

/* @DEPRECATED */
#include <include_legado>
```

- **Símbolo** (`native`, `stock`, `public`, `forward`, `static`, `#define`, variável global) → a declaração recebe PP0007 (hint visual) e qualquer uso também exibe **PP0007**.
- **Par `forward`/`public`** — depreciar o `forward` marca automaticamente o `public` correspondente, e vice-versa.
- **`#include`** → a linha do `#include` recebe **PP0008** e qualquer uso de qualquer símbolo daquele arquivo exibe **PP0007** com a mensagem *"pertence a um include depreciado"*.

## Compilação

- `Ctrl+Alt+B` — compila o arquivo `.pwn` aberto com `pawncc` (ativo quando o foco está em um arquivo Pawn).
- Detecção automática do compilador ou caminho manual em `.pawnpro/config.json`.
- Se `compiler.args` estiver vazio, a extensão detecta as flags suportadas pelo `pawncc` local e aplica um preset mínimo automaticamente em cada compilação.
- O arquivo é salvo automaticamente antes de compilar.

## Servidor SA-MP / open.mp

- **Start / Stop / Restart** via terminal integrado do editor.
- **Painel lateral** com campo de entrada de comandos, histórico (até 200 entradas) navegável por seta, favoritos e botões de limpar histórico/favoritos.
- Envio via **RCON (UDP)** quando a senha está configurada (timeout 1500 ms); fallback para stdin do terminal. Bloqueado se a senha for vazia ou `changename`. Prefixos `rcon` e `rcon login ...` são removidos automaticamente antes do envio.
- *Tail* do log do servidor com *follow* configurável — **exclusivo para Linux e macOS** (não disponível no Windows).
- Detecção automática de executável do servidor nos subdiretórios: raiz do workspace, `server/`, `samp/`, `samp-server/`, `samp03/`, `open.mp/`.
- Detecção automática de `server.cfg` (SA-MP) ou `config.json` (open.mp); log padrão: `server_log.txt` (SA-MP) ou o arquivo definido em `logging.file` no `config.json` (open.mp, padrão `log.txt`).

## Interface

- **Status bar** — item `PawnPro` com acesso rápido a: reiniciar motor, abrir configurações, controles do servidor e criação de novos scripts.
- **Painel de configurações** — interface gráfica para editar todas as chaves de `.pawnpro/config.json` sem editar JSON manualmente, acessível via `pawnpro.openSettings`.
- **Aba Includes** — lista todos os `.inc` (recursivamente, até 20 níveis) do primeiro diretório válido dentre os `includePaths` resolvidos, com seus natives expandíveis e navegação direta para a declaração.
- **Temas de sintaxe** — cinco esquemas nomeados: `auto`, `classic_white`, `classic_dark`, `modern_white`, `modern_dark` (mais `none` para desativar). O esquema `auto` seleciona automaticamente entre Clássico Claro e Clássico Escuro conforme o tema ativo do editor. Ao escolher um esquema via comando, a reaplicação automática na inicialização é habilitada automaticamente. Reaplica automaticamente ao trocar o tema do editor quando `scheme` é `auto`.
- **Templates** — cria Gamemode (open.mp ou SA-MP), Filterscript (open.mp ou SA-MP) e Include (open.mp); filtra automaticamente pela plataforma configurada (`analysis.sdk.platform`). Não há template de Include para SA-MP.
- **Biblioteca de Recursos** — WebView para buscar plugins, filterscripts e includes, com modos de visualização em lista e grade, acessível via `pawnpro.openStore`. **Prévia:** atualmente exibe um catálogo de exemplo; a instalação ainda não está disponível. As fontes previstas são o catálogo próprio do PawnPro e `packages.open.mp`.
- **Internacionalização** — mensagens em PT-BR e EN; idioma do motor LSP configurável via `locale`.
