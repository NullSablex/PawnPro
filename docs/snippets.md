# Snippets

Snippets disponíveis para arquivos `.pwn` e `.inc`. Acionados pelo prefixo na paleta de completions do editor.

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
| `#ifdef` | Compilação condicional `#ifdef ... #endif` |
| `#ifndef` | Compilação condicional `#ifndef ... #endif` |

## Funções

| Prefixo | Descrição |
|---------|-----------|
| `public` | Função `public` com `return 1` |
| `stock` | Função `stock` |
| `static` | Função `static` (escopo de arquivo) |
| `staticstock` | Função `static stock` (interna e não exportada) |
| `forward` | Declaração `forward` |
| `fwdpublic` | Par `forward` + `public` |
| `native` | Declaração `native` |
| `main` | Função `main` (entry point do gamemode) |

## Variáveis e tipos

| Prefixo | Descrição |
|---------|-----------|
| `new` | Declaração de variável |
| `newarr` | Declaração de array |
| `newstr` | Declaração de string (`new str[128]`) |
| `enum` | Declaração de `enum` |
| `const` | Constante com `const` |
| `#define` | Constante `#define` |
| `#definef` | Macro `#define` com parâmetro (`%0`, `%1`, ...) |

## Includes e diretivas

| Prefixo | Descrição |
|---------|-----------|
| `#include` | `#include <biblioteca>` |
| `#includel` | `#include "arquivo"` (caminho local) |
| `#tryinclude` | `#tryinclude <biblioteca>` — include opcional sem erro se ausente |
| `#guard` | Guard de include (`#if defined / #endinput / #define`) |
| `#pragma tabsize` | Define o tamanho do tab para verificação de indentação |
| `#pragma deprecated` | Marca o símbolo seguinte como depreciado |

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
