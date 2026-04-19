# Comandos

Os comandos do PawnPro podem ser executados pela paleta de comandos (`Ctrl+Shift+P`) ou pelos atalhos indicados.

## Compilação

| Comando | Atalho | Descrição |
|---------|--------|-----------|
| `pawnpro.compileCurrent` | `Ctrl+Alt+B` | Compila o arquivo `.pwn` aberto |
| `pawnpro.detectCompiler` | — | Detecta o `pawncc` automaticamente no workspace |

## Servidor

| Comando | Descrição |
|---------|-----------|
| `pawnpro.server.start` | Inicia o servidor SA-MP / open.mp |
| `pawnpro.server.stop` | Para o servidor |
| `pawnpro.server.restart` | Reinicia o servidor |
| `pawnpro.server.show` | Exibe o painel de saída do servidor |
| `pawnpro.server.showLog` | Exibe o log do servidor |

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

## Outros

| Comando | Descrição |
|---------|-----------|
| `pawnpro.whatsNew` | Abre o painel "O que há de novo" |

---

## Status bar

O item `PawnPro` na barra de status inferior abre um menu rápido com:

- **Reiniciar motor** — reinicia o servidor LSP e limpa o cache
- **Abrir `.pawnpro/config.json`** — cria o arquivo se necessário e abre no editor
- **Iniciar / Parar / Reiniciar servidor** — controles do servidor SA-MP / open.mp
- **Editar configuração do servidor** — abre `server.cfg` (SA-MP) ou `config.json` (open.mp)
- **Novo Gamemode / Filterscript / Include** — cria scripts a partir dos templates embutidos; variantes OMP e SA-MP disponíveis (filtradas pela plataforma configurada)
