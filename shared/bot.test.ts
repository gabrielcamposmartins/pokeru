import { describe, expect, it } from 'vitest';
import { parseCard, type Card } from './cards';
import { botDecide, botDraw, estimateEquity5, temProjeto, type BotContext } from './bot';
import type { LegalActions } from './engine';
import { PERSONALIDADES, type Personalidade } from './personality';

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

describe('o jeito do personagem na decisão', () => {
  const legal = (callAmount: number): LegalActions => ({
    canFold: callAmount > 0,
    canCheck: callAmount === 0,
    canCall: callAmount > 0,
    callAmount,
    canRaise: true,
    minRaiseTo: Math.max(200, callAmount * 2),
    maxRaiseTo: 2000,
    isBet: callAmount === 0,
  });
  /** Quantas vezes, em `n`, o bot faz uma das ações de `quais` naquela situação. */
  const vezes = (traits: Personalidade, ctx: Partial<BotContext>, quais: string[], n = 150) => {
    let k = 0;
    for (let i = 0; i < n; i++) {
      const a = botDecide({
        hole: cs('7c 2d'),
        board: cs('Ks 9h 4s'),
        legal: legal(0),
        pot: 600,
        bigBlind: 100,
        stack: 1800,
        opponents: 1,
        street: 'flop',
        difficulty: 'normal',
        traits,
        ...ctx,
      });
      if (quais.includes(a.type)) k++;
    }
    return k / n;
  };

  it('quem blefa aposta sem nada muito mais que quem não blefa', () => {
    const goro = vezes(PERSONALIDADES.goro, {}, ['raise', 'allin']);
    const ren = vezes(PERSONALIDADES.ren, {}, ['raise', 'allin']);
    expect(goro).toBeGreaterThan(0.18);
    expect(ren).toBeLessThan(0.06);
    // e também na última rua, onde o blefe se decide
    expect(vezes(PERSONALIDADES.goro, { board: cs('Ks 9h 4s Jd 3c'), street: 'river' }, ['raise', 'allin'])).toBeGreaterThan(0.18);
  }, 60_000);

  it('o blefador aumenta de volta sem mão; o cauteloso larga', () => {
    const contra = { legal: legal(300), pot: 900 };
    expect(vezes(PERSONALIDADES.goro, contra, ['raise', 'allin'])).toBeGreaterThan(vezes(PERSONALIDADES.ren, contra, ['raise', 'allin']) + 0.04);
  }, 60_000);

  it('quem arrisca corre atrás do projeto e paga o que o cauteloso larga', () => {
    // projeto de flush no flop, pagando mais do que as chances do pote pedem
    const projeto = { hole: cs('6s 5s'), board: cs('Ks 9h 2s'), legal: legal(900), pot: 1200, stack: 1800 };
    const nobu = vezes(PERSONALIDADES.nobu, projeto, ['call', 'raise', 'allin']);
    const ren = vezes(PERSONALIDADES.ren, projeto, ['call', 'raise', 'allin']);
    expect(nobu).toBeGreaterThan(ren + 0.2);
  }, 60_000);

  it('quem arrisca vai de all-in com a mão boa; o cauteloso quase nunca', () => {
    const boa = { hole: cs('Ks Kd'), board: cs('Kh 9h 4s') };
    expect(vezes(PERSONALIDADES.nobu, boa, ['allin'])).toBeGreaterThan(0.05);
    expect(vezes(PERSONALIDADES.ren, boa, ['allin'])).toBeLessThan(0.03);
  }, 60_000);

  it('o arriscado entra no flop com mão especulativa pagando aumento', () => {
    const pre = { hole: cs('8d 5c'), board: [], street: 'preflop' as const, legal: legal(300), pot: 450, opponents: 2 };
    expect(vezes(PERSONALIDADES.nobu, pre, ['call', 'raise', 'allin'])).toBeGreaterThan(vezes(PERSONALIDADES.ren, pre, ['call', 'raise', 'allin']) + 0.1);
  }, 60_000);
});

describe('o projeto', () => {
  it('quatro do mesmo naipe ou quatro em sequência, com carta da mão, e a mão ainda não feita', () => {
    expect(temProjeto(cs('6s 5s'), cs('Ks 9h 2s'))).toBe(true); // flush
    expect(temProjeto(cs('8d 7c'), cs('6h 5s Kd'))).toBe(true); // sequência aberta
    expect(temProjeto(cs('Ad 2c'), cs('3h 4s Kd'))).toBe(true); // a roda: o ás vale 1
    expect(temProjeto(cs('7c 2d'), cs('Ks 9h 4s'))).toBe(false); // nada
    expect(temProjeto(cs('7c 2d'), cs('Ks Qs Js Ts'))).toBe(false); // o projeto é todo da mesa
    expect(temProjeto(cs('As 2s'), cs('Ks 9s 4s'))).toBe(false); // já é flush
  });
});
