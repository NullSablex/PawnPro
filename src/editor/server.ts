import * as vscode from 'vscode';
import * as fsp from 'fs/promises';
import { LogTailer, SampRconClient, isLoopbackHost, loadServerConfig, resolveServerConfig } from '../core/server.js';
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
    this.registry.vigiar(() => this.enderecoAtual());
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
    if (resolved.logPath) this.tailer.start(resolved.logPath, resolved.logEncoding);
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
        const out = await client.send(txt, 1500);
        this.tailer.appendLine(`> ${txt}`);
        if (out && out.trim()) {
          this.tailer.appendLine(out.trim());
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

  async start() {
    const existing = this.findExistingTerminal();
    if (existing) {
      if (this.term !== existing) this.term = existing;
      void this.statusAtual();
      if (!this.restarting) {
        vscode.window.showInformationMessage(`PawnPro: ${msg.server.alreadyRunning()}`);
        existing.show(false);
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
      if (st.vivo && st.origem === 'debug') {
        vscode.window.showInformationMessage(`PawnPro: ${msg.server.alreadyRunningDebug()}`);
        return;
      }
      if (st.vivo && st.origem !== 'terminal') {
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
      t.show(false);

      void this.refreshRconFromServerCfg();

      if (!IS_WINDOWS && resolved.logPath) this.tailer.start(resolved.logPath, resolved.logEncoding);

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

    if (!parou) {
      vscode.window.showWarningMessage(`PawnPro: ${msg.server.stopTimeout()}`);
    }
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
    // O servidor da depuração é filho do processo do adaptador, que o mata no
    // seu `Drop`. Reiniciar só o servidor deixaria o depurador anexado a um
    // processo morto — a vida dos dois é a mesma, por construção. Então
    // reiniciar aqui é reiniciar a sessão, que é o que o editor já sabe fazer
    // (e que reanexa o depurador, preservando os breakpoints).
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
  async revealConsole() {
    if (this.term) {
      this.term.show(false);
      return;
    }
    const st = await this.statusAtual();
    if (!st.vivo) {
      vscode.window.showInformationMessage(`PawnPro: ${msg.server.notRunning()}`);
      return;
    }
    this.garantirTail();
    this.tailer.markVisible();
  }

  revealLog() {
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
