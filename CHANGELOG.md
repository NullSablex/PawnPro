# Changelog
Todas as mudanças notáveis neste projeto serão documentadas aqui.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

Podem existir falhas ou itens não declarados, causados por falha humana ou por IA, caso encontre por favor relate para ajudar a manter a consistência dos dados.

## Versões anteriores

- [Versões 3.x](changelogs/CHANGELOG_v3.md)
- [Versões 2.x e anteriores](changelogs/CHANGELOG_v2.md)

---

## [4.0.0] - 21/09/2026

> Versão de arquitetura: tudo o que a extensão fazia em TypeScript sobre processos, portas, RCON, compilador, configuração e includes passa a ser feito pelo **pawnpro-core**, um binário Rust que também hospeda o motor de análise e o depurador. A configuração e os projetos existentes seguem valendo.

### Adicionado

- **Registro de diagnóstico.** A extensão, o core e a engine passam a gravar o que fazem em `.pawnpro/logs/` — um `pawnpro.log` com tudo na ordem em que aconteceu, e um arquivo por componente para isolar cada um. Níveis `off`, `error`, `warn` e `info`, ajustáveis por "PawnPro: Nível do diagnóstico" ou pela chave `diagnostics.level`. Desligado de fábrica: nada é escrito e nenhuma pasta é criada até você ligar. Tem seção própria na tela de configurações — nível, abrir e apagar — e os comandos "Abrir o log de diagnóstico" e "Apagar o log de diagnóstico" na paleta. Os arquivos entram sozinhos no `.gitignore` do `.pawnpro`.
- **Ir para definição** (F12 / Ctrl+clique): leva à declaração no próprio arquivo, nos includes ou em outro arquivo compilado junto. Num `forward`, vai ao corpo da função.
- **A engine volta sozinha quando cai.** Uma falha no motor de análise não derruba mais o IntelliSense até recarregar a janela: ele sobe de novo e um aviso diz quantas vezes isso já aconteceu. Se cair cinco vezes seguidas, desiste e avisa — "PawnPro: Limpar Cache" tenta de novo.
- **Aviso quando o núcleo não está disponível**, dizendo o que fica fora do ar (configuração, IntelliSense, painel do servidor e compilação), em vez de a extensão abrir sem nada funcionar e sem explicação.
- **Depuração de filterscripts.** Aponte `program` para o `.amx` de um filterscript: só ele para nos breakpoints, e os outros scripts do servidor seguem rodando.
- **Breakpoints sobrevivem a edições durante a sessão.** O texto de quando o script foi compilado fica guardado, e cada breakpoint é levado para a linha equivalente do binário em execução. Uma linha nova, sem código compilado, fica como não verificada até reiniciar.
- **Avisos de licença do core no VSIX.** O binário do núcleo leva bibliotecas de terceiros, e os avisos delas passam a acompanhá-lo em `bin/pawnpro-core-THIRD-PARTY.txt`.

### Alterado

#### Núcleo

- A extensão passa a falar com o **pawnpro-core**, que possui os processos, as portas, o RCON, o compilador, a configuração, o estado do projeto e os includes. O que era decidido por sinal indireto no TypeScript passou a ser respondido por quem possui o recurso, e as duas pontas não podem mais discordar sobre um valor.
- A engine e o depurador deixaram de ser binários à parte: vivem dentro do core, que atende o IntelliSense, a depuração e o plugin do servidor por um único soquete local (named pipe no Windows). O VSIX traz um binário só, na pasta `bin/`.
- Mudanças no `config.json` — global e do projeto — e nas listas `.ban`/`.allow` chegam à engine sem o editor pedir: quem observa os arquivos agora é o core.
- Um valor com tipo errado no `config.json` é ignorado sozinho, e o resto do arquivo continua valendo. Sem o núcleo, a configuração fica nos padrões e gravar falha com uma mensagem, em vez de se perder em silêncio.
- Compilar, localizar o servidor, ler o log, filtrar comandos com senha do histórico e montar "O que há de novo" passam a ser feitos pelo core. A compilação roda em segundo plano, sem prender o resto da extensão enquanto o `pawncc` trabalha.
- Encerrar um processo na porta confere de novo, na hora do pedido, se ele é o servidor do projeto e do mesmo usuário.

#### IntelliSense

- **Unidade de compilação.** Hover, assinatura, autocomplete, referências e o contador acima das funções enxergam tudo o que é compilado junto com o arquivo — o `.inc` irmão, incluído pelo mesmo `.pwn`, inclusive fechado — e nunca outro programa: gamemode e filterscript não se misturam, mesmo com funções de mesmo nome.
- **Renomear com escopo.** Um local é renomeado só no bloco onde foi declarado, e um parâmetro, só na própria função. Renomear uma `public` atualiza também o nome em `SetTimer("Nome", …)` e afins. Renomear uma variável global que tenha um local ou parâmetro com o mesmo nome é recusado, com o motivo e o lugar do conflito.
- **A análise vale para o texto não salvo**: o que se escreve num include aberto já conta nos outros arquivos, antes de salvar.
- **Análise mais rápida em projetos grandes**: num gamemode com 84 includes, cada edição passou de cerca de 1 s para 0,2 s.
- O seletor de SDK nas configurações ganha **Automático**, que passa a ser o padrão: usa o SDK do open.mp quando o projeto o tem (`qawno/include/open.mp.inc`, ou o caminho configurado) e, sem ele, as nativas vêm dos includes, como no SA-MP.

#### Depuração

- **O adaptador vive no core.** A extensão pede o endereço ao core e fala com ele pelo mesmo soquete do IntelliSense, onde o plugin do servidor também conecta. Não há mais binário do adaptador para localizar, e a sessão sobe e derruba o servidor sozinha. O depurador segue marcado como **instável**.
- **O plugin do servidor sai no release do PawnPro Core** e precisa ser da mesma versão da extensão: ao atualizar o PawnPro, atualize o plugin. A ajuda aponta o release certo e mostra a versão do núcleo no lugar das versões da engine e do depurador.
- Ao depurar, qualquer `-d` da configuração é trocado por `-d3` só nessa compilação. Antes a flag só era acrescentada quando não havia nenhuma, e um `-d0` ou `-d1` configurado deixava o `.amx` sem as informações simbólicas que os breakpoints e as variáveis precisam.
- Parar a depuração encerra o servidor na hora — antes levava mais de dez segundos.

#### Servidor

- Cada falha de envio por RCON tem a sua mensagem: servidor parado, RCON desligado, senha inválida, servidor remoto e tempo esgotado — este último é novo, com o prazo que foi esperado.

#### Outros

- Os textos novos ganham tradução em inglês, espanhol, romeno e russo. Duas mensagens citavam comandos por um nome que não existe na paleta; agora usam o título real.
- **Documentação revista** contra o código: guia de depuração reescrito, ordem real de detecção do compilador, chaves e comandos que faltavam, severidade e correções de cada diagnóstico, guias do assistente de nomes e de idiomas atualizados.
- Licença revisada, sem contradições no texto.
- A saudação de primeira *issue* ou primeiro *pull request* passa a aparecer só na primeira vez de quem não é do projeto. Antes o dono do repositório era saudado a cada PR, e o Dependabot também.
- **Dependências:** sai o `iconv-lite`; actions do CI atualizadas (`codeql-action` 4.38.0, `deploy-pages` 5.0.1). O Dependabot deixa de atualizar o `@types/vscode`, que só sobe junto com o `engines.vscode`: tipos mais novos que a versão mínima prometida fazem o empacotamento recusar e liberam APIs que ela não tem.

### Corrigido

#### Interface

- **As páginas voltaram a responder aos cliques.** A política de segurança usa nonce, e nonce não vale para atributo de evento: os `onclick`/`onchange` que os controles traziam no HTML eram bloqueados pelo navegador, e o sintoma era a página inteira muda — sem erro no console, porque violação de política não dispara `error`. Os controles passaram a declarar a intenção (`data-on`, `data-set`, `data-action`) e o script os liga por delegação, o que dispensa qualquer exceção na política. Valeu para a tela de configurações e para a loja, que também deixou de precisar de `unsafe-inline`.
- A ativação não depende mais do IntelliSense subir. Ela ficava presa numa chamada ao núcleo sem prazo, e o que era registrado depois — a tela de configurações, a loja e a barra de status — nunca chegava a existir.
- Os títulos das correções rápidas ("Remover variável não usada", "Corrigir a indentação"…) apareciam sempre em português; agora seguem o idioma configurado, como os diagnósticos.

#### IntelliSense

- **A formatação deixou de danificar o código** em comentários no fim da linha e de bloco, em strings e caracteres com espaço e em macros com continuação `\`, e passou a ser estável: formatar de novo não muda mais nada.
- Avisos de um texto que já não existe deixam de aparecer: uma análise que termina depois de uma nova edição é descartada.
- A engine entrava em pane com letras acentuadas — num nome cortado no limite de 31 bytes, e na assinatura com acento antes do cursor.
- Um nome escrito dentro de uma string deixa de contar como referência; uma chamada numa declaração `new x = Funcao();` deixa de ser ignorada; e a coluna da referência fica certa com acento antes do nome na linha.
- `PP0012` (`#include` sem símbolos usados) não disparava, e a verificação de não usados não via uma edição feita em outro arquivo.
- `native` e `forward` com corpo aberto na linha seguinte voltam a ser acusados, e uma diretiva recuada (`    #include`) passa a ser reconhecida.

#### Depuração

- **Breakpoint parando na linha errada.** Com o arquivo editado depois da compilação, o breakpoint parava noutro código; agora é levado à linha certa do binário em execução.
- **Breakpoints de um gamemode disparando em filterscripts.** O plugin passa a reconhecer qual script é o depurado e só instala o controle nele.
- **Breakpoints em includes por caminho relativo** (`#include "../include/x.inc"`) passam a ser atingidos.
- **Arrays.** Elementos de arrays de várias dimensões e de arrays recebidos por referência mostravam valores de outra posição da memória; data breakpoints e edição em `grid[i][j]` passam a funcionar.
- A edição de uma variável só aparece como feita depois que o servidor confirma a escrita.
- A pilha de chamadas mostra o arquivo de cada frame — um frame dentro de um include abria o arquivo principal.
- Iniciar ou reiniciar a depuração com um `.amx` sem informação de depuração recompila, em vez de subir um binário em que nenhum breakpoint pega.
- A barra "Parando servidor..." ficava presa depois de encerrar a depuração.

#### Servidor

- Uma falha no envio por RCON mostra o motivo — "Servidor não está em execução" — em vez do código interno (`RCON: serverDown`).
- Um servidor que encerra logo ao iniciar, por exemplo por falta de um plugin, é informado na hora com o código de saída, em vez de a extensão esperar a porta até o prazo acabar.
- **Codificação do log e da saída do compilador.** Só `windows1252`, `utf8` e `latin1` eram reconhecidas: as demais opções do seletor (`windows1250`, `windows1251`, `windows1253` a `windows1257`) caíam em silêncio no windows-1252, e um log em cirílico saía ilegível.

### Removido

- O TypeScript que duplicava o que o core faz: leitura do `server.cfg`/`config.json`, varredura de portas por `lsof`/`/proc`/`netstat`, verificação do plugin de depuração, detecção do `pawncc`, execução do compilador, detecção do executável e do tipo de servidor, leitura do log, filtro de comandos sensíveis e o cliente RCON em UDP.
- Os campos `server`, `session` e `stopOnEntry` do `launch.json`, que eram ignorados. O servidor vem da seção `server` da configuração.
