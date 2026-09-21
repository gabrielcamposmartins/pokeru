import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Accounts } from './accounts';
import { Gbot, GbotError } from './gbot';
import { JwtError, type JwtVerifier } from './jwt';

/**
 * Gateway de contas: as rotas `/auth/*` que o **cliente do jogo** usa.
 *
 * A API do GBOT é interna e o jogo roda na máquina do jogador, então ele não alcança o bot
 * diretamente — quem alcança é este servidor. Daí o desenho:
 *
 *     jogo  ──HTTP──>  /auth/*  (aqui)  ──HTTP──>  API do GBOT (rede interna)
 *     jogo  ──WS────>  mesa, salas, loja          ──> valida o JWT com o JWKS do GBOT
 *
 * Duas consequências que vale dizer em voz alta:
 *
 *   - **a senha passa por aqui** (só no `/auth/login` e no `/auth/register`, e não é guardada em
 *     lugar nenhum). Por isso este servidor precisa de TLS em produção: sem `https`/`wss`, a senha
 *     vai em claro na rede. A própria documentação do GBOT diz para nunca chamar `/login` por HTTP
 *     puro, e isso vale para o caminho inteiro.
 *   - **o vínculo do Discord é registrado aqui**, na conta do jogo, quando o GBOT confirma. O JWT
 *     carrega `discord_id`, mas ele é assinado no login: quem vincula depois teria de entrar de
 *     novo para o token saber do vínculo. Como o vínculo passa por nós, autenticado com o token do
 *     próprio jogador, dá para anotar na hora — e os padocoins aparecem sem precisar relogar.
 */

const MAX_BODY = 8 * 1024;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-max-age': '86400',
};

function send(res: ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', ...CORS });
  res.end(JSON.stringify(body));
}

/** Erro no formato que o cliente entende: `{ error: "…" }`, com a mensagem em português. */
const fail = (res: ServerResponse, code: number, error: string) => send(res, code, { error });

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error('corpo grande demais');
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
}

const str = (v: unknown, max = 256): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** O token do cabeçalho `Authorization: Bearer <token>`. */
function bearer(req: IncomingMessage): string {
  const raw = req.headers.authorization ?? '';
  return raw.startsWith('Bearer ') ? raw.slice(7).trim() : '';
}

export interface AuthHttpOptions {
  gbot: Gbot;
  jwt: JwtVerifier;
  accounts: Accounts | null;
}

/**
 * Monta o tratador das rotas `/auth/*`. Devolve `true` quando tratou a requisição — é assim que
 * o servidor HTTP decide se ainda precisa responder alguma coisa.
 */
export function authRoutes({ gbot, jwt, accounts }: AuthHttpOptions) {
  /** Quem está chamando, segundo o JWT (nunca segundo o corpo da requisição). */
  async function who(req: IncomingMessage, res: ServerResponse): Promise<{ sub: string; token: string } | null> {
    const token = bearer(req);
    if (!token) {
      fail(res, 401, 'entre na sua conta para fazer isso');
      return null;
    }
    try {
      const claims = await jwt.verify(token);
      return { sub: claims.sub, token };
    } catch (err) {
      fail(res, 401, err instanceof JwtError ? `sessão inválida: ${err.message}` : 'sessão inválida');
      return null;
    }
  }

  /**
   * Erro do GBOT repassado ao jogador.
   *
   * A mensagem do bot serve para as rotas de conta ("usuario ou senha invalidos" é exatamente o que
   * se quer ler). Para o vínculo, não: um `404 Not Found` é verdade para a API e enigma para quem
   * está na tela — a pessoa precisa saber que o id não é de alguém que o bot conhece. Por isso
   * `traduz` mapeia os status conhecidos de cada rota, e o resto continua passando como está.
   */
  function relay(res: ServerResponse, err: unknown, fallback: string, traduz: Record<number, string> = {}): void {
    if (err instanceof GbotError) {
      const msg = traduz[err.status] ?? err.message;
      if (err.status >= 500) console.error(`[auth] GBOT ${err.status}: ${err.message}`);
      return fail(res, err.status, msg);
    }
    console.error('[auth]', err);
    fail(res, 500, fallback);
  }

  return async function handle(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
    if (!path.startsWith('/auth')) return false;
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      res.end();
      return true;
    }

    let body: Record<string, unknown> = {};
    if (req.method === 'POST') {
      try {
        body = await readBody(req);
      } catch {
        fail(res, 400, 'pedido inválido');
        return true;
      }
    }

    switch (`${req.method} ${path}`) {
      // ---------------------------------------------------------- conta
      case 'POST /auth/register': {
        const user = str(body.user ?? body.username, 32);
        const password = str(body.password);
        if (user.length < 3 || password.length < 8) {
          fail(res, 400, 'usuário de 3 a 32 caracteres e senha de no mínimo 8');
          return true;
        }
        try {
          await gbot.createAccount(user, password);
          // já entra: quem acabou de criar a conta não deveria digitar a senha duas vezes
          const login = await gbot.login(user, password);
          send(res, 201, { token: login.token, expiresIn: login.expires_in, user: login.account.username, discord: login.account.discord_id ?? null });
        } catch (err) {
          relay(res, err, 'não foi possível criar a conta');
        }
        return true;
      }

      case 'POST /auth/login': {
        const user = str(body.user ?? body.username, 32);
        const password = str(body.password);
        if (!user || !password) {
          fail(res, 400, 'preencha usuário e senha');
          return true;
        }
        try {
          const login = await gbot.login(user, password);
          send(res, 200, { token: login.token, expiresIn: login.expires_in, user: login.account.username, discord: login.account.discord_id ?? null });
        } catch (err) {
          relay(res, err, 'não foi possível entrar');
        }
        return true;
      }

      case 'GET /auth/me': {
        const caller = await who(req, res);
        if (!caller) return true;
        try {
          const me = await gbot.me(caller.token);
          send(res, 200, { user: me.username, discord: me.discord_id ?? null });
        } catch (err) {
          relay(res, err, 'não foi possível ler a conta');
        }
        return true;
      }

      // ------------------------------------------------------- Discord
      case 'POST /auth/discord/code': {
        // exige sessão: sem isso, qualquer um mandaria DM para qualquer id pelo nosso servidor
        const caller = await who(req, res);
        if (!caller) return true;
        const entrada = str(body.discordId ?? body.id ?? body.username, 40);
        if (!entrada) {
          fail(res, 400, 'informe seu usuário do Discord (ou o id)');
          return true;
        }
        /**
         * Aceita o **nome de usuário** (`gabss2`) além do id numérico. O nome é o que a pessoa
         * sabe de cor; o id exige ligar o modo desenvolvedor e copiar 18 dígitos. A economia do bot
         * indexa pelos dois, então resolvemos o nome aqui e seguimos pelo id — que é o que o
         * `POST /auth` e o vínculo usam.
         */
        let id = entrada;
        if (!/^\d{5,25}$/.test(entrada)) {
          const achado = await gbot.userByName(entrada.replace(/^@/, '')).catch(() => null);
          if (!achado?.user_id) {
            console.warn(`[discord] nome "${entrada}" não achado na economia (conta ${caller.sub})`);
            fail(res, 404, `não encontrei "${entrada}" no servidor do bot. Confira o nome de usuário do Discord (não o apelido) — ou use o id numérico.`);
            return true;
          }
          id = achado.user_id;
          console.log(`[discord] "${entrada}" resolvido para ${id} (conta ${caller.sub})`);
        }
        try {
          await gbot.requestLinkCode(id);
          console.log(`[discord] código pedido para ${id} (conta ${caller.sub})`);
          send(res, 200, { ok: true, discordId: id });
        } catch (err) {
          const status = err instanceof GbotError ? err.status : 0;
          console.warn(`[discord] pedido de código para ${id} (conta ${caller.sub}) falhou: ${status} ${err instanceof Error ? err.message : err}`);
          relay(res, err, 'não foi possível pedir o código', {
            404: 'o bot não conhece essa conta do Discord. Confira o nome e se você está no servidor onde o bot está — ele precisa ter visto você para mandar a DM.',
            400: 'não entendi essa conta do Discord. Tente o nome de usuário (como `gabss2`) ou o id numérico.',
          });
        }
        return true;
      }

      case 'POST /auth/discord/link': {
        const caller = await who(req, res);
        if (!caller) return true;
        const code = str(body.code, 16);
        if (!code) {
          fail(res, 400, 'informe o código que o bot mandou na sua DM');
          return true;
        }
        try {
          const account = await gbot.link(caller.token, code);
          const discordId = account.discord_id ?? '';
          if (!discordId) {
            console.error(`[discord] vínculo da conta ${caller.sub} voltou sem discord_id`);
            fail(res, 502, 'o serviço confirmou o vínculo mas não disse qual Discord é');
            return true;
          }
          // anota no jogo: é o que faz os padocoins aparecerem sem precisar entrar de novo
          const info = await accounts?.setDiscordBySub(caller.sub, { id: discordId, username: account.username, nickname: null });
          console.log(`[discord] conta ${caller.sub} vinculada a ${discordId} · padocoins ${info?.pado ?? 'não lidos'}`);
          send(res, 200, { ok: true, discord: discordId, pado: info?.pado ?? null });
        } catch (err) {
          const status = err instanceof GbotError ? err.status : 0;
          console.warn(`[discord] vínculo da conta ${caller.sub} falhou: ${status} ${err instanceof Error ? err.message : err}`);
          relay(res, err, 'não foi possível vincular o Discord', {
            400: 'código inválido ou expirado. Peça outro — ele vale 15 minutos.',
            404: 'esse código não existe (ou já foi usado). Peça outro.',
            409: 'esse Discord já está em outra conta, ou esta conta já tem um Discord. Desvincule primeiro.',
          });
        }
        return true;
      }

      case 'POST /auth/discord/unlink': {
        const caller = await who(req, res);
        if (!caller) return true;
        try {
          await gbot.unlink(caller.token);
          await accounts?.setDiscordBySub(caller.sub, null);
          console.log(`[discord] conta ${caller.sub} desvinculada`);
          send(res, 200, { ok: true });
        } catch (err) {
          relay(res, err, 'não foi possível desvincular o Discord', {
            404: 'esta conta não tem Discord vinculado.',
          });
        }
        return true;
      }

      default:
        fail(res, 404, 'rota desconhecida');
        return true;
    }
  };
}
