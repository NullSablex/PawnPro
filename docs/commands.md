# Comandos

Os comandos do PawnPro podem ser executados pela paleta de comandos (`Ctrl+Shift+P`) ou pelos atalhos indicados.

## Compilação

| Comando | Atalho | Descrição |
|---------|--------|-----------|
| `pawnpro.compileCurrent` | `Ctrl+Alt+B` | Compila o arquivo `.pwn` aberto (ativo quando o foco está em um arquivo Pawn) |
| `pawnpro.detectCompiler` | — | Detecta o `pawncc` automaticamente no workspace |

## Servidor

| Comando | Descrição |
|---------|-----------|
| `pawnpro.server.start` | Inicia o servidor SA-MP / open.mp |
| `pawnpro.server.stop` | Para o servidor |
| `pawnpro.server.restart` | Reinicia o servidor |
| `pawnpro.server.show` | Exibe o terminal integrado do servidor |
| `pawnpro.server.showLog` | Exibe o painel de log do servidor e rola até o final |

## Sintaxe

| Comando | Descrição |
|---------|-----------|
| `pawnpro.applySyntaxScheme` | Abre seletor de tema de sintaxe PawnPro |
| `pawnpro.resetSyntaxScheme` | Restaura a sintaxe padrão (remove regras PawnPro) |

## Motor

| Comando | Descrição |
|---------|-----------|
| `pawnpro.clearEngineCache` | Reinicia o motor LSP e limpa o cache |

## Scripts e templates

| Comando | Descrição |
|---------|-----------|
| `pawnpro.newScript` | Cria um novo script Pawn a partir dos templates embutidos da extensão |

## Configurações

| Comando | Descrição |
|---------|-----------|
| `pawnpro.openSettings` | Abre o painel de configurações gráfico do PawnPro |

## Outros

| Comando | Descrição |
|---------|-----------|
| `pawnpro.whatsNew` | Abre o painel "O que há de novo" |

---

## Barra de status

O item `PawnPro` na barra de status inferior abre um menu rápido com:

- **Reiniciar motor** — reinicia o servidor LSP e limpa o cache
- **Configurações** — abre o painel de configurações gráfico (`pawnpro.openSettings`)
- **Iniciar servidor** — `pawnpro.server.start`
- **Parar servidor** — `pawnpro.server.stop`
- **Reiniciar servidor** — `pawnpro.server.restart`
- **Editar configuração do servidor** — abre `server.cfg` (SA-MP) ou `config.json` (open.mp) conforme `server.type` configurado (ou detectado automaticamente)
- **Novo Gamemode** — `pawnpro.newScript` com kind `gamemode`
- **Novo Filterscript** — `pawnpro.newScript` com kind `filterscript`
- **Novo Include** — `pawnpro.newScript` com kind `include`

> Os comandos `pawnpro.server.show` e `pawnpro.server.showLog` **não aparecem** no menu da status bar — estão disponíveis apenas nos botões do header do painel **Servidor** na barra lateral e pela paleta de comandos.

> `pawnpro.findReferences` é um comando interno usado pelo CodeLens do motor LSP; não aparece na paleta de comandos nem possui entrada em `package.json contributes.commands`.
