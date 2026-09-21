// Confere o servidor oficial por HTTP puro: mesa por ws e a cadeia de login pelo gateway.
import { WebSocket } from 'ws';

const BASE = 'http://35.209.186.9:3001';
const WS = 'ws://35.209.186.9:3001';
const log = [];

const h = await fetch(`${BASE}/health`).then((r) => r.json());
log.push(`health: tls=${h.tls} auth=${h.auth} pado=${h.pado} contas=${h.accounts}`);

// 1) a mesa por ws, sem login
const semLogin = await new Promise((resolve, reject) => {
  const got = [];
  const ws = new WebSocket(WS);
  const t = setTimeout(() => reject(new Error('sem resposta em 12s')), 12_000);
  ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', name: 'Checagem HTTP', avatar: { color: '#fff', icon: '♠' }, cosmetics: {} })));
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    got.push(m.type);
    if (m.type === 'account') {
      clearTimeout(t);
      ws.close();
      resolve({ got, a: m.account });
    }
  });
  ws.on('error', (e) => {
    clearTimeout(t);
    reject(e);
  });
});
log.push(`ws sem login: ${semLogin.got.join(' → ')} · ${semLogin.a.money} fichas · pado ${semLogin.a.pado} · ${semLogin.a.owned.length} itens`);

// 2) login pelo gateway e a mesa com o JWT
const USER = process.env.CHECK_USER;
const PASS = process.env.CHECK_PASS;
if (USER && PASS) {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ user: USER, password: PASS }),
  });
  const body = await r.json();
  if (!r.ok) {
    log.push(`/auth/login: ${r.status} ${JSON.stringify(body)}`);
  } else {
    const claims = JSON.parse(Buffer.from(body.token.split('.')[1], 'base64url').toString());
    log.push(`/auth/login: 200 · ${body.user} · sub=${claims.sub} iss=${claims.iss}`);
    const comLogin = await new Promise((resolve, reject) => {
      const got = [];
      const ws = new WebSocket(WS);
      const t = setTimeout(() => reject(new Error('sem resposta em 12s')), 12_000);
      ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', name: 'Checagem HTTP', avatar: { color: '#fff', icon: '♠' }, cosmetics: {}, jwt: body.token })));
      ws.on('message', (raw) => {
        const m = JSON.parse(String(raw));
        got.push(m.type);
        if (m.type === 'account') {
          clearTimeout(t);
          ws.close();
          resolve({ got, a: m.account });
        }
      });
      ws.on('error', (e) => {
        clearTimeout(t);
        reject(e);
      });
    });
    log.push(`ws com o JWT: ${comLogin.got.join(' → ')} · usuário ${comLogin.a.user} · ${comLogin.a.money} fichas`);
  }
}

console.log(log.join('\n'));
process.exit(0);
