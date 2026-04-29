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
| `compiler.path` | `""` | Caminho absoluto para o executável `pawncc`. Se apontar para um diretório, procura `pawncc` dentro dele |
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
    "showIncludePaths": false
  },
  "locale": ""
}
```

| Chave | Padrão | Descrição |
|-------|--------|-----------|
| `syntax.scheme` | `"none"` | Tema de sintaxe ativo: `"none"`, `"auto"`, `"classic_white"`, `"classic_dark"`, `"modern_white"`, `"modern_dark"` |
| `syntax.applyOnStartup` | `false` | Reaplicar o esquema ao iniciar (gerenciado automaticamente pelos comandos `applySyntaxScheme` e `resetSyntaxScheme`) |
| `ui.showIncludePaths` | `false` | Exibe o caminho relativo de cada arquivo `.inc` na aba Includes da barra lateral |
| `locale` | `""` | Idioma das mensagens de diagnóstico do motor LSP: `""` (automático, herda o idioma do editor), `"pt-BR"` ou `"en"` |
