import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSession } from './session';
import { useTable } from './table';

const LOCAL = {
  bots: 2,
  difficulty: 'easy' as const,
  mode: 'cash' as const,
  startingStack: 1000,
  smallBlind: 10,
  bigBlind: 20,
  turnTime: 5,
  pace: 0.4,
};

describe('partida offline', () => {
  afterEach(() => {
    useSession.getState().disconnect();
    vi.useRealTimers();
  });

  it('sair encerra a partida ali: a mesa para de andar', async () => {
    vi.useFakeTimers();
    useSession.getState().startLocal(LOCAL);
    // sem interface, a vez do humano expira e a mesa segue sozinha
    await vi.advanceTimersByTimeAsync(30_000);
    const running = useTable.getState().display;
    expect(running).toBeTruthy();
    expect(running!.handNo).toBeGreaterThan(0);

    // é o que o botão "Sair" faz antes de mostrar o placar
    useSession.getState().stopPlaying();
    const frozen = useTable.getState().display;
    await vi.advanceTimersByTimeAsync(60_000);
    // nada mais chega: a mesa mostrada continua a mesma
    expect(useTable.getState().display).toBe(frozen);
  });

  it('a sala local é descartada ao sair (nada roda em segundo plano)', async () => {
    vi.useFakeTimers();
    useSession.getState().startLocal(LOCAL);
    await vi.advanceTimersByTimeAsync(10_000);
    useSession.getState().stopPlaying();
    await vi.advanceTimersByTimeAsync(60_000);
    // os temporizadores da sala foram limpos: não sobra nada agendado
    expect(vi.getTimerCount()).toBe(0);
  });
});
