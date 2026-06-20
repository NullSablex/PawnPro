# Configuração

As configurações do PawnPro são gerenciadas por arquivos JSON — **não** pelas configurações do editor.

## Arquivos de configuração

| Arquivo | Escopo |
|---------|--------|
| `~/.pawnpro/config.json` | Global (todos os projetos) |
| `.pawnpro/config.json` | Projeto (sobrescreve global) |
| `.pawnpro/state.json` | Estado local (favoritos, histórico do servidor) |

O arquivo de projeto pode ser aberto rapidamente pelo item **PawnPro** na barra de status. As configurações também podem ser editadas pela interface gráfica acessível via comando `pawnpro.openSettings` ou pelo item **Configurações** no menu da barra de status.

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
| `compiler.autoDetect` | `true` | Detecta `pawncc` automaticamente. Ordem de busca: variável de ambiente `$PAWNCC`, `$PATH`, subdiretórios do workspace (`qawno/`, `pawno/`, `include/`, `tools/`, `bin/`), caminhos comuns do sistema |
| `compiler.path` | `""` | Caminho absoluto para o executável `pawncc`. Se apontar para um diretório, procura `pawncc` dentro dele. No painel de configurações gráfico, este campo fica **oculto** enquanto `compiler.autoDetect` está ligado (a detecção automática torna o caminho manual irrelevante); desligue a detecção automática para exibi-lo e editá-lo |
| `compiler.args` | `[]` | Argumentos adicionais passados ao compilador |
| `includePaths` | `["${workspaceFolder}/pawno/include"]` | Diretórios de includes; suporta `${workspaceFolder}`. Em runtime, a extensão também adiciona automaticamente `qawno/include`, `pawno/include` e `include` da raiz do workspace se existirem, além de paths vindos de `-i` em `compiler.args` |
| `output.encoding` | `"windows1252"` | Encoding da saída do compilador (`windows1252`, `utf8`, `latin1`) |
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
| `analysis.sdk.platform` | `"auto"` | SDK base: `"auto"`, `"omp"`, `"samp"` ou `"none"`. `"auto"` procura `open.mp.inc` primeiro em `<workspace>/qawno/include/`, depois nos `includePaths`; se não encontrar, assume SA-MP. O painel de configurações gráfico expõe apenas `omp`, `samp` e `none` — `"auto"` só é configurável via JSON |
| `analysis.sdk.filePath` | `""` | Caminho manual para o arquivo SDK centralizador (necessário principalmente para SA-MP, onde não há convenção de nome automática) |

## Formatação

```json
{
  "format": {
    "preset": "allman",
    "braceStyle": "nextLine",
    "spaceAroundOperators": true,
    "emptyBlockSameLine": true
  }
}
```

| Chave | Padrão | Descrição |
|-------|--------|-----------|
| `format.preset` | `"allman"` | `"allman"`, `"knr"`, `"compact"` ou `"custom"` |
| `format.braceStyle` | `"nextLine"` | `"nextLine"` ou `"sameLine"`. Só aplicado quando `preset` é `"custom"` |
| `format.spaceAroundOperators` | `true` | Espaço em volta de operadores binários. Só no `"custom"` |
| `format.emptyBlockSameLine` | `true` | Mantém blocos vazios colados ao controle. Só no `"custom"` |

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
| `analysis.naming.maxListFileBytes` | `33554432` | Limite (bytes) que a engine processa de cada arquivo `.ban`/`.allow`. Não impede editá-los |
| `analysis.naming.blocklistFile` | `.pawnpro/naming-blocklist.ban` | Arquivo com os nomes proibidos (um por linha, `#` comenta). Tem prioridade sobre a lista inline |
| `analysis.naming.loopIndicesFile` | `.pawnpro/naming-loop-indices.allow` | Arquivo com os índices de loop tolerados |
| `analysis.naming.style.<categoria>` | `[]` | Lista de estilos aceitos por categoria (`functions`, `globals`, `locals`, `constants`, `macros`, `parameters`). Lista vazia = sem checagem; o nome é aceito se casar com **qualquer** estilo da lista. Ver [Nomenclaturas aceitas](#nomenclaturas-aceitas) abaixo |

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
| `server.logEncoding` | `"windows1252"` | Encoding do arquivo de log (`windows1252`, `utf8`, `latin1`) |
| `server.clearOnStart` | `true` | Limpa o painel de saída ao (re)iniciar o servidor |
| `server.output.follow` | `"visible"` | Rola automaticamente o painel de log: `"visible"` (quando visível), `"always"` ou `"off"` |

## Interface e idioma

```json
{
  "syntax": {
    "scheme": "none",
    "applyOnStartup": false
  },
  "ui": {
    "showIncludePaths": false,
    "animateTitle": false
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
| `locale` | `""` | Idioma das mensagens de diagnóstico do motor LSP: `""` (automático, herda o idioma do editor), `"pt-BR"` ou `"en"` |
