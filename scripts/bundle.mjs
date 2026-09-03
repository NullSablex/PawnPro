import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const args    = process.argv.slice(2);
const isDev   = args.includes('--dev') || args.includes('--watch');
const isWatch = args.includes('--watch');

const rootDir = path.join(import.meta.dirname, '..');

/**
 * Compila as folhas de estilo das WebViews declaradas em `assets.manifest.json`.
 *
 * O fonte vive em `assets-src/`, legível e com realce do editor; a saída vai
 * para `outDir`, de onde a extensão as serve. Nada é descoberto por varredura:
 * uma folha só entra no pacote se estiver declarada.
 *
 * Em `--dev` o CSS sai legível e com source map, para inspecionar estilo nas
 * ferramentas de desenvolvedor da WebView — no minificado é ilegível.
 */
async function buildAssets() {
  const manifestPath = path.join(rootDir, 'assets.manifest.json');
  if (!fs.existsSync(manifestPath)) return;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const outDir = path.resolve(rootDir, manifest.outDir ?? 'out/assets');

  for (const [type, list] of [['css', manifest.css], ['js', manifest.js]]) {
    if (!list?.length) continue;
    let from = 0;
    let to = 0;
    for (const item of list) {
      const src = path.resolve(rootDir, item.src);
      const out = path.resolve(outDir, item.out);
      if (!fs.existsSync(src)) {
        throw new Error(`[assets] declarado no manifesto mas ausente: ${item.src}`);
      }
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await esbuild.build({
        entryPoints: [src],
        outfile: out,
        bundle: false,
        minify: !isDev,
        sourcemap: isDev,
        legalComments: 'none',
      });
      from += fs.statSync(src).size;
      to += fs.statSync(out).size;
    }
    const kb = n => (n / 1024).toFixed(1);
    const saved = from ? Math.round((1 - to / from) * 100) : 0;
    console.log(
      `[assets] ${type}: ${list.length} arquivo(s), ${kb(from)} KB → ${kb(to)} KB` +
        (isDev ? ' (dev, sem minificar)' : ` (−${saved}%)`),
    );
  }
}

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
  await buildAssets();
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('[bundle] watching...');
} else {
  const outDir = path.join(rootDir, 'out');
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(outDir, 'editor'), { recursive: true });

  await buildAssets();
  await esbuild.build({ ...buildOptions, metafile: true });


  const outFile = path.join(rootDir, 'out', 'editor', 'extension.js');
  const kb = (fs.statSync(outFile).size / 1024).toFixed(1);
  console.log(`[bundle] ${isDev ? 'dev' : 'prod'}: out/editor/extension.js (${kb} KB)`);

  if (!isDev) {
    const mapFile = outFile + '.map';
    if (fs.existsSync(mapFile)) fs.unlinkSync(mapFile);
  }
}
