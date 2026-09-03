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
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const outDir = path.resolve(rootDir, manifest.outDir ?? 'out/assets');

  // Duas entradas com o mesmo destino se sobrescreveriam em silêncio, e o
  // pacote sairia com um dos arquivos faltando.
  const destinos = new Set();
  for (const item of [...(manifest.css ?? []), ...(manifest.js ?? [])]) {
    if (destinos.has(item.out)) {
      throw new Error(`[assets] destino repetido no manifesto: ${item.out}`);
    }
    destinos.add(item.out);
  }

  for (const [type, list] of [['css', manifest.css], ['js', manifest.js]]) {
    if (!list?.length) continue;
    for (const item of list) {
      if (!fs.existsSync(path.resolve(rootDir, item.src))) {
        throw new Error(`[assets] declarado no manifesto mas ausente: ${item.src}`);
      }
      fs.mkdirSync(path.dirname(path.resolve(outDir, item.out)), { recursive: true });
    }
    // Em paralelo: os arquivos são independentes, e em série cada um esperava
    // o anterior sem razão.
    await Promise.all(
      list.map(item =>
        esbuild.build({
          entryPoints: [path.resolve(rootDir, item.src)],
          outfile: path.resolve(outDir, item.out),
          bundle: false,
          minify: !isDev,
          sourcemap: isDev,
          legalComments: 'none',
        }),
      ),
    );
    const tamanho = (base, campo) =>
      list.reduce((n, item) => n + fs.statSync(path.resolve(base, item[campo])).size, 0);
    const from = tamanho(rootDir, 'src');
    const to = tamanho(outDir, 'out');
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
