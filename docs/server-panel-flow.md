# Painel do servidor e painel do depurador — fluxos

Mapa de como iniciar, parar e reiniciar funcionam nos dois painéis, e por quê.
Serve para revisar mudanças sem reabrir a investigação toda: os laços, os
critérios de decisão e as armadilhas já conhecidas.

Arquivos: [`src/editor/server.ts`](../src/editor/server.ts),
[`src/editor/serverRegistry.ts`](../src/editor/serverRegistry.ts),
[`src/editor/debugAdapter.ts`](../src/editor/debugAdapter.ts),
[`src/core/debugCycle.ts`](../src/core/debugCycle.ts).
Adaptador DAP: `crates/debugger/adapter/` no repositório irmão `pawnpro-core`.

---

## Princípios que regem tudo aqui

Quatro regras explicam quase toda decisão de desenho abaixo. Quando algo quebra,
costuma ser porque uma delas foi violada.

1. **A porta é a única prova.** Terminal aberto, evento recebido, comando
   despachado — nada disso significa que o servidor está no ar. Só a resposta
   ao datagrama UDP significa. Todo laço termina observando a porta.
2. **Pedir não é concluir.** `stopDebugging()`, `debug.restart` e o `exit` no
   terminal **pedem**. Quem confirma é a sondagem seguinte. Foi exatamente essa
   confusão que gerou o bug do órfão fantasma.
3. **Estado que caduca não decide fluxo.** A origem do registry expira sozinha
   (ver [tolerância](#tolerancia-e-o-perigo-dela)). Ela serve para *exibir*.
   Para *decidir como parar*, o critério é a sessão que o editor entregou —
   um fato, não uma estimativa.
4. **Escopo de operação é parâmetro, não campo.** `restarting` viaja como
   argumento de `start`/`stop`. Como campo, vazava entre operações por caminhos
   de `return` que não passavam pelo `finally`.

---

## Quem sabe o quê

| Fonte | Responde | Confiável para |
|---|---|---|
| `pingServer(host, port)` | a porta respondeu **agora**? | a verdade sobre estar no ar |
| `ServerRegistry` | `alive` / `responded` / `origin` | pintar o painel |
| `this.term` | há terminal do painel? | saber **como** parar |
| `this.debugSession` | há sessão de depuração viva? | saber **como** parar |
| `pidsOnPort` + `isProjectServer` | quem segura a porta, e é nosso? | oferecer encerrar |

`alive` ≠ `responded`. O primeiro tolera perdas; o segundo é a sondagem crua.
Guardas de fluxo usam `responded`; exibição usa `alive`.

---

## Iniciar (`start`)

```
start({ restarting })
  │
  ├─ há terminal nosso E responded E origin==='terminal'?
  │     └─ SIM → "já está rodando" (silencioso se restarting) ─────────► fim
  │
  ├─ fecha terminais órfãos do painel
  ├─ recarrega host/porta do server.cfg / config.json
  │
  ├─ há sessão de depuração viva?
  │     └─ SIM → "já no ar pela depuração" ───────────────────────────► fim
  │
  ├─ porta responded E origin !== 'terminal'?
  │     └─ SIM → resolvePortConflict(offerKeep: true)
  │               ├─ 'keep' → adota (origin='external') ──────────────► fim
  │               ├─ 'busy' → não sobe por cima ─────────────────────► fim
  │               └─ 'free' → segue
  │
  ├─ executável configurado? ──── não → erro ────────────────────────► fim
  │
  └─ cria terminal, liga o tail
        └─ LAÇO: waitForPort(true, 15 s)  ← barra de progresso
              ├─ subiu → origin='terminal' + "iniciado"/"reiniciado"
              └─ prazo esgotado → aviso de timeout
```

**Por que a checagem de porta vale também no reinício:** antes era pulada, para
o restart não barrar a si mesmo. Mas nesse ponto o servidor do ciclo já foi
parado — quem responde é *outro* processo. Sem a checagem, o restart terminava
em silêncio e sem servidor.

**O `await` do laço final importa.** Enquanto era `void`, `start()` resolvia
antes de o servidor subir, e o `restart` dava o ciclo por concluído com a espera
ainda correndo. Violava o princípio 2 dentro da própria função.

---

## Parar (`stop`)

Devolve `boolean` — `true` só quando a porta ficou de fato muda. O `restart`
depende disso para não seguir adiante sobre uma parada que não aconteceu.

```
stop({ restarting }) → boolean
  │
  ├─ sem terminal E não é servidor nosso?
  │     └─ "porta ocupada por outro programa" ──────────────────► false
  │
  ├─ COMO parar (exclusivo, nesta ordem):
  │     ├─ há terminal → envia `exit`, aguarda 600 ms, dispose
  │     ├─ há debugSession → stopDebugging(session)
  │     │      └─ a sessão no core mata o servidor (SIGKILL), o colhe e
  │     │         emite `terminated`. A barra é a do tracker da depuração,
  │     │         não a do stop — com as duas, "Parando" aparecia duas vezes.
  │     └─ nenhum dos dois (servidor nosso, subido por fora)
  │            └─ resolvePortConflict(offerKeep: false) ──► 'free' ? true : false
  │
  └─ LAÇO: waitForPort(false, 6 s)  ← barra de progresso (só sem depuração)
        ├─ calou → registry.markStopped() + "parado" ───────────► true
        └─ ainda responde → resolvePortConflict(offerKeep: false)
                              └─ 'free' ? true : false
```

**`markStopped()` no lugar da sondagem, não depois dela.** A porta calou: é
certeza, não estimativa. Sondar antes produziria um `onChange` com o estado
errado, corrigido no evento seguinte — o painel piscando.

---

## Reiniciar (`restart`)

Dois caminhos que não se parecem, porque o dono do processo é diferente.

```
restart()
  │
  ├─ sem terminal E há debugSession?      ← DEPURAÇÃO
  │     └─ workbench.action.debug.restart
  │           │  a sessão troca o processo por baixo e MANTÉM a sessão,
  │           │  recompilando antes se o fonte mudou.
  │           └─ só delega ───────────────────────────────────────► fim
  │              (a barra é a do tracker; a vigilância periódica
  │               atualiza o painel)
  │
  └─ TERMINAL
        ├─ stop({ restarting: true }) → false ? ───────────────► fim
        └─ start({ restarting: true })
```

**Sem guarda de porta própria.** O `stop` já recusa e avisa quando não há o que
parar; repeti-la significava sondar a porta duas vezes para dar a mesma
resposta, e antes gerava **duas mensagens** sobre o mesmo processo.

---

## Depuração: quem é dono de quem

```
editor ──stdio──► pawnpro-core ── debug.start ──► endereço do soquete
  │                   │
  │                   └─ sessão DAP (thread) ──spawn──► omp-server + plugin
  │                            ├─ Drop: SIGKILL + wait()
  │                            └─ PR_SET_PDEATHSIG (Linux): o servidor
  │                               morre com a thread da sessão
  │
  └─ soquete: `PAWNPRO/1 dap`          plugin: `PAWNPRO/1 plugin <sessão>`
```

Um soquete só no core atende LSP, DAP e o plugin; a primeira linha de cada
conexão diz a que canal ela pertence. A extensão fala DAP por um adaptador
inline (`SocketDebugAdapter`) e não rastreia processo nenhum.

Consequências que o painel precisa respeitar:

- **O painel não mata esse servidor.** Só a sessão de depuração o encerra. Por
  isso o `stop` delega em vez de procurar PIDs.
- **No restart a sessão sobrevive** e só o servidor é trocado.
- **Não há terminal.** O console vem do tail do arquivo de log, que independe de
  quem subiu o servidor.

Ciclo de vida da sessão no painel:

| Evento | Efeito |
|---|---|
| `onDidStartDebugSession` (type `pawn`) | guarda a sessão; `origin='external'` |
| `onDidTerminateDebugSession` | limpa **se o `id` bater** — outra sessão viva não pode ser apagada |

### A barra de progresso da depuração

Os controles nativos (barra flutuante, F5, Shift+F5) não passam pelo painel. Um
tracker lê o tráfego DAP, e a decisão fica em `DebugCycle`, testada com a
sequência real de mensagens:

| Mensagem | Efeito |
|---|---|
| requisição `restart` | abre "Reiniciando" |
| requisição `terminate` / `disconnect` | abre "Parando" |
| evento `pawnproRebuild` | a compilação reusa a barra aberta, trocando o título |
| evento `continued` | fecha: o servidor novo está de pé |
| evento `terminated` ou resposta ao `disconnect` | fecha e marca o fim |

Depois do fim nada reabre a barra. Ao parar, o editor manda `terminate`, recebe
`terminated` e só então `disconnect`: abrir "Parando" nesse `disconnect` e
esperar outro `terminated` deixava a barra presa.

---

## Tolerância, e o perigo dela

`ServerRegistry.status()` mantém `alive` por até `FAILURES_UNTIL_DEAD` (3)
sondagens perdidas — ~12 s. Existe porque a sondagem é **um datagrama UDP sem
retransmissão**: um pacote perdido fazia o painel oscilar, e cada oscilação
reiniciava o tail, apagando o console.

O preço: por ~12 s o registry afirma algo que pode não ser verdade, e
`if (!alive) this.origin = 'none'` faz a **origem caducar junto**.

> **Regra:** a tolerância serve à vigilância periódica e à exibição. Nunca a use
> para decidir *como* parar ou reiniciar. Foi assim que o bug do órfão nasceu:
> uma sondagem perdida zerava a origem `'debug'`, o ramo do `stopDebugging` era
> pulado, **nenhum** ramo rodava, e o servidor vivo era acusado de órfão.

---

## Encerrar quem está na porta (`resolvePortConflict`)

Retorna `'free' | 'keep' | 'busy'` — três estados, porque um `boolean` já
significou três coisas diferentes e escondia casos.

```
pidsOnPort(port) ─filtra─► isProjectServer(pid, exe)
  │                          (mesmo executável do projeto E mesmo usuário)
  │
  ├─ lista vazia → "ocupada por outro programa" ──────────────────► 'busy'
  │
  └─ um aviso só, com as saídas:
       ├─ "Encerrar"          → kill em paralelo + waitForPort(false, 4 s)
       │      └─ livre ? 'free' : 'busy' (+ erro nomeando sobreviventes)
       ├─ "Usar esse servidor" (só no start, e só com 1 processo) → 'keep'
       └─ diálogo dispensado → 'busy'   ← dispensar não é escolher
```

**O filtro é de segurança, não cosmético.** A porta vem do `config.json` do
repositório. Sem `isProjectServer`, um gamemode com `"port": 53` transformaria o
botão de encerrar numa arma contra serviços do sistema.

**"Usar esse servidor" só no start, e só com um processo:** quem mandou parar não
quer escolher servidor, e com vários não há como dizer qual ficaria.

---

## F5: o que acontece antes da sessão

```
resolveDebugConfigurationWithSubstitutedVariables
  └─ doResolve
       ├─ expande ${workspaceFolder} / ${file}
       ├─ `program` definido? ──── não → aborta
       ├─ ensureDebugBuild → compila com -d3 (o core troca qualquer -d)
       ├─ resolve `locale` (mesma fonte do LSP)
       └─ prepareServer
            ├─ resolve exe/args/cwd
            ├─ preflight do plugin (arquitetura, nome, registro)
            │     └─ falhou → "iniciar mesmo assim" / cancelar
            └─ grava `serverCommand` — NÃO sobe o servidor
                  (quem sobe é a sessão no core, para o processo ser filho dela)

createDebugAdapterDescriptor
  └─ debug.start → endereço → conecta com `PAWNPRO/1 dap`
       └─ o `launch` leva o `serverCommand`; a sessão sobe o servidor com as
          variáveis que o plugin lê (endpoint, sessão, `.amx`, idioma)
```

`ensurePortFree` roda entre o preflight e a gravação do `serverCommand`, com o
mesmo filtro de segurança do painel: só oferece encerrar o que é comprovadamente
o executável do projeto e do mesmo usuário. Quem não passa no filtro rende
aviso, e seguir é decisão do usuário. Confirma pela porta antes de liberar a
subida — matar o processo não basta.

### Ainda em aberto

- **TOCTOU no encerramento.** Entre `isProjectServer(pid)` e o `kill`, o PID
  poderia em tese ser reciclado. Explorá-lo exige vencer uma corrida de
  milissegundos com o PID exato, e o primeiro sinal é SIGTERM. Aceito como
  risco residual.

---

## Ao mexer aqui, verifique

- [ ] O laço termina observando **a porta**, não um evento ou um prazo fixo?
- [ ] O `await` está presente onde o chamador precisa do resultado?
- [ ] A decisão usa `debugSession`/`term`, e não a origem do registry?
- [ ] `restarting` continua sendo parâmetro, nunca campo?
- [ ] Guardas usam `responded`; exibição usa `alive`?
- [ ] Mensagem nova entrou nos **seis** bundles, e nenhuma ficou órfã?
- [ ] Processos limpos depois de vários ciclos?

```bash
# nenhum sobrevivente, nenhum zumbi
ps -eo pid,ppid,etimes,comm= | rg 'omp-server|pawnpro-core'
lsof -ti udp:7777 | while read p; do echo "$p -> $(readlink -f /proc/$p/exe)"; done

# órfãs e faltantes nos bundles
python3 - <<'EOF'
import re,io,json,glob
src=io.open('src/editor/nls.ts',encoding='utf-8').read()
keys={re.sub(r"\\(.)",r"\1",m.group(1)[1:-1])
      for m in re.finditer(r"\bt\(\s*('(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\")",src)}
for f in sorted(glob.glob('l10n/bundle.l10n*.json')):
    b=set(json.load(io.open(f,encoding='utf-8')))
    print(f, "órfãs:", b-keys or "—", "faltando:", keys-b or "—")
EOF
```

> Subir um zumbi para teste (leva ~10 s para aparecer na porta):
> ```bash
> cd /caminho/do/servidor && (setsid ./omp-server >/dev/null 2>&1 &)
> ```
