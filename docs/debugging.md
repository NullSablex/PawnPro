# Depuração

O PawnPro traz um **depurador visual** para scripts Pawn (SA-MP / open.mp):
breakpoints, passo a passo, inspeção e edição de variáveis e pilha de chamadas,
direto no editor.

!!! warning "Instável"

    O depurador ainda é considerado instável: funciona no uso descrito aqui,
    mas pode ter falhas. Se encontrar uma,
    [abra uma issue](https://github.com/NullSablex/PawnPro/issues).

> **Alvo: servidor local de desenvolvimento.** Ao parar num breakpoint, o
> servidor inteiro para junto — é o esperado de um depurador, não um problema.
> Não use num servidor com jogadores.

## Como funciona

São duas peças:

- **Adaptador de depuração** — fica dentro do núcleo nativo que acompanha a
  extensão. Não há nada a instalar: ele conversa com o editor e com o plugin.
- **Plugin do servidor** — um binário (`.so`/`.dll`) que roda **dentro** do
  servidor. **Você instala uma vez.** O mesmo arquivo serve SA-MP e open.mp.

Ao apertar **F5**, a extensão:

1. **Compila** o script com informação de depuração. Qualquer `-d` da sua
   configuração é trocado por `-d3` só nesta compilação; a configuração não é
   alterada.
2. **Confere o plugin** — se está instalado, registrado e é da arquitetura do
   servidor — e avisa o que faltar.
3. **Confere a porta**: se sobrou um servidor do projeto de uma execução
   anterior, oferece encerrá-lo antes de subir outro.
4. **Sobe o servidor**, que carrega o plugin e se conecta ao depurador.

## Instalar o plugin no servidor

### 1. Obter o binário

Baixe da [release do PawnPro Core](https://github.com/NullSablex/PawnPro-Core/releases):

- **Linux:** `pawnpro_debug.so`
- **Windows:** `pawnpro_debug.dll`

> A release já publica com o nome correto — **não renomeie**. Os avisos de
> licença das bibliotecas compiladas no plugin estão em
> `pawnpro_debug-THIRD-PARTY.txt`, na mesma release. O servidor é de
> 32 bits, e o plugin também: um binário de outra arquitetura é recusado pelo
> servidor, e a extensão avisa antes de iniciar.

Para compilar a partir do fonte:

```bash
git clone https://github.com/NullSablex/PawnPro-Core
cd PawnPro-Core
rustup target add i686-unknown-linux-gnu
cargo build --release -p pawnpro-debug-plugin --target i686-unknown-linux-gnu
# binário em: target/i686-unknown-linux-gnu/release/libpawnpro_debug.so
```

No Linux o compilador gera `libpawnpro_debug.so`: tire o prefixo `lib` ao
instalar.

### 2. Instalar

Coloque `pawnpro_debug.so`/`.dll` na pasta que o seu servidor usa:

=== "open.mp (recomendado)"

    O plugin é um **componente nativo** do open.mp. Coloque-o em
    **`components/`**: o servidor o descobre sozinho ao iniciar, sem registro
    no `config.json`.

    ```bash
    # Linux
    cp pawnpro_debug.so /caminho/do/servidor/components/
    # Windows
    copy pawnpro_debug.dll C:\caminho\do\servidor\components\
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

    Coloque em `plugins/` e acrescente à linha `plugins` do `server.cfg`:

    ```
    plugins pawnpro_debug.so
    ```

Isso é feito **uma vez** por servidor.

## Depurar

1. Abra a **pasta** do projeto e o script (`.pwn`) no editor.
2. Clique na margem para colocar **breakpoints**.
3. Aperte **F5**.

Sem `launch.json`, a extensão depura o `.amx` do arquivo Pawn aberto. Ao
atingir um breakpoint, a execução pausa e as **variáveis** em escopo aparecem.

A **saída do servidor** (inclusive `print` e o log do gamemode) aparece no
**Console de Depuração**, sem terminal à parte.

### Gamemode, filterscript e includes

- **Filterscripts** são depurados como o gamemode: aponte `program` para o
  `.amx` do filterscript. Só o programa em depuração para nos breakpoints — os
  outros scripts carregados no servidor seguem rodando sem interferência, mesmo
  com funções de mesmo nome.
- **Breakpoints em includes** funcionam, inclusive nos incluídos por caminho
  relativo (`#include "../include/x.inc"`).

### O que dá para fazer na pausa

- **Percorrer a pilha de chamadas** — cada frame mostra o arquivo e a linha;
  clicar num frame leva a inspeção para ele.
- **Inspecionar arrays e strings** — arrays expandem elemento a elemento,
  inclusive os de várias dimensões e os recebidos por referência; um array de
  char aparece como texto quando o conteúdo é uma string.
- **Avaliar expressões** no watch e no hover: aritmética (`+ - * / %`, com o
  truncamento do Pawn) e comparação (`== != < > <= >=`) sobre literais,
  variáveis e `arr[i]`. O console e o watch sugerem as variáveis em escopo.
- **Editar valores** — `x = 1` ou `arr[i] = 10`. O novo valor só aparece depois
  que o servidor confirma a escrita. O array inteiro não é editável, só os
  elementos.
- **Ler a memória** — visão hexadecimal da memória de dados a partir de
  qualquer variável.

### Tipos de breakpoint

Além do breakpoint de linha (**condicional**, por **contagem de acertos** e
**logpoint**):

- **Data breakpoint** — pausa quando um valor muda: global, local ou elemento de
  array (`arr[3]`, `grid[1][2]`). O de uma variável local expira quando a
  função dona retorna.
- **Breakpoint de função** — para ao entrar numa função pelo nome.
- **Pausa em erro de runtime** — divisão por zero, índice de array fora do
  limite, colisão entre pilha e heap, underflow de heap e acesso inválido à
  memória. Liga e desliga pelo painel de breakpoints.

### Parar e reiniciar

- **Parar** encerra o servidor na hora e fecha a sessão.
- **Reiniciar** sobe o servidor de novo na mesma sessão, com os breakpoints
  mantidos. Se o fonte mudou desde a última compilação — ou se o `.amx` não tem
  informação de depuração —, a extensão recompila antes. Uma compilação com erro
  cancela o reinício, em vez de subir o binário antigo.

### Código editado durante a sessão

Os breakpoints valem para o código **compilado**. Se você editar o arquivo com
a sessão aberta, a extensão lembra o texto de quando compilou e leva cada
breakpoint para a linha equivalente — inserir linhas acima não desloca o ponto
de parada. Um breakpoint numa linha que não existia na compilação fica **não
verificado** até reiniciar, e o reinício recompila.

### Enquanto está pausado

A máquina virtual do servidor para por inteiro: nenhum callback, timer ou
comando executa. A rede continua de pé — o servidor segue respondendo à
consulta de status —, e o que chegou durante a pausa é processado de uma vez ao
continuar, inclusive os timers atrasados.

## `launch.json`

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
| `program` | Caminho do `.amx`. O `.pwn` de mesmo nome ao lado é compilado com informação de depuração; sem ele, o `.amx` é usado como está. |
| `cwd` | Diretório do servidor. Padrão: o resolvido pela seção `server` da configuração. |

O executável e os argumentos do servidor vêm da seção `server` da
[configuração](configuration.md#servidor), a mesma do painel.

## Se o aviso de preparação aparecer

Antes de iniciar, a extensão verifica se o plugin está **instalado** no lugar
certo, **registrado** (quando o servidor exige) e se é da **arquitetura** do
servidor. Ela também confere que o arquivo é o **plugin oficial**: se houver
outro plugin chamado `pawnpro_debug`, avisa do conflito em vez de seguir.

Dá para iniciar assim mesmo, mas a depuração só funciona com o plugin correto.
Sem ele o servidor sobe, nenhum breakpoint é atingido e, depois de um minuto, o
console avisa que o plugin não conectou, com as causas prováveis.

## Limitações

- **Alvo é desenvolvimento local.** Não é para servidor de produção com jogadores.
- Sem *edit-and-continue*: mudanças no código só valem depois de reiniciar.
- Nas expressões do watch e do hover, um operador por vez — sem encadear várias
  operações na mesma expressão.
- **Windows:** o núcleo e o plugin são publicados para Windows, mas a depuração
  ainda não foi verificada num servidor Windows real.
- **macOS:** não há servidor SA-MP nem open.mp para macOS, então não há o que
  depurar localmente.
