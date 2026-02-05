#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Limpa artefatos anteriores
rm -rf out/ *.vsix

# Compila TypeScript
echo "[build] Compilando TypeScript..."
npx tsc -p .

# Empacota VSIX + repack com dependências
echo "[build] Empacotando VSIX..."
npx @vscode/vsce package --no-dependencies --no-yarn
node scripts/repack-vsix.js

echo "[build] Concluído:"
ls -lh *.vsix
