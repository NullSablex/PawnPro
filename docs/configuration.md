# Configuração

As configurações do PawnPro são gerenciadas por arquivos JSON — **não** pelas configurações do VS Code.

## Arquivos de configuração

| Arquivo | Escopo |
|---------|--------|
| `~/.pawnpro/config.json` | Global (todos os projetos) |
| `.pawnpro/config.json` | Projeto (sobrescreve global) |
| `.pawnpro/state.json` | Estado local (favoritos, histórico do servidor) |

O arquivo de projeto pode ser aberto rapidamente pelo item **PawnPro** na barra de status.

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
| `compiler.autoDetect` | `true` | Detecta `pawncc` automaticamente no workspace |
| `compiler.path` | `""` | Caminho absoluto para o executável `pawncc` |
| `compiler.args` | `[]` | Argumentos adicionais passados ao compilador |
| `includePaths` | `["${workspaceFolder}/pawno/include"]` | Diretórios de includes; suporta `${workspaceFolder}` |
| `output.encoding` | `"windows1252"` | Encoding da saída do compilador |
| `build.showCommand` | `false` | Exibe o comando completo do compilador no painel de saída |

## Análise

```json
{
  "analysis": {
    "warnUnusedInInc": false,
    "sdk": {
      "platform": "omp",
      "filePath": ""
    }
  }
}
```

| Chave | Padrão | Descrição |
|-------|--------|-----------|
| `analysis.warnUnusedInInc` | `false` | Habilita PP0006 para stocks em arquivos `.inc` |
| `analysis.sdk.platform` | `"omp"` | SDK base: `"omp"`, `"samp"` ou `"none"` |
| `analysis.sdk.filePath` | `""` | Caminho manual para o arquivo SDK (se não estiver nos `includePaths`) |

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
| `server.path` | `""` | Caminho para o executável do servidor |
| `server.cwd` | `"${workspaceFolder}"` | Diretório de trabalho ao iniciar o servidor |
| `server.args` | `[]` | Argumentos adicionais |
| `server.logPath` | `""` | Caminho do log (detectado automaticamente se vazio) |
| `server.logEncoding` | `"windows1252"` | Encoding do arquivo de log |
| `server.clearOnStart` | `true` | Limpa o painel de saída ao reiniciar |
| `server.output.follow` | `"visible"` | Rola automaticamente o log: `"visible"`, `"always"` ou `"off"` |

## Interface

```json
{
  "syntax": {
    "scheme": "none",
    "applyOnStartup": false
  },
  "ui": {
    "showIncludePaths": false,
    "separateContainer": false
  }
}
```

| Chave | Padrão | Descrição |
|-------|--------|-----------|
| `syntax.scheme` | `"none"` | Tema de sintaxe ativo: `"none"`, `"auto"`, `"classic_white"`, `"classic_dark"`, `"modern_white"`, `"modern_dark"` |
| `syntax.applyOnStartup` | `false` | Reaplicar o esquema ao iniciar o VS Code (gerenciado automaticamente pelos comandos `applySyntaxScheme` e `resetSyntaxScheme`) |
| `ui.showIncludePaths` | `false` | Exibe os `includePaths` resolvidos na aba Includes |
| `ui.separateContainer` | `false` | Mantém os painéis PawnPro em container separado |

> `ui.separateContainer` é a única opção mantida nas configurações nativas do VS Code (necessário para cláusulas `when` dos painéis).
