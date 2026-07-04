#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Remove VSIXs anteriores
rm -f *.vsix

# Instala dependências de forma reproduzível a partir do lock file
echo "[build] Instalando dependências..."
npm ci

# Baixa os binários externos (engine LSP e adaptador do debugger) para a
# plataforma atual (ou --all para CI). Cada componente reporta seu próprio
# progresso; o debugger é opcional e não quebra o build se faltar.
echo "[build] Obtendo binários externos..."
node scripts/download-binaries.js "$@"

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
