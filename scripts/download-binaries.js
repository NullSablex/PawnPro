// Baixa os binários externos da extensão (engine LSP e adaptador do debugger)
// dos releases do GitHub, com verificação de checksum. Unifica o que antes eram
// dois scripts quase idênticos.
//
// Componentes:
// - **engine** (`pawnpro-engine`): obrigatório para o IntelliSense; um binário
//   por plataforma do host.
// - **debugger** (`dap-adapter`): opcional. Só o adaptador vai no VSIX (o plugin
//   do servidor é instalado à parte). Sem release publicada, apenas avisa e não
//   quebra o build.
//
// Uso:
//   node scripts/download-binaries.js                 # plataforma atual
//   node scripts/download-binaries.js --all           # todas (CI)
//   node scripts/download-binaries.js --component engine
//   node scripts/download-binaries.js --artifact pawnpro-engine-linux-x64
//   node scripts/download-binaries.js --pin                # pina checksums no package.json
//   node scripts/download-binaries.js --pin --component engine
//
// Blindagem: com checksums pinados (`engineChecksums`/`debuggerChecksums` no
// package.json), o download valida contra o package.json — não contra o
// checksums.sha256 da release. Re-publicar a tag com outro binário passa a falhar
// o build até que `--pin` seja rodado e o package.json revisado/commitado.

import crypto from 'crypto';
import fs from 'fs';
import https from 'https';
import path from 'path';

const pkg = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf8'),
);

const enginesDir = path.join(import.meta.dirname, '..', 'engines');
fs.mkdirSync(enginesDir, { recursive: true });

/** Definição de cada componente. `optional` = não quebra o build se faltar. */
const COMPONENTS = [
  {
    name: 'engine',
    version: pkg.engineVersion,
    repository: pkg.engineRepository,
    // Checksums pinados no package.json (artifact -> sha256). Quando presente para
    // um artefato, é a FONTE DA VERDADE: validamos contra ele e ignoramos o que a
    // release diz. Blinda contra re-publicação da tag com outro binário. Ausente:
    // cai no checksums.sha256 da própria release (comportamento padrão).
    pinned: pkg.engineChecksums || {},
    optional: false,
    targets: [
      { platform: 'linux',  arch: 'x64',   artifact: 'pawnpro-engine-linux-x64'        },
      { platform: 'linux',  arch: 'arm64', artifact: 'pawnpro-engine-linux-arm64'       },
      { platform: 'win32',  arch: 'x64',   artifact: 'pawnpro-engine-win32-x64.exe'     },
      { platform: 'darwin', arch: 'x64',   artifact: 'pawnpro-engine-darwin-x64'        },
      { platform: 'darwin', arch: 'arm64', artifact: 'pawnpro-engine-darwin-arm64'      },
    ],
  },
  {
    name: 'debugger',
    version: pkg.debuggerVersion,
    repository: pkg.debuggerRepository,
    pinned: pkg.debuggerChecksums || {},
    optional: true,
    // O adaptador roda na arch do HOST (onde o VS Code roda), não a do servidor.
    targets: [
      { platform: 'linux',  arch: 'x64',   artifact: 'pawnpro-dap-adapter-linux-x64'    },
      { platform: 'linux',  arch: 'arm64', artifact: 'pawnpro-dap-adapter-linux-arm64'  },
      { platform: 'win32',  arch: 'x64',   artifact: 'pawnpro-dap-adapter-win32-x64.exe' },
      { platform: 'darwin', arch: 'x64',   artifact: 'pawnpro-dap-adapter-darwin-x64'   },
      { platform: 'darwin', arch: 'arm64', artifact: 'pawnpro-dap-adapter-darwin-arm64' },
    ],
  },
];

const downloadAll = process.argv.includes('--all');
const pinMode = process.argv.includes('--pin');
const artifactArg = argValue('--artifact');
const componentArg = argValue('--component');

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

/** Resolve os alvos de um componente conforme os argumentos de linha de comando. */
function resolveTargets(component) {
  if (artifactArg) {
    return component.targets.filter(t => t.artifact === artifactArg);
  }
  if (downloadAll) {
    return component.targets;
  }
  return component.targets.filter(
    t => t.platform === process.platform && t.arch === process.arch,
  );
}

function httpGet(url, onResponse) {
  const follow = (u) => {
    https.get(u, { headers: { 'User-Agent': 'pawnpro-build' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        follow(res.headers.location);
        res.resume();
        return;
      }
      onResponse(res, u);
    }).on('error', (err) => { throw err; });
  };
  follow(url);
}

async function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    httpGet(url, (res, u) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} ao acessar ${u}`));
        res.resume();
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
  });
}

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    httpGet(url, (res, u) => {
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
    });
  });
}

function parseChecksums(text) {
  const map = new Map();
  for (const line of text.trim().split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2) {
      const name = parts[parts.length - 1].replace(/^\*/, '');
      map.set(name, parts[0].toLowerCase());
    }
  }
  return map;
}

function computeSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

/** Falha conforme `optional`: erro fatal (engine) ou aviso + sucesso (debugger). */
function bail(component, message) {
  const tag = `[download:${component.name}]`;
  if (component.optional) {
    console.warn(`${tag} ${message}`);
    console.warn(`${tag} Componente opcional — seguindo sem ele.`);
    return false; // segue o build
  }
  console.error(`${tag} ${message}`);
  process.exit(1);
}

/** Rótulo legível de um componente (para mensagens não-genéricas). */
function label(component) {
  return component.name === 'engine'
    ? 'engine LSP (pawnpro-engine)'
    : 'adaptador do debugger (dap-adapter)';
}

async function processComponent(component) {
  const tag = `[download:${component.name}]`;
  const targets = resolveTargets(component);
  // Com --artifact, só o componente dono daquele artefato é tratado (os outros
  // nem reportam nada, para a saída não ficar ruidosa/genérica).
  if (artifactArg && targets.length === 0) {
    return;
  }
  if (!component.version || !component.repository) {
    console.log(`${tag} ${label(component)}: version/repository não definidos — pulando.`);
    return;
  }
  console.log(`${tag} ${label(component)} v${component.version}`);
  if (!downloadAll && !artifactArg && targets.length === 0) {
    console.warn(`${tag} Plataforma não suportada: ${process.platform}-${process.arch}`);
    return;
  }

  const repoPath = new URL(component.repository).pathname
    .replace(/^\//, '')
    .replace(/\.git$/, '');
  const baseUrl = `https://github.com/${repoPath}/releases/download/v${component.version}`;

  const pending = targets.filter(t => {
    const dest = path.join(enginesDir, t.artifact);
    if (fs.existsSync(dest)) {
      console.log(`${tag} Já existe: engines/${t.artifact} — pulando`);
      return false;
    }
    return true;
  });

  if (pending.length === 0) {
    console.log(`${tag} Todos os binários já estão presentes.`);
    return;
  }

  // Só busca o checksums.sha256 da release se houver algum pendente SEM checksum
  // pinado no package.json. Se todos estão pinados, a release nem é consultada
  // para integridade — o package.json (versionado, revisado) é a fonte da verdade.
  const allPinned = pending.every(t => component.pinned[t.artifact]);
  let checksums = new Map();
  if (allPinned) {
    console.log(`${tag} Checksums pinados no package.json — release não consultada para integridade.`);
  } else {
    console.log(`${tag} Obtendo checksums da release v${component.version}...`);
    try {
      const buf = await fetchBuffer(`${baseUrl}/checksums.sha256`);
      checksums = parseChecksums(buf.toString('utf8'));
      console.log(`${tag} ${checksums.size} entradas carregadas`);
    } catch (err) {
      if (!bail(component, `Release v${component.version} indisponível (${err.message}).`)) {
        if (component.name === 'debugger') {
          console.warn(`${tag} Compile o adaptador e copie para engines/${pending[0].artifact}.`);
        }
        return;
      }
    }
  }

  for (const target of pending) {
    const dest = path.join(enginesDir, target.artifact);
    const url = `${baseUrl}/${target.artifact}`;
    console.log(`${tag} Baixando ${target.artifact} (${target.platform}-${target.arch})...`);
    console.log(`  ${url}`);

    try {
      await downloadFile(url, dest);
    } catch (err) {
      if (!bail(component, `Falha ao baixar ${target.artifact}: ${err.message}`)) return;
      continue;
    }

    // Pinado no package.json tem prioridade; senão usa o da release.
    const pinned = component.pinned[target.artifact];
    const expected = (pinned || checksums.get(target.artifact) || '').toLowerCase();
    if (pinned) {
      console.log(`${tag} usando checksum pinado (package.json): ${target.artifact}`);
    }
    if (!expected) {
      fs.unlinkSync(dest);
      if (!bail(component, `Checksum ausente para ${target.artifact}.`)) return;
      continue;
    }
    const actual = computeSha256(dest);
    if (actual !== expected) {
      fs.unlinkSync(dest);
      if (!bail(component, `CHECKSUM INVÁLIDO: ${target.artifact} (esperado ${expected}, recebido ${actual}).`)) return;
      continue;
    }
    console.log(`${tag} checksum ok: ${target.artifact}`);

    if (target.platform !== 'win32') {
      fs.chmodSync(dest, 0o755);
    }
    console.log(`${tag} Salvo: engines/${target.artifact}`);
  }
}

/** Mapeia `name` de componente -> chave de checksums no package.json. */
const PIN_KEY = { engine: 'engineChecksums', debugger: 'debuggerChecksums' };

/**
 * Modo `--pin`: lê o checksums.sha256 da release atual e grava os SHA-256 dos
 * artefatos do componente em `<name>Checksums` no package.json. Fonte fiel à
 * release publicada — não baixa os binários, só os hashes que ela declara.
 * Depois disso, os builds validam contra o package.json (revisado), não a release.
 */
async function pinComponent(component, pkgObj) {
  const tag = `[pin:${component.name}]`;
  if (!component.version || !component.repository) {
    console.log(`${tag} version/repository não definidos — pulando.`);
    return false;
  }
  const repoPath = new URL(component.repository).pathname
    .replace(/^\//, '')
    .replace(/\.git$/, '');
  const baseUrl = `https://github.com/${repoPath}/releases/download/v${component.version}`;
  console.log(`${tag} Lendo checksums da release v${component.version}...`);

  let released;
  try {
    const buf = await fetchBuffer(`${baseUrl}/checksums.sha256`);
    released = parseChecksums(buf.toString('utf8'));
  } catch (err) {
    console.error(`${tag} Falha ao obter checksums.sha256: ${err.message}`);
    if (!component.optional) process.exit(1);
    console.warn(`${tag} Componente opcional — sem pinagem.`);
    return false;
  }

  const pinned = {};
  let missing = 0;
  for (const target of component.targets) {
    const sha = released.get(target.artifact);
    if (sha) {
      pinned[target.artifact] = sha.toLowerCase();
    } else {
      console.warn(`${tag} sem checksum para ${target.artifact} na release — não pinado.`);
      missing++;
    }
  }
  pkgObj[PIN_KEY[component.name]] = pinned;
  console.log(`${tag} ${Object.keys(pinned).length} artefato(s) pinado(s)${missing ? `, ${missing} faltando` : ''}.`);
  return true;
}

async function runPin() {
  const pkgPath = path.join(import.meta.dirname, '..', 'package.json');
  const pkgObj = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const selected = componentArg
    ? COMPONENTS.filter(c => c.name === componentArg)
    : COMPONENTS;
  let changed = false;
  for (const component of selected) {
    if (await pinComponent(component, pkgObj)) changed = true;
  }
  if (changed) {
    // Preserva a indentação de 2 espaços e o \n final do package.json.
    fs.writeFileSync(pkgPath, JSON.stringify(pkgObj, null, 2) + '\n');
    console.log('[pin] package.json atualizado.');
  }
}

async function main() {
  if (pinMode) {
    await runPin();
    return;
  }
  const selected = componentArg
    ? COMPONENTS.filter(c => c.name === componentArg)
    : COMPONENTS;
  if (selected.length === 0) {
    console.error(`[download] Componente desconhecido: ${componentArg}`);
    console.error('[download] Disponíveis:', COMPONENTS.map(c => c.name).join(', '));
    process.exit(1);
  }
  for (const component of selected) {
    await processComponent(component);
  }
}

main().catch(err => {
  console.error('[download] erro:', err);
  process.exit(1);
});
