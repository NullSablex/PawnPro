#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Remove VSIXs anteriores
rm -f *.vsix

# Atualiza dependências e lock file
echo "[build] Instalando dependências..."
npm install

# Baixa binário do motor para a plataforma atual (ou --all para CI)
echo "[build] Baixando motor pawnpro-engine..."
node scripts/download-engine.js "$@"

# Type-check
echo "[build] Verificando tipos..."
npx tsc --noEmit -p .

# Bundle + minificação com esbuild
echo "[build] Empacotando extensão..."
node scripts/bundle.mjs

# Empacota VSIX + injeta binários do motor
echo "[build] Gerando VSIX..."
npx @vscode/vsce package --no-dependencies --no-yarn
node scripts/repack-vsix.js

echo "[build] Concluído:"
ls -lh *.vsix
