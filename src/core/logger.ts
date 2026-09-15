import * as fs from 'fs';
import * as path from 'path';
import { coreIsRunning, request } from './client.js';

/**
 * Registro de diagnóstico da extensão.
 *
 * Os eventos vão para o mesmo arquivo que o core e a engine escrevem
 * (`.pawnpro/logs/`), para que um problema que atravessa os três seja lido na
 * ordem em que aconteceu.
 *
 * Quem escreve é o core. Quando ele não está de pé — que é justamente quando
 * mais se precisa do log — a extensão escreve direto no arquivo, no mesmo
 * formato.
 *
 * **Desligado por padrão.** Sem nível configurado, nada é escrito e nenhum
 * arquivo é criado.
 */

export type LogLevel = 'off' | 'error' | 'warn' | 'info';

const RANK: Record<LogLevel, number> = { off: 0, error: 1, warn: 2, info: 3 };

let level: LogLevel = 'off';
let workspaceRoot = '';

/** Liga (ou desliga) o registro. */
export function configureLogging(root: string, wanted: LogLevel): void {
  workspaceRoot = root;
  level = wanted;
}

/** O nível em vigor. */
export function logLevel(): LogLevel {
  return level;
}

/** `true` se um evento neste nível seria registrado. */
function enabled(wanted: Exclude<LogLevel, 'off'>): boolean {
  return level !== 'off' && RANK[wanted] <= RANK[level];
}

/** Data e hora em UTC, no mesmo formato que o core escreve. */
function timestamp(): string {
  return new Date().toISOString().replace(/(\.\d{3})Z$/, '$1Z');
}

/**
 * Escreve direto no arquivo, quando o core não pode fazê-lo.
 *
 * Falha em silêncio de propósito: o diagnóstico não pode virar a causa de um
 * problema novo.
 */
function writeLocally(wanted: string, source: string, message: string): void {
  if (!workspaceRoot) return;
  try {
    const dir = path.join(workspaceRoot, '.pawnpro', 'logs');
    fs.mkdirSync(dir, { recursive: true });
    const line = `${timestamp()} ${wanted.toUpperCase().padEnd(5)} ${source}  ${message}\n`;
    // O unificado conta a história inteira; o do componente isola quem falou.
    fs.appendFileSync(path.join(dir, 'pawnpro.log'), line);
    fs.appendFileSync(path.join(dir, `${source.split('/')[0]}.log`), line);
  } catch {
    /* sem log é melhor que sem extensão */
  }
}

function record(wanted: Exclude<LogLevel, 'off'>, source: string, message: string): void {
  if (!enabled(wanted)) return;
  if (coreIsRunning()) {
    void request('log.write', { level: wanted, source, message }).catch(() => {
      writeLocally(wanted, source, message);
    });
    return;
  }
  writeLocally(wanted, source, message);
}

/** Registra uma falha. */
export function logError(source: string, message: string): void {
  record('error', `extension/${source}`, message);
}

/** Registra algo que costuma anteceder uma falha. */
export function logWarn(source: string, message: string): void {
  record('warn', `extension/${source}`, message);
}

/** Registra o curso normal. */
export function logInfo(source: string, message: string): void {
  record('info', `extension/${source}`, message);
}
