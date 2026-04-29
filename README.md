<div align="center">
  <img src="images/logo.png" alt="PawnPro" />

  [![VS Marketplace](https://vsmarketplacebadges.dev/version-short/NullSablex.pawnpro.png?style=flat-square&logo=visual-studio-code&label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=NullSablex.pawnpro)
  [![Installs](https://vsmarketplacebadges.dev/installs-short/NullSablex.pawnpro.png?style=flat-square&label=Marketplace%20Installs)](https://marketplace.visualstudio.com/items?itemName=NullSablex.pawnpro)
  [![Rating](https://vsmarketplacebadges.dev/rating-short/NullSablex.pawnpro.png?style=flat-square&label=Marketplace%20Rating)](https://marketplace.visualstudio.com/items?itemName=NullSablex.pawnpro)
  [![Open VSX](https://img.shields.io/open-vsx/v/NullSablex/pawnpro?style=flat-square&label=Open%20VSX)](https://open-vsx.org/extension/NullSablex/pawnpro)
  [![Open VSX Rating](https://img.shields.io/open-vsx/rating/NullSablex/pawnpro?style=flat-square&label=Open%20VSX%20Rating)](https://open-vsx.org/extension/NullSablex/pawnpro)
  [![CI](https://img.shields.io/github/actions/workflow/status/NullSablex/PawnPro/publish.yml?style=flat-square&label=CI)](https://github.com/NullSablex/PawnPro/actions)
  [![CodeQL](https://img.shields.io/github/actions/workflow/status/NullSablex/PawnPro/codeql.yml?style=flat-square&logo=github&label=CodeQL)](https://github.com/NullSablex/PawnPro/actions/workflows/codeql.yml)
  [![License](https://img.shields.io/badge/licença-Source--Available-blue?style=flat-square)](LICENSE.md)

  ![Windows x64](https://img.shields.io/badge/Windows-x64-0078D4?style=flat-square&logo=windows11&logoColor=white)
  ![Linux x64](https://img.shields.io/badge/Linux-x64%20·%20arm64-FCC624?style=flat-square&logo=linux&logoColor=black)
  ![macOS x64](https://img.shields.io/badge/macOS-x64%20·%20arm64-000000?style=flat-square&logo=apple&logoColor=white)
</div>

Extensão para desenvolver **Pawn** no Visual Studio Code — motor IntelliSense nativo em Rust, 13 diagnósticos `PP####`, compilação com `Ctrl+Alt+B`, CodeLens com referências, snippets e controles de servidor SA-MP / open.mp.

## Recursos

- **IntelliSense completo** — auto-complete, hover, signature help, CodeLens e coloração semântica para Pawn, cobrindo todos os includes transitivos.
- **Diagnósticos** — 13 códigos `PP####` para includes não encontrados, erros estruturais, código morto, depreciação e mais (ver [docs/features.md](docs/features.md)).
- **Compilação** — `Ctrl+Alt+B` compila o `.pwn` ativo; detecção automática do `pawncc` via `$PAWNCC`, `$PATH` e subdiretórios do workspace.
- **Servidor SA-MP / open.mp** — Start, Stop, Restart e envio de comandos RCON pelo terminal integrado; painel lateral com histórico (até 200 entradas) e favoritos.
- **Templates** — Gamemode e Filterscript (open.mp e SA-MP) e Include (open.mp), filtrados pela plataforma configurada.
- **Painel de configurações** — interface gráfica acessível por `PawnPro: Configurações`; todas as opções editáveis sem tocar em JSON.
- **Temas de sintaxe** — cinco esquemas (`auto`, `classic_white`, `classic_dark`, `modern_white`, `modern_dark`) com reaplicação automática ao trocar o tema do editor.
- **Motor Rust LSP** — análise nativa via [pawnpro-engine](https://github.com/NullSablex/PawnPro-Engine); iniciado automaticamente se o binário estiver presente em `engines/`.
- **Suporte a `.pwn`, `.inc`, `.p` e `.pawn`** — todos os arquivos Pawn recebem IntelliSense e diagnósticos.

## Configuração

As configurações são gerenciadas por arquivos JSON independentes do editor:

| Arquivo | Escopo |
|---------|--------|
| `~/.pawnpro/config.json` | Global (todos os projetos) |
| `.pawnpro/config.json` | Projeto (sobrescreve global) |
| `.pawnpro/state.json` | Estado local (favoritos, histórico do servidor) |

Acesse o painel de configurações pelo item **PawnPro** na barra de status → **Configurações**, ou pelo comando `PawnPro: Configurações` na paleta de comandos.

Para a referência completa de chaves, consulte [docs/configuration.md](docs/configuration.md).  
Para a lista de comandos, consulte [docs/commands.md](docs/commands.md).

## Notas

- O monitoramento de log do servidor funciona apenas em **Linux e macOS**.
- Firewalls/antivírus podem bloquear tráfego RCON (UDP) — libere a porta local se necessário.
- `${workspaceFolder}` é substituído automaticamente em caminhos de configuração.

## Licença

PawnPro License v1.0 — Source-Available (não Open Source).  
Uso pessoal e comercial permitido ✅ · Redistribuição e venda proibidas ❌ · Detalhes: [LICENSE.md](LICENSE.md)

---
