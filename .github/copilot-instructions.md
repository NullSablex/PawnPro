# Copilot Instructions — PawnPro Extension

Extensão para a linguagem **Pawn** (SA-MP / open.mp). A lógica nativa vive no
núcleo `pawnpro-core` (Rust, repositório `NullSablex/PawnPro-Core`).

## Arquitetura

- `src/core/` — TypeScript sem `vscode`: cliente do núcleo (`client.ts`) e os
  módulos que ainda não migraram para ele.
- `src/editor/` — adaptação às APIs do editor.
- `assets-src/` — CSS/JS das WebViews. `l10n/` — traduções de runtime.
- O núcleo roda um processo por janela, JSON-RPC 2.0 pelo stdio. Ele hospeda a
  engine LSP (`engine.start` devolve o endereço de um soquete local) e entrega a
  ela a configuração — a engine ignora `initializationOptions`.

## Regras absolutas

- **Identificadores em inglês, comentários em português** — inclusive nomes de
  teste, ids/classes das WebViews e chaves de mensagem.
- **Nunca importar `vscode` em `src/core/`.** Interfaces em `core/types.ts`,
  injetadas via `editor/`.
- **Mensagens ao usuário sempre via `src/editor/nls.ts`.** Nunca mencionar
  "VS Code", "Copilot" ou outra marca de produto em texto visível — use
  "editor", "assistente".
- **Configuração via `PawnProConfigManager`**, em `.pawnpro/config.json`. Não
  há chaves em `contributes.configuration`.
- **Sem `any`** — `unknown` com narrowing, ou `Record<string, unknown>`.
- **Promises sempre com `await` ou `void`.**
- **Comentário só para o porquê**, nunca o óbvio.
- **WebViews sem atributo de evento** (`onclick=`…): o CSP com nonce os bloqueia.
  Use `data-on`/`data-action` com delegação no script da página.

## Comandos

```bash
npm run compile        # type-check
npm test               # testes em src/core/__tests__/
npm run bundle         # esbuild → out/editor/extension.js
npm run package:full   # VSIX com os binários de engines/
```

## Gotchas

- HTML/CSS das WebViews vivem em template literal: sem crase em comentário, e
  barra invertida de regex dobrada.
- Temas gravam em `ConfigurationTarget.Global`.
- A pasta da camada de editor é `src/editor/` — nunca `src/vscode/`.
- `core/server.ts` tem `stripQuotes()` — não recriar em `editor/`.
