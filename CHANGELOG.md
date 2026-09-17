# Changelog
Todas as mudanças notáveis neste projeto serão documentadas aqui.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

Podem existir falhas ou itens não declarados, causados por falha humana ou por IA, caso encontre por favor relate para ajudar a manter a consistência dos dados.

## Versões anteriores

- [Versões 3.x](changelogs/CHANGELOG_v3.md)
- [Versões 2.x e anteriores](changelogs/CHANGELOG_v2.md)

---

## [4.0.0] - 07/09/2026

### Adicionado

- **Registro de diagnóstico.** A extensão, o core e a engine passam a gravar o que fazem em `.pawnpro/logs/` — um `pawnpro.log` com tudo na ordem em que aconteceu, e um arquivo por componente para isolar cada um. Níveis `off`, `error`, `warn` e `info`, ajustáveis por "PawnPro: nível do diagnóstico" ou pela chave `diagnostics.level`. Desligado de fábrica: nada é escrito e nenhuma pasta é criada até você ligar. Tem seção própria na tela de configurações — nível, abrir e apagar — além dos comandos na paleta. Os arquivos entram sozinhos no `.gitignore` do `.pawnpro`.
- **Ir para definição** (F12 / Ctrl+clique): leva à declaração no próprio arquivo, nos includes ou em outro arquivo compilado junto. Num `forward`, vai ao corpo da função.
- **Depuração de filterscripts.** Aponte `program` para o `.amx` de um filterscript: só ele para nos breakpoints, e os outros scripts do servidor seguem rodando.
- **Avisos de licença do core no VSIX.** O binário do núcleo leva bibliotecas de terceiros, e os avisos delas passam a acompanhá-lo em `bin/pawnpro-core-THIRD-PARTY.txt`.
- **Breakpoints sobrevivem a edições durante a sessão.** O texto de quando o script foi compilado fica guardado, e cada breakpoint é levado para a linha equivalente do binário em execução. Uma linha nova, sem código compilado, fica como não verificada até reiniciar.

### Alterado

- A extensão passa a falar com o **pawnpro-core**, um binário Rust que possui os processos, as portas, o RCON, o compilador e a configuração. O que era decidido por sinal indireto no TypeScript passou a ser respondido por quem possui o recurso.
- A engine deixou de ser um processo à parte: vive dentro do core, que a hospeda num soquete local (named pipe no Windows) e lhe entrega a configuração já resolvida. O editor conecta no endereço que o core informa.
- Mudanças no `config.json` e nas listas `.ban`/`.allow` chegam à engine sem o editor pedir — quem observa os arquivos agora é o core.
- O VSIX passa a trazer o binário do core no lugar do da engine.
- Os textos novos — seção de diagnóstico, avisos do núcleo e da engine, ajuda — ganham tradução em inglês, espanhol, romeno e russo. Duas mensagens citavam comandos por um nome que não existe na paleta; agora usam o título real.
- A ajuda passa a indicar o release do PawnPro Core para baixar o plugin do servidor.
- **O depurador passa a viver no core.** O adaptador deixou de ser um binário à parte: a extensão pede o endereço ao core e fala com ele pelo mesmo soquete local do IntelliSense, onde o plugin do servidor também conecta. Não há mais binário do adaptador para localizar, e a sessão sobe e derruba o servidor sozinha. O depurador segue marcado como instável.
- Parar a depuração encerra o servidor na hora — antes levava mais de dez segundos.
- Compilar, localizar o servidor, ler o log, filtrar comandos com senha do histórico e montar "O que há de novo" passam a ser feitos pelo core. A compilação roda em segundo plano, sem prender o resto da extensão enquanto o `pawncc` trabalha.
- **Documentação revista** contra o código: guia de depuração reescrito, ordem real de detecção do compilador, chaves e comandos que faltavam, severidade e correções de cada diagnóstico, guias do assistente de nomes e de idiomas atualizados. Saíram afirmações que não valiam mais — como o `state.json` coberto pelo `.gitignore` do projeto (quem o exclui é um `.pawnpro/.gitignore` criado pela extensão).
- A configuração, o estado do projeto, as flags do compilador e a resolução de includes também passam a ser do core: o `src/core` da extensão vira uma camada fina sobre ele, e as duas pontas não podem mais discordar sobre um valor.
- **IntelliSense pela unidade de compilação.** Hover, assinatura, autocomplete, referências e o contador acima das funções enxergam tudo o que é compilado junto com o arquivo — o `.inc` irmão, incluído pelo mesmo `.pwn`, inclusive fechado — e nunca outro programa: gamemode e filterscript não se misturam, mesmo com funções de mesmo nome.
- **Renomear com escopo.** Um local é renomeado só no bloco onde foi declarado, e um parâmetro, só na própria função. Renomear uma `public` atualiza também o nome em `SetTimer("Nome", …)` e afins. Renomear uma variável global que tenha um local ou parâmetro com o mesmo nome é recusado, com o motivo e o lugar do conflito — sem análise de escopo, renomear por nome alteraria os dois.
- O seletor de SDK nas configurações ganha **Automático**, que é o padrão do core: usa o SDK do open.mp quando o projeto o tem (`qawno/include/open.mp.inc`, ou o caminho configurado) e, sem ele, as nativas vêm dos includes, como no SA-MP.
- **A análise vale para o texto não salvo**: o que se escreve num include aberto já conta nos outros arquivos, antes de salvar.
- **Análise mais rápida em projetos grandes**: num gamemode com 84 includes, cada edição passou de cerca de 1 s para 0,2 s.
- O Dependabot deixa de atualizar o `@types/vscode`, que só sobe junto com o `engines.vscode`: tipos mais novos que a versão mínima prometida fazem o empacotamento recusar e liberam APIs que ela não tem.
- Licença revisada, sem contradições no texto.

### Corrigido

- **As páginas voltaram a responder aos cliques.** A política de segurança usa nonce, e nonce não vale para atributo de evento: os `onclick`/`onchange` que os controles traziam no HTML eram bloqueados pelo navegador, e o sintoma era a página inteira muda — sem erro no console, porque violação de política não dispara `error`. Os controles passaram a declarar a intenção (`data-on`, `data-set`, `data-action`) e o script os liga por delegação, o que dispensa qualquer exceção na política. Valeu para a tela de configurações e para a loja, que também deixou de precisar de `unsafe-inline`.
- A ativação não depende mais do IntelliSense subir. Ela ficava presa numa chamada ao núcleo sem prazo, e o que era registrado depois — a tela de configurações, a loja e a barra de status — nunca chegava a existir. As chamadas ao núcleo agora têm prazo e falham em vez de esperar para sempre.
- Uma falha no envio por RCON mostra o motivo — "Servidor não está em execução" — em vez do código interno (`RCON: serverDown`).
- Um servidor que encerra logo ao iniciar, por exemplo por falta de um plugin, é informado na hora com o código de saída, em vez de a extensão esperar a porta até o prazo acabar.
- **A formatação deixou de danificar o código** em comentários no fim da linha e de bloco, em strings com espaço e em macros com continuação `\`, e passou a ser estável: formatar de novo não muda mais nada.
- Um nome escrito dentro de uma string deixa de contar como referência, e uma chamada numa declaração `new x = Funcao();` deixa de ser ignorada.
- `native` e `forward` com corpo aberto na linha seguinte voltam a ser acusados, e uma diretiva recuada (`    #include`) passa a ser reconhecida.
- **Breakpoint parando na linha errada.** Com o arquivo editado depois da compilação, o breakpoint parava noutro código; agora é levado à linha certa do binário em execução.
- **Breakpoints de um gamemode disparando em filterscripts.** O plugin passa a reconhecer qual script é o depurado e só instala o controle nele.
- **Breakpoints em includes por caminho relativo** (`#include "../include/x.inc"`) passam a ser atingidos.
- **Arrays na depuração.** Elementos de arrays de várias dimensões e de arrays recebidos por referência mostravam valores de outra posição da memória; data breakpoints e edição em `grid[i][j]` passam a funcionar.
- A edição de uma variável só aparece como feita depois que o servidor confirma a escrita.
- A pilha de chamadas mostra o arquivo de cada frame — um frame dentro de um include abria o arquivo principal.
- Reiniciar ou iniciar a depuração com um `.amx` sem informação de depuração recompila, em vez de subir um binário em que nenhum breakpoint pega.
- A barra "Parando servidor..." ficava presa depois de encerrar a depuração.
- **Codificação do log e da saída do compilador.** Só `windows1252`, `utf8` e `latin1` eram reconhecidas: as demais opções do seletor (`windows1250`, `windows1251`, `windows1253` a `windows1257`) caíam em silêncio no windows-1252, e um log em cirílico saía ilegível.
- Os títulos das correções rápidas ("Remover variável não usada", "Corrigir a indentação"…) apareciam sempre em português; agora seguem o idioma configurado, como os diagnósticos.

### Removido

- O TypeScript que duplicava o que o core faz: leitura do `server.cfg`/`config.json`, varredura de portas por `lsof`/`/proc`/`netstat`, verificação do plugin de depuração, detecção do `pawncc`, execução do compilador, detecção do executável e do tipo de servidor, leitura do log, filtro de comandos sensíveis e o cliente RCON em UDP.
- A dependência `iconv-lite`: a decodificação de saída e log é do core.
- Os campos `server`, `session` e `stopOnEntry` do `launch.json`, que eram ignorados. O servidor vem da seção `server` da configuração.
