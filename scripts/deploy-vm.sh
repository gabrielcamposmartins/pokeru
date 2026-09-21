#!/bin/bash
# Sobe o servidor Pokeru com TLS, na rede do GBOT.
#
# O contêiner roda como o usuário `node` (uid 1000), então a chave precisa ser legível por ele:
# fica 640 com o grupo 1000, em vez de 644 (que deixaria qualquer um na VM ler).
set -euo pipefail

IMG=us-central1-docker.pkg.dev/gen-lang-client-0425635607/pokeru/server:latest
CERTS=/etc/pokeru/certs
ENVF=/etc/pokeru/server.env

echo "=== chave legível pelo usuário do contêiner (uid 1000) ==="
sudo chown root:1000 "$CERTS/chave.pem"
sudo chmod 640 "$CERTS/chave.pem"
sudo ls -l "$CERTS"

echo "=== baixando a imagem ==="
sudo docker pull -q "$IMG"
sudo docker image inspect "$IMG" --format 'imagem {{.Id}} criada {{.Created}}'

echo "=== parando o contêiner antigo ==="
for c in $(sudo docker ps -aq --filter "publish=3001"); do
  nome=$(sudo docker inspect "$c" --format '{{.Name}}')
  echo "parando $nome"
  sudo docker stop -t 15 "$c" >/dev/null
  sudo docker rm "$c" >/dev/null
done

echo "=== subindo o novo ==="
sudo docker run -d \
  --name pokeru-server \
  --restart unless-stopped \
  --env-file "$ENVF" \
  -v pokeru-data:/data \
  -v "$CERTS":/certs:ro \
  --network gbot_default \
  -p 3001:3001 \
  "$IMG" >/dev/null

sleep 6
echo "=== estado ==="
sudo docker ps --filter name=pokeru-server --format '{{.Names}} | {{.Status}} | {{.Ports}}'
echo "=== log ==="
sudo docker logs pokeru-server 2>&1 | tail -12
echo "=== health por https, de dentro da VM ==="
curl -sk -m 8 https://127.0.0.1:3001/health; echo
echo "=== o servidor alcança o bot pelo nome? ==="
sudo docker exec pokeru-server node -e "fetch('http://bot:8090/health').then(r=>r.text()).then(t=>console.log('bot:',t)).catch(e=>console.log('erro:',e.message))"
