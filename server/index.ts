import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { Lobby } from '../shared/lobby';

const PORT = Number(process.env.PORT) || 3001;
const NAME = process.env.SERVER_NAME || 'PokerSoul Server';

const lobby = new Lobby(NAME);

const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, name: NAME, rooms: lobby.rooms.size, players: lobby.connectionCount }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(`${NAME} — conecte-se via WebSocket em ws://<host>:${PORT}`);
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
});
