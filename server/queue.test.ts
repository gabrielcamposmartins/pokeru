import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Lobby } from '../shared/lobby';
import { QUEUE_STAKES, type ServerMsg } from '../shared/protocol';
import { BACK_PRESETS, CHARACTER_PRESETS, DEFAULT_WIN_FX } from '../shared/styles';
import type { AuthIdentity } from '../shared/accounts';
import { Accounts } from './accounts';
import { Gbot, type GbotMove, type GbotUser } from './gbot';

/**
 * A fila rápida.
 *
 * A promessa é não escolher nada: o jogador pede partida e o servidor decide — entra numa mesa da
 * fila que já exista ou abre uma com três bots, que vão saindo conforme gente chega. A mesa é cash,
 * jogada com as fichas do próprio jogador até zerar.
 */

const dirs: string[] = [];
function newFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pokeru-fila-'));
  dirs.push(dir);
  return join(dir, 'accounts.json');
}

const cosmetics = { back: BACK_PRESETS[1], character: CHARACTER_PRESETS[0], winFx: DEFAULT_WIN_FX };

/** Um jogador ligado no lobby, com conta no servidor. */
function player(lobby: Lobby, name: string) {
  const got: ServerMsg[] = [];
  const conn = lobby.connect((m) => void got.push(m));
  conn.handle({ type: 'hello', name, avatar: { color: '#fff', icon: '♠' }, cosmetics });
  const last = <T extends ServerMsg['type']>(type: T) => [...got].reverse().find((m) => m.type === type) as Extract<ServerMsg, { type: T }> | undefined;
  return { conn, got, last, errors: () => got.filter((m) => m.type === 'error').map((m) => (m as { message: string }).message) };
}

/** Deixa a fila (e o que ela dispara) terminar. */
const assenta = () => vi.advanceTimersByTimeAsync(50);

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  vi.useRealTimers();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('fila rápida em fichas', () => {
  it('sem mesa nenhuma, abre uma com três bots e começa', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 20_000 });
    const lobby = new Lobby('Teste', acc);
    const gabi = player(lobby, 'Gabi');

    gabi.conn.handle({ type: 'quickMatch' });
    await assenta();

    const sala = gabi.last('room')!.room;
    expect(sala.settings.queue).toBe(true);
    expect(sala.settings.mode).toBe('cash');
    expect(sala.settings.maxPlayers).toBe(6);
    expect(sala.settings.buyIn).toBe(QUEUE_STAKES.chips.buyIn);
    // o jogador e três bots: a mesa já tem jogo
    expect(sala.members).toHaveLength(4);
    expect(sala.members.filter((m) => m.isBot)).toHaveLength(3);
    expect(sala.status).toBe('playing');
    // e o buy-in saiu das fichas dele
    expect(acc.info(gabi.last('account')!.account.id)!.money).toBe(20_000 - QUEUE_STAKES.chips.buyIn);
    acc.close();
  });

  it('o segundo jogador cai na mesma mesa, não numa nova', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 20_000 });
    const lobby = new Lobby('Teste', acc);
    const gabi = player(lobby, 'Gabi');
    gabi.conn.handle({ type: 'quickMatch' });
    await assenta();
    const primeira = gabi.last('room')!.room.id;

    const dani = player(lobby, 'Dani');
    dani.conn.handle({ type: 'quickMatch' });
    await assenta();

    expect(dani.last('room')!.room.id).toBe(primeira);
    expect(lobby.rooms.size).toBe(1);
    acc.close();
  });

  it('mesa cheia: um bot sai para dar lugar a quem chega', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 99_999 });
    const lobby = new Lobby('Teste', acc);
    const nomes = ['Gabi', 'Dani', 'Leo', 'Tati', 'Bia', 'Rafa'];
    const jogadores = [];
    for (const n of nomes) {
      const p = player(lobby, n);
      p.conn.handle({ type: 'quickMatch' });
      await assenta();
      jogadores.push(p);
    }

    const sala = jogadores[jogadores.length - 1].last('room')!.room;
    expect(lobby.rooms.size).toBe(1);
    // seis lugares, seis pessoas: os três bots saíram pelo caminho
    expect(sala.members.filter((m) => !m.isBot)).toHaveLength(6);
    expect(sala.members.filter((m) => m.isBot)).toHaveLength(0);
    acc.close();
  });

  it('não sequestra a mesa que alguém criou à mão', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 20_000 });
    const lobby = new Lobby('Teste', acc);
    const dono = player(lobby, 'Dono');
    // uma mesa cash normal, do mesmo formato, mas fora da fila
    dono.conn.handle({
      type: 'createRoom',
      settings: { name: 'Minha mesa', maxPlayers: 6, mode: 'cash', buyIn: 2000, startingStack: 2000, smallBlind: 10, bigBlind: 20 },
    });
    await assenta();
    const particular = dono.last('room')!.room.id;

    const gabi = player(lobby, 'Gabi');
    gabi.conn.handle({ type: 'quickMatch' });
    await assenta();

    expect(gabi.last('room')!.room.id).not.toBe(particular);
    expect(lobby.rooms.size).toBe(2);
    acc.close();
  });

  it('dois cliques não viram duas mesas', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 20_000 });
    const lobby = new Lobby('Teste', acc);
    const gabi = player(lobby, 'Gabi');

    gabi.conn.handle({ type: 'quickMatch' });
    gabi.conn.handle({ type: 'quickMatch' });
    await assenta();

    expect(lobby.rooms.size).toBe(1);
    acc.close();
  });

  it('sem fichas para o buy-in, a fila diz o motivo', async () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 10, faucet: 0 });
    const lobby = new Lobby('Teste', acc);
    const gabi = player(lobby, 'Gabi');

    gabi.conn.handle({ type: 'quickMatch' });
    await assenta();

    expect(gabi.errors().join(' ')).toMatch(/Saldo insuficiente/);
    acc.close();
  });
});

/** GBOT de mentira com saldo em memória, para as mesas de padocoin. */
function fakeGbot(saldo: number) {
  const movimentos: { op: string; quantity: number; key: string | null }[] = [];
  let balance = saldo;
  const http = (async (url: string | URL, init?: RequestInit) => {
    const path = String(url).replace('http://gbot.test', '');
    const ok = (body: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) }) as Response;
    if (path === '/login') return ok({ token: 'servico', token_type: 'Bearer', expires_in: 3600, account: { id: 1, username: 'pokeru', discord_id: null } });
    if (path.startsWith('/user/')) {
      const u: GbotUser = { user_id: '295369928049950720', username: 'gabss2', nickname: 'Mogab', balance };
      return ok({ user: u });
    }
    if (path === '/economy/debit' || path === '/economy/credit') {
      const body = JSON.parse(String(init?.body)) as { quantity: number };
      const key = (init?.headers as Record<string, string>)['Idempotency-Key'] ?? null;
      movimentos.push({ op: path.endsWith('debit') ? 'debit' : 'credit', quantity: body.quantity, key });
      if (path.endsWith('debit') && balance < body.quantity) {
        return { ok: false, status: 409, text: async () => JSON.stringify({ response: 'saldo insuficiente' }) } as Response;
      }
      const before = balance;
      balance += path.endsWith('debit') ? -body.quantity : body.quantity;
      const move: GbotMove = { ok: true, user_id: '295369928049950720', before, after: balance };
      return ok(move);
    }
    return { ok: false, status: 404, text: async () => '{}' } as Response;
  }) as unknown as typeof fetch;
  return {
    movimentos,
    get balance() {
      return balance;
    },
    gbot: new Gbot({ base: 'http://gbot.test', user: 'pokeru', pass: 'x', fetch: http }),
  };
}

const vinculado: AuthIdentity = { sub: '4', username: 'gabs', discordId: '295369928049950720', nickname: 'Mogab' };

describe('mesa de padocoins', () => {
  it('cobra o buy-in no bot e a mesa mostra os padocoins como fichas', async () => {
    const fake = fakeGbot(4989);
    const acc = new Accounts({ file: newFile(), startingMoney: 0, gbot: fake.gbot });
    const lobby = new Lobby('Teste', acc, async () => vinculado);

    // entra com login (é o que dá acesso ao padocoin) e pede a fila em padocoins
    const got: ServerMsg[] = [];
    const conn = lobby.connect((m) => void got.push(m));
    conn.handle({ type: 'hello', name: 'Gabs', avatar: { color: '#fff', icon: '♠' }, cosmetics, jwt: 'jwt.valido' });
    await vi.advanceTimersByTimeAsync(50);
    conn.handle({ type: 'quickMatch', currency: 'pado' });
    await vi.advanceTimersByTimeAsync(80);

    const sala = [...got].reverse().find((m) => m.type === 'room') as Extract<ServerMsg, { type: 'room' }> | undefined;
    expect(sala?.room.settings.currency).toBe('pado');
    expect(sala?.room.settings.buyIn).toBe(QUEUE_STAKES.pado.buyIn);
    // a pilha na mesa é o buy-in: 1 padocoin = 1 ficha na frente do jogador
    const eu = sala!.room.members.find((m) => !m.isBot)!;
    expect(eu.stack).toBe(QUEUE_STAKES.pado.buyIn);
    // e o débito foi no bot, com chave de idempotência
    const debito = fake.movimentos.find((m) => m.op === 'debit')!;
    expect(debito.quantity).toBe(QUEUE_STAKES.pado.buyIn);
    expect(debito.key).toMatch(/^pokeru:/);
    expect(fake.balance).toBe(4989 - QUEUE_STAKES.pado.buyIn);
    // as fichas do jogo não foram tocadas: quem pagou foi a outra moeda
    expect(acc.list()[0].money).toBe(0);
    acc.close();
  }, 15_000);

  it('sem padocoins suficientes, ninguém senta', async () => {
    const fake = fakeGbot(10);
    const acc = new Accounts({ file: newFile(), gbot: fake.gbot });
    const lobby = new Lobby('Teste', acc, async () => vinculado);

    const got: ServerMsg[] = [];
    const conn = lobby.connect((m) => void got.push(m));
    conn.handle({ type: 'hello', name: 'Gabs', avatar: { color: '#fff', icon: '♠' }, cosmetics, jwt: 'jwt.valido' });
    await vi.advanceTimersByTimeAsync(50);
    conn.handle({ type: 'quickMatch', currency: 'pado' });
    await vi.advanceTimersByTimeAsync(80);

    const erros = got.filter((m) => m.type === 'error').map((m) => (m as { message: string }).message);
    expect(erros.join(' ')).toMatch(/Padocoins insuficientes/);
    acc.close();
  }, 15_000);

  it('a mesa de padocoin não faz rebuy automático', async () => {
    const fake = fakeGbot(4989);
    const acc = new Accounts({ file: newFile(), gbot: fake.gbot });
    const lobby = new Lobby('Teste', acc, async () => vinculado);
    const got: ServerMsg[] = [];
    const conn = lobby.connect((m) => void got.push(m));
    conn.handle({ type: 'hello', name: 'Gabs', avatar: { color: '#fff', icon: '♠' }, cosmetics, jwt: 'jwt.valido' });
    await vi.advanceTimersByTimeAsync(50);
    conn.handle({ type: 'quickMatch', currency: 'pado' });
    await vi.advanceTimersByTimeAsync(80);

    // um débito só: o da entrada. O rebuy em padocoin é ida à rede no meio da mão, e por isso
    // não existe — quem zera sai e entra de novo.
    expect(fake.movimentos.filter((m) => m.op === 'debit')).toHaveLength(1);
    acc.close();
  }, 15_000);
});
