#!/usr/bin/env bash
# Arma el .zip que se sube a la Chrome Web Store: solo lo que la extensión usa.
# Uso: npm run empaquetar  →  dist/gnb-que-sigue-<versión>.zip
set -euo pipefail
cd "$(dirname "$0")/.."

version=$(node -p "require('./manifest.json').version")
salida="dist/gnb-que-sigue-${version}.zip"

npm test --silent

mkdir -p dist
rm -f "$salida"
zip -qr "$salida" manifest.json background.js popup.html popup.css popup.js \
  options.html options.js lib icons -x '*.DS_Store'

echo "Listo: $salida ($(du -h "$salida" | cut -f1))"
echo "Cada vez que subas uno nuevo, sube antes \"version\" en manifest.json: la tienda rechaza una versión repetida."
