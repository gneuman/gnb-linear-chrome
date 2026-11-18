#!/usr/bin/env bash
# Sube el .zip a la Chrome Web Store y lo manda a revisión, sin abrir la consola.
# Necesita en el entorno: CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN
# (cómo sacarlos: tienda/README.md → "Actualizar rápido").
set -euo pipefail
cd "$(dirname "$0")/.."
ID="hanbkkcipbiedbiolomknpfalaibibmg"
: "${CWS_CLIENT_ID:?Falta CWS_CLIENT_ID}" "${CWS_CLIENT_SECRET:?Falta CWS_CLIENT_SECRET}" "${CWS_REFRESH_TOKEN:?Falta CWS_REFRESH_TOKEN}"

bash scripts/empaquetar.sh
version=$(node -p "require('./manifest.json').version")
zip="dist/gnb-que-sigue-${version}.zip"

token=$(curl -sS https://oauth2.googleapis.com/token \
  -d client_id="$CWS_CLIENT_ID" -d client_secret="$CWS_CLIENT_SECRET" \
  -d refresh_token="$CWS_REFRESH_TOKEN" -d grant_type=refresh_token \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(!j.access_token){console.error(s);process.exit(1)}console.log(j.access_token)})')

echo "Subiendo $zip…"
subida=$(curl -sS -X PUT -H "Authorization: Bearer $token" -H "x-goog-api-version: 2" \
  -T "$zip" "https://www.googleapis.com/upload/chromewebstore/v1.1/items/$ID")
echo "$subida"
echo "$subida" | grep -q '"uploadState": *"SUCCESS"' || { echo "❌ No se subió."; exit 1; }

echo "Mandando a revisión…"
pub=$(curl -sS -X POST -H "Authorization: Bearer $token" -H "x-goog-api-version: 2" -H "Content-Length: 0" \
  "https://www.googleapis.com/chromewebstore/v1.1/items/$ID/publish")
echo "$pub"
echo "$pub" | grep -q '"OK"\|ITEM_PENDING_REVIEW' && echo "✅ v$version enviada a revisión." || { echo "❌ No se publicó."; exit 1; }
