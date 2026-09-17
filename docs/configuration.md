# Configuração

As configurações do PawnPro são gerenciadas por arquivos JSON — **não** pelas configurações do editor.

## Arquivos de configuração

| Arquivo | Escopo |
|---------|--------|
| `~/.pawnpro/config.json` | Global (todos os projetos) |
| `.pawnpro/config.json` | Projeto (sobrescreve global) |
| `.pawnpro/state.json` | Estado local (favoritos, histórico do servidor) |

Nada precisa ser editado à mão: a página de configurações (`pawnpro.openSettings`, ou **Configurações** no menu do item **PawnPro** da barra de status) cobre todas as chaves. O arquivo do projeto prevalece sobre o global, chave a chave; um valor com tipo errado é ignorado e cai no padrão, sem descartar o resto do arquivo.

## Compilação

```json
{
  "compiler": {
    "autoDetect": true,
    "path": "",
    "args": []
  },
  "includePaths": ["${workspaceFolder}/pawno/include"],
  "output": {
    "encoding": "windows1252"
  },
  "build": {
    "showCommand": false
  }
}
```

| Chave | Padrão | Descrição |
|-------|--------|-----------|
| `compiler.autoDetect` | `true` | Procura o `pawncc` quando `compiler.path` está vazio ou não serve. Ordem: variável de ambiente `PAWNCC` (vale sempre), `compiler.path`, `PATH`, pastas do projeto (`qawno/`, `pawno/`, `include/`, `tools/`, `bin/`) e caminhos comuns do sistema. Desligado, um `compiler.path` inválido é erro |
| `compiler.path` | `""` | Caminho absoluto para o executável `pawncc`. Se apontar para um diretório, procura `pawncc` dentro dele. No painel de configurações gráfico, este campo fica **oculto** enquanto `compiler.autoDetect` está ligado (a detecção automática torna o caminho manual irrelevante); desligue a detecção automática para exibi-lo e editá-lo |
| `compiler.args` | `[]` | Argumentos passados ao compilador. Vazio: a extensão detecta as flags que o `pawncc` local aceita e aplica um conjunto mínimo. Flags que o compilador não aceita são removidas e informadas |
| `includePaths` | `["${workspaceFolder}/pawno/include"]` | Diretórios de includes; suporta `${workspaceFolder}`. Também entram, se existirem, os caminhos de `-i` em `compiler.args` e `qawno/include`, `pawno/include` e `include` da raiz do workspace. Sem nenhum desses na raiz, procura a pasta de include subindo a partir do arquivo aberto |
| `output.encoding` | `"windows1252"` | Codificação da saída do compilador: `utf8`, `windows1250`–`windows1257` ou `latin1` |
| `build.showCommand` | `false` | Exibe o comando completo do compilador no painel de saída |

## Análise

```json
{
  "analysis": {
    "warnUnusedInInc": false,
    "suppressDiagnosticsInInc": false,
    "sdk": {
      "platform": "auto",
      "filePath": ""
    }
  }
}
```

| Chave | Padrão | Descrição |
|-------|--------|-----------|
| `analysis.warnUnusedInInc` | `false` | Habilita PP0006 para stocks em arquivos `.inc` |
| `analysis.suppressDiagnosticsInInc` | `false` | Suprime todos os diagnósticos dentro de arquivos `.inc` |
| `analysis.sdk.platform` | `"auto"` | SDK base: `"auto"`, `"omp"`, `"samp"` ou `"none"`. `"auto"` procura `open.mp.inc` primeiro em `<workspace>/qawno/include/`, depois nos `includePaths`; sem ele, as nativas vêm dos includes, como no SA-MP |
| `analysis.sdk.filePath` | `""` | Caminho manual para o arquivo SDK centralizador. Vence a detecção, mas só se existir: um caminho inválido não cai num palpite |

## Formatação

```json
{
  "format": {
    "preset": "allman",
    "braceStyle": "nextLine",
    "spaceAroundOperators": true,
    "emptyBlockSameLine": true,
    "preserveArrayAlignment": false
  }
}
```

| Chave | Padrão | Descrição |
|-------|--------|-----------|
| `format.preset` | `"allman"` | `"allman"`, `"knr"`, `"compact"` ou `"custom"` |
| `format.braceStyle` | `"nextLine"` | `"nextLine"` ou `"sameLine"`. Só aplicado quando `preset` é `"custom"` |
| `format.spaceAroundOperators` | `true` | Espaço em volta de operadores binários. Só no `"custom"` |
| `format.emptyBlockSameLine` | `true` | Mantém blocos vazios colados ao controle. Só no `"custom"` |
| `format.preserveArrayAlignment` | `false` | Preserva o alinhamento manual de inicializadores de array em várias linhas. Vale para qualquer preset |

## Nomenclatura (assistente de nomes)

Desligado por padrão. Quando ligado, emite o diagnóstico `PP0018`.

```json
{
  "analysis": {
    "naming": {
      "enabled": false,
      "minLength": 2,
      "maxListFileBytes": 33554432,
      "blocklistFile": "${workspaceFolder}/.pawnpro/naming-blocklist.ban",
      "loopIndicesFile": "${workspaceFolder}/.pawnpro/naming-loop-indices.allow",
      "style": {
        "functions": [],
        "globals": [],
        "locals": [],
        "constants": [],
        "macros": [],
        "parameters": []
      }
    }
  }
}
```

| Chave | Padrão | Descrição |
|-------|--------|-----------|
| `analysis.naming.enabled` | `false` | Liga o assistente de nomes |
| `analysis.naming.minLength` | `2` | Comprimento mínimo antes de sinalizar (índices de loop são tolerados) |
| `analysis.naming.maxListFileBytes` | `33554432` | Limite (bytes) lido de cada arquivo `.ban`/`.allow`. Não impede editá-los |
| `analysis.naming.blocklistFile` | `.pawnpro/naming-blocklist.ban` | Arquivo com os nomes proibidos (um por linha, `#` comenta). Com pelo menos um termo, prevalece sobre a lista inline |
| `analysis.naming.loopIndicesFile` | `.pawnpro/naming-loop-indices.allow` | Arquivo com os índices de loop tolerados |
| `analysis.naming.style.<categoria>` | `[]` | Lista de estilos aceitos por categoria (`functions`, `globals`, `locals`, `constants`, `macros`, `parameters`). Lista vazia = sem checagem; o nome é aceito se casar com **qualquer** item. Além dos estilos, um item entre barras (`/^g_[a-z]+$/`) é um padrão próprio por expressão regular. Ver [Nomenclaturas aceitas](#nomenclaturas-aceitas) abaixo |

> As listas grandes (`blocklist`/`allowShortInLoops`) ficam nos arquivos `.ban`/`.allow`, não no JSON. Ver o [guia de listas de nomes](naming-lists.md).

### Nomenclaturas aceitas

Cada item da lista de uma categoria é uma destas convenções de caixa. Um nome é aceito se casar com **pelo menos uma** das convenções configuradas para a categoria dele.

| Valor | Convenção | Casa | Não casa |
|-------|-----------|------|----------|
| `camelCase` | Primeira palavra minúscula, demais capitalizadas, sem `_` | `playerScore`, `protZ`, `count` | `PlayerScore`, `player_score` |
| `snake_case` | Tudo minúsculo, palavras separadas por `_` | `player_score`, `carregar_lixeiras`, `count` | `playerScore`, `PlayerScore` |
| `PascalCase` | Cada palavra capitalizada, sem `_` | `PlayerScore`, `Palavrao`, `CarregarLixeiras` | `playerScore`, `Carregar_Lixeiras` |
| `UPPER_CASE` | Tudo maiúsculo, palavras separadas por `_` | `MAX_PLAYERS`, `PALAVRAO`, `LIMIT` | `maxPlayers`, `Max_Players` |
| `Capitalized_Snake` | Cada trecho separado por `_` começa com maiúscula e tem ao menos uma minúscula; o `_` é opcional | `Carregar_Lixeiras`, `Carregar_Caixa_Eletronico`, `Palavrao`, `CarregarLixeiras` | `carregar_lixeiras`, `Carregar_LIXEIRAS`, `PALAVRAO` |

Observações:

- **`Capitalized_Snake` engloba `PascalCase`.** Como o `_` é opcional, todo nome que casa `PascalCase` (ex.: `Palavrao`, `CarregarLixeiras`) também casa `Capitalized_Snake`; a diferença é que `Capitalized_Snake` aceita também os separados por `_` (ex.: `Carregar_Lixeiras`). Na prática, marcar `Capitalized_Snake` numa categoria já cobre os nomes em `PascalCase`.
- **Um `_` inicial é ignorado** antes da checagem (`_count` é avaliado como `count`). Convém para descartes e nomes "privados".
- **Dígitos não desqualificam** nenhum estilo; ficam grudados na palavra anterior (`slot1` é uma palavra).
- A checagem é **por categoria**: o mesmo nome pode ser aceito como função e sinalizado como macro, conforme os estilos de cada uma. Os quick fixes (renomear) oferecem a conversão para os estilos configurados.

## Servidor

```json
{
  "server": {
    "type": "auto",
    "path": "",
    "cwd": "${workspaceFolder}",
    "args": [],
    "logPath": "",
    "logEncoding": "windows1252",
    "clearOnStart": true,
    "output": {
      "follow": "visible"
    },
    "history": {
      "enabled": true,
      "sensitiveCommands": []
    }
  }
}
```

| Chave | Padrão | Descrição |
|-------|--------|-----------|
| `server.type` | `"auto"` | Tipo de servidor: `"samp"`, `"omp"` ou `"auto"` |
| `server.path` | `""` | Caminho para o executável do servidor. Vazio ativa detecção automática nos subdiretórios do workspace: raiz, `server/`, `samp/`, `samp-server/`, `samp03/`, `open.mp/` |
| `server.cwd` | `"${workspaceFolder}"` | Diretório de trabalho ao iniciar o servidor. Se vazio e `server.path` está preenchido, usa o diretório do executável |
| `server.args` | `[]` | Argumentos adicionais passados ao executável |
| `server.logPath` | `""` | Caminho do arquivo de log a ser monitorado. Vazio: SA-MP usa `server_log.txt`; open.mp usa o valor de `logging.file` em `config.json` (padrão `log.txt`). O monitoramento de log funciona **somente em Linux e macOS** |
| `server.logEncoding` | `"windows1252"` | Codificação do arquivo de log: `utf8`, `windows1250`–`windows1257` ou `latin1` |
| `server.clearOnStart` | `true` | Limpa o painel de saída ao (re)iniciar o servidor |
| `server.output.follow` | `"visible"` | Rola automaticamente o painel de log: `"visible"` (quando visível), `"always"` ou `"off"` |
| `server.history.enabled` | `true` | Guarda em `.pawnpro/state.json` os comandos enviados ao servidor. `false` não registra nada. O arquivo é criado com permissão restrita ao seu usuário e não deve entrar no controle de versão |
| `server.history.sensitiveCommands` | `[]` | Comandos do seu gamemode que recebem senha ou token e não devem ser guardados, além dos que a extensão já reconhece (`login`, `rcon_password`, `password`, `changepassword`, `setpassword`, senha anunciada por rótulo como `--senha abc` e argumentos com cara de credencial — ver [Servidor](server.md#comandos-com-senha-nunca-sao-guardados)). Comparados pelo primeiro termo, sem diferenciar maiúsculas |

## Interface e idioma

```json
{
  "syntax": {
    "scheme": "none",
    "applyOnStartup": false
  },
  "ui": {
    "showIncludePaths": false,
    "animateTitle": false,
    "accent": "",
    "locale": ""
  },
  "locale": ""
}
```

| Chave | Padrão | Descrição |
|-------|--------|-----------|
| `syntax.scheme` | `"none"` | Tema de sintaxe ativo: `"none"`, `"auto"`, `"classic_white"`, `"classic_dark"`, `"modern_white"`, `"modern_dark"` |
| `syntax.applyOnStartup` | `false` | Reaplicar o esquema ao iniciar (gerenciado automaticamente pelos comandos `applySyntaxScheme` e `resetSyntaxScheme`) |
| `ui.showIncludePaths` | `false` | Exibe o caminho relativo de cada arquivo `.inc` na aba Includes da barra lateral |
| `ui.animateTitle` | `false` | Anima as letras do título PawnPro no topo das páginas em sequência (teclado → bloco → cair), em loop com pausa |
| `ui.accent` | `""` | Cor de destaque das páginas da extensão (botões, item ativo, foco, badges): `""` (automático, herda do tema do editor), `"blue"`, `"purple"`, `"green"`, `"amber"`, `"pink"` ou `"teal"`. Não altera o realce de sintaxe |
| `ui.locale` | `""` | Idioma das **páginas da extensão** (Configurações, Ajuda, O que há de novo): `""` (automático, segue o editor), `"pt-BR"`, `"en"`, `"es"`, `"ro"` ou `"ru"`. Independente de `locale` |
| `locale` | `""` | Idioma dos **diagnósticos** do motor LSP e do debugger: `""` (automático, segue o editor), `"pt-BR"`, `"en"`, `"es"`, `"ro"` ou `"ru"` |

## Diagnóstico

```json
{
  "diagnostics": {
    "level": "off"
  }
}
```

| Chave | Padrão | Descrição |
|-------|--------|-----------|
| `diagnostics.level` | `"off"` | Registro do que a extensão, o núcleo e a engine fazem, em `.pawnpro/logs/`: `"off"`, `"error"`, `"warn"` ou `"info"`. Desligado, nada é escrito e nenhuma pasta é criada. Também ajustável pelo comando **PawnPro: Nível do diagnóstico** |
