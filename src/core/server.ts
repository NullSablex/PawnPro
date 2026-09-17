import * as path from 'path';
import { request } from './client.js';
import type { SampCfgData, OutputSink } from './types.js';

function stripQuotes(p: string): string {
  return path.normalize(p.trim().replace(/^["']|["']$/g, ''));
}

export async function loadServerConfig(
  cwd: string,
  serverType: import('./types.js').ServerType = 'auto',
): Promise<SampCfgData> {
  return request<SampCfgData>('server.loadConfig', { cwd, type: serverType });
}

const LOG_POLL_INTERVAL_MS = 100;

export class LogTailer {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private reading = false;
  private file = '';
  private lastSize = 0;
  private encoding = 'windows1252';

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
  get active(): boolean {
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
    this.encoding = encoding || 'windows1252';

    // Começa do fim: abrir o painel não deve despejar o log de execuções
    // anteriores. Quem lê e decodifica é o núcleo.
    try {
      this.lastSize = (await readLog(this.file, null, this.encoding)).size;
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
        // Um log recriado pelo servidor ao reiniciar recomeça do início no
        // núcleo: o que está lá é o log novo, e não pode ser pulado.
        const chunk = await readLog(this.file, this.lastSize, this.encoding).catch(() => null);
        if (chunk) {
          if (chunk.text) this.append(chunk.text);
          this.lastSize = chunk.size;
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
export async function pingServer(host: string, port: number, timeoutMs = 1200): Promise<boolean> {
  void timeoutMs;
  try {
    return await request<boolean>('server.ping', { host, port });
  } catch {
    // Core fora do ar ou sondagem recusada: não dá para afirmar que está no ar.
    return false;
  }
}

/** Por que um comando RCON não pôde ser enviado. Espelha o `enum` do core. */
export type RconFailure =
  | { kind: 'serverDown'; addr: { host: string; port: number } }
  | { kind: 'disabled' }
  | { kind: 'invalidPassword' }
  | { kind: 'remoteBlocked'; host: string }
  | { kind: 'timeout'; millis: number }
  | { kind: 'io'; message: string };

/**
 * Cliente RCON. O protocolo, a sondagem prévia e as recusas de segurança
 * (senha padrão, host fora do loopback, RCON desligado) vivem no core — aqui
 * só passamos o pedido adiante.
 */
export class SampRconClient {
  constructor(
    private host: string,
    private port: number,
    private password: string,
    private enabled = true,
  ) {}

  /**
   * Envia um comando e devolve as linhas de resposta já juntas.
   *
   * @throws {Error} quando o core recusa o envio; a condição vem em
   * `failure`, para a interface escolher a mensagem.
   */
  async send(cmd: string, timeoutMs = 1500): Promise<string> {
    const result = await request<{ command?: string; lines?: string[]; error?: RconFailure }>(
      'rcon.send',
      {
        host: this.host,
        port: this.port,
        password: this.password,
        enabled: this.enabled,
        command: cmd,
        timeoutMs,
      },
    );

    if (result.error) {
      const failure = new Error(`RCON: ${result.error.kind}`) as Error & { failure: RconFailure };
      failure.failure = result.error;
      throw failure;
    }
    return (result.lines ?? []).join('\n');
  }
}

/** O servidor como o núcleo o resolve a partir da configuração do projeto. */
export interface ResolvedServer {
  /** Vazio quando nenhum executável foi configurado nem encontrado. */
  exe: string;
  cwd: string;
  args: string[];
  clearOnStart: boolean;
  /** Vazio sem pasta onde procurar. */
  logPath: string;
  logEncoding: string;
  follow: 'visible' | 'always' | 'off';
}

/**
 * Executável, pasta, argumentos e log do servidor.
 *
 * Quem resolve é o núcleo, com a configuração que ele possui — a mesma que a
 * sessão de depuração e o painel usam. Resolver aqui, com uma cópia dela, era
 * uma segunda implementação livre para discordar da primeira.
 */
export function resolveServerConfig(workspaceRoot: string): Promise<ResolvedServer> {
  return request<ResolvedServer>('server.resolve', { workspaceRoot });
}

/** O que o log cresceu desde `from`; sem `from`, só o tamanho atual. */
function readLog(
  path: string,
  from: number | null,
  encoding: string,
): Promise<{ size: number; text: string }> {
  return request('server.readLog', { path, from, encoding });
}

/**
 * Quais comandos não podem ir para o histórico nem para os favoritos, na
 * mesma ordem.
 *
 * O histórico vai para `.pawnpro/state.json`, em texto claro e dentro do
 * projeto: um `login <senha>` ali seria commitado junto. A regra é do núcleo.
 */
export function sensitiveCommands(commands: string[], extras: string[]): Promise<boolean[]> {
  if (commands.length === 0) return Promise.resolve([]);
  return request<boolean[]>('server.sensitiveCommands', { commands, extras });
}

/** Arquitetura de um executável ou biblioteca. */
export type Architecture = 'x86' | 'x64' | 'unknown';

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
export async function pidsOnPort(port: number): Promise<number[]> {
  try {
    return await request<number[]>('server.pidsOnPort', { port });
  } catch {
    return [];
  }
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

export async function projectServersOnPort(port: number, serverExe: string): Promise<number[]> {
  try {
    return await request<number[]>('server.projectServersOnPort', { port, exe: serverExe });
  } catch {
    return [];
  }
}

/**
 * Encerra um processo pelo PID: `SIGTERM` primeiro, `SIGKILL` se insistir.
 *
 * Devolve `false` quando não foi possível — processo de outro usuário, ou que
 * não morreu no prazo.
 */
export async function killProcess(pid: number, serverExe: string): Promise<boolean> {
  try {
    return await request<boolean>('server.kill', { pid, exe: serverExe });
  } catch {
    // O core recusa encerrar o que não é o servidor deste projeto.
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

export async function checkDebugPlugin(cwd: string): Promise<DebugPreflight> {
  return request<DebugPreflight>('debug.preflight', { cwd });
}
