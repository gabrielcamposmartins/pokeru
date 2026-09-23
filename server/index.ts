import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { WebSocketServer, WebSocket } from 'ws';
import { Lobby } from '../shared/lobby';
import type { AuthIdentity } from '../shared/accounts';
import { Accounts } from './accounts';
import { authRoutes } from './auth-http';
import { Gbot } from './gbot';
import { JwtVerifier } from './jwt';
import { dataFile } from './store';
import { TlsError, clientUrl, loadTls, type TlsPair } from './tls';

/**
 * Servidor Pokeru: hospeda as mesas e guarda as contas dos jogadores (saldo, vínculo e
 * números) num arquivo JSON. Roda sozinho, só com Node e o pacote `ws`.
 *
 * Configuração por variáveis de ambiente:
 *
 *   PORT=3001                porta HTTP/WebSocket
 *   SERVER_NAME=…            nome que aparece no cliente
 *   DATA_DIR=./data          onde ficam os dados (monte um volume aqui no Docker)
 *   POKERU_ACCOUNTS=1        0 desliga as contas: mesas livres, sem saldo nem vínculo salvo
 *   STARTING_MONEY=10000     saldo de uma conta nova
 *   FAUCET=2000              recarga de cortesia de quem zera (0 desliga)
 *   MAX_ACCOUNTS=1000        teto de contas guardadas (passando disso, só mesas livres)
 *   ADMIN_TOKEN=…            libera /admin (presentes e lista de contas)
 *
 * Contas e padocoins pelo bot do Discord (a API do GBOT — veja server/gbot.ts):
 *
 *   GBOT_URL=…               base da API, ex. https://gbot.interno. Sem ela, o jogo roda sem
 *                            login: as contas voltam a ser por token deste aparelho e a segunda
 *                            moeda não existe.
 *   GBOT_JWKS=…              URL do JWKS (padrão: GBOT_URL + /.well-known/jwks.json)
 *   GBOT_ISSUER=gbot         emissor esperado no JWT
 *   GBOT_AUDIENCE=…          audiência esperada, se a instância do GBOT definir uma
 *   GBOT_USER / GBOT_PASS    conta de serviço, usada para ler saldo e cobrar padocoins
 *
 * TLS (veja server/tls.ts e `npm run cert`):
 *
 *   TLS_CERT_PATH=…          certificado PEM. Com os dois caminhos o servidor passa a ser
 *   TLS_KEY_PATH=…           wss:// e https://; sem nenhum dos dois é ws:// (o certo atrás de
 *                            um proxy que já termine o TLS).
 *   NODE_EXTRA_CA_CERTS=…    CA para ESTE servidor confiar no GBOT, quando o bot usa certificado
 *                            interno próprio (é do Node, não precisa de código).
 */

const PORT = Number(process.env.PORT) || 3001;

/**
 * TLS. Configuração pela metade derruba a subida de propósito: quem definiu só um dos caminhos
 * acha que está protegido, e subir em claro nesse caso é pior do que não subir.
 */
let tls: TlsPair | null = null;
try {
  tls = loadTls();
} catch (err) {
  console.error(`\n\u2660 ${err instanceof TlsError ? err.message : err}\n`);
  process.exit(1);
}
const NAME = process.env.SERVER_NAME || 'Pokeru Server';
const WITH_ACCOUNTS = process.env.POKERU_ACCOUNTS !== '0';
const ADMIN = process.env.ADMIN_TOKEN || '';
const num = (v: string | undefined, d: number) => (v !== undefined && Number.isFinite(Number(v)) ? Number(v) : d);

// o bot do Discord: serviço de contas (login/JWT) e economia dos padocoins
const GBOT_URL = process.env.GBOT_URL || '';
const gbot = GBOT_URL
  ? new Gbot({ base: GBOT_URL, user: process.env.GBOT_USER, pass: process.env.GBOT_PASS })
  : null;

const jwt = GBOT_URL
  ? new JwtVerifier({
      jwksUrl: process.env.GBOT_JWKS || `${GBOT_URL.replace(/\/+$/, '')}/.well-known/jwks.json`,
      issuer: process.env.GBOT_ISSUER || 'gbot',
      audience: process.env.GBOT_AUDIENCE || undefined,
    })
  : null;

const accounts = WITH_ACCOUNTS
  ? new Accounts({
      file: dataFile('accounts.json'),
      startingMoney: num(process.env.STARTING_MONEY, 10_000),
      /*
       * Recarga de cortesia desligada: quem volta do zero é a mesa do recomeço.
       *
       * A torneira antiga devolvia 2.000 fichas na próxima cobrança de quem zerasse, em
       * **qualquer** mesa — e com isso quebrar não custava nada. Hoje o caminho de volta é jogar
       * o Contra Bots no Fácil, que senta de graça quem não tem o buy-in (veja `recomeco` em
       * shared/protocol.ts): ganhar as fichas de novo passa por jogar. `FAUCET` continua de pé
       * para quem quiser a cortesia de volta.
       */
      faucet: num(process.env.FAUCET, 0),
      maxAccounts: num(process.env.MAX_ACCOUNTS, 1000),
      gbot,
    })
  : null;

/**
 * Valida o JWT que o cliente manda no `hello`. Um token que não passa não derruba ninguém: o
 * jogador entra sem conta (mesas livres) e recebe o aviso para entrar de novo.
 */
const verifyAuth = jwt
  ? async (token: string): Promise<AuthIdentity | null> => {
      try {
        const c = await jwt.verify(token);
        // o token segue junto: é com ele que o serviço confirma um vínculo feito depois do login
        return { sub: c.sub, username: c.username ?? 'jogador', discordId: c.discord_id, nickname: c.nickname, token };
      } catch (err) {
        console.warn('[auth] token recusado:', err instanceof Error ? err.message : err);
        return null;
      }
    }
  : null;

const lobby = new Lobby(NAME, accounts, verifyAuth);
const auth = gbot && jwt ? authRoutes({ gbot, jwt, accounts }) : null;

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
    // o cliente usa isto para saber se mostra a tela de login e a loja de padocoins
    auth: auth ? 'gbot' : 'off',
    pado: gbot?.canMoveMoney ? 'on' : 'off',
    tls: tls ? 'on' : 'off',
  };
}

const json = (res: import('node:http').ServerResponse, code: number, body: unknown) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

const handler = async (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/health') return json(res, 200, status());

  // contas: login, cadastro e vínculo do Discord (repassados à API interna do GBOT)
  if (url.pathname.startsWith('/auth')) {
    if (!auth) return json(res, 503, { error: 'este servidor está sem serviço de contas (GBOT_URL não configurada)' });
    try {
      if (await auth(req, res, url.pathname)) return;
    } catch (err) {
      console.error('[auth] erro inesperado', err);
      if (!res.headersSent) return json(res, 500, { error: 'erro interno' });
      return;
    }
  }

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
  res.end(`${NAME}\nConecte o cliente em ${tls ? 'wss' : 'ws'}://<host>:${PORT}\n/health mostra o estado do servidor.\n`);
};

// com certificado, o mesmo processo serve https e wss na mesma porta
const http = tls ? createSecureServer({ cert: tls.cert, key: tls.key }, handler) : createServer(handler);

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
  console.log(`♠ ${NAME} ouvindo em ${clientUrl(!!tls, PORT)}`);
  if (tls) console.log(`   TLS: ${tls.certPath}`);
  else if (auth) console.log('   [!] sem TLS: a senha do login vai em claro na rede (veja `npm run cert`)');
  console.log(accounts ? `   contas: ${accounts.count} em ${dataFile('accounts.json')}` : '   contas desligadas (mesas livres)');
  if (auth) {
    console.log(`   login pelo GBOT: ${GBOT_URL}`);
    console.log(gbot?.canMoveMoney ? '   padocoins: ligados (conta de serviço configurada)' : '   padocoins: só leitura (sem GBOT_USER/GBOT_PASS)');
  } else {
    console.log('   sem GBOT_URL: jogo sem login e sem padocoins');
  }
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
