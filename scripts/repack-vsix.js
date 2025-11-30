import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

const VSIX_NAME = 'pawnpro-1.3.1.vsix'; // usa versão atual do package.json
const DEPS = ['vscode-nls', 'iconv-lite', 'safer-buffer'];

async function addDir(zip, diskPath, zipPath) {
  const entries = fs.readdirSync(diskPath, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(diskPath, ent.name);
    const rel = path.posix.join(zipPath, ent.name);
    if (ent.isDirectory()) {
      await addDir(zip, full, rel);
    } else {
      const data = fs.readFileSync(full);
      zip.file(rel, data);
    }
  }
}

async function main() {
  const cwd = process.cwd();
  const vsixPath = path.join(cwd, VSIX_NAME);
  if (!fs.existsSync(vsixPath)) {
    console.error(`[repack] VSIX não encontrado: ${vsixPath}`);
    process.exit(1);
  }
  const buf = fs.readFileSync(vsixPath);
  const zip = await JSZip.loadAsync(buf);

  for (const dep of DEPS) {
    const src = path.join(cwd, 'node_modules', dep);
    const dest = path.posix.join('extension', 'node_modules', dep);
    if (!fs.existsSync(src)) {
      console.warn(`[repack] Dependência ausente, pulando: ${dep}`);
      continue;
    }
    await addDir(zip, src, dest);
  }

  const outBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(vsixPath, outBuf);
  console.log(`[repack] VSIX atualizado com dependências em ${vsixPath}`);
}

main().catch(err => {
  console.error('[repack] erro:', err);
  process.exit(1);
});
