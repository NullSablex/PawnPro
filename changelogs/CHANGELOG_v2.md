# Changelog — Versões 2.x e anteriores

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
