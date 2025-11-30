# Changelog
Todas as mudanças notáveis neste projeto serão documentadas aqui.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

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
- `pawnpro.compiler.autoDetect` - Detectar compilador automaticamente
- `pawnpro.compiler.path` - Caminho do executável pawncc
- `pawnpro.compiler.args` - Argumentos adicionais de compilação
- `pawnpro.includePaths` - Diretórios de includes (suporta `${workspaceFolder}`)
- `pawnpro.output.encoding` - Codificação de saída (utf8/windows1252)

#### Servidor SA-MP
- `pawnpro.server.path` - Caminho do executável do servidor
- `pawnpro.server.cwd` - Diretório de trabalho do servidor
- `pawnpro.server.args` - Argumentos adicionais do servidor
- `pawnpro.server.logPath` - Caminho do server_log.txt
- `pawnpro.server.logEncoding` - Codificação do log (windows1252/utf8)
- `pawnpro.server.clearOnStart` - Limpar log ao iniciar
- `pawnpro.server.output.follow` - Comportamento de rolagem (visible/always/off)

#### Interface
- `pawnpro.showIncludePaths` - Exibir caminhos na árvore de includes
- `pawnpro.syntax.scheme` - Tema de sintaxe (classic-light/classic-dark/modern-light/modern-dark)
- `pawnpro.syntax.applyOnStartup` - Aplicar tema automaticamente na inicialização

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
  - Linux/macOS: configure `pawnpro.server.logPath` para tail contínuo do log

### Notas de Segurança e Privacidade
- O `server.cfg` é processado **apenas localmente** no seu computador
- Nenhum dado é enviado externamente
- Tráfego de rede ocorre **somente** quando você envia comandos RCON ao seu servidor local
- Firewalls/antivírus podem bloquear UDP RCON - libere a porta se necessário

### Dicas de Uso
- Use aspas em caminhos com espaços nas configurações
- Ajuste `pawnpro.server.output.follow` para controlar rolagem do console
- Use a variável `${workspaceFolder}` em caminhos para portabilidade

---

## Apoie o Projeto

Se você está achando o PawnPro útil, considere apoiar o desenvolvimento via PIX:

**Chave aleatória:** `8b811939-3f82-448d-80a6-0a0532b60afe`

Qualquer valor ajuda a manter o projeto ativo. Obrigado! 🙌

---

## Licença e Repositório

- **Repositório:** [github.com/NullSablex/PawnPro](https://github.com/NullSablex/PawnPro)
- **Licença:** PawnPro License v1.0 - Source-Available (não Open Source)
  - Uso comercial permitido ✅
  - Venda proibida ❌
  - Detalhes completos: [LICENSE.md](https://github.com/NullSablex/PawnPro/blob/master/LICENSE.md)
- **Feedback:** Use as Issues do GitHub para reportar bugs ou sugerir melhorias
- **Contribuições:** Pull requests são bem-vindos! Ao contribuir, você concorda que suas contribuições serão licenciadas sob os mesmos termos