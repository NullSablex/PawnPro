import { getApiIndex } from './fileCache.js';
export async function buildFunctionsIndex(includePaths) {
    return getApiIndex(includePaths);
}
export async function findFunction(name, includePaths) {
    const idx = await buildFunctionsIndex(includePaths);
    return idx.get(name);
}
//# sourceMappingURL=apiIndex.js.map