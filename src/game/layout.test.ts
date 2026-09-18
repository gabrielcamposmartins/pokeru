import { describe, expect, it } from 'vitest';
import { CARD_W, holeCardPos, seatLayout } from './layout';

const geo = seatLayout(6, 0, true);
const me = geo[0];
const other = geo[2];

/** Largura que o leque ocupa na direção "para a direita do jogador". */
function spread(g: typeof me, n: number): number {
  const xs = Array.from({ length: n }, (_, i) => holeCardPos(g, i, n).p);
  const dx = xs.map((p) => (p.x - g.cards.x) * g.t.x + (p.y - g.cards.y) * g.t.y);
  return Math.max(...dx) - Math.min(...dx);
}

describe('leque das cartas na mão', () => {
  it('as cartas ficam centradas no lugar da mão', () => {
    for (const n of [2, 5]) {
      const xs = Array.from({ length: n }, (_, i) => holeCardPos(me, i, n).p);
      const cx = xs.reduce((t, p) => t + p.x, 0) / n;
      const cy = xs.reduce((t, p) => t + p.y, 0) / n;
      expect(cx, `n=${n}`).toBeCloseTo(me.cards.x, 5);
      expect(cy, `n=${n}`).toBeCloseTo(me.cards.y, 5);
    }
  });

  it('com cinco cartas o passo diminui e o leque não invade a mesa', () => {
    const step = (g: typeof me, n: number) => spread(g, n) / (n - 1);
    expect(step(me, 5)).toBeLessThan(step(me, 2));
    expect(step(other, 5)).toBeLessThan(step(other, 2));
    // o leque de cinco cabe em menos de duas cartas de largura
    expect(spread(other, 5)).toBeLessThan(other.cardW * 2);
    expect(spread(me, 5)).toBeLessThan(me.cardW * 2);
  });

  it('a inclinação vai de uma ponta à outra, sem virar a carta', () => {
    const rots = Array.from({ length: 5 }, (_, i) => holeCardPos(other, i, 5).rot - other.cardsRot);
    expect(rots[0]).toBeLessThan(0);
    expect(rots[4]).toBeGreaterThan(0);
    expect(rots[2]).toBeCloseTo(0, 5);
    for (const r of rots) expect(Math.abs(r)).toBeLessThan(20);
  });

  it('sem o número de cartas, o padrão continua sendo duas (Hold’em)', () => {
    expect(holeCardPos(me, 0)).toEqual(holeCardPos(me, 0, 2));
    expect(holeCardPos(me, 1)).toEqual(holeCardPos(me, 1, 2));
    expect(CARD_W).toBeGreaterThan(0);
  });
});
