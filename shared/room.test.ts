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

/** Conecta um "humano" automático que responde à própria vez. */
function autoPlayer(lobby: Lobby, name: string, pick?: (v: TableView) => PlayerAction): Harness {
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
  });
  h.conn.handle({ type: 'hello', name, avatar: {}, cosmetics: {} });
  return h;
}

const fast: Partial<RoomSettings> = { pace: 0.4, turnTime: 5 };

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

  it('rejeita ação fora da vez', () => {
    const lobby = new Lobby('teste');
    const a = autoPlayer(lobby, 'Ana');
    a.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS } });
    a.conn.handle({ type: 'action', action: { type: 'call' } });
    expect(a.errors.length).toBe(1);
  });
});
