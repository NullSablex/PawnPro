# Copilot Instructions — PawnPro Extension

## Contexto

Extensão VS Code para Pawn (SA-MP / open.mp). TypeScript com arquitetura em duas camadas:

- `src/core/` — lógica pura, zero imports de `vscode`
- `src/vscode/` — adaptação para APIs do VS Code

Motor de análise externo em Rust (`pawnpro-engine`) comunicado via LSP.

## Regras de código

- Nunca importar `vscode` em `src/core/`. Expor interfaces em `types.ts` e injetar via `vscode/`.
- Mensagens ao usuário sempre via `src/vscode/nls.ts` usando `vscode-nls`. Nunca strings hardcoded.
- Configuração sempre lida via `PawnProConfigManager`. Nunca `vscode.workspace.getConfiguration` fora de `configBridge.ts`.
- Sem `any` — usar tipos precisos ou `unknown` com narrowing.
- Sem comentários óbvios. Apenas comentários que explicam *por quê*.
- Erros de `async` sempre com `void` ou `await` — nunca promises flutuando sem tratamento.

## Arquivos principais

- `src/core/types.ts` — todos os tipos: `PawnProConfig`, `ServerConfig`, `HoverData`, etc.
- `src/core/config.ts` — `PawnProConfigManager` com deep merge e file watching
- `src/vscode/extension.ts` — entry point `activate`/`deactivate`
- `src/vscode/lspClient.ts` — inicialização e comunicação com o motor Rust
- `src/vscode/nls.ts` — strings localizadas (PT-BR padrão, EN via `package.nls.en.json`)
- `src/vscode/configBridge.ts` — ponte entre VS Code settings e `PawnProConfigManager`

## Configuração do projeto

Configurações em `.pawnpro/config.json` (projeto) e `~/.pawnpro/config.json` (global). A única chave em `contributes.configuration` é `pawnpro.ui.separateContainer`.

## Build

```bash
bash scripts/build.sh
```

## Diagnósticos do motor (PP0001–PP0013)

Ver `docs/features.md` para a tabela completa. Os diagnósticos são emitidos pelo processo Rust externo via LSP.
