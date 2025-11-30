//server.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fsp from 'fs/promises';
import * as iconv from 'iconv-lite';
import * as dgram from 'dgram';
import { ServerViewProvider } from './serverView.js';

type ServerState = 'stopped' | 'starting' | 'running';
const IS_WINDOWS = process.platform === 'win32';

function substWorkspace(p?: string): string {
  if (!p) return '';
  const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
  return p.replace(/\$\{workspaceFolder\}/g, ws);
}

function norm(p: string): string {
  const unq = p.trim().replace(/^["']|["']$/g, '');
  return path.normalize(unq);
}

function getCfg() {
  const cfg = vscode.workspace.getConfiguration();
  return {
    exe: substWorkspace(cfg.get<string>('pawnpro.server.path') || ''),
    cwd: substWorkspace(cfg.get<string>('pawnpro.server.cwd') || '${workspaceFolder}'),
    args: (cfg.get<string[]>('pawnpro.server.args') || []).map(substWorkspace),
    clearOnStart: cfg.get<boolean>('pawnpro.server.clearOnStart') ?? true,
    logPath: substWorkspace(cfg.get<string>('pawnpro.server.logPath') || ''),
    logEncoding: (cfg.get<string>('pawnpro.server.logEncoding') || 'windows1252').toLowerCase(),
    follow: (cfg.get<string>('pawnpro.server.output.follow') || 'visible') as 'visible'|'always'|'off',
  };
}

/* ---------- Ler server.cfg ---------- */
type SampCfg = {
  rconPassword: string;
  port: number;
  host: string;
  cfgPath: string;
};

async function loadSampConfig(cwd: string): Promise<SampCfg> {
  const cfgPath = path.join(cwd || '', 'server.cfg');
  let txt = '';
  try { txt = await fsp.readFile(cfgPath, 'utf8'); }
  catch { return { rconPassword: '', port: 7777, host: '127.0.0.1', cfgPath }; }

  let rcon_password = '';
  let port = '7777';
  let bind = '';

  for (const raw of txt.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;
    line = line.replace(/[;#].*$/, '').replace(/\/\/.*$/, '').trim();
    if (!line) continue;
    const [key, ...rest] = line.split(/\s+/);
    const value = rest.join(' ').trim();
    if (!key) continue;
    switch (key.toLowerCase()) {
      case 'rcon_password': rcon_password = value; break;
      case 'port': port = value; break;
      case 'bind': bind = value; break;
    }
  }

  const host = bind && bind !== '0.0.0.0' ? bind : '127.0.0.1';
  const prt = Math.max(1, parseInt(port, 10) || 7777);

  return { rconPassword: rcon_password, port: prt, host, cfgPath };
}

/* ---------- Tail de log (canal único "PawnPro Server") ---------- */
async function readRange(filePath: string, start: number, end: number): Promise<Buffer> {
  const fh = await fsp.open(filePath, 'r');
  try {
    const len = Math.max(0, end - start);
    const buf = Buffer.allocUnsafe(len);
    const { bytesRead } = await fh.read(buf, 0, len, start);
    return bytesRead === len ? buf : buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

class LogTailer {
  private chan = vscode.window.createOutputChannel('PawnPro Server');
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private reading = false;
  private file = '';
  private lastSize = 0;
  private decode = (b: Buffer) => iconv.decode(b, 'windows1252');

  // follow: 'visible' | 'always' | 'off'
  private followMode: 'visible' | 'always' | 'off' = 'visible';
  private assumeVisible = false;

  setFollowModeFromConfig() {
    const { follow } = getCfg();
    this.followMode = follow;
  }

  private maybeFollow() {
    if (this.followMode === 'off') return;
    if (this.followMode === 'always' || (this.followMode === 'visible' && this.assumeVisible)) {
      this.chan.show(true);
    }
  }

  markVisible() { this.assumeVisible = true; }
  markHidden() { this.assumeVisible = false; }

  clear() { this.chan.clear(); this.maybeFollow(); }
  append(s: string) { this.chan.append(s); this.maybeFollow(); }
  appendLine(s: string) { this.chan.appendLine(s); this.maybeFollow(); }

  /** Mostrar o log. focus=true foca o painel; false mantém foco atual. */
  reveal(focus: boolean) {
    this.assumeVisible = true;
    this.chan.show(!focus ? true : false);
  }

  async start(filePath: string, encoding: string) {
    this.stop();
    this.file = norm(filePath);
    this.decode = (b: Buffer) => iconv.decode(b, (encoding || 'windows1252') as any);

    try {
      const st = await fsp.stat(this.file);
      this.lastSize = st.size;
    } catch { this.lastSize = 0; }

    this.chan.clear();
    this.running = true;

    const tick = async () => {
      if (!this.running) return;
      if (this.reading) { this.timer = setTimeout(tick, 100); return; }
      this.reading = true;

      try {
        const st = await fsp.stat(this.file).catch(() => null);
        if (st && typeof st.size === 'number') {
          if (st.size < this.lastSize) {
            this.lastSize = st.size;
          } else if (st.size > this.lastSize) {
            const buf = await readRange(this.file, this.lastSize, st.size);
            if (buf.length) this.append(this.decode(buf));
            this.lastSize = st.size;
          }
        }
      } finally {
        this.reading = false;
        if (this.running) this.timer = setTimeout(tick, 100);
      }
    };

    this.timer = setTimeout(tick, 100);
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.assumeVisible = false;
  }
}

/* ---------- Cliente RCON UDP ---------- */
class SampRconClient {
  constructor(private host: string, private port: number, private password: string) {}

  private buildPacket(cmd: string): Buffer {
    const ipOctets = this.host.split('.').map(n => Math.max(0, Math.min(255, parseInt(n, 10) || 0)));
    const passBuf = Buffer.from(this.password, 'ascii');
    const cmdBuf = Buffer.from(cmd, 'ascii');
    const buf = Buffer.allocUnsafe(11 + 2 + passBuf.length + 2 + cmdBuf.length);
    let o = 0;
    buf.write('SAMP', o, 4, 'ascii'); o += 4;
    buf[o++] = ipOctets[0] || 127;
    buf[o++] = ipOctets[1] || 0;
    buf[o++] = ipOctets[2] || 0;
    buf[o++] = ipOctets[3] || 1;
    buf[o++] = this.port & 0xFF;
    buf[o++] = (this.port >> 8) & 0xFF;
    buf[o++] = 'x'.charCodeAt(0);

    buf[o++] = passBuf.length & 0xFF;
    buf[o++] = (passBuf.length >> 8) & 0xFF;
    passBuf.copy(buf, o); o += passBuf.length;

    buf[o++] = cmdBuf.length & 0xFF;
    buf[o++] = (cmdBuf.length >> 8) & 0xFF;
    cmdBuf.copy(buf, o); o += cmdBuf.length;

    return buf;
  }

  send(cmd: string, timeoutMs = 1500): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      const pkt = this.buildPacket(cmd);
      let done = false;

      const to = setTimeout(() => {
        if (done) return;
        done = true;
        socket.close();
        resolve('');
      }, timeoutMs);

      socket.once('message', (msg) => {
        if (done) return;
        done = true;
        clearTimeout(to);
        socket.close();
        const payload = msg.subarray(11);
        resolve(payload.toString('utf8'));
      });

      socket.once('error', (e) => {
        if (done) return;
        done = true;
        clearTimeout(to);
        socket.close();
        reject(e);
      });

      socket.send(pkt, this.port, this.host);
    });
  }
}

/* ---------- Controller ---------- */
class ServerController {
  private term: vscode.Terminal | null = null;
  private state: ServerState = 'stopped';
  private tailer = new LogTailer();
  private rconCfg: SampCfg | null = null;
  private restarting = false;

  private setState(next: ServerState) {
    this.state = next;
    const running = !!this.term && next === 'running';
    void vscode.commands.executeCommand('setContext', 'pawnpro.server.running', running);
  }

  private async refreshRconFromServerCfg() {
    const { cwd } = getCfg();
    this.rconCfg = await loadSampConfig(cwd);
  }

  async sendLine(line: string) {
    let txt = (line ?? '').trim();
    if (!txt) return;

    if (/^\/?rcon\s+/i.test(txt)) {
      txt = txt.replace(/^\/?rcon\s+/i, '');
      txt = txt.replace(/^login\s+\S+\s*/i, '');
      if (!txt) {
        vscode.window.showInformationMessage('PawnPro: envie apenas o comando, ex.: "gmx" ou "say oii".');
        return;
      }
    }

    if (!this.rconCfg) await this.refreshRconFromServerCfg();
    const cfg = this.rconCfg!;

    const invalidPwd = !cfg.rconPassword || /^(changename)$/i.test(cfg.rconPassword);

    if (!invalidPwd) {
      try {
        const client = new SampRconClient(cfg.host, cfg.port, cfg.rconPassword);
        const out = await client.send(txt, 1500);
        this.tailer.appendLine(`> ${txt}`);
        if (out && out.trim()) this.tailer.appendLine(out.trim());
        this.tailer.markVisible();
        return;
      } catch (e: any) {
        vscode.window.showErrorMessage(`PawnPro: falha ao enviar RCON: ${e?.message || e}`);
        return;
      }
    } else {
      vscode.window.showWarningMessage('PawnPro: senha RCON vazia ou inválida ("changename"). Comando não enviado.');
    }

    if (!this.term) {
      vscode.window.showWarningMessage('PawnPro: servidor não está em execução.');
      return;
    }
    this.term.sendText(txt, true);
    this.tailer.markVisible();
  }

  start() {
    if (this.term) {
      if (!this.restarting) vscode.window.showInformationMessage('PawnPro: servidor já está em execução.');
      return;
    }
    const { exe, cwd, args, clearOnStart, logPath, logEncoding } = getCfg();
    if (!exe) {
      vscode.window.showErrorMessage('PawnPro: configure "pawnpro.server.path" (executável do servidor).');
      return;
    }
    if (clearOnStart) this.tailer.clear();

    this.tailer.setFollowModeFromConfig();
    this.setState('starting');

    try {
      const t = vscode.window.createTerminal({
        name: 'PawnPro Server',
        cwd,
        shellPath: norm(exe),
        shellArgs: args
      });
      this.term = t;
      t.show(false); // foca console quando iniciado

      void this.refreshRconFromServerCfg();

      if (!IS_WINDOWS && logPath) this.tailer.start(logPath, logEncoding);

      const onClose = vscode.window.onDidCloseTerminal((closed) => {
        if (closed === this.term) {
          this.tailer.stop();
          this.term = null;
          this.setState('stopped');
          this.tailer.markHidden();
          onClose.dispose();
        }
      });

      setTimeout(() => {
        if (this.term === t) this.setState('running');
      }, 150);
    } catch (e: any) {
      this.term = null;
      this.setState('stopped');
      vscode.window.showErrorMessage(`PawnPro: falha ao iniciar servidor: ${e?.message || e}`);
    } finally {
      this.restarting = false;
    }
  }

  stop(): Promise<void> {
    const termRef = this.term;
    if (!termRef) {
      this.setState('stopped');
      this.tailer.stop();
      this.tailer.markHidden();
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const onClose = vscode.window.onDidCloseTerminal((closed) => {
        if (closed === termRef) {
          onClose.dispose();
          if (this.term === termRef || this.term === null) {
            this.tailer.stop();
            if (this.term === termRef) this.term = null;
            this.setState('stopped');
            this.tailer.markHidden();
          }
          resolve();
        }
      });

      try { termRef.sendText('exit', true); } catch {}
      setTimeout(() => { try { termRef.dispose(); } catch {} }, 600);

      setTimeout(() => {
        onClose.dispose();
        if (this.term === termRef || this.term === null) {
          this.tailer.stop();
          if (this.term === termRef) this.term = null;
          this.setState('stopped');
          this.tailer.markHidden();
        }
        resolve();
      }, 3000);
    });
  }

  async restart() {
    this.restarting = true;
    await this.stop();
    this.start();
  }

  /** Mostrar APENAS o console (terminal) do servidor. */
  revealConsole() {
    if (!this.term) {
      vscode.window.showInformationMessage('PawnPro: servidor não está em execução.');
      return;
    }
    this.term.show(false); // foca o terminal
  }

  /** Mostrar APENAS o log (OutputChannel). */
  revealLog() {
    this.tailer.reveal(true); // foca o painel de saída
    this.tailer.markVisible();
  }

  onDidCloseTerminal(_: vscode.Terminal) {}
}

export function registerServerControls(context: vscode.ExtensionContext) {
  const srv = new ServerController();

  context.subscriptions.push(
    vscode.commands.registerCommand('pawnpro.server.start',   () => srv.start()),
    vscode.commands.registerCommand('pawnpro.server.stop',    () => { void srv.stop(); }),
    vscode.commands.registerCommand('pawnpro.server.restart', () => { void srv.restart(); }),
    vscode.commands.registerCommand('pawnpro.server.show',    () => srv.revealConsole()),
    vscode.commands.registerCommand('pawnpro.server.showLog', () => srv.revealLog()),
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('pawnpro.server.output.follow')) {
        // @ts-ignore
        srv['tailer']?.setFollowModeFromConfig?.();
      }
    })
  );

  // 🔁 Um ÚNICO provider para AMBOS os IDs (container e explorer),
  // garantindo estado compartilhado entre as duas views.
  const provider = new ServerViewProvider(context, (text: string) => { void srv.sendLine(text); });

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('pawnpro.serverView', provider),
    vscode.window.registerWebviewViewProvider('pawnpro.serverView.explorer', provider)
  );
  void vscode.commands.executeCommand('setContext', 'pawnpro.server.running', false);
}
