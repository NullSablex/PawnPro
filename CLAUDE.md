# PawnPro — Guia para Agentes de IA

## O que é este projeto

Extensão para a linguagem **Pawn** (SA-MP / open.mp). Divide-se em duas camadas:

- **`src/core/`** — lógica pura TypeScript, zero imports de `vscode`. Testável fora do editor.
- **`src/editor/`** — camada de adaptação: conecta `core/` às APIs do editor.

O motor de análise é um processo externo em Rust: [`pawnpro-engine`](https://github.com/NullSablex/PawnPro-Engine), comunicado via LSP. A extensão inicia o motor automaticamente se o binário estiver presente.

---

## Regras absolutas

- **Nunca importar `vscode` em `src/core/`**. Se precisar de algo do editor, exponha uma interface em `core/types.ts` e injete via `editor/`.
- **Nunca escrever comentários óbvios**. Apenas comentários que explicam *por quê* — restrições ocultas, invariantes sutis, workarounds de bugs específicos.
- **Mensagens ao usuário sempre via `src/editor/nls.ts`**. Nunca strings hardcoded em outros arquivos.
- **Nunca mencionar "VS Code" em strings visíveis ao usuário**. Use "editor" ou equivalente neutro.
- **Configuração sempre via `PawnProConfigManager`**. Nunca ler `vscode.workspace.getConfiguration('pawnpro')` diretamente fora de `configBridge.ts`.
- **`pawnpro.ui.separateContainer` é a única chave em `contributes.configuration`**. Todas as outras ficam em `.pawnpro/config.json`.
- **Nunca usar `any`**. Use `unknown` com narrowing, ou `Record<string, unknown>` com acesso por chave string.

---

## Arquitetura de configuração

```
~/.pawnpro/config.json       ← global (todos os projetos)
.pawnpro/config.json         ← projeto (sobrescreve global)
.pawnpro/state.json          ← estado local (favoritos, histórico)
```

`PawnProConfigManager` (`src/core/config.ts`) faz deep merge: projeto sobrescreve global, que sobrescreve defaults. O `deepMerge` bloqueia `__proto__`, `constructor`, `prototype`.

`${workspaceFolder}` em strings de config é substituído em runtime por `substituteWorkspace()`.

Quando `setKey` é chamado, ele chama `reload()` internamente — isso já dispara os listeners `onChange`. O `fs.watch` / `createFileSystemWatcher` no `configBridge` também chama `reload()` com delay (latência do sistema de arquivos). Não adicionar debounce: a duplicação é inofensiva.

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
| `src/core/flags.ts` | `detectSupportedFlags`, `computeMinimalArgs` — introspecção de flags do compilador |
| `src/core/utils.ts` | `isPawnFile`, `pathExists`, `quoteIfNeeded`, `resolveInclude` |
| `src/editor/extension.ts` | Entry point — `activate` / `deactivate` |
| `src/editor/configBridge.ts` | Inicializa config/state, watchers de arquivo, dispara `sendConfigurationToEngine` no `onChange` |
| `src/editor/lspClient.ts` | `startLspClient`, `stopLspClient`, `restartLspClient`, `sendConfigurationToEngine` |
| `src/editor/nls.ts` | Todas as strings localizadas via `vscode-nls` |
| `src/editor/settingsView.ts` | WebView de configurações — `registerSettingsView` |
| `src/editor/serverView.ts` | `ServerViewProvider` — WebView do console do servidor |
| `src/editor/statusBar.ts` | Menu rápido da status bar |
| `src/editor/server.ts` | `ServerController` (terminal + RCON + log tail) |
| `src/editor/templates.ts` | Criação de scripts a partir de templates embutidos |
| `src/editor/themes.ts` | Comandos `applySyntaxScheme` / `resetSyntaxScheme` |

---

## Motor LSP (pawnpro-engine)

Repositório irmão em `../pawnpro-engine/` (Rust).

O motor recebe configuração via `initializationOptions` no `initialize` LSP:

```json
{
  "workspaceFolder": "/caminho/do/projeto",
  "includePaths": ["/caminho/pawno/include"],
  "warnUnusedInInc": false,
  "suppressDiagnosticsInInc": false,
  "sdkFilePath": "/caminho/open.mp.inc",
  "locale": "pt-BR"
}
```

Atualizações em tempo real via `workspace/didChangeConfiguration` — função `sendConfigurationToEngine` em `lspClient.ts`. Quando a configuração muda, a engine republica os diagnósticos de todos os arquivos abertos em paralelo (`join_all`).

O `restartLspClient` **recria o cliente LSP do zero** (stop + startLspClient com a config atual). Não usa `client.restart()` — que reenviaria as `initializationOptions` originais e perderia mudanças de config.

O locale é resolvido por `resolveLocale(cfg)`: usa `cfg.locale` se definido, senão `vscode.env.language`. A engine aceita qualquer string começando com `"pt"` como PT-BR; qualquer outra coisa vira EN.

O binário é procurado em:
1. `context.extensionPath/engines/pawnpro-engine-{platform}-{arch}[.exe]`
2. `../pawnpro-engine/target/debug/pawnpro-engine[.exe]`
3. `../pawnpro-engine/target/release/pawnpro-engine[.exe]`

**Build da engine:**
```bash
cd ../pawnpro-engine && cargo build --release
cp target/release/pawnpro-engine ../pawnpro/engines/pawnpro-engine-linux-x64
```

---

## Internacionalização

Todas as mensagens visíveis ao usuário ficam em `src/editor/nls.ts` usando `vscode-nls`. Os arquivos de tradução são:

- `package.nls.json` — PT-BR (padrão)
- `package.nls.en.json` — EN

Ao adicionar uma nova mensagem: adicione em `nls.ts` com `localize('chave', 'texto padrão')`. Se a chave também aparecer em `package.json` (ex: descrições de comandos/config), adicione em ambos os arquivos NLS.

---

## Build da extensão

```bash
bash scripts/build.sh
```

Executa `npx tsc`, depois `node scripts/bundle.mjs` (esbuild — gera `out/editor/extension.js` único), depois `repack-vsix.js` (embute `iconv-lite`, `safer-buffer`, `vscode-nls`).

Só TypeScript:
```bash
npx tsc -p .
```

Output: `out/core/` e `out/editor/`. O bundle esbuild sobrescreve o output do tsc em `out/editor/extension.js`.

---

## Empacotamento (VSIX)

O `.vscodeignore` exclui: `src/`, `scripts/`, `docs/`, `CLAUDE.md`, arquivos de governança do repositório (`SECURITY.md`, `SUPPORT.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`), `changelogs/`, `package-lock.json`, `*.vsix`, `node_modules/`.

O que vai no VSIX: `out/editor/extension.js`, `engines/`, `syntaxes/`, `templates/`, `snippets/`, `images/`, `language-configuration.json`, `package.json`, `package.nls*.json`, `README.md`, `CHANGELOG.md`, `LICENSE.md`.

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
- `open_docs` na engine guarda a chave como URI completa (`file:///...`). Nunca fazer `format!("file://{}", key)` — já tem o prefixo.
- `vscode.workspace.getConfiguration().get<T>()` retorna `T | undefined` — nunca usar `get<any>()`. Use `get<Record<string, unknown>>()` e acesse por chave string.
