# Changelog
Todas as mudanças notáveis neste projeto serão documentadas aqui.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

Podem existir falhas ou itens não declarados, causados por falha humana ou por IA, caso encontre por favor relate para ajudar a manter a consistência dos dados.

## Versões anteriores

- [Versões 2.x e anteriores](changelogs/CHANGELOG_v2.md)

---

## [3.5.0] - 01/09/2026

### Adicionado
- **Documentação de funções no hover, no signature help e no autocomplete** — o comentário escrito acima de uma função passa a ser lido e formatado, em vez de aparecer como texto cru com os `*` e as tags à mostra. Dois formatos são reconhecidos, detectados pelo próprio conteúdo: o estilo **Javadoc** (`@param`, `@return`) e o **XMLdoc** que o `omp-stdlib` do open.mp usa (`<summary>`, `<param name="">`, `<returns>`, `<remarks>`). No XMLdoc, a formatação embutida vira texto formatado de verdade (negrito, trechos de código, quebras de linha) e as tags que só servem ao gerador da wiki do open.mp — `<library>`, `<seealso>` e os links `<a href="#Função">` — deixam de poluir o hover. Cada parâmetro é casado **pelo nome**, não pela posição, então um comentário pode omitir parâmetros ou listá-los fora de ordem: ao digitar a chamada, o *signature help* mostra a descrição do parâmetro em que o cursor está; o autocomplete mostra o resumo; e o hover, o bloco inteiro, com os títulos das seções ("Parâmetros", "Retorna") no idioma configurado. Um comentário comum, sem tags, continua aparecendo como descrição
- **Prévia de cores nos literais** — literais de cor `0xRRGGBBAA` (e `0xRRGGBB`, tratado como opaco) no código Pawn passam a exibir um *swatch* clicável do editor com a cor real, em vez de apenas a cor de sintaxe. Clicar abre o seletor de cores nativo, que reescreve o valor no formato do open.mp (`0xRRGGBBAA`, alpha por último — ex.: vermelho `0xFF0000FF`). Um literal de 6 dígitos que permaneça opaco é reescrito com 6 dígitos; se ganhar transparência, é promovido a 8. Reconhece também o idioma de ajuste de alpha por aritmética (`0xRRGGBB00 + N`): o *swatch* mostra a cor com o alpha resultante, e a edição preserva a forma `base±N` (a soma só é interpretada quando afeta apenas o byte de alpha, sem transbordar para os demais canais). Reconhece ainda o formato de cor embutida em texto do SA-MP `{RRGGBB}` (chat, textdraws), reescrito no mesmo formato ao editar
- **Sugestão do Material Icon Theme** — na ativação, se o **Material Icon Theme** ainda não estiver instalado, a extensão sugere instalá-lo (melhora os ícones das pastas do projeto). É apenas um complemento: a sugestão pode ser dispensada de vez ("Não perguntar de novo") e nunca reaparece quando o tema já está presente
- **Realce de sintaxe TOML** — arquivos `.toml` (e `package.lock`) passam a ter destaque de sintaxe próprio, cobrindo tables e array-of-tables, chaves simples e pontuadas, strings básicas/literais e multilinha (triplas), inteiros (decimal, hexadecimal, octal e binário), floats (incluindo `inf`/`nan`), booleanos, datas/horas, arrays e inline tables. Inclui configuração de linguagem (comentário `#`, auto-fechamento de aspas e colchetes). A gramática é adaptada da extensão Even Better TOML (MIT) — as chaves usam escopos de *property-name*, coloridas pelos temas como propriedades (atribuição em `THIRD-PARTY-NOTICES.md`)
- **Padrão próprio de nomenclatura** — cada categoria de identificador (funções, globais, locais, constantes, macros, parâmetros) ganha um campo onde se escreve a própria convenção como expressão regular, no formato `/^g_[a-z][a-zA-Z0-9]*$/`. Convive com os cinco estilos embutidos pela regra que já existia: o nome é aceito se casar com **qualquer** critério da categoria — dá para exigir `camelCase` **ou** o prefixo da casa. O padrão é âncorado como `^(?:…)$`, ou seja, descreve o nome inteiro, e o agrupamento impede que uma alternância no topo ancore só os extremos. A página mostra, junto dos exemplos dos estilos embutidos, um nome real que o padrão aceita, atualizado enquanto se digita; um padrão inválido não é gravado, para não restar uma regra que a engine descartaria em silêncio. Diagnóstico funciona normalmente, mas sem sugestão de renomeação: de um regex arbitrário dá para saber se o nome passa, não como reescrevê-lo. A validação em si é feita pela engine, cujo motor de expressões regulares tem tempo de execução linear garantido — um padrão custoso não degrada a análise; a pré-visualização da página, que roda no editor, tem limites próprios de tamanho e desiste em vez de travar
- **Cor de destaque escolhível** — as páginas da extensão deixam de ser sempre azuis. Seis cores (azul, roxo, verde, âmbar, rosa e ciano) mais o padrão **Automático**, que herda do tema do editor como sempre foi — quem não escolher nada não vê diferença. A cor alcança botões, item ativo da navegação, anéis de foco, badges de versão e a animação do título, nas cinco páginas. A paleta é fechada porque o valor entra direto em CSS: cada tom foi verificado com o texto que vai por cima e passa o mínimo AA de 4,5:1, com o hover escurecendo em vez de clarear, que reduziria o contraste. Não altera o realce de sintaxe, que tem esquema próprio
- **Controle do histórico na página de configurações** — as chaves `server.history.enabled` e `server.history.sensitiveCommands` existiam mas só podiam ser editadas à mão no `config.json`. Ganham lugar na seção Servidor: um interruptor para guardar ou não os comandos enviados, e uma lista para os comandos do gamemode que recebem senha, além dos que a extensão já reconhece sozinha
- **Ícones na navegação da página de Configurações** — cada seção da barra lateral (Compilador, Includes, Build, Análise, Formatação, Nomenclatura, Sintaxe, Interface, Servidor) ganha um ícone que acompanha os estados de hover e ativo. O rótulo trunca com reticências se o painel apertar, e o ícone permanece

### Alterado
- **Painel de comandos do servidor revisto** — "Enviar" e "Limpar" viram ícones, e **Recentes** e **Favoritos** passam a dividir o mesmo espaço em duas abas com a contagem de itens; antes eram duas listas empilhadas, que espremiam o painel. A estrela dos favoritos deixa de ser um emoji e acompanha o tema — contornada quando o comando não é favorito, cheia quando é. O layout encolhe junto com o painel em vez de quebrar
- **Busca e paginação nas listas de comandos** — um campo de busca filtra as listas conforme se digita, e elas passam a carregar 20 itens por vez, com "Mostrar mais". Antes o histórico inteiro (até 200 comandos) era desenhado de uma vez. A contagem na aba mostra "99+" acima de cem, para não empurrar o rótulo
- **Rolagem das listas** — a barra usava o estilo padrão do navegador, larga e clara, destoando do painel; passa a usar as cores do tema e a altura recorta em linhas inteiras, sem cortar um item ao meio
- **Painel de comandos traduzido** — era a única página da extensão com o texto fixo no código, o que também deixava acentos de fora ("historico", "Ultimos"). Passa pelo mesmo caminho das demais e acompanha a configuração "Idioma da interface" nos cinco idiomas
- **Mais codificações de caracteres** — os seletores de codificação (saída do compilador e log do servidor) passam a oferecer **UTF-8** e toda a família **Windows-1250 a 1257** (Europeu Central, Cirílico, Europeu Ocidental, Grego, Turco, Hebraico, Árabe, Báltico), além de Latin-1. Cobre projetos e logs em outros alfabetos além do padrão SA-MP. Rótulos regionais traduzidos por idioma
- **Traduções completas (EN, ES, RO, RU)** — as mensagens de runtime (`l10n/`) e os títulos de comando/config (`package.nls.*`) foram totalmente traduzidos para inglês, espanhol, romeno e russo (antes só o esqueleto existia, com a maior parte ainda em português). Termos técnicos consagrados (pawncc, RCON, gamemode, filterscript, include, breakpoint, SA-MP, open.mp) mantidos em inglês
- **Idioma da interface independente do editor** — nova configuração "Idioma da interface" (`ui.locale`): as páginas da extensão (Configurações, Ajuda, O que há de novo) passam a poder ter um idioma próprio, separado do idioma do editor e do idioma dos diagnósticos. Antes a UI seguia obrigatoriamente o idioma do editor (limitação do `vscode.l10n`); agora as WebViews traduzem a partir dos bundles `l10n/` conforme `ui.locale`. Padrão "Automático" (segue o editor)
- **Seletor de idioma com os 5 idiomas** — os seletores de idioma (interface e diagnósticos/debugger) na página de configurações passam a oferecer **Español, Română e Русский** além de Automático, Português e English. O de diagnósticos espelha o que a engine entrega; cada opção aparece no próprio idioma (endônimo)
- **Política de uso de IA** — novo `AI-POLICY.md` (referenciado no README, CONTRIBUTING e CODE_OF_CONDUCT): o uso de IA é permitido, quem contribui é o responsável pelo que envia, sem co-autoria de IA e sem preconceito quanto ao seu uso
- **Depreciação por `#pragma deprecated`** — marcar uma função como descontinuada passa a usar a diretiva do próprio compilador Pawn, na linha anterior à declaração, no lugar do comentário `// @DEPRECATED` que a extensão reconhecia antes. O texto após a diretiva é opcional e, quando presente, aparece junto do aviso — normalmente é onde se diz o que usar no lugar:

  ```pawn
  #pragma deprecated Use BanPlayerFor em vez desta
  stock BanTemporario(playerid, seconds) { }
  ```

  Como no compilador, a diretiva marca a **próxima** declaração e não tem forma na mesma linha. O que é coberto não mudou: `native`, `stock`, `public`, `forward`, `static`, `#define`, variáveis globais e `#include`. **Quem usava `// @DEPRECATED` precisa trocar pela diretiva** — o marcador antigo deixou de ser reconhecido, e o autocomplete do `@`, que existia só para inseri-lo, passou a oferecer as tags de documentação (`@param`, `@return`, `@remarks`) dentro de comentários
- **Compilador: a 3.10.10 também foi testada** — a página de Ajuda afirmava que a 3.10.11 era "a única existente e a testada". A 3.10.10 do compilador do open.mp também funciona, incluindo a depuração; no Windows a depuração ainda não foi verificada. A 3.10.11 segue sendo a recomendada
- **Depurador (PawnPro Debugger) para 0.2.0** — ver o [detalhamento da versão](https://github.com/NullSablex/PawnPro-Debugger/releases/tag/v0.2.0)
- **Motor de análise (engine) para 1.4.0** — ver o [detalhamento da versão](https://github.com/NullSablex/PawnPro-Engine/releases/tag/v1.4.0)
- **Dependências** — `typescript` para `^7.0.2`, `@types/node` para `^26.4.0`, `@types/vscode` para `1.134.0`, `esbuild` para `^0.28.2` e `vscode-languageclient` para `^10.1.1`
- **CI — GitHub Actions atualizadas** (pinadas por SHA): `github/codeql-action` 4.36.3 → 4.37.9 (passos `init`, `analyze` e `upload-sarif` mantidos alinhados na mesma versão), `actions/checkout` 7.0.0 → 7.0.1, `actions/setup-node` 6.4.0 → 7.0.0, `actions/stale` 10.3.0 → 11.0.0, `ossf/scorecard-action` 2.4.3 → 2.4.4 e `softprops/action-gh-release` 3.0.1 → 3.0.3
- **Docs (CI)** — `mkdocs-material` para 9.7.7 e `pymdown-extensions` para 11.0.2 no grupo pip da documentação (pinados por hash)
- **Dependabot — um PR por ecossistema** — as atualizações passam a ser agrupadas por ecossistema (npm, GitHub Actions, pip) em vez de abrir um PR por dependência, reduzindo o ruído de manutenção
- **Scorecard e CodeQL sob demanda** — os workflows de análise do OpenSSF Scorecard e do CodeQL passam a aceitar disparo manual (`workflow_dispatch`), sem depender do agendamento
- **Segurança de dependências** — atualizações de dependências transitivas do npm sinalizadas pelo Dependabot (grupo `npm_and_yarn`, incluindo `brace-expansion` e `js-yaml`)
- **Governança do repositório** — templates de *issue* (formulários) e de *pull request*, auto-classificação de PRs por caminho (labels de área), e `SECURITY.md` revisado (deixa de listar dependências empacotadas — o `.vsix` é a fonte da verdade do que é distribuído)

- **Página de configurações em painéis estreitos** — as larguras dos controles eram fixas e, num painel estreito, espremiam o rótulo ao lado; passam a ceder proporcionalmente, mantendo a medida atual em tela larga. O mesmo vale para o recuo lateral das páginas de Ajuda e O que há de novo, onde 3rem fixos consumiam 30% da largura disponível
- **Seta do grupo de estilos de nomenclatura** — era o caractere `▸`, desenhado pela fonte do sistema e destoando dos ícones da página; vira um triângulo próprio, no mesmo traço do resto da interface
- **Refinamentos visuais do painel do servidor** — cada ícone de estado vazio recebe a cor do que representa (a estrela dos favoritos no amarelo da estrela marcada, a lupa da busca sem resultado no tom de aviso), o espaçamento passa a seguir uma escala única em vez de valores avulsos, e o estado vazio ocupa a altura da lista em vez de ficar encostado no campo de busca.
- **Textos do painel mais diretos** — o placeholder e a dica ocupavam mais espaço do que informavam; viram "Digite um comando" e uma linha que responde à dúvida real de quem usa o painel: escreve-se sem barra (`gmx`, `kick 0`), porque o prefixo `rcon` já é removido no envio.

### Segurança
- **Segurança do envio por RCON** — o protocolo do SA-MP manda a senha em **texto claro** por UDP, sem cifra nem desafio. O envio direto passa a valer só para o servidor **local**; para um remoto, o painel usa o terminal, que não trafega credencial. A resposta passa a ser conferida (origem e assinatura do protocolo) antes de aparecer no painel — antes, qualquer pacote UDP que chegasse à porta era exibido como se fosse do servidor. Senhas com acento deixam de ser corrompidas na montagem do pacote, e campos acima do limite do protocolo falham com erro em vez de gerar um pacote inválido. Um `login <senha>` digitado sem o prefixo `rcon` também tem a senha removida antes de ir para o log e o histórico — antes a limpeza só valia depois de `rcon `
- **Estado local protegido** — `.pawnpro/state.json` guarda o histórico de comandos do servidor e era criado com a permissão padrão, legível por outros usuários da máquina, e sem nada que impedisse o commit. Passa a ser gravado com permissão restrita ao dono (0600) e a pasta `.pawnpro/` ganha um `.gitignore` próprio cobrindo o arquivo — sem tocar no `.gitignore` da raiz, que é do projeto
- **Comandos com credencial não são mais guardados** — o histórico e os favoritos vão para `.pawnpro/state.json`, em texto claro dentro do projeto; um `login`, `rcon_password` ou `changepassword` ficava registrado ali e podia ser commitado junto. Também é reconhecida a senha passada como **argumento** (`--senha abc123`, `auth token xK9mP2qL`) e um termo solto que só possa ser credencial, sem afetar argumentos comuns como `kick 0` ou `setpos 1.5 -2.0`. O projeto pode listar os próprios comandos em `server.history.sensitiveCommands`, ou desligar o registro por completo com `server.history.enabled`. Esses comandos continuam sendo enviados, só não são gravados — e o que já havia sido guardado é removido ao abrir o painel

### Corrigido
- **Ícone da busca sem resultado com aparência de campo de texto** — o ícone do estado vazio recebe o tipo como classe; quando a busca não encontrava nada o tipo era `search`, que colidia com o seletor do próprio campo de busca e vestia o ícone de largura, borda e fundo de input. O seletor passa a ser ancorado no elemento
- **Textos do painel encolhiam sem necessidade** — as consultas de tamanho mediam a janela inteira (`vw`), então uma janela estreita reduzia as fontes ao mínimo mesmo com o painel tendo espaço. Passam a medir o próprio painel, e os textos só cedem quando ele realmente aperta
- **Dois scrolls concorrentes no painel** — a página e a lista rolavam separadamente, e o conteúdo podia empurrar o painel além da altura disponível. A lista passa a ocupar o espaço restante e a rolar sozinha
- **Estilos de nomenclatura em grade irregular** — a grade estava fixada em três linhas por duas colunas, seis células para cinco estilos, e o último caía sozinho numa linha com um vão ao lado
- **Rótulo dos comandos sensíveis colapsado** — o campo usa um controle de largura total, mas a linha não tinha a classe que permite a quebra; sem ela o controle disputava o eixo horizontal com o rótulo, que quebrava uma palavra por linha sob o botão de adicionar
- **Blocos de código na página "O que há de novo"** — o renderizador de Markdown da página não conhecia blocos cercados por crases: as cercas apareciam literalmente e o código dentro delas era tratado como texto comum, perdendo a formatação e ganhando destaque em pedaços soltos. Passam a virar blocos de código de verdade, com o conteúdo intacto — dentro deles nada é interpretado como marcação
- **Hierarquia de listas na página "O que há de novo"** — comparado com o renderizador do GitHub, o parser de Markdown da página divergia em dois pontos: a sub-lista era fechada fora do item pai, deixando os sub-itens como irmãos em vez de filhos, e o texto que continuava um item depois de um bloco de código perdia o vínculo com ele, virando um parágrafo solto com a cor de descrição. Uma linha em branco também encerrava a lista, o que em Markdown não acontece
- **X de limpar a busca invisível** — no painel do servidor, o botão de limpar o campo de busca apontava a máscara para uma variável de `:root`, que não alcança o pseudo-elemento do input por ele viver no shadow DOM; restava um quadrado da cor de fundo
- **Detecção de open.mp vs SA-MP trocada** — o tipo do servidor era decidido só pela presença de um `config.json` na pasta, e isso errava nos dois sentidos: um servidor **open.mp recém-baixado ainda não tem `config.json`** (ele é gerado na primeira execução) e era tratado como SA-MP; um servidor **SA-MP com um `config.json` de outra ferramenta** na mesma pasta era tratado como open.mp. O erro se propagava para o arquivo de log acompanhado, a leitura de RCON e o preflight do depurador — que checava a pasta e o registro errados. A detecção passa a olhar, em ordem: o **executável** (`omp-server` vs `samp03svr`/`samp-server`), a pasta **`components/`**, um `config.json` que tenha mesmo as **chaves do open.mp** (e não qualquer JSON homônimo) e, por fim, o `server.cfg`. Definir `server.type` como `samp` ou `omp` na configuração continua tendo precedência sobre a detecção
- **Descrição enganosa do seletor de idioma** — dizia "Vazio segue o editor", mas a opção correspondente que o usuário vê é "Automático" (não há opção "vazio" visível). Reescrita para "'Automático' acompanha o idioma do editor"
- **CI: saudação a novos contribuidores falhando** — o workflow `Greetings` usava os inputs no formato antigo (`repo-token`, `issue-message`, `pr-message`), ignorados pela `actions/first-interaction` v3.x, o que abortava a action com `Input required and not supplied: issue_message`. Renomeados para `repo_token`, `issue_message` e `pr_message`. Além disso, o job passa a ser pulado quando o autor é um bot (`if: !endsWith(github.actor, '[bot]')`), evitando saudar automações como o Dependabot
- **CI: análise CodeQL falhando por versão inconsistente** — nos bumps do `codeql-action`, os passos `init` e `analyze` chegaram a ficar em versões diferentes (o que quebra o job "Analyze TypeScript"). Passam a ser atualizados sempre juntos, no mesmo SHA

### Documentação
- **Guia do servidor** (`docs/server.md`) — página nova: iniciar, parar e reiniciar; envio de comandos por RCON com a senha lida do `server.cfg`/`config.json`; as abas de recentes e favoritos com busca; o que não é guardado no histórico e por quê; e o acompanhamento do log, com a limitação a Linux e macOS. A página de Ajuda já apontava para ela
- **Documentação atualizada para a 3.5.0** — o padrão próprio de nomenclatura e a cor de destaque entram no guia de recursos e na referência de configuração; as chaves `server.history.enabled` e `server.history.sensitiveCommands` entram na tabela, onde faltavam; a descrição do painel do servidor deixa de citar botões que viraram abas; o `PP0019` entra na tabela de diagnósticos e a contagem passa de 18 para 19 códigos no README e na página inicial. No guia do assistente de nomes, o exemplo de configuração mostrava os estilos como texto e citava uma categoria `enums` inexistente — são listas, e as categorias são `constants` e `macros`

## [3.4.2] - 04/07/2026

> As versões **3.4.0** e **3.4.1** foram publicadas sem o binário do depurador no
> VSIX: o workflow de release definia o artefato do depurador na matriz, mas não
> tinha o passo que o baixava antes de empacotar. A **3.4.2** corrige o release
> (o depurador agora é incluído no pacote). O conteúdo abaixo é o desta linha 3.4.

### Adicionado
- **Depurador (DAP)** — integração com o **PawnPro Debugger** (binário externo): a extensão registra o tipo de depuração `pawn`, com `contributes.debuggers`, `breakpoints` para a linguagem Pawn e uma `launch.json` padrão. Ao iniciar a sessão (F5), recompila o `.pwn` com `-d3` automaticamente (sem alterar a configuração do usuário), sobe o servidor e conecta o adaptador
  - Detecção do plugin oficial pelo símbolo marcador (`PAWNPRO_DEBUG_MARKER`) embutido no `.so`, e preflight antes de iniciar
  - Recursos do depurador: breakpoints simples, **condicionais**, **por contagem de acertos** (hit count), **logpoints**, step (in/out/over), inspeção de variáveis (int/float/bool/array/hex), watch, hover, editar variável e **pausar em erro de runtime** (divisão por zero, índice de array fora do limite)
  - As mensagens de erro do depurador seguem o mesmo idioma da engine (config `pawnpro.locale`)
- **Página "Ajuda e informações"** — comando **"PawnPro: Ajuda e informações"** (também no menu de ações da status bar) que abre uma página com: o **compilador recomendado** em destaque (o compilador do open.mp **3.10.11**, único testado no momento), as **versões atuais** dos componentes (extensão, engine LSP e adaptador do depurador), **links** (documentação, repositórios e reportar problema) e um **guia rápido do depurador** — como instalar o plugin no servidor (SA-MP/open.mp) e como iniciar a depuração
- **Biblioteca de Recursos — recursos adicionados ao projeto** — filtro **"Adicionados"** para ver só o que está no projeto, **selo "Adicionado"** nos cards, e ações contextuais na página de detalhe: **Adicionar** (com seletor de versão) quando ainda não está no projeto, **Remover** quando já está. Nesta prévia o estado é de exemplo (não altera o projeto de verdade)
- **Preservar alinhamento de arrays** — nova opção de formatação (`format.preserveArrayAlignment`, com toggle na página de configurações): mantém intacto o alinhamento manual em colunas de inicializadores de array `{ }` quebrados em várias linhas
- **Dependabot e sincronização de labels** — `.github/dependabot.yml` (atualizações semanais de dependências npm e GitHub Actions) e workflow que sincroniza os labels do repositório a partir de `.github/labels.yml`
- **Blindagem por SHA dos binários** — os binários externos (engine e adaptador do depurador) podem ter o checksum SHA-256 fixado no `package.json` (`engineChecksums`/`debuggerChecksums`); quando presente, é a fonte da verdade na verificação, protegendo contra republicação de uma release. Modo `--pin` no script de download para gerar/atualizar os checksums

### Alterado
- **Página "Biblioteca de Recursos"** — layout, responsividade e legibilidade revistos: espaçamentos fluidos com `clamp()` (sem breakpoints), grade que adapta ao painel, separação clara entre descrição e informações, botão de ação e seletor de versão reformulados (controles separados, melhor alinhamento), seção "Informações" com espaçamento ajustado, e **tipografia maior** (títulos, autor, chips e badges dos cards) com o contador de resultados mais destacado. O filtro/selo "Adicionados" usa uma cor verde discreta própria, distinta dos filtros de Tipo/Fonte
- **Cor de foco das páginas** — o realce de foco/seleção nas webviews (configurações, biblioteca) passa a usar a cor de botão do tema em vez da borda de foco, evitando o destaque amarelo de alguns temas
- **Configuração de idioma** — a config `pawnpro.locale` agora também controla as mensagens do depurador, além dos diagnósticos da engine; descrição atualizada na página de configurações
- **Dependências** — `@types/node` para `^26.1.0`, `vscode-languageclient` para `^10.1.0` e `iconv-lite` para `^0.7.3`
- **Build** — download dos binários unificado em `scripts/download-binaries.js` (substitui `scripts/download-engine.js`), cobrindo engine e adaptador do depurador
- **CI — dependências das GitHub Actions atualizadas** (pinadas por SHA): `actions/checkout` 4.2.2 → 7.0.0, `actions/upload-pages-artifact` 3.0.1 → 5.0.0, `actions/first-interaction` 1.3.0 → 3.1.0 e `github/codeql-action` 4.36.2 → 4.36.3

### Corrigido
- **Ícone da aba das páginas em WebView** — as páginas "O que há de novo" e "Ajuda e informações" mostravam o ícone de arquivo genérico na aba, em vez do ícone da extensão. As WebViews ignoram `<link rel="icon">` no HTML; o ícone da aba é definido por `panel.iconPath`. A página "O que há de novo" arrastava esse comportamento desde a **2.1.0-rc.1** (quando foi introduzida); agora ambas usam o ícone da extensão, como as demais páginas (Configurações, Biblioteca de Recursos)
- **CI: análise CodeQL falhando por versão inconsistente** — o workflow tinha `github/codeql-action/init` e `.../analyze` pinados em versões diferentes (4.36.2 e 4.36.3), causando o erro `Loaded a configuration file for version '4.36.3', but running version '4.36.2'`. Ambos os passos passam a usar a **v4.36.3**

### Documentação
- **Guia de depuração** (`docs/debugging.md`) — como funciona (adaptador local + plugin no servidor), o passo único de colocar o plugin do servidor na pasta correta (SA-MP/open.mp), como iniciar a sessão (F5) e um exemplo de `launch.json`. A extensão apenas **verifica** (preflight) se o plugin está presente — não o instala

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
- **Actions de CI atualizadas para Node 24** — `checkout`, `setup-node`, `stale`, `deploy-pages` e `action-gh-release` subiram para versões baseadas em Node 24, eliminando o aviso de deprecação do Node 20 nos runners do GitHub

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
