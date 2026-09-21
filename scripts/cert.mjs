#!/usr/bin/env node
/**
 * Gera o certificado autoassinado do servidor.
 *
 *   npm run cert                     → para 35.209.186.9 (o servidor oficial), em ./certs
 *   npm run cert -- 192.168.0.10     → para outro IP
 *   npm run cert -- poker.casa.lan   → para um nome (vira DNS: no SAN em vez de IP:)
 *   npm run cert -- 192.168.0.10 --dir /etc/pokeru/certs
 *
 * É exatamente o comando do openssl que a gente combinou:
 *
 *     openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
 *       -keyout chave.pem -out cert.pem \
 *       -subj "/CN=meu-servidor" -addext "subjectAltName=IP:SEU_IP"
 *
 * O `subjectAltName` é o que importa: navegador nenhum olha mais o CN, então sem o SAN certo a
 * conexão é recusada mesmo com o certificado instalado. IP vai como `IP:`, nome como `DNS:`.
 *
 * O certificado é **autoassinado**: ninguém confia nele por padrão. Cada máquina que joga precisa
 * aceitá-lo uma vez (abrindo `https://<host>:3001/health` no navegador) ou tê-lo na store de
 * confiança do sistema — veja o README, em "TLS".
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_HOST = '35.209.186.9';
const DAYS = 3650;

const argv = process.argv.slice(2);
const dirFlag = argv.indexOf('--dir');
const dir = dirFlag >= 0 ? argv[dirFlag + 1] : 'certs';
const force = argv.includes('--force');
const host = argv.find((a) => !a.startsWith('--') && a !== dir) ?? DEFAULT_HOST;

/** IP vira `IP:`, qualquer outra coisa vira `DNS:` — o openssl não adivinha. */
const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
const san = `subjectAltName=${isIp ? 'IP' : 'DNS'}:${host}`;

const out = resolve(dir);
const cert = resolve(out, 'cert.pem');
const key = resolve(out, 'chave.pem');

if (!force && (existsSync(cert) || existsSync(key))) {
  console.error(`Já existe certificado em ${out}.`);
  console.error('Use --force para trocar (quem já aceitou o antigo vai precisar aceitar o novo).');
  process.exit(1);
}

mkdirSync(out, { recursive: true });

try {
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      String(DAYS),
      '-keyout',
      key,
      '-out',
      cert,
      '-subj',
      `/CN=${host}`,
      '-addext',
      san,
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
} catch (err) {
  console.error('\nFalhou ao rodar o openssl.');
  console.error('No Windows ele vem com o Git (Git Bash); no Linux/macOS, instale o pacote `openssl`.');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}

const url = `wss://${host}:3001`;
console.log(`\n♠ certificado para ${host} (${san}), válido por ${DAYS} dias`);
console.log(`   ${cert}`);
console.log(`   ${key}   ← a chave é secreta: não versione, não compartilhe`);
console.log('\nNo servidor:');
console.log(`   TLS_CERT_PATH=${cert} TLS_KEY_PATH=${key} npm run server`);
console.log('\nNo cliente (build do instalador ou do web):');
console.log(`   VITE_SERVER_URL=${url} npm run build`);
console.log('\nEm cada máquina que for jogar, uma vez:');
console.log(`   abra https://${host}:3001/health no navegador e aceite o certificado`);
console.log(`   (ou instale ${cert} na store de confiança do sistema — veja o README)`);
