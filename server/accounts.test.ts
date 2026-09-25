import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_STATS } from '../shared/achievements';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AccountProfile } from '../shared/accounts';
import { Lobby } from '../shared/lobby';
import { DEFAULT_SETTINGS, type AccountInfo, type ServerMsg, type TableView } from '../shared/protocol';
import { BOND_POINTS } from '../shared/bond';
import { BOT_MATCH, CONSOLACAO_BOTS, CUSTOM_PADO_MIN, QUEUE_STAKES, RECOMECO_CUSTOM, type GanhoDaPartida } from '../shared/protocol';
import { sanitizeSettings } from '../shared/room';
import { playerLevel, xpForLevel } from '../shared/achievements';
import { personalidadeDe } from '../shared/personality';
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
    acc.note(a.id, 'hands');
    acc.note(a.id, 'wins');
    acc.note(a.id, 'matches');
    const info = acc.info(a.id)!;
    expect(info.bond.marina.points).toBe(BOND_POINTS.win + BOND_POINTS.loss);
    expect(info.bond.marina.wins).toBe(1);
    expect(info.bond.marina.losses).toBe(1);
    expect(info.bond.ren.folds).toBe(1);
    expect(info.stats).toEqual({ ...EMPTY_STATS, hands: 1, wins: 1, matches: 1 });
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

  /**
   * A personalidade é **observada**, não declarada.
   *
   * Este cliente de teste só passa e paga — nunca aposta. Se o resumo sair com agressão, alguma
   * coisa está contando a jogada errada, e o gráfico do perfil estaria mentindo sobre a pessoa.
   */
  it('a partida guarda o resumo de como o jogador jogou', async () => {
    vi.useFakeTimers();
    const accounts = new Accounts({ file: newFile(), startingMoney: 5000 });
    const lobby = new Lobby('teste', accounts);
    const p = client(lobby, 'Gabi');
    p.conn.handle({
      type: 'createRoom',
      settings: { ...DEFAULT_SETTINGS, ...fast, mode: 'normal', rounds: 3, maxPlayers: 3, startingStack: 1000, smallBlind: 25, bigBlind: 50 },
    });
    for (let i = 0; i < 2; i++) p.conn.handle({ type: 'addBot', difficulty: 'easy' });
    p.conn.handle({ type: 'startGame' });

    await runUntil(() => p.events.includes('gameOver'));
    await vi.advanceTimersByTimeAsync(500);

    const acc = accounts.info(p.account!.id)!;
    expect(acc.play).toHaveLength(1);
    const r = acc.play[0];
    expect(r.maos).toBeGreaterThanOrEqual(1);
    expect(r.pagadas + r.passadas).toBeGreaterThan(0);
    // ele nunca apostou: o resumo não pode inventar agressão nem blefe
    expect(r.agressoes).toBe(0);
    expect(r.blefes).toBe(0);
    expect(personalidadeDe(r).agressao).toBeLessThan(0.5);
    // a ficha da partida, que é o que o histórico do perfil mostra
    expect(r.jogadores).toBe(3);
    expect(r.lugar).toBeGreaterThanOrEqual(1);
    expect(r.lugar).toBeLessThanOrEqual(3);
    expect(r.personagem).toBe('marina');
    // o saldo é o que sobrou em cima da pilha inicial: perde no máximo os 1.000 que levou,
    // e ganha no máximo os 2.000 dos outros dois
    expect(r.saldo).toBeGreaterThanOrEqual(-1000);
    expect(r.saldo).toBeLessThanOrEqual(2000);
    // e o bot da mesa não entra em conta nenhuma: a personalidade dele já está escrita
    expect(accounts.count).toBe(1);
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

/**
 * A partida contra bots: a mesa do botão do menu.
 *
 * Três regras valem dinheiro e são conferidas **aqui**, não no cliente: a trava por nível (um
 * cliente modificado pediria o difícil no nível 1 e sentaria numa mesa de dez mil), o recomeço de
 * quem quebrou, e o "termine para levar".
 */
describe('partida contra bots no servidor', () => {
  /** Sobe o nível da conta até `alvo` pelos contadores (uma mão vale 1 de xp). */
  function subirNivel(accounts: Accounts, id: string, alvo: number): void {
    for (let i = 0; i < xpForLevel(alvo); i++) accounts.note(id, 'hands');
    expect(playerLevel(accounts.info(id)!.stats)).toBeGreaterThanOrEqual(alvo);
  }

  it('o difícil não abre no nível 1, e a mesa não é montada', async () => {
    vi.useFakeTimers();
    const accounts = new Accounts({ file: newFile(), startingMoney: 100_000 });
    const lobby = new Lobby('teste', accounts);
    const p = client(lobby, 'Gabi');
    p.conn.handle({ type: 'botMatch', difficulty: 'hard', currency: 'chips' });
    await vi.advanceTimersByTimeAsync(200);

    expect(p.errors.join(' ')).toMatch(/nível 20/);
    expect(lobby.rooms.size).toBe(0);
    // e o saldo não foi tocado
    expect(accounts.money(p.account!.id)).toBe(100_000);
    accounts.close();
  });

  it('o fácil abre para qualquer um: mesa de mil fichas, três bots e dez rodadas', async () => {
    vi.useFakeTimers();
    const accounts = new Accounts({ file: newFile(), startingMoney: 5000 });
    const lobby = new Lobby('teste', accounts);
    const p = client(lobby, 'Gabi');
    p.conn.handle({ type: 'botMatch', difficulty: 'easy', currency: 'chips' });
    await vi.advanceTimersByTimeAsync(200);

    expect(p.errors).toEqual([]);
    const room = [...lobby.rooms.values()][0];
    expect(room.settings.startingStack).toBe(1000);
    expect(room.settings.bigBlind).toBe(100);
    expect(room.settings.rounds).toBe(BOT_MATCH.rounds);
    expect(room.summary().bots).toBe(BOT_MATCH.bots);
    // o buy-in saiu do saldo
    expect(accounts.money(p.account!.id)).toBe(4000);
    accounts.close();
  });

  it('subindo de nível, o normal abre — com a mesa dele', async () => {
    vi.useFakeTimers();
    const accounts = new Accounts({ file: newFile(), startingMoney: 5000 });
    const lobby = new Lobby('teste', accounts);
    const p = client(lobby, 'Gabi');
    const id = p.account!.id;
    p.conn.handle({ type: 'botMatch', difficulty: 'normal', currency: 'chips' });
    await vi.advanceTimersByTimeAsync(200);
    expect(p.errors.join(' ')).toMatch(/nível 5/);

    subirNivel(accounts, id, 5);
    p.conn.handle({ type: 'botMatch', difficulty: 'normal', currency: 'chips' });
    await vi.advanceTimersByTimeAsync(200);

    const room = [...lobby.rooms.values()][0];
    expect(room.settings.startingStack).toBe(2000);
    expect(room.settings.bigBlind).toBe(200);
    accounts.close();
  });

  it('quem não tem fichas senta de graça no fácil, e só no fácil', async () => {
    vi.useFakeTimers();
    const accounts = new Accounts({ file: newFile(), startingMoney: 0, faucet: 0 });
    const lobby = new Lobby('teste', accounts);
    const p = client(lobby, 'Gabi');
    const id = p.account!.id;
    expect(accounts.money(id)).toBe(0);

    // o normal (mesmo liberado) não tem de onde cobrar
    subirNivel(accounts, id, 5);
    p.conn.handle({ type: 'botMatch', difficulty: 'normal', currency: 'chips' });
    await vi.advanceTimersByTimeAsync(200);
    expect(p.errors.join(' ')).toMatch(/[Ss]aldo insuficiente/);

    // o fácil é o recomeço: senta com a pilha do degrau, sem pagar
    p.conn.handle({ type: 'botMatch', difficulty: 'easy', currency: 'chips' });
    await vi.advanceTimersByTimeAsync(200);
    const room = [...lobby.rooms.values()][0];
    expect(room.chipsOf(id)).toBe(1000);
    expect(accounts.money(id)).toBe(0);
    accounts.close();
  });

  it('sair no meio deixa as fichas na mesa; a partida tem de terminar', async () => {
    vi.useFakeTimers();
    const accounts = new Accounts({ file: newFile(), startingMoney: 5000 });
    const lobby = new Lobby('teste', accounts);
    const p = client(lobby, 'Gabi');
    const id = p.account!.id;
    p.conn.handle({ type: 'botMatch', difficulty: 'easy', currency: 'chips' });
    await runUntil(() => p.events.includes('handStart'));
    expect(accounts.money(id)).toBe(4000);

    // levanta no meio: as mil fichas ficam lá
    p.conn.handle({ type: 'leaveRoom' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(accounts.money(id)).toBe(4000);
    accounts.close();
  }, 30_000);

  it('terminando a partida, o que sobrou na mesa volta para o saldo', async () => {
    vi.useFakeTimers();
    const accounts = new Accounts({ file: newFile(), startingMoney: 5000 });
    const lobby = new Lobby('teste', accounts);
    const p = client(lobby, 'Gabi');
    const id = p.account!.id;
    p.conn.handle({ type: 'botMatch', difficulty: 'easy', currency: 'chips' });
    await runUntil(() => p.events.includes('gameOver'));
    await vi.advanceTimersByTimeAsync(500);

    // ganhou ou perdeu, mas nada ficou preso na mesa
    expect(accounts.info(id)!.inPlay).toBe(0);
    expect(accounts.money(id)).toBeGreaterThanOrEqual(4000);
    accounts.close();
  }, 60_000);

  /**
   * Um jogador que vai de all-in em toda mão, guardando os eventos crus: com dez big blinds de
   * pilha contra três bots, ele quebra depressa — ou dobra, e aí a partida seguinte tenta de novo.
   */
  function allIn(lobby: Lobby) {
    const c = { conn: null as never as ReturnType<Lobby['connect']>, account: null as AccountInfo | null, seat: -1, eventos: [] as { t: string; seat?: number; ganhos?: GanhoDaPartida[] }[] };
    c.conn = lobby.connect((m: ServerMsg) => {
      if (m.type === 'account') c.account = m.account;
      if (m.type === 'event') {
        c.seat = m.view.mySeat ?? c.seat;
        c.eventos.push(m.ev as never);
        if (m.ev.t === 'turn' && m.view.legal && m.view.toAct === m.view.mySeat) setTimeout(() => c.conn.handle({ type: 'action', action: { type: 'allin' } }), 5);
      }
    });
    c.conn.handle({ type: 'hello', name: 'Gabi', avatar: {}, cosmetics: {} });
    return c;
  }

  /**
   * Joga partidas contra bots até a pessoa quebrar numa delas; devolve os eventos dessa partida.
   * `antes` roda antes de cada tentativa (o teste do recomeço zera o saldo ali).
   */
  async function ateQuebrar(c: ReturnType<typeof allIn>, antes?: () => void) {
    for (let tentativa = 0; tentativa < 12; tentativa++) {
      antes?.();
      c.eventos = [];
      c.conn.handle({ type: 'botMatch', difficulty: 'easy', currency: 'chips' });
      await runUntil(() => c.eventos.some((e) => e.t === 'gameOver'));
      await vi.advanceTimersByTimeAsync(500);
      if (c.eventos.some((e) => e.t === 'bust' && e.seat === c.seat)) return c.eventos;
      c.conn.handle({ type: 'leaveRoom' });
      await vi.advanceTimersByTimeAsync(200);
    }
    throw new Error('não quebrou em doze partidas');
  }

  it('quebrar contra bots encerra a partida ali, e quem pagou o buy-in leva a consolação', async () => {
    vi.useFakeTimers();
    const accounts = new Accounts({ file: newFile(), startingMoney: 1_000_000 });
    const lobby = new Lobby('teste', accounts);
    const c = allIn(lobby);
    const id = c.account!.id;
    const antes = accounts.money(id);
    const eventos = await ateQuebrar(c);

    // a partida acabou na mão em que a pessoa quebrou: depois do bust dela não começa mão nenhuma
    const quebrou = eventos.findIndex((e) => e.t === 'bust' && e.seat === c.seat);
    const depois = eventos.slice(quebrou);
    expect(depois.some((e) => e.t === 'handStart')).toBe(false);
    expect(depois.some((e) => e.t === 'gameOver')).toBe(true);

    // o fim traz a consolação, e ela entrou no saldo (as partidas anteriores podem ter dado lucro)
    const fim = eventos.find((e) => e.t === 'gameOver')!;
    const meu = fim.ganhos!.find((g) => g.seat === c.seat)!;
    expect(meu.consolacao).toBe(CONSOLACAO_BOTS);
    expect(accounts.money(id)).toBeGreaterThanOrEqual(antes - 1000 * 12 + CONSOLACAO_BOTS);
    accounts.close();
  }, 120_000);

  it('no recomeço de graça, quebrar não dá consolação', async () => {
    vi.useFakeTimers();
    // sem saldo e sem recarga: o fácil senta de graça
    const accounts = new Accounts({ file: newFile(), startingMoney: 0, faucet: 0 });
    const lobby = new Lobby('teste', accounts);
    const c = allIn(lobby);
    const id = c.account!.id;
    // se uma partida terminar sem quebra ele sai dela com fichas, e a seguinte já seria paga: o
    // saldo volta a zero antes de cada tentativa, para a quebra acontecer mesmo na mesa de graça
    const eventos = await ateQuebrar(c, () => void accounts.charge(id, accounts.money(id)));
    const meu = eventos.find((e) => e.t === 'gameOver')!.ganhos!.find((g) => g.seat === c.seat)!;
    expect(meu.consolacao).toBe(0);
    expect(accounts.money(id)).toBe(0);
    accounts.close();
  }, 120_000);

  it('o fim da partida traz o xp dela, parcela por parcela, e o antes e o depois da conta', async () => {
    vi.useFakeTimers();
    const accounts = new Accounts({ file: newFile(), startingMoney: 1_000_000 });
    const lobby = new Lobby('teste', accounts);
    const c = allIn(lobby);
    const id = c.account!.id;
    const eventos = await ateQuebrar(c);
    const meu = eventos.find((e) => e.t === 'gameOver')!.ganhos!.find((g) => g.seat === c.seat)!;
    const maos = eventos.filter((e) => e.t === 'handStart').length;

    expect(meu.jogadas).toBe(maos);
    expect(meu.xp.maos).toBe(maos);
    expect(meu.xp.vitorias).toBe(meu.ganhas * 3);
    expect(meu.xp.partida).toBe(10);
    // quem quebrou não é campeão
    expect(meu.xp.campeao).toBe(0);
    expect(meu.xp.total).toBe(meu.xp.maos + meu.xp.vitorias + meu.xp.partida + meu.xp.campeao);
    expect(meu.xpDepois - meu.xpAntes).toBe(meu.xp.total);
    expect(meu.xpDepois).toBe(accounts.xp(id));
    accounts.close();
  }, 120_000);

  it('numa mesa Custom, levantar devolve o que sobrou', async () => {
    vi.useFakeTimers();
    const accounts = new Accounts({ file: newFile(), startingMoney: 5000 });
    const lobby = new Lobby('teste', accounts);
    const p = client(lobby, 'Gabi');
    const id = p.account!.id;
    // é o que a tela Custom manda: modo normal, mas mesa de amigo
    p.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS, ...fast, mode: 'normal', buyIn: 1000, startingStack: 1000 } });
    await vi.advanceTimersByTimeAsync(100);
    expect(accounts.money(id)).toBe(4000);

    p.conn.handle({ type: 'leaveRoom' });
    await vi.advanceTimersByTimeAsync(200);
    expect(accounts.money(id)).toBe(5000);
    accounts.close();
  });
});

describe('mesa Custom: padocoin e recomeço', () => {
  it('Custom em padocoin custa pelo menos o piso, e a da fila não é afetada', () => {
    expect(sanitizeSettings({ currency: 'pado', buyIn: 100 }).buyIn).toBe(CUSTOM_PADO_MIN);
    expect(sanitizeSettings({ currency: 'pado', buyIn: 0 }).buyIn).toBe(CUSTOM_PADO_MIN);
    expect(sanitizeSettings({ currency: 'pado', buyIn: 5000 }).buyIn).toBe(5000);
    // fichas continuam podendo ser livres
    expect(sanitizeSettings({ currency: 'chips', buyIn: 0 }).buyIn).toBe(0);
  });

  it('sem fichas, senta de graça na Custom de mil — e levantar na hora não rende nada', async () => {
    vi.useFakeTimers();
    const accounts = new Accounts({ file: newFile(), startingMoney: 0, faucet: 0 });
    const lobby = new Lobby('teste', accounts);
    const p = client(lobby, 'Sem Fichas');
    const id = p.account!.id;
    p.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS, ...fast, mode: 'cash', buyIn: RECOMECO_CUSTOM, startingStack: RECOMECO_CUSTOM } });
    await vi.advanceTimersByTimeAsync(100);
    expect(p.errors).toEqual([]);
    const room = [...lobby.rooms.values()][0];
    expect(room.chipsOf(id)).toBe(RECOMECO_CUSTOM);

    // a pilha é adiantamento: levantando sem ter ganhado nada, o saldo continua zero
    p.conn.handle({ type: 'leaveRoom' });
    await vi.advanceTimersByTimeAsync(200);
    expect(accounts.money(id)).toBe(0);
    accounts.close();
  });

  it('o recomeço é só na mesa de mil: numa de dois mil, sem fichas, não senta', async () => {
    vi.useFakeTimers();
    const accounts = new Accounts({ file: newFile(), startingMoney: 0, faucet: 0 });
    const lobby = new Lobby('teste', accounts);
    const p = client(lobby, 'Sem Fichas');
    p.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS, ...fast, mode: 'cash', buyIn: 2000, startingStack: 2000 } });
    await vi.advanceTimersByTimeAsync(100);
    expect(p.errors.join(' ')).toMatch(/[Ss]aldo insuficiente/);
    accounts.close();
  });
});

describe('fila rápida', () => {
  it('sair da fila no meio da mão leva as fichas que estavam atrás', async () => {
    vi.useFakeTimers();
    const accounts = new Accounts({ file: newFile(), startingMoney: 10_000 });
    const lobby = new Lobby('teste', accounts);
    const p = client(lobby, 'Gabi');
    const id = p.account!.id;
    p.conn.handle({ type: 'quickMatch', currency: 'chips' });
    await runUntil(() => p.events.includes('handStart'));
    expect(accounts.money(id)).toBe(10_000 - QUEUE_STAKES.chips.buyIn);

    // levanta com a mão rolando: a mesa (só ela e bots) some, mas as fichas voltam
    p.conn.handle({ type: 'leaveRoom' });
    await vi.advanceTimersByTimeAsync(500);
    expect(lobby.rooms.size).toBe(0);
    // perde no máximo o que já tinha posto no pote da mão
    expect(accounts.money(id)).toBeGreaterThan(10_000 - QUEUE_STAKES.chips.buyIn);
    accounts.close();
  }, 60_000);

  it('quatro amigos entrando um depois do outro caem na mesma mesa', async () => {
    vi.useFakeTimers();
    const accounts = new Accounts({ file: newFile(), startingMoney: 10_000 });
    const lobby = new Lobby('teste', accounts);
    const amigos = ['Ana', 'Bia', 'Cau', 'Duda'].map((n) => client(lobby, n));
    for (const a of amigos) {
      a.conn.handle({ type: 'quickMatch', currency: 'chips' });
      // cada um entra com a mesa já jogando (a mão em andamento é o que prendia os bots)
      await runUntil(() => a.events.includes('handStart'), 200_000);
    }
    const salas = new Set([...lobby.rooms.values()].filter((r) => amigos.some((a) => r.chipsOf(a.account!.id) > 0)).map((r) => r.id));
    expect(salas.size).toBe(1);
    accounts.close();
  }, 120_000);
});

describe('nome', () => {
  it('mudar de nome no meio da sessão grava na conta', async () => {
    vi.useFakeTimers();
    const accounts = new Accounts({ file: newFile(), startingMoney: 1000 });
    const lobby = new Lobby('teste', accounts);
    const p = client(lobby, 'Antigo');
    const id = p.account!.id;
    p.conn.handle({ type: 'updateProfile', name: 'Novo Nome', avatar: {}, cosmetics: {} });
    await vi.advanceTimersByTimeAsync(50);
    expect(accounts.info(id)!.name).toBe('Novo Nome');
    accounts.close();
  });
});
