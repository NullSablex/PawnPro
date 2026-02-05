import * as path from 'path';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as iconv from 'iconv-lite';
import * as dgram from 'dgram';
import type { SampCfgData, OutputSink, PawnProConfig } from './types.js';

/* ─── Path helpers ──────────────────────────────────────────────── */

function norm(p: string): string {
  const unq = p.trim().replace(/^["']|["']$/g, '');
  return path.normalize(unq);
}

function existsExecutable(p: string): boolean {
  try {
    if (!fs.existsSync(p)) return false;
    if (fs.statSync(p).isDirectory()) return false;
    if (process.platform !== 'win32') fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch { return false; }
}

/* ─── Auto-detect SA-MP server executable ───────────────────────── */

const SERVER_NAMES = process.platform === 'win32'
  ? ['samp-server.exe', 'samp03svr.exe']
  : ['samp03svr', 'samp-server'];

function serverCandidates(workspaceRoot: string): string[] {
  if (!workspaceRoot) return [];
  const dirs = [
    workspaceRoot,
    path.join(workspaceRoot, 'server'),
    path.join(workspaceRoot, 'samp'),
    path.join(workspaceRoot, 'samp-server'),
    path.join(workspaceRoot, 'samp03'),
  ];
  const out: string[] = [];
  for (const d of dirs) {
    for (const n of SERVER_NAMES) {
      out.push(path.join(d, n));
    }
  }
  return out;
}

export function detectServerExecutable(workspaceRoot: string): string | null {
  for (const c of serverCandidates(workspaceRoot)) {
    if (existsExecutable(c)) return c;
  }
  return null;
}

/* ─── Read server.cfg ───────────────────────────────────────────── */

export async function loadSampConfig(cwd: string): Promise<SampCfgData> {
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

/* ─── Log file tailing ──────────────────────────────────────────── */

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

export class LogTailer {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private reading = false;
  private file = '';
  private lastSize = 0;
  private decode = (b: Buffer) => iconv.decode(b, 'windows1252');

  private followMode: 'visible' | 'always' | 'off' = 'visible';
  private assumeVisible = false;

  constructor(private output: OutputSink) {}

  setFollowMode(mode: 'visible' | 'always' | 'off') {
    this.followMode = mode;
  }

  private maybeFollow() {
    if (this.followMode === 'off') return;
    if (this.followMode === 'always' || (this.followMode === 'visible' && this.assumeVisible)) {
      this.output.show(true);
    }
  }

  markVisible() { this.assumeVisible = true; }
  markHidden() { this.assumeVisible = false; }

  clear() { this.output.clear(); this.maybeFollow(); }
  append(s: string) { this.output.append(s); this.maybeFollow(); }
  appendLine(s: string) { this.output.appendLine(s); this.maybeFollow(); }

  reveal(focus: boolean) {
    this.assumeVisible = true;
    this.output.show(!focus);
  }

  async start(filePath: string, encoding: string) {
    this.stop();
    this.file = norm(filePath);
    this.decode = (b: Buffer) => iconv.decode(b, (encoding || 'windows1252') as any);

    try {
      const st = await fsp.stat(this.file);
      this.lastSize = st.size;
    } catch { this.lastSize = 0; }

    this.output.clear();
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

/* ─── RCON UDP Client ───────────────────────────────────────────── */

export class SampRconClient {
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

/* ─── Config resolution ─────────────────────────────────────────── */

export function resolveServerConfig(config: PawnProConfig['server'], workspaceRoot: string) {
  // Auto-detect server executable if not configured
  let exe = config.path;
  if (!exe) {
    exe = detectServerExecutable(workspaceRoot) || '';
  }

  // Derive cwd from exe location if not configured
  let cwd = config.cwd || workspaceRoot;
  if (exe && !config.cwd) {
    cwd = path.dirname(exe);
  }

  // Derive logPath from cwd if not configured
  let logPath = config.logPath;
  if (!logPath && cwd) {
    logPath = path.join(cwd, 'server_log.txt');
  }

  return {
    exe,
    cwd,
    args: config.args,
    clearOnStart: config.clearOnStart,
    logPath,
    logEncoding: (config.logEncoding || 'windows1252').toLowerCase(),
    follow: config.output.follow,
  };
}
