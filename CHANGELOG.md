# Changelog
Todas as mudanças notáveis neste projeto serão documentadas aqui.

---

## [2.3.1] - 17/08/2025 _(pré-release)_
### Corrigido
- Bug em que toda vez que é feita a compilação, uma nova saída `Pawn Build` é gerada.

## [2.3.0] - 15/08/2025 _(pré-release)_
### Adicionado
- Suporte à sintaxe para arquivos `.cfg` compatível com `=` opcional, valores com e sem aspas e suporte a espaços, incluindo linhas sem `=`.
- Suporte automático a arquivos `.ini` usando a mesma gramática do `.cfg`.
- Nova gramática para arquivos `.log`, cobrindo:
  - Delimitadores `()`, `[]` e `{}` com coloração de pontuação.
  - Conteúdo interno desses delimitadores com escopos próprios para personalização de cor.
  - Verde padrão aplicado apenas a texto que não se enquadra nas regras acima.
  - Cobertura para diversos caracteres especiais e pontuação comuns em logs.
- Ajustes para evitar que o “verde padrão” sobrescreva cores internas dos agrupadores.
- **Hover cross-file:** resolução de funções definidas em arquivos incluídos (`.pwn/.inc`) com busca recursiva (limites de 30 arquivos / 3 níveis), exibindo caminho do arquivo e link **“Ir para a linha”** que abre diretamente na definição.
- **Hover em `#include`:** mostra o caminho resolvido do arquivo incluído.
- **Container dedicado “PawnPro” na Activity Bar:** opção **“PawnPro › UI › Separate Container”** para mover as views do Explorer para um container próprio, com foco automático ao ativar.
- **Views duplicadas por contexto (Explorer/Container):**  
  - Includes: `pawnpro.includesView.explorer` (Explorer) e `pawnpro.includesView` (Container).  
  - Servidor: `pawnpro.serverView.explorer` (Explorer) e `pawnpro.serverView` (Container).
- **Estado unificado do painel do servidor (histórico e favoritos):** um único provider atende ambas as views; comandos enviados, itens favoritados e limpezas ficam sincronizados e **persistem em `workspaceState`**.
- **Envio de comandos via RCON UDP integrado:** o painel envia direto por RCON quando configurado, exibindo resposta no canal “PawnPro Server”.

### Melhorado
- Tratamento de conteúdo dentro de delimitadores no `.log` para funcionar em qualquer posição da linha.
- **Precisão de linha no hover:** detecção linha a linha usando a API do editor, eliminando desvios em arquivos grandes e/ou com `CRLF`.
- **Preferência por definições:** quando há `forward` + `stock/public`, o hover e a navegação priorizam a **definição real** (`stock/public`).
- **Detecção de chamadas mais inteligente:** prioriza a chamada **mais interna** sob o cursor e evita exibir hover do “outer” quando o cursor está nos **argumentos**.
- **Macros mais claras:** expansão de placeholders `Base::%0(%1)` e de macros tipo função `#define`, respeitando quebras com `\` na exibição.
- **Desempenho e previsibilidade na busca em includes:** deduplicação, varredura em **BFS** (arquivos “mais próximos” primeiro) e limites de profundidade/arquivos para manter o hover responsivo.
- **Ciclo do servidor mais robusto:** botões e menus permanecem coerentes com o estado real (`pawnpro.server.running`), inclusive após **restart**.
- **Log do servidor mais controlável:** canal “PawnPro Server” com opção `pawnpro.server.output.follow` (`visible` | `always` | `off`) e respeito à codificação configurada em `pawnpro.server.logEncoding`.
- **Include Tree duplicada com um único provider:** ambas as views (Explorer/Container) usam a mesma fonte de dados, com auto-refresh em alterações de `*.inc` e opção `pawnpro.showIncludePaths` para exibir o caminho relativo.
- **Segurança no RCON:** filtro impede envio quando a senha é vazia ou `changename`; comandos `rcon login` são sanados para evitar vazamento acidental.

### Corrigido
- **Linha errada no hover** de funções locais (caso típico: mostrava a linha do `forward` ou do `}` anterior em vez da linha da definição, ex.: 5165 vs 5167).
- **Falsos positivos em comentários:** declarações/comandos/`#include`/`#define` comentados são ignorados; além disso, não há hover quando o cursor está sobre um trecho comentado.
- **Navegação entre arquivos:** o link **“Ir para a linha”** agora usa `vscode.open` para abrir o **arquivo correto** já focando na linha da definição.

## [2.1.7] - 13/08/2025
### Melhorias
- Compatibilidade Windows/Linux aprimorada ao definir o diretório de trabalho (`cwd`) para a pasta do arquivo `.pwn` durante a compilação.
- Log de compilação mais informativo (mostra diretório de execução e comando completo).
- Regras de tema de sintaxe agora afetam **apenas** arquivos `.pwn` e `.inc`.
- Detecção automática de flags suportadas na **primeira compilação** (evita opções inválidas).
- **Servidor (SA-MP):** gestão de estado mais estável nos botões (Start/Stop/Restart) e reinício confiável (aguarda o término do stop antes de iniciar).
- **Ações do servidor:** comandos separados e confiáveis para **Mostrar Console** e **Mostrar Log**.
- **Saída unificada:** agora existe apenas um canal “**PawnPro Server**” (log + respostas RCON), com decodificação configurável (`pawnpro.server.logEncoding`).
- **Follow inteligente:** rolagem automática para o final quando o canal estiver visível. Comportamento configurável por `pawnpro.server.output.follow` (`visible` | `always` | `off`).
- **Histórico/Favoritos no painel do servidor:** sem limite de itens e sem duplicatas (entradas repetidas são movidas para o topo).
- **Resolução de `#include` consistente:** `<>` e `""` equivalem; nomes simples são buscados somente em `pawnpro.includePaths`; caminhos relativos/absolutos resolvem a partir do arquivo atual; tenta automaticamente a extensão `.inc`; removida a varredura do workspace (menos falsos positivos).
- **Diagnóstico de includes** atualizado para usar a nova resolução (erros apenas quando o arquivo realmente não existe).
- **Hover robusto:** leitura de `.inc` com decodificação UTF-8 e fallback para Windows-1252.

### Novidades
- Nova aba **Includes** (contêiner no painel PawnPro): lista os `.inc` do diretório de includes ativo e, dentro de cada um, todas as `native/forward native`; clique abre direto na assinatura; autoatualiza quando `.inc` mudam e quando `pawnpro.includePaths` é alterado.
- **Alternar exibição de caminhos** na árvore de includes (configuração `pawnpro.showIncludePaths`).
- Uso imediato sem configurar flags (você ainda pode adicionar as suas se quiser).
- Novos temas de sintaxe além dos clássicos (claro/escuro): **Moderno (Claro/Escuro)**.
- Seleção automática do tema de sintaxe com base no tema do editor (claro/escuro).
- Sistema de temas de sintaxe personalizáveis mantendo a familiaridade do Pawn Editor, com melhor conforto visual.
- **Controles de Servidor (SA-MP):**
  - Painel “Servidor” com **entrada de comando**, **histórico** e **favoritos**.
  - Envio de comandos via **RCON (UDP)** lendo `rcon_password`, `port` e `bind/host` do `server.cfg` (não precisa editar o arquivo). Suporta digitar `/rcon ...` ou `rcon login ...` (normaliza automaticamente).
  - **Filtro de segurança**: não envia RCON se a senha estiver vazia ou for `changename`.
  - **Start / Stop / Restart** integrados ao VS Code; botão e contexto refletem o estado real do processo.
  - **Tail do arquivo de log** (Linux/macOS) no canal “PawnPro Server”, mais eco das respostas RCON, com rolagem para o fim conforme configuração.
- **Hover de Includes:** ao passar o mouse em `#include`, exibe o caminho do arquivo alvo e, se disponível, o Doc do cabeçalho do `.inc`.
- **Hover de Funções:** mostra **assinatura** e **Doc** para `native/forward` indexadas nas suas includes (cache automático). Inclui fallbacks para nativos comuns como `CreateVehicle` e `SendClientMessage`.

---

## [2.1.6] - 11/08/2025
### Correções
- Inclusão completa de dependências no pacote (`vscode-nls`, `iconv-lite`, `safer-buffer`), eliminando erros de *"Cannot find module"*.
- Ajustes no `.vscodeignore` para manter apenas arquivos necessários no pacote final.
- Testes de instalação confirmados sem erros no VS Code.

---

## [2.1.5] - 10/08/2025
### Adicionado
- Sistema de mensagens multi-idiomas (i18n) usando `vscode-nls`.
- Detecção de compilador `pawncc` aprimorada para suportar mais cenários.