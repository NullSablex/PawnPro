import { request } from './client.js';
import type { NativeEntry } from './types.js';

/**
 * Os includes do projeto aberto.
 *
 * Quem monta a lista, varre as pastas e resolve o SDK é o núcleo, pelas mesmas
 * funções que alimentam a engine e a compilação. Aqui não se abre nada — a
 * extensão montava a própria lista, e ela podia divergir da que a análise
 * usava.
 */

/**
 * As raízes de include, na ordem em que o compilador as procura. Só pastas que
 * existem. Vazio sem núcleo.
 */
export async function includePaths(fileDir?: string): Promise<string[]> {
  try {
    return await request<string[]>('includes.paths', fileDir ? { fileDir } : {});
  } catch {
    return [];
  }
}

/** Os `.inc` sob `root`, sem descer em `.git`, `node_modules` nem `.pawnpro`. */
export async function listIncFilesRecursive(root: string, maxDepth = 20): Promise<string[]> {
  try {
    return await request<string[]>('includes.listFiles', { root, maxDepth });
  } catch {
    return [];
  }
}

/** As natives declaradas num include. */
export async function listNatives(filePath: string): Promise<NativeEntry[]> {
  try {
    return await request<NativeEntry[]>('includes.listNatives', { file: filePath });
  } catch {
    return [];
  }
}

/**
 * O arquivo de SDK que a engine recebe, ou `null` quando não há.
 *
 * @throws {Error} quando o núcleo não responde — quem avisa o usuário precisa
 * distinguir "não há SDK" de "não deu para perguntar".
 */
export async function resolveSdkFile(): Promise<string | null> {
  return request<string | null>('includes.resolveSdk');
}
