#!/bin/sh
# Escreve /config.js com o endereço do servidor de jogo, na hora de subir o contêiner.
# Assim a mesma imagem serve para qualquer host: POKERU_SERVER_URL=ws://host:3001
set -e
target=/usr/share/nginx/html/config.js
url="${POKERU_SERVER_URL:-}"
cat > "$target" <<JS
// Gerado ao iniciar o contêiner (POKERU_SERVER_URL).
window.PokeruConfig = Object.assign({ serverUrl: '${url}' }, window.PokeruConfig);
JS
if [ -n "$url" ]; then
  echo "[pokeru] cliente aponta para $url"
else
  echo "[pokeru] POKERU_SERVER_URL não definido: o app usa o servidor oficial embutido"
fi
