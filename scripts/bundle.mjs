import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const args    = process.argv.slice(2);
const isDev   = args.includes('--dev') || args.includes('--watch');
const isWatch = args.includes('--watch');

const rootDir = path.join(import.meta.dirname, '..');

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: [path.join(rootDir, 'src', 'editor', 'extension.ts')],
  bundle: true,
  outfile: path.join(rootDir, 'out', 'editor', 'extension.js'),
  platform: 'node',
  format: 'esm',
  target: 'node18',

  external: ['vscode'],

  // iconv-lite uses require() internally — inject a CJS-compatible require via createRequire
  banner: {
    js: `import{createRequire}from'module';const require=createRequire(import.meta.url);`,
  },

  minify: !isDev,
  sourcemap: isDev,
  keepNames: true,
};

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('[bundle] watching...');
} else {
  const outDir = path.join(rootDir, 'out');
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(outDir, 'editor'), { recursive: true });

  await esbuild.build({ ...buildOptions, metafile: true });

  const outFile = path.join(rootDir, 'out', 'editor', 'extension.js');
  const kb = (fs.statSync(outFile).size / 1024).toFixed(1);
  console.log(`[bundle] ${isDev ? 'dev' : 'prod'}: out/editor/extension.js (${kb} KB)`);

  if (!isDev) {
    const mapFile = outFile + '.map';
    if (fs.existsSync(mapFile)) fs.unlinkSync(mapFile);
  }
}
