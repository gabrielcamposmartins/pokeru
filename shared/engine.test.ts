import { describe, expect, it } from 'vitest';
import { parseCard, newDeck, sameCard, type Card } from './cards';
import { evaluateHand, HandCategory } from './evaluator';
import { Hand, computePots, type HandEvent, type PlayerAction } from './engine';

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

  it('aponta só as cartas que fazem o jogo', () => {
    const core = (s: string) => evaluateHand(cs(s)).core.map((c) => `${c.r}${c.s}`).sort();
    // par de setes: só os dois setes
    expect(core('7s 7h Kd 9c 2d')).toEqual(['7h', '7s']);
    // dois pares: as quatro, sem o acompanhante
    expect(core('Ks Kh 7d 7c 2d')).toEqual(['13h', '13s', '7c', '7d'].sort());
    // trinca: as três
    expect(core('9s 9h 9d Kc 2d')).toEqual(['9d', '9h', '9s']);
    // quadra: as quatro, sem o kicker
    expect(core('9s 9h 9d 9c Kd')).toEqual(['9c', '9d', '9h', '9s']);
    // carta alta: só a mais alta
    expect(core('As Kd 8c 5h 3d')).toEqual(['14s']);
    // mãos de cinco cartas: todas contam
    for (const hand of ['5h 6h 7h 8h 9h', '2s 7s 9s Js Ks', 'As 2d 3c 4h 5s', 'Ks Kh Kd 7c 7d']) {
      expect(evaluateHand(cs(hand)).core).toHaveLength(5);
    }
  });

  it('as cartas do jogo saem de dentro da mão feita, com sete cartas na mesa', () => {
    // par de ases na mão + cartas altas no bordo: o efeito é só nos dois ases
    const v = evaluateHand(cs('As Ah Kd Qc 7d 3s 2h'));
    expect(v.core.map((c) => `${c.r}${c.s}`).sort()).toEqual(['14h', '14s']);
    expect(v.best).toHaveLength(5);
    // e toda carta do jogo está entre as cinco melhores
    for (const c of v.core) expect(v.best.some((b) => sameCard(b, c))).toBe(true);
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

/** Corre as apostas até a mão acabar ou chegar numa troca de cartas. */
function playBets(hand: Hand, pick: (seat: number) => PlayerAction) {
  let guard = 0;
  while (!hand.finished && hand.phase === 'bet' && hand.toActSeat !== null && guard++ < 200) {
    const s = hand.toActSeat;
    const r = hand.act(s, pick(s));
    if (!r.ok) throw new Error(r.error);
  }
}

/** Corre a mão inteira (apostas e trocas) do poker de 5 cartas. */
function playDraw5(hand: Hand, bet: (seat: number) => PlayerAction, discards: (seat: number) => number[] = () => []) {
  let guard = 0;
  while (!hand.finished && hand.toActSeat !== null && guard++ < 200) {
    const s = hand.toActSeat;
    const r = hand.phase === 'draw' ? hand.draw(s, discards(s)) : hand.act(s, bet(s));
    if (!r.ok) throw new Error(r.error);
  }
}

describe('poker de 5 cartas (draw)', () => {
  const three = () => [
    { seat: 0, id: 'a', stack: 1000 },
    { seat: 1, id: 'b', stack: 1000 },
    { seat: 2, id: 'c', stack: 1000 },
  ];

  it('dá cinco cartas a cada um e não usa bordo', () => {
    const h = new Hand({ players: three(), dealerSeat: 0, smallBlind: 10, bigBlind: 20, variant: 'draw5' });
    h.start();
    expect(h.street).toBe('predraw');
    expect(h.phase).toBe('bet');
    for (const p of h.players) expect(p.hole).toHaveLength(5);
    expect(h.board).toEqual([]);
    // as 15 cartas são todas diferentes
    const all = h.players.flatMap((p) => p.hole);
    expect(new Set(all.map((c) => `${c.r}${c.s}`)).size).toBe(15);
  });

  it('a troca vem entre as duas rodadas de apostas, à esquerda do dealer', () => {
    const events: HandEvent[] = [];
    const h = new Hand({ players: three(), dealerSeat: 0, smallBlind: 10, bigBlind: 20, variant: 'draw5' }, (e) => events.push(e));
    h.start();
    playBets(h, (seat) => (h.legalActions(seat)!.canCheck ? { type: 'check' } : { type: 'call' }));
    expect(h.street).toBe('draw');
    expect(h.phase).toBe('draw');
    expect(h.toActSeat).toBe(1); // SB, à esquerda do dealer
    expect(h.legalActions(1)).toBeNull(); // durante a troca não se aposta

    const before = [...h.bySeat(1)!.hole];
    expect(h.draw(1, [0, 2]).ok).toBe(true);
    const after = h.bySeat(1)!.hole;
    expect(after).toHaveLength(5);
    expect(after[1]).toEqual(before[1]); // as mantidas ficam no lugar
    expect(after[3]).toEqual(before[3]);
    expect(sameCard(after[0], before[0])).toBe(false);
    expect(h.bySeat(1)!.drew).toBe(2);
    expect(events.some((e) => e.t === 'draw' && e.seat === 1 && e.discards.length === 2)).toBe(true);

    expect(h.toActSeat).toBe(2);
    h.draw(2, []); // manter todas
    expect(h.bySeat(2)!.drew).toBe(0);
    h.draw(0, [4]);
    // todos trocaram: segunda rodada de apostas, de novo à esquerda do dealer
    expect(h.street).toBe('postdraw');
    expect(h.phase).toBe('bet');
    expect(h.toActSeat).toBe(1);
  });

  it('apostar durante a troca (e trocar fora da vez) é recusado', () => {
    const h = new Hand({ players: three(), dealerSeat: 0, smallBlind: 10, bigBlind: 20, variant: 'draw5' });
    h.start();
    expect(h.draw(1, [0]).ok).toBe(false); // ainda é rodada de apostas
    playBets(h, (seat) => (h.legalActions(seat)!.canCheck ? { type: 'check' } : { type: 'call' }));
    expect(h.act(1, { type: 'check' }).ok).toBe(false);
    expect(h.draw(2, [0]).ok).toBe(false); // não é a vez do assento 2
  });

  it('o showdown vale pelas cinco cartas da mão', () => {
    // ordem dos pops: uma volta por carta (s1, s2, s0) x5
    const deck = riggedDeck(
      cs(
        'Ah 2c 7d ' + // 1ª carta de cada
          'Ad 3c 8d ' +
          'As 4c 9d ' +
          'Ac 5c Td ' +
          'Kh 6d 2h',
      ),
    );
    const h = new Hand({ players: three(), dealerSeat: 0, smallBlind: 10, bigBlind: 20, variant: 'draw5', deck });
    h.start();
    // assento 1: quadra de ases; assento 2: 2-3-4-5-6 (sequência); assento 0: nada
    expect(evaluateHand(h.bySeat(1)!.hole).category).toBe(HandCategory.Quads);
    expect(evaluateHand(h.bySeat(2)!.hole).category).toBe(HandCategory.Straight);
    playDraw5(h, (seat) => (h.legalActions(seat)!.canCheck ? { type: 'check' } : { type: 'call' }));
    expect(h.finished).toBe(true);
    expect(h.street).toBe('showdown');
    const win = h.results[0];
    expect(win.winners[0].seat).toBe(1);
    expect(win.winners[0].hand).toContain('Quadra');
    expect(win.winners[0].best).toHaveLength(5);
    // o destaque vai só nas quatro do jogo (o quinto é acompanhante)
    expect(win.winners[0].core).toHaveLength(4);
    expect(win.winners[0].core!.every((c) => c.r === 14)).toBe(true);
  });

  it('conserva fichas com trocas e all-ins', () => {
    for (let n = 0; n < 120; n++) {
      const players = [0, 1, 2, 3, 4, 5].map((s) => ({ seat: s, id: 'p' + s, stack: 200 + s * 150 }));
      const total = players.reduce((s, p) => s + p.stack, 0);
      const h = new Hand({ players, dealerSeat: n % 6, smallBlind: 10, bigBlind: 20, variant: 'draw5' });
      h.start();
      playDraw5(
        h,
        (seat) => {
          const l = h.legalActions(seat)!;
          const r = Math.random();
          if (r < 0.15 && l.canFold) return { type: 'fold' };
          if (r < 0.35 && l.canRaise) return { type: 'raise', amount: l.minRaiseTo };
          if (r < 0.42) return { type: 'allin' };
          return l.canCheck ? { type: 'check' } : { type: 'call' };
        },
        // troca até 5 cartas: com 6 jogadores o baralho acaba e os descartes voltam
        () => Array.from({ length: Math.floor(Math.random() * 6) }, (_, i) => i),
      );
      expect(h.finished).toBe(true);
      expect(h.players.reduce((s, p) => s + p.stack, 0)).toBe(total);
      // ninguém fica com carta repetida, nem entre jogadores (o descarte reembaralhado nunca
      // devolve uma carta que está na mão de alguém)
      for (const p of h.players) expect(p.hole).toHaveLength(5);
      const inPlay = h.players.flatMap((p) => p.hole).map((c) => `${c.r}${c.s}`);
      expect(new Set(inPlay).size).toBe(inPlay.length);
    }
  });
});
