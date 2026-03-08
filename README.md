# PawnPro

Extensão moderna para desenvolver **Pawn** no Visual Studio Code — diagnóstico de `#include`, compilação rápida, IntelliSense, CodeLens, painel de includes, *hovers* de funções e controles de servidor SA-MP.

## Recursos principais
- **Compilação em 1 clique**: _PawnPro: Compilar arquivo atual_ (`Ctrl+Alt+B`).
- **Diagnóstico de `#include`**: marca includes inexistentes (nome simples busca em `includePaths`; caminhos relativos/absolutos resolvem a partir do arquivo).
- **Detecção de símbolos não utilizados**: alerta para variáveis (`new`/`static`/`const`) e funções `stock` declaradas mas não usadas.
- **CodeLens**: exibe contagem de referências acima de cada função; clique para listar todas.
- **Signature Help**: mostra assinatura e parâmetro ativo ao digitar `(` e `,`.
- **Auto-complete**: sugestões de funções e macros de includes e API indexados.
- **Hover inteligente**:
  - Em `#include`: exibe **caminho resolvido** e **Doc** do topo do `.inc` (se houver).
  - Em funções `native/forward`: mostra **assinatura** e **Doc** (indexadas a partir das suas includes + fallbacks de nativos comuns).
- **Aba “Includes”**: navegação pelos `.inc` ativos, com abertura direta nas assinaturas.
- **Temas de sintaxe**: clássico e moderno (claro/escuro), com aplicação automática.
- **Servidor SA-MP**:
  - Start/Stop/Restart integrados e envio de comandos via **RCON (UDP)**.
  - Canal único **”PawnPro Server”** (log + respostas RCON), *follow* configurável e *tail* do `server_log.txt` (Linux/macOS).
  - **Segurança**: bloqueia RCON se a senha for vazia ou `changename`.
- **Internacionalização**: mensagens em PT-BR e EN via `vscode-nls`.

## Como usar (rápido)
1. **Compilar**: abra um `.pwn` → `Ctrl+Alt+B`.
2. **Includes**: passe o mouse sobre `#include` para ver caminho/Doc; use a aba **Includes** para explorar.
3. **Funções**: passe o mouse sobre chamadas (ex.: `CreateVehicle`) para ver assinatura/Doc.
4. **Servidor**: configure o executável → _PawnPro: Start Server_; envie comandos no painel do servidor (RCON).

## Configuração
Todas as configurações são gerenciadas via arquivos JSON — **não** nas configurações do VS Code:

| Arquivo | Escopo |
|---------|--------|
| `~/.pawnpro/config.json` | Global (todos os projetos) |
| `.pawnpro/config.json` | Projeto (sobrescreve global) |
| `.pawnpro/state.json` | Estado do projeto (favoritos, histórico) |

**Exceção:** `pawnpro.ui.separateContainer` (bool) permanece nas configurações do VS Code para controlar o posicionamento dos painéis na Activity Bar.

### Principais chaves de `.pawnpro/config.json`

**Compilação**
- `compiler.autoDetect` — detectar `pawncc` automaticamente
- `compiler.path` — caminho do executável `pawncc`
- `compiler.args` — argumentos adicionais (ex.: `[“-i/caminho/include”]`)
- `includePaths` — diretórios de includes; aceita `${workspaceFolder}`
- `output.encoding` — `utf8` ou `windows1252`

**Servidor SA-MP**
- `server.path` — caminho do executável do servidor
- `server.cwd` — diretório de trabalho
- `server.args` — argumentos adicionais
- `server.logPath` — caminho do `server_log.txt`
- `server.logEncoding` — `windows1252` ou `utf8`
- `server.clearOnStart` — limpar log ao iniciar
- `server.output.follow` — `visible` | `always` | `off`

**Interface**
- `ui.showIncludePaths` — exibir caminhos na árvore de includes
- `syntax.scheme` — `classic_white` | `classic_dark` | `modern_white` | `modern_dark` | `auto`
- `syntax.applyOnStartup` — aplicar tema automaticamente na inicialização

## Comandos
- `pawnpro.compileCurrent` — Compilar arquivo atual
- `pawnpro.detectCompiler` — Detectar compilador automaticamente
- `pawnpro.applySyntaxScheme` / `pawnpro.resetSyntaxScheme` — Esquemas de sintaxe
- `pawnpro.server.start` / `pawnpro.server.stop` / `pawnpro.server.restart` — Servidor SA-MP
- `pawnpro.server.show` — Mostrar **Console**
- `pawnpro.server.showLog` — Mostrar **Log**
- `pawnpro.cacheStats` — Estatísticas do cache interno (debug)

## Leitura do `server.cfg`
A extensão **lê localmente** (não modifica) para configurar o RCON:
- `rcon_password` — senha usada para RCON (bloqueia envio se vazia ou `changename`).
- `port` — porta do servidor (UDP). Padrão: `7777`.
- `bind` — IP local. Se ausente ou `0.0.0.0`, assume `127.0.0.1`.

> **Privacidade:** o `server.cfg` é processado **apenas** no seu computador. Nenhum dado é enviado externamente. O tráfego de rede ocorre somente quando você envia um comando RCON ao seu servidor.

## Requisitos
- **Compilação:** `pawncc` acessível no caminho configurado.
- **Servidor (opcional):** `server.cfg` com `rcon_password`; no Linux/macOS, aponte `server.logPath` para o `server_log.txt` para *tail* contínuo.

## Avisos
- Use aspas em caminhos com espaços.
- Firewalls/antivírus podem bloquear RCON (UDP); libere a porta local se necessário.
- Ajuste `server.output.follow` para controlar a rolagem automática do console.

---
