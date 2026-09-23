import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AccountProfile, AuthIdentity } from '../shared/accounts';
import { Lobby } from '../shared/lobby';
import { DEFAULT_SETTINGS, type ServerMsg } from '../shared/protocol';
import {
  BACK_PRESETS,
  CHARACTER_PRESETS,
  CHIP_PRESETS,
  DEFAULT_WIN_FX,
  FACE_PRESETS,
  TABLE_PRESETS,
  findCharacter,
} from '../shared/styles';
import { priceOf } from '../shared/catalog';
import { ROULETTES, dropsOf, findRoulette, refundOf, ticketPrice } from '../shared/roulette';
import { bondCap, giftPoints } from '../shared/bond';
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
  cosmetics: {
    face: FACE_PRESETS[0],
    back: BACK_PRESETS[1],
    chip: CHIP_PRESETS[0],
    table: TABLE_PRESETS[0],
    character: findCharacter(character),
    winFx: DEFAULT_WIN_FX,
  },
});

const identity: AuthIdentity = { sub: '42', username: 'gabi', discordId: '343954786300854276', nickname: 'Mogleo' };

/**
 * GBOT de mentira: guarda o saldo em memória, conta os débitos e responde `/me` — que é como o
 * servidor confirma um vínculo feito depois de o token ser emitido.
 *
 * `linked` é o que o serviço diz sobre o vínculo (null = não há) e `down` finge o bot fora do ar.
 */
function fakeGbot(saldo = 1000) {
  const debits: { id: string; quantity: number; key: string | null }[] = [];
  let balance = saldo;
  const state = { linked: null as string | null, down: false };
  const http = (async (url: string | URL, init?: RequestInit) => {
    if (state.down) throw new Error('ECONNREFUSED');
    const path = String(url).replace('http://gbot.test', '');
    const ok = (body: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) }) as Response;
    if (path === '/me') return ok({ id: 4, username: 'gabs', discord_id: state.linked });
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
    /** O que o serviço responde em `/me` sobre o vínculo. */
    set linked(id: string | null) {
      state.linked = id;
    },
    set down(v: boolean) {
      state.down = v;
    },
    gbot: new Gbot({ base: 'http://gbot.test', user: 'pokeru', pass: 'segredo', fetch: http }),
  };
}

/**
 * O número de sorteio que cai exatamente neste prêmio.
 *
 * A tabela da roleta é pública e determinística (shared/roulette.ts), então dá para apontar o meio
 * da fatia de um prêmio e exigir que o servidor entregue aquele. É o que torna o sorteio
 * conferível em teste sem abrir mão de `crypto` em produção.
 */
function rndPara(roleta: string, key: string): number {
  const r = findRoulette(roleta)!;
  const drops = dropsOf(r);
  const total = drops.reduce((t, d) => t + d.weight, 0);
  let antes = 0;
  for (const d of drops) {
    if (d.key === key) return (antes + d.weight / 2) / total;
    antes += d.weight;
  }
  throw new Error(`${key} não está na ${roleta}`);
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('loja: comprar com fichas', () => {
  it('desconta o preço e entrega o item', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 20_000 });
    const a = acc.login(undefined, profile())!;
    const preco = priceOf('ui:victorian', 'chips')!;

    expect(await acc.buy(a.id, 'ui:victorian', 'chips')).toBeNull();
    const depois = acc.info(a.id)!;
    expect(depois.money).toBe(20_000 - preco);
    expect(depois.owned).toContain('ui:victorian');
    acc.close();
  });

  it('sem saldo não compra, e nada é tocado', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 100 });
    const a = acc.login(undefined, profile())!;

    expect(await acc.buy(a.id, 'ui:victorian', 'chips')).toMatch(/faltam/);
    expect(acc.info(a.id)!.money).toBe(100);
    expect(acc.info(a.id)!.owned).toEqual([]);
    acc.close();
  });

  it('não vende duas vezes, nem o que já vem com o jogo, nem o que não existe', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 999_999 });
    const a = acc.login(undefined, profile())!;

    expect(await acc.buy(a.id, 'ui:victorian', 'chips')).toBeNull();
    expect(await acc.buy(a.id, 'ui:victorian', 'chips')).toMatch(/já tem/);
    expect(await acc.buy(a.id, 'character:marina', 'chips')).toMatch(/já vem com o jogo/);
    expect(await acc.buy(a.id, 'character:inventado', 'chips')).toMatch(/não existe/);
    // uma cobrança só, a da compra que valeu
    expect(acc.info(a.id)!.money).toBe(999_999 - priceOf('ui:victorian', 'chips')!);
    acc.close();
  });

  /**
   * A regra nova da loja: cosmético não se compra.
   *
   * Personagem, carta, ficha, mesa e efeito saem de roleta. Quem recusa é o servidor — é o que
   * impede um cliente modificado de comprar um personagem por fora da sorte.
   */
  it('a galeria não está à venda: cosmético sai de roleta', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 999_999 });
    const a = acc.login(undefined, profile())!;

    for (const key of ['character:yukina', 'back:back-royal', 'chip:chip-neon', 'table:table-wine', 'winfx:fire', 'face:face-jade']) {
      expect(await acc.buy(a.id, key, 'chips'), key).toMatch(/sai de roleta/);
    }
    expect(acc.info(a.id)!.money).toBe(999_999);
    expect(acc.info(a.id)!.owned).toEqual([]);
    acc.close();
  });

  it('presente é contável: comprar de novo aumenta o estoque', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 999_999 });
    const a = acc.login(undefined, profile())!;
    const preco = priceOf('gift:flor', 'chips')!;

    expect(await acc.buy(a.id, 'gift:flor', 'chips')).toBeNull();
    expect(await acc.buy(a.id, 'gift:flor', 'chips')).toBeNull();
    const depois = acc.info(a.id)!;
    expect(depois.gifts.flor).toBe(2);
    expect(depois.money).toBe(999_999 - preco * 2);
    // e presente não entra na lista de posse: quem conta é o estoque
    expect(depois.owned).toEqual([]);
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
    expect(await acc.buy(a.id, 'ui:victorian', 'pado')).toMatch(/vincule o Discord/);
    acc.close();
  });

  it('com Discord vinculado, cobra no bot e entrega o item', async () => {
    const saldo = 50_000; // padocoin é dinheiro de verdade: o preço é alto, o saldo do teste também
    const fake = fakeGbot(saldo);
    const acc = new Accounts({ file: newFile(), startingMoney: 0, gbot: fake.gbot });
    const a = (await acc.loginAuth(identity, profile()))!;

    expect(a.discord?.id).toBe(identity.discordId);
    expect(a.pado).toBe(saldo);

    const preco = priceOf('ui:victorian', 'pado')!;
    expect(await acc.buy(a.id, 'ui:victorian', 'pado')).toBeNull();

    expect(fake.debits).toHaveLength(1);
    expect(fake.debits[0]).toMatchObject({ id: identity.discordId, quantity: preco });
    // idempotência: a chave é fixa por conta+item, então um reenvio não cobra de novo
    expect(fake.debits[0].key).toBe(`pokeru:${a.id}:ui:victorian`);

    const depois = acc.info(a.id)!;
    expect(depois.owned).toContain('ui:victorian');
    expect(depois.pado).toBe(saldo - preco);
    // fichas não foram tocadas: quem pagou foi a outra moeda
    expect(depois.money).toBe(0);
    acc.close();
  });

  it('padocoins insuficientes: o bot recusa e o item não é entregue', async () => {
    const fake = fakeGbot(10);
    const acc = new Accounts({ file: newFile(), gbot: fake.gbot });
    const a = (await acc.loginAuth(identity, profile()))!;

    expect(await acc.buy(a.id, 'ui:victorian', 'pado')).toMatch(/insuficientes/);
    expect(acc.info(a.id)!.owned).toEqual([]);
    acc.close();
  });

  it('servidor sem conta de serviço não cobra padocoins', async () => {
    const semServico = new Gbot({ base: 'http://gbot.test', fetch: (async () => ({ ok: true, status: 200, text: async () => '{}' }) as Response) as unknown as typeof fetch });
    const acc = new Accounts({ file: newFile(), gbot: semServico });
    const a = (await acc.loginAuth(identity, profile()))!;

    expect(await acc.buy(a.id, 'ui:victorian', 'pado')).toMatch(/não está ligado/);
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
    await acc.buy(primeira.id, 'ui:victorian', 'chips');

    const segunda = (await acc.loginAuth({ sub: '7', username: 'gabi' }, profile()))!;
    expect(segunda.id).toBe(primeira.id);
    expect(segunda.owned).toContain('ui:victorian');
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
    expect(com.pado).toBe(500);

    // e o cliente não tem como inventar um: o que ele manda no hello é perfil, não identidade
    const outro = (await acc.loginAuth({ sub: '99', username: 'outro', token: 'jwt' }, profile()))!;
    expect(outro.discord).toBeNull();
    expect(outro.pado).toBeNull();
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

  it('depois de ganhar na roleta, o mesmo personagem vale — sem reconectar', async () => {
    // a roleta cai em Yukina: o prêmio é do servidor, e o teste fixa o número do sorteio
    const acc = new Accounts({ file: newFile(), startingMoney: 999_999, rnd: () => rndPara('flores', 'character:yukina') });
    const lobby = new Lobby('Teste', acc);
    const c = client(lobby, { character: { id: 'yukina' }, back: BACK_PRESETS[1], winFx: 'gold' });
    c.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS } });
    expect(c.last('room')!.room.members[0].character.id).toBe('marina');

    c.conn.handle({ type: 'spin', roulette: 'flores', currency: 'chips' });
    // o giro é assíncrono (pode ser ida à rede, no caso dos padocoins)
    await vi.waitFor(() => expect(c.last('spun')).toBeTruthy());

    expect(c.last('spun')!.prize).toBe('character:yukina');
    expect(c.last('room')!.room.members[0].character.id).toBe('yukina');
    acc.close();
  });

  it('a loja recusa quem não tem conta no servidor', () => {
    const lobby = new Lobby('Teste', null);
    const c = client(lobby, { character: { id: 'marina' } });
    c.conn.handle({ type: 'buy', item: 'ui:victorian', currency: 'chips' });
    expect(c.last('error')!.message).toMatch(/precisa de uma conta/);
  });

  it('um verso do Estúdio vale pela peça de onde saiu', async () => {
    // a peça de origem sai de roleta: o sorteio é fixado para cair nela
    const acc = new Accounts({ file: newFile(), startingMoney: 999_999, rnd: () => rndPara('flores', 'back:back-crimson') });
    const lobby = new Lobby('Teste', acc);
    // um verso personalizado feito a partir de um preset que o jogador NÃO tem
    const pirata = { ...BACK_PRESETS[2], id: 'back-meu', from: 'back-crimson' };
    const c = client(lobby, { character: { id: 'marina' }, back: pirata, winFx: 'gold' });
    c.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS } });
    expect(c.last('room')!.room.members[0].character.id).toBe('marina');

    // ganha a peça de origem e o verso personalizado passa a valer
    c.conn.handle({ type: 'spin', roulette: 'flores', currency: 'chips' });
    await vi.waitFor(() => expect(c.last('spun')).toBeTruthy());
    expect(c.last('spun')!.prize).toBe('back:back-crimson');
    acc.close();
  });

  it('o cliente dá um presente pelo lobby e recebe os pontos', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 100_000 });
    const lobby = new Lobby('Teste', acc);
    const c = client(lobby, { character: { id: 'yukina' } });
    const id = c.last('account')!.account.id;
    await acc.buy(id, 'gift:flor', 'chips');

    c.conn.handle({ type: 'giveGift', character: 'yukina', gift: 'flor' });
    expect(c.last('gifted')).toEqual({ type: 'gifted', character: 'yukina', gift: 'flor', points: giftPoints('yukina', 'flor') });
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

/**
 * O vínculo do Discord depois do login — o caso que apareceu no primeiro teste com gente de
 * verdade. Não há refresh token: o JWT vale uma hora e é assinado **antes** do vínculo, então a
 * claim `discord_id` não existe nele. Se a entrada seguinte acreditasse só nas claims, ela apagaria
 * um vínculo que existe — e os padocoins desapareceriam.
 */
describe('vínculo feito depois do token ser emitido', () => {
  it('a entrada seguinte, com o JWT antigo, não apaga o vínculo', async () => {
    const fake = fakeGbot(2785);
    const acc = new Accounts({ file: newFile(), gbot: fake.gbot });

    // 1. entra: o JWT é de antes do vínculo, então não traz discord_id
    const antes = (await acc.loginAuth({ sub: '4', username: 'gabs' }, profile()))!;
    expect(antes.discord).toBeNull();
    expect(antes.pado).toBeNull();

    // 2. vincula pelo gateway (é o que o bot confirma) — daí os padocoins aparecem
    const vinculado = await acc.setDiscordBySub('4', { id: identity.discordId!, username: 'gabs', nickname: null });
    expect(vinculado?.discord?.id).toBe(identity.discordId);
    expect(vinculado?.pado).toBe(2785);

    // 3. reabre o jogo com o MESMO token de antes: o vínculo tem de continuar lá
    fake.linked = identity.discordId!;
    const depois = (await acc.loginAuth({ sub: '4', username: 'gabs', token: 'jwt.antigo' }, profile()))!;
    expect(depois.discord?.id).toBe(identity.discordId);
    expect(depois.pado).toBe(2785);
    acc.close();
  });

  it('se o serviço disser que não há vínculo, aí sim o jogo esquece', async () => {
    const fake = fakeGbot(500);
    const acc = new Accounts({ file: newFile(), gbot: fake.gbot });
    const a = (await acc.loginAuth({ sub: '4', username: 'gabs' }, profile()))!;
    await acc.setDiscordBySub('4', { id: identity.discordId!, username: 'gabs', nickname: null });
    expect(acc.info(a.id)!.discord).not.toBeNull();

    // desvinculou (pelo jogo ou pelo próprio bot): a resposta de /me manda
    fake.linked = null;
    const depois = (await acc.loginAuth({ sub: '4', username: 'gabs', token: 'jwt.sem.vinculo' }, profile()))!;
    expect(depois.discord).toBeNull();
    expect(depois.pado).toBeNull();
    acc.close();
  });

  it('serviço fora do ar não apaga o vínculo guardado', async () => {
    const fake = fakeGbot(500);
    const acc = new Accounts({ file: newFile(), gbot: fake.gbot });
    const a = (await acc.loginAuth({ sub: '4', username: 'gabs' }, profile()))!;
    await acc.setDiscordBySub('4', { id: identity.discordId!, username: 'gabs', nickname: null });

    fake.down = true;
    const depois = (await acc.loginAuth({ sub: '4', username: 'gabs', token: 'jwt' }, profile()))!;
    expect(depois.discord?.id).toBe(identity.discordId);
    expect(acc.info(a.id)!.discord).not.toBeNull();
    acc.close();
  });
});

/**
 * Sessão de duas semanas.
 *
 * O JWT do serviço de contas vale uma hora e não tem refresh, então ele não serve para "continuar
 * logado" — sem uma chave nossa, o jogador digitaria a senha a cada hora. A chave de volta é
 * revogável e, ao contrário de guardar a senha, um vazamento dela não abre a conta do serviço.
 */
describe('sessão guardada no aparelho', () => {
  it('entrar com senha devolve uma chave de volta com duas semanas', async () => {
    const acc = new Accounts({ file: newFile() });
    const a = (await acc.loginAuth({ sub: '4', username: 'gabs' }, profile()))!;

    expect(a.token).toBeTruthy();
    const dias = (Date.parse(a.tokenUntil!) - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(13.9);
    expect(dias).toBeLessThan(14.1);
    acc.close();
  });

  it('a chave de volta traz a conta inteira, sem o JWT', async () => {
    const fake = fakeGbot(2785);
    const acc = new Accounts({ file: newFile(), startingMoney: 20_000, gbot: fake.gbot });
    const entrada = (await acc.loginAuth(identity, profile()))!;
    await acc.buy(entrada.id, 'ui:victorian', 'chips');

    // uma hora depois: o JWT venceu e o cliente manda só a chave de volta
    const volta = acc.login({ id: entrada.id, token: entrada.token! }, profile())!;
    expect(volta.id).toBe(entrada.id);
    expect(volta.user).toBe(identity.username);
    expect(volta.owned).toContain('ui:victorian');
    // e o vínculo do Discord continua lá, com o saldo
    expect(volta.discord?.id).toBe(identity.discordId);
    expect(volta.pado).toBe(2785);
    acc.close();
  });

  it('chave errada não entra na conta de ninguém', async () => {
    const acc = new Accounts({ file: newFile() });
    const a = (await acc.loginAuth({ sub: '4', username: 'gabs' }, profile()))!;

    // com login, uma chave que não bate não cria conta nova nem devolve a existente
    expect(acc.login({ id: a.id, token: 'chave-inventada' }, profile())).toBeNull();
    acc.close();
  });

  it('chave vencida não vale mais', async () => {
    const acc = new Accounts({ file: newFile() });
    const a = (await acc.loginAuth({ sub: '4', username: 'gabs' }, profile()))!;
    // envelhece a chave na marra, como o tempo faria
    acc.expireSessionForTests(a.id);

    expect(acc.login({ id: a.id, token: a.token! }, profile())).toBeNull();
    acc.close();
  });

  it('cada entrada com senha renova as duas semanas', async () => {
    const acc = new Accounts({ file: newFile() });
    const primeira = (await acc.loginAuth({ sub: '4', username: 'gabs' }, profile()))!;
    const segunda = (await acc.loginAuth({ sub: '4', username: 'gabs' }, profile()))!;

    expect(segunda.id).toBe(primeira.id);
    // chave nova a cada entrada: a antiga deixa de valer
    expect(segunda.token).not.toBe(primeira.token);
    expect(acc.login({ id: primeira.id, token: primeira.token! }, profile())).toBeNull();
    expect(acc.login({ id: segunda.id, token: segunda.token! }, profile())).toBeTruthy();
    acc.close();
  });

  it('o saldo de padocoins volta com a sessão guardada', async () => {
    // Este é o buraco que a sessão de duas semanas abriu: quem lia o saldo era o login com senha,
    // e ele passou a acontecer uma vez a cada duas semanas. O saldo mora no bot e não é guardado
    // em disco de propósito, então todo reinício do servidor o deixava vazio até a próxima senha.
    const file = newFile();
    const g = fakeGbot(777);
    const antes = new Accounts({ file, gbot: g.gbot });
    const entrada = (await antes.loginAuth(identity, profile()))!;
    expect(entrada.pado).toBe(777);
    antes.close();

    // servidor reiniciado: mesma conta em disco, memória zerada
    const depois = new Accounts({ file, gbot: g.gbot });
    expect(depois.info(entrada.id)!.pado).toBeNull();

    const lobby = new Lobby('Teste', depois);
    const got: ServerMsg[] = [];
    const conn = lobby.connect((m) => void got.push(m));
    conn.handle({
      type: 'hello',
      name: 'Gabi',
      avatar: { color: '#fff', icon: '♠' },
      cosmetics: profile().cosmetics,
      account: { id: entrada.id, token: entrada.token! },
    });

    // a entrada não espera pela rede: o número chega logo atrás, noutro `account`
    await vi.waitFor(() => {
      const contas = got.filter((m) => m.type === 'account') as Extract<ServerMsg, { type: 'account' }>[];
      expect(contas.at(-1)!.account.pado).toBe(777);
    });
    depois.close();
  });

  it('conta sem login continua voltando pela chave, como antes', () => {
    const acc = new Accounts({ file: newFile() });
    const a = acc.login(undefined, profile())!;
    const volta = acc.login({ id: a.id, token: a.token! }, profile())!;
    expect(volta.id).toBe(a.id);
    acc.close();
  });
});

describe('títulos: quem valida é o servidor', () => {
  /** Um cliente ligado no lobby, guardando o que recebeu. */
  function client(lobby: Lobby) {
    const got: ServerMsg[] = [];
    const conn = lobby.connect((m) => void got.push(m));
    conn.handle({ type: 'hello', name: 'Gabi', avatar: { color: '#fff', icon: '♠' }, cosmetics: profile().cosmetics });
    const last = <T extends ServerMsg['type']>(type: T) => [...got].reverse().find((m) => m.type === type) as Extract<ServerMsg, { type: T }> | undefined;
    return { conn, last };
  }

  it('título que a conta não liberou não chega à mesa', () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 999_999 });
    const lobby = new Lobby('Teste', acc);
    const c = client(lobby);
    c.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS } });
    const id = c.conn.accountId!;

    // conta nova não tem conquista nenhuma: o pedido é recusado em silêncio
    c.conn.handle({ type: 'setTitle', title: 'Tubarão' });
    expect(c.last('room')!.room.members[0].title).toBeNull();
    expect(acc.info(id)!.title).toBeNull();

    // uma mão jogada libera 'Novato da Mesa' — esse o servidor aceita
    acc.note(id, 'hands');
    c.conn.handle({ type: 'setTitle', title: 'Novato da Mesa' });
    expect(c.last('room')!.room.members[0].title).toBe('Novato da Mesa');
    expect(acc.info(id)!.title).toBe('Novato da Mesa');
    acc.close();
  });

  it('o título volta com a conta na próxima entrada', () => {
    const acc = new Accounts({ file: newFile() });
    const a = acc.login(undefined, profile())!;
    acc.note(a.id, 'hands');
    acc.setTitle(a.id, 'Novato da Mesa');

    const lobby = new Lobby('Teste', acc);
    const got: ServerMsg[] = [];
    const conn = lobby.connect((m) => void got.push(m));
    conn.handle({ type: 'hello', name: 'Gabi', avatar: { color: '#fff', icon: '♠' }, cosmetics: profile().cosmetics, account: { id: a.id, token: a.token! } });
    conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS } });
    const sala = [...got].reverse().find((m) => m.type === 'room') as Extract<ServerMsg, { type: 'room' }>;
    expect(sala.room.members[0].title).toBe('Novato da Mesa');
    acc.close();
  });

  it('sem conta no servidor não há título', () => {
    const lobby = new Lobby('Modo Offline', null);
    const c = client(lobby);
    c.conn.handle({ type: 'setTitle', title: 'Tubarão' });
    expect(c.last('error')!.message).toMatch(/precisam de uma conta/);
  });
});

/**
 * As roletas.
 *
 * O que importa provar: o ticket sai do saldo, o prêmio é do servidor, o repetido vira fichas e o
 * presente sorteado entra no estoque em vez de virar posse.
 */
describe('roleta', () => {
  it('cobra o ticket e entrega o prêmio', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 10_000, rnd: () => rndPara('flores', 'character:yukina') });
    const a = acc.login(undefined, profile())!;
    const preco = ticketPrice(findRoulette('flores')!, 'chips');

    const res = await acc.spin(a.id, 'flores', 'chips');
    expect(res).toEqual({ key: 'character:yukina', dup: false, refund: 0 });
    const depois = acc.info(a.id)!;
    expect(depois.money).toBe(10_000 - preco);
    expect(depois.owned).toContain('character:yukina');
    acc.close();
  });

  it('prêmio repetido vira fichas', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 10_000, rnd: () => rndPara('flores', 'character:yukina') });
    const a = acc.login(undefined, profile())!;
    const preco = ticketPrice(findRoulette('flores')!, 'chips');

    await acc.spin(a.id, 'flores', 'chips');
    const res = (await acc.spin(a.id, 'flores', 'chips')) as { key: string; dup: boolean; refund: number };
    expect(res.dup).toBe(true);
    expect(res.refund).toBe(refundOf('character:yukina'));
    // duas cobranças, uma devolução: o ticket nunca sai vazio
    expect(acc.info(a.id)!.money).toBe(10_000 - preco * 2 + res.refund);
    acc.close();
  });

  it('presente sorteado entra no estoque, e repete sem virar fichas', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 100_000, rnd: () => rndPara('flores', 'gift:flor') });
    const a = acc.login(undefined, profile())!;

    await acc.spin(a.id, 'flores', 'chips');
    const res = (await acc.spin(a.id, 'flores', 'chips')) as { key: string; dup: boolean };
    expect(res.dup).toBe(false);
    expect(acc.info(a.id)!.gifts.flor).toBe(2);
    acc.close();
  });

  it('sem fichas não gira, e roleta inventada não existe', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 10 });
    const a = acc.login(undefined, profile())!;

    expect(await acc.spin(a.id, 'flores', 'chips')).toMatch(/faltam/);
    expect(await acc.spin(a.id, 'inventada', 'chips')).toMatch(/não existe/);
    expect(acc.info(a.id)!.money).toBe(10);
    acc.close();
  });

  it('cada roleta sorteia só personagens do gênero dela', () => {
    const femininas = dropsOf(findRoulette('flores')!).filter((d) => d.kind === 'character');
    const masculinos = dropsOf(findRoulette('dragao')!).filter((d) => d.kind === 'character');
    expect(femininas.map((d) => d.key)).toEqual(['character:yukina']);
    expect(masculinos.map((d) => d.key)).toEqual(['character:ren']);
    // e as chances somam 1 nas duas, senão a porcentagem anunciada seria mentira
    for (const r of ROULETTES) {
      const soma = dropsOf(r).reduce((t, d) => t + d.chance, 0);
      expect(soma, r.id).toBeCloseTo(1, 6);
    }
  });
});

/**
 * A tranca do vínculo.
 *
 * Jogar enche o coração e para; a **missão** abre. O presente não abre nada: enche a barra, e só
 * se for alto o bastante para o coração em que a pessoa está. Os três lados são do servidor.
 */
describe('vínculo: missões e presentes', () => {
  it('os pontos param na borda do coração trancado, mas os contadores continuam', () => {
    const acc = new Accounts({ file: newFile() });
    const a = acc.login(undefined, profile())!;

    // matchWin não conta mão nenhuma: a missão do 1º coração (10 mãos) nunca fecha
    for (let i = 0; i < 40; i++) acc.bond(a.id, 'yukina', 'matchWin');
    const st = acc.info(a.id)!.bond.yukina;
    expect(st.points).toBe(bondCap(0));
    expect(st.matches).toBe(40);
    expect(acc.info(a.id)!.bondUnlocked.yukina ?? 0).toBe(0);
    acc.close();
  });

  it('cumprida a missão, o coração abre sozinho e o teto sobe', () => {
    const acc = new Accounts({ file: newFile() });
    const a = acc.login(undefined, profile())!;

    for (let i = 0; i < 9; i++) acc.bond(a.id, 'yukina', 'win');
    expect(acc.info(a.id)!.bondUnlocked.yukina ?? 0).toBe(0);
    // a décima mão fecha a missão: ninguém precisou pedir nada
    acc.bond(a.id, 'yukina', 'win');
    expect(acc.info(a.id)!.bondUnlocked.yukina).toBe(1);

    for (let i = 0; i < 40; i++) acc.bond(a.id, 'yukina', 'matchWin');
    expect(acc.info(a.id)!.bond.yukina.points).toBeGreaterThan(bondCap(0));
    acc.close();
  });

  it('o presente vira pontos e sai do estoque', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 100_000 });
    const a = acc.login(undefined, profile())!;
    await acc.buy(a.id, 'gift:flor', 'chips');

    const r = acc.giveGift(a.id, 'yukina', 'flor');
    expect(r).toBe(giftPoints('yukina', 'flor'));
    const depois = acc.info(a.id)!;
    expect(depois.bond.yukina.points).toBe(giftPoints('yukina', 'flor'));
    expect(depois.gifts.flor ?? 0).toBe(0);
    acc.close();
  });

  it('presente que não se tem é recusado', () => {
    const acc = new Accounts({ file: newFile() });
    const a = acc.login(undefined, profile())!;
    expect(acc.giveGift(a.id, 'yukina', 'joia')).toMatch(/não tem/);
    acc.close();
  });

  it('presente baixo demais para o coração é recusado, e continua no estoque', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 100_000 });
    const a = acc.login(undefined, profile())!;
    await acc.buy(a.id, 'gift:flor', 'chips');
    // abre o 1º coração: a partir do 2º, comum não serve mais
    for (let i = 0; i < 10; i++) acc.bond(a.id, 'yukina', 'win');
    expect(acc.info(a.id)!.bondUnlocked.yukina).toBe(1);

    expect(acc.giveGift(a.id, 'yukina', 'flor')).toMatch(/incomum ou melhor/);
    expect(acc.info(a.id)!.gifts.flor).toBe(1);
    acc.close();
  });

  it('com a barra no teto, o presente é recusado inteiro: nada de queimar um kimono à toa', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 100_000 });
    const a = acc.login(undefined, profile())!;
    await acc.buy(a.id, 'gift:flor', 'chips');
    // enche a barra sem cumprir a missão (matchWin não conta mão)
    for (let i = 0; i < 40; i++) acc.bond(a.id, 'yukina', 'matchWin');

    expect(acc.giveGift(a.id, 'yukina', 'flor')).toMatch(/missão/);
    expect(acc.info(a.id)!.gifts.flor).toBe(1);
    acc.close();
  });

  it('o presente não passa do teto do coração: o excedente não entra', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 100_000 });
    const a = acc.login(undefined, profile())!;
    await acc.buy(a.id, 'gift:livro', 'chips');
    // abre o 1º coração e para dois pontos abaixo do teto do 2º, sem fechar a missão dele
    for (let i = 0; i < 10; i++) acc.bond(a.id, 'yukina', 'win');
    for (let i = 0; i < 3; i++) acc.bond(a.id, 'yukina', 'matchWin');
    for (let i = 0; i < 18; i++) acc.bond(a.id, 'yukina', 'fold');
    expect(acc.info(a.id)!.bond.yukina.points).toBe(bondCap(1) - 2);

    // o livro vale 45, mas só cabem 2: o resto não entra (e o livro foi embora do mesmo jeito)
    expect(acc.giveGift(a.id, 'yukina', 'livro')).toBe(2);
    expect(acc.info(a.id)!.bond.yukina.points).toBe(bondCap(1));
    acc.close();
  });
});
