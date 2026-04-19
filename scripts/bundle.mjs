/**
 * bundle.mjs
 *
 * Empacota e minifica a extensão TypeScript com esbuild.
 * Gera um único out/vscode/extension.js com todas as dependências embutidas,
 * reduzindo o tamanho do VSIX e acelerando o carregamento.
 *
 * Uso:
 *   node scripts/bundle.mjs            # produção (minificado)
 *   node scripts/bundle.mjs --dev      # desenvolvimento (sem minificação, com source maps)
 *   node scripts/bundle.mjs --watch    # watch mode para desenvolvimento
 */

import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const args  = process.argv.slice(2);
const isDev   = args.includes('--dev') || args.includes('--watch');
const isWatch = args.includes('--watch');

const rootDir = path.join(import.meta.dirname, '..');

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: [path.join(rootDir, 'src', 'vscode', 'extension.ts')],
  bundle: true,
  outfile: path.join(rootDir, 'out', 'vscode', 'extension.js'),
  platform: 'node',
  format: 'esm',
  target: 'node18',

  // 'vscode' é provido pelo host do VS Code — nunca embutir
  external: ['vscode'],

  // Shim de compatibilidade CJS: dependências como iconv-lite usam require()
  // internamente, que não existe em ESM puro. Este banner injeta um require()
  // compatível usando createRequire do próprio Node.
  banner: {
    js: `import{createRequire}from'module';const require=createRequire(import.meta.url);`,
  },

  // Minifica em produção, mantém source maps em dev
  minify: !isDev,
  sourcemap: isDev,

  // Preserva nomes de símbolos no bundle de produção para stack traces legíveis
  keepNames: true,
};

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('[bundle] assistindo alterações...');
} else {
  // Limpa artefatos anteriores do tsc — mantém apenas o bundle esbuild
  const outDir = path.join(rootDir, 'out');
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(outDir, 'vscode'), { recursive: true });

  const result = await esbuild.build({ ...buildOptions, metafile: true });

  // Relatório de tamanho
  const outFile = path.join(rootDir, 'out', 'vscode', 'extension.js');
  const size = fs.statSync(outFile).size;
  const kb = (size / 1024).toFixed(1);
  console.log(`[bundle] ${isDev ? 'dev' : 'produção'}: out/vscode/extension.js (${kb} KB)`);

  if (!isDev) {
    // Remove source maps de produção (não devem ir no VSIX)
    const mapFile = outFile + '.map';
    if (fs.existsSync(mapFile)) fs.unlinkSync(mapFile);
  }
}
