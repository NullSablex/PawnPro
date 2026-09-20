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

> **O que muda em relação à 3.5.1.** A extensão comandava, em TypeScript, coisas
> que não possuía: processos do servidor, portas, RCON, o compilador, a
> configuração e a resolução de includes. Cada uma dessas tarefas tinha um
> caminho diferente por sistema operacional e dependia de sinal indireto, e a
> configuração era lida em dois lugares ao mesmo tempo — daí vinha boa parte dos
> defeitos: o IntelliSense discordando do que o compilador enxergava, includes
> resolvidos de um jeito na análise e de outro na compilação, e uma resposta
> diferente por sistema. A 4.0.0 move tudo isso para o **pawnpro-core**, um
> binário em Rust que acompanha a extensão e que também passa a hospedar o motor
> de análise e o depurador.
>
> Sua configuração e seus projetos continuam valendo, e não há nada novo a
> instalar: o núcleo vem dentro da extensão.

### Adicionado

- **Ir para definição** (F12 / Ctrl+clique): leva à declaração no próprio arquivo, nos includes ou em outro arquivo compilado junto. Num `forward`, vai ao corpo da função.
- **Registro de diagnóstico.** A extensão, o núcleo e o motor de análise gravam o que fazem em `.pawnpro/logs/`, para você poder relatar um problema com o que aconteceu de fato: um `pawnpro.log` com tudo na ordem e um arquivo por componente. Níveis `off`, `error`, `warn` e `info`, pela seção **Diagnóstico** das configurações ou por "PawnPro: Nível do diagnóstico". Desligado de fábrica, e nenhum arquivo é criado até você ligar; os arquivos entram sozinhos no `.gitignore` do `.pawnpro`.
- **Depuração de filterscripts.** Aponte `program` para o `.amx` de um filterscript: só ele para nos breakpoints, e os outros scripts do servidor seguem rodando.
- **Breakpoints sobrevivem a edições durante a sessão.** O texto de quando o script foi compilado fica guardado, e cada breakpoint é levado para a linha equivalente do binário em execução. Uma linha nova, sem código compilado, fica como não verificada até reiniciar.
- **O IntelliSense volta sozinho quando cai.** Antes, uma falha no motor deixava o editor sem análise até recarregar a janela. Agora ele sobe de novo, e um aviso diz quantas vezes isso aconteceu; depois de cinco quedas seguidas, desiste e avisa — "PawnPro: Limpar Cache" tenta de novo.

### Alterado

#### O que você percebe no dia a dia

- **O IntelliSense enxerga o programa inteiro, e só ele.** Hover, assinatura, autocomplete, referências e o contador acima das funções passam a considerar tudo o que é compilado junto com o arquivo aberto — inclusive o `.inc` irmão que você não abriu — e nunca outro programa: gamemode e filterscript deixam de se misturar, mesmo com funções de mesmo nome.
- **Renomear (F2) respeita escopo.** Um local muda só no bloco onde foi declarado, e um parâmetro, só na própria função. Renomear uma `public` atualiza o nome em `SetTimer("Nome", …)` e afins. Renomear uma global que tenha um local ou parâmetro homônimo é recusado, dizendo onde está o conflito — antes os dois eram trocados juntos.
- **A análise vale para o texto não salvo:** o que você escreve num include aberto já conta nos outros arquivos, antes de salvar.
- **Projetos grandes ficaram rápidos.** Num gamemode com 84 includes, cada edição passou de cerca de 1 s para 0,2 s.
- **A extensão não trava mais esperando o compilador:** ele roda em segundo plano, e o resto da interface segue respondendo.
- **Cada falha de RCON diz o que houve** — servidor parado, RCON desligado no `config.json`, senha inválida, servidor remoto ou tempo esgotado — em vez de um código interno.
- **Um servidor que morre logo ao iniciar** (falta de plugin, por exemplo) é informado na hora, com o código de saída, em vez de a extensão esperar a porta até o prazo acabar.
- **Um valor com tipo errado no `config.json`** é ignorado sozinho, e o resto do arquivo continua valendo.
- O seletor de SDK ganha **Automático**, que passa a ser o padrão: usa o SDK do open.mp quando o projeto o tem (`qawno/include/open.mp.inc`, ou o caminho configurado) e, sem ele, as nativas vêm dos includes, como no SA-MP.

#### Por dentro

- O **pawnpro-core** passa a ser dono dos processos, das portas, do RCON, do compilador, da configuração, do estado do projeto e dos includes. Some a duplicação entre o que a extensão calculava e o que a análise usava: agora há uma resposta só para cada pergunta.
- O motor de análise e o depurador deixam de ser binários à parte e viram partes do núcleo, que atende IntelliSense, depuração e o plugin do servidor por um **soquete local único** (named pipe no Windows). O VSIX traz um binário só, em `bin/`, com os avisos de licença das bibliotecas de terceiros ao lado.
- Mudanças no `config.json` — global e do projeto — e nas listas `.ban`/`.allow` chegam à análise sem o editor pedir: quem observa os arquivos é o núcleo.
- Encerrar um processo que ocupa a porta confere de novo, na hora, se ele é mesmo o servidor deste projeto e do mesmo usuário.
- A ajuda mostra a versão do núcleo no lugar das versões separadas do motor e do depurador.

#### Depuração

- **O plugin do servidor agora sai no release do PawnPro Core** e precisa ser da mesma versão da extensão: ao atualizar o PawnPro, atualize o plugin. A ajuda aponta o release certo. O depurador segue marcado como **instável**.
- Ao depurar, qualquer `-d` da sua configuração é trocado por `-d3` só naquela compilação. Antes a flag só era acrescentada quando não havia nenhuma, e um `-d0` ou `-d1` configurado deixava o `.amx` sem as informações que os breakpoints e as variáveis precisam.
- A sessão sobe e derruba o servidor sozinha, sem binário de adaptador para localizar.

#### Documentação e dependências

- Documentação revista contra o código: guia de depuração reescrito, ordem real de detecção do compilador, chaves e comandos que faltavam, severidade e correção de cada diagnóstico, e os guias do assistente de nomes e de idiomas no estado atual.
- Os textos novos ganham tradução em inglês, espanhol, romeno e russo.
- Sai o `iconv-lite`; a decodificação do log e da saída do compilador é do núcleo.
- Licença revisada, sem contradições no texto.

### Corrigido

#### Interface

- **A tela de configurações voltou a responder aos cliques.** A política de segurança da página usa nonce, e nonce não vale para atributo de evento: os `onclick`/`onchange` dos controles eram bloqueados pelo navegador, e o sintoma era a página inteira muda, sem erro visível. Os controles passaram a declarar a intenção em `data-*`, e o script os liga por delegação. A Biblioteca de Recursos recebeu o mesmo tratamento e deixou de precisar de `unsafe-inline`.
- **A extensão não depende mais do IntelliSense subir para ativar.** Ela ficava presa numa chamada sem prazo, e o que vinha depois — tela de configurações, biblioteca e barra de status — nunca chegava a existir.
- Os títulos das correções rápidas ("Remover variável não usada", "Corrigir a indentação"…) apareciam sempre em português; agora seguem o idioma configurado, como os diagnósticos.

#### Análise de código

- **A formatação deixou de danificar o código** em comentários no fim da linha e de bloco, em strings e caracteres com espaço e em macros com continuação `\`, e ficou estável: formatar de novo não muda mais nada.
- **Letras acentuadas derrubavam a análise** — num nome cortado no limite de 31 bytes, e na assinatura com acento antes do cursor.
- Avisos de um texto que já não existe deixam de aparecer: uma análise que termina depois de uma nova edição é descartada.
- Um nome dentro de uma string deixa de contar como referência; uma chamada em `new x = Funcao();` deixa de ser ignorada; e a coluna fica certa quando há acento antes do nome na linha.
- `PP0012` (`#include` sem símbolos usados) não disparava, e a verificação de símbolos não usados não via uma edição feita em outro arquivo.
- `native` e `forward` com corpo aberto na linha seguinte voltam a ser acusados, e uma diretiva recuada (`    #include`) passa a ser reconhecida.

#### Depuração

- **Breakpoint parando na linha errada** quando o arquivo tinha sido editado depois de compilar.
- **Breakpoints do gamemode disparando dentro de filterscripts.** O plugin passa a reconhecer qual script está em depuração e só instala o controle nele.
- **Breakpoints em includes por caminho relativo** (`#include "../include/x.inc"`) passam a ser atingidos.
- **Arrays.** Elementos de arrays de várias dimensões e de arrays recebidos por referência mostravam valores de outra posição da memória; data breakpoints e edição em `grid[i][j]` passam a funcionar.
- A edição de uma variável só aparece como feita depois que o servidor confirma a escrita.
- A pilha de chamadas mostra o arquivo de cada frame — um frame dentro de um include abria o arquivo principal.
- Iniciar ou reiniciar a depuração com um `.amx` sem informação de depuração recompila, em vez de subir um binário em que nenhum breakpoint pega.

### Removido

- O TypeScript que duplicava o que o núcleo faz: leitura do `server.cfg`/`config.json`, varredura de portas por `lsof`/`/proc`/`netstat`, verificação do plugin de depuração, detecção do `pawncc`, execução do compilador, detecção do executável e do tipo de servidor, leitura do log, filtro de comandos com senha e o cliente RCON em UDP.
- Os campos `server`, `session` e `stopOnEntry` do `launch.json`, que eram ignorados. O servidor vem da seção `server` da configuração.
