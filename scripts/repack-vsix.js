/**
 * repack-vsix.js
 *
 * Pós-processamento do VSIX gerado pelo vsce:
 * - Injeta os binários do motor Rust (engines/) na pasta extension/engines/
 *
 * Nota: as dependências JS (iconv-lite, vscode-nls, etc.) já estão embutidas
 * no bundle gerado pelo esbuild (out/editor/extension.js), portanto não
 * precisam ser adicionadas manualmente ao VSIX.
 */

import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf8'));

async function main() {
  const cwd = process.cwd();

  // Localiza o VSIX gerado — suporta nomes com e sem target (ex: pawnpro-linux-x64-3.0.0.vsix)
  const candidates = fs.readdirSync(cwd).filter(f => f.startsWith(pkg.name) && f.endsWith('.vsix'));
  if (candidates.length === 0) {
    console.error(`[repack] Nenhum arquivo .vsix encontrado em: ${cwd}`);
    process.exit(1);
  }
  if (candidates.length > 1) {
    console.warn(`[repack] Múltiplos .vsix encontrados, usando o primeiro: ${candidates[0]}`);
  }
  const vsixPath = path.join(cwd, candidates[0]);

  const buf = fs.readFileSync(vsixPath);
  const zip = await JSZip.loadAsync(buf);

  // Binários do motor Rust (engines/ → extension/engines/)
  const enginesDir = path.join(cwd, 'engines');
  if (fs.existsSync(enginesDir)) {
    const binaries = fs.readdirSync(enginesDir).filter(f => !f.startsWith('.'));
    if (binaries.length === 0) {
      console.warn('[repack] Pasta engines/ está vazia — nenhum binário incluído');
    }
    for (const bin of binaries) {
      const src = path.join(enginesDir, bin);
      const dest = path.posix.join('extension', 'engines', bin);
      zip.file(dest, fs.readFileSync(src));
      console.log(`[repack] Binário empacotado: engines/${bin}`);
    }
  } else {
    console.warn('[repack] Pasta engines/ não encontrada — motor Rust não incluído no VSIX');
  }

  const outBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(vsixPath, outBuf);
  console.log(`[repack] VSIX atualizado: ${vsixPath}`);
}

main().catch(err => {
  console.error('[repack] erro:', err);
  process.exit(1);
});
