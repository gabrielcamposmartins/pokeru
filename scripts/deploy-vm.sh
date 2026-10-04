#!/bin/bash
# Atualiza o servidor Pokeru na VM pelo Compose em /srv/pokeru.
#
# Rode na VM, de dentro de uma cópia do repositório ou com o compose.yml ao lado:
#   bash deploy-vm.sh
#
# O TLS fica no nginx do proxy (/srv/edge); o servidor roda em ws:// nas redes gbot_default e edge.
set -euo pipefail

DIR=/srv/pokeru
HERE=$(cd "$(dirname "$0")" && pwd)
SRC=""
for f in "$HERE/../docker/vm/compose.yml" "$HERE/compose.yml"; do
  [ -f "$f" ] && SRC="$f" && break
done

echo "=== compose em $DIR ==="
sudo mkdir -p "$DIR"
if [ -n "$SRC" ]; then
  sudo install -m 644 "$SRC" "$DIR/compose.yml"
fi
[ -f "$DIR/compose.yml" ] || { echo "falta $DIR/compose.yml"; exit 1; }

echo "=== redes ==="
sudo docker network inspect gbot_default >/dev/null || { echo "a rede gbot_default não existe: suba o GBOT antes"; exit 1; }
sudo docker network inspect edge >/dev/null 2>&1 || sudo docker network create edge

echo "=== baixando a imagem ==="
cd "$DIR"
sudo docker compose pull -q
sudo docker image inspect us-central1-docker.pkg.dev/gen-lang-client-0425635607/pokeru/server:latest \
  --format 'imagem {{.Id}} criada {{.Created}}'

echo "=== contêiner antigo fora do Compose ==="
# o primeiro deploy pelo Compose substitui o contêiner criado à mão com docker run
id=$(sudo docker ps -aq --filter name=^pokeru-server$)
if [ -n "$id" ] && [ "$(sudo docker inspect "$id" --format '{{index .Config.Labels "com.docker.compose.project"}}')" != "pokeru" ]; then
  echo "parando o contêiner criado fora do Compose"
  sudo docker stop -t 15 "$id" >/dev/null
  sudo docker rm "$id" >/dev/null
fi

echo "=== subindo ==="
sudo docker compose up -d

echo "=== esperando o health ==="
for i in $(seq 30); do
  curl -sf -m 3 http://127.0.0.1:3001/health >/dev/null && break
  sleep 1
done
curl -s -m 5 http://127.0.0.1:3001/health; echo
sudo docker compose ps --format '{{.Name}} | {{.Status}} | {{.Ports}}'

echo "=== o servidor alcança o bot pelo nome? ==="
sudo docker exec pokeru-server node -e "fetch('http://bot:8090/health').then(r=>r.text()).then(t=>console.log('bot:',t)).catch(e=>console.log('erro:',e.message))"

echo "=== pelo domínio, via nginx ==="
curl -s -m 8 https://pokeru.padoru.org/health; echo

echo "=== log ==="
sudo docker logs pokeru-server 2>&1 | tail -8
