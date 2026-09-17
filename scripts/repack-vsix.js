/**
 * repack-vsix.js
 *
 * Pós-processamento do VSIX gerado pelo vsce:
 * - Injeta os binários nativos (bin/) na pasta extension/bin/
 *
 * Nota: as dependências JS (o cliente LSP, etc.) já estão embutidas no bundle
 * gerado pelo esbuild (out/editor/extension.js), portanto não precisam ser
 * adicionadas manualmente ao VSIX. A localização de runtime usa a API nativa
 * vscode.l10n; os bundles ficam em l10n/ e entram no VSIX pelo próprio vsce.
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

  // Binários nativos (bin/ → extension/bin/)
  const binDir = path.join(cwd, 'bin');
  if (fs.existsSync(binDir)) {
    const binaries = fs.readdirSync(binDir).filter(f => !f.startsWith('.'));
    if (binaries.length === 0) {
      console.warn('[repack] Pasta bin/ está vazia — nenhum binário incluído');
    }
    // O binário do core leva bibliotecas de terceiros compiladas nele, e as
    // licenças delas exigem que os avisos acompanhem a redistribuição.
    const NOTICES = 'pawnpro-core-THIRD-PARTY.txt';
    if (binaries.some(b => b.startsWith('pawnpro-core-') && b !== NOTICES) && !binaries.includes(NOTICES)) {
      console.error(`[repack] bin/${NOTICES} ausente: o VSIX não pode sair sem os avisos de licença do core`);
      process.exit(1);
    }
    for (const bin of binaries) {
      const src = path.join(binDir, bin);
      const dest = path.posix.join('extension', 'bin', bin);
      // `unixPermissions` é obrigatório: sem isto o JSZip grava a entrada com
      // o modo padrão, o bit de execução se perde, e o editor não consegue
      // lançar o binário — a depuração falha com "permissão negada".
      zip.file(dest, fs.readFileSync(src), { unixPermissions: bin.endsWith('.txt') ? 0o644 : 0o755 });
      console.log(`[repack] Empacotado: bin/${bin}`);
    }
  } else {
    console.warn('[repack] Pasta bin/ não encontrada — núcleo não incluído no VSIX');
  }

  // `platform: 'UNIX'` é o que faz o JSZip gravar de fato os `unixPermissions`
  // das entradas; sem isto ele usa o padrão DOS e o bit de execução dos
  // binários se perde na instalação.
  const outBuf = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    platform: 'UNIX',
  });
  fs.writeFileSync(vsixPath, outBuf);
  console.log(`[repack] VSIX atualizado: ${vsixPath}`);
}

main().catch(err => {
  console.error('[repack] erro:', err);
  process.exit(1);
});
