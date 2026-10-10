import { afterEach, describe, expect, it, vi } from 'vitest';
import { Lobby, type Connection } from './lobby';
import { DEFAULT_SETTINGS, type ServerMsg, type TableView } from './protocol';
import type { MaoDaPartida } from './historico';

afterEach(() => {
  vi.useRealTimers();
});

function jogador(lobby: Lobby, nome: string, desiste = false) {
  const j = { conn: null as unknown as Connection, maos: [] as MaoDaPartida[], eventos: [] as string[], assento: -1 };
  j.conn = lobby.connect((m: ServerMsg) => {
    if (m.type === 'maos') j.maos = m.maos;
    if (m.type !== 'event') return;
    j.eventos.push(m.ev.t);
    const v: TableView = m.view;
    if (v.mySeat != null) j.assento = v.mySeat;
    if (m.ev.t === 'turn' && v.legal && v.toAct === v.mySeat) {
      const action = desiste && !v.legal.canCheck ? ({ type: 'fold' } as const) : v.legal.canCheck ? ({ type: 'check' } as const) : ({ type: 'call' } as const);
      setTimeout(() => j.conn.handle({ type: 'action', action }), 5);
    }
  });
  j.conn.handle({ type: 'hello', name: nome, avatar: {}, cosmetics: {} });
  return j;
}

async function ate(cond: () => boolean, maxMs = 600_000) {
  for (let t = 0; t < maxMs && !cond(); t += 250) await vi.advanceTimersByTimeAsync(250);
}

describe('histórico das mãos da partida', () => {
  it('cada mão que acaba entra no histórico, com o saldo de cada um fechando em zero', async () => {
    vi.useFakeTimers();
    const lobby = new Lobby('teste');
    const a = jogador(lobby, 'Ana');
    a.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS, pace: 0.4, turnTime: 5, mode: 'cash', maxPlayers: 3, startingStack: 5000 } });
    a.conn.handle({ type: 'addBot', difficulty: 'easy' });
    a.conn.handle({ type: 'addBot', difficulty: 'easy' });
    a.conn.handle({ type: 'startGame' });
    await ate(() => a.maos.length >= 4);

    expect(a.maos.map((m) => m.n)).toEqual([1, 2, 3, 4].slice(0, a.maos.length));
    for (const m of a.maos) {
      // o que um ganhou outro perdeu: o saldo da mesa fecha
      expect(m.jogadores.reduce((t, j) => t + j.resultado, 0)).toBe(0);
      expect(m.pote).toBe(m.jogadores.reduce((t, j) => t + j.apostou, 0));
      expect(m.jogadores.some((j) => j.venceu)).toBe(true);
      // as minhas cartas vêm sempre (sou eu), e eu estou na mão
      expect(m.meuAssento).toBe(a.assento);
      expect(m.minhas).toHaveLength(2);
    }
  }, 30_000);

  it('as cartas fechadas de quem não mostrou não saem: só as do showdown', async () => {
    vi.useFakeTimers();
    const lobby = new Lobby('teste');
    const a = jogador(lobby, 'Ana');
    const b = jogador(lobby, 'Beto', true);
    a.conn.handle({ type: 'createRoom', settings: { ...DEFAULT_SETTINGS, pace: 0.4, turnTime: 5, mode: 'cash', maxPlayers: 2, startingStack: 5000 } });
    b.conn.handle({ type: 'joinRoom', roomId: [...lobby.rooms.keys()][0] });
    a.conn.handle({ type: 'startGame' });
    await ate(() => a.maos.length >= 6 && b.maos.length >= 6);

    for (const m of a.maos) {
      const dele = m.jogadores.find((j) => j.seat !== m.meuAssento)!;
      // quem desistiu não mostrou nada; quem foi ao showdown mostrou, com o nome da mão
      if (dele.desistiu) expect(dele.cartas).toBeUndefined();
      if (dele.cartas) expect(dele.mao).toBeTruthy();
      // nenhuma lista de mãos tem as "minhas" de outra pessoa
      const outra = b.maos.find((x) => x.n === m.n)!;
      expect(outra.minhas).not.toEqual(m.minhas);
    }
  }, 30_000);
});
