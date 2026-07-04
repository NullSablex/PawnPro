# Depuração

O PawnPro oferece um **depurador visual** para gamemodes Pawn (SA-MP / open.mp):
breakpoints, *step*, inspeção de variáveis e *call stack*, direto no editor.

> **Alvo: servidor local de desenvolvimento.** Ao parar num breakpoint, o servidor
> congela — isso é o comportamento esperado de um depurador, não um problema.

## Como funciona (visão geral)

São duas peças, em processos diferentes:

- **Adaptador DAP** — vem na extensão; é iniciado automaticamente. Fala com o
  editor e com o plugin.
- **Plugin do servidor** — um binário (`.so`/`.dll`) que roda **dentro** do
  servidor. **Você instala uma vez.** O mesmo binário serve SA-MP e open.mp.

Quando você inicia a depuração, a extensão:

1. **Recompila** o gamemode com informação de depuração (`-d3` é adicionado
   automaticamente se você ainda não usa uma flag `-d`; sua configuração não é
   alterada).
2. Verifica se o **plugin** está instalado e registrado (e avisa se faltar algo).
3. **Inicia o servidor** com as variáveis de depuração e **lança o adaptador**,
   que conecta no plugin.

A única ação manual é **instalar o plugin no servidor** (uma vez).

## Passo único: instalar o plugin no servidor

### 1. Obter o binário do plugin

Baixe da [release do PawnPro Debugger](https://github.com/NullSablex/PawnPro-Debugger/releases):

- **Linux:** `pawnpro_debug.so`
- **Windows:** `pawnpro_debug.dll`

> O mesmo arquivo funciona em **SA-MP e open.mp**. A release já publica com o nome
> correto — **não renomeie**.

Se preferir compilar (sem release disponível), o binário sai como
`libdebug_plugin.so` (Linux) / `debug_plugin.dll` (Windows); aí sim renomeie para
`pawnpro_debug.{so,dll}` ao instalar:

```bash
git clone https://github.com/NullSablex/PawnPro-Debugger
cd PawnPro-Debugger
# Linux (servidor é 32-bit):
rustup target add i686-unknown-linux-gnu
cargo build --release -p debug-plugin --target i686-unknown-linux-gnu
# binário em: target/i686-unknown-linux-gnu/release/libdebug_plugin.so
```

### 2. Instalar (a pasta depende do servidor)

Coloque o binário (já chamado **`pawnpro_debug.so`/`.dll`**) na pasta correta:

=== "open.mp (recomendado)"

    O plugin é um **componente nativo** do open.mp. Coloque-o na pasta
    **`components/`** — o servidor o **descobre automaticamente** no início.
    **Nenhum registro no `config.json` é necessário.**

    ```bash
    # Linux
    cp pawnpro_debug.so   /caminho/do/servidor/components/
    # Windows
    copy pawnpro_debug.dll   C:\caminho\do\servidor\components\
    ```

=== "open.mp (modo legado)"

    Alternativa: coloque em `plugins/` e declare em `pawn.legacy_plugins` no
    `config.json`. Prefira o componente acima.

    ```json
    {
      "pawn": {
        "legacy_plugins": ["pawnpro_debug"]
      }
    }
    ```

=== "SA-MP"

    Coloque em `plugins/` e adicione à linha `plugins` do `server.cfg`:

    ```
    # plugins/pawnpro_debug.so
    plugins pawnpro_debug.so
    ```

Pronto — isso é feito **uma única vez** por servidor.

## Depurar

1. Abra o gamemode (`.pwn`) no editor.
2. Clique na margem para colocar **breakpoints**.
3. Pressione **F5** (ou crie uma configuração `launch.json` do tipo `pawn`).

A extensão recompila com `-d3`, verifica o plugin, sobe o servidor e conecta.
Ao atingir um breakpoint, a execução pausa e você vê as **variáveis** em escopo.

A **saída do servidor** (incluindo `print` e logs do gamemode) aparece no painel
**Console de Depuração** do editor — não é preciso abrir um terminal à parte.

### Exemplo de `launch.json`

```json
{
  "type": "pawn",
  "request": "launch",
  "name": "Depurar gamemode (PawnPro)",
  "program": "${workspaceFolder}/gamemodes/main.amx",
  "cwd": "${workspaceFolder}"
}
```

| Campo | Descrição |
|-------|-----------|
| `program` | Caminho do `.amx`. O `.pwn` ao lado é recompilado com debug info. |
| `cwd` | Diretório de trabalho do servidor (padrão: raiz do workspace). |
| `session` | Id do canal interno (socket local). Gerado automaticamente se vazio. |

## Se o preflight avisar que falta algo

Antes de iniciar, a extensão verifica se o plugin está **instalado** no local
correto e **registrado** (quando o servidor exige). Ela também confirma que o
arquivo é mesmo o **plugin oficial** — se houver outro plugin com o nome
`pawnpro_debug` que não seja o do depurador, ela avisa do conflito em vez de
prosseguir como se estivesse tudo certo.

Mesmo que você escolha iniciar assim mesmo, a depuração só funciona com o plugin
correto: um plugin homônimo não abre o canal de depuração, então o adaptador
falha ao conectar com uma mensagem explicando as causas prováveis.

## Limitações (v1)

- **Alvo é desenvolvimento local.** Não é para servidor de produção com jogadores.
- O `.amx` precisa ter sido compilado com `-d3` (a extensão cuida disso).
- Sem *hot-reload* / *edit-and-continue*.
- **Call stack ainda mostra só o frame atual** (não percorre a cadeia de chamadas).
