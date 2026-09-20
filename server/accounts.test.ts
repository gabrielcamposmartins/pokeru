import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AccountProfile } from '../shared/accounts';
import { Lobby } from '../shared/lobby';
import { DEFAULT_SETTINGS, type AccountInfo, type ServerMsg, type TableView } from '../shared/protocol';
import { BOND_POINTS } from '../shared/bond';
import { Accounts } from './accounts';

const dirs: string[] = [];
function newFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pokeru-'));
  dirs.push(dir);
  return join(dir, 'accounts.json');
}

const profile = {
  name: 'Gabi',
  avatar: { color: '#fff', icon: '♠' },
  cosmetics: { character: { id: 'marina' } },
} as unknown as AccountProfile;

afterEach(() => {
  vi.useRealTimers();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('contas do servidor', () => {
  it('cria a conta com saldo e devolve o token só uma vez', () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 5000 });
    const a = acc.login(undefined, profile)!;
    expect(a.id).toMatch(/^a-/);
    expect(a.money).toBe(5000);
    expect(a.token).toBeTruthy();
    // a foto normal (para a tela) não leva o token
    expect(acc.info(a.id)!.token).toBeUndefined();
    acc.close();
  });

  it('o token traz o jogador de volta à mesma conta; token errado cria outra', () => {
    const acc = new Accounts({ file: newFile() });
    const a = acc.login(undefined, profile)!;
    acc.charge(a.id, 1000);

    const again = acc.login({ id: a.id, token: a.token! }, { ...profile, name: 'Gabi 2' })!;
    expect(again.id).toBe(a.id);
    expect(again.money).toBe(a.money - 1000);
    expect(again.name).toBe('Gabi 2'); // o nome acompanha o perfil do cliente

    const impostor = acc.login({ id: a.id, token: 'chute' }, profile)!;
    expect(impostor.id).not.toBe(a.id);
    expect(impostor.token).toBeTruthy();
    expect(acc.count).toBe(2);
    acc.close();
  });

  it('cobra, devolve e não deixa gastar o que não tem', () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 1000, faucet: 0 });
    const a = acc.login(undefined, profile)!;
    expect(acc.charge(a.id, 400)).toBe(400);
    expect(acc.money(a.id)).toBe(600);
    expect(acc.charge(a.id, 700)).toBe(0); // não dá: nada é cobrado
    expect(acc.money(a.id)).toBe(600);
    acc.credit(a.id, 900);
    expect(acc.money(a.id)).toBe(1500);
    acc.close();
  });

  it('a recarga de cortesia só entra com a conta zerada e sem fichas em mesa', () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 100, faucet: 500 });
    const a = acc.login(undefined, profile)!;
    acc.charge(a.id, 100);
    expect(acc.money(a.id)).toBe(0);
    // ainda tem fichas numa mesa: não recarrega
    acc.inPlayOf = () => 100;
    expect(acc.charge(a.id, 50)).toBe(0);
    // saiu da mesa: a próxima cobrança recarrega e cobra
    acc.inPlayOf = () => 0;
    expect(acc.charge(a.id, 50)).toBe(50);
    expect(acc.money(a.id)).toBe(450);
    acc.close();
  });

  it('guarda o vínculo por personagem e os números da conta', () => {
    const acc = new Accounts({ file: newFile() });
    const a = acc.login(undefined, profile)!;
    acc.bond(a.id, 'marina', 'win');
    acc.bond(a.id, 'marina', 'loss');
    acc.bond(a.id, 'ren', 'fold');
    acc.note(a.id, 'hand');
    acc.note(a.id, 'win');
    acc.note(a.id, 'match');
    const info = acc.info(a.id)!;
    expect(info.bond.marina.points).toBe(BOND_POINTS.win + BOND_POINTS.loss);
    expect(info.bond.marina.wins).toBe(1);
    expect(info.bond.marina.losses).toBe(1);
    expect(info.bond.ren.folds).toBe(1);
    expect(info.stats).toEqual({ hands: 1, wins: 1, matches: 1 });
    acc.close();
  });

  it('os dados sobrevivem ao reinício do servidor', () => {
    const file = newFile();
    const first = new Accounts({ file, startingMoney: 3000 });
    const a = first.login(undefined, profile)!;
    first.charge(a.id, 500);
    first.bond(a.id, 'tobi', 'bigWin');
    first.close(); // grava na hora, como no desligamento

    const second = new Accounts({ file });
    const back = second.login({ id: a.id, token: a.token! }, profile)!;
    expect(back.id).toBe(a.id);
    expect(back.money).toBe(2500);
    expect(back.bond.tobi.points).toBe(BOND_POINTS.bigWin);
    second.close();
  });

  it('com o teto de contas atingido, ninguém mais recebe conta', () => {
    const acc = new Accounts({ file: newFile(), maxAccounts: 1 });
    const first = acc.login(undefined, profile)!;
    expect(first.id).toBeTruthy();
    expect(acc.login(undefined, profile)).toBeNull();
    // quem já tem conta continua entrando nela
    expect(acc.login({ id: first.id, token: first.token! }, profile)!.id).toBe(first.id);
    acc.close();
  });

  it('presente do administrador soma ao saldo', () => {
    const acc = new Accounts({ file: newFile(), startingMoney: 0 });
    const a = acc.login(undefined, profile)!;
    expect(acc.gift(a.id, 250)).toBe(true);
    expect(acc.money(a.id)).toBe(250);
    expect(acc.gift('a-naoexiste', 250)).toBe(false);
    expect(acc.list()[0]).toMatchObject({ id: a.id, money: 250 });
    acc.close();
  });
});

// ------------------------------------------------------------------ mesa a dinheiro

interface Client {
  conn: ReturnType<Lobby['connect']>;
  account: AccountInfo | null;
  views: TableView[];
  events: string[];
  errors: string[];
}

/** Liga um cliente ao lobby, guardando a última foto da conta. */
function client(lobby: Lobby, name: string): Client {
  const c: Client = { conn: null as never, account: null, views: [], events: [], errors: [] };
  c.conn = lobby.connect((m: ServerMsg) => {
    if (m.type === 'account') c.account = m.account;
    if (m.type === 'error') c.errors.push(m.message);
    if (m.type === 'event') {
      c.events.push(m.ev.t);
      c.views.push(m.view);
      if (m.ev.t === 'turn' && m.view.legal && m.view.toAct === m.view.mySeat) {
        const l = m.view.legal;
        setTimeout(() => c.conn.handle({ type: 'action', action: l.canCheck ? { type: 'check' } : { type: 'call' } }), 5);
      }
    }
  });
  c.conn.handle({ type: 'hello', name, avatar: {}, cosmetics: {} });
  return c;
}

const fast = { pace: 0.4, turnTime: 5 };

async function runUntil(cond: () => boolean, maxMs = 300_000) {
  for (let t = 0; t < maxMs && !cond(); t += 250) await vi.advanceTimersByTimeAsync(250);
}

describe('mesa a dinheiro', () => {
  it('sentar custa o buy-in e sair devolve as fichas', async () => {
    vi.useFakeTimers();
    const accounts = new Accounts({ file: newFile(), startingMoney: 2000 });
    const lobby = new Lobby('teste', accounts);
    accounts.inPlayOf = (id) => [...lobby.rooms.values()].reduce((t, r) => t + r.chipsOf(id), 0);
    const p = client(lobby, 'Gabi');
    expect(p.account!.money).toBe(2000);

    p.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS, ...fast, buyIn: 500, maxPlayers: 3 } });
    await vi.advanceTimersByTimeAsync(100);
    expect(p.account!.money).toBe(1500);
    expect(p.account!.inPlay).toBe(500);

    p.conn.handle({ type: 'leaveRoom' });
    await vi.advanceTimersByTimeAsync(100);
    expect(p.account!.money).toBe(2000);
    expect(p.account!.inPlay).toBe(0);
    accounts.close();
  });

  it('sem saldo, o servidor recusa a mesa', async () => {
    vi.useFakeTimers();
    const accounts = new Accounts({ file: newFile(), startingMoney: 100, faucet: 0 });
    const lobby = new Lobby('teste', accounts);
    const p = client(lobby, 'Gabi');
    p.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS, ...fast, buyIn: 500 } });
    await vi.advanceTimersByTimeAsync(100);
    expect(p.errors.some((e) => e.includes('Saldo insuficiente'))).toBe(true);
    expect(p.account!.money).toBe(100);
    accounts.close();
  });

  it('a partida move dinheiro de verdade e pontua o vínculo na conta', async () => {
    vi.useFakeTimers();
    const accounts = new Accounts({ file: newFile(), startingMoney: 5000 });
    const lobby = new Lobby('teste', accounts);
    accounts.inPlayOf = (id) => [...lobby.rooms.values()].reduce((t, r) => t + r.chipsOf(id), 0);
    const p = client(lobby, 'Gabi');
    p.conn.handle({
      type: 'createRoom',
      settings: { ...DEFAULT_SETTINGS, ...fast, mode: 'normal', rounds: 2, buyIn: 1000, maxPlayers: 3, smallBlind: 25, bigBlind: 50 },
    });
    for (let i = 0; i < 2; i++) p.conn.handle({ type: 'addBot', difficulty: 'easy' });
    p.conn.handle({ type: 'startGame' });

    for (let t = 0; t < 300_000 && !p.events.includes('gameOver'); t += 250) await vi.advanceTimersByTimeAsync(250);
    await vi.advanceTimersByTimeAsync(500);

    const acc = accounts.info(p.account!.id)!;
    // as duas rodadas renderam vínculo com o personagem e contaram nas estatísticas
    expect(acc.bond.marina.points).toBeGreaterThan(0);
    expect(acc.bond.marina.hands).toBeGreaterThanOrEqual(1); // quebrar na 1ª rodada deixa só uma mão
    expect(acc.bond.marina.hands).toBeLessThanOrEqual(2);
    expect(acc.bond.marina.matches).toBe(1);
    expect(acc.stats.hands).toBe(acc.bond.marina.hands);
    expect(acc.stats.matches).toBe(1);
    // o saldo voltou com o que sobrou na mesa (ganhou ou perdeu, mas nada ficou preso)
    expect(acc.inPlay).toBe(0);
    expect(acc.money).toBeGreaterThanOrEqual(4000);
    expect(acc.money).toBeLessThanOrEqual(7000);
    expect(p.errors).toEqual([]);
    accounts.close();
  }, 30_000);

  it('o vínculo vai para o personagem com que a mão foi jogada', async () => {
    vi.useFakeTimers();
    const accounts = new Accounts({ file: newFile(), startingMoney: 5000 });
    const lobby = new Lobby('teste', accounts);
    const p = client(lobby, 'Gabi');
    p.conn.handle({
      type: 'createRoom',
      settings: { ...DEFAULT_SETTINGS, ...fast, mode: 'normal', rounds: 1, maxPlayers: 3, smallBlind: 25, bigBlind: 50 },
    });
    for (let i = 0; i < 2; i++) p.conn.handle({ type: 'addBot', difficulty: 'easy' });
    p.conn.handle({ type: 'startGame' });

    // troca de personagem no meio da mão: os pontos são de quem começou a mão
    await runUntil(() => p.events.includes('deal'));
    p.conn.handle({ type: 'updateProfile', name: 'Gabi', avatar: {}, cosmetics: { character: { id: 'yukina' } } });
    await runUntil(() => p.events.includes('gameOver'));
    await vi.advanceTimersByTimeAsync(500);

    const acc = accounts.info(p.account!.id)!;
    expect(acc.bond.marina?.hands).toBe(1);
    expect(acc.bond.yukina).toBeUndefined();
    accounts.close();
  }, 30_000);

  it('ao desligar, o servidor devolve as fichas de quem estava na mesa', async () => {
    vi.useFakeTimers();
    const accounts = new Accounts({ file: newFile(), startingMoney: 2000 });
    const lobby = new Lobby('teste', accounts);
    const p = client(lobby, 'Gabi');
    p.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS, ...fast, buyIn: 800 } });
    await vi.advanceTimersByTimeAsync(100);
    expect(accounts.money(p.account!.id)).toBe(1200);

    // é o que o servidor faz no SIGTERM
    for (const room of lobby.rooms.values()) room.cashOutAll();
    expect(accounts.money(p.account!.id)).toBe(2000);
    accounts.close();
  });
});
