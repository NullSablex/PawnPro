<div align="center">
  <img src="images/logo.png" alt="PawnPro" />

  [![VS Marketplace](https://vsmarketplacebadges.dev/version-short/NullSablex.pawnpro.png?style=flat-square&logo=visual-studio-code&label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=NullSablex.pawnpro)
  [![Installs](https://vsmarketplacebadges.dev/installs-short/NullSablex.pawnpro.png?style=flat-square&label=Marketplace%20Installs)](https://marketplace.visualstudio.com/items?itemName=NullSablex.pawnpro)
  [![Rating](https://vsmarketplacebadges.dev/rating-short/NullSablex.pawnpro.png?style=flat-square&label=Marketplace%20Rating)](https://marketplace.visualstudio.com/items?itemName=NullSablex.pawnpro)
  [![Open VSX](https://img.shields.io/open-vsx/v/NullSablex/pawnpro?style=flat-square&label=Open%20VSX)](https://open-vsx.org/extension/NullSablex/pawnpro)
  [![Open VSX Rating](https://img.shields.io/open-vsx/rating/NullSablex/pawnpro?style=flat-square&label=Open%20VSX%20Rating)](https://open-vsx.org/extension/NullSablex/pawnpro)
  [![CI](https://img.shields.io/github/actions/workflow/status/NullSablex/PawnPro/publish.yml?style=flat-square&label=CI)](https://github.com/NullSablex/PawnPro/actions)
  [![CodeQL](https://img.shields.io/github/actions/workflow/status/NullSablex/PawnPro/codeql.yml?style=flat-square&label=CodeQL&logo=github)](https://github.com/NullSablex/PawnPro/actions/workflows/codeql.yml)
  [![License](https://img.shields.io/badge/licença-Source--Available-blue?style=flat-square)](LICENSE.md)

  ![Windows x64](https://img.shields.io/badge/Windows-x64-0078D4?style=flat-square&logo=windows11&logoColor=white)
  ![Linux x64](https://img.shields.io/badge/Linux-x64%20·%20arm64-FCC624?style=flat-square&logo=linux&logoColor=black)
  ![macOS x64](https://img.shields.io/badge/macOS-x64%20·%20arm64-000000?style=flat-square&logo=apple&logoColor=white)
</div>

Extensão moderna para desenvolver **Pawn** no Visual Studio Code — com motor IntelliSense em Rust, diagnósticos precisos, compilação rápida, CodeLens com referências, snippets, painel de includes e controles de servidor SA-MP / open.mp.

## Recursos

- **IntelliSense completo** — auto-complete, hover, signature help, CodeLens e coloração semântica para Pawn, incluindo todos os includes transitivos.
- **Diagnósticos** — 13 códigos `PP####` cobrindo erros de estrutura, símbolos não declarados, código morto e depreciação (ver [docs/features.md](docs/features.md)).
- **Compilação** — `Ctrl+Alt+B` compila o `.pwn` ativo; detecção automática do `pawncc`.
- **Servidor SA-MP / open.mp** — Start, Stop, Restart e envio de comandos RCON direto do editor.
- **Templates** — cria Gamemode, Filterscript ou Include a partir de templates do projeto via status bar.
- **Temas de sintaxe** — esquemas clássico e moderno (claro/escuro) com aplicação automática.
- **Motor Rust LSP** — análise nativa via [pawnpro-engine](https://github.com/NullSablex/PawnPro-Engine); recua para TypeScript se o binário não estiver presente.

## Configuração

As configurações são gerenciadas por arquivos JSON independentes do VS Code:

| Arquivo | Escopo |
|---------|--------|
| `~/.pawnpro/config.json` | Global |
| `.pawnpro/config.json` | Projeto |

Acesse rapidamente o arquivo de projeto pelo item **PawnPro** na barra de status.

Para a referência completa de chaves de configuração, consulte [docs/configuration.md](docs/configuration.md).  
Para a lista de comandos disponíveis, consulte [docs/commands.md](docs/commands.md).

## Notas

- Caminhos com espaços devem ser escritos entre aspas.
- Firewalls/antivírus podem bloquear o tráfego RCON (UDP) — libere a porta local se necessário.

## Licença

PawnPro License v1.0 — Source-Available (não Open Source).  
Uso pessoal e comercial permitido ✅ · Redistribuição e venda proibidas ❌ · Detalhes: [LICENSE.md](LICENSE.md)

---
