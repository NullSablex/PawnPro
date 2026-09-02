import * as path from 'path';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as iconv from 'iconv-lite';
import * as dgram from 'dgram';
import { randomBytes } from 'crypto';
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
  catch { return { rconPassword: '', port: 7777, host: '127.0.0.1', cfgPath, rconEnabled: true }; }

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

  // O SA-MP não tem chave equivalente: o RCON está sempre disponível.
  return { rconPassword: rcon_password, port: prt, host, cfgPath, rconEnabled: true };
}

export async function loadOmpConfig(cwd: string): Promise<SampCfgData> {
  const cfgPath = path.join(cwd || '', 'config.json');
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(await fsp.readFile(cfgPath, 'utf8')) as Record<string, unknown>; } catch {}

  const rcon = json?.['rcon'] as Record<string, unknown> | undefined;
  // `enable: false` faz o servidor não escutar RCON nenhum. Sem ler isto, a
  // extensão manda pacotes para quem não responde e o timeout passa calado.
  const rconEnabled = rcon?.['enable'] !== false;
  const network = json?.['network'] as Record<string, unknown> | undefined;
  const rconPassword = String(rcon?.['password'] ?? '');
  const rawPort = network?.['port'] ?? 7777;
  const bind = String(network?.['bind'] ?? '');
  const host = bind && bind !== '0.0.0.0' ? bind : '127.0.0.1';

  return { rconPassword, port: Math.max(1, Number(rawPort) || 7777), host, cfgPath, rconEnabled };
}

/**
 * Decide se `cwd` é um servidor open.mp ou SA-MP.
 *
 * A presença de `config.json` sozinha não decide: o open.mp só o gera na
 * primeira execução (antes disso o diretório parece SA-MP), e outras
 * ferramentas usam esse nome para os próprios arquivos (fazendo um servidor
 * SA-MP parecer open.mp). Daí a ordem abaixo, do sinal mais forte ao mais
 * fraco — o executável é inequívoco, o `config.json` só conta quando tem a
 * cara do arquivo do open.mp.
 */
export function detectServerType(cwd: string): 'samp' | 'omp' {
  const dir = cwd || '';
  const exe = process.platform === 'win32' ? '.exe' : '';

  // 1. Executável: nomeia o servidor sem ambiguidade.
  if (fs.existsSync(path.join(dir, `omp-server${exe}`))) return 'omp';
  if (
    fs.existsSync(path.join(dir, `samp03svr${exe}`))
    || fs.existsSync(path.join(dir, `samp-server${exe}`))
  ) {
    return 'samp';
  }

  // 2. `components/`: diretório exclusivo do open.mp.
  if (fs.existsSync(path.join(dir, 'components'))) return 'omp';

  // 3. `config.json` com as chaves que só o open.mp escreve — um JSON
  //    homônimo de outra ferramenta não passa por aqui.
  if (isOmpConfigFile(path.join(dir, 'config.json'))) return 'omp';

  // 4. `server.cfg`: o formato de configuração do SA-MP.
  if (fs.existsSync(path.join(dir, 'server.cfg'))) return 'samp';

  return 'samp';
}

/** `true` se o arquivo é mesmo o `config.json` do open.mp, e não um homônimo. */
function isOmpConfigFile(filePath: string): boolean {
  try {
    const json = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
    if (typeof json !== 'object' || json === null) return false;
    // Chaves de topo do open.mp; `pawn.main_scripts` é a mais característica.
    return ['pawn', 'rcon', 'network', 'logging', 'max_players'].some(k => k in json);
  } catch {
    return false;
  }
}

export async function loadServerConfig(cwd: string, serverType: import('./types.js').ServerType = 'auto'): Promise<SampCfgData> {
  if (serverType === 'omp') return loadOmpConfig(cwd);
  if (serverType === 'samp') return loadSampConfig(cwd);
  return detectServerType(cwd) === 'omp' ? loadOmpConfig(cwd) : loadSampConfig(cwd);
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

/** Limite de cada campo do pacote: o protocolo escreve o tamanho em 16 bits. */
const RCON_FIELD_MAX = 0xFFFF;

/**
 * `true` se o endereço é a própria máquina.
 *
 * O RCON do SA-MP envia a senha **em texto claro** por UDP — o protocolo é de
 * 2005 e não tem cifra nem desafio. Enviá-la para fora da máquina expõe a
 * credencial a quem estiver no caminho, então o painel só fala com o servidor
 * local (que é o caso de uso: depurar o gamemode que se está escrevendo).
 */
export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true;
  // Toda a faixa 127.0.0.0/8 é loopback.
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  return m !== null && Number(m[1]) === 127;
}

/**
 * Sonda se há um servidor vivo em `host:port`.
 *
 * Usa o opcode `p` (ping) do protocolo de consulta, que **não exige senha** e
 * responde devolvendo o mesmo token de 4 bytes. É o único jeito de saber que o
 * servidor está no ar independentemente de quem o iniciou — terminal do painel,
 * sessão de depuração, ou um processo que ficou órfão de uma execução anterior.
 *
 * O token torna a resposta inequívoca: um datagrama que não o devolva não é
 * resposta a esta sondagem.
 */
export function pingServer(host: string, port: number, timeoutMs = 1200): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const token = randomBytes(4);
    let done = false;

    const finish = (vivo: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(to);
      try { socket.close(); } catch { /* já fechado */ }
      resolve(vivo);
    };

    const to = setTimeout(() => finish(false), timeoutMs);

    socket.on('error', () => finish(false));
    socket.on('message', (msg, rinfo) => {
      const daOrigem = rinfo.address === host || isLoopbackHost(rinfo.address);
      const assinado = msg.length >= 15 && msg.subarray(0, 4).toString('latin1') === 'SAMP';
      const ecoou = msg.subarray(-4).equals(token);
      if (daOrigem && assinado && ecoou) finish(true);
    });

    const octetos = ipOctets(host);
    const pkt = Buffer.allocUnsafe(15);
    pkt.write('SAMP', 0, 4, 'ascii');
    pkt[4] = octetos[0]; pkt[5] = octetos[1]; pkt[6] = octetos[2]; pkt[7] = octetos[3];
    pkt.writeUInt16LE(port, 8);
    pkt.write('p', 10, 1, 'ascii');
    token.copy(pkt, 11);

    socket.send(pkt, port, host, (err) => { if (err) finish(false); });
  });
}

/**
 * Octetos IPv4 do host. Um nome (`localhost`) ou IPv6 (`::1`) não tem octetos:
 * o protocolo é IPv4-only, então cai no loopback, que é o único destino que a
 * extensão aceita de qualquer forma.
 */
function ipOctets(host: string): [number, number, number, number] {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host.trim());
  if (!m) return [127, 0, 0, 1];
  return [Number(m[1]) & 255, Number(m[2]) & 255, Number(m[3]) & 255, Number(m[4]) & 255];
}

export class SampRconClient {
  constructor(private host: string, private port: number, private password: string) {}

  private buildPacket(cmd: string): Buffer {
    // `split('.')` só funciona com IPv4 numérico: `localhost` ou `::1` davam um
    // único octeto e o pacote saía com o IP errado no cabeçalho.
    const octetos = ipOctets(this.host);
    // `latin1` preserva os bytes; `ascii` truncava silenciosamente um `ç` para
    // outro caractere, e a senha ia errada sem aviso.
    const passBuf = Buffer.from(this.password, 'latin1');
    const cmdBuf = Buffer.from(cmd, 'latin1');
    if (passBuf.length > RCON_FIELD_MAX || cmdBuf.length > RCON_FIELD_MAX) {
      throw new Error('RCON: senha ou comando excede o limite do protocolo');
    }
    const buf = Buffer.allocUnsafe(11 + 2 + passBuf.length + 2 + cmdBuf.length);
    let o = 0;
    buf.write('SAMP', o, 4, 'ascii'); o += 4;
    buf[o++] = octetos[0];
    buf[o++] = octetos[1];
    buf[o++] = octetos[2];
    buf[o++] = octetos[3];
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

      // `on` e não `once`: um datagrama alheio na porta não pode encerrar a
      // espera pela resposta legítima.
      socket.on('message', (msg, rinfo) => {
        if (done) return;
        // Só aceita o que veio do servidor consultado e tem a assinatura do
        // protocolo. Sem isso, qualquer pacote UDP que chegasse à porta efêmera
        // apareceria no painel como se fosse resposta do servidor.
        const doServidor = rinfo.address === this.host || isLoopbackHost(rinfo.address);
        if (!doServidor || msg.length < 11 || msg.subarray(0, 4).toString('ascii') !== 'SAMP') {
          return;
        }
        done = true;
        clearTimeout(to);
        socket.close();
        resolve(msg.subarray(11).toString('utf8'));
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
  return detectServerType(cwd) === 'omp'
    ? path.join(cwd, ompLogFile(cwd))
    : path.join(cwd, 'server_log.txt');
}

function ompLogFile(cwd: string): string {
  try {
    const json = JSON.parse(fs.readFileSync(path.join(cwd, 'config.json'), 'utf8')) as Record<string, unknown>;
    const logging = json?.['logging'] as Record<string, unknown> | undefined;
    return String(logging?.['file'] || 'log.txt');
  } catch { return 'log.txt'; }
}

/** Nome base do plugin de depuração instalado pelo usuário (sem extensão). */
export const DEBUG_PLUGIN_NAME = 'pawnpro_debug';

/**
 * Símbolo marcador exportado pelo plugin oficial do PawnPro Debugger. Sua
 * presença na tabela de exportação distingue o plugin de verdade de um arquivo
 * homônimo qualquer. Procuramos a string do nome do símbolo nos bytes do binário
 * — robusto e sem parsear ELF/PE.
 */
const DEBUG_PLUGIN_MARKER = 'PAWNPRO_DEBUG_MARKER';

/** `true` se o binário em `filePath` é o plugin oficial (contém o marcador). */
export function isOfficialDebugPlugin(filePath: string): boolean {
  try {
    const buf = fs.readFileSync(filePath);
    return buf.includes(Buffer.from(DEBUG_PLUGIN_MARKER, 'ascii'));
  } catch {
    return false;
  }
}

/** Como o plugin está (ou deveria estar) instalado, conforme o servidor. */
export type DebugInstallKind =
  | 'samp'          // SA-MP: plugins/ + linha `plugins` no server.cfg
  | 'omp-component' // open.mp nativo (recomendado): components/, auto-descoberto
  | 'omp-legacy';   // open.mp legado: plugins/ + `legacy_plugins` no config.json

/** Resultado do preflight de depuração: o que está pronto e o que falta. */
export interface DebugPreflight {
  /** `true` se nada impede a depuração. */
  ok: boolean;
  /** O binário do plugin foi encontrado num local válido. */
  pluginFilePresent: boolean;
  /**
   * Um arquivo com o nome do plugin existe, mas **não é o plugin oficial** (não
   * contém o marcador) — provavelmente um homônimo. Sinaliza um aviso claro.
   */
  pluginNameClash: boolean;
  /** O plugin está registrado quando o modo exige (SA-MP / omp-legacy). */
  pluginRegistered: boolean;
  /** `'samp' | 'omp'` detectado, para instruções específicas. */
  serverType: 'samp' | 'omp';
  /** Caminho recomendado para instalar o plugin neste servidor. */
  recommendedPath: string;
  /** Forma de instalação recomendada/detectada. */
  installKind: DebugInstallKind;
}

/**
 * Procura o binário do plugin em `<cwd>/<dir>/<name><ext>` e classifica:
 * `'official'` (existe + tem o marcador), `'clash'` (existe mas é outro plugin),
 * `'absent'`.
 */
function probePluginFile(cwd: string, dir: string, file: string): 'official' | 'clash' | 'absent' {
  const p = path.join(cwd, dir, file);
  if (!fs.existsSync(p)) return 'absent';
  return isOfficialDebugPlugin(p) ? 'official' : 'clash';
}

/**
 * Verifica, sem efeitos colaterais, se o servidor em `cwd` está pronto para
 * depuração. Detecta SA-MP (`server.cfg`) vs open.mp (`config.json`).
 *
 * - **SA-MP:** o binário em `plugins/` e listado na linha `plugins`.
 * - **open.mp:** o ideal é `components/` (componente nativo, **auto-descoberto**,
 *   sem registro). O modo legado — `plugins/` + `legacy_plugins` — também é
 *   aceito, mas o componente é preferido.
 */
export function checkDebugPlugin(cwd: string): DebugPreflight {
  const ext = process.platform === 'win32' ? '.dll' : '.so';
  const file = `${DEBUG_PLUGIN_NAME}${ext}`;

  const plugins = probePluginFile(cwd, 'plugins', file);
  const components = probePluginFile(cwd, 'components', file);

  const serverType = detectServerType(cwd);
  const isOmp = serverType === 'omp';

  if (!isOmp) {
    // SA-MP: o binário OFICIAL em plugins/ E registro na linha `plugins`.
    let registered = false;
    try {
      const cfg = fs.readFileSync(path.join(cwd, 'server.cfg'), 'utf8');
      const line = cfg.split(/\r?\n/).find(l => /^\s*plugins\b/i.test(l)) ?? '';
      registered = line.includes(DEBUG_PLUGIN_NAME);
    } catch {
      registered = false;
    }
    return {
      ok: plugins === 'official' && registered,
      pluginFilePresent: plugins === 'official',
      pluginNameClash: plugins === 'clash',
      pluginRegistered: registered,
      serverType,
      recommendedPath: path.join(cwd, 'plugins', file),
      installKind: 'samp',
    };
  }

  // open.mp: componente nativo OFICIAL em components/ é auto-descoberto.
  if (components === 'official') {
    return {
      ok: true,
      pluginFilePresent: true,
      pluginNameClash: false,
      pluginRegistered: true, // não precisa registrar
      serverType,
      recommendedPath: path.join(cwd, 'components', file),
      installKind: 'omp-component',
    };
  }

  // Fallback: modo legado — plugins/ (oficial) + `legacy_plugins` no config.json.
  let legacyRegistered = false;
  try {
    const json = JSON.parse(fs.readFileSync(path.join(cwd, 'config.json'), 'utf8')) as Record<string, unknown>;
    const pawn = json?.['pawn'] as Record<string, unknown> | undefined;
    const legacy = pawn?.['legacy_plugins'];
    const list = Array.isArray(legacy) ? legacy.map(String) : [];
    legacyRegistered = list.some(p => p.includes(DEBUG_PLUGIN_NAME));
  } catch {
    legacyRegistered = false;
  }

  // Aqui `components` nunca é 'official' (já retornou acima nesse caso).
  return {
    ok: plugins === 'official' && legacyRegistered,
    pluginFilePresent: plugins === 'official',
    pluginNameClash: plugins === 'clash' || components === 'clash',
    pluginRegistered: legacyRegistered,
    serverType,
    // Recomenda o caminho de componente (preferido), mesmo no fallback.
    recommendedPath: path.join(cwd, 'components', file),
    installKind: plugins === 'official' ? 'omp-legacy' : 'omp-component',
  };
}
