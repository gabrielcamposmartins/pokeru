import { afterEach, describe, expect, it, vi } from 'vitest';
import { Lobby, type Connection } from './lobby';
import { DEFAULT_SETTINGS, type RoomInfo, type RoomSettings, type ServerMsg, type TableView } from './protocol';
import { PAUSA_MAX_MS, PAUSA_VOTO_MS } from './pausa';

afterEach(() => {
  vi.useRealTimers();
});

interface Jogador {
  conn: Connection;
  eventos: string[];
  room: RoomInfo | null;
  erros: string[];
  saiu: { motivo?: string } | null;
}

/** Um humano que joga sozinho (passa quando pode, paga quando não pode) e guarda o que a mesa manda. */
function jogador(lobby: Lobby, nome: string): Jogador {
  const j: Jogador = { conn: null as unknown as Connection, eventos: [], room: null, erros: [], saiu: null };
  j.conn = lobby.connect((m: ServerMsg) => {
    if (m.type === 'error') j.erros.push(m.message);
    if (m.type === 'room') j.room = m.room;
    if (m.type === 'left') j.saiu = { motivo: m.motivo };
    if (m.type !== 'event') return;
    j.eventos.push(m.ev.t);
    const v: TableView = m.view;
    if (m.ev.t === 'turn' && v.legal && v.toAct === v.mySeat) {
      const action = v.legal.canCheck ? ({ type: 'check' } as const) : ({ type: 'call' } as const);
      setTimeout(() => j.conn.handle({ type: 'action', action }), 5);
    }
  });
  j.conn.handle({ type: 'hello', name: nome, avatar: {}, cosmetics: {} });
  return j;
}

const rapido: Partial<RoomSettings> = { pace: 0.4, turnTime: 5, mode: 'cash', startingStack: 100_000 };

async function ate(cond: () => boolean, maxMs = 600_000) {
  for (let t = 0; t < maxMs && !cond(); t += 250) await vi.advanceTimersByTimeAsync(250);
}

const maos = (j: Jogador) => j.eventos.filter((e) => e === 'handStart').length;

describe('pausa da mesa', () => {
  it('sozinho contra bots: a pausa vale na hora, mas a mesa só para no fim da mão', async () => {
    vi.useFakeTimers();
    const lobby = new Lobby('teste');
    const a = jogador(lobby, 'Ana');
    a.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS, ...rapido, maxPlayers: 3 } });
    a.conn.handle({ type: 'addBot', difficulty: 'easy' });
    a.conn.handle({ type: 'addBot', difficulty: 'easy' });
    a.conn.handle({ type: 'startGame' });
    await ate(() => a.eventos.includes('deal'));

    a.conn.handle({ type: 'pausa', acao: 'pedir' });
    // no meio da mão: aprovada, esperando a mão acabar
    expect(a.room?.pausa?.estado).toBe('aguardando');
    await ate(() => a.room?.pausa?.estado === 'pausada');
    expect(a.room?.pausa?.estado).toBe('pausada');

    // parada: meia hora sem mão nova
    const antes = maos(a);
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(maos(a)).toBe(antes);

    // qualquer um retoma, e as mãos voltam
    a.conn.handle({ type: 'pausa', acao: 'retomar' });
    expect(a.room?.pausa ?? null).toBeNull();
    await ate(() => maos(a) > antes);
    expect(maos(a)).toBeGreaterThan(antes);
    expect(a.erros).toEqual([]);
  }, 30_000);

  it('com dois jogadores, só pausa quando os dois aceitam; uma recusa derruba o pedido', async () => {
    vi.useFakeTimers();
    const lobby = new Lobby('teste');
    const a = jogador(lobby, 'Ana');
    const b = jogador(lobby, 'Beto');
    a.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS, ...rapido, maxPlayers: 2 } });
    b.conn.handle({ type: 'joinRoom', roomId: [...lobby.rooms.keys()][0] });
    a.conn.handle({ type: 'startGame' });
    await ate(() => a.eventos.includes('deal'));

    a.conn.handle({ type: 'pausa', acao: 'pedir' });
    expect(b.room?.pausa).toMatchObject({ estado: 'votando', nome: 'Ana' });
    expect(b.room?.pausa?.votantes).toHaveLength(2);
    // um voto só não pausa
    await vi.advanceTimersByTimeAsync(5000);
    expect(a.room?.pausa?.estado).toBe('votando');

    b.conn.handle({ type: 'pausa', acao: 'recusar' });
    expect(a.room?.pausa ?? null).toBeNull();
    // quem pediu espera um pouco para pedir de novo
    a.conn.handle({ type: 'pausa', acao: 'pedir' });
    expect(a.erros.at(-1)).toMatch(/Espere/);
    expect(a.room?.pausa ?? null).toBeNull();

    // depois da espera, pede de novo, e com os dois aceitando a mesa para
    await vi.advanceTimersByTimeAsync(61_000);
    a.conn.handle({ type: 'pausa', acao: 'pedir' });
    b.conn.handle({ type: 'pausa', acao: 'aceitar' });
    expect(['aguardando', 'pausada']).toContain(a.room?.pausa?.estado);
    await ate(() => a.room?.pausa?.estado === 'pausada');
    expect(b.room?.pausa?.estado).toBe('pausada');
  }, 30_000);

  it('a votação cai sozinha se nem todos respondem a tempo', async () => {
    vi.useFakeTimers();
    const lobby = new Lobby('teste');
    const a = jogador(lobby, 'Ana');
    const b = jogador(lobby, 'Beto');
    a.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS, ...rapido, maxPlayers: 2 } });
    b.conn.handle({ type: 'joinRoom', roomId: [...lobby.rooms.keys()][0] });
    a.conn.handle({ type: 'startGame' });
    await ate(() => a.eventos.includes('deal'));
    a.conn.handle({ type: 'pausa', acao: 'pedir' });
    await vi.advanceTimersByTimeAsync(PAUSA_VOTO_MS + 500);
    expect(a.room?.pausa ?? null).toBeNull();
  });

  it('duas horas pausada: a partida acaba, as fichas voltam e todos saem da mesa', async () => {
    vi.useFakeTimers();
    const lobby = new Lobby('teste');
    const a = jogador(lobby, 'Ana');
    a.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS, ...rapido, maxPlayers: 2 } });
    a.conn.handle({ type: 'addBot', difficulty: 'easy' });
    a.conn.handle({ type: 'startGame' });
    await ate(() => a.eventos.includes('deal'));
    a.conn.handle({ type: 'pausa', acao: 'pedir' });
    await ate(() => a.room?.pausa?.estado === 'pausada');
    expect(lobby.rooms.size).toBe(1);

    await vi.advanceTimersByTimeAsync(PAUSA_MAX_MS + 1000);
    expect(lobby.rooms.size).toBe(0);
    expect(a.saiu?.motivo).toMatch(/duas horas/);
    // a conexão ficou livre: dá para abrir outra mesa
    a.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS, ...rapido } });
    expect(lobby.rooms.size).toBe(1);
  }, 30_000);

  it('não dá para pausar antes de a partida começar', () => {
    const lobby = new Lobby('teste');
    const a = jogador(lobby, 'Ana');
    a.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS, ...rapido } });
    a.conn.handle({ type: 'pausa', acao: 'pedir' });
    expect(a.erros.at(-1)).toMatch(/partida em andamento/);
  });
});
