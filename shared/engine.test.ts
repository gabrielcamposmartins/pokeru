import { describe, expect, it } from 'vitest';
import { parseCard, newDeck, sameCard, type Card } from './cards';
import { evaluateHand, HandCategory } from './evaluator';
import { Hand, computePots, type HandEvent } from './engine';

const cs = (s: string): Card[] => s.split(' ').map(parseCard);

describe('avaliador', () => {
  it('classifica categorias', () => {
    expect(evaluateHand(cs('As Ks Qs Js Ts 2d 3c')).name).toBe('Royal Flush');
    expect(evaluateHand(cs('5h 4h 3h 2h Ah Kd Kc')).category).toBe(HandCategory.StraightFlush);
    expect(evaluateHand(cs('9s 9h 9d 9c 2d 3c 4h')).category).toBe(HandCategory.Quads);
    expect(evaluateHand(cs('Ks Kh Kd 7c 7d 2c 4h')).category).toBe(HandCategory.FullHouse);
    expect(evaluateHand(cs('2s 7s 9s Js Ks 2d 3c')).category).toBe(HandCategory.Flush);
    expect(evaluateHand(cs('As 2d 3c 4h 5s 9d Jc')).category).toBe(HandCategory.Straight);
    expect(evaluateHand(cs('Qs Qh Qd 7c 2d 3c 4h')).category).toBe(HandCategory.Trips);
    expect(evaluateHand(cs('Qs Qh 7d 7c 2d 3c 4h')).category).toBe(HandCategory.TwoPair);
    expect(evaluateHand(cs('Qs Qh 8d 7c 2d 3c 4h')).category).toBe(HandCategory.Pair);
    expect(evaluateHand(cs('Qs Jh 8d 7c 2d 3c 4h')).category).toBe(HandCategory.HighCard);
  });

  it('compara kickers e rodas', () => {
    const wheel = evaluateHand(cs('As 2d 3c 4h 5s'));
    const six = evaluateHand(cs('6s 2d 3c 4h 5s'));
    expect(six.score).toBeGreaterThan(wheel.score);
    const a = evaluateHand(cs('As Ah Kd 7c 2d'));
    const b = evaluateHand(cs('Ad Ac Qd 7c 2d'));
    expect(a.score).toBeGreaterThan(b.score);
    const tp1 = evaluateHand(cs('Ks Kh 5d 5c Ad'));
    const tp2 = evaluateHand(cs('Ks Kh 5d 5c Qd'));
    expect(tp1.score).toBeGreaterThan(tp2.score);
  });
});

describe('potes laterais', () => {
  it('divide corretamente', () => {
    const pots = computePots([
      { seat: 0, total: 100, folded: false },
      { seat: 1, total: 300, folded: false },
      { seat: 2, total: 300, folded: false },
      { seat: 3, total: 50, folded: true },
    ]);
    expect(pots).toEqual([
      {
        amount: 350,
        eligible: [0, 1, 2],
        contributions: [
          { seat: 0, amount: 100 },
          { seat: 1, amount: 100 },
          { seat: 2, amount: 100 },
          { seat: 3, amount: 50 },
        ],
      },
      {
        amount: 400,
        eligible: [1, 2],
        contributions: [
          { seat: 1, amount: 200 },
          { seat: 2, amount: 200 },
        ],
      },
    ]);
    // cada pote fecha com a soma do que entrou nele
    for (const pot of pots) expect(pot.contributions.reduce((s, c) => s + c.amount, 0)).toBe(pot.amount);
  });
});

/** Monta um baralho em que `pop()` entrega as cartas na ordem dada. */
function riggedDeck(order: Card[]): Card[] {
  const rest = newDeck().filter((c) => !order.some((o) => sameCard(o, c)));
  return [...rest, ...[...order].reverse()];
}

function playAll(hand: Hand, pick: (seat: number) => { type: 'fold' | 'check' | 'call' | 'raise' | 'allin'; amount?: number }) {
  let guard = 0;
  while (!hand.finished && hand.toActSeat !== null && guard++ < 200) {
    const s = hand.toActSeat;
    const r = hand.act(s, pick(s));
    if (!r.ok) throw new Error(r.error);
  }
}

describe('mão de Hold’em', () => {
  it('heads-up: dealer é SB e age primeiro no pré-flop', () => {
    const h = new Hand({
      players: [
        { seat: 0, id: 'a', stack: 1000 },
        { seat: 3, id: 'b', stack: 1000 },
      ],
      dealerSeat: 0,
      smallBlind: 10,
      bigBlind: 20,
    });
    h.start();
    expect(h.bySeat(0)!.bet).toBe(10);
    expect(h.bySeat(3)!.bet).toBe(20);
    expect(h.toActSeat).toBe(0);
    h.act(0, { type: 'call' });
    // BB tem a opção
    expect(h.toActSeat).toBe(3);
    h.act(3, { type: 'check' });
    expect(h.street).toBe('flop');
    // pós-flop o BB (não-dealer) age primeiro
    expect(h.toActSeat).toBe(3);
  });

  it('conserva fichas e termina em showdown', () => {
    for (let n = 0; n < 200; n++) {
      const players = [0, 1, 2, 3, 4, 5].map((s) => ({ seat: s, id: 'p' + s, stack: 200 + s * 150 }));
      const total = players.reduce((s, p) => s + p.stack, 0);
      const h = new Hand({ players, dealerSeat: n % 6, smallBlind: 10, bigBlind: 20 });
      h.start();
      playAll(h, (seat) => {
        const l = h.legalActions(seat)!;
        const r = Math.random();
        if (r < 0.15 && l.canFold) return { type: 'fold' };
        if (r < 0.35 && l.canRaise) return { type: 'raise', amount: l.minRaiseTo };
        if (r < 0.42) return { type: 'allin' };
        return l.canCheck ? { type: 'check' } : { type: 'call' };
      });
      expect(h.finished).toBe(true);
      const after = h.players.reduce((s, p) => s + p.stack, 0);
      expect(after).toBe(total);
    }
  });

  it('all-in curto não reabre a ação e gera pote lateral', () => {
    const events: HandEvent[] = [];
    // assento 0: dealer; 1: SB; 2: BB
    const deck = riggedDeck(
      cs('Ah Kh 2c ' + 'As Kd 7d ' + '2d 9s Jd 3c Qh 4s 5h'),
      // ordem dos pops: hole rodada1 (s1,s2,s0), rodada2 (s1,s2,s0), queima, flop x3, queima, turn, queima, river
    );
    const h = new Hand(
      {
        players: [
          { seat: 0, id: 'a', stack: 1000 },
          { seat: 1, id: 'b', stack: 1000 },
          { seat: 2, id: 'c', stack: 50 },
        ],
        dealerSeat: 0,
        smallBlind: 10,
        bigBlind: 20,
        deck,
      },
      (e) => events.push(e),
    );
    h.start();
    expect(h.toActSeat).toBe(0);
    h.act(0, { type: 'raise', amount: 100 });
    h.act(1, { type: 'call' });
    // BB all-in por 50 (menor que o aumento) — só pode pagar
    h.act(2, { type: 'allin' });
    expect(h.street).toBe('flop');
    playAll(h, () => ({ type: 'check' }));
    expect(h.finished).toBe(true);
    const win = events.find((e) => e.t === 'win');
    expect(win && win.t === 'win' && win.pots.length).toBe(2);
    const sum = h.players.reduce((s, p) => s + p.stack, 0);
    expect(sum).toBe(2050);
  });

  it('aposta não pagada é devolvida', () => {
    const h = new Hand({
      players: [
        { seat: 0, id: 'a', stack: 1000 },
        { seat: 1, id: 'b', stack: 1000 },
      ],
      dealerSeat: 0,
      smallBlind: 10,
      bigBlind: 20,
    });
    h.start();
    h.act(0, { type: 'raise', amount: 500 });
    h.act(1, { type: 'fold' });
    expect(h.finished).toBe(true);
    expect(h.bySeat(0)!.stack).toBe(1020);
    expect(h.bySeat(1)!.stack).toBe(980);
  });
});
