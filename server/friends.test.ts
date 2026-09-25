import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AccountProfile } from '../shared/accounts';
import { Lobby, type Connection } from '../shared/lobby';
import { DEFAULT_SETTINGS, type ServerMsg } from '../shared/protocol';
import { FRIEND_CODE_LEN, MAX_PARTY, normalizeFriendCode, prettyFriendCode } from '../shared/friends';
import { Accounts } from './accounts';

/**
 * Amizades e grupo.
 *
 * O que estes testes protegem é a promessa que a tela faz: que a amizade é **por código**, e por
 * isso sobrevive à troca de nome; que a bolinha verde diz a verdade sobre quem está online agora; e
 * que o grupo só junta gente que se conhece — um convite para estranho seria mensagem para
 * estranho, com outro nome.
 */

const dirs: string[] = [];
function newFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pokeru-'));
  dirs.push(dir);
  return join(dir, 'accounts.json');
}

const profile = (name: string): AccountProfile =>
  ({ name, avatar: { color: '#fff', icon: '♠' }, cosmetics: { character: { id: 'marina' } } }) as unknown as AccountProfile;

interface Cli {
  conn: Connection;
  msgs: ServerMsg[];
  errors: string[];
  id: string;
  /** Chave de volta da conta: é com ela que o teste reconecta como a mesma pessoa. */
  token: string;
}

/** Conecta um cliente já apresentado, guardando o que o servidor manda para ele. */
function client(lobby: Lobby, name: string, creds?: { id: string; token: string }): Cli {
  const c: Cli = { conn: null as never, msgs: [], errors: [], id: '', token: '' };
  c.conn = lobby.connect((m) => {
    c.msgs.push(m);
    if (m.type === 'error') c.errors.push(m.message);
    if (m.type === 'account') {
      c.id = m.account.id;
      if (m.account.token) c.token = m.account.token;
    }
  });
  c.conn.handle({ type: 'hello', name, avatar: {}, cosmetics: {}, account: creds });
  return c;
}

const last = <T extends ServerMsg['type']>(c: Cli, t: T): Extract<ServerMsg, { type: T }> | undefined =>
  [...c.msgs].reverse().find((m) => m.type === t) as never;

/** O código de amigo de uma conta. */
const codeOf = (acc: Accounts, id: string): string => acc.info(id)!.code;

afterEach(() => {
  vi.useRealTimers();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('o código de amigo', () => {
  it('nasce com a conta, tem seis caracteres e não repete', () => {
    const acc = new Accounts({ file: newFile() });
    const vistos = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const a = acc.login(undefined, profile(`P${i}`))!;
      const code = codeOf(acc, a.id);
      expect(code, a.id).toHaveLength(FRIEND_CODE_LEN);
      expect(vistos.has(code), code).toBe(false);
      vistos.add(code);
    }
    acc.close();
  });

  it('não muda quando a pessoa troca de nome — que é o motivo de ele existir', () => {
    const acc = new Accounts({ file: newFile() });
    const a = acc.login(undefined, profile('Gabi'))!;
    const antes = codeOf(acc, a.id);
    const depois = acc.login({ id: a.id, token: a.token! }, profile('Outro Nome'))!;
    expect(depois.name).toBe('Outro Nome');
    expect(codeOf(acc, a.id)).toBe(antes);
    acc.close();
  });

  it('é achado como a pessoa o digita: com hífen, minúsculo, com espaço', () => {
    const acc = new Accounts({ file: newFile() });
    const a = acc.login(undefined, profile('Gabi'))!;
    const code = codeOf(acc, a.id);
    expect(acc.byCode(code)).toBe(a.id);
    expect(acc.byCode(prettyFriendCode(code))).toBe(a.id);
    expect(acc.byCode(code.toLowerCase())).toBe(a.id);
    expect(acc.byCode(` ${code.slice(0, 3)} ${code.slice(3)} `)).toBe(a.id);
    // e o que não existe não vira ninguém
    expect(acc.byCode('ZZZZZZ')).toBeNull();
    expect(acc.byCode('abc')).toBeNull();
    expect(normalizeFriendCode('a-b c!')).toBe('ABC');
    acc.close();
  });
});

describe('pedidos de amizade', () => {
  it('pedir, aceitar, e os dois viram amigos', () => {
    const acc = new Accounts({ file: newFile() });
    const a = acc.login(undefined, profile('Gabi'))!;
    const b = acc.login(undefined, profile('Leo'))!;

    const r = acc.requestFriend(a.id, codeOf(acc, b.id));
    expect(r).toEqual({ to: b.id, aceito: false });
    expect(acc.friends(a.id).outgoing.map((x) => x.id)).toEqual([b.id]);
    expect(acc.friends(b.id).incoming.map((x) => x.id)).toEqual([a.id]);
    // ainda não são amigos
    expect(acc.friends(a.id).friends).toEqual([]);

    expect(acc.acceptFriend(b.id, a.id)).toBeNull();
    expect(acc.friends(a.id).friends.map((x) => x.name)).toEqual(['Leo']);
    expect(acc.friends(b.id).friends.map((x) => x.name)).toEqual(['Gabi']);
    // e a caixa de pedidos ficou limpa dos dois lados
    expect(acc.friends(a.id).outgoing).toEqual([]);
    expect(acc.friends(b.id).incoming).toEqual([]);
    acc.close();
  });

  it('pedido cruzado vira amizade na hora', () => {
    const acc = new Accounts({ file: newFile() });
    const a = acc.login(undefined, profile('Gabi'))!;
    const b = acc.login(undefined, profile('Leo'))!;

    acc.requestFriend(a.id, codeOf(acc, b.id));
    // ele pede de volta em vez de ir na lista aceitar: é a mesma intenção
    expect(acc.requestFriend(b.id, codeOf(acc, a.id))).toEqual({ to: a.id, aceito: true });
    expect(acc.friends(a.id).friends.map((x) => x.id)).toEqual([b.id]);
    acc.close();
  });

  it('recusa o que não faz sentido: a si mesmo, código que não existe, pedido repetido, quem já é amigo', () => {
    const acc = new Accounts({ file: newFile() });
    const a = acc.login(undefined, profile('Gabi'))!;
    const b = acc.login(undefined, profile('Leo'))!;

    expect(acc.requestFriend(a.id, codeOf(acc, a.id))).toMatch(/é o seu/);
    expect(acc.requestFriend(a.id, 'ZZZZZZ')).toMatch(/nenhuma conta/);
    acc.requestFriend(a.id, codeOf(acc, b.id));
    expect(acc.requestFriend(a.id, codeOf(acc, b.id))).toMatch(/já está esperando/);
    acc.acceptFriend(b.id, a.id);
    expect(acc.requestFriend(a.id, codeOf(acc, b.id))).toMatch(/já são amigos/);
    acc.close();
  });

  it('recusar limpa os dois lados, e serve para cancelar o que foi enviado', () => {
    const acc = new Accounts({ file: newFile() });
    const a = acc.login(undefined, profile('Gabi'))!;
    const b = acc.login(undefined, profile('Leo'))!;

    acc.requestFriend(a.id, codeOf(acc, b.id));
    expect(acc.declineFriend(b.id, a.id)).toBeNull();
    expect(acc.friends(a.id).outgoing).toEqual([]);
    expect(acc.friends(b.id).incoming).toEqual([]);

    // agora quem cancela é quem pediu
    acc.requestFriend(a.id, codeOf(acc, b.id));
    acc.declineFriend(a.id, b.id);
    expect(acc.friends(b.id).incoming).toEqual([]);
    acc.close();
  });

  it('aceitar o que ninguém pediu não vira amizade', () => {
    const acc = new Accounts({ file: newFile() });
    const a = acc.login(undefined, profile('Gabi'))!;
    const b = acc.login(undefined, profile('Leo'))!;
    expect(acc.acceptFriend(a.id, b.id)).toMatch(/não há pedido/);
    expect(acc.friends(a.id).friends).toEqual([]);
    acc.close();
  });

  it('desfazer amizade tira dos dois: lista de um lado só é uma lista mentindo', () => {
    const acc = new Accounts({ file: newFile() });
    const a = acc.login(undefined, profile('Gabi'))!;
    const b = acc.login(undefined, profile('Leo'))!;
    acc.requestFriend(a.id, codeOf(acc, b.id));
    acc.acceptFriend(b.id, a.id);

    expect(acc.removeFriend(a.id, b.id)).toBeNull();
    expect(acc.friends(a.id).friends).toEqual([]);
    expect(acc.friends(b.id).friends).toEqual([]);
    acc.close();
  });

  it('a amizade sobrevive ao reinício do servidor', () => {
    const file = newFile();
    const acc = new Accounts({ file });
    const a = acc.login(undefined, profile('Gabi'))!;
    const b = acc.login(undefined, profile('Leo'))!;
    acc.requestFriend(a.id, codeOf(acc, b.id));
    acc.acceptFriend(b.id, a.id);
    acc.close();

    const outra = new Accounts({ file });
    expect(outra.friends(a.id).friends.map((x) => x.id)).toEqual([b.id]);
    outra.close();
  });
});

describe('a bolinha verde', () => {
  it('quem está conectado aparece online; quem saiu, não', () => {
    const acc = new Accounts({ file: newFile() });
    const lobby = new Lobby('teste', acc);
    const a = client(lobby, 'Gabi');
    const b = client(lobby, 'Leo');
    acc.requestFriend(a.id, codeOf(acc, b.id));
    acc.acceptFriend(b.id, a.id);

    expect(lobby.friendsFor(a.id).friends[0]).toMatchObject({ id: b.id, online: true, playing: false });
    b.conn.close();
    expect(lobby.friendsFor(a.id).friends[0]).toMatchObject({ id: b.id, online: false });
    acc.close();
  });

  it('quem entra é anunciado aos amigos, e só a eles', () => {
    const acc = new Accounts({ file: newFile() });
    const lobby = new Lobby('teste', acc);
    const a = client(lobby, 'Gabi');
    const b = client(lobby, 'Leo');
    const estranho = client(lobby, 'Zé');
    acc.requestFriend(a.id, codeOf(acc, b.id));
    acc.acceptFriend(b.id, a.id);

    // ele sai e volta pela chave guardada: é a entrada que avisa
    b.conn.close();
    a.msgs.length = 0;
    estranho.msgs.length = 0;
    const voltou = client(lobby, 'Leo', { id: b.id, token: b.token });
    expect(voltou.id).toBe(b.id);

    expect(last(a, 'friendOnline')).toMatchObject({ id: b.id, name: 'Leo' });
    // a lista dele chegou junto, já com a bolinha verde
    expect(last(a, 'friends')!.friends[0]).toMatchObject({ id: b.id, online: true });
    // e quem não é amigo não é avisado de nada
    expect(last(estranho, 'friendOnline')).toBeUndefined();
    acc.close();
  });

  it('em partida aparece diferente de "à toa no menu"', () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 10_000 });
    const lobby = new Lobby('teste', acc);
    const a = client(lobby, 'Gabi');
    const b = client(lobby, 'Leo');
    acc.requestFriend(a.id, codeOf(acc, b.id));
    acc.acceptFriend(b.id, a.id);

    b.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS } });
    expect(lobby.friendsFor(a.id).friends[0]).toMatchObject({ online: true, playing: true });
    acc.close();
  });

  it('a lista vem com os online primeiro', () => {
    const acc = new Accounts({ file: newFile() });
    const lobby = new Lobby('teste', acc);
    const eu = client(lobby, 'Gabi');
    const zeca = client(lobby, 'Zeca');
    const ana = client(lobby, 'Ana');
    for (const amigo of [zeca, ana]) {
      acc.requestFriend(eu.id, codeOf(acc, amigo.id));
      acc.acceptFriend(amigo.id, eu.id);
    }
    // Zeca sai: mesmo vindo antes no alfabeto, ele cai para baixo da Ana
    zeca.conn.close();
    expect(lobby.friendsFor(eu.id).friends.map((f) => f.name)).toEqual(['Ana', 'Zeca']);
    acc.close();
  });
});

describe('o grupo', () => {
  /** Dois amigos conectados, prontos para formar grupo. */
  function dupla(money = 100_000) {
    const acc = new Accounts({ file: newFile(), startingMoney: money });
    const lobby = new Lobby('teste', acc);
    const a = client(lobby, 'Gabi');
    const b = client(lobby, 'Leo');
    acc.requestFriend(a.id, codeOf(acc, b.id));
    acc.acceptFriend(b.id, a.id);
    return { acc, lobby, a, b };
  }

  it('convidar um amigo cria o grupo, e aceitar entra nele', () => {
    const { acc, a, b } = dupla();
    a.conn.handle({ type: 'partyInvite', id: b.id });
    const ask = last(b, 'partyAsk')!;
    expect(ask).toMatchObject({ from: a.id, name: 'Gabi' });

    b.conn.handle({ type: 'partyAccept', party: ask.party });
    const p = last(b, 'party')!.party!;
    expect(p.leader).toBe(a.id);
    expect(p.members.map((m) => m.name).sort()).toEqual(['Gabi', 'Leo']);
    expect(p.members.find((m) => m.id === a.id)!.leader).toBe(true);
    acc.close();
  });

  it('não se chama estranho para o grupo: convite seria mensagem para estranho', () => {
    const acc = new Accounts({ file: newFile() });
    const lobby = new Lobby('teste', acc);
    const a = client(lobby, 'Gabi');
    const z = client(lobby, 'Zé');
    a.conn.handle({ type: 'partyInvite', id: z.id });
    expect(a.errors.join(' ')).toMatch(/apenas amigos/);
    expect(last(z, 'partyAsk')).toBeUndefined();
    acc.close();
  });

  it('não se chama quem está offline: o convite ninguém veria', () => {
    const { acc, a, b } = dupla();
    b.conn.close();
    a.conn.handle({ type: 'partyInvite', id: b.id });
    expect(a.errors.join(' ')).toMatch(/não está online/);
    acc.close();
  });

  it('entrar num grupo sem convite não funciona, nem sabendo o id dele', () => {
    const { acc, lobby, a, b } = dupla();
    a.conn.handle({ type: 'partyInvite', id: b.id });
    const ask = last(b, 'partyAsk')!;

    // um terceiro, amigo de ninguém, tenta entrar na festa alheia com o id na mão
    const curioso = client(lobby, 'Curioso');
    curioso.conn.handle({ type: 'partyAccept', party: ask.party });
    expect(curioso.errors.join(' ')).toMatch(/não foi chamado/);
    expect(lobby.partyOf(curioso.id)).toBeNull();
    acc.close();
  });

  it('o grupo cabe quatro', () => {
    const acc = new Accounts({ file: newFile() });
    const lobby = new Lobby('teste', acc);
    const lider = client(lobby, 'Gabi');
    const amigos = ['Leo', 'Bia', 'Duda', 'Nando'].map((n) => client(lobby, n));
    for (const f of amigos) {
      acc.requestFriend(lider.id, codeOf(acc, f.id));
      acc.acceptFriend(f.id, lider.id);
    }
    for (const f of amigos) {
      lider.conn.handle({ type: 'partyInvite', id: f.id });
      const ask = last(f, 'partyAsk');
      if (ask) f.conn.handle({ type: 'partyAccept', party: ask.party });
    }
    const p = lobby.partyOf(lider.id)!;
    expect(p.members).toHaveLength(MAX_PARTY);
    expect(lider.errors.some((e) => e.includes(`cabe ${MAX_PARTY}`))).toBe(true);
    acc.close();
  });

  it('o líder sair desfaz o grupo; um membro sair só tira ele', () => {
    const { acc, lobby, a, b } = dupla();
    a.conn.handle({ type: 'partyInvite', id: b.id });
    b.conn.handle({ type: 'partyAccept', party: last(b, 'partyAsk')!.party });
    expect(lobby.partyOf(b.id)).toBeTruthy();

    a.conn.handle({ type: 'partyLeave' });
    expect(lobby.partyOf(a.id)).toBeNull();
    expect(lobby.partyOf(b.id)).toBeNull();
    expect(last(b, 'party')!.party).toBeNull();
    acc.close();
  });

  it('sair do jogo tira do grupo', () => {
    const { acc, lobby, a, b } = dupla();
    a.conn.handle({ type: 'partyInvite', id: b.id });
    b.conn.handle({ type: 'partyAccept', party: last(b, 'partyAsk')!.party });

    b.conn.close();
    // com um só sobrando, o grupo se desfaz: não é grupo
    expect(lobby.partyOf(a.id)).toBeNull();
    acc.close();
  });

  it('só o líder começa a partida', async () => {
    const { acc, a, b } = dupla();
    a.conn.handle({ type: 'partyInvite', id: b.id });
    b.conn.handle({ type: 'partyAccept', party: last(b, 'partyAsk')!.party });

    b.errors.length = 0;
    b.conn.handle({ type: 'partyStart', kind: 'bots', difficulty: 'easy', currency: 'chips' });
    await new Promise((r) => setTimeout(r, 10));
    expect(b.errors.join(' ')).toMatch(/apenas o líder/);
    acc.close();
  });

  it('contra bots, o grupo senta junto e os bots completam a mesa', async () => {
    vi.useFakeTimers();
    const { acc, lobby, a, b } = dupla();
    a.conn.handle({ type: 'partyInvite', id: b.id });
    b.conn.handle({ type: 'partyAccept', party: last(b, 'partyAsk')!.party });

    a.conn.handle({ type: 'partyStart', kind: 'bots', difficulty: 'easy', currency: 'chips' });
    await vi.advanceTimersByTimeAsync(300);

    const room = [...lobby.rooms.values()][0];
    const s = room.summary();
    // dois humanos e dois bots: a mesa contra bots tem quatro cadeiras
    expect(s.players).toBe(4);
    expect(s.bots).toBe(2);
    expect(room.settings.mode).toBe('normal');
    // os dois pagaram o buy-in do degrau
    expect(acc.money(a.id)).toBe(99_000);
    expect(acc.money(b.id)).toBe(99_000);
    acc.close();
  }, 20_000);

  it('na fila, o grupo entra na mesma mesa — e ela fica visível para os de fora', async () => {
    vi.useFakeTimers();
    const { acc, lobby, a, b } = dupla();
    a.conn.handle({ type: 'partyInvite', id: b.id });
    b.conn.handle({ type: 'partyAccept', party: last(b, 'partyAsk')!.party });

    a.conn.handle({ type: 'partyStart', kind: 'queue', currency: 'chips' });
    await vi.advanceTimersByTimeAsync(300);

    const room = [...lobby.rooms.values()][0];
    expect(room.settings.queue).toBe(true);
    expect(room.summary().players).toBe(2);
    expect(lobby.queueRooms('chips')).toContain(room);
    acc.close();
  }, 20_000);

  it('em Custom, a mesa que o líder cria puxa o grupo', async () => {
    vi.useFakeTimers();
    const { acc, lobby, a, b } = dupla();
    a.conn.handle({ type: 'partyInvite', id: b.id });
    b.conn.handle({ type: 'partyAccept', party: last(b, 'partyAsk')!.party });

    a.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS, buyIn: 500, startingStack: 500 } });
    await vi.advanceTimersByTimeAsync(300);

    const room = [...lobby.rooms.values()][0];
    expect(room.summary().players).toBe(2);
    expect(acc.money(b.id)).toBe(99_500);
    acc.close();
  }, 20_000);
});

/**
 * O grupo e quem já está jogando.
 *
 * Na partida normal, sair no meio custa as fichas da mesa. Se o líder pudesse arrastar para uma
 * mesa nova quem está no meio de uma partida, ele torraria o dinheiro de um amigo com um clique —
 * e sem querer.
 */
describe('o grupo respeita quem já está numa mesa', () => {
  it('quem está jogando não é arrastado, e não perde nada', async () => {
    vi.useFakeTimers();
    const acc = new Accounts({ file: newFile(), startingMoney: 100_000 });
    const lobby = new Lobby('teste', acc);
    const a = client(lobby, 'Gabi');
    const b = client(lobby, 'Leo');
    acc.requestFriend(a.id, codeOf(acc, b.id));
    acc.acceptFriend(b.id, a.id);
    a.conn.handle({ type: 'partyInvite', id: b.id });
    b.conn.handle({ type: 'partyAccept', party: last(b, 'partyAsk')!.party });

    // ele senta numa partida normal (onde sair no meio custa as fichas)
    b.conn.handle({ type: 'botMatch', difficulty: 'easy', currency: 'chips' });
    await vi.advanceTimersByTimeAsync(300);
    const saldoDele = acc.money(b.id);
    const mesaDele = lobby.rooms.size;

    // o líder começa a partida do grupo: ela sai sem ele
    a.conn.handle({ type: 'partyStart', kind: 'bots', difficulty: 'easy', currency: 'chips' });
    await vi.advanceTimersByTimeAsync(300);

    expect(lobby.rooms.size).toBe(mesaDele + 1);
    // ele continua na mesa dele, com as fichas dele em jogo
    expect(acc.money(b.id)).toBe(saldoDele);
    expect([...lobby.rooms.values()].some((r) => r.chipsOf(b.id) > 0)).toBe(true);
    acc.close();
  }, 20_000);

  it('o líder numa mesa é avisado em vez de perder as fichas dele', async () => {
    vi.useFakeTimers();
    const acc = new Accounts({ file: newFile(), startingMoney: 100_000 });
    const lobby = new Lobby('teste', acc);
    const a = client(lobby, 'Gabi');
    const b = client(lobby, 'Leo');
    acc.requestFriend(a.id, codeOf(acc, b.id));
    acc.acceptFriend(b.id, a.id);
    a.conn.handle({ type: 'partyInvite', id: b.id });
    b.conn.handle({ type: 'partyAccept', party: last(b, 'partyAsk')!.party });

    a.conn.handle({ type: 'botMatch', difficulty: 'easy', currency: 'chips' });
    await vi.advanceTimersByTimeAsync(300);
    a.errors.length = 0;

    a.conn.handle({ type: 'partyStart', kind: 'bots', difficulty: 'easy', currency: 'chips' });
    await vi.advanceTimersByTimeAsync(300);
    expect(a.errors.join(' ')).toMatch(/saia da mesa/);
    acc.close();
  }, 20_000);
});

/**
 * O que o grupo, a sala e o perfil mostram de cada um — e quem pode ver o quê.
 *
 * O card é montado no servidor, com o que a conta tem; o perfil de amigo é só de amigo; o convite
 * de sala vale como a senha, mas só para quem foi chamado; e pedir amizade pela mesa só funciona
 * com quem está sentado na mesma mesa.
 */
describe('cards, perfil de amigo, convite de sala e amizade pela mesa', () => {
  function trio() {
    const acc = new Accounts({ file: newFile(), startingMoney: 100_000 });
    const lobby = new Lobby('teste', acc);
    const a = client(lobby, 'Gabi');
    const b = client(lobby, 'Leo');
    const c = client(lobby, 'Estranho');
    acc.requestFriend(a.id, codeOf(acc, b.id));
    acc.acceptFriend(b.id, a.id);
    return { acc, lobby, a, b, c };
  }

  it('o grupo manda o card de cada um', () => {
    const { acc, a, b } = trio();
    a.conn.handle({ type: 'partyInvite', id: b.id });
    b.conn.handle({ type: 'partyAccept', party: last(b, 'partyAsk')!.party });
    const leo = last(a, 'party')!.party!.members.find((m) => m.id === b.id)!;
    expect(leo.cartao).toMatchObject({ name: 'Leo', frame: expect.any(String) });
    expect(leo.cartao!.character.id).toBe(leo.character);
    expect(Array.isArray(leo.cartao!.auras)).toBe(true);
    acc.close();
  });

  it('o perfil de um amigo traz o card, o histórico e as conquistas; o de um estranho, não', () => {
    const { acc, a, b, c } = trio();
    a.conn.handle({ type: 'profileOf', id: b.id });
    const perfil = last(a, 'perfil')!.perfil;
    expect(perfil).toMatchObject({ id: b.id, code: codeOf(acc, b.id), online: true, playing: false });
    expect(perfil.cartao.name).toBe('Leo');
    expect(perfil.stats).toBeDefined();
    expect(Array.isArray(perfil.play)).toBe(true);
    // saldo e itens não vão: o perfil é o que a pessoa mostra, não a carteira dela
    expect(perfil).not.toHaveProperty('money');
    expect(perfil).not.toHaveProperty('owned');

    c.conn.handle({ type: 'profileOf', id: b.id });
    expect(last(c, 'perfil')).toBeUndefined();
    expect(c.errors.some((e) => e.includes('amigos'))).toBe(true);
    acc.close();
  });

  it('o perfil de quem está offline sai de como ele estava vestido da última vez', () => {
    const { acc, a, b } = trio();
    b.conn.close();
    a.conn.handle({ type: 'profileOf', id: b.id });
    const perfil = last(a, 'perfil')!.perfil;
    expect(perfil.online).toBe(false);
    expect(perfil.cartao.name).toBe('Leo');
    expect(perfil.cartao.character.id).toBe(acc.aparencia(b.id)!.character);
    acc.close();
  });

  it('o amigo chamado para a sala entra mesmo com senha; quem não foi chamado, não', async () => {
    vi.useFakeTimers();
    const { acc, lobby, a, b, c } = trio();
    a.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS, password: 'segredo' } });
    await vi.advanceTimersByTimeAsync(300);
    const room = [...lobby.rooms.values()][0];

    a.conn.handle({ type: 'roomInvite', id: b.id });
    const ask = last(b, 'roomAsk')!;
    expect(ask).toMatchObject({ room: room.id, from: a.id, name: 'Gabi' });

    b.conn.handle({ type: 'joinRoom', roomId: ask.room });
    await vi.advanceTimersByTimeAsync(300);
    expect(room.summary().players).toBe(2);

    c.conn.handle({ type: 'joinRoom', roomId: room.id });
    await vi.advanceTimersByTimeAsync(300);
    expect(room.summary().players).toBe(2);
    expect(c.errors).toContain('Senha incorreta');
    acc.close();
  }, 20_000);

  it('chamar para a sala só vale para amigo, e de dentro de uma sala', async () => {
    vi.useFakeTimers();
    const { acc, a, b, c } = trio();
    a.conn.handle({ type: 'roomInvite', id: b.id });
    expect(a.errors.some((e) => e.includes('entre numa sala'))).toBe(true);

    a.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS } });
    await vi.advanceTimersByTimeAsync(300);
    a.conn.handle({ type: 'roomInvite', id: c.id });
    expect(a.errors.some((e) => e.includes('apenas amigos'))).toBe(true);
    expect(last(c, 'roomAsk')).toBeUndefined();
    acc.close();
  }, 20_000);

  it('pedir amizade a quem está na mesma mesa, pelo id de jogador; de fora da mesa, não', async () => {
    vi.useFakeTimers();
    const { acc, lobby, a, b, c } = trio();
    a.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS } });
    await vi.advanceTimersByTimeAsync(300);
    const room = [...lobby.rooms.values()][0];
    c.conn.handle({ type: 'joinRoom', roomId: room.id });
    await vi.advanceTimersByTimeAsync(300);

    // b não está na mesa: o id de jogador de alguém de lá não abre nada para ele
    b.conn.handle({ type: 'friendAddPlayer', playerId: c.conn.id });
    expect(b.errors.length).toBeGreaterThan(0);
    expect(acc.friends(c.id).incoming.map((f) => f.id)).not.toContain(b.id);

    a.conn.handle({ type: 'friendAddPlayer', playerId: c.conn.id });
    expect(acc.friends(c.id).incoming.map((f) => f.id)).toContain(a.id);
    expect(last(c, 'friends')!.incoming.map((f) => f.id)).toContain(a.id);
    // a sala diz de quem é cada cadeira: é por isso que o botão sabe quem já é amigo
    expect(last(a, 'room')!.room.members.find((m) => m.id === c.conn.id)!.conta).toBe(c.id);
    acc.close();
  }, 20_000);
});
