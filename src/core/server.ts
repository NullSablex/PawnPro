import * as path from 'path';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as iconv from 'iconv-lite';
import * as dgram from 'dgram';
import type { SampCfgData, OutputSink, PawnProConfig } from './types.js';

function stripQuotes(p: string): string {
  return path.normalize(p.trim().replace(/^["']|["']$/g, ''));
}

function existsExecutable(p: string): boolean {
  try {
    if (!fs.existsSync(p)) return false;
    if (fs.statSync(p).isDirectory()) return false;
    if (process.platform !== 'win32') fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch { return false; }
}

const SERVER_NAMES = process.platform === 'win32'
  ? ['omp-server.exe', 'samp-server.exe', 'samp03svr.exe']
  : ['omp-server', 'samp03svr', 'samp-server'];

function serverCandidates(workspaceRoot: string): string[] {
  if (!workspaceRoot) return [];
  const dirs = [
    workspaceRoot,
    path.join(workspaceRoot, 'server'),
    path.join(workspaceRoot, 'samp'),
    path.join(workspaceRoot, 'samp-server'),
    path.join(workspaceRoot, 'samp03'),
    path.join(workspaceRoot, 'open.mp'),
  ];
  return dirs.flatMap(d => SERVER_NAMES.map(n => path.join(d, n)));
}

export function detectServerExecutable(workspaceRoot: string): string | null {
  for (const c of serverCandidates(workspaceRoot)) {
    if (existsExecutable(c)) return c;
  }
  return null;
}

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

export async function loadOmpConfig(cwd: string): Promise<SampCfgData> {
  const cfgPath = path.join(cwd || '', 'config.json');
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(await fsp.readFile(cfgPath, 'utf8')) as Record<string, unknown>; } catch {}

  const rcon = json?.['rcon'] as Record<string, unknown> | undefined;
  const network = json?.['network'] as Record<string, unknown> | undefined;
  const rconPassword = String(rcon?.['password'] ?? '');
  const rawPort = network?.['port'] ?? 7777;
  const bind = String(network?.['bind'] ?? '');
  const host = bind && bind !== '0.0.0.0' ? bind : '127.0.0.1';

  return { rconPassword, port: Math.max(1, Number(rawPort) || 7777), host, cfgPath };
}

export async function loadServerConfig(cwd: string, serverType: import('./types.js').ServerType = 'auto'): Promise<SampCfgData> {
  if (serverType === 'omp') return loadOmpConfig(cwd);
  if (serverType === 'samp') return loadSampConfig(cwd);
  if (fs.existsSync(path.join(cwd || '', 'config.json'))) return loadOmpConfig(cwd);
  return loadSampConfig(cwd);
}

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

const LOG_POLL_INTERVAL_MS = 100;

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
    this.file = stripQuotes(filePath);
    this.decode = (b: Buffer) => iconv.decode(b, encoding || 'windows1252');

    try {
      const st = await fsp.stat(this.file);
      this.lastSize = st.size;
    } catch { this.lastSize = 0; }

    this.output.clear();
    this.running = true;

    const tick = async () => {
      if (!this.running) return;
      if (this.reading) { this.timer = setTimeout(tick, LOG_POLL_INTERVAL_MS); return; }
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
        if (this.running) this.timer = setTimeout(tick, LOG_POLL_INTERVAL_MS);
      }
    };

    this.timer = setTimeout(tick, LOG_POLL_INTERVAL_MS);
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.assumeVisible = false;
  }
}

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

export function resolveServerConfig(config: PawnProConfig['server'], workspaceRoot: string) {
  const serverType = config.type ?? 'auto';

  let exe = config.path;
  if (!exe) {
    exe = detectServerExecutable(workspaceRoot) || '';
  }

  let cwd = config.cwd || workspaceRoot;
  if (exe && !config.cwd) {
    cwd = path.dirname(exe);
  }

  let logPath = config.logPath || '';
  if (!logPath && cwd) {
    logPath = resolveLogPath(cwd, serverType);
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

function resolveLogPath(cwd: string, serverType: import('./types.js').ServerType): string {
  if (serverType === 'omp') return path.join(cwd, ompLogFile(cwd));
  if (serverType === 'samp') return path.join(cwd, 'server_log.txt');
  const ompCfg = path.join(cwd, 'config.json');
  if (fs.existsSync(ompCfg)) return path.join(cwd, ompLogFile(cwd));
  return path.join(cwd, 'server_log.txt');
}

function ompLogFile(cwd: string): string {
  try {
    const json = JSON.parse(fs.readFileSync(path.join(cwd, 'config.json'), 'utf8')) as Record<string, unknown>;
    const logging = json?.['logging'] as Record<string, unknown> | undefined;
    return String(logging?.['file'] || 'log.txt');
  } catch { return 'log.txt'; }
}
