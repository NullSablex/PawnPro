import * as path from 'path';
import * as fs from 'fs';
import { spawnSync } from 'child_process';
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
  // Sem config.json, ou com JSON quebrado, seguem os padrões abaixo: a função
  // devolve o que sabe em vez de falhar.
  try {
    json = JSON.parse(await fsp.readFile(cfgPath, 'utf8')) as Record<string, unknown>;
  } catch { /* ausente ou malformado */ }

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

  /** `true` se já está acompanhando este arquivo — evita reiniciar o tail (e
   *  limpar o painel) à toa. */
  isTailing(filePath: string): boolean {
    return this.running && this.file === stripQuotes(filePath);
  }

  /** `true` se está acompanhando algum arquivo de log. */
  get ativo(): boolean {
    return this.running;
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

    // Sem `clear()`: este sink é compartilhado com a saída do RCON, e apagá-lo
    // aqui destruía o eco do comando e a resposta que já estavam escritos. O
    // tail retoma a leitura a partir de `lastSize`, então não há conteúdo
    // duplicado a limpar — e quem quiser o painel vazio chama `clear()`.
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
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === '::1') return true;
  // Toda a faixa 127.0.0.0/8 é loopback.
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m === null) return false;
  // Octetos fora de 0–255 não são um IPv4: `999.0.0.1` casaria com a regex, e
  // aceitá-lo aqui daria loopback a um nome que o resolvedor mandaria para
  // outro lugar.
  if (m.slice(1).some(o => Number(o) > 255)) return false;
  return Number(m[1]) === 127;
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
    // O comando vai em UTF-8, e não em `latin1` como a senha: o console do
    // servidor fala UTF-8, e `latin1` mandava `ação` como bytes inválidos — o
    // eco voltava como U+FFFD. A senha continua em `latin1` por ser comparada
    // byte a byte contra o que está no config.
    const cmdBuf = Buffer.from(cmd, 'utf8');
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

  /**
   * Envia um comando e junta **todas** as linhas de resposta.
   *
   * O servidor responde em vários datagramas — `varlist` manda cerca de cem,
   * `cmdlist` trinta. Fechar o socket no primeiro deixava o painel com uma
   * linha só (`Console variables:`) enquanto o resto aparecia apenas no log do
   * servidor.
   *
   * Como o protocolo não marca o fim da resposta, o critério é o silêncio:
   * espera `timeoutMs` pelo primeiro datagrama e, depois de começar a receber,
   * encerra quando parar de chegar coisa por `quietMs`.
   */
  send(cmd: string, timeoutMs = 1500, quietMs = 300, maxLines = 2000): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      const pkt = this.buildPacket(cmd);
      const lines: string[] = [];
      let done = false;
      let timer: NodeJS.Timeout;

      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { socket.close(); } catch { /* já fechado */ }
        resolve(lines.join('\n'));
      };

      timer = setTimeout(finish, timeoutMs);

      // `on` e não `once`: a resposta vem em vários datagramas, e um pacote
      // alheio na porta não pode encerrar a espera pela resposta legítima.
      socket.on('message', (msg, rinfo) => {
        if (done) return;
        // Só aceita o que veio do servidor consultado e tem a assinatura do
        // protocolo. Sem isso, qualquer pacote UDP que chegasse à porta efêmera
        // apareceria no painel como se fosse resposta do servidor.
        const doServidor = rinfo.address === this.host || isLoopbackHost(rinfo.address);
        if (!doServidor || msg.length < 13 || msg.subarray(0, 4).toString('ascii') !== 'SAMP') {
          return;
        }
        // O datagrama de resposta repete os 11 bytes do cabeçalho, seguidos do
        // tamanho da mensagem (uint16 LE) e do texto. Ler a partir do byte 11
        // colava esses dois bytes de tamanho no início de cada linha — era isso
        // que chegava ao painel como dado inválido.
        const size = msg.readUInt16LE(11);
        // `utf8` na leitura, ao contrário do `latin1` do envio: o servidor
        // devolve o console em UTF-8, e `latin1` transformava `ação` em `aÃ§Ã£o`.
        const line = msg.subarray(13, 13 + size).toString('utf8').trim();
        if (line) lines.push(line);
        // Teto de linhas: o filtro de origem aceita qualquer remetente de
        // loopback — que é justamente o caso de uso normal —, então um processo
        // local despejando datagramas renovaria o prazo para sempre e a promise
        // nunca resolveria. `varlist`, a maior resposta real, dá ~100 linhas.
        if (lines.length >= maxLines) {
          finish();
          return;
        }
        // Chegou algo: a partir daqui o que encerra é o silêncio, não o prazo
        // inicial.
        clearTimeout(timer);
        timer = setTimeout(finish, quietMs);
      });

      socket.once('error', (e) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { socket.close(); } catch { /* já fechado */ }
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

/** Arquitetura de um executável ou biblioteca. */
export type Architecture = 'x86' | 'x64' | 'unknown';

/**
 * Arquitetura de um binário, pelo cabeçalho ELF (Linux) ou PE (Windows).
 *
 * O servidor SA-MP e o open.mp legado são de 32 bits, e um plugin de 64 não
 * carrega neles — o servidor recusa com "classe ELF errada" no meio de dezenas
 * de linhas de boot, e a depuração falha sem que nada apareça no editor.
 *
 * Basta o cabeçalho: em ELF, o byte 4 é a classe (1 = 32, 2 = 64); em PE, o
 * campo `Machine` logo após a assinatura, no deslocamento que o cabeçalho DOS
 * indica.
 */
export function architectureOf(filePath: string): Architecture {
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, 'r');
    const cab = Buffer.alloc(64);
    if (fs.readSync(fd, cab, 0, 64, 0) < 64) return 'unknown';

    if (cab.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
      if (cab[4] === 1) return 'x86';
      if (cab[4] === 2) return 'x64';
      return 'unknown';
    }

    if (cab[0] === 0x4d && cab[1] === 0x5a) {
      // `e_lfanew` (offset 0x3C) aponta para a assinatura PE.
      const pe = cab.readUInt32LE(0x3c);
      const maq = Buffer.alloc(6);
      if (fs.readSync(fd, maq, 0, 6, pe) < 6) return 'unknown';
      if (maq.subarray(0, 4).toString('ascii') !== 'PE\0\0') return 'unknown';
      const machine = maq.readUInt16LE(4);
      if (machine === 0x014c) return 'x86';
      if (machine === 0x8664) return 'x64';
      return 'unknown';
    }
    return 'unknown';
  } catch {
    return 'unknown';
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { /* já fechado */ }
    }
  }
}

/**
 * PIDs escutando na porta UDP, do mais recente para o mais antigo.
 *
 * Serve ao caso do processo que sobreviveu ao terminal que o criou: o painel
 * confirma o estado pela porta, e sem saber QUEM a ocupa só resta pedir ao
 * usuário que descubra por conta própria.
 *
 * Vazio quando nenhuma ferramenta está disponível — o chamador trata isso como
 * "não sei", não como "não há".
 */
export function pidsOnPort(port: number): number[] {
  if (process.platform === 'win32') return udpPidsWindows(port);

  // Só o STDOUT: as duas ferramentas imprimem ali os PIDs e nada mais. O
  // `fuser` manda o rótulo `7777/udp:` para o stderr, e lê-lo junto faria a
  // PORTA virar um PID candidato — encerrando o processo de número igual ao
  // dela.
  const commands: Array<[string, string[]]> = [
    ['lsof', ['-ti', `udp:${port}`]],
    ['fuser', ['-n', 'udp', String(port)]],
  ];
  for (const [exe, args] of commands) {
    let out: string;
    try {
      out = spawnSync(exe, args, { encoding: 'utf8', timeout: 2000 }).stdout ?? '';
    } catch {
      continue; // ferramenta ausente — tenta a próxima
    }
    const pids = out
      .split(/\s+/)
      .filter(t => /^\d+$/.test(t))
      .map(Number)
      .filter(pid => pid > 1 && pid !== process.pid);
    if (pids.length) return [...new Set(pids)];
  }
  return [];
}

/**
 * `true` se o processo é o executável do servidor deste projeto.
 *
 * A porta vem do `config.json` do PROJETO, que é arquivo do repositório: um
 * gamemode malicioso poderia apontá-la para 53 ou 631 e transformar o botão de
 * encerrar numa arma contra serviços do sistema. Encerrar só o que casa com o
 * executável configurado fecha essa porta.
 *
 * `false` quando não dá para saber — sem `/proc`, ou sem permissão de ler o
 * link. Na dúvida, não encerra.
 */
/**
 * PIDs na porta que são comprovadamente o servidor deste projeto.
 *
 * A combinação de `pidsOnPort` com o filtro de `isProjectServer` é o que separa
 * "encerrar o servidor do projeto" de "encerrar um serviço do sistema", e
 * estava repetida em cada chamador — onde esquecer o filtro passaria
 * despercebido. Aqui a regra é uma só.
 */
/**
 * PIDs na porta UDP no Windows, via `netstat`.
 *
 * `netstat -ano -p UDP` é o análogo do `lsof -ti` — imprime uma linha por
 * socket, com o endereço local na segunda coluna e o PID na última. O `-n`
 * evita a resolução de nomes, que é lenta e traria `*:domain` no lugar da
 * porta.
 *
 * A porta é comparada com o SUFIXO do endereço para cobrir as duas formas que
 * aparecem ali (`0.0.0.0:7777` e `[::]:7777`), e o `:` no separador é o que
 * impede `17777` de casar com `7777`.
 */
function udpPidsWindows(port: number): number[] {
  let out: string;
  try {
    out = spawnSync('netstat', ['-ano', '-p', 'UDP'], {
      encoding: 'utf8',
      timeout: 4000,
      windowsHide: true,
    }).stdout ?? '';
  } catch {
    return [];
  }
  const pids: number[] = [];
  for (const line of out.split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    // UDP <local> <*|estrangeiro> <pid> — o cabeçalho e as linhas em branco não
    // têm esse formato e caem fora sozinhos.
    if (cols.length < 3 || cols[0].toUpperCase() !== 'UDP') continue;
    if (!cols[1].endsWith(`:${port}`)) continue;
    const pid = Number(cols[cols.length - 1]);
    if (Number.isInteger(pid) && pid > 1 && pid !== process.pid) pids.push(pid);
  }
  return [...new Set(pids)];
}

/**
 * Caminho do executável de um PID no Windows.
 *
 * `Get-Process -Id N` devolve o `Path` sem depender do `wmic`, que a Microsoft
 * removeu das versões recentes. `-NoProfile` evita carregar o perfil do usuário
 * (lento, e pode falhar por política de execução); a saída é só o caminho.
 */
function executablePathWindows(pid: number): string | null {
  try {
    const out = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).Path`,
      ],
      { encoding: 'utf8', timeout: 5000, windowsHide: true },
    ).stdout;
    const cleaned = (out ?? '').trim();
    return cleaned || null;
  } catch {
    return null;
  }
}

export function projectServersOnPort(port: number, serverExe: string): number[] {
  return pidsOnPort(port).filter(pid => isProjectServer(pid, serverExe));
}

export function isProjectServer(pid: number, serverExe: string): boolean {
  if (!serverExe) return false;
  try {
    const target = fs.realpathSync(serverExe);
    if (process.platform === 'linux') {
      // `/proc/PID/exe` é um link mantido pelo kernel, que o processo não pode
      // falsificar.
      if (fs.realpathSync(`/proc/${pid}/exe`) !== target) return false;
      // E o dono: numa máquina compartilhada o mesmo binário pode estar rodando
      // sob outro usuário, e encerrá-lo não é atribuição deste editor — o
      // `kill` falharia por permissão depois de prometer que faria.
      return fs.statSync(`/proc/${pid}`).uid === process.getuid?.();
    }
    if (process.platform === 'darwin') {
      // Não há `/proc` no macOS. `ps` dá o caminho do executável e o uid do
      // dono num comando só; `comm=` imprime o caminho completo, e `uid=` o
      // dono numérico, sem cabeçalho.
      const out = spawnSync('ps', ['-o', 'uid=,comm=', '-p', String(pid)], {
        encoding: 'utf8',
        timeout: 2000,
      }).stdout;
      const m = /^\s*(\d+)\s+(.+?)\s*$/.exec(out ?? '');
      if (!m) return false;
      if (Number(m[1]) !== process.getuid?.()) return false;
      // `realpath` dos dois lados: o `ps` pode devolver o caminho por um link
      // simbólico diferente do configurado.
      try {
        return fs.realpathSync(m[2]) === target;
      } catch {
        return false;
      }
    }
    if (process.platform === 'win32') {
      const exe = executablePathWindows(pid);
      if (!exe) return false;
      // Sem uid no Windows: o `Get-Process` só devolve o `Path` de processos
      // que a sessão atual consegue abrir, então o alcance já fica no que o
      // usuário poderia encerrar de qualquer forma. O nome do volume e a caixa
      // variam entre as duas fontes, e o sistema de arquivos não diferencia
      // maiúsculas — comparar sem normalizar daria falso negativo.
      try {
        return fs.realpathSync(exe).toLowerCase() === target.toLowerCase();
      } catch {
        return false;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Encerra um processo pelo PID: `SIGTERM` primeiro, `SIGKILL` se insistir.
 *
 * Devolve `false` quando não foi possível — processo de outro usuário, ou que
 * não morreu no prazo.
 */
export async function killProcess(pid: number, timeoutMs = 3000): Promise<boolean> {
  // `kill(pid, 0)` não envia sinal: só pergunta se o processo existe e se
  // temos permissão sobre ele.
  const alive = () => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  const signal = (sig: NodeJS.Signals) => {
    try {
      process.kill(pid, sig);
    } catch {
      /* já morreu, ou é de outro usuário — `alive()` dá a resposta */
    }
  };
  // No Windows não há sinal gracioso: `process.kill` com SIGTERM encerra na
  // hora, e o servidor não salva nada. O `taskkill` sem `/F` pede o
  // encerramento pela via do sistema, que é o equivalente ao SIGTERM; o `/F`
  // fica para o prazo esgotado, no lugar do SIGKILL.
  const terminate = (force: boolean) => {
    if (process.platform !== 'win32') {
      signal(force ? 'SIGKILL' : 'SIGTERM');
      return;
    }
    try {
      spawnSync('taskkill', force ? ['/PID', String(pid), '/T', '/F'] : ['/PID', String(pid)], {
        timeout: 4000,
        windowsHide: true,
      });
    } catch {
      /* `alive()` dá a resposta */
    }
  };
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

  // Encerramento gracioso primeiro: o servidor salva e desliga os componentes.
  // A força só entra se ele ignorar o prazo.
  terminate(false);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!alive()) return true;
    await wait(200);
  }
  terminate(true);
  await wait(300);
  return !alive();
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
  /**
   * O plugin e o executável do servidor têm arquiteturas diferentes.
   *
   * Quando isso acontece o servidor recusa o plugin no boot e a depuração não
   * funciona — mas o erro fica no meio das linhas de carga e o editor não
   * mostra nada. Vazio quando as duas batem ou não foi possível determinar.
   */
  archMismatch?: { plugin: Architecture; server: Architecture };
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
/**
 * Compara a arquitetura do plugin com a do executável do servidor.
 *
 * Só reporta quando as duas são conhecidas e diferentes: sem o executável, ou
 * com um formato que não sabemos ler, o silêncio é melhor que um alarme falso.
 */
function checkArchitecture(
  cwd: string,
  pluginPath: string,
): { plugin: Architecture; server: Architecture } | undefined {
  const exe = detectServerExecutable(cwd);
  if (!exe) return undefined;
  const plugin = architectureOf(pluginPath);
  const server = architectureOf(exe);
  if (plugin === 'unknown' || server === 'unknown') return undefined;
  return plugin === server ? undefined : { plugin, server };
}

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
    const arch = checkArchitecture(cwd, path.join(cwd, 'plugins', file));
    return {
      ok: plugins === 'official' && registered && !arch,
      pluginFilePresent: plugins === 'official',
      pluginNameClash: plugins === 'clash',
      pluginRegistered: registered,
      serverType,
      recommendedPath: path.join(cwd, 'plugins', file),
      installKind: 'samp',
      archMismatch: arch,
    };
  }

  // open.mp: componente nativo OFICIAL em components/ é auto-descoberto.
  if (components === 'official') {
    const arch = checkArchitecture(cwd, path.join(cwd, 'components', file));
    return {
      ok: !arch,
      pluginFilePresent: true,
      pluginNameClash: false,
      pluginRegistered: true, // não precisa registrar
      serverType,
      recommendedPath: path.join(cwd, 'components', file),
      installKind: 'omp-component',
      archMismatch: arch,
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
  const arch = checkArchitecture(cwd, path.join(cwd, 'plugins', file));
  return {
    ok: plugins === 'official' && legacyRegistered && !arch,
    pluginFilePresent: plugins === 'official',
    pluginNameClash: plugins === 'clash' || components === 'clash',
    pluginRegistered: legacyRegistered,
    serverType,
    // Recomenda o caminho de componente (preferido), mesmo no fallback.
    recommendedPath: path.join(cwd, 'components', file),
    installKind: plugins === 'official' ? 'omp-legacy' : 'omp-component',
    archMismatch: arch,
  };
}
