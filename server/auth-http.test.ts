import { describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { authRoutes } from './auth-http';
import { Gbot } from './gbot';
import type { JwtVerifier } from './jwt';
import type { Accounts } from './accounts';
import type { DiscordLink } from '../shared/accounts';

/**
 * O gateway `/auth/*`. O que ele precisa acertar, e que falhou no primeiro teste com gente de
 * verdade: **o recado**. Um `404 Not Found` do bot é verdade para a API e enigma para quem está na
 * tela — a pessoa precisa saber que o id não é de alguém que o bot conhece.
 */

/** Requisição de mentira: o corpo chega pelo async iterator, como no Node. */
function req(method: string, body?: unknown, token?: string): IncomingMessage {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  return {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c;
    },
  } as unknown as IncomingMessage;
}

/** Resposta de mentira: guarda o status e o corpo. */
function res() {
  const out = { status: 0, body: null as Record<string, unknown> | null, headersSent: false };
  return {
    res: {
      get headersSent() {
        return out.headersSent;
      },
      writeHead(code: number) {
        out.status = code;
        out.headersSent = true;
      },
      end(text?: string) {
        out.body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
      },
    } as unknown as ServerResponse,
    out,
  };
}

/** GBOT de mentira: a rota devolve o que o teste mandar. */
function gbotWith(routes: Record<string, { status?: number; body?: unknown }>) {
  const calls: { path: string; body: unknown; auth: string | null }[] = [];
  const http = (async (url: string | URL, init?: RequestInit) => {
    const path = String(url).replace('http://gbot.test', '');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null, auth: headers.Authorization ?? null });
    const r = routes[path] ?? { status: 404, body: { response: 'Not Found' } };
    const status = r.status ?? 200;
    return { ok: status < 400, status, text: async () => JSON.stringify(r.body ?? {}) } as Response;
  }) as unknown as typeof fetch;
  return { calls, gbot: new Gbot({ base: 'http://gbot.test', user: 'pokeru', pass: 'x', fetch: http }) };
}

const jwtOk = { verify: vi.fn(async (t: string) => ({ sub: '4', username: 'gabs', exp: 0, ...(t === 'sem-vinculo' ? {} : {}) })) } as unknown as JwtVerifier;

/** Contas de mentira: só o que o gateway usa. */
function accountsStub() {
  const links: (DiscordLink | null)[] = [];
  return {
    links,
    accounts: {
      setDiscordBySub: vi.fn(async (_sub: string, link: DiscordLink | null) => {
        links.push(link);
        return { pado: link ? 2785 : null } as never;
      }),
    } as unknown as Accounts,
  };
}

async function call(routes: Record<string, { status?: number; body?: unknown }>, method: string, path: string, body?: unknown, token = 'jwt') {
  const { gbot, calls } = gbotWith(routes);
  const stub = accountsStub();
  const handle = authRoutes({ gbot, jwt: jwtOk, accounts: stub.accounts });
  const { res: r, out } = res();
  const tratou = await handle(req(method, body, token), r, path);
  return { tratou, out, calls, links: stub.links };
}

describe('gateway: pedir o código do Discord', () => {
  it('sem sessão, não manda DM para ninguém', async () => {
    const { out } = await call({}, 'POST', '/auth/discord/code', { discordId: '343954786300854276' }, '');
    expect(out.status).toBe(401);
    expect(out.body?.error).toMatch(/entre na sua conta/);
  });

  it('id que o bot não conhece: explica, em vez de repetir "Not Found"', async () => {
    const { out } = await call({ '/auth': { status: 404, body: { response: 'Not Found' } } }, 'POST', '/auth/discord/code', { discordId: '000000000000000001' });
    expect(out.status).toBe(404);
    expect(out.body?.error).toMatch(/não conhece esse id/);
    expect(out.body?.error).toMatch(/servidor onde o bot está/);
    expect(out.body?.error).not.toMatch(/Not Found/);
  });

  it('id que não é número nem chega ao bot', async () => {
    const { out, calls } = await call({}, 'POST', '/auth/discord/code', { discordId: 'meu-nome#1234' });
    expect(out.status).toBe(400);
    expect(out.body?.error).toMatch(/só números/);
    expect(calls).toEqual([]);
  });

  it('id válido: pede o código ao bot', async () => {
    const { out, calls } = await call({ '/auth': { body: { ok: true } } }, 'POST', '/auth/discord/code', { discordId: '343954786300854276' });
    expect(out.status).toBe(200);
    expect(calls.find((c) => c.path === '/auth')?.body).toEqual({ id: '343954786300854276' });
  });
});

describe('gateway: concluir o vínculo', () => {
  const login = { '/login': { body: { token: 'servico', token_type: 'Bearer', expires_in: 3600, account: { id: 1, username: 'pokeru', discord_id: null } } } };

  it('código errado diz que é o código, e que dá para pedir outro', async () => {
    const { out } = await call({ ...login, '/accounts/link': { status: 400, body: { response: 'codigo invalido' } } }, 'POST', '/auth/discord/link', { code: 'xxxxx' });
    expect(out.status).toBe(400);
    expect(out.body?.error).toMatch(/código inválido ou expirado/);
    expect(out.body?.error).toMatch(/15 minutos/);
  });

  it('Discord já usado em outra conta: diz o que fazer', async () => {
    const { out } = await call({ ...login, '/accounts/link': { status: 409, body: { response: 'conflito' } } }, 'POST', '/auth/discord/link', { code: 'aB3xZ' });
    expect(out.status).toBe(409);
    expect(out.body?.error).toMatch(/já está em outra conta/);
    expect(out.body?.error).toMatch(/Desvincule/);
  });

  it('vínculo feito: anota na conta do jogo e devolve os padocoins', async () => {
    const { out, calls, links } = await call(
      { ...login, '/accounts/link': { body: { id: 4, username: 'gabs', discord_id: '343954786300854276' } } },
      'POST',
      '/auth/discord/link',
      { code: 'aB3xZ' },
    );
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ ok: true, discord: '343954786300854276', pado: 2785 });
    // o vínculo é anotado na hora: é o que faz a moeda aparecer sem precisar entrar de novo
    expect(links).toEqual([{ id: '343954786300854276', username: 'gabs', nickname: null }]);
    // e foi feito com o token do jogador, não com o do serviço
    expect(calls.find((c) => c.path === '/accounts/link')?.auth).toBe('Bearer jwt');
  });

  it('sem código não chama o bot', async () => {
    const { out, calls } = await call({}, 'POST', '/auth/discord/link', { code: '' });
    expect(out.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('desvincular limpa o vínculo no jogo também', async () => {
    const { out, links } = await call({ '/accounts/unlink': { body: { id: 4, username: 'gabs', discord_id: null } } }, 'POST', '/auth/discord/unlink');
    expect(out.status).toBe(200);
    expect(links).toEqual([null]);
  });
});

describe('gateway: as rotas de conta', () => {
  it('a mensagem do bot passa como está — é ela que o jogador precisa ler', async () => {
    const { out } = await call({ '/login': { status: 401, body: { response: 'usuario ou senha invalidos' } } }, 'POST', '/auth/login', { user: 'gabs', password: 'errada' });
    expect(out.status).toBe(401);
    expect(out.body?.error).toBe('usuario ou senha invalidos');
  });

  it('login devolve o token e o Discord da conta', async () => {
    const { out } = await call(
      { '/login': { body: { token: 'jwt.novo', token_type: 'Bearer', expires_in: 3600, account: { id: 4, username: 'gabs', discord_id: '123' } } } },
      'POST',
      '/auth/login',
      { user: 'gabs', password: 'senha-boa' },
    );
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ token: 'jwt.novo', user: 'gabs', discord: '123' });
  });

  it('cadastro cobra as regras antes de chamar o bot', async () => {
    const { out, calls } = await call({}, 'POST', '/auth/register', { user: 'ab', password: 'curta' });
    expect(out.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('rota que não existe é 404, e o que não é /auth passa adiante', async () => {
    const { out } = await call({}, 'GET', '/auth/inventada');
    expect(out.status).toBe(404);

    const { gbot } = gbotWith({});
    const handle = authRoutes({ gbot, jwt: jwtOk, accounts: null });
    const { res: r } = res();
    expect(await handle(req('GET'), r, '/health')).toBe(false);
  });
});
