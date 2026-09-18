import { afterEach, describe, expect, it, vi } from 'vitest';
import { Lobby, type Connection } from './lobby';
import { DEFAULT_SETTINGS, type RoomSettings, type ServerMsg, type TableView } from './protocol';
import type { PlayerAction } from './engine';

afterEach(() => {
  vi.useRealTimers();
});

interface Harness {
  conn: Connection;
  views: TableView[];
  events: string[];
  errors: string[];
}

/** Conecta um "humano" automático que responde à própria vez (apostas e trocas de carta). */
function autoPlayer(lobby: Lobby, name: string, pick?: (v: TableView) => PlayerAction, discards: number[] = [0, 1]): Harness {
  const h: Harness = { conn: null as unknown as Connection, views: [], events: [], errors: [] };
  h.conn = lobby.connect((m: ServerMsg) => {
    if (m.type === 'error') h.errors.push(m.message);
    if (m.type !== 'event') return;
    h.views.push(m.view);
    h.events.push(m.ev.t);
    if (m.ev.t === 'turn' && m.view.legal && m.view.toAct === m.view.mySeat) {
      const v = m.view;
      const l = v.legal!;
      const action: PlayerAction = pick
        ? pick(v)
        : l.canCheck
          ? { type: 'check' }
          : Math.random() < 0.6
            ? { type: 'call' }
            : { type: 'fold' };
      setTimeout(() => h.conn.handle({ type: 'action', action }), 5);
    }
    // poker de 5 cartas: a vez de trocar cartas
    if (m.ev.t === 'drawTurn' && m.view.toAct === m.view.mySeat) {
      setTimeout(() => h.conn.handle({ type: 'draw', discards }), 5);
    }
  });
  h.conn.handle({ type: 'hello', name, avatar: {}, cosmetics: {} });
  return h;
}

const fast: Partial<RoomSettings> = { pace: 0.4, turnTime: 5 };

/** Passa quando pode, paga quando não pode (nunca manda ação ilegal). */
const passive = (v: TableView): PlayerAction => (v.legal!.canCheck ? { type: 'check' } : { type: 'call' });

function totalChips(v: TableView): number {
  return v.seats.reduce((s, x) => s + (x ? x.stack + x.bet : 0), 0) + v.pot;
}

async function runUntil(cond: () => boolean, maxMs = 3_000_000) {
  for (let t = 0; t < maxMs && !cond(); t += 250) await vi.advanceTimersByTimeAsync(250);
}

describe('sala', () => {
  it('Sit & Go completo com bots termina e conserva fichas', async () => {
    vi.useFakeTimers();
    const lobby = new Lobby('teste');
    const p = autoPlayer(lobby, 'Tester');
    p.conn.handle({
      type: 'createRoom',
      settings: { ...DEFAULT_SETTINGS, ...fast, mode: 'sitgo', maxPlayers: 4, startingStack: 1000, smallBlind: 25, bigBlind: 50, blindLevelHands: 3 },
    });
    for (let i = 0; i < 3; i++) p.conn.handle({ type: 'addBot', difficulty: 'easy' });
    p.conn.handle({ type: 'startGame' });

    await runUntil(() => p.events.includes('gameOver'));

    expect(p.events).toContain('gameOver');
    expect(p.events.filter((e) => e === 'handStart').length).toBeGreaterThan(1);
    for (const v of p.views) expect(totalChips(v)).toBe(4000);
    expect(p.errors).toEqual([]);
    // partida inteira com bots (Monte Carlo): folga para máquinas carregadas
  }, 30_000);

  it('dois humanos: um sai no meio da mão e a mesa continua', async () => {
    vi.useFakeTimers();
    const lobby = new Lobby('teste');
    const a = autoPlayer(lobby, 'Ana');
    const b = autoPlayer(lobby, 'Beto', () => ({ type: 'call' }));
    a.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS, ...fast, maxPlayers: 3 } });
    const roomId = [...lobby.rooms.keys()][0];
    b.conn.handle({ type: 'joinRoom', roomId });
    a.conn.handle({ type: 'addBot', difficulty: 'normal' });
    a.conn.handle({ type: 'startGame' });

    await runUntil(() => a.events.filter((e) => e === 'deal').length >= 2);
    b.conn.close();
    const before = a.events.filter((e) => e === 'handStart').length;
    await runUntil(() => a.events.filter((e) => e === 'handStart').length >= before + 3);

    expect(a.events.filter((e) => e === 'handStart').length).toBeGreaterThanOrEqual(before + 3);
    const last = a.views[a.views.length - 1];
    expect(last.seats.filter(Boolean).length).toBe(2);
    expect(a.errors).toEqual([]);
  });

  it('sala é removida quando o último humano sai', async () => {
    vi.useFakeTimers();
    const lobby = new Lobby('teste');
    const a = autoPlayer(lobby, 'Solo');
    a.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS, ...fast } });
    a.conn.handle({ type: 'addBot', difficulty: 'hard' });
    a.conn.handle({ type: 'startGame' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(lobby.rooms.size).toBe(1);
    a.conn.handle({ type: 'leaveRoom' });
    expect(lobby.rooms.size).toBe(0);
  });

  it('personagem na rede é resolvido pelo id (arte sempre oficial)', () => {
    const lobby = new Lobby('teste');
    const rooms: { members: { id: string; isBot: boolean; name: string; character: { id: string; name: string; full: string } }[] }[] = [];
    const a = lobby.connect((m) => {
      if (m.type === 'room') rooms.push(m.room);
    });
    a.handle({ type: 'hello', name: 'Ana', avatar: {}, cosmetics: { character: { id: 'yukina', full: 'http://evil/x.png' } } });
    a.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS } });
    const me = rooms[rooms.length - 1].members.find((m) => m.id === a.id)!;
    expect(me.character.id).toBe('yukina');
    expect(me.character.full).toBe('/characters/yukina/full.png');
  });

  it('bots recebem personagens diferentes do meu', () => {
    const lobby = new Lobby('teste');
    const rooms: { members: { isBot: boolean; name: string; character: { id: string; name: string } }[] }[] = [];
    const a = lobby.connect((m) => {
      if (m.type === 'room') rooms.push(m.room);
    });
    a.handle({ type: 'hello', name: 'Ana', avatar: {}, cosmetics: { character: { id: 'marina' } } });
    a.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS } });
    for (let i = 0; i < 3; i++) a.handle({ type: 'addBot', difficulty: 'easy' });
    const bots = rooms[rooms.length - 1].members.filter((m) => m.isBot);
    expect(bots.every((b) => b.character.name === b.name)).toBe(true);
    expect(new Set(bots.map((b) => b.character.id)).size).toBe(3);
    expect(bots.some((b) => b.character.id === 'marina')).toBe(false);

    // mesa cheia (5 bots, 4 personagens): distribuição equilibrada
    for (let i = 0; i < 2; i++) a.handle({ type: 'addBot', difficulty: 'easy' });
    const all = rooms[rooms.length - 1].members.filter((m) => m.isBot);
    const count = new Map<string, number>();
    for (const b of all) count.set(b.character.id, (count.get(b.character.id) ?? 0) + 1);
    expect(all.length).toBe(5);
    expect(Math.max(...count.values())).toBeLessThanOrEqual(2);
    expect(all.some((b) => b.character.id === 'marina')).toBe(false);
    expect(all.every((b) => b.name.startsWith(b.character.name))).toBe(true);
  });

  it('pular a mao: corre o resto contra os bots e cai na mao seguinte', async () => {
    vi.useFakeTimers();
    const lobby = new Lobby('teste');
    // humano que sempre desiste
    const p = autoPlayer(lobby, 'Tester', () => ({ type: 'fold' }));
    p.conn.handle({
      type: 'createRoom',
      settings: { ...DEFAULT_SETTINGS, ...fast, mode: 'cash', maxPlayers: 3, startingStack: 1000, smallBlind: 25, bigBlind: 50 },
    });
    p.conn.handle({ type: 'addBot', difficulty: 'normal' });
    p.conn.handle({ type: 'addBot', difficulty: 'normal' });
    p.conn.handle({ type: 'startGame' });
    // estando na mao, o pedido e recusado
    await runUntil(() => p.views.length > 0);
    p.conn.handle({ type: 'skipHand' });
    expect(p.errors.some((e) => e.includes('ainda está na mão'))).toBe(true);

    // espera o momento exato em que eu ja desisti e a sala esta parada esperando a vez de um bot:
    // so nele o pedido de pular tem efeito (com a mao encerrada, a proxima corre no ritmo normal)
    const waitingBot = () => {
      const v = p.views[p.views.length - 1];
      return (
        p.events[p.events.length - 1] === 'turn' &&
        !!v &&
        v.mySeat !== null &&
        v.seats[v.mySeat]?.folded === true &&
        v.toAct !== null &&
        v.toAct !== v.mySeat
      );
    };
    await runUntil(waitingBot);
    expect(waitingBot()).toBe(true);
    const before = p.views[p.views.length - 1].handNo;
    const winsBefore = p.events.filter((e) => e === 'win').length;
    p.conn.handle({ type: 'skipHand' });
    await vi.advanceTimersByTimeAsync(1500);
    // a mao terminou (com vencedor anunciado) e a proxima ja comecou
    expect(p.events.filter((e) => e === 'win').length).toBeGreaterThan(winsBefore);
    expect(p.views[p.views.length - 1].handNo).toBeGreaterThan(before);
  });

  it('com outro humano na mesa, nao da para pular', async () => {
    vi.useFakeTimers();
    const lobby = new Lobby('teste');
    const a = autoPlayer(lobby, 'A');
    const b = autoPlayer(lobby, 'B');
    a.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS, ...fast, maxPlayers: 3 } });
    const roomId = [...lobby.rooms.keys()][0];
    b.conn.handle({ type: 'joinRoom', roomId });
    a.conn.handle({ type: 'startGame' });
    await runUntil(() => a.views.length > 0);
    a.conn.handle({ type: 'skipHand' });
    expect(a.errors.some((e) => e.includes('contra bots'))).toBe(true);
  });

  it('rejeita ação fora da vez', () => {
    const lobby = new Lobby('teste');
    const a = autoPlayer(lobby, 'Ana');
    a.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS } });
    a.conn.handle({ type: 'action', action: { type: 'call' } });
    expect(a.errors.length).toBe(1);
  });
});

describe('modo normal (rodadas fixas)', () => {
  it('termina no número de rodadas contratado e mostra o placar', async () => {
    vi.useFakeTimers();
    const lobby = new Lobby('teste');
    const p = autoPlayer(lobby, 'Tester', passive);
    p.conn.handle({
      type: 'createRoom',
      settings: { ...DEFAULT_SETTINGS, ...fast, mode: 'normal', rounds: 3, maxPlayers: 4, startingStack: 1000, smallBlind: 25, bigBlind: 50 },
    });
    for (let i = 0; i < 3; i++) p.conn.handle({ type: 'addBot', difficulty: 'easy' });
    p.conn.handle({ type: 'startGame' });

    await runUntil(() => p.events.includes('gameOver'));
    expect(p.events.filter((e) => e === 'handStart').length).toBe(3);
    for (const v of p.views) expect(totalChips(v)).toBe(4000);
    // a view diz de quantas rodadas é a partida (para o placar da tela)
    expect(p.views[p.views.length - 1].rounds).toBe(3);
    expect(p.errors).toEqual([]);

    // nada mais acontece depois do fim
    const after = p.events.length;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(p.events.length).toBe(after);
  }, 30_000);

  it('blinds não sobem e quem quebra é eliminado (sem rebuy)', async () => {
    vi.useFakeTimers();
    const lobby = new Lobby('teste');
    // humano all-in sempre: quebra rápido contra os bots
    const p = autoPlayer(lobby, 'Tester', () => ({ type: 'allin' }));
    p.conn.handle({
      type: 'createRoom',
      settings: { ...DEFAULT_SETTINGS, ...fast, mode: 'normal', rounds: 20, maxPlayers: 3, startingStack: 300, smallBlind: 25, bigBlind: 50, blindLevelHands: 2 },
    });
    for (let i = 0; i < 2; i++) p.conn.handle({ type: 'addBot', difficulty: 'easy' });
    p.conn.handle({ type: 'startGame' });

    await runUntil(() => p.events.includes('gameOver'));
    expect(p.events).not.toContain('blindsUp');
    expect(p.events).not.toContain('rebuy');
    const last = p.views[p.views.length - 1];
    expect(last.smallBlind).toBe(25);
    expect(last.bigBlind).toBe(50);
  }, 30_000);
});

describe('poker de 5 cartas (draw) na sala', () => {
  it('cinco cartas, troca no meio e mão terminada', async () => {
    vi.useFakeTimers();
    const lobby = new Lobby('teste');
    const p = autoPlayer(lobby, 'Tester', passive, [0, 2]);
    p.conn.handle({
      type: 'createRoom',
      settings: { ...DEFAULT_SETTINGS, ...fast, variant: 'draw5', mode: 'normal', rounds: 2, maxPlayers: 3, startingStack: 1000, smallBlind: 25, bigBlind: 50 },
    });
    for (let i = 0; i < 2; i++) p.conn.handle({ type: 'addBot', difficulty: 'easy' });
    p.conn.handle({ type: 'startGame' });

    await runUntil(() => p.events.includes('gameOver'));
    expect(p.errors).toEqual([]);
    // a mesa nunca teve bordo e a mão tem cinco cartas
    for (const v of p.views) {
      expect(v.variant).toBe('draw5');
      expect(v.board).toEqual([]);
      const me = v.mySeat !== null ? v.seats[v.mySeat] : null;
      if (me?.inHand && !me.folded && me.cards.length) expect(me.cards).toHaveLength(5);
    }
    // houve vez de trocar, troca de fato e a contagem apareceu na view
    expect(p.events).toContain('drawTurn');
    expect(p.events).toContain('draw');
    expect(p.views.some((v) => v.seats.some((x) => typeof x?.drew === 'number'))).toBe(true);
    // eu troquei duas cartas quando foi a minha vez
    expect(p.views.some((v) => v.mySeat !== null && v.seats[v.mySeat]?.drew === 2)).toBe(true);
    expect(p.events).toContain('win');
    for (const v of p.views) expect(totalChips(v)).toBe(3000);
  }, 30_000);

  it('apostar na hora da troca (e trocar fora dela) é recusado', async () => {
    vi.useFakeTimers();
    const lobby = new Lobby('teste');
    const p = autoPlayer(lobby, 'Tester', passive);
    p.conn.handle({
      type: 'createRoom',
      settings: { ...DEFAULT_SETTINGS, ...fast, variant: 'draw5', maxPlayers: 3, startingStack: 1000, smallBlind: 25, bigBlind: 50 },
    });
    for (let i = 0; i < 2; i++) p.conn.handle({ type: 'addBot', difficulty: 'easy' });
    p.conn.handle({ type: 'startGame' });

    // fora da fase de troca, o pedido é recusado
    await runUntil(() => p.views.length > 0);
    p.conn.handle({ type: 'draw', discards: [0] });
    expect(p.errors.some((e) => e.includes('trocar cartas') || e.includes('sua vez'))).toBe(true);

    // na vez de trocar, apostar é recusado
    const before = p.errors.length;
    await runUntil(() => p.views.some((v) => v.street === 'draw' && v.toAct === v.mySeat));
    p.conn.handle({ type: 'action', action: { type: 'check' } });
    expect(p.errors.length).toBeGreaterThan(before);
  }, 30_000);
});
