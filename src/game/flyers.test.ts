import { describe, expect, it } from 'vitest';
import { chipFlight } from './Flyers';
import type { Flyer } from '../store/table';
import { betSpot } from './layout';
import { hash01, jitter } from '../util/rand';

const base: Flyer = { id: 1, kind: 'chips', from: { x: 100, y: 700 }, to: { x: 600, y: 400 }, dur: 500 };

describe('arremesso de fichas', () => {
  it('as listas de quadros-chave batem com times e ease', () => {
    for (const f of [base, { ...base, arc: 20, spin: 10, bounce: 8, fade: true, scaleFrom: 0.8, scaleTo: 1.2 }]) {
      const k = chipFlight(f);
      const n = k.times.length;
      for (const [name, list] of Object.entries(k)) {
        if (name === 'times' || name === 'ease') continue;
        expect((list as unknown[]).length, `${name}`).toBe(n);
      }
      expect(k.ease).toHaveLength(n - 1);
      expect(k.times[0]).toBe(0);
      expect(k.times[n - 1]).toBe(1);
    }
  });

  it('sai de onde as fichas estavam e assenta no destino', () => {
    const k = chipFlight({ ...base, arc: 20, bounce: 9 });
    expect([k.x[0], k.y[0]]).toEqual([100, 700]);
    expect([k.x[k.x.length - 1], k.y[k.y.length - 1]]).toEqual([600, 400]);
    // quica: o penúltimo quadro passa acima do destino
    expect(k.y[k.y.length - 2]).toBe(391);
    // arco: o meio do voo fica acima dos dois pontos
    expect(k.y[1]).toBeLessThan(400);
  });

  it('sem arco, o giro volta ao fim (a pilha parada não fica torta)', () => {
    const k = chipFlight({ ...base, spin: 14 });
    expect(k.rotate[0]).toBe(0);
    expect(k.rotate[1]).toBe(14);
    expect(k.rotate[k.rotate.length - 1]).toBe(0);
  });
});

describe('desvio do pouso', () => {
  it('é estável e diferente por assento', () => {
    const bet = { x: 800, y: 600 };
    const a = betSpot(bet, 2, 'flop');
    expect(betSpot(bet, 2, 'flop')).toEqual(a); // mesma entrada, mesmo ponto
    expect(betSpot(bet, 3, 'flop')).not.toEqual(a);
    expect(betSpot(bet, 2, 'turn')).not.toEqual(a);
    // e o desvio é pequeno: as fichas caem na frente do jogador
    for (const seat of [0, 1, 2, 3, 4, 5]) {
      const p = betSpot(bet, seat, 'river');
      expect(Math.abs(p.x - bet.x)).toBeLessThanOrEqual(30);
      expect(Math.abs(p.y - bet.y)).toBeLessThanOrEqual(16);
    }
  });

  it('o ruído estável cobre a faixa toda', () => {
    const vals = Array.from({ length: 200 }, (_, i) => hash01(i, 7));
    expect(Math.min(...vals)).toBeLessThan(0.1);
    expect(Math.max(...vals)).toBeGreaterThan(0.9);
    expect(vals.every((v) => v >= 0 && v < 1)).toBe(true);
    expect(jitter(4, 2)).toBe(hash01(4, 2) * 2 - 1);
  });
});
