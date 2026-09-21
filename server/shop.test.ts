import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AccountProfile, AuthIdentity } from '../shared/accounts';
import { Lobby } from '../shared/lobby';
import { DEFAULT_SETTINGS, type ServerMsg } from '../shared/protocol';
import { CHARACTER_PRESETS, DEFAULT_WIN_FX, findCharacter, BACK_PRESETS } from '../shared/styles';
import { priceOf } from '../shared/catalog';
import { Accounts } from './accounts';
import { Gbot, GbotError, type GbotMove, type GbotUser } from './gbot';

/**
 * A loja é do servidor. Estes testes cobram as duas coisas que o jogador não pode burlar:
 * **pagar** (fichas ou padocoins) e **usar** só o que é dele.
 */

const dirs: string[] = [];
function newFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pokeru-loja-'));
  dirs.push(dir);
  return join(dir, 'accounts.json');
}

const profile = (character = 'marina'): AccountProfile => ({
  name: 'Gabi',
  avatar: { color: '#fff', icon: '♠' },
  cosmetics: { back: BACK_PRESETS[1], character: findCharacter(character), winFx: DEFAULT_WIN_FX },
});

const identity: AuthIdentity = { sub: '42', username: 'gabi', discordId: '343954786300854276', nickname: 'Mogleo' };

/** GBOT de mentira: guarda o saldo em memória e conta as chamadas de débito. */
function fakeGbot(saldo = 1000) {
  const debits: { id: string; quantity: number; key: string | null }[] = [];
  let balance = saldo;
  const http = (async (url: string | URL, init?: RequestInit) => {
    const path = String(url).replace('http://gbot.test', '');
    const ok = (body: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) }) as Response;
    if (path === '/login') return ok({ token: 'servico.jwt', token_type: 'Bearer', expires_in: 3600, account: { id: 1, username: 'pokeru', discord_id: null } });
    if (path.startsWith('/user/')) {
      const user: GbotUser = { user_id: identity.discordId!, username: 'berlineta.', nickname: 'Mogleo', balance };
      return ok(user);
    }
    if (path === '/economy/debit') {
      const body = JSON.parse(String(init?.body)) as { id: string; quantity: number };
      const key = (init?.headers as Record<string, string>)['Idempotency-Key'] ?? null;
      debits.push({ id: body.id, quantity: body.quantity, key });
      if (balance < body.quantity) {
        return { ok: false, status: 409, text: async () => JSON.stringify({ response: 'saldo insuficiente' }) } as Response;
      }
      const before = balance;
      balance -= body.quantity;
      const move: GbotMove = { ok: true, user_id: body.id, before, after: balance };
      return ok(move);
    }
    return { ok: false, status: 404, text: async () => JSON.stringify({ response: 'rota desconhecida' }) } as Response;
  }) as unknown as typeof fetch;
  return {
    debits,
    get balance() {
      return balance;
    },
    gbot: new Gbot({ base: 'http://gbot.test', user: 'pokeru', pass: 'segredo', fetch: http }),
  };
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('loja: comprar com fichas', () => {
  it('desconta o preço e entrega o item', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 20_000 });
    const a = acc.login(undefined, profile())!;
    const preco = priceOf('character:ren', 'chips')!;

    expect(await acc.buy(a.id, 'character:ren', 'chips')).toBeNull();
    const depois = acc.info(a.id)!;
    expect(depois.money).toBe(20_000 - preco);
    expect(depois.owned).toContain('character:ren');
    acc.close();
  });

  it('sem saldo não compra, e nada é tocado', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 100 });
    const a = acc.login(undefined, profile())!;

    expect(await acc.buy(a.id, 'character:ren', 'chips')).toMatch(/faltam/);
    expect(acc.info(a.id)!.money).toBe(100);
    expect(acc.info(a.id)!.owned).toEqual([]);
    acc.close();
  });

  it('não vende duas vezes, nem o que já vem com o jogo, nem o que não existe', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 999_999 });
    const a = acc.login(undefined, profile())!;

    expect(await acc.buy(a.id, 'character:ren', 'chips')).toBeNull();
    expect(await acc.buy(a.id, 'character:ren', 'chips')).toMatch(/já tem/);
    expect(await acc.buy(a.id, 'character:marina', 'chips')).toMatch(/já vem com o jogo/);
    expect(await acc.buy(a.id, 'character:inventado', 'chips')).toMatch(/não existe/);
    // uma cobrança só, a da compra que valeu
    expect(acc.info(a.id)!.money).toBe(999_999 - priceOf('character:ren', 'chips')!);
    acc.close();
  });
});

describe('loja: comprar com padocoins', () => {
  it('sem Discord vinculado, a moeda não existe para a conta', async () => {
    const { gbot } = fakeGbot();
    const acc = new Accounts({ file: newFile(), startingMoney: 999_999, gbot });
    const a = acc.login(undefined, profile())!;

    expect(a.pado).toBeNull();
    expect(a.discord).toBeNull();
    expect(await acc.buy(a.id, 'character:ren', 'pado')).toMatch(/vincule o Discord/);
    acc.close();
  });

  it('com Discord vinculado, cobra no bot e entrega o item', async () => {
    const fake = fakeGbot(1000);
    const acc = new Accounts({ file: newFile(), startingMoney: 0, gbot: fake.gbot });
    const a = (await acc.loginAuth(identity, profile()))!;

    expect(a.discord?.id).toBe(identity.discordId);
    expect(a.pado).toBe(1000);

    const preco = priceOf('character:ren', 'pado')!;
    expect(await acc.buy(a.id, 'character:ren', 'pado')).toBeNull();

    expect(fake.debits).toHaveLength(1);
    expect(fake.debits[0]).toMatchObject({ id: identity.discordId, quantity: preco });
    // idempotência: a chave é fixa por conta+item, então um reenvio não cobra de novo
    expect(fake.debits[0].key).toBe(`pokeru:${a.id}:character:ren`);

    const depois = acc.info(a.id)!;
    expect(depois.owned).toContain('character:ren');
    expect(depois.pado).toBe(1000 - preco);
    // fichas não foram tocadas: quem pagou foi a outra moeda
    expect(depois.money).toBe(0);
    acc.close();
  });

  it('padocoins insuficientes: o bot recusa e o item não é entregue', async () => {
    const fake = fakeGbot(10);
    const acc = new Accounts({ file: newFile(), gbot: fake.gbot });
    const a = (await acc.loginAuth(identity, profile()))!;

    expect(await acc.buy(a.id, 'character:ren', 'pado')).toMatch(/insuficientes/);
    expect(acc.info(a.id)!.owned).toEqual([]);
    acc.close();
  });

  it('servidor sem conta de serviço não cobra padocoins', async () => {
    const semServico = new Gbot({ base: 'http://gbot.test', fetch: (async () => ({ ok: true, status: 200, text: async () => '{}' }) as Response) as unknown as typeof fetch });
    const acc = new Accounts({ file: newFile(), gbot: semServico });
    const a = (await acc.loginAuth(identity, profile()))!;

    expect(await acc.buy(a.id, 'character:ren', 'pado')).toMatch(/não está ligado/);
    acc.close();
  });

  it('bot fora do ar não impede de entrar — só não mostra o saldo', async () => {
    const fora = new Gbot({
      base: 'http://gbot.test',
      user: 'pokeru',
      pass: 'x',
      fetch: (async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch,
    });
    const acc = new Accounts({ file: newFile(), gbot: fora });
    const a = (await acc.loginAuth(identity, profile()))!;

    expect(a.discord?.id).toBe(identity.discordId);
    expect(a.pado).toBeNull();
    acc.close();
  });
});

describe('conta com login (JWT)', () => {
  it('a mesma identidade volta para a mesma conta, em qualquer aparelho', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 20_000 });
    const primeira = (await acc.loginAuth({ sub: '7', username: 'gabi' }, profile()))!;
    await acc.buy(primeira.id, 'character:ren', 'chips');

    const segunda = (await acc.loginAuth({ sub: '7', username: 'gabi' }, profile()))!;
    expect(segunda.id).toBe(primeira.id);
    expect(segunda.owned).toContain('character:ren');
    // e não vira a conta de outra pessoa
    const outra = (await acc.loginAuth({ sub: '8', username: 'outro' }, profile()))!;
    expect(outra.id).not.toBe(primeira.id);
    expect(outra.owned).toEqual([]);
    acc.close();
  });

  it('o vínculo do Discord vem das claims, não do cliente', async () => {
    const fake = fakeGbot(500);
    const acc = new Accounts({ file: newFile(), gbot: fake.gbot });
    const com = (await acc.loginAuth(identity, profile()))!;
    expect(com.discord?.id).toBe(identity.discordId);

    // entrou de novo com um token sem vínculo: a conta perde o Discord (e a moeda)
    const sem = (await acc.loginAuth({ sub: identity.sub, username: identity.username }, profile()))!;
    expect(sem.id).toBe(com.id);
    expect(sem.discord).toBeNull();
    expect(sem.pado).toBeNull();
    acc.close();
  });

  it('o vínculo feito pelo gateway aparece na hora, sem entrar de novo', async () => {
    const fake = fakeGbot(777);
    const acc = new Accounts({ file: newFile(), gbot: fake.gbot });
    const a = (await acc.loginAuth({ sub: '9', username: 'gabi' }, profile()))!;
    expect(a.pado).toBeNull();

    const depois = await acc.setDiscordBySub('9', { id: identity.discordId!, username: 'gabi', nickname: null });
    expect(depois?.discord?.id).toBe(identity.discordId);
    expect(depois?.pado).toBe(777);

    await acc.setDiscordBySub('9', null);
    expect(acc.info(a.id)!.discord).toBeNull();
    expect(acc.info(a.id)!.pado).toBeNull();
    acc.close();
  });
});

describe('server authoritative: ninguém senta com o que não tem', () => {
  /** Um cliente ligado num lobby com contas, guardando o que recebeu. */
  function client(lobby: Lobby, cosmetics: unknown, jwt?: string) {
    const got: ServerMsg[] = [];
    const conn = lobby.connect((m) => void got.push(m));
    conn.handle({ type: 'hello', name: 'Gabi', avatar: { color: '#fff', icon: '♠' }, cosmetics, jwt });
    const last = <T extends ServerMsg['type']>(type: T) => [...got].reverse().find((m) => m.type === type) as Extract<ServerMsg, { type: T }> | undefined;
    return { conn, got, last };
  }

  it('personagem não comprado cai para o gratuito na mesa', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 999_999 });
    const lobby = new Lobby('Teste', acc);
    const c = client(lobby, { character: { id: 'yukina' }, back: BACK_PRESETS[1], winFx: 'fire' });

    c.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS } });
    const eu = c.last('room')!.room.members[0];
    // pediu Yukina e o efeito de fogo; nenhum dos dois é dele
    expect(eu.character.id).toBe('marina');
    acc.close();
  });

  it('depois de comprar, o mesmo personagem vale — sem reconectar', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 999_999 });
    const lobby = new Lobby('Teste', acc);
    const c = client(lobby, { character: { id: 'yukina' }, back: BACK_PRESETS[1], winFx: 'gold' });
    c.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS } });
    expect(c.last('room')!.room.members[0].character.id).toBe('marina');

    c.conn.handle({ type: 'buy', item: 'character:yukina', currency: 'chips' });
    // a compra é assíncrona (pode ser ida à rede, no caso dos padocoins)
    await vi.waitFor(() => expect(c.last('bought')).toBeTruthy());

    expect(c.last('room')!.room.members[0].character.id).toBe('yukina');
    acc.close();
  });

  it('a loja recusa quem não tem conta no servidor', () => {
    const lobby = new Lobby('Teste', null);
    const c = client(lobby, { character: { id: 'marina' } });
    c.conn.handle({ type: 'buy', item: 'character:ren', currency: 'chips' });
    expect(c.last('error')!.message).toMatch(/precisa de uma conta/);
  });

  it('um verso do Estúdio vale pela peça de onde saiu', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 999_999 });
    const lobby = new Lobby('Teste', acc);
    // um verso personalizado feito a partir de um preset que o jogador NÃO tem
    const pirata = { ...BACK_PRESETS[2], id: 'back-meu', from: 'back-crimson' };
    const c = client(lobby, { character: { id: 'marina' }, back: pirata, winFx: 'gold' });
    c.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS } });
    expect(c.last('room')!.room.members[0].character.id).toBe('marina');

    // compra a peça de origem e o verso personalizado passa a valer
    c.conn.handle({ type: 'buy', item: 'back:back-crimson', currency: 'chips' });
    await vi.waitFor(() => expect(c.last('bought')).toBeTruthy());
    acc.close();
  });

  it('no modo offline (sem contas) nada é cortado: o perfil vale como está', () => {
    const lobby = new Lobby('Modo Offline', null);
    const c = client(lobby, { character: { id: 'yukina' }, back: BACK_PRESETS[1], winFx: 'fire' });
    c.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS } });
    expect(c.last('room')!.room.members[0].character.id).toBe('yukina');
  });
});

describe('erro do GBOT', () => {
  it('carrega o status e a mensagem em português', () => {
    const err = new GbotError(409, 'saldo insuficiente');
    expect(err.status).toBe(409);
    expect(err.message).toBe('saldo insuficiente');
  });

  it('o catálogo de personagens do jogo é o que a loja vende', () => {
    expect(CHARACTER_PRESETS.map((c) => c.id).sort()).toEqual(['marina', 'ren', 'tobi', 'yukina']);
  });
});
