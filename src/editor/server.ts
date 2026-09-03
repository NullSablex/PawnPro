import * as vscode from 'vscode';
import * as fsp from 'fs/promises';
import { LogTailer, SampRconClient, isLoopbackHost, isProjectServer, killProcess, loadServerConfig, pidsOnPort, resolveServerConfig } from '../core/server.js';
import { ServerRegistry } from './serverRegistry.js';
import { pingServer } from '../core/server.js';
import { PawnProConfigManager } from '../core/config.js';
import { PawnProStateManager } from '../core/state.js';
import { ServerViewProvider } from './serverView.js';
import { getWorkspaceRoot } from './configBridge.js';
import { msg } from './nls.js';
import type { SampCfgData, OutputSink } from '../core/types.js';

const IS_WINDOWS = process.platform === 'win32';

function createOutputSink(channel: vscode.OutputChannel): OutputSink {
  return {
    clear: () => channel.clear(),
    append: (s) => channel.append(s),
    appendLine: (s) => channel.appendLine(s),
    show: (preserveFocus) => channel.show(preserveFocus),
  };
}

const TERMINAL_NAME = 'PawnPro Server';

/** `setTimeout` como promessa, para o fluxo de parada ficar linear. */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

class ServerController {
  /**
   * Terminal do servidor, quando foi o painel que o iniciou.
   *
   * É apenas **como parar**, não **como saber** — quem responde se o servidor
   * está no ar é o `ServerRegistry`, sondando a porta. Antes este campo era a
   * fonte de verdade, e por isso tudo que não passasse por ele (a sessão de
   * depuração, um processo órfão) ficava invisível para o painel.
   */
  private term: vscode.Terminal | null = null;
  private tailer: LogTailer;
  private rconCfg: SampCfgData | null = null;
  /**
   * Sessão de depuração viva deste projeto, ou `null`.
   *
   * Alimentada pelos eventos do editor, que são fatos: a origem do registry
   * serve ao painel, mas caduca sozinha e não pode decidir COMO parar.
   */
  private debugSession: vscode.DebugSession | null = null;
  readonly registry = new ServerRegistry();

  constructor(
    private readonly config: PawnProConfigManager,
    outputChannel: vscode.OutputChannel,
  ) {
    this.tailer = new LogTailer(createOutputSink(outputChannel));

    // O contexto do editor passa a seguir o registry: uma origem só, para o
    // painel, a barra de status e os `when` do package.json.
    this.registry.onChange((st) => {
      void vscode.commands.executeCommand('setContext', 'pawnpro.server.running', st.alive);
      // Segundo contexto: a porta responder não basta para o painel comandar o
      // servidor. Um processo de outro projeto, ou de outro usuário, deixa os
      // botões de parar e reiniciar visíveis prometendo o que não fazem.
      void this.isOwnServer().then(own =>
        vscode.commands.executeCommand('setContext', 'pawnpro.server.ours', st.alive && own),
      );
      // O log é do servidor, não de quem o iniciou: se ele está no ar e há um
      // caminho de log resolvido, acompanhar. É isso que devolve a saída do
      // console durante uma sessão de depuração.
      if (st.alive) this.ensureTail();
      else { this.tailer.stop(); this.tailer.markHidden(); }
    });
    // A porta vem do `server.cfg`/`config.json` do projeto. Sem carregar isto
    // primeiro, a vigilância sondaria 7777 num projeto que usa outra porta e
    // reportaria "parado" com o servidor no ar.
    void this.refreshRconFromServerCfg().then(() => {
      this.registry.watch(() => this.currentAddress());
      return this.currentStatus();
    });
  }

  /** Host e porta do servidor deste projeto, para sondagem. */
  private currentAddress(): { host: string; port: number } {
    return { host: this.rconCfg?.host ?? '127.0.0.1', port: this.rconCfg?.port ?? 7777 };
  }

  /**
   * Liga o tail do log se ainda não estiver ligado.
   *
   * Vale para qualquer origem: o arquivo de log existe independentemente de o
   * servidor ter subido pelo painel ou pelo depurador.
   */
  private ensureTail(): void {
    if (IS_WINDOWS) return;
    const resolved = resolveServerConfig(this.config.getAll().server, getWorkspaceRoot());
    if (!resolved.logPath) return;
    // `start` limpa o painel e recomeça a leitura. Como a vigilância chama isto
    // a cada poucos segundos enquanto o servidor está no ar, sem a guarda o log
    // seria apagado sem parar e não daria para ler nada.
    if (this.tailer.isTailing(resolved.logPath)) return;
    void this.tailer.start(resolved.logPath, resolved.logEncoding);
  }

  /** Estado atual do servidor, sondando a porta. */
  async currentStatus() {
    const { host, port } = this.currentAddress();
    return this.registry.status(host, port);
  }

  dispose(): void {
    this.registry.dispose();
  }

  getTailer(): LogTailer { return this.tailer; }

  /** Registra a sessão de depuração viva deste projeto. */
  setDebugSession(session: vscode.DebugSession): void {
    this.debugSession = session;
  }

  /**
   * Esquece a sessão, se for a que terminou.
   *
   * A comparação evita que o fim de uma sessão limpe o registro de outra ainda
   * viva — o editor permite mais de uma ao mesmo tempo.
   */
  clearDebugSession(session: vscode.DebugSession): void {
    if (this.debugSession?.id === session.id) this.debugSession = null;
  }

  private findExistingTerminal(): vscode.Terminal | null {
    return vscode.window.terminals.find(t => t.name === TERMINAL_NAME) ?? null;
  }

  private closeOrphanedTerminals(): void {
    for (const t of vscode.window.terminals) {
      if (t.name === TERMINAL_NAME && t !== this.term) {
        t.dispose();
      }
    }
  }



  private async refreshRconFromServerCfg() {
    const cfg = this.config.getAll();
    const ws = getWorkspaceRoot();
    const resolved = resolveServerConfig(cfg.server, ws);
    this.rconCfg = await loadServerConfig(resolved.cwd, cfg.server.type);
  }

  async sendLine(line: string) {
    let txt = (line ?? '').trim();
    if (!txt) return;

    if (/^\/?rcon\s+/i.test(txt)) {
      txt = txt.replace(/^\/?rcon\s+/i, '');
    }
    // `login <senha>` autentica o RCON — o painel já envia autenticado, então
    // repeti-lo só faria a senha aparecer no histórico e no log. Vale tanto
    // depois de `rcon` quanto digitado direto.
    if (/^login(\s|$)/i.test(txt)) {
      vscode.window.showInformationMessage(`PawnPro: ${msg.server.rconHint()}`);
      return;
    }
    if (!txt) return;

    if (!this.rconCfg) await this.refreshRconFromServerCfg();
    const cfg = this.rconCfg!;
    const invalidPwd = !cfg.rconPassword || /^(changename)$/i.test(cfg.rconPassword);
    // O RCON manda a senha em texto claro por UDP. Para um servidor remoto
    // isso a exporia a quem estiver no caminho, então o envio direto fica
    // restrito à máquina local; fora dela, cai no terminal (que não trafega
    // credencial nenhuma).
    const local = isLoopbackHost(cfg.host);

    // RCON desligado no config.json: o servidor não escuta, e mandar o pacote
    // só produziria silêncio. Melhor dizer o que está acontecendo.
    if (!cfg.rconEnabled) {
      const ligar = msg.server.btnEnableRcon();
      const escolha = await vscode.window.showWarningMessage(
        `PawnPro: ${msg.server.rconDisabled()}`,
        ligar,
      );
      if (escolha === ligar) await this.enableRcon(cfg);
      return;
    }

    if (!invalidPwd && local) {
      try {
        const client = new SampRconClient(cfg.host, cfg.port, cfg.rconPassword);
        // O eco sai antes do envio: a resposta só resolve depois do silêncio
        // que fecha a rajada de datagramas, e nesse intervalo o tail do log já
        // despejou as linhas — o comando aparecia embaixo do próprio resultado.
        this.tailer.appendLine(`> ${txt}`);
        const out = await client.send(txt, 1500);
        // O servidor grava no log toda mensagem que devolve pelo console
        // (`ConsoleComponent::sendMessage` escreve com `logLn` antes de
        // entregar ao remetente), então com o tail ativo a resposta já vem por
        // ali — e com timestamp e nível, que a via RCON não tem. Repeti-la aqui
        // duplicaria cada comando no painel.
        if (out && out.trim()) {
          // Só escreve a resposta quando o tail não está no ar. O aviso de
          // "sem saída", logo abaixo, continua valendo nos dois casos: ele não
          // vem do servidor e portanto não está no log.
          if (!this.tailer.ativo) this.tailer.appendLine(out.trim());
        } else {
          // Comandos como `gmx` e `players` (sem ninguém on-line) executam mas
          // não devolvem texto. Sem esta linha, o sucesso silencioso ficava
          // idêntico a uma falha silenciosa.
          this.tailer.appendLine(msg.server.rconSentNoOutput(txt));
        }
        this.tailer.markVisible();
        return;
      } catch (err: unknown) {
        vscode.window.showErrorMessage(`PawnPro: ${msg.server.rconFailed(err instanceof Error ? err.message : String(err))}`);
        return;
      }
    } else if (!local) {
      vscode.window.showWarningMessage(`PawnPro: ${msg.server.rconRemoteBlocked()}`);
    } else {
      vscode.window.showWarningMessage(`PawnPro: ${msg.server.rconInvalidPassword()}`);
    }

    if (!this.term) {
      vscode.window.showWarningMessage(`PawnPro: ${msg.server.notRunning()}`);
      return;
    }
    this.term.sendText(txt, true);
    this.tailer.markVisible();
  }

  /**
   * Executa uma etapa longa com a notificação de progresso do editor.
   *
   * Subir, parar e reiniciar levam segundos e não dão retorno visual nenhum —
   * o painel só muda de estado quando a porta responde.
   */
  private withProgress<T>(title: string, step: () => Promise<T>): Thenable<T> {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `PawnPro: ${title}`,
        cancellable: false,
      },
      step,
    );
  }

  /**
   * A porta continua ocupada depois de parar: identifica quem a segura e
   * oferece encerrá-lo.
   *
   * O terminal fecha, mas nada garante que o processo morreu — e um órfão na
   * porta faz o painel e o RCON responderem por um servidor que já não é o do
   * projeto. Sem isto restava pedir ao usuário que descobrisse por conta.
   */
  /**
   * `true` se o que responde na porta é um servidor que este painel pode
   * comandar: o executável deste projeto, do mesmo usuário, ou a sessão de
   * depuração — que é encerrada pelo adaptador.
   */
  private async isOwnServer(): Promise<boolean> {
    if (this.debugSession) return true;
    const { port } = this.currentAddress();
    const exe = resolveServerConfig(this.config.getAll().server, getWorkspaceRoot()).exe;
    return pidsOnPort(port).some(pid => isProjectServer(pid, exe));
  }

  /**
   * A porta está ocupada por um processo que não é do painel: mostra quem é e
   * deixa o usuário escolher entre encerrá-lo ou seguir com ele.
   *
   * Serve aos dois caminhos que esbarram nisso — parar, quando o terminal
   * fecha mas a porta continua respondendo, e iniciar, quando ela já estava
   * ocupada. Um aviso só, com as duas saídas: perguntar em duas etapas fazia o
   * usuário decidir a mesma coisa duas vezes.
   *
   * Devolve `free` quando a porta ficou livre, `keep` quando o usuário optou
   * por seguir com o servidor que já estava no ar, e `busy` quando ela continua
   * ocupada — diálogo dispensado ou encerramento falhou.
   */
  private async resolvePortConflict(
    port: number,
    { offerKeep }: { offerKeep: boolean },
  ): Promise<'free' | 'keep' | 'busy'> {
    // Só processos que SÃO o executável do servidor deste projeto. A porta vem
    // do config.json do repositório, e sem esta checagem um gamemode com
    // `"port": 53` transformaria o botão de encerrar numa arma contra serviços
    // do sistema.
    const exe = resolveServerConfig(this.config.getAll().server, getWorkspaceRoot()).exe;
    const pids = pidsOnPort(port).filter(pid => isProjectServer(pid, exe));
    if (!pids.length) {
      // A porta responde, mas quem está ali não é o servidor deste projeto —
      // outro programa, ou um processo de outro usuário. Dizer "sobrou um
      // processo" seria falso, e oferecer encerrar, perigoso.
      vscode.window.showWarningMessage(`PawnPro: ${msg.server.portBusyOther(port)}`);
      return 'busy';
    }

    // O `vscode-l10n` não pluraliza: cada mensagem tem as duas formas e a
    // contagem escolhe.
    const byCount = <T>(one: T, many: T) => (pids.length > 1 ? many : one);
    const kill = msg.server.btnKillOrphan();
    // Adotar o que está no ar só cabe ao INICIAR, e com um processo só: quem
    // mandou parar não quer escolher servidor, e com vários não há como dizer
    // qual deles ficaria. É seguro porque a lista já passou pelo filtro — é o
    // executável deste projeto, subido num terminal por fora.
    const options = offerKeep ? byCount([kill, msg.server.btnUseRunning()], [kill]) : [kill];
    const text = byCount(msg.server.orphanOnPort, msg.server.orphansOnPort)(port, pids.join(', '));
    const choice = await vscode.window.showWarningMessage(`PawnPro: ${text}`, ...options);
    // Dispensar o diálogo não é escolher: só o botão diz o que o usuário quer.
    if (choice === undefined) return 'busy';
    if (choice !== kill) return 'keep';

    const { survivors, free } = await this.withProgress(
      byCount(msg.server.killingOrphan, msg.server.killingOrphans)(),
      async () => {
        // Em paralelo: os processos são independentes, e em série cada um
        // somaria seu próprio prazo de SIGTERM antes do seguinte.
        const ok = await Promise.all(pids.map(pid => killProcess(pid)));
        // A porta é a confirmação real: um processo pode morrer sem liberá-la
        // de imediato.
        return {
          survivors: pids.filter((_, i) => !ok[i]),
          free: await this.waitForPort(false, 4000),
        };
      },
    );
    await this.currentStatus();

    if (free) {
      vscode.window.showInformationMessage(`PawnPro: ${msg.server.killOk(port)}`);
      return 'free';
    }
    if (survivors.length) {
      const rest = survivors.join(', ');
      const failed = survivors.length > 1 ? msg.server.killFailedMany : msg.server.killFailed;
      vscode.window.showErrorMessage(`PawnPro: ${failed(rest)}`);
    }
    return 'busy';
  }



  async start({ restarting = false }: { restarting?: boolean } = {}) {
    // O terminal existir não significa que o servidor está no ar: ele fica
    // aberto depois que o processo morre, e antes disto um terminal vazio
    // bloqueava o start para sempre — só fechando à mão. Quem responde se há
    // servidor é a porta, e a origem diz se ele é DESTE terminal: com um órfão
    // ali, "já está rodando" seria sobre outro processo.
    const existing = this.findExistingTerminal();
    const status = existing ? await this.currentStatus() : null;
    if (existing && status?.responded && status.origin === 'terminal') {
      if (this.term !== existing) this.term = existing;
      if (!restarting) {
        vscode.window.showInformationMessage(`PawnPro: ${msg.server.alreadyRunning()}`);
        void this.revealConsole();
      }
      return;
    }

    this.closeOrphanedTerminals();

    // Alguém já está na porta? Pode ser um processo que sobrou de uma execução
    // anterior, ou um servidor iniciado por fora. Subir outro em cima faria os
    // dois disputarem a mesma porta UDP, e o datagrama iria para um deles sem
    // critério — o que torna qualquer diagnóstico não-determinístico.
    // A checagem vale TAMBÉM no reinício: antes era pulada, para o restart não
    // barrar a si mesmo — mas nesse ponto o próprio servidor já foi parado, e
    // quem ainda responde na porta é outro processo. Com um órfão ali, o start
    // seguia calado e o reinício terminava sem servidor.
    await this.refreshRconFromServerCfg();
    const st = await this.currentStatus();
    // Servidor da depuração é conhecido e legítimo: iniciar outro por cima é
    // que seria o erro. O aviso aqui é para órfão ou servidor externo.
    if (this.debugSession) {
      vscode.window.showInformationMessage(`PawnPro: ${msg.server.alreadyRunningDebug()}`);
      return;
    }
    if (st.responded && st.origin !== 'terminal') {
      // Um aviso só, com o que fazer: encerrar quem está ali, ou seguir com
      // ele. Perguntar aqui e de novo dentro do método fazia o usuário decidir
      // a mesma coisa duas vezes.
      const conflict = await this.resolvePortConflict(st.port, { offerKeep: true });
      if (conflict === 'keep') {
        // É o executável deste projeto, então o painel pode operá-lo: o RCON e
        // o console passam a agir sobre ele.
        this.registry.markOrigin('external');
        void this.currentStatus();
        return;
      }
      // Porta ainda ocupada: subir outro em cima faria os dois disputarem o
      // mesmo datagrama.
      if (conflict === 'busy') return;
    }

    const cfg = this.config.getAll();
    const ws = getWorkspaceRoot();
    const resolved = resolveServerConfig(cfg.server, ws);

    if (!resolved.exe) {
      vscode.window.showErrorMessage(`PawnPro: ${msg.server.notConfigured()}`);
      return;
    }
    if (resolved.clearOnStart) this.tailer.clear();

    this.tailer.setFollowMode(resolved.follow);

    try {
      const t = vscode.window.createTerminal({
        name: TERMINAL_NAME,
        cwd: resolved.cwd,
        shellPath: resolved.exe,
        shellArgs: resolved.args,
      });
      this.term = t;
      // O terminal existe para hospedar o processo e para poder pará-lo, não
      // para ser lido: quem mostra o console é o canal de saída, que reúne o
      // log e as respostas do RCON. Trazer o terminal à frente aqui deixava o
      // usuário olhando o painel onde o eco dos comandos nunca aparece.

      void this.refreshRconFromServerCfg();

      if (!IS_WINDOWS && resolved.logPath) {
        this.tailer.start(resolved.logPath, resolved.logEncoding);
        this.tailer.reveal(true);
      }

      const onClose = vscode.window.onDidCloseTerminal((closed) => {
        if (closed === this.term) {
          this.term = null;
          onClose.dispose();
          // Não assume que parou: o terminal fechou, mas o processo pode ter
          // sobrevivido. A sondagem diz o que de fato aconteceu.
          void this.currentStatus();
        }
      });

      // Sondagem em vez de prazo fixo: o servidor sobe quando sobe, e antes
      // disso o painel não deve dizer que está no ar. O progresso acompanha
      // essa espera: subir leva segundos, e sem sinal o usuário não sabe se o
      // clique surtiu efeito.
      const title = restarting ? msg.server.restarting() : msg.server.starting();
      // `await`, não `void`: sem ele o `start` resolvia antes de o servidor
      // subir, e o `restart` dava o ciclo por concluído com a espera ainda
      // correndo — anunciando um fim que ninguém tinha observado.
      const isUp = await this.withProgress(title, () => this.waitForPort(true, 15000));
      if (isUp) this.registry.markOrigin('terminal');
      await this.currentStatus();
      if (isUp) {
        // Reiniciar termina com "reiniciado", não "iniciado": o ciclo é um só,
        // e quem clicou em reiniciar não iniciou nada do zero.
        vscode.window.showInformationMessage(
          `PawnPro: ${restarting ? msg.server.restarted() : msg.server.started()}`,
        );
      } else {
        // O prazo esgotou com a porta muda: o terminal existe, mas o servidor
        // não subiu. Sem isto o clique terminava em silêncio e o painel ficava
        // dizendo "parado" sem explicar por quê.
        vscode.window.showWarningMessage(`PawnPro: ${msg.server.startTimeout()}`);
      }
    } catch (err: unknown) {
      this.term = null;
      void this.currentStatus();
      vscode.window.showErrorMessage(`PawnPro: ${msg.server.failedStart(err instanceof Error ? err.message : String(err))}`);
    }
  }

  /**
   * Para o servidor e só resolve quando ele de fato parou de responder.
   *
   * Antes esperava o terminal fechar e assumia que o processo tinha morrido
   * junto — o que nem sempre é verdade e deixava processos órfãos segurando a
   * porta. Agora o critério é a porta ficar muda: se o terminal fecha mas algo
   * continua respondendo, o usuário fica sabendo em vez de descobrir depois.
   */
  async stop({ restarting = false }: { restarting?: boolean } = {}): Promise<boolean> {
    // A porta responde, mas quem está ali não é deste projeto e não há
    // terminal nosso: não há o que parar. Sem isto o usuário esperava o prazo
    // inteiro para receber a mesma resposta.
    if (!this.term && !(await this.isOwnServer())) {
      const { port } = this.currentAddress();
      vscode.window.showWarningMessage(`PawnPro: ${msg.server.portBusyOther(port)}`);
      return false;
    }

    const termRef = this.term;

    if (termRef) {
      // `exit` é a saída limpa: dá ao servidor a chance de salvar e desligar os
      // componentes. O dispose vem depois, para o caso de ele ignorar.
      try { termRef.sendText('exit', true); } catch { /* terminal já foi */ }
      await delay(600);
      try { termRef.dispose(); } catch { /* já descartado */ }
      if (this.term === termRef) this.term = null;
    } else if (this.debugSession) {
      // Servidor da sessão de depuração: o processo é filho do adaptador, então
      // quem o encerra é o próprio depurador. Sem isto, parar pelo painel não
      // faria nada — não há terminal para fechar.
      //
      // O critério é a sessão que o editor nos entregou, NÃO a origem do
      // registry: aquela expira sozinha (uma sondagem UDP perdida, ou o
      // servidor parado num breakpoint sem responder ao datagrama, zeram a
      // origem em `status()`). Quando expirava, este ramo era pulado, nenhum
      // outro rodava, e o stop terminava sem pedir parada a ninguém — o
      // servidor seguia vivo e era acusado de órfão.
      //
      // Não há o que esperar depois: o adaptador emite `terminated` e, na mesma
      // iteração do laço, mata o filho com SIGKILL e o colhe. Quem confirma a
      // parada é a porta ficar muda, logo abaixo.
      await vscode.debug.stopDebugging(this.debugSession);
    }

    // Confirma pela porta, não pelo terminal.
    const stopped = await this.withProgress(msg.server.stopping(), () =>
      this.waitForPort(false, 6000),
    );
    if (stopped) {
      // A porta calou: o estado é certeza, não estimativa — e por isso a
      // invalidação vem no lugar da sondagem, não depois dela. A tolerância do
      // registry manteria `vivo` por mais ~12 s, e o `start` do reinício veria
      // um servidor fantasma na porta. Sondar antes só produziria um `onChange`
      // com o estado errado, corrigido no evento seguinte — o painel piscando.
      this.registry.markStopped();
      // No reinício quem anuncia é o start, no fim do ciclo.
      if (!restarting) {
        vscode.window.showInformationMessage(`PawnPro: ${msg.server.stopped()}`);
      }
      return true;
    }
    // Continua ocupada: aí sim vale sondar, para o painel refletir quem ficou.
    await this.currentStatus();
    // Parar não oferece adotar: o usuário quer o servidor fora do ar.
    const conflict = await this.resolvePortConflict(this.currentAddress().port, { offerKeep: false });
    // Só `free` é parada de fato. Sem isto o reinício seguia para o `start` com
    // a porta ainda ocupada, que então dava um segundo aviso sobre o mesmo
    // processo — o usuário decidindo duas vezes a mesma coisa.
    return conflict === 'free';
  }

  /**
   * Liga `rcon.enable` no `config.json` do servidor.
   *
   * Escreve só essa chave, preservando o resto do arquivo como está — é
   * configuração do usuário, não da extensão. Exige reiniciar o servidor para
   * valer, e o aviso diz isso.
   */
  private async enableRcon(cfg: SampCfgData): Promise<void> {
    try {
      const bruto = await fsp.readFile(cfg.cfgPath, 'utf8');
      const json = JSON.parse(bruto) as Record<string, unknown>;
      const rcon = (json['rcon'] as Record<string, unknown>) ?? {};
      rcon['enable'] = true;
      json['rcon'] = rcon;
      await fsp.writeFile(cfg.cfgPath, `${JSON.stringify(json, null, 4)}\n`, 'utf8');
      this.rconCfg = null;
      vscode.window.showInformationMessage(`PawnPro: ${msg.server.rconEnabledNow()}`);
    } catch (err: unknown) {
      vscode.window.showErrorMessage(
        `PawnPro: ${msg.server.rconEnableFailed(err instanceof Error ? err.message : String(err))}`,
      );
    }
  }

  /**
   * Espera a porta chegar ao estado desejado, sondando em intervalos curtos.
   *
   * Serve para os dois sentidos: subir (esperar responder) e parar (esperar
   * calar). Antes eram dois laços iguais com a condição invertida.
   *
   * @returns `true` se chegou ao estado dentro do prazo.
   */
  private async waitForPort(expectedAlive: boolean, timeoutMs: number): Promise<boolean> {
    const fim = Date.now() + timeoutMs;
    const { host, port } = this.currentAddress();
    while (Date.now() < fim) {
      if ((await pingServer(host, port, 500)) === expectedAlive) return true;
      await delay(400);
    }
    return false;
  }



  async restart() {
    // Servidor da depuração: quem o detém é o adaptador, então o pedido vai
    // pelo editor. O adaptador troca o processo por baixo e mantém a sessão
    // viva, reresolvendo os breakpoints contra o `.amx` recompilado — que é o
    // motivo mais comum de reiniciar.
    if (!this.term && this.debugSession) {
      // O adaptador troca o processo por baixo sem fechar a sessão, então não
      // há terminal nem evento de parada para observar: quem diz que o ciclo
      // terminou é a porta cair e voltar a responder. Sem isto o clique ficava
      // sem retorno nenhum — o painel só mudava quando o servidor novo subia.
      const isUp = await this.withProgress(msg.server.restarting(), async () => {
        await vscode.commands.executeCommand('workbench.action.debug.restart');
        // A queda pode ser rápida demais para ser vista entre duas sondagens;
        // o que importa é o servidor estar no ar no fim, e o prazo cobre o
        // ciclo inteiro.
        await this.waitForPort(false, 5000);
        return this.waitForPort(true, 15000);
      });
      await this.currentStatus();
      if (isUp) vscode.window.showInformationMessage(`PawnPro: ${msg.server.restarted()}`);
      return;
    }
    // `restarting` silencia o aviso de parada: o ciclo é um só, e anunciar as
    // duas metades seria ruído. O "servidor iniciado" no fim vem do `start`.
    //
    // Não há guarda de porta ocupada aqui: o `stop` já recusa e avisa quando
    // não há o que parar, e repeti-la significava sondar a porta duas vezes
    // para dar a mesma resposta.
    if (!(await this.stop({ restarting: true }))) return;
    await this.start({ restarting: true });
  }

  /**
   * Mostra a saída do servidor.
   *
   * Prefere o terminal quando foi o painel que iniciou; caso contrário — sessão
   * de depuração, ou servidor que já estava no ar — cai no painel de log, que
   * acompanha o arquivo independentemente da origem. Antes só existia o
   * caminho do terminal, então quem depurava ficava sem saída nenhuma.
   */
  /**
   * Mostra o console do servidor — sempre o canal de saída, nunca o terminal.
   *
   * O terminal só tem a saída do processo: os comandos do painel vão por RCON,
   * e a resposta deles existe apenas aqui. Enquanto isto priorizava o terminal,
   * quem mandava um comando era levado ao painel que não mostra a resposta, e o
   * eco parecia perdido.
   */
  async revealConsole() {
    const st = await this.currentStatus();
    if (!st.alive) {
      vscode.window.showInformationMessage(`PawnPro: ${msg.server.notRunning()}`);
      return;
    }
    this.ensureTail();
    this.tailer.reveal(true);
    this.tailer.markVisible();
  }

  /**
   * Abre o painel de log.
   *
   * Garante o tail antes de mostrar: abrir o log com o servidor no ar deve
   * mostrar o log, e não um painel vazio — o que aconteceria se o servidor
   * tivesse subido por um caminho que não liga o tail (a depuração, ou um
   * servidor que já estava rodando).
   */
  revealLog() {
    this.ensureTail();
    this.tailer.reveal(true);
    this.tailer.markVisible();
  }
}

export function registerServerControls(
  context: vscode.ExtensionContext,
  config: PawnProConfigManager,
  state: PawnProStateManager,
) {
  const outputChannel = vscode.window.createOutputChannel('PawnPro Server');
  context.subscriptions.push(outputChannel);

  const srv = new ServerController(config, outputChannel);
  context.subscriptions.push(srv);

  // O depurador sobe o servidor como processo filho do adaptador, sem passar
  // pelo terminal do painel. Guardar a sessão aqui é o que permite ao painel
  // pará-la e reiniciá-la; a origem fica `externo`, que é o que ela sabe dizer
  // — não há terminal nosso por trás.
  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession((sessao) => {
      if (sessao.type !== 'pawn') return;
      srv.setDebugSession(sessao);
      srv.registry.markOrigin('external');
      void srv.currentStatus();
    }),
    vscode.debug.onDidTerminateDebugSession((sessao) => {
      if (sessao.type !== 'pawn') return;
      srv.clearDebugSession(sessao);
      void srv.currentStatus();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('pawnpro.server.start', () => { void srv.start(); }),
    vscode.commands.registerCommand('pawnpro.server.stop', () => { void srv.stop(); }),
    vscode.commands.registerCommand('pawnpro.server.restart', () => { void srv.restart(); }),
    vscode.commands.registerCommand('pawnpro.server.show', () => { void srv.revealConsole(); }),
    vscode.commands.registerCommand('pawnpro.server.showLog', () => srv.revealLog()),
  );

  config.onChange((cfg) => {
    srv.getTailer().setFollowMode(cfg.server.output.follow);
  });

  const provider = new ServerViewProvider(context, config, state, (text: string) => {
    void srv.sendLine(text);
  });

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('pawnpro.serverView', provider),
  );

  // `vscode.l10n` fixa o idioma pelo do editor; as WebViews seguem `ui.locale`,
  // então precisam ser re-renderizadas quando ele muda.
  config.onChange(() => provider.refresh());
  void vscode.commands.executeCommand('setContext', 'pawnpro.server.running', false);
  void vscode.commands.executeCommand('setContext', 'pawnpro.server.ours', false);
}
