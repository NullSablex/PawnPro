# Snippets

Snippets disponíveis para arquivos `.pwn` e `.inc`. Acionados pelo prefixo na paleta de completions do VS Code.

## Estruturas de controle

| Prefixo | Descrição |
|---------|-----------|
| `if` | Condicional `if` |
| `ife` | Condicional `if/else` |
| `for` | Loop `for` com variável de índice |
| `while` | Loop `while` |
| `dowhile` | Loop `do/while` |
| `switch` | `switch/case` com `default` |
| `#if` | Compilação condicional `#if defined ... #endif` |

## Funções

| Prefixo | Descrição |
|---------|-----------|
| `public` | Função `public` com `return 1` |
| `stock` | Função `stock` |
| `static` | Função `static` (escopo de arquivo) |
| `forward` | Declaração `forward` |
| `fwdpublic` | Par `forward` + `public` |
| `native` | Declaração `native` |
| `main` | Função `main` (entry point do gamemode) |

## Variáveis

| Prefixo | Descrição |
|---------|-----------|
| `new` | Declaração de variável |
| `newarr` | Declaração de array |
| `newstr` | Declaração de string (`new str[128]`) |
| `#define` | Constante `#define` |
| `#definef` | Macro `#define` com parâmetro |

## Includes

| Prefixo | Descrição |
|---------|-----------|
| `#include` | `#include <biblioteca>` |
| `#includel` | `#include "arquivo"` (caminho local) |

## Callbacks SA-MP / open.mp

| Prefixo | Descrição |
|---------|-----------|
| `OnGameModeInit` | Inicialização do gamemode |
| `OnGameModeExit` | Saída do gamemode |
| `OnFilterScriptInit` | Inicialização do filterscript |
| `OnFilterScriptExit` | Saída do filterscript |
| `OnPlayerConnect` | Conexão de jogador |
| `OnPlayerDisconnect` | Desconexão de jogador |
| `OnPlayerSpawn` | Spawn de jogador |
| `OnPlayerDeath` | Morte de jogador |
| `OnPlayerCommandText` | Comando de texto (com estrutura `strcmp`) |
| `OnPlayerText` | Mensagem de chat |

## Utilitários

| Prefixo | Descrição |
|---------|-----------|
| `CMD` | Comando ZCMD/DCMD |
| `fmsg` | `format` + `SendClientMessage` |
| `settimer` | `SetTimer` |
| `settimerex` | `SetTimerEx` com argumentos |
| `timer` | Timer callback (`forward` + `public`) |
