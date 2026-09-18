import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { Lobby } from '../shared/lobby';
import { Accounts } from './accounts';
import { dataFile } from './store';

/**
 * Servidor Pokeru: hospeda as mesas e guarda as contas dos jogadores (saldo, vínculo e
 * números) num arquivo JSON. Roda sozinho, só com Node e o pacote `ws`.
 *
 * Configuração por variáveis de ambiente:
 *
 *   PORT=3001                porta HTTP/WebSocket
 *   SERVER_NAME=…            nome que aparece no cliente
 *   DATA_DIR=./data          onde ficam os dados (monte um volume aqui no Docker)
 *   POKERU_ACCOUNTS=1     0 desliga as contas: mesas livres, sem saldo nem vínculo salvo
 *   STARTING_MONEY=10000     saldo de uma conta nova
 *   FAUCET=2000              recarga de cortesia de quem zera (0 desliga)
 *   MAX_ACCOUNTS=1000        teto de contas guardadas (passando disso, só mesas livres)
 *   ADMIN_TOKEN=…            libera /admin (presentes e lista de contas)
 */

const PORT = Number(process.env.PORT) || 3001;
const NAME = process.env.SERVER_NAME || 'Pokeru Server';
const WITH_ACCOUNTS = process.env.POKERU_ACCOUNTS !== '0';
const ADMIN = process.env.ADMIN_TOKEN || '';
const num = (v: string | undefined, d: number) => (v !== undefined && Number.isFinite(Number(v)) ? Number(v) : d);

const accounts = WITH_ACCOUNTS
  ? new Accounts({
      file: dataFile('accounts.json'),
      startingMoney: num(process.env.STARTING_MONEY, 10_000),
      faucet: num(process.env.FAUCET, 2000),
      maxAccounts: num(process.env.MAX_ACCOUNTS, 1000),
    })
  : null;

const lobby = new Lobby(NAME, accounts);

/** Fichas que uma conta tem em mesa agora (somadas em todas as salas). */
if (accounts) {
  accounts.inPlayOf = (accountId) => {
    let total = 0;
    for (const room of lobby.rooms.values()) total += room.chipsOf(accountId);
    return total;
  };
}

function status() {
  return {
    ok: true,
    name: NAME,
    rooms: lobby.rooms.size,
    players: lobby.connectionCount,
    accounts: accounts?.count ?? 0,
    persistence: accounts ? 'json' : 'off',
  };
}

const json = (res: import('node:http').ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

const http = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/health') return json(res, 200, status());

  // administração: lista as contas e dá fichas de presente (precisa de ADMIN_TOKEN)
  if (url.pathname.startsWith('/admin')) {
    const token = req.headers['x-admin-token'] ?? url.searchParams.get('token') ?? '';
    if (!ADMIN || token !== ADMIN) return json(res, 403, { error: 'ADMIN_TOKEN inválido ou não configurado' });
    if (!accounts) return json(res, 400, { error: 'servidor sem contas (POKERU_ACCOUNTS=0)' });
    if (url.pathname === '/admin/accounts') return json(res, 200, { accounts: accounts.list() });
    if (url.pathname === '/admin/gift') {
      const id = url.searchParams.get('id') ?? '';
      const amount = Number(url.searchParams.get('amount') ?? 0);
      if (!accounts.gift(id, amount)) return json(res, 404, { error: 'conta não encontrada' });
      return json(res, 200, { ok: true, account: accounts.info(id) });
    }
    return json(res, 404, { error: 'rota desconhecida' });
  }

  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(`${NAME}\nConecte o cliente em ws://<host>:${PORT}\n/health mostra o estado do servidor.\n`);
});

// 128 KB: cabe um retrato personalizado (≤ 48 KB) junto do perfil
const wss = new WebSocketServer({ server: http, maxPayload: 128 * 1024 });

interface Alive extends WebSocket {
  isAlive?: boolean;
}

wss.on('connection', (ws: Alive, req) => {
  ws.isAlive = true;
  const conn = lobby.connect((msg) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  });
  let windowStart = Date.now();
  let count = 0;

  ws.on('pong', () => (ws.isAlive = true));
  ws.on('message', (data) => {
    // limite simples: 40 mensagens por segundo
    const now = Date.now();
    if (now - windowStart > 1000) {
      windowStart = now;
      count = 0;
    }
    if (++count > 40) return;
    let msg: unknown;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    try {
      conn.handle(msg);
    } catch (err) {
      console.error('[erro ao processar mensagem]', err);
    }
  });
  ws.on('close', () => conn.close());
  ws.on('error', () => conn.close());
  console.log(`[+] conexão ${conn.id} de ${req.socket.remoteAddress}`);
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients as Set<Alive>) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 15_000);

wss.on('close', () => clearInterval(heartbeat));

http.listen(PORT, () => {
  console.log(`♠ ${NAME} ouvindo em ws://localhost:${PORT}`);
  console.log(accounts ? `   contas: ${accounts.count} em ${dataFile('accounts.json')}` : '   contas desligadas (mesas livres)');
});

/**
 * Desligar com cuidado: quem está sentado recebe de volta as fichas que levou para a mesa (senão
 * elas ficariam presas numa partida que não existe mais) e os dados vão para o disco.
 */
let closing = false;
function shutdown(signal: string): void {
  if (closing) return;
  closing = true;
  console.log(`\n[${signal}] encerrando…`);
  clearInterval(heartbeat);
  for (const room of lobby.rooms.values()) room.cashOutAll();
  accounts?.close();
  for (const ws of wss.clients) ws.close(1012, 'servidor reiniciando');
  wss.close();
  http.close(() => process.exit(0));
  // não deixa o processo pendurado se algum socket travar
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
