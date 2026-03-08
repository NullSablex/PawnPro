import { getApiIndex, FuncEntry } from './fileCache.js';

export type { FuncEntry } from './fileCache.js';

export async function buildFunctionsIndex(includePaths: string[]): Promise<Map<string, FuncEntry>> {
  return getApiIndex(includePaths);
}

export async function findFunction(name: string, includePaths: string[]): Promise<FuncEntry | undefined> {
  const idx = await buildFunctionsIndex(includePaths);
  return idx.get(name);
}
