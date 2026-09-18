import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSession } from './session';
import { useTable } from './table';
import { bondOf, useBond } from './bond';
import { useProfile } from './profile';

const LOCAL = {
  bots: 2,
  difficulty: 'easy' as const,
  mode: 'cash' as const,
  variant: 'holdem' as const,
  rounds: 8,
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

  it('jogar acumula vínculo com o personagem, e sair fecha a partida', async () => {
    useBond.getState().reset();
    vi.useFakeTimers();
    const char = useProfile.getState().character;
    useSession.getState().startLocal(LOCAL);
    // sem interface, a vez do humano expira: as mãos correm e cada uma rende vínculo
    await vi.advanceTimersByTimeAsync(120_000);
    const st = bondOf(char);
    expect(st.hands).toBeGreaterThan(0);
    expect(st.points).toBeGreaterThan(0);
    expect(st.matches).toBe(0);
    expect(useBond.getState().gain[char]).toBe(st.points);

    // sair encerra a partida: entra o bônus de partida completa
    useSession.getState().stopPlaying();
    expect(bondOf(char).matches).toBe(1);
    expect(bondOf(char).points).toBeGreaterThan(st.points);
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

/**
 * Responde sozinho à minha vez de apostar (passa, ou paga quando há aposta) — senão o tempo
 * expira e eu desisto, e aí nem chego na troca de cartas.
 */
function autoBet(): () => void {
  let last = '';
  return useTable.subscribe((s) => {
    const v = s.display;
    if (!v?.legal || v.toAct !== v.mySeat) return;
    const key = `${v.handNo}:${v.street}:${v.currentBet}:${v.toAct}`;
    if (key === last) return;
    last = key;
    useSession.getState().send({ type: 'action', action: v.legal.canCheck ? { type: 'check' } : { type: 'call' } });
  });
}

describe('poker de 5 cartas offline', () => {
  afterEach(() => {
    useSession.getState().disconnect();
    vi.useRealTimers();
  });

  it('a mesa chega na troca e a minha troca vale', async () => {
    vi.useFakeTimers();
    const stop = autoBet();
    useSession.getState().startLocal({ ...LOCAL, variant: 'draw5', mode: 'normal', rounds: 2, bots: 2 });

    // a mesa é de cinco cartas e sem bordo
    await vi.advanceTimersByTimeAsync(4000);
    const dealt = useTable.getState().display!;
    expect(dealt.variant).toBe('draw5');
    expect(dealt.board).toEqual([]);
    expect(dealt.seats[dealt.mySeat!]!.cards).toHaveLength(5);

    // espera a minha vez de trocar (a vez de apostar expira sozinha)
    const isMyDraw = () => {
      const v = useTable.getState().display;
      return !!v && v.street === 'draw' && v.toAct === v.mySeat;
    };
    for (let t = 0; t < 120_000 && !isMyDraw(); t += 250) await vi.advanceTimersByTimeAsync(250);
    expect(isMyDraw()).toBe(true);

    const before = useTable.getState().display!.seats[useTable.getState().display!.mySeat!]!.cards.slice();
    useSession.getState().send({ type: 'draw', discards: [0, 2] });
    await vi.advanceTimersByTimeAsync(1500);
    const me = useTable.getState().display!.seats[useTable.getState().display!.mySeat!]!;
    expect(me.drew).toBe(2);
    expect(me.cards).toHaveLength(5);
    // as mantidas continuam no lugar e as trocadas mudaram
    expect(me.cards[1]).toEqual(before[1]);
    expect(me.cards[3]).toEqual(before[3]);
    expect(me.cards[0]).not.toEqual(before[0]);
    expect(me.cards[2]).not.toEqual(before[2]);
    stop();
  }, 30_000);

  it('a partida de rodadas fixas acaba no fim das rodadas', async () => {
    vi.useFakeTimers();
    useSession.getState().startLocal({ ...LOCAL, variant: 'draw5', mode: 'normal', rounds: 2, bots: 2 });
    for (let t = 0; t < 300_000 && !useTable.getState().gameOver; t += 250) await vi.advanceTimersByTimeAsync(250);
    expect(useTable.getState().gameOver).toBeTruthy();
    expect(useTable.getState().display!.handNo).toBe(2);
    // o placar de fim de partida abre sozinho
    expect(useTable.getState().match?.kind).toBe('over');
  }, 30_000);
});
