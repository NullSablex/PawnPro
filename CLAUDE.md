# PawnPro — Guia para Agentes de IA

Extensão para a linguagem **Pawn** (SA-MP / open.mp). A lógica nativa vive no
núcleo [`pawnpro-core`](https://github.com/NullSablex/PawnPro-Core), repositório
irmão em `../pawnpro-core/` (Rust).

## Arquitetura

```
src/core/     TypeScript sem `vscode`: cliente do núcleo e a apresentação que fica em TS
src/editor/   adaptação às APIs do editor (comandos, WebViews, LSP, terminal)
assets-src/   CSS/JS das WebViews (minificados para out/assets/ pelo bundle)
l10n/         bundles de tradução em runtime (chave = texto PT)
bin/          binários nativos empacotados no VSIX (pawnpro-core-<plataforma>)
```

- **Núcleo:** um processo por janela, JSON-RPC 2.0 pelo stdio, uma mensagem por
  linha (`src/core/client.ts` — `startCore`, `request`, `onNotification`). É dono
  dos processos do servidor, do RCON, do log de diagnóstico e da configuração da
  engine. `core.version` lista os métodos que a versão em execução atende.
- **Um soquete só no núcleo** (Unix; named pipe no Windows) atende LSP, DAP e o
  plugin do servidor. Cada conexão manda na primeira linha
  `PAWNPRO/1 <canal> [id]` (`connectChannel` em `src/core/channel.ts`).
- **Engine (LSP):** biblioteca dentro do núcleo (`crates/engine`), não um
  binário próprio. `startLspClient` pede `engine.start` e conecta no canal
  `lsp`.
- **A configuração é do núcleo.** Ele lê, mescla e grava os `config.json` e as
  listas `.ban`/`.allow`, observa os arquivos e entrega à engine sozinho — a
  engine ignora `initializationOptions` de propósito. A extensão fala com ele
  por `config.*` e recebe cada mudança pela notificação `config.changed`.
- **O estado local também é do núcleo** (`state.get`/`state.updateServer`). A
  fachada em `state.ts` grava de forma otimista: o cache muda na hora e a
  resposta do núcleo não o sobrescreve.
- **O compilador é do núcleo.** `compiler.buildArgs` monta a linha de comando
  com a configuração do projeto aberto, e `compiler.run` executa em segundo
  plano, sem prender as outras requisições — por isso `runCompile` não tem
  prazo no cliente.
- **Servidor pelo núcleo:** `server.resolve` (executável, argumentos, cwd, log),
  `server.readLog` (leitura incremental já decodificada; o `LogTailer` só guarda
  a posição), `server.sensitiveCommands` (filtro do histórico), além de RCON,
  portas e processos.
- **Ficam em TS por decisão, não por atraso:** `colors.ts`, `themes.ts`,
  `accent.ts` e `uiLocale.ts`. São apresentação do editor — CSS das páginas,
  `tokenColorCustomizations`, bundles `l10n/` que a própria extensão distribui.
  Migrá-los faria a geração das WebViews esperar RPC e o núcleo ler arquivos da
  extensão. As cópias em Rust foram removidas; o núcleo guarda só os enums
  `AccentColor` e `Scheme`, para validar a configuração.
- **Os includes são do núcleo** (`includes.*`): raízes, varredura de `.inc`,
  natives e SDK. As raízes saem de uma função só (`include_paths_for` em
  `project/includes.rs`), usada pela engine, pela compilação e pela árvore de
  includes; o aviso de SDK ausente usa o mesmo cálculo que entrega o SDK à
  engine.
- **Depurador:** o adaptador DAP vive no núcleo (`crates/debugger/adapter`).
  `debug.start` devolve o endereço, e `SocketDebugAdapter` repassa o DAP pelo
  canal `dap`. A sessão no núcleo sobe e derruba o servidor; o plugin
  (`crates/debugger/plugin`) conecta no mesmo soquete. A barra de progresso do
  ciclo é decidida por `DebugCycle` (`src/core/debugCycle.ts`). Fluxos em
  `docs/server-panel-flow.md`.
- **Também do núcleo:** a seção do changelog em "O que há de novo"
  (`project.changelogSection`) e as listas de nomes da configuração
  (`config.inlineNamingLists`).

## Comandos

| Comando | O quê |
|---|---|
| `npm run compile` | Type-check (`tsc --noEmit`) |
| `npm test` | Testes `node --test` em `src/core/__tests__/` |
| `npm run bundle` | esbuild → `out/editor/extension.js` + assets minificados |
| `npm run package:full` | bundle + VSIX + injeta `bin/` (não baixa nada) |
| `bash scripts/build.sh` | build completo **com download** do núcleo publicado |

## Regras absolutas

- **Identificadores em inglês, comentários em português.** Vale para funções,
  variáveis, tipos, nomes de teste, ids/classes das WebViews e chaves de
  mensagem. Textos ao usuário ficam em português no `nls.ts`.
- **Nunca importar `vscode` em `src/core/`.** Exponha uma interface em
  `core/types.ts` e injete via `editor/`.
- **Mensagens ao usuário sempre via `src/editor/nls.ts`**, nunca string solta.
  Nunca mencionar "VS Code" nelas — use "editor".
- **Configuração via `PawnProConfigManager`** (`getConfig()` do
  `configBridge.ts`). A extensão não contribui chaves em
  `contributes.configuration`: tudo fica em `.pawnpro/config.json`.
- **Nunca usar `any`.** `unknown` com narrowing, ou `Record<string, unknown>`.
- **Comentário só para o porquê** — restrição oculta, invariante, armadilha.
- **WebViews sem atributo de evento** (`onclick=`…): o CSP com nonce os bloqueia
  em silêncio. Controles declaram `data-on`/`data-action`/`data-set` e o script
  da página liga por delegação. `src/core/__tests__/webviews.test.ts` trava isso.

## Configuração

```
~/.pawnpro/config.json   global
.pawnpro/config.json     projeto (sobrescreve o global)
.pawnpro/state.json      estado local (favoritos, histórico)
.pawnpro/logs/           diagnóstico (desligado por padrão)
```

`PawnProConfigManager` (`src/core/config.ts`) é fachada sobre o núcleo: as
leituras (`getAll`, `get`) saem de um cache síncrono; as escritas (`set`,
`setKey`, `deleteKey`, `reload`) são assíncronas e **precisam de `await`**
quando o código seguinte lê a configuração. O núcleo notifica a mudança antes
de responder ao pedido: terminado o `await`, o cache já está atualizado, e o
`onChange` dispara uma vez por mudança.

Sem núcleo, valem os `DEFAULTS` de `config.ts` e toda gravação é recusada
(`ConfigUnavailableError`). `config.test.ts` exige que esses padrões sejam
iguais aos do núcleo.

## Idiomas

- `locale` (config) → engine e depurador, via `resolveLocale`.
- `ui.locale` → páginas WebView, via `createWebviewMsg` (`webviewNls.ts`).
- `msg` padrão (`vscode.l10n`) segue o idioma do editor e serve notificações,
  menus e status bar. O `vscode.l10n` não troca em runtime, por isso as WebViews
  têm o tradutor próprio sobre os mesmos bundles de `l10n/`.
- Manifesto: `package.nls.<code>.json` na raiz. Idiomas: pt-BR, en, es, ro, ru.

## Build local sem release do núcleo

`build.sh` baixa o núcleo da release de `coreVersion`: sem release dá 404; com
uma antiga, **sobrescreve o binário local** e o VSIX sai com o núcleo errado.
Nesse caso:

```bash
cd ../pawnpro-core && cargo build --release -p pawnpro-core
install -m 755 target/release/pawnpro-core ../pawnpro/bin/pawnpro-core-linux-x64
cargo about generate --fail -m crates/core/Cargo.toml about.hbs -o ../pawnpro/bin/pawnpro-core-THIRD-PARTY.txt
cd ../pawnpro && npm run package:full
```

Conferir o SHA-256 em `target/release`, em `bin/` e dentro do `.vsix` — os
três têm de bater. O `repack-vsix.js` recusa empacotar o core sem o
`pawnpro-core-THIRD-PARTY.txt` (gerado com `cargo install cargo-about --features cli`).

## Gotchas

- **WebView:** HTML/CSS vivem em template literal — crase em comentário quebra a
  compilação, e barra invertida em regex precisa ser dobrada. Ao depurar,
  conferir o bundle gerado, não o fonte.
- **WebView:** `--vscode-*` não se redefine (vêm inline no `<html>`); use as
  variáveis `--pp-*` (`--pp-accent`, `--pp-accent-fg`, `--pp-accent-hover`). `[hidden]` precisa de
  `display:none !important`.
- O tail do log do servidor não roda no Windows (`IS_WINDOWS` em `editor/server.ts`).
- Temas gravam em `ConfigurationTarget.Global`, para não criar `.vscode/settings.json`.
- Escolher um esquema pelo comando grava `applyOnStartup: true`.
- `core/server.ts` tem `stripQuotes()` — não recriar em `editor/`.
- A linguagem TOML mapeia o filename `package.lock` de propósito (projeto open-sa).
