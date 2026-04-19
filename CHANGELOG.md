# Changelog
Todas as mudanças notáveis neste projeto serão documentadas aqui.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

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

---

## [2.1.1-rc.1] - 08/03/2026

### Corrigido
- **Painel "O que há de novo"** - Correspondência de versão agora aceita entradas com sufixo no changelog (ex: `2.1.1` localiza `[2.1.1-rc.1]`)
- **Script de build** - `build.sh` executa `npm install` para manter o `package-lock.json` sempre atualizado

---

## [2.1.0-rc.1] - 08/03/2026

### Adicionado
- **CodeLens com contagem de referências** - Mostra "X referências" acima de cada função
- **Detecção de macros públicas** - CodeLens detecta funções declaradas via macro (`PREFIX::Nome()`), equivalentes a `forward + public`
- **Detecção de símbolos não utilizados** - Alerta para variáveis e funções `stock` não utilizadas
- **Sintaxe para pontuação** - Destaque para `()`, `[]` e `{}`
- **Validação de declarações** - Verifica estrutura de `native/forward/public/stock`
- **Signature Help** - Exibe assinatura e parâmetro ativo ao digitar `(` e `,`
- **Auto-complete** - Sugestões de funções e macros de includes e API
- **Internacionalização (NLS)** - Suporte a múltiplos idiomas via `vscode-nls` (PT-BR/EN); todas as strings de usuário migradas para `nls.ts`
- **Comando de debug de cache** - `PawnPro: Cache Statistics (Debug)` exibe contadores internos do cache
- **Painel "O que há de novo"** - Exibe automaticamente as novidades da versão na primeira execução após atualização; lê o `CHANGELOG.md` em tempo de execução; reabrível via `PawnPro: O que há de novo`
- **Template de script** - Comando `PawnPro: Novo Script (Gamemode/Filterscript)` abre um documento Pawn com o template padrão SA-MP (inclui todos os callbacks; descomente `#define FILTERSCRIPT` para modo filterscript)

### Alterado
- **Hover em funções** - Busca apenas em arquivos efetivamente incluídos
- **Natives com tags de retorno** - Reconhece `native bool:funcName(...)`, etc.
- **Terminal do servidor** - Reutiliza terminal existente
- **Diagnósticos ignoram comentários** - `#include` em comentários não gera alertas

### Melhorado
- **Cache centralizado** - Sistema de cache unificado (`fileCache.ts`) compartilhado por todos os componentes
- **Invalidação por FileWatcher** - Cache invalida automaticamente quando arquivos `.pwn`/`.inc` mudam
- **Pre-warming do cache** - Carregamento em background na ativação da extensão
- **Suporte a documentos não salvos** - Cache usa `document.version` para arquivos abertos
- **Performance do hover** - Migrado para cache centralizado
- **Performance do apiIndex** - Migrado para cache centralizado (~100 linhas removidas)
- **Proteção contra compilação dupla** - Bloqueia se já está compilando
- **Status de compilação** - Notificação "Compilando: arquivo.pwn"
- **Performance de diagnósticos** - Debounce e cancelamento
- **IntelliSense com includes** - Usa funções de arquivos incluídos

### Segurança
- **CWE-400 (ReDoS)** - `unusedAnalyzer.ts`: adicionado `escapeRe()` em todas as interpolações de `new RegExp(name)` para prevenir backtracking catastrófico com identificadores maliciosos
- **CVE em dependências transitivas de devDeps** - Adicionado `overrides` no `package.json` para fixar versões corrigidas de `minimatch` (≥10.2.3), `qs` (≥6.14.2), `ajv` (≥8.18.0), `markdown-it` (≥14.1.1) e `underscore` (≥1.13.8); `npm audit` retorna 0 vulnerabilidades
- **SECURITY.md** - Adicionado relatório completo de auditoria (CWE-78, CWE-79, CWE-22, CWE-400, CWE-915 + análise CVE)

---

## [2.0.2-beta] - 05/02/2026

### Segurança
- **Proteção contra prototype pollution** (CWE-915) - `setKey()` bloqueia `__proto__`, `constructor`, `prototype`
- **Cópia defensiva de estado** (CWE-471) - `structuredClone()` para evitar mutação externa
- **Proteção contra loops de symlinks** (CWE-400) - `listIncFilesRecursive` usa `realpath` + `Set<string>`
- **Prevenção de XSS** (CWE-79) - `serverView.ts` escapa atributos HTML
- Dependências atualizadas via `npm audit fix`

### Corrigido
- Removido limite artificial de 500 arquivos em includes; usa `maxDepth=20` + detecção de symlinks cíclicos

---

## [2.0.0] - 05/02/2026

### Alterado (Breaking Changes)
- **Nova arquitetura core/adapter** - Código separado em módulos puros (sem dependência do VS Code) e adaptadores
- **Sistema de configuração próprio** - Configurações migradas de `.vscode/settings.json` para:
  - `~/.pawnpro/config.json` (configurações globais)
  - `.pawnpro/config.json` (configurações do projeto)
  - `.pawnpro/state.json` (estado do projeto - favoritos, histórico)
- **Temas aplicados globalmente** - Esquemas de sintaxe agora usam configurações globais do usuário ao invés de workspace

### Adicionado
- Migração automática de configurações existentes do VS Code para `.pawnpro/`
- Watch de arquivos de configuração (recarrega automaticamente ao editar)
- Suporte a deep merge de configurações (projeto sobrescreve global sobrescreve defaults)
- Substituição de `${workspaceFolder}` em todos os caminhos de configuração
- **Detecção automática do servidor** - Busca automática de `samp-server.exe`/`samp03svr` no workspace e subpastas comuns
- **Codificação Windows-1252 automática** - Arquivos `.pwn` e `.inc` agora usam Windows-1252 por padrão (acentos funcionam corretamente)
- Script de build unificado (`scripts/build.sh`) para compilar e empacotar em um comando

### Removido
- Dependência de `vscode-nls` (strings agora são hardcoded PT-BR/EN)
- Todas as configurações de `contributes.configuration` exceto `pawnpro.ui.separateContainer` (necessário para cláusulas `when`)

### Técnico
- Entry point movido para `out/vscode/extension.js`
- 11 módulos em `src/core/` (lógica pura TypeScript)
- 9 módulos em `src/vscode/` (adaptadores VS Code)
- Compatível com VS Code, forks e Codium

---

## [1.3.1] - 29/11/2025

### Nota de Lançamento
**PawnPro** é agora disponibilizado publicamente no GitHub sob licença **source-available**!

O código-fonte está acessível para:
- ✅ Uso pessoal e comercial gratuito
- ✅ Visualização, estudo e aprendizado
- ✅ Modificação para uso próprio
- ✅ Contribuições ao projeto oficial

**Restrições importantes:**
- ❌ Não pode vender ou cobrar pela extensão
- ❌ Não pode redistribuir comercialmente
- ❌ Não pode criar versões pagas/premium
- ❌ Não pode remover créditos do autor

Versões anteriores eram privadas ou tinham funcionalidades limitadas. Consulte o arquivo [LICENSE.md](https://github.com/NullSablex/PawnPro/blob/master/LICENSE.md) para detalhes completos.

### Adicionado
- **Compilação integrada** com detecção automática do compilador `pawncc`
  - Comando `PawnPro: Compilar arquivo atual` (Ctrl+Alt+B)
  - Detecção automática de flags suportadas na primeira compilação
  - Diagnóstico de erros e warnings em tempo real

- **Sistema inteligente de includes**
  - Diagnóstico de `#include`: marca includes inexistentes com verificação inteligente
  - Nomes simples buscam em `includePaths` configurado
  - Caminhos relativos/absolutos resolvem a partir do arquivo atual
  - Hover sobre `#include` mostra caminho resolvido e documentação do topo do `.inc`

- **Painel "Includes"** na sidebar
  - Navegação pelos arquivos `.inc` ativos
  - Lista todas as `native/forward native` de cada include
  - Clique abre diretamente na assinatura da função
  - Auto-refresh quando arquivos `.inc` são modificados
  - Opção de exibir/ocultar caminhos relativos

- **Hover inteligente para funções**
  - Exibe assinatura e documentação para `native/forward`
  - Indexação automática das suas includes
  - Fallbacks para nativos comuns (CreateVehicle, SendClientMessage, etc.)
  - Busca recursiva em arquivos incluídos (até 30 arquivos / 3 níveis)
  - Detecção precisa linha a linha
  - Prioriza definições reais sobre forwards

- **Temas de sintaxe personalizáveis**
  - Clássico Claro/Escuro (baseado no Pawn Editor original)
  - Moderno Claro/Escuro (visual contemporâneo)
  - Aplicação automática baseada no tema do VS Code
  - Comandos para aplicar/resetar esquemas manualmente

- **Controles integrados do Servidor SA-MP**
  - Botões Start/Stop/Restart na interface
  - Painel interativo com entrada de comandos
  - Histórico completo de comandos (sem limite, sem duplicatas)
  - Sistema de favoritos para comandos frequentes
  - **RCON UDP integrado**
    - Leitura automática de `server.cfg` (rcon_password, port, bind)
    - Suporte a comandos `/rcon` e `rcon login` (normalização automática)
    - Filtro de segurança: bloqueia envio se senha vazia ou "changename"
    - Respostas exibidas no canal "PawnPro Server"

- **Monitoramento de logs do servidor**
  - Canal único "PawnPro Server" para logs e respostas RCON
  - Tail em tempo real do `server_log.txt` (Linux/macOS)
  - Decodificação configurável (Windows-1252/UTF-8)
  - Follow inteligente: rolagem automática configurável (visible/always/off)
  - Opção de limpar log ao iniciar servidor

- **Gramáticas de sintaxe adicionais**
  - Arquivos `.cfg` com suporte a `=` opcional, valores com/sem aspas
  - Arquivos `.ini` usando a mesma gramática do `.cfg`
  - Arquivos `.log` com coloração de delimitadores (), [], {}

- **Sistema de internacionalização (i18n)**
  - Suporte a múltiplos idiomas usando `vscode-nls`
  - Mensagens e notificações localizadas

### Configurações Principais

#### Compilação
- `compiler.autoDetect` - Detectar compilador automaticamente
- `compiler.path` - Caminho do executável pawncc
- `compiler.args` - Argumentos adicionais de compilação
- `includePaths` - Diretórios de includes (suporta `${workspaceFolder}`)
- `output.encoding` - Codificação de saída (utf8/windows1252)

#### Servidor SA-MP
- `server.path` - Caminho do executável do servidor
- `server.cwd` - Diretório de trabalho do servidor
- `server.args` - Argumentos adicionais do servidor
- `server.logPath` - Caminho do server_log.txt
- `server.logEncoding` - Codificação do log (windows1252/utf8)
- `server.clearOnStart` - Limpar log ao iniciar
- `server.output.follow` - Comportamento de rolagem (visible/always/off)

#### Interface
- `ui.showIncludePaths` - Exibir caminhos na árvore de includes
- `syntax.scheme` - Tema de sintaxe (classic_white/classic_dark/modern_white/modern_dark/auto)
- `syntax.applyOnStartup` - Aplicar tema automaticamente na inicialização

### Comandos Disponíveis
- `pawnpro.compileCurrent` - Compilar arquivo atual
- `pawnpro.detectCompiler` - Detectar compilador automaticamente
- `pawnpro.applySyntaxScheme` - Aplicar esquema de sintaxe
- `pawnpro.resetSyntaxScheme` - Resetar esquema de sintaxe
- `pawnpro.server.start` - Iniciar servidor SA-MP
- `pawnpro.server.stop` - Parar servidor SA-MP
- `pawnpro.server.restart` - Reiniciar servidor SA-MP
- `pawnpro.server.show` - Mostrar console do servidor
- `pawnpro.server.showLog` - Mostrar log do servidor

### Requisitos
- **Compilação:** executável `pawncc` acessível no PATH ou caminho configurado
- **Servidor (opcional):**
  - `server.cfg` com `rcon_password` configurado para comandos RCON
  - Linux/macOS: configure `server.logPath` para tail contínuo do log

### Notas de Segurança e Privacidade
- O `server.cfg` é processado **apenas localmente** no seu computador
- Nenhum dado é enviado externamente
- Tráfego de rede ocorre **somente** quando você envia comandos RCON ao seu servidor local
- Firewalls/antivírus podem bloquear UDP RCON - libere a porta se necessário

### Dicas de Uso
- Use aspas em caminhos com espaços nas configurações
- Ajuste `server.output.follow` para controlar rolagem do console
- Use a variável `${workspaceFolder}` em caminhos para portabilidade

---

## Licença e Repositório

- **Repositório:** [github.com/NullSablex/PawnPro](https://github.com/NullSablex/PawnPro)
- **Licença:** PawnPro License v1.0 - Source-Available (não Open Source)
  - Uso comercial permitido ✅
  - Venda proibida ❌
  - Detalhes completos: [LICENSE.md](https://github.com/NullSablex/PawnPro/blob/master/LICENSE.md)
- **Feedback:** Use as Issues do GitHub para reportar bugs ou sugerir melhorias
- **Contribuições:** Pull requests são bem-vindos! Ao contribuir, você concorda que suas contribuições serão licenciadas sob os mesmos termos
