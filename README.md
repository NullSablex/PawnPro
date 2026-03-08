# PawnPro

Extensão moderna para desenvolver **Pawn** no Visual Studio Code — diagnóstico de `#include`, compilação rápida, painel de includes, *hovers* de funções e controles de servidor SA-MP.

> **Apoie o projeto via PIX**  
> Copie e cole a chave abaixo no app do seu banco:
>
> - **Chave aleatória:** `8b811939-3f82-448d-80a6-0a0532b60afe`
>

## Recursos principais
- **Compilação em 1 clique**: _PawnPro: Compilar arquivo atual_ (`Ctrl+Alt+B`).
- **Diagnóstico de `#include`**: marca includes inexistentes (nome simples busca em `includePaths`; caminhos relativos/absolutos resolvem a partir do arquivo).
- **Hover inteligente**:
  - Em `#include`: exibe **caminho resolvido** e **Doc** do topo do `.inc` (se houver).
  - Em funções `native/forward`: mostra **assinatura** e **Doc** (indexadas a partir das suas includes + fallbacks de nativos comuns).
- **Aba “Includes”**: navegação pelos `.inc` ativos, com abertura direta nas assinaturas.
- **Temas de sintaxe**: clássico e moderno (claro/escuro), com aplicação automática.
- **Servidor SA-MP**:
  - Start/Stop/Restart integrados e envio de comandos via **RCON (UDP)**.
  - Canal único **“PawnPro Server”** (log + respostas RCON), *follow* configurável e *tail* do `server_log.txt` (Linux/macOS).
  - **Segurança**: bloqueia RCON se a senha for vazia ou `changename`.

## Como usar (rápido)
1. **Compilar**: abra um `.pwn` → `Ctrl+Alt+B`.  
2. **Includes**: passe o mouse sobre `#include` para ver caminho/Doc; use a aba **Includes** para explorar.  
3. **Funções**: passe o mouse sobre chamadas (ex.: `CreateVehicle`) para ver assinatura/Doc.  
4. **Servidor**: configure o executável → _PawnPro: Start Server_; envie comandos no painel do servidor (RCON).

## Comandos
- `pawnpro.compileCurrent` — Compilar arquivo atual  
- `pawnpro.detectCompiler` — Detectar compilador  
- `pawnpro.applySyntaxScheme` / `pawnpro.resetSyntaxScheme` — Esquemas de sintaxe  
- `pawnpro.server.start` / `pawnpro.server.stop` / `pawnpro.server.restart` — Servidor SA-MP  
- `pawnpro.server.show` — Mostrar **Console**  
- `pawnpro.server.showLog` — Mostrar **Log**

## Configurações essenciais
- **Compilação**
  - `pawnpro.compiler.autoDetect` (bool), `pawnpro.compiler.path` (string), `pawnpro.compiler.args` (string[])
  - `pawnpro.includePaths` (string[]) — aceita `${workspaceFolder}`
  - `pawnpro.output.encoding` (`utf8` | `windows1252`)
- **Servidor SA-MP**
  - `pawnpro.server.path` (string), `pawnpro.server.cwd` (string), `pawnpro.server.args` (string[])
  - `pawnpro.server.logPath` (string), `pawnpro.server.logEncoding` (`windows1252` | `utf8`)
  - `pawnpro.server.clearOnStart` (bool), `pawnpro.server.output.follow` (`visible` | `always` | `off`)
- **Outros**
  - `pawnpro.showIncludePaths` (bool)
  - `pawnpro.syntax.scheme` / `pawnpro.syntax.applyOnStartup`

## Leitura do `server.cfg`
A extensão **lê localmente** (não modifica) para configurar o RCON:
- `rcon_password` — senha usada para RCON (bloqueia envio se vazia ou `changename`).
- `port` — porta do servidor (UDP). Padrão: `7777`.
- `bind` — IP local. Se ausente ou `0.0.0.0`, assume `127.0.0.1`.

> **Privacidade:** o `server.cfg` é processado **apenas** no seu computador. Nenhum dado é enviado externamente. O tráfego de rede ocorre somente quando você envia um comando RCON ao seu servidor.

## Requisitos
- **Compilação:** `pawncc` acessível no caminho configurado.  
- **Servidor (opcional):** `server.cfg` com `rcon_password`; no Linux/macOS, aponte `pawnpro.server.logPath` para o `server_log.txt` para *tail* contínuo.

## Avisos
- Use aspas em caminhos com espaços.
- Firewalls/antivírus podem bloquear RCON (UDP); libere a porta local se necessário.
- Ajuste o *follow* do canal em `pawnpro.server.output.follow` para controlar a rolagem automática.

---

**Curtiu a extensão?** Qualquer valor via **PIX** ajuda a manter o projeto. Obrigado! 🙌
