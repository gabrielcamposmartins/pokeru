import { describe, expect, it } from 'vitest';
import type { PotResult } from '../../shared/engine';
import { computePots } from '../../shared/engine';
import { paymentsTo } from './director';

const pot = (amount: number, winners: [number, number][], paid: [number, number][]): PotResult => ({
  amount,
  winners: winners.map(([seat, amt]) => ({ seat, amount: amt })),
  paid: paid.map(([seat, amount]) => ({ seat, amount })),
});

describe('quem pagou quem', () => {
  it('pote único: cada perdedor pagou o que colocou', () => {
    const p = [pot(300, [[0, 300]], [[0, 100], [1, 100], [2, 100]])];
    expect([...paymentsTo(p, 0)]).toEqual([
      [1, 100],
      [2, 100],
    ]);
  });

  it('pote dividido: só a fração que o vencedor levou, e co-vencedor não paga', () => {
    const p = [pot(300, [[0, 150], [1, 150]], [[0, 100], [1, 100], [2, 100]])];
    expect([...paymentsTo(p, 0)]).toEqual([[2, 50]]);
    expect([...paymentsTo(p, 1)]).toEqual([[2, 50]]);
  });

  it('potes laterais: cada vencedor só recebe de quem entrou no pote dele', () => {
    const p = [
      pot(300, [[2, 300]], [[0, 100], [1, 100], [2, 100]]),
      pot(200, [[0, 200]], [[0, 100], [1, 100]]),
    ];
    expect([...paymentsTo(p, 2)]).toEqual([
      [0, 100],
      [1, 100],
    ]);
    expect([...paymentsTo(p, 0)]).toEqual([[1, 100]]);
  });

  it('bate com os potes que o motor monta (all-in curto)', () => {
    // 0 paga 100 e desiste; 1 vai de 300; 2 cobre 300 e ganha tudo
    const pots = computePots([
      { seat: 0, total: 100, folded: true },
      { seat: 1, total: 300, folded: false },
      { seat: 2, total: 300, folded: false },
    ]);
    const results: PotResult[] = pots.map((x) => ({ amount: x.amount, winners: [{ seat: 2, amount: x.amount }], paid: x.contributions }));
    expect([...paymentsTo(results, 2)]).toEqual([
      [0, 100],
      [1, 300],
    ]);
    // o vencedor recebeu tudo menos as próprias fichas
    const total = [...paymentsTo(results, 2).values()].reduce((s, v) => s + v, 0);
    expect(total).toBe(400);
  });
});
