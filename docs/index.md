<div align="center" markdown>

![PawnPro](logo.png)

[![VS Marketplace](https://vsmarketplacebadges.dev/version-short/NullSablex.pawnpro.png?style=flat-square&logo=visual-studio-code&label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=NullSablex.pawnpro)
[![Installs](https://vsmarketplacebadges.dev/installs-short/NullSablex.pawnpro.png?style=flat-square&label=Marketplace%20Installs)](https://marketplace.visualstudio.com/items?itemName=NullSablex.pawnpro)
[![Rating](https://vsmarketplacebadges.dev/rating-short/NullSablex.pawnpro.png?style=flat-square&label=Marketplace%20Rating)](https://marketplace.visualstudio.com/items?itemName=NullSablex.pawnpro)
[![Open VSX](https://img.shields.io/open-vsx/v/NullSablex/pawnpro?style=flat-square&label=Open%20VSX)](https://open-vsx.org/extension/NullSablex/pawnpro)
[![Open VSX Rating](https://img.shields.io/open-vsx/rating/NullSablex/pawnpro?style=flat-square&label=Open%20VSX%20Rating)](https://open-vsx.org/extension/NullSablex/pawnpro)
[![CI](https://img.shields.io/github/actions/workflow/status/NullSablex/PawnPro/publish.yml?style=flat-square&label=CI)](https://github.com/NullSablex/PawnPro/actions)
[![CodeQL](https://img.shields.io/github/actions/workflow/status/NullSablex/PawnPro/codeql.yml?style=flat-square&label=CodeQL&logo=github)](https://github.com/NullSablex/PawnPro/actions/workflows/codeql.yml)
[![License](https://img.shields.io/badge/licença-Source--Available-blue?style=flat-square)](https://github.com/NullSablex/PawnPro/blob/master/LICENSE.md)

![Windows x64](https://img.shields.io/badge/Windows-x64-0078D4?style=flat-square&logo=windows11&logoColor=white)
![Linux x64](https://img.shields.io/badge/Linux-x64%20·%20arm64-FCC624?style=flat-square&logo=linux&logoColor=black)
![macOS x64](https://img.shields.io/badge/macOS-x64%20·%20arm64-000000?style=flat-square&logo=apple&logoColor=white)

</div>

Extensão moderna para desenvolver **Pawn** — com motor IntelliSense em Rust, diagnósticos precisos, compilação rápida, CodeLens com referências, snippets, painel de includes e controles de servidor SA-MP / open.mp.

## Recursos

- **IntelliSense completo** — auto-complete, hover, signature help, CodeLens e coloração semântica para Pawn, incluindo todos os includes transitivos.
- **Diagnósticos** — 13 códigos `PP####` cobrindo erros de estrutura, símbolos não declarados, código morto e depreciação (ver [Recursos](features.md)).
- **Compilação** — `Ctrl+Alt+B` compila o `.pwn` ativo; detecção automática do `pawncc`.
- **Servidor SA-MP / open.mp** — Start, Stop, Restart e envio de comandos RCON direto do editor.
- **Templates** — cria Gamemode e Filterscript (open.mp e SA-MP) e Include (open.mp) a partir de templates embutidos via status bar; filtra pela plataforma configurada.
- **Painel de configurações** — interface gráfica (`pawnpro.openSettings`) para editar todas as configurações sem editar JSON manualmente.
- **Temas de sintaxe** — cinco esquemas (`auto`, `classic_white`, `classic_dark`, `modern_white`, `modern_dark`) com aplicação automática ao trocar o tema do editor.
- **Motor Rust LSP** — análise nativa via [pawnpro-engine](https://github.com/NullSablex/PawnPro-Engine); iniciado automaticamente se o binário estiver presente.
- **Suporte a `.pwn`, `.inc`, `.p` e `.pawn`** — todos os arquivos Pawn recebem IntelliSense e diagnósticos.

## Configuração

As configurações são gerenciadas por arquivos JSON:

| Arquivo | Escopo |
|---------|--------|
| `~/.pawnpro/config.json` | Global |
| `.pawnpro/config.json` | Projeto |

Acesse rapidamente pelo item **PawnPro** na barra de status. Para a referência completa, consulte [Configuração](configuration.md).

## Licença

PawnPro License v1.0 — Source-Available (não Open Source).  
Uso pessoal e comercial permitido ✅ · Redistribuição e venda proibidas ❌ · Detalhes: [LICENSE.md](https://github.com/NullSablex/PawnPro/blob/master/LICENSE.md)
