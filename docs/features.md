# Recursos

## Motor IntelliSense (Rust LSP)

A análise de código é feita por um motor nativo em Rust, hospedado pelo núcleo ([pawnpro-core](https://github.com/NullSablex/PawnPro-Core)) e servido por LSP. O núcleo é um binário nativo que acompanha a extensão e é iniciado automaticamente — não há nada a instalar.

## Diagnósticos

| Código | Nível | Descrição | Correção |
|--------|-------|-----------|:--------:|
| `PP0001` | Erro | `#include` não encontrado | — |
| `PP0002` | Erro | `native` com corpo `{}` | ✅ |
| `PP0003` | Erro | `forward` com corpo `{}` | ✅ |
| `PP0004` | Aviso | `public`/`stock`/`static` sem corpo | ✅ |
| `PP0005` | Aviso¹ | Variável declarada e não utilizada | ✅ |
| `PP0006` | Aviso¹ | Função `stock`/`static` não utilizada | ✅ |
| `PP0007` | Aviso² | Uso de símbolo marcado com `#pragma deprecated`, ou símbolo de include depreciado | — |
| `PP0008` | Aviso | `#include` precedido de `#pragma deprecated` | — |
| `PP0009` | Hint | Parâmetro de função não utilizado | ✅ |
| `PP0010` | Aviso | Função chamada não declarada em nenhum include ativo | ✅ |
| `PP0011` | Hint | `#define` declarado mas não utilizado | ✅ |
| `PP0012` | Hint | `#include` cujos símbolos não são utilizados | ✅ |
| `PP0013` | Hint | `#tryinclude` não resolvido | — |
| `PP0014` | Hint | `native` declarada mas nunca chamada | — |
| `PP0015` | Hint | `forward` declarado mas nunca chamado | — |
| `PP0016` | Aviso¹ | Função sem keyword declarada mas nunca chamada | ✅ |
| `PP0017` | Aviso | Indentação inconsistente dentro de um bloco (equivale ao `warning 217` do compilador) | ✅ |
| `PP0018` | Hint | Nome de identificador pobre (assistente de nomes; desligado por padrão) | ✅ |
| `PP0019` | Aviso | `#pragma` com nome desconhecido (com sugestão do nome provável) ou `#pragma deprecated` com a mensagem entre aspas | ✅ |

> ¹ Marcados com `unnecessary` — o editor exibe o símbolo desbotado além do sublinhado de aviso.

> ² Marcados com `deprecated` — o editor exibe o símbolo riscado.

> A coluna **Correção** indica os diagnósticos com correção automática (`Ctrl+.`).

> Stocks em `.inc` **não** geram `PP0006` por padrão. Habilite com `analysis.warnUnusedInInc: true`.

> Diagnósticos em arquivos `.inc` podem ser suprimidos por completo com `analysis.suppressDiagnosticsInInc: true`.

## IntelliSense

- **Auto-complete** — funções (`native`, `stock`, `public`, `forward`, `static`), macros (`#define`) e variáveis de todos os includes transitivos; parâmetros com snippets; itens depreciados marcados visivelmente.
- **Hover** — assinatura e comentário de documentação formatado (ver [Comentários de documentação](#comentarios-de-documentacao)); em `#include` exibe o caminho resolvido e o doc do topo do arquivo.
- **Signature Help** — parâmetro ativo destacado ao digitar `(` e `,`, com a descrição daquele parâmetro quando a função está documentada.
- **CodeLens** — contagem de referências acima de cada função; clique para listar todas no painel.
- **Semantic Tokens** — coloração semântica para funções, incluindo chamadas multiline.
- **Ir para definição** (`F12` / `Ctrl`+clique) — leva à declaração no próprio arquivo, nos includes ou em outro arquivo compilado junto; num `forward`, vai ao corpo da função.
- **Renomeação (`F2`)** — com escopo: um local só no bloco onde foi declarado, um parâmetro só na própria função. Renomear uma `public` atualiza também strings que são exatamente o nome, como em `SetTimer("Nome", …)`; renomear uma global que tenha local ou parâmetro homônimo é recusado, com o motivo.
- **Unidade de compilação** — hover, assinatura, autocomplete, referências e o contador enxergam o que é compilado junto com o arquivo (o `.inc` irmão, inclusive fechado), e nunca outro programa: gamemode e filterscript não se misturam.
- **Texto não salvo** — o que se escreve num include aberto já vale nos outros arquivos antes de salvar.
- **Snippets** — estruturas prontas para controle de fluxo, funções, variáveis, includes, callbacks SA-MP/open.mp e utilitários como `CMD`, `SetTimer` e `fmsg`. Lista completa em [docs/snippets.md](snippets.md).

## Comentários de documentação

O comentário escrito imediatamente acima de uma declaração alimenta o hover, o *signature help* e o autocomplete. Dois formatos são reconhecidos, detectados pelo próprio conteúdo.

**Javadoc** — `@param`, `@return`, `@remarks` (ou `@note`):

```pawn
/**
 * Bane o endereço de um jogador conectado, com um motivo.
 *
 * @param playerid  o jogador a ser banido
 * @param reason[]  o motivo, mostrado a ele e guardado no registro
 * @return          1 sempre
 */
native BanEx(playerid, const reason[]);
```

**XMLdoc** — o formato usado pelo `omp-stdlib` do open.mp:

```pawn
/**
 * <library>omp_actor</library>
 * <summary>Verifica se um ator está transmitido para um jogador.</summary>
 * <param name="actorid">O ID do ator</param>
 * <param name="playerid">O ID do jogador</param>
 * <seealso name="CreateActor" />
 * <returns><b><c>1</c></b> se estiver, <b><c>0</c></b> caso contrário.</returns>
 */
native bool:IsActorStreamedIn(actorid, playerid);
```

No XMLdoc, a formatação embutida vira texto formatado (`<b>` negrito, `<c>` código, `<br />` quebra de linha), e `<library>`, `<seealso>` e os links `<a href="#Função">` — que servem ao gerador da wiki do open.mp — não aparecem no hover.

Em ambos os formatos, cada parâmetro é casado **pelo nome** (o `[]` de array é ignorado) e não pela posição, então o comentário pode omitir parâmetros ou listá-los fora de ordem. O hover mostra o bloco inteiro com os títulos das seções no idioma configurado; o *signature help*, a descrição do parâmetro sob o cursor; o autocomplete, apenas o resumo.

Um comentário comum, sem nenhuma tag, continua aparecendo como descrição.

## Formatação de código

Formatação guiada pela estrutura do código (não por heurística de texto), validada contra o compilador `pawncc`.

- **Documento inteiro** — formatação padrão do editor.
- **Apenas a seleção** — atalho `Ctrl+K Ctrl+F`.
- **Presets** — `allman` (padrão), `knr`, `compact` e `custom` (libera ajustes finos: posição da chave, espaço em operadores, bloco vazio na mesma linha). Configurável pela chave `format` ou pela seção **Formatação** da página de configurações, com cartões de *preview*.

## Assistente de nomes (`PP0018`)

Verificação de qualidade de nomes, **offline e determinística** (sem IA, sem rede). Desligada por padrão; ativável na seção **Nomenclatura** da página de configurações.

- Sinaliza nomes **curtos** (com tolerância a índices de loop), **genéricos** (`tmp`, `foo`, … — lista editável) e **fora do estilo** de caixa configurado.
- **Estilo por categoria, multi-seleção** — funções, globais, locais, constantes, macros e parâmetros aceitam um ou mais estilos (`camelCase`/`snake_case`/`PascalCase`/`UPPER_CASE`/`Capitalized_Snake`); o nome é aceito se casar com qualquer um deles. A referência de cada convenção (o que casa e o que não casa) está em [Nomenclaturas aceitas](configuration.md#nomenclaturas-aceitas).
- **Padrão próprio** — além dos estilos embutidos, a categoria aceita uma expressão regular escrita entre barras (`/^g_[a-z][a-zA-Z0-9]*$/`), para convenções que os cinco estilos não descrevem — prefixo de global, notação húngara. Convive com eles: o nome passa se casar com qualquer critério. O padrão é âncorado (descreve o nome inteiro) e um padrão inválido é ignorado sem afetar os demais.
- **Quick-fix** — code action que oferece converter o nome para o estilo configurado. Não se aplica ao padrão próprio: de um regex arbitrário dá para saber se o nome passa, não como reescrevê-lo.
- **Listas em arquivos** — nomes proibidos e índices de loop ficam em arquivos `.ban`/`.allow` editáveis (com realce próprio). Ver o [guia de listas](naming-lists.md).

## Idiomas

Interface e mensagens em **Português (BR)**, **Inglês**, **Espanhol**, **Romeno** e **Russo**. A interface e os diagnósticos podem usar idiomas diferentes, configuráveis de forma independente. Detalhes em [Idiomas (i18n)](i18n.md).

## Biblioteca de Recursos (prévia)

Vitrine para encontrar plugins, filterscripts e includes, aberta pelo comando **"PawnPro: Biblioteca de Recursos"**.

- **Busca** por nome, descrição ou autor.
- **Lista ou grade** — alterna o layout pelo botão da barra de ferramentas.
- **Detalhe** de cada item ao clicar.

> Nesta versão é uma **prévia** com catálogo de exemplo — a instalação ainda não está disponível. Fontes previstas: catálogo próprio + `packages.open.mp`.

## Depreciação com `#pragma deprecated`

A diretiva do compilador Pawn marca a **próxima** declaração. O texto que a segue é opcional e, quando presente, aparece junto do aviso — normalmente é onde se diz o que usar no lugar:

```pawn
#pragma deprecated
stock MinhaFuncaoAntiga() { ... }

#pragma deprecated Use BanPlayerFor em vez desta
stock BanTemporario(playerid, seconds) { ... }

#pragma deprecated
#include <include_legado>
```

Como no compilador, não há forma na mesma linha da declaração.

- **Símbolo** (`native`, `stock`, `public`, `forward`, `static`, `#define`, variável global) → a declaração aparece riscada com **PP0007**, e qualquer uso também exibe **PP0007**.
- **Par `forward`/`public`** — depreciar o `forward` marca automaticamente o `public` correspondente, e vice-versa.
- **`#include`** → a linha do `#include` recebe **PP0008** e qualquer uso de qualquer símbolo daquele arquivo exibe **PP0007** com a mensagem *"pertence a um include depreciado"*.

## Compilação

- `Ctrl+Alt+B` — compila o arquivo `.pwn` aberto com `pawncc` (ativo quando o foco está em um arquivo Pawn).
- Detecção automática do compilador ou caminho manual em `.pawnpro/config.json` — ordem de busca em [Compiladores](compilers.md#onde-o-pawnpro-procura).
- Se `compiler.args` estiver vazio, a extensão detecta as flags suportadas pelo `pawncc` local e aplica um preset mínimo automaticamente em cada compilação.
- O arquivo é salvo automaticamente antes de compilar.
- A compilação roda em segundo plano no núcleo, sem travar o resto da extensão; a saída do `pawncc` aparece no painel **Pawn Build** ao terminar.

## Servidor SA-MP / open.mp

> Guia de uso completo em [Servidor](server.md).

- **Start / Stop / Restart** via terminal integrado do editor.
- **Painel lateral** com campo de entrada de comandos, histórico (até 200 entradas) navegável por seta e favoritos, divididos em duas abas com busca e paginação. Comandos que pareçam carregar senha são enviados mas não guardados; o registro pode ser desligado em `server.history.enabled`.
- Envio via **RCON (UDP)** quando a senha está configurada e o servidor é local (timeout 1500 ms); sem senha válida (vazia ou `changename`) ou com servidor remoto, o comando vai pela entrada do terminal — o RCON trafega a senha em texto claro. O prefixo `rcon` é removido antes do envio, e `login` não é repassado: o painel já envia autenticado.
- *Tail* do log do servidor com *follow* configurável — **exclusivo para Linux e macOS** (não disponível no Windows).
- Detecção automática de executável do servidor nos subdiretórios: raiz do workspace, `server/`, `samp/`, `samp-server/`, `samp03/`, `open.mp/`.
- Detecção automática de `server.cfg` (SA-MP) ou `config.json` (open.mp); log padrão: `server_log.txt` (SA-MP) ou o arquivo definido em `logging.file` no `config.json` (open.mp, padrão `log.txt`).

## Depuração (DAP)

> Guia completo em [Depuração](debugging.md). O depurador ainda é **instável**.

- **Depurador visual** para servidor local: breakpoints, *step*, inspeção de variáveis e *call stack* navegável, com o arquivo de cada frame (`F5` / `launch.json` tipo `pawn`).
- **Gamemode, filterscripts e includes** — só o programa em depuração para nos breakpoints, mesmo com outros scripts carregados no servidor.
- **Breakpoints além da linha** — condicionais, por contagem de acertos, logpoints, **data breakpoints** (pausa quando um valor muda, inclusive em `arr[3]`), **por função** e **pausa em erro de runtime** (divisão por zero, índice fora do limite, colisão pilha/heap, underflow de heap e acesso inválido à memória).
- **Inspeção e edição** — arrays expansíveis (inclusive multidimensionais e por referência), arrays de char mostrados como string, expressões no watch e no hover, autocomplete de variáveis em escopo, edição por expressão (`arr[i] = 10`) confirmada pelo servidor e leitura de memória em hex.
- **Compilação com debug info** — ao depurar, qualquer `-d` da configuração vira `-d3` só nessa compilação (sua configuração não é alterada). Reiniciar recompila quando o fonte mudou ou quando o `.amx` não tem informação de depuração.
- **Código editado durante a sessão** — os breakpoints são levados para a linha equivalente do código compilado, em vez de pararem no lugar errado.
- **Preparação** — antes de iniciar, verifica se o plugin está instalado (`components/` no open.mp, ou `plugins/`), registrado quando o servidor exige e da arquitetura do servidor, avisando o que falta.
- **Servidor iniciado pela sessão** — o adaptador vive no núcleo, sobe o servidor e o encerra ao parar; o plugin conecta ao núcleo pelo soquete local.
- O **plugin do servidor** é instalado uma vez (mesmo binário para SA-MP e open.mp).

## Interface

- **Status bar** — item `PawnPro` com acesso rápido a: reiniciar motor, abrir configurações, controles do servidor, criação de novos scripts e ajuda.
- **Painel de configurações** — interface gráfica para editar todas as chaves de `.pawnpro/config.json` sem editar JSON manualmente, acessível via `pawnpro.openSettings`.
- **Aba Includes** — lista todos os `.inc` (recursivamente, até 20 níveis) do primeiro diretório válido dentre os `includePaths` resolvidos, com seus natives expandíveis e navegação direta para a declaração.
- **Temas de sintaxe** — cinco esquemas nomeados: `auto`, `classic_white`, `classic_dark`, `modern_white`, `modern_dark` (mais `none` para desativar). O esquema `auto` seleciona automaticamente entre Clássico Claro e Clássico Escuro conforme o tema ativo do editor. Ao escolher um esquema via comando, a reaplicação automática na inicialização é habilitada automaticamente. Reaplica automaticamente ao trocar o tema do editor quando `scheme` é `auto`.
- **Templates** — cria Gamemode (open.mp ou SA-MP), Filterscript (open.mp ou SA-MP) e Include (open.mp); filtra automaticamente pela plataforma configurada (`analysis.sdk.platform`). Não há template de Include para SA-MP.
- **Biblioteca de Recursos** — WebView para buscar plugins, filterscripts e includes, com modos de visualização em lista e grade, acessível via `pawnpro.openStore`. **Prévia:** atualmente exibe um catálogo de exemplo; a instalação ainda não está disponível. As fontes previstas são o catálogo próprio do PawnPro e `packages.open.mp`.
- **Cor de destaque** — seis cores (azul, roxo, verde, âmbar, rosa e ciano) para botões, item ativo, foco e badges das páginas da extensão, mais o padrão **Automático**, que herda do tema do editor. Não altera o realce de sintaxe. Configurável em `ui.accent`.
- **Internacionalização** — interface e diagnósticos em PT-BR, EN, ES, RO e RU; idioma da interface via `ui.locale` e idioma do motor LSP/debugger via `locale` (independentes).
- **Registro de diagnóstico** — com `diagnostics.level` ligado, a extensão, o núcleo e a engine gravam o que fazem em `.pawnpro/logs/`, para relatar problemas. Desligado por padrão.
- **Sugestão do Material Icon Theme** — na ativação, se o tema não estiver instalado, a extensão sugere instalá-lo (melhora os ícones das pastas). Dispensável de vez; nunca reaparece quando já presente.

## Realce de sintaxe adicional

- **Prévia de cor** — literais de cor `0xRRGGBBAA` (e `0xRRGGBB`, tratado como opaco) e cores embutidas em texto do SA-MP `{RRGGBB}` (chat, textdraws) exibem um *swatch* clicável com a cor real; clicar abre o seletor nativo, que reescreve o valor no mesmo formato. Reconhece também o ajuste de alpha por aritmética (`0xRRGGBB00 + N`).
- **TOML** — arquivos `.toml` e `package.lock` recebem realce de sintaxe (gramática adaptada da extensão Even Better TOML, MIT).
