import { describe, expect, it } from 'vitest';
import { parseCard, type Card } from './cards';
import { botDraw, estimateEquity5 } from './bot';

const cs = (s: string): Card[] => s.split(' ').map(parseCard);
/** Descartes do bot difícil (sem a "troca boba" do fácil). */
const draw = (s: string) => botDraw(cs(s), 'hard').sort((a, b) => a - b);

describe('troca de cartas do bot', () => {
  it('mão feita fica como está', () => {
    expect(draw('As Ks Qs Js Ts')).toEqual([]); // royal
    expect(draw('9s 9h 9d 2c 2d')).toEqual([]); // full house
    expect(draw('5h 6h 7d 8c 9s')).toEqual([]); // sequência
    expect(draw('2h 7h 9h Jh Kh')).toEqual([]); // flush
  });

  it('trinca troca as duas soltas e dois pares trocam a quinta', () => {
    expect(draw('9s 9h 9d 2c 5d')).toEqual([3, 4]);
    expect(draw('Ks Kh 5d 5c 8d')).toEqual([4]);
  });

  it('par troca três cartas', () => {
    expect(draw('Qs Qh 8d 7c 2d')).toEqual([2, 3, 4]);
  });

  it('projeto de flush ou de sequência troca uma carta', () => {
    expect(draw('2h 7h 9h Jh Kd')).toEqual([4]); // quatro corações
    expect(draw('5h 6d 7c 8s Kd')).toEqual([4]); // quatro em sequência
    expect(draw('9s 6d 4c 3h 2d')).toEqual([0]); // projeto de dentro (falta o 5) também vale
  });

  it('mão sem nada fica com as cartas altas', () => {
    expect(draw('As Kd 8c 5h 3d')).toEqual([2, 3, 4]);
    expect(draw('9s 7d 5c 3h 2d')).toEqual([1, 2, 3, 4]); // sem carta alta nem projeto: só a mais alta fica
  });

  it('nunca descarta índice inválido nem repetido', () => {
    for (let i = 0; i < 300; i++) {
      const deck = cs('As Ks Qs Js Ts 9s 8s 7s 6s 5s');
      const hole = deck.slice(i % 5, (i % 5) + 5);
      for (const d of ['easy', 'normal', 'hard'] as const) {
        const out = botDraw(hole, d);
        expect(new Set(out).size).toBe(out.length);
        for (const x of out) expect(x).toBeGreaterThanOrEqual(0);
        for (const x of out) expect(x).toBeLessThan(5);
      }
    }
  });
});

describe('equidade no poker de 5 cartas', () => {
  it('mão forte tem mais equidade que mão fraca', () => {
    const strong = estimateEquity5(cs('As Ah Ad Ac Kh'), 3, 300);
    const weak = estimateEquity5(cs('2s 3h 5d 7c 9h'), 3, 300);
    expect(strong).toBeGreaterThan(0.9);
    expect(weak).toBeLessThan(strong);
  });
});
