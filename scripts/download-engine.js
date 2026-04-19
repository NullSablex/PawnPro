/**
 * download-engine.js
 *
 * Baixa o binário do pawnpro-engine do GitHub Releases para a pasta engines/
 * e verifica a integridade via SHA-256 (checksums.sha256 publicado na release).
 *
 * Uso:
 *   node scripts/download-engine.js                        # plataforma atual
 *   node scripts/download-engine.js --all                  # todas as plataformas (CI)
 *   node scripts/download-engine.js --artifact <nome>      # artefato específico (CI por plataforma)
 *
 * O binário é versionado pelo campo "engineVersion" de package.json.
 * O repo de origem é o campo "engineRepository".
 * A pasta engines/ está em .gitignore — nunca commitar binários.
 */

import crypto from 'crypto';
import fs from 'fs';
import https from 'https';
import path from 'path';

const pkg = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf8'),
);
const VERSION = pkg.engineVersion;
const REPO    = pkg.engineRepository;

if (!VERSION) {
  console.error('[download-engine] "engineVersion" não definido em package.json');
  process.exit(1);
}
if (!REPO) {
  console.error('[download-engine] "engineRepository" não definido em package.json');
  process.exit(1);
}

// Extrai "owner/repo" da URL do repositório
const repoPath = new URL(REPO).pathname.replace(/^\//, '').replace(/\.git$/, '');

// Plataformas suportadas
const ALL_TARGETS = [
  { platform: 'linux',  arch: 'x64',   artifact: 'pawnpro-engine-linux-x64'       },
  { platform: 'linux',  arch: 'arm64', artifact: 'pawnpro-engine-linux-arm64'      },
  { platform: 'win32',  arch: 'x64',   artifact: 'pawnpro-engine-win32-x64.exe'    },
  { platform: 'darwin', arch: 'x64',   artifact: 'pawnpro-engine-darwin-x64'       },
  { platform: 'darwin', arch: 'arm64', artifact: 'pawnpro-engine-darwin-arm64'     },
];

const downloadAll = process.argv.includes('--all');
const artifactArg = (() => {
  const idx = process.argv.indexOf('--artifact');
  return idx >= 0 ? process.argv[idx + 1] : null;
})();

let targets;
if (downloadAll) {
  targets = ALL_TARGETS;
} else if (artifactArg) {
  const t = ALL_TARGETS.find(t => t.artifact === artifactArg);
  if (!t) {
    console.error(`[download-engine] Artefato desconhecido: ${artifactArg}`);
    console.error('[download-engine] Disponíveis:', ALL_TARGETS.map(t => t.artifact).join(', '));
    process.exit(1);
  }
  targets = [t];
} else {
  targets = ALL_TARGETS.filter(t => t.platform === process.platform && t.arch === process.arch);
  if (targets.length === 0) {
    console.warn(`[download-engine] Plataforma não suportada: ${process.platform}-${process.arch}`);
    process.exit(0);
  }
}

const enginesDir = path.join(import.meta.dirname, '..', 'engines');
fs.mkdirSync(enginesDir, { recursive: true });

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const follow = (u) => {
      https.get(u, { headers: { 'User-Agent': 'pawnpro-build' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          follow(res.headers.location);
          res.resume();
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} ao acessar ${u}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });
}

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const follow = (u) => {
      https.get(u, { headers: { 'User-Agent': 'pawnpro-build' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          follow(res.headers.location);
          res.resume();
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} ao baixar ${u}`));
          res.resume();
          return;
        }
        const total = parseInt(res.headers['content-length'] || '0', 10);
        let received = 0;
        const tmp = dest + '.tmp';
        const file = fs.createWriteStream(tmp);
        res.on('data', (chunk) => {
          received += chunk.length;
          if (total > 0) {
            const pct = Math.round((received / total) * 100);
            process.stdout.write(`\r  ${pct}% (${(received / 1024).toFixed(0)} KB)`);
          }
        });
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            fs.renameSync(tmp, dest);
            process.stdout.write('\n');
            resolve();
          });
        });
        file.on('error', (e) => { fs.unlink(tmp, () => {}); reject(e); });
      }).on('error', reject);
    };
    follow(url);
  });
}

// ─── Checksum helpers ─────────────────────────────────────────────────────────

function parseChecksums(text) {
  const map = new Map();
  for (const line of text.trim().split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2) {
      const hash = parts[0];
      // sha256sum prefixes filename with '*' no Windows
      const name = parts[parts.length - 1].replace(/^\*/, '');
      map.set(name, hash.toLowerCase());
    }
  }
  return map;
}

function computeSha256(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const baseUrl = `https://github.com/${repoPath}/releases/download/v${VERSION}`;

  // Filtra apenas os que ainda não existem
  const pending = targets.filter(t => {
    const dest = path.join(enginesDir, t.artifact);
    if (fs.existsSync(dest)) {
      console.log(`[download-engine] Já existe: engines/${t.artifact} — pulando`);
      return false;
    }
    return true;
  });

  if (pending.length === 0) {
    console.log('[download-engine] Todos os binários já estão presentes.');
    return;
  }

  // Só busca checksums se houver algo para baixar
  console.log(`[download-engine] Obtendo checksums da release v${VERSION}...`);
  let checksums;
  try {
    const buf = await fetchBuffer(`${baseUrl}/checksums.sha256`);
    checksums = parseChecksums(buf.toString('utf8'));
    console.log(`[download-engine] ${checksums.size} entradas carregadas`);
  } catch (err) {
    console.error(`[download-engine] Falha ao obter checksums.sha256: ${err.message}`);
    process.exit(1);
  }

  for (const target of pending) {
    const dest = path.join(enginesDir, target.artifact);
    const url = `${baseUrl}/${target.artifact}`;
    console.log(`[download-engine] Baixando ${target.platform}-${target.arch} (v${VERSION})...`);
    console.log(`  ${url}`);

    try {
      await downloadFile(url, dest);
    } catch (err) {
      console.error(`[download-engine] Falha ao baixar ${target.artifact}: ${err.message}`);
      process.exit(1);
    }

    // Verifica integridade — falha sempre, independente de CI
    const expected = checksums.get(target.artifact);
    if (!expected) {
      console.error(`[download-engine] Checksum ausente para ${target.artifact} em checksums.sha256`);
      fs.unlinkSync(dest);
      process.exit(1);
    }
    const actual = computeSha256(dest);
    if (actual !== expected) {
      console.error(`[download-engine] CHECKSUM INVÁLIDO: ${target.artifact}`);
      console.error(`  esperado : ${expected}`);
      console.error(`  recebido : ${actual}`);
      fs.unlinkSync(dest);
      process.exit(1);
    }
    console.log(`[download-engine] checksum ok: ${target.artifact}`);

    if (target.platform !== 'win32') {
      fs.chmodSync(dest, 0o755);
    }

    console.log(`[download-engine] Salvo: engines/${target.artifact}`);
  }
}

main().catch(err => {
  console.error('[download-engine] erro:', err);
  process.exit(1);
});
