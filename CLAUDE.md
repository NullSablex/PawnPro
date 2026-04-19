# PawnPro — Guia para Agentes de IA

## O que é este projeto

Extensão VS Code para a linguagem **Pawn** (SA-MP / open.mp). Divide-se em duas camadas:

- **`src/core/`** — lógica pura TypeScript, zero imports de `vscode`. Pode ser testada fora do VS Code.
- **`src/vscode/`** — camada de adaptação: conecta `core/` às APIs do VS Code.

O motor de análise principal é um processo externo em Rust: [`pawnpro-engine`](https://github.com/NullSablex/PawnPro-Engine), comunicado via LSP. A extensão inicia o motor automaticamente se o binário estiver presente em `engines/` ou no repositório irmão `../pawnpro-engine/target/`.

---

## Regras absolutas

- **Nunca importar `vscode` em `src/core/`**. Se precisar de algo do VS Code, exponha uma interface em `core/types.ts` e injete via `vscode/`.
- **Nunca escrever comentários óbvios**. Apenas comentários que explicam *por quê* — restrições ocultas, invariantes sutis, workarounds de bugs específicos.
- **Mensagens ao usuário sempre via `src/vscode/nls.ts`**. Nunca strings hardcoded em outros arquivos.
- **Configuração sempre via `PawnProConfigManager`**. Nunca ler `vscode.workspace.getConfiguration('pawnpro')` diretamente fora de `configBridge.ts`.
- **`pawnpro.ui.separateContainer` é a única chave em `contributes.configuration`**. Todas as outras ficam em `.pawnpro/config.json`.

---

## Arquitetura de configuração

```
~/.pawnpro/config.json       ← global (todos os projetos)
.pawnpro/config.json         ← projeto (sobrescreve global)
.pawnpro/state.json          ← estado local (favoritos, histórico)
```

`PawnProConfigManager` (`src/core/config.ts`) faz deep merge: projeto sobrescreve global, que sobrescreve defaults. A chave `deepMerge` bloqueia `__proto__`, `constructor`, `prototype`.

`${workspaceFolder}` em strings de config é substituído em runtime por `substituteWorkspace()`.

---

## Arquivos-chave

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/core/types.ts` | Todos os tipos compartilhados — `PawnProConfig`, `ServerConfig`, `HoverData`, etc. |
| `src/core/config.ts` | `PawnProConfigManager` — leitura, merge, watch, `onChange` |
| `src/core/state.ts` | `PawnProStateManager` — favoritos e histórico do servidor |
| `src/core/server.ts` | `LogTailer`, `SampRconClient`, detecção de executável, leitura de `server.cfg`/`config.json` |
| `src/core/includes.ts` | `buildIncludePaths`, `resolveInclude`, `listIncFilesRecursive`, `listNatives` |
| `src/core/themes.ts` | `AVAILABLE_SCHEMES`, `readSchemeFromFile`, `mergeTokenColors`, `pickAutoScheme` |
| `src/vscode/extension.ts` | Entry point — `activate` / `deactivate` |
| `src/vscode/configBridge.ts` | Inicializa config/state, watch de arquivos, migração de settings legados |
| `src/vscode/lspClient.ts` | `startLspClient`, `stopLspClient`, `restartLspClient`, `sendConfigurationToEngine` |
| `src/vscode/nls.ts` | Todas as strings localizadas via `vscode-nls` |
| `src/vscode/statusBar.ts` | Menu rápido da status bar |
| `src/vscode/server.ts` | `ServerController` (terminal + RCON + log tail) + `ServerViewProvider` (WebView) |
| `src/vscode/templates.ts` | Criação de scripts a partir de templates embutidos |
| `src/vscode/themes.ts` | Comandos `applySyntaxScheme` / `resetSyntaxScheme` |

---

## Motor LSP (pawnpro-engine)

O motor recebe configuração via `initializationOptions` no `initialize` LSP:

```json
{
  "workspaceFolder": "/caminho/do/projeto",
  "includePaths": ["/caminho/pawno/include"],
  "warnUnusedInInc": false,
  "sdkFilePath": "/caminho/open.mp.inc"
}
```

Atualizações em tempo real via `workspace/didChangeConfiguration` (função `sendConfigurationToEngine` em `lspClient.ts`).

O binário é procurado em:
1. `context.extensionPath/engines/pawnpro-engine-{platform}-{arch}[.exe]`
2. `../pawnpro-engine/target/debug/pawnpro-engine[.exe]`
3. `../pawnpro-engine/target/release/pawnpro-engine[.exe]`

---

## Internacionalização

Todas as mensagens visíveis ao usuário ficam em `src/vscode/nls.ts` usando `vscode-nls`. Os arquivos de tradução são:

- `package.nls.json` — PT-BR (padrão)
- `package.nls.en.json` — EN

Ao adicionar uma nova mensagem: adicione em `nls.ts`, adicione a chave em ambos os arquivos NLS se for mensagem de `package.json`, ou use `localize('chave', 'texto padrão')` diretamente em `nls.ts`.

---

## Build

```bash
bash scripts/build.sh
```

Isso executa `npx tsc`, depois `node scripts/bundle.mjs` (esbuild), depois `repack-vsix.js` (embute `iconv-lite`, `safer-buffer`, `vscode-nls`).

Compilar só TypeScript:
```bash
npx tsc -p .
```

O output vai para `out/core/` e `out/vscode/`.

---

## Diagnósticos conhecidos do motor

Ver [docs/features.md](docs/features.md) para a tabela completa de códigos PP0001–PP0013.

---

## Gotchas

- `deepMerge` em `config.ts` precisa de `as unknown as Record<string, unknown>` nos casts de `PawnProConfig`.
- Callback de `fs.watch` precisa de tipos explícitos: `(_: string, filename: string | null)`.
- Temas usam `ConfigurationTarget.Global` (não `Workspace`) para não criar `.vscode/settings.json`.
- O tail de log do servidor só funciona em Linux e macOS (`!IS_WINDOWS`).
- `pawnpro.cacheStats` foi removido — não registrar handler para ele.
- Ao alterar `syntax.scheme` via comando, `applyOnStartup` é automaticamente definido como `true` pela extensão.
