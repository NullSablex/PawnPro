# Painel do servidor e painel do depurador — fluxos

Mapa de como iniciar, parar e reiniciar funcionam nos dois painéis, e por quê.
Serve para revisar mudanças sem reabrir a investigação toda: os laços, os
critérios de decisão e as armadilhas já conhecidas.

Arquivos: [`src/editor/server.ts`](../src/editor/server.ts),
[`src/editor/serverRegistry.ts`](../src/editor/serverRegistry.ts),
[`src/editor/debugAdapter.ts`](../src/editor/debugAdapter.ts).
Adaptador DAP (repositório irmão): `crates/dap-adapter/src/main.rs`.

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
   (ver [tolerância](#tolerância-e-o-perigo-dela)). Ela serve para *exibir*.
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
  │     └─ há debugSession → stopDebugging(session)
  │            └─ o adaptador emite `terminated` e, na MESMA iteração,
  │               mata o filho (SIGKILL) e o colhe. Não há o que esperar:
  │               esperar o evento seria esperar o marco errado.
  │
  └─ LAÇO: waitForPort(false, 6 s)  ← barra de progresso
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
  │           │  o adaptador troca o processo por baixo e MANTÉM a sessão;
  │           │  não há terminal nem evento de parada para observar.
  │           └─ LAÇO: waitForPort(false, 5 s) → waitForPort(true, 15 s)
  │                 └─ "reiniciado" ──────────────────────────────► fim
  │
  └─ TERMINAL
        ├─ stop({ restarting: true }) → false ? ───────────────► fim
        └─ start({ restarting: true })
```

**Sem guarda de porta própria.** O `stop` já recusa e avisa quando não há o que
parar; repeti-la significava sondar a porta duas vezes para dar a mesma
resposta, e antes gerava **duas mensagens** sobre o mesmo processo.

**A queda pode passar despercebida** entre duas sondagens, e tudo bem: o
primeiro `waitForPort(false, …)` é oportunista. O que decide é o segundo.

---

## Depuração: quem é dono de quem

```
editor ──spawn──► adaptador DAP ──spawn──► omp-server
                       │                      (filho)
                       └── Drop: SIGKILL + wait()
                       └── PR_SET_PDEATHSIG (Linux): morre com o pai
```

Consequências que o painel precisa respeitar:

- **O painel não mata esse servidor.** Só o adaptador o encerra. Por isso o
  `stop` delega em vez de procurar PIDs.
- **No restart o adaptador sobrevive** e só o servidor é trocado. Verificado:
  sete reinícios seguidos, PID do servidor mudando, adaptador o mesmo, nenhum
  zumbi.
- **Não há terminal.** O console vem do tail do arquivo de log, que independe de
  quem subiu o servidor.

Ciclo de vida da sessão no painel:

| Evento | Efeito |
|---|---|
| `onDidStartDebugSession` (type `pawn`) | guarda a sessão; `origin='external'` |
| `onDidTerminateDebugSession` | limpa **se o `id` bater** — outra sessão viva não pode ser apagada |

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
       ├─ ensureDebugBuild → compila com -d3 (só injeta se não houver -d)
       ├─ gera `session` (canal plugin ↔ adaptador)
       ├─ resolve `locale` (mesma fonte do LSP)
       └─ prepareServer
            ├─ resolve exe/args/cwd
            ├─ preflight do plugin (arquitetura, nome, registro)
            │     └─ falhou → "iniciar mesmo assim" / cancelar
            └─ grava `serverCommand` — NÃO sobe o servidor
                  (quem sobe é o adaptador, para o processo ser filho dele)
```

### Lacuna conhecida

**`prepareServer` não checa a porta.** Faz o preflight do plugin, mas não olha
quem já está em 7777. Com um zumbi ali, o F5 sobe um servidor que disputa o
mesmo datagrama — e o diagnóstico vira não-determinístico. O painel tem
`resolvePortConflict` para isso; este caminho não o usa. Não corrigido ainda.

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
ps -eo pid,ppid,etimes,comm= | rg 'omp-server|pawnpro-dap'
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
> cd ~/Downloads/open.mp-linux-x86/Server && (setsid ./omp-server >/dev/null 2>&1 &)
> ```
