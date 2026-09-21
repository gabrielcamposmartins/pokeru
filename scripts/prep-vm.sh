#!/bin/bash
# Prepara a VM para o Pokeru com TLS:
#   1. certificado autoassinado para o IP fixo, em /etc/pokeru/certs
#   2. conta de serviço no GBOT (para ler saldo e cobrar padocoins)
#   3. /etc/pokeru/server.env com a configuração, legível só pelo root
#
# Idempotente: certificado e conta que já existem não são refeitos.
set -euo pipefail

IP=35.209.186.9
DIR=/etc/pokeru
CERTS=$DIR/certs
ENVF=$DIR/server.env
GBOT=http://127.0.0.1:8090
USER_SVC=pokeru-server

sudo mkdir -p "$CERTS"

# ---------------------------------------------------------------- certificado
if sudo test -f "$CERTS/cert.pem"; then
  echo "[cert] já existe, mantendo"
else
  sudo openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
    -keyout "$CERTS/chave.pem" -out "$CERTS/cert.pem" \
    -subj "/CN=$IP" -addext "subjectAltName=IP:$IP" 2>/dev/null
  echo "[cert] gerado"
fi
sudo chmod 600 "$CERTS/chave.pem"
sudo chmod 644 "$CERTS/cert.pem"
echo "[cert] $(sudo openssl x509 -in "$CERTS/cert.pem" -noout -subject -ext subjectAltName | tr '\n' ' ')"

# ------------------------------------------------------------ conta de servico
# a senha fica só no arquivo de ambiente (chmod 600), nunca em histórico de shell
if sudo test -f "$ENVF" && sudo grep -q '^GBOT_PASS=' "$ENVF"; then
  PASS=$(sudo grep '^GBOT_PASS=' "$ENVF" | cut -d= -f2-)
  echo "[conta] reaproveitando a senha guardada em $ENVF"
else
  PASS=$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)
  echo "[conta] senha nova sorteada"
fi

CREATE=$(curl -s -o /tmp/acc.json -w '%{http_code}' -m 10 -X POST "$GBOT/accounts" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER_SVC\",\"password\":\"$PASS\"}" || echo 000)
echo "[conta] POST /accounts -> $CREATE $(cat /tmp/acc.json 2>/dev/null | head -c 160)"

LOGIN=$(curl -s -o /tmp/login.json -w '%{http_code}' -m 10 -X POST "$GBOT/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$USER_SVC\",\"password\":\"$PASS\"}" || echo 000)
if [ "$LOGIN" != "200" ]; then
  echo "[conta] ERRO: login da conta de serviço devolveu $LOGIN $(cat /tmp/login.json | head -c 200)"
  echo "[conta] (se for 401, a conta '$USER_SVC' já existe com outra senha: apague-a no bot ou escolha outro usuário)"
  rm -f /tmp/acc.json /tmp/login.json
  exit 1
fi
echo "[conta] login ok — a conta de serviço funciona"
rm -f /tmp/acc.json /tmp/login.json

# --------------------------------------------------------------- ambiente
sudo tee "$ENVF" >/dev/null <<ENV
# Configuração do servidor Pokeru. Gerado por scripts/prep-vm.sh.
# Contém a senha da conta de serviço no GBOT: legível só pelo root (chmod 600).
SERVER_NAME=Pokeru Oficial
DATA_DIR=/data
PORT=3001
STARTING_MONEY=10000
FAUCET=2000
TLS_CERT_PATH=/certs/cert.pem
TLS_KEY_PATH=/certs/chave.pem
GBOT_URL=http://bot:8090
GBOT_ISSUER=gbot
GBOT_USER=$USER_SVC
GBOT_PASS=$PASS
ENV
sudo chmod 600 "$ENVF"
sudo chown root:root "$ENVF"
echo "[env] $ENVF escrito (chmod 600)"
sudo grep -v '^GBOT_PASS=' "$ENVF"
echo "GBOT_PASS=<guardada no arquivo>"
