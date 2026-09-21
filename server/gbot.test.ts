import { describe, expect, it } from 'vitest';
import { Gbot, GbotError } from './gbot';

/**
 * O cliente da API do bot, contra os formatos **que o servidor devolve de verdade**.
 *
 * Foi aqui que escapou o bug que deixou o jogador com "saldo indisponível" depois de vincular o
 * Discord: a documentação mostra o usuário da economia como objeto solto, e o servidor responde
 * `{"user": {…}}`. Ler o campo errado não dá erro nenhum — vem `undefined`, atravessa o código e
 * aparece três telas depois como uma moeda que não existe. Por isso estes testes usam as respostas
 * copiadas da instância real, nas duas formas.
 */

/** Respostas reais, copiadas do bot em 21/09/2026. */
const REAL = {
  user: { user: { user_id: '295369928049950720', username: 'gabss2', nickname: 'Mogab', balance: 4989.31, puuid: null } },
  me: { account: { id: 3, username: 'pokeru-server', discord_id: null, created_at: '2026-09-21T13:59:38Z', linked_at: null } },
  login: { ok: true, token: 'jwt.servico', token_type: 'Bearer', expires_in: 3600, account: { id: 3, username: 'pokeru-server', discord_id: null } },
};

function bot(routes: Record<string, { status?: number; body?: unknown }>) {
  const calls: string[] = [];
  const http = (async (url: string | URL) => {
    const path = String(url).replace('http://gbot.test', '');
    calls.push(path);
    const r = routes[path] ?? { status: 404, body: { response: 'Not Found' } };
    const status = r.status ?? 200;
    return { ok: status < 400, status, text: async () => JSON.stringify(r.body ?? {}) } as Response;
  }) as unknown as typeof fetch;
  return { calls, gbot: new Gbot({ base: 'http://gbot.test', user: 'pokeru', pass: 'x', fetch: http }) };
}

describe('leitura do usuário da economia', () => {
  it('entende a resposta embrulhada, que é a que o bot manda', async () => {
    const { gbot } = bot({ '/login': { body: REAL.login }, '/user/295369928049950720': { body: REAL.user } });
    const u = await gbot.user('295369928049950720');
    expect(u).toEqual({ user_id: '295369928049950720', username: 'gabss2', nickname: 'Mogab', balance: 4989.31 });
  });

  it('entende também a forma solta, que é a que a documentação mostra', async () => {
    const solto = { user_id: '1', username: 'alguem', nickname: null, balance: 10.5, puuid: null };
    const { gbot } = bot({ '/login': { body: REAL.login }, '/user/1': { body: solto } });
    expect((await gbot.user('1'))?.balance).toBe(10.5);
  });

  it('não repassa o puuid: é dado pessoal e não tem uso aqui', async () => {
    const { gbot } = bot({ '/login': { body: REAL.login }, '/user/1': { body: { user: { user_id: '1', username: 'x', balance: 1, puuid: 'riot-abc' } } } });
    expect(JSON.stringify(await gbot.user('1'))).not.toContain('riot-abc');
  });

  it('quem não existe na economia é null, não erro', async () => {
    const { gbot } = bot({ '/login': { body: REAL.login }, '/user/9': { status: 404, body: { response: 'Not Found' } } });
    expect(await gbot.user('9')).toBeNull();
  });

  it('saldo que não é número é erro, não um vazio silencioso', async () => {
    const { gbot } = bot({ '/login': { body: REAL.login }, '/user/1': { body: { user: { user_id: '1', username: 'x' } } } });
    await expect(gbot.user('1')).rejects.toThrow(/não é número/);
  });

  it('dá para achar pelo nome do Discord também', async () => {
    const { gbot } = bot({ '/login': { body: REAL.login }, '/user/username/gabss2': { body: REAL.user } });
    expect((await gbot.userByName('gabss2'))?.balance).toBe(4989.31);
  });
});

describe('a conta de quem está com o token', () => {
  it('entende `{account: …}` — é por aqui que se confirma um vínculo feito após o login', async () => {
    const { gbot } = bot({ '/me': { body: REAL.me } });
    const me = await gbot.me('jwt');
    expect(me.username).toBe('pokeru-server');
    expect(me.discord_id).toBeNull();
  });

  it('com vínculo, devolve o id do Discord', async () => {
    const { gbot } = bot({ '/me': { body: { account: { id: 4, username: 'gabs', discord_id: '295369928049950720' } } } });
    expect((await gbot.me('jwt')).discord_id).toBe('295369928049950720');
  });

  it('e a forma solta também passa', async () => {
    const { gbot } = bot({ '/me': { body: { id: 4, username: 'gabs', discord_id: '123' } } });
    expect((await gbot.me('jwt')).discord_id).toBe('123');
  });
});

describe('vínculo', () => {
  it('lê o discord_id nas duas formas', async () => {
    const embrulhado = bot({ '/accounts/link': { body: { account: { id: 4, username: 'gabs', discord_id: '295369928049950720' } } } });
    expect((await embrulhado.gbot.link('jwt', 'aB3xZ')).discord_id).toBe('295369928049950720');

    const solto = bot({ '/accounts/link': { body: { id: 4, username: 'gabs', discord_id: '295369928049950720' } } });
    expect((await solto.gbot.link('jwt', 'aB3xZ')).discord_id).toBe('295369928049950720');
  });
});

describe('mover padocoins', () => {
  it('devolve o saldo depois, quando a resposta tem o formato esperado', async () => {
    const { gbot } = bot({ '/login': { body: REAL.login }, '/economy/debit': { body: { ok: true, user_id: '1', before: 100, after: 40 } } });
    const m = await gbot.debit('1', 60, 'loja');
    expect(m).toMatchObject({ user_id: '1', before: 100, after: 40 });
  });

  it('formato inesperado: relê o saldo em vez de devolver undefined', async () => {
    const { gbot, calls } = bot({
      '/login': { body: REAL.login },
      // resposta sem `after` reconhecível — o movimento aconteceu, o formato é que não bate
      '/economy/debit': { body: { ok: true } },
      '/user/295369928049950720': { body: { user: { user_id: '295369928049950720', username: 'gabss2', nickname: 'Mogab', balance: 4929.31 } } },
    });
    const m = await gbot.debit('295369928049950720', 60, 'loja');
    expect(m.after).toBe(4929.31);
    expect(m.before).toBe(4989.31);
    expect(calls).toContain('/user/295369928049950720');
  });

  it('saldo insuficiente continua sendo 409', async () => {
    const { gbot } = bot({ '/login': { body: REAL.login }, '/economy/debit': { status: 409, body: { response: 'saldo insuficiente' } } });
    await expect(gbot.debit('1', 999, 'loja')).rejects.toThrow(GbotError);
  });
});
