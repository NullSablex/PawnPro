import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

/**
 * Cliente do `pawnpro-core`: um processo por janela, falando JSON-RPC 2.0 pelo
 * stdio, uma mensagem por linha.
 *
 * O core é quem possui os processos do servidor, o RCON e a configuração da
 * engine. A extensão pergunta; quem responde é quem possui.
 */

/** Um pedido esperando resposta. */
type Pending = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  /** Ausente nos pedidos sem teto. */
  timer: NodeJS.Timeout | undefined;
};

/**
 * Teto de espera por uma resposta.
 *
 * Nenhuma operação do core é demorada — a mais lenta é encerrar um processo,
 * com três segundos de prazo próprio. O teto existe para o caso em que a
 * resposta não vem: sem ele, quem chamou espera para sempre, e um `await` no
 * caminho de ativação levava junto tudo o que vinha depois.
 */
const REQUEST_TIMEOUT_MS = 30_000;

/** Erro devolvido pelo core, com o código do JSON-RPC. */
export class CoreError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
    this.name = 'CoreError';
  }
}

let child: cp.ChildProcessWithoutNullStreams | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
const listeners = new Map<string, ((params: unknown) => void)[]>();

/** Localiza o binário: o empacotado no VSIX, ou um compilado ao lado. */
function findBinary(extensionPath: string): string | null {
  const ext = process.platform === 'win32' ? '.exe' : '';
  const name = `pawnpro-core${ext}`;
  const artifact = `pawnpro-core-${process.platform}-${process.arch}${ext}`;

  // O empacotado no VSIX é o que vale quando existe. `engines/` é a pasta dos
  // binários nativos — o nome vem de quando a engine era o único deles.
  const packaged = path.join(extensionPath, 'engines', artifact);
  if (fs.existsSync(packaged)) return packaged;

  // Durante o desenvolvimento, o core compilado no repositório vizinho. Entre
  // `release` e `debug` vence o mais recente, e não uma ordem fixa: um release
  // antigo esquecido no disco venceria o debug recém-compilado, e o sintoma
  // seria um método "desconhecido" sem explicação.
  const built = ['release', 'debug']
    .map((profile) => path.join(extensionPath, '..', 'pawnpro-core', 'target', profile, name))
    .filter((p) => fs.existsSync(p))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  return built[0] ?? null;
}

/** Trata uma linha vinda do core: resposta a um pedido, ou notificação. */
function handleLine(line: string): void {
  let message: Record<string, unknown>;
  try {
    message = JSON.parse(line) as Record<string, unknown>;
  } catch {
    // Uma linha quebrada não derruba o canal: as seguintes continuam.
    return;
  }

  const id = message.id;
  if (typeof id === 'number') {
    const waiting = pending.get(id);
    if (!waiting) return;
    clearTimeout(waiting.timer);
    pending.delete(id);
    const error = message.error as { code: number; message: string } | undefined;
    if (error) {
      waiting.reject(new CoreError(error.code, error.message));
    } else {
      waiting.resolve(message.result);
    }
    return;
  }

  const method = message.method;
  if (typeof method === 'string') {
    for (const listener of listeners.get(method) ?? []) {
      listener(message.params);
    }
  }
}

/**
 * Sobe o core. Idempotente: chamar de novo com o processo vivo não faz nada.
 *
 * Devolve `false` quando o binário não está presente — a extensão segue
 * funcionando no que não depende dele, em vez de falhar a ativação inteira.
 */
export function startCore(extensionPath: string): boolean {
  if (child && !child.killed) return true;

  const binary = findBinary(extensionPath);
  if (!binary) {
    console.log('[PawnPro] binário do core não encontrado');
    return false;
  }

  if (process.platform !== 'win32') {
    // Pode já estar executável, ou ser de outro dono — quem diz se dá para
    // usá-lo é o spawn logo abaixo, não este chmod.
    try {
      fs.chmodSync(binary, 0o755);
    } catch {
      /* sem permissão para ajustar */
    }
  }

  try {
    child = cp.spawn(binary, [], { stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    console.error('[PawnPro] falha ao subir o core:', e);
    child = null;
    return false;
  }

  readline.createInterface({ input: child.stdout }).on('line', handleLine);

  child.stderr.on('data', (data: Buffer) => {
    console.error(`[PawnPro core] ${data.toString().trimEnd()}`);
  });

  child.on('exit', (code) => {
    console.log(`[PawnPro] core encerrou (${code})`);
    // Quem espera resposta precisa saber: sem isto os `await` ficariam
    // pendurados para sempre.
    for (const waiting of pending.values()) {
      clearTimeout(waiting.timer);
      waiting.reject(new Error('o core encerrou'));
    }
    pending.clear();
    child = null;
  });

  return true;
}

/** Encerra o core fechando o stdin — é assim que ele sai por conta própria. */
export function stopCore(): void {
  if (!child) return;
  child.stdin.end();
  child = null;
}

/** `true` se o core está de pé. */
export function coreIsRunning(): boolean {
  return child !== null && !child.killed;
}

/**
 * Chama um método do core.
 *
 * `timeoutMs: null` tira o teto: para o que tem duração legítima sem limite,
 * como compilar um gamemode grande — cortar no meio mostraria falha de uma
 * compilação que deu certo.
 *
 * @throws {CoreError} quando o core recusa a chamada.
 * @throws {Error} quando o core não está de pé.
 */
export function request<T>(
  method: string,
  params: Record<string, unknown> = {},
  options: { timeoutMs?: number | null } = {},
): Promise<T> {
  if (!child) {
    return Promise.reject(new Error('o core não está em execução'));
  }
  const id = nextId++;
  const message = JSON.stringify({ jsonrpc: '2.0', id, method, params });

  return new Promise<T>((resolve, reject) => {
    const limit = options.timeoutMs === undefined ? REQUEST_TIMEOUT_MS : options.timeoutMs;
    const timer =
      limit === null
        ? undefined
        : setTimeout(() => {
            pending.delete(id);
            reject(new Error(`o core não respondeu a \`${method}\` em ${limit} ms`));
          }, limit);
    // Um pedido pendente não pode segurar o editor aberto no encerramento.
    timer?.unref?.();

    pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
    child?.stdin.write(`${message}\n`, (err) => {
      if (err) {
        clearTimeout(timer);
        pending.delete(id);
        reject(err);
      }
    });
  });
}

/** Registra um ouvinte para uma notificação do core. */
export function onNotification(method: string, listener: (params: unknown) => void): void {
  const existing = listeners.get(method) ?? [];
  existing.push(listener);
  listeners.set(method, existing);
}
