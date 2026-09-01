# Servidor

O PawnPro inicia o servidor SA-MP / open.mp, envia comandos por RCON e acompanha
o log — tudo pelo painel lateral, sem sair do editor.

<!-- imagem: visão geral do painel do servidor, com console e lista de comandos -->

## Iniciar e parar

Os comandos ficam na paleta (`Ctrl+Shift+P`) e no menu da barra de status:

| Comando | O que faz |
|---|---|
| **PawnPro: Iniciar Servidor** | Sobe o servidor num terminal do editor |
| **PawnPro: Parar Servidor** | Encerra o processo |
| **PawnPro: Reiniciar Servidor** | Para e sobe de novo |
| **PawnPro: Exibir Console do Servidor** | Abre o painel de comandos |
| **PawnPro: Exibir Log do Servidor** | Abre o acompanhamento do log |

Não é preciso configurar o caminho do executável: com `server.path` vazio, a
extensão procura nos subdiretórios usuais do projeto — a raiz, `server/`,
`samp/`, `samp-server/`, `samp03/` e `open.mp/`.

<!-- imagem: menu da barra de status com as ações do servidor -->

## Enviar comandos

O campo no topo do painel envia comandos ao servidor em execução. A senha do
RCON **não precisa ser digitada**: a extensão a lê do `server.cfg` (chave
`rcon_password`) ou do `config.json` do open.mp, e autentica sozinha.

<!-- imagem: campo de comando com um comando digitado -->

## Recentes e favoritos

O painel tem duas abas:

- **Recentes** — os comandos que você enviou, do mais novo para o mais antigo.
- **Favoritos** — os que você marcou com a estrela, sempre à mão.

A estrela ao lado de cada linha alterna entre as duas. Com muitos comandos, o
campo de busca filtra por qualquer trecho, e a lista carrega mais sob demanda.

<!-- imagem: aba Recentes com a busca em uso e a estrela de favorito -->

### Onde isso fica guardado

Em `.pawnpro/state.json`, dentro do projeto. O arquivo é criado com permissão
restrita ao seu usuário e **não deve entrar no controle de versão** — o
`.gitignore` do projeto já o cobre.

Para não guardar nada, desligue **Guardar comandos enviados** nas configurações
(`server.history.enabled`).

## Comandos com senha nunca são guardados

Um comando que pareça carregar credencial é enviado normalmente, mas não entra
no histórico. A extensão reconhece sozinha:

- comandos conhecidos de autenticação — `login`, `rcon_password`, `password`,
  `changepassword`, `setpassword`;
- argumentos anunciados por rótulo — `--senha 1234`, `auth token abc`, `-pwd=x`
  (também em inglês: `pass`, `pwd`, `key`, `secret`, `apikey`).

Se o seu gamemode tem um comando próprio que recebe senha, acrescente-o em
**Comandos que não devem ser guardados** (`server.history.sensitiveCommands`).
A comparação é pelo primeiro termo, sem diferenciar maiúsculas.

<!-- imagem: campo de comandos sensíveis na página de configurações -->

## Acompanhar o log

O painel de log segue o arquivo do servidor em tempo real.

> **Somente Linux e macOS.** O acompanhamento de log não funciona no Windows.

Com `server.logPath` vazio, o arquivo é descoberto pelo tipo de servidor: SA-MP
usa `server_log.txt`; open.mp usa o `logging.file` do `config.json` (padrão
`log.txt`).

A rolagem automática tem três modos em **Acompanhamento do log**
(`server.output.follow`): `visible` (só quando o painel está à vista, o padrão),
`always` e `off`.

Se o log aparecer com acentos trocados, ajuste `server.logEncoding` — o padrão é
`windows1252`, a codificação usual do ecossistema Pawn.

<!-- imagem: painel de log acompanhando a saída do servidor -->

## Configuração

As chaves ficam em `.pawnpro/config.json` e todas têm equivalente na página de
configurações. A referência completa está em
[Configuração](configuration.md#servidor).
