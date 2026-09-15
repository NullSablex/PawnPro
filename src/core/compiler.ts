import { spawn } from 'child_process';
import * as iconv from 'iconv-lite';
import { request } from './client.js';
import type { CompileResult, CompileArgs } from './types.js';

/**
 * O caminho do `pawncc`.
 *
 * A ordem de busca (variável `PAWNCC`, `compiler.path`, `PATH`, pastas do
 * projeto, locais comuns) vive no core.
 *
 * @throws {Error} quando não há compilador — como antes, para a interface
 * mostrar o motivo que o core deu.
 */
export async function detectPawncc(
  explicitPathRaw: string | undefined,
  autoDetect: boolean,
  workspaceRoot: string | undefined,
): Promise<string> {
  return request<string>('compiler.detect', {
    path: explicitPathRaw ?? null,
    autoDetect,
    workspaceRoot: workspaceRoot ?? null,
  });
}

/** A linha de comando montada pelo núcleo. */
export interface BuiltCompileArgs {
  args: CompileArgs;
  /**
   * O preset mínimo, quando a configuração não trazia argumentos — para a
   * extensão gravá-lo e o usuário ver o que passou a valer. `null` quando os
   * argumentos vieram da configuração.
   */
  presetArgs: string[] | null;
}

/**
 * Monta a linha de comando do `pawncc` para um arquivo.
 *
 * Quem monta é o núcleo, com a configuração do projeto aberto — a mesma que a
 * engine recebe. As flags que a build local não aceita saem e voltam em
 * `removedFlags`; `forceDebug` garante `-d3` só nesta compilação, sem alterar
 * a configuração do usuário.
 */
export async function buildCompileArgs(opts: {
  filePath: string;
  forceDebug?: boolean;
}): Promise<BuiltCompileArgs> {
  return request<BuiltCompileArgs>('compiler.buildArgs', {
    filePath: opts.filePath,
    forceDebug: opts.forceDebug ?? false,
  });
}

export function runCompile(
  exe: string,
  args: string[],
  cwd: string,
  encoding: string,
): Promise<CompileResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(exe, args, { cwd, shell: false });
    const chunks: Buffer[] = [];

    proc.stdout.on('data', (d: Buffer) => chunks.push(d));
    proc.stderr.on('data', (d: Buffer) => chunks.push(d));
    proc.on('error', reject);
    proc.on('close', (code, signal) => {
      resolve({
        exitCode: code,
        signal: signal ?? null,
        output: iconv.decode(Buffer.concat(chunks), encoding || 'windows1252'),
      });
    });
  });
}
