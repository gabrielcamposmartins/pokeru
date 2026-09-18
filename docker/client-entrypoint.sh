#!/bin/sh
# Escreve /config.js com o endereço do servidor de jogo, na hora de subir o contêiner.
# Assim a mesma imagem serve para qualquer host: POKERSOUL_SERVER_URL=ws://host:3001
set -e
target=/usr/share/nginx/html/config.js
url="${POKERSOUL_SERVER_URL:-}"
cat > "$target" <<JS
// Gerado ao iniciar o contêiner (POKERSOUL_SERVER_URL).
window.PokerSoulConfig = Object.assign({ serverUrl: '${url}' }, window.PokerSoulConfig);
JS
if [ -n "$url" ]; then
  echo "[pokersoul] cliente aponta para $url"
else
  echo "[pokersoul] POKERSOUL_SERVER_URL não definido: o jogador digita o endereço no app"
fi
