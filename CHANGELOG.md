# Changelog
Todas as mudanças notáveis neste projeto serão documentadas aqui.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

Podem existir falhas ou itens não declarados, causados por falha humana ou por IA, caso encontre por favor relate para ajudar a manter a consistência dos dados.

## Versões anteriores

- [Versões 2.x e anteriores](changelogs/CHANGELOG_v2.md)

---

## [3.3.0] - 21/06/2026

### Adicionado
- **Formatação de código Pawn** — atalho `Ctrl+K Ctrl+F` (seleção) e formatação de documento completo, ambos servidos pelo provider de formatação da engine via LSP
- **Estilos de formatação configuráveis** — nova chave `format` em `.pawnpro/config.json` com os campos:
  - `preset` — `allman` (padrão), `knr`, `compact` ou `custom`
  - `braceStyle`, `spaceAroundOperators`, `emptyBlockSameLine` — ajustes finos aplicados no preset `custom`
- **Seção "Formatação" na página de configurações** — seleção de estilo por **cartões visuais**: cada cartão mostra um *preview* do código no estilo + o nome, funcionando como botão de seleção; os ajustes finos só aparecem no preset `custom`
- **Ícone na página de configurações** — o ícone da extensão passa a ser exibido ao lado do nome "PawnPro" no cabeçalho da navegação
- **Assistente de nomes (`PP0018`)** — nova seção **"Nomenclatura"** na página de configurações: ativar/desativar, comprimento mínimo, e **estilo por categoria com multi-seleção** (funções, globais, locais, constantes, macros, parâmetros), cada um com *preview* de código real (exemplos temáticos por categoria). Desligado por padrão. A engine reage em tempo real (sem reiniciar)
  - Estilos aceitos: `camelCase`, `snake_case`, `PascalCase`, `UPPER_CASE` e `Capitalized_Snake` (cada palavra capitalizada, com `_` opcional entre elas, ex.: `Carregar_Lixeiras` — engloba também os nomes `PascalCase` como `Palavrao`). A referência de cada convenção está documentada em "Nomenclaturas aceitas"
  - Os seletores de estilo ficam recolhidos numa seção expansível para reduzir o ruído visual; cada estilo é apresentado como *badge* em layout de duas colunas
- **Listas de nomes em arquivos** — nomes proibidos e índices de loop ficam em arquivos `.ban`/`.allow` editáveis (botão "Abrir arquivo" na página), com realce de sintaxe próprio. Limite de processamento configurável (padrão 32 MB)
- **Migração assistida** — botão que migra listas do formato antigo (inline no `config.json`) para os arquivos, com backup dos itens e confirmação por tamanho; comando **"PawnPro: Recuperar configuração grande"** para o caso de um `config.json` grande demais para ser lido
- **Mais idiomas** — esqueletos de tradução para **Espanhol, Russo e Romeno** (UI e mensagens), além de PT-BR e EN
- **Linguagem para as listas de nomes** — arquivos `.ban`/`.allow` são reconhecidos como uma linguagem própria (`pawnpro-namelist`), com gramática de realce (comentários `#` e termos) e configuração de comentário de linha
- **Biblioteca de Recursos (prévia)** — comando **"PawnPro: Biblioteca de Recursos"** abre uma vitrine para plugins/filterscripts/includes, com busca e alternância entre **lista e grade**. Nesta versão é uma prévia com catálogo de exemplo (sem instalação real); fontes previstas: catálogo próprio + `packages.open.mp`
- **Animação do título (opcional)** — nova opção `ui.animateTitle` (seção Interface) que anima as letras do título no topo das páginas (Configurações e Biblioteca), em sequência **teclado → bloco → cair**, em loop com pausa entre os ciclos. Desligada por padrão; respeita `prefers-reduced-motion`

### Corrigido
- **Página "O que há de novo"** — o renderizador de Markdown do changelog tinha três falhas: sub-itens indentados apareciam como texto cru com `-` (em vez de sublista), cabeçalhos `####` renderizavam com um `#` sobrando, e links `[texto](url)` não viravam links clicáveis. Além disso, cada seção (Adicionado, Corrigido, …) agora é **um único card** com seus itens em lista (e sub-itens recuados dentro), no lugar de um card por item
- **Ícone das abas das páginas** — as abas das páginas de Configurações e da Biblioteca de Recursos exibiam o ícone genérico de arquivo; passam a usar o ícone do PawnPro
- **Navegação da página de configurações** — ao clicar numa seção, o título não fica mais "colado" no topo (folga consistente via `scroll-margin`), e o vão no fim da página foi ajustado por um espaçador dinâmico (permite a última seção subir ao topo sem espaço vazio exagerado). Os itens do menu lateral deixaram de expor a âncora (`#secao`) ao passar o mouse — a navegação usa um alvo interno em vez de link de âncora

### Alterado
- **Campo "Caminho do compilador"** — fica oculto quando a **Detecção automática** está ligada (o caminho manual é irrelevante nesse modo: um caminho válido é usado, e um inválido/vazio cai na detecção). Só aparece para preenchimento manual quando a detecção está desligada
- **Engine atualizada para 1.2.0** (`engineVersion`) — assistente de nomes (`PP0018`), renomeação de símbolos, novos idiomas e o motor de formatação por estrutura. Ver o changelog da [pawnpro-engine](https://github.com/NullSablex/PawnPro-Engine)
- **Localização migrada para `vscode.l10n`** — as mensagens de runtime saíram do `vscode-nls` para a API nativa do editor; os bundles ficam em `l10n/`, fora da raiz
- **URL do site da documentação** — atualizada para `https://pawnpro.nullsablex.com/`

### Dependências
- **`vscode-languageclient` 9 → 10** — atualização do cliente LSP; o subpath de import passou de `vscode-languageclient/node.js` para `vscode-languageclient/node`
- **`esbuild` 0.28.0 → 0.28.1** (Dependabot, #25)
- **`@vscode/vsce` 3.9.1 → 3.9.2** e **`@types/node` 25.6 → 25.9.3** — atualizações de patch das ferramentas de build
- **`tmp` 0.2.5 → 0.2.7** e **`fast-uri` 3.0.6 → 3.1.2** (Dependabot, #23, #24)
- **Removido override obsoleto de `minimatch` 3.1.5** no `@vscode/vsce` — o vsce 3.9.2 exige `minimatch ^10`, e o override antigo quebrava o empacotamento
- **`vscode-nls` removido** das dependências — substituído pela API nativa `vscode.l10n`; **`@vscode/l10n-dev`** adicionado em devDependencies (extração dos bundles)

### Segurança
- **`qs` 6.14.2 → 6.15.2** (override) — corrige DoS remotamente acionável em `qs.stringify` ([GHSA-q8mj-m7cp-5q26](https://github.com/advisories/GHSA-q8mj-m7cp-5q26)); a versão fixada anterior ainda estava dentro da faixa vulnerável
- **`brace-expansion` → 5.0.6** (transitiva, via `minimatch` 10.2.3) — corrige DoS em que um intervalo numérico grande burla a proteção `max` ([GHSA-jxxr-4gwj-5jf2](https://github.com/advisories/GHSA-jxxr-4gwj-5jf2))
- **`markdown-it` 14.1.1 → 14.2.0** (override) — corrige DoS de complexidade quadrática na regra de *smartquotes* ([GHSA-6v5v-wf23-fmfq](https://github.com/advisories/GHSA-6v5v-wf23-fmfq)); a versão fixada anterior ainda estava na faixa vulnerável
- **`undici`** atualizado para a versão corrigida (transitiva das ferramentas de build) — resolve avisos incluindo dois de severidade alta (*bypass* de validação de certificado TLS e injeção de cabeçalho HTTP via `Set-Cookie`)
- Todas as dependências vulneráveis acima são de **build/empacotamento** — não entram no VSIX nem no runtime da extensão. Com o `package.json`/`package-lock.json` atualizados, os alertas do Dependabot ficam resolvidos e o `npm audit` reporta **0 vulnerabilidades**
- **OpenSSF Scorecard** — workflow `scorecard.yml` avaliando boas práticas de segurança do repositório
- **Teto de tamanho do `config.json`** — 32 MB, ignorado acima disto, evitando travar a extensão com um arquivo absurdo

### Outros
- Adicionado arquivo `CODEOWNERS`
- Badges de **Security** e **OpenSSF Scorecard** no README
- **Deploy da documentação por GitHub Actions** — o workflow `docs.yml` deixou de publicar pela branch `gh-pages` (`mkdocs gh-deploy`) e passou a usar o pipeline oficial de Pages (`actions/upload-pages-artifact` + `actions/deploy-pages`), sem `contents: write`. Continua disparando **apenas** quando `docs/**` ou `mkdocs.yml` mudam; build com `--strict` (falha em links quebrados)
- **Dependências de CI pinadas** — todas as GitHub Actions de todos os workflows são referenciadas por commit SHA (com a versão em comentário); o build instala dependências com `npm ci` (lockfile) e o deploy de docs usa `pip install --require-hashes` sobre um `docs/requirements.txt` com hash de cada dependência. Atende à boa prática de dependências pinadas do OpenSSF Scorecard
- **Documentação atualizada** — `features.md`, `configuration.md` e `commands.md` cobrem os novos recursos (formatação, assistente de nomes, renomeação, idiomas, listas `.ban`/`.allow`); navegação do site reorganizada em **Guia do usuário** e **Para desenvolvedores**, com guias de design do assistente de nomes
- **Descrição da release preenchida automaticamente** — ao publicar uma release, o `publish.yml` monta o corpo a partir da seção correspondente do `CHANGELOG.md` (mais o bloco de novos contribuidores e o link de comparação que o GitHub gera), sem depender de PRs/labels

---

## [3.2.1] - 29/04/2026

### Corrigido
- **Templates vazios com `platform: "auto"`** — o picker de novo script mostrava lista vazia em instalações padrão; `auto` agora é tratado como neutro e exibe todos os templates
- **Watcher LSP incompleto** — `workspace/didChangeWatchedFiles` só observava `*.pwn` e `*.inc`; expandido para `*.{pwn,inc,p,pawn}` para cobrir todas as extensões registradas na linguagem

---

## [3.2.0] - 29/04/2026

### Adicionado
- **`analysis.suppressDiagnosticsInInc`** — nova chave de configuração; suprime todos os diagnósticos dentro de arquivos `.inc` quando `true`
- **`locale`** — nova chave de configuração; define o idioma das mensagens de diagnóstico do motor LSP (`""` = automático, `"pt-BR"`, `"en"`)
- **`analysis.sdk.platform: "auto"`** — novo valor para detecção automática: busca `open.mp.inc` em `qawno/include/` e nos `includePaths`; assume SA-MP se não encontrar
- **Painel de configurações gráfico (`pawnpro.openSettings`)** — interface WebView substitui o bloco `contributes.configuration` nativo; edição visual de todas as chaves sem tocar em JSON
- **Suporte a `.p` e `.pawn`** — extensões adicionadas ao contributes da linguagem Pawn; IntelliSense e diagnósticos passam a cobrir esses arquivos
- **`src/editor/`** — nova pasta da camada de adaptação (renomeada de `src/vscode/`); isolamento completo entre lógica pura (`core/`) e APIs do editor

### Alterado
- **`analysis.sdk.platform`** — default alterado de `"omp"` para `"auto"`
- **`main` do pacote** — agora aponta para `./out/editor/extension.js` (reflete a renomeação da pasta)
- **`SdkPlatform`** — tipo expandido: `'auto' | 'omp' | 'samp' | 'none'`
- **`PawnProConfigManager`** — merge simplificado: camada `externalDefaults` (settings do VS Code) removida; merge direto de DEFAULTS → global → projeto
- **`AnalysisConfig`** — recebe `suppressDiagnosticsInInc` e `locale`
- **Tipos auxiliares removidos de `src/core/types.ts`** — `HoverData`, `HoverSection`, `HoverParams`, `DiagnosticData` (responsabilidade transferida integralmente ao motor Rust)

### Removido
- **`contributes.configuration`** — bloco inteiro removido do `package.json`; as chaves `pawnpro.*` nativas do VS Code não existem mais; todas as configurações vivem em `.pawnpro/config.json` / `~/.pawnpro/config.json`
- **`PawnProConfigManager.setExternalDefaults`** — método removido (não há mais sync com `vscode.workspace.getConfiguration`)
- **`PawnProConfigManager.hasProjectConfig` / `hasGlobalConfig`** — métodos auxiliares removidos
- **`src/vscode/`** — pasta inteiramente deletada; conteúdo migrado e refatorado em `src/editor/`
- **`src/core/utils.ts`** — removido; funções redistribuídas para os módulos que as usam

### Detalhe importante
- Podem haver alguns dados que não foram mencionados ou que foram esquecidos de serem adicionados a este arquivo, não intencionalmente mas sim pelo fator humano.

---

## [3.1.0] - 20/04/2026

### Adicionado
- **Configurações visíveis na UI do VS Code** — todas as opções da extensão agora aparecem na página de configurações do VS Code com descrições em português e inglês; alterações feitas pela UI são salvas automaticamente em `~/.pawnpro/config.json`

### Corrigido
- **Compilador não encontrava os includes** — o compilador não recebia os caminhos de include corretamente, causando erros de `#include` não encontrado mesmo com os arquivos presentes no projeto

### Removido
- **Opção "Container separado"** — o painel PawnPro agora é sempre exibido na Activity Bar

---

## [3.0.0] - 19/04/2026

### Adicionado

#### Motor IntelliSense (Rust LSP)
- **`pawnpro-engine`** — servidor LSP nativo em Rust integrado via stdin/stdout; detectado automaticamente em `engines/` ou no repositório irmão `../pawnpro-engine/target/`; fallback transparente para TypeScript se ausente
- **Completions** — `native`, `stock`, `public`, `forward`, `static`, `#define` e variáveis globais de todos os includes transitivos; snippets de parâmetros; itens depreciados marcados visualmente
- **Hover** — assinatura + comentário de documentação; em `#include` exibe o caminho resolvido e doc do topo do arquivo
- **Signature Help** — parâmetro ativo destacado ao digitar `(` e `,`
- **CodeLens** — contagem de referências clicável para todas as funções
- **References** — `textDocument/references` (Shift+F12)
- **Semantic Tokens** — coloração semântica de funções e macros com suporte a chamadas multiline
- **`editor.semanticTokenColorCustomizations`** — regras semânticas aplicadas automaticamente ao ativar um esquema de sintaxe, garantindo coloração correta independente do tema ativo
- **Diagnósticos PP0001–PP0013** — cobertura completa: includes não encontrados, erros estruturais (`native`/`forward`/`public`/`stock` malformados), código morto (variáveis, stocks, defines, includes), depreciação (`@DEPRECATED`), parâmetros não usados, funções não declaradas e `#tryinclude` não resolvido

#### Suporte open.mp
- **`server.type`** — nova chave de configuração: `"auto"` | `"samp"` | `"omp"`; determina arquivo de config (`server.cfg` vs `config.json`), arquivo de log e modo RCON
- **`loadOmpConfig`** — lê `config.json` do open.mp para extrair `rcon.password`, `network.port` e `network.bind`
- **`loadServerConfig`** — loader unificado que despacha para `loadSampConfig` ou `loadOmpConfig` conforme `server.type`; no modo `auto` detecta pelo arquivo presente
- **`resolveLogPath`** — detecta automaticamente o caminho do log: lê `logging.file` do `config.json` para open.mp, usa `server_log.txt` para SA-MP
- **Detecção do executável** — `omp-server` / `omp-server.exe` adicionados à lista de candidatos; diretório `open.mp/` adicionado às pastas buscadas
- **Detecção do compilador em `qawno/`** — diretório `qawno` adicionado à busca automática do `pawncc`
- **`qawno/include`** adicionado aos `includePaths` padrão detectados automaticamente

#### Configuração
- **`analysis.warnUnusedInInc`** e **`analysis.sdk`** (`platform`, `filePath`) adicionados aos defaults e ao `package.json` (`contributes.configuration`)
- **`pawnpro.server.type`** exposto em `contributes.configuration` com enum `auto`/`samp`/`omp`
- **`pawnpro.includePaths`**, **`pawnpro.compiler.path`**, **`pawnpro.compiler.args`**, **`pawnpro.analysis.warnUnusedInInc`**, **`pawnpro.analysis.sdk.platform`**, **`pawnpro.analysis.sdk.filePath`** adicionados a `contributes.configuration`
- **`setExternalDefaults`** em `PawnProConfigManager` — injeta defaults do VS Code com prioridade abaixo dos arquivos `.pawnpro/`; atualizado em tempo real via `onDidChangeConfiguration`
- **Migração** — `analysis.sdk.platform` e `analysis.sdk.filePath` incluídos na migração automática de settings legados do VS Code

#### Interface
- **Status bar** — novo item `PawnPro` na barra inferior com menu rápido: reiniciar motor, abrir `.pawnpro/config.json`, controles do servidor (Start/Stop/Restart/Editar configuração) e seção **Novo script** (Gamemode / Filterscript / Include)
- **"Editar configuração do servidor"** — detecta automaticamente `server.cfg` (SA-MP) ou `config.json` (open.mp) com base em `server.type`

#### Templates
- Template único (`BLANK_TEMPLATE` hardcoded) substituído por arquivos separados por plataforma: `gamemode.omp.pwn`, `gamemode.samp.pwn`, `filterscript.omp.pwn`, `filterscript.samp.pwn`, `include.omp.inc`
- `pawnpro.newScript` filtrado por `analysis.sdk.platform`; aceita parâmetro `kind` (`gamemode` | `filterscript` | `include`) e abre diretamente se houver uma única variante para a plataforma

#### Outras adições
- **Snippets** — `snippets/pawn.json` com estruturas de controle, funções, variáveis, includes, callbacks SA-MP/open.mp e utilitários (`CMD`, `SetTimer`, `fmsg`, etc.); registrado em `contributes.snippets`
- **`semanticTokenScopes`** — mapeamento de `function` → `support.function.pawn` registrado no `package.json`
- **Script `download-engine.js`** — baixa binários do motor do GitHub Releases; integrado ao `build.sh`
- **`scripts/bundle.mjs`** — bundle via esbuild; dependências (`iconv-lite`, `safer-buffer`, `vscode-nls`) embutidas no bundle
- **`pawnpro.clearEngineCache`** — novo comando que reinicia o cliente LSP; substituiu o comando de cache statistics que não tinha handler
- **`pawnpro.findReferences`** — comando interno registrado em `extension.ts`; delega para `vscode.executeReferenceProvider` + `editor.action.showReferences`; aceita URI + posição como argumentos (usado pelo CodeLens do motor)
- **`platforms`** no `package.json` — extensão declarada para plataformas específicas: `linux-x64`, `linux-arm64`, `win32-x64`, `darwin-x64`, `darwin-arm64`
- **`engineVersion`**, **`engineRepository`** e **`author`** adicionados ao `package.json`
- **`docs/`** — documentação detalhada (features, commands, configuration, snippets) excluída do `.vsix`
- **`CONTRIBUTING.md`**, **`CODE_OF_CONDUCT.md`**, **`SUPPORT.md`**, **`CLAUDE.md`**, **`.github/copilot-instructions.md`** adicionados

### Corrigido
- **Todos os títulos de comando** no `package.json` — migrados de strings hardcoded para chaves NLS (`%command.*%`)
- **Mensagens de tema** em `themes.ts` — `schemeNotFound`, `schemePicker`, `schemeApplied`, `syntaxRestored` migradas para `nls.ts` em vez de strings hardcoded
- **Todas as descrições de `contributes.configuration`** — migradas para chaves NLS
- **RCON** — `server.ts` usa `loadServerConfig` (unificado) em vez de `loadSampConfig` diretamente, respeitando `server.type`
- **`cleanupThemeCustomizations`** — agora limpa também `editor.semanticTokenColorCustomizations` ao desativar

### Alterado
- **Módulos removidos de `src/core/`** — `fileCache.ts`, `apiIndex.ts`, `semanticAnalyzer.ts`, `unusedAnalyzer.ts`, `hover.ts` (lógica incorporada no motor Rust)
- **Módulos removidos de `src/vscode/`** — `codelens.ts`, `completion.ts`, `diagnostics.ts`, `hover.ts`, `intellisense.ts`, `signatureHelp.ts` (substituídos pelo motor Rust)
- **`src/core/includes.ts`** — funções `analyzeIncludes`, `gatherIncludedFiles`, `isOffsetInComment`, `IncludeMsgBuilder` e re-exports de helpers de string removidos (não mais necessários); `qawno/include` adicionado aos defaults; `INCLUDE_RX_GLOBAL` removida
- **`src/core/compiler.ts`** — diretório `qawno/` adicionado à busca automática do `pawncc`
- **`src/core/types.ts`** — novos tipos exportados: `ServerType`, `SdkPlatform`, `AnalysisSdkConfig`, `AnalysisConfig`; `TokenColorScheme` recebe campo `semanticRules`; `PawnProConfig` recebe campo `analysis`; `ServerConfig` recebe campo `type`
- **`nls.ts`** — grupos `diagnostics`, `hover`, `codelens`, `debug` removidos; adicionados `themes`, `extension`, `statusBar`; `buildIncludeErrorMessage` convertida de chamadas NLS para strings inline (motor Rust assume a responsabilidade de emitir diagnósticos de include); `general.cachePrewarmed` e `general.cacheStats` removidas
- **`configBridge.ts`** — FileWatcher de `.pwn`/`.inc` e listeners de `onDidChangeTextDocument`/`onDidCloseTextDocument` para cache removidos; adicionado `onDidChangeConfiguration` propagando settings ao motor via `sendConfigurationToEngine`; `readVsCodeSettings()` extrai settings relevantes do VS Code para `setExternalDefaults`; parâmetro `_projectRoot` removido de `migrateFromVsCodeSettings`
- **`server.logPath`** — default alterado de `${workspaceFolder}/server_log.txt` para `""` (detecção automática)
- **`LOG_POLL_INTERVAL_MS`** — constante nomeada substitui magic number `100` no `LogTailer`
- **`isSafeKey`** em `config.ts` — verificação de prototype pollution adicionada tanto no `deepMerge` quanto no `setKey` (seção do config)
- **`repack-vsix.js`** — reescrito para injetar binários do motor (`engines/`) no VSIX; injeção manual de `iconv-lite`/`safer-buffer`/`vscode-nls` removida (agora embutidos pelo esbuild)
- **`vscode:prepublish`** — executa `bundle` (esbuild) em vez de `tsc`; scripts `compile`, `watch`, `package:full`, `package:pre` atualizados; adicionados `bundle` e `bundle:dev`
- **Versão mínima do VS Code** — `^1.106.0`
- **Gramática `pawn.tmLanguage.json`** — regra `builtins` com funções SA-MP hardcoded removida; adicionada regra `namespace_call` para chamadas com `::`
- **Temas de sintaxe** — quatro arquivos reformatados com escopos expandidos e estrutura JSON consistente
- **Workflow `publish.yml`** — reescrito com matrix de 5 plataformas (`linux-x64`, `linux-arm64`, `win32-x64`, `darwin-x64`, `darwin-arm64`); cada job baixa o binário correto via `download-engine.js --artifact` e empacota com `vsce package --target`; publicação de plataformas específicas (`platform-specific extensions`) no Marketplace
- **Demais workflows CI** — todos com `permissions: {}` no topo e permissões mínimas por job; `stale` migrado para `v9`; `codeql.yml` simplificado (matrix removida, job único TypeScript)
- **`scripts/build.sh`** — `rm -rf out/` substituído por `rm -f *.vsix`; adicionado passo de `download-engine.js`; type-check via `tsc --noEmit` antes do bundle; passos separados: download → type-check → bundle → VSIX
- **`tsconfig.json`** — adicionado `"types": ["node"]` para resolução de tipos Node sem imports implícitos
- **`.vscodeignore`** — adicionados `src/**`, `docs/**`, `scripts/`, `.github/**`, `node_modules/**`, `.gitignore`, `.claude`, `out/**/*.map`
- **`.gitignore`** — adicionado `engines/` (binários do motor nunca comitados)

### Removido
- **`pawnpro.cacheStats`** — removido do `package.json` e NLS; substituído por `pawnpro.clearEngineCache`
- **`ROADMAP.md`** — removido; itens documentados em `docs/`
- **`packagedDependencies`** / **`bundledDependencies`** / **`bundleDependencies`** — blocos removidos do `package.json` (não mais necessários com esbuild)

### Dependências
- **Adicionadas:** `vscode-languageclient ^9.0.1`, `esbuild ^0.28.0` (devDep), `jszip ^3.10.1` (devDep para `repack-vsix.js`)
- **Atualizadas:** `typescript ^5.9.3` → `^6.0.3`, `@types/node ^25.3.5` → `^25.6.0`, `@types/vscode ^1.106.1` → `1.106.0` (pinada), `@vscode/vsce ^3.7.1` → `^3.9.1`
- **Removidas do VSIX:** `iconv-lite`, `safer-buffer`, `vscode-nls` deixaram de ser injetadas manualmente (embutidas pelo esbuild)

### Detalhe importante
- Podem haver alguns dados que não foram mencionados ou que foram esquecidos de serem adicionados a este arquivo, não intencionalmente mas sim pelo fator humano.
