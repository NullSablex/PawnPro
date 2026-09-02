import * as vscode from 'vscode';
import * as fsp from 'fs/promises';
import { LogTailer, SampRconClient, killProcess, isLoopbackHost, loadServerConfig, pidsOnPort, resolveServerConfig } from '../core/server.js';
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
function esperar(ms: number): Promise<void> {
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
  private restarting = false;
  readonly registry = new ServerRegistry();

  constructor(
    private readonly config: PawnProConfigManager,
    outputChannel: vscode.OutputChannel,
  ) {
    this.tailer = new LogTailer(createOutputSink(outputChannel));

    // O contexto do editor passa a seguir o registry: uma origem só, para o
    // painel, a barra de status e os `when` do package.json.
    this.registry.onChange((st) => {
      void vscode.commands.executeCommand('setContext', 'pawnpro.server.running', st.vivo);
      // O log é do servidor, não de quem o iniciou: se ele está no ar e há um
      // caminho de log resolvido, acompanhar. É isso que devolve a saída do
      // console durante uma sessão de depuração.
      if (st.vivo) this.garantirTail();
      else { this.tailer.stop(); this.tailer.markHidden(); }
    });
    // A porta vem do `server.cfg`/`config.json` do projeto. Sem carregar isto
    // primeiro, a vigilância sondaria 7777 num projeto que usa outra porta e
    // reportaria "parado" com o servidor no ar.
    void this.refreshRconFromServerCfg().then(() => {
      this.registry.vigiar(() => this.enderecoAtual());
      return this.statusAtual();
    });
  }

  /** Host e porta do servidor deste projeto, para sondagem. */
  private enderecoAtual(): { host: string; port: number } {
    return { host: this.rconCfg?.host ?? '127.0.0.1', port: this.rconCfg?.port ?? 7777 };
  }

  /**
   * Liga o tail do log se ainda não estiver ligado.
   *
   * Vale para qualquer origem: o arquivo de log existe independentemente de o
   * servidor ter subido pelo painel ou pelo depurador.
   */
  private garantirTail(): void {
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
  async statusAtual() {
    const { host, port } = this.enderecoAtual();
    return this.registry.status(host, port);
  }

  dispose(): void {
    this.registry.dispose();
  }

  getTailer(): LogTailer { return this.tailer; }

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
      if (escolha === ligar) await this.ligarRcon(cfg);
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
   * A porta continua ocupada depois de parar: identifica quem a segura e
   * oferece encerrá-lo.
   *
   * O terminal fecha, mas nada garante que o processo morreu — e um órfão na
   * porta faz o painel e o RCON responderem por um servidor que já não é o do
   * projeto. Sem isto restava pedir ao usuário que descobrisse por conta.
   */
  private async oferecerEncerrarOrfao(): Promise<void> {
    const { port } = this.enderecoAtual();
    const pids = pidsOnPort(port);
    if (!pids.length) {
      // Windows, ou sem ferramenta para consultar: só o aviso.
      vscode.window.showWarningMessage(`PawnPro: ${msg.server.stopTimeout()}`);
      return;
    }

    const list = pids.join(', ');
    // O `vscode-l10n` não pluraliza, então cada mensagem tem as duas formas e
    // a contagem escolhe — "o processo 1, 2" não é português.
    const byCount = <T>(one: T, many: T) => (pids.length > 1 ? many : one);

    const kill = msg.server.btnKillOrphan();
    const choice = await vscode.window.showWarningMessage(
      `PawnPro: ${byCount(msg.server.orphanOnPort, msg.server.orphansOnPort)(port, list)}`,
      kill,
    );
    if (choice !== kill) return;

    // Progresso enquanto encerra: são SIGTERM, o prazo e talvez SIGKILL, e sem
    // sinal nenhum o usuário não sabe se o clique surtiu efeito.
    const { survivors, free } = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `PawnPro: ${byCount(msg.server.killingOrphan, msg.server.killingOrphans)()}`,
        cancellable: false,
      },
      async () => {
        // Em paralelo: os processos são independentes, e em série cada um
        // somaria seu próprio prazo de SIGTERM antes do seguinte.
        const ok = await Promise.all(pids.map(pid => killProcess(pid)));
        // A porta é a confirmação real: um processo pode morrer sem liberá-la
        // de imediato, e o painel só deve dizer "parado" quando ela estiver
        // livre de fato.
        return { survivors: pids.filter((_, i) => !ok[i]), free: await this.esperarPorta(false, 4000) };
      },
    );
    await this.statusAtual();

    // A porta livre é o que o usuário queria: um PID que resistiu mas a soltou
    // não é problema dele.
    if (free) {
      vscode.window.showInformationMessage(`PawnPro: ${msg.server.killOk(port)}`);
      return;
    }
    if (survivors.length) {
      const rest = survivors.join(', ');
      const failed = survivors.length > 1 ? msg.server.killFailedMany : msg.server.killFailed;
      vscode.window.showErrorMessage(`PawnPro: ${failed(rest)}`);
    }
  }


  async start() {
    const existing = this.findExistingTerminal();
    if (existing) {
      if (this.term !== existing) this.term = existing;
      void this.statusAtual();
      if (!this.restarting) {
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
    if (!this.restarting) {
      await this.refreshRconFromServerCfg();
      const st = await this.statusAtual();
      // Servidor da depuração é conhecido e legítimo: iniciar outro por cima é
      // que seria o erro. O aviso aqui é para órfão ou servidor externo.
      // `respondeu`, e não `vivo`: barrar o start exige que a porta tenha
      // respondido agora. `vivo` sobrevive a algumas perdas para o painel não
      // piscar, e essa inércia carrega junto a origem — uma sessão de depuração
      // encerrada bloquearia a próxima por alguns segundos.
      if (st.respondeu && st.origem === 'debug') {
        vscode.window.showInformationMessage(`PawnPro: ${msg.server.alreadyRunningDebug()}`);
        return;
      }
      if (st.respondeu && st.origem !== 'terminal') {
        const usar = msg.server.btnUseRunning();
        const trocar = msg.server.btnRestartClean();
        const escolha = await vscode.window.showWarningMessage(
          `PawnPro: ${msg.server.portInUse(st.port)}`,
          usar,
          trocar,
        );
        if (escolha === usar) {
          this.registry.marcarOrigem('externo');
          void this.statusAtual();
          return;
        }
        if (escolha !== trocar) return;
        await this.stop();
      }
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
          void this.statusAtual();
        }
      });

      // Sondagem em vez de prazo fixo: o servidor sobe quando sobe, e antes
      // disso o painel não deve dizer que está no ar.
      void this.esperarPorta(true, 15000).then(() => {
        this.registry.marcarOrigem('terminal');
        return this.statusAtual();
      });
    } catch (err: unknown) {
      this.term = null;
      void this.statusAtual();
      vscode.window.showErrorMessage(`PawnPro: ${msg.server.failedStart(err instanceof Error ? err.message : String(err))}`);
    } finally {
      this.restarting = false;
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
  async stop(): Promise<void> {
    const termRef = this.term;

    if (termRef) {
      // `exit` é a saída limpa: dá ao servidor a chance de salvar e desligar os
      // componentes. O dispose vem depois, para o caso de ele ignorar.
      try { termRef.sendText('exit', true); } catch { /* terminal já foi */ }
      await esperar(600);
      try { termRef.dispose(); } catch { /* já descartado */ }
      if (this.term === termRef) this.term = null;
    } else if (this.registry.ultimoConhecido()?.origem === 'debug') {
      // Servidor da sessão de depuração: o processo é filho do adaptador, então
      // quem o encerra é o próprio depurador. Sem isto, parar pelo painel não
      // faria nada — não há terminal para fechar.
      await vscode.debug.stopDebugging();
    }

    // Confirma pela porta, não pelo terminal.
    const parou = await this.esperarPorta(false, 6000);
    await this.statusAtual();

    if (!parou) await this.oferecerEncerrarOrfao();
  }

  /**
   * Liga `rcon.enable` no `config.json` do servidor.
   *
   * Escreve só essa chave, preservando o resto do arquivo como está — é
   * configuração do usuário, não da extensão. Exige reiniciar o servidor para
   * valer, e o aviso diz isso.
   */
  private async ligarRcon(cfg: SampCfgData): Promise<void> {
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
  private async esperarPorta(vivoEsperado: boolean, prazoMs: number): Promise<boolean> {
    const fim = Date.now() + prazoMs;
    const { host, port } = this.enderecoAtual();
    while (Date.now() < fim) {
      if ((await pingServer(host, port, 500)) === vivoEsperado) return true;
      await esperar(400);
    }
    return false;
  }



  async restart() {
    // Servidor da depuração: quem o detém é o adaptador, então o pedido vai
    // pelo editor. O adaptador troca o processo por baixo e mantém a sessão
    // viva, reresolvendo os breakpoints contra o `.amx` recompilado — que é o
    // motivo mais comum de reiniciar.
    if (!this.term && this.registry.ultimoConhecido()?.origem === 'debug') {
      await vscode.commands.executeCommand('workbench.action.debug.restart');
      return;
    }
    this.restarting = true;
    await this.stop();
    await this.start();
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
    const st = await this.statusAtual();
    if (!st.vivo) {
      vscode.window.showInformationMessage(`PawnPro: ${msg.server.notRunning()}`);
      return;
    }
    this.garantirTail();
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
    this.garantirTail();
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
  // pelo terminal do painel. Declarar a origem aqui é o que faz o painel
  // reconhecer esse servidor em vez de mostrá-lo como parado.
  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession((sessao) => {
      if (sessao.type !== 'pawn') return;
      srv.registry.marcarOrigem('debug');
      void srv.statusAtual();
    }),
    vscode.debug.onDidTerminateDebugSession((sessao) => {
      if (sessao.type !== 'pawn') return;
      void srv.statusAtual();
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
}
