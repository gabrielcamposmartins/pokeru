import { Card, newDeck, shuffle } from './cards';
import { evaluateHand } from './evaluator';

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'allin';

export interface PlayerAction {
  type: ActionType;
  /** Para 'raise': valor TOTAL da aposta na rodada ("aumentar para"). */
  amount?: number;
}

export interface HandPlayer {
  seat: number;
  id: string;
  stack: number;
  hole: Card[];
  /** Fichas apostadas na rodada atual. */
  bet: number;
  /** Fichas investidas na mão inteira. */
  total: number;
  folded: boolean;
  allIn: boolean;
  acted: boolean;
  /** Valor de currentBet quando o jogador agiu pela última vez (para regra de reabertura). */
  actedAt: number;
  lastAction: ActionType | 'sb' | 'bb' | null;
  revealed: boolean;
}

export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
  /** true quando ainda não há aposta na rodada (o botão vira "Apostar"). */
  isBet: boolean;
}

export interface PotWinner {
  seat: number;
  amount: number;
  hand?: string;
  best?: Card[];
}

export interface PotResult {
  amount: number;
  winners: PotWinner[];
}

export type HandEvent =
  | { t: 'blinds'; posts: { seat: number; amount: number; kind: 'sb' | 'bb' }[] }
  | { t: 'deal'; order: number[] }
  | { t: 'action'; seat: number; action: ActionType; amount: number; betTo: number; allIn: boolean }
  | { t: 'refund'; seat: number; amount: number }
  | { t: 'collect'; bets: { seat: number; amount: number }[] }
  | { t: 'street'; street: Street; cards: Card[] }
  | { t: 'showdown'; reveals: { seat: number; cards: Card[]; hand: string }[] }
  | { t: 'win'; pots: PotResult[]; uncontested: boolean };

export interface HandConfig {
  players: { seat: number; id: string; stack: number }[];
  dealerSeat: number;
  smallBlind: number;
  bigBlind: number;
  deck?: Card[];
}

/**
 * Uma mão de Texas Hold'em No-Limit.
 * Cada mutação de estado dispara `onEvent` imediatamente APÓS ser aplicada,
 * permitindo que quem observa tire um "snapshot" coerente a cada passo.
 */
export class Hand {
  readonly players: HandPlayer[];
  readonly smallBlind: number;
  readonly bigBlind: number;
  board: Card[] = [];
  street: Street = 'preflop';
  /** Fichas já recolhidas ao pote central (não inclui apostas da rodada atual). */
  pot = 0;
  currentBet = 0;
  minRaise: number;
  toAct: number | null = null;
  finished = false;
  results: PotResult[] = [];
  /** Incrementa a cada ação aplicada — útil para identificar "vezes" distintas. */
  seq = 0;
  readonly dealerIdx: number;
  sbIdx = -1;
  bbIdx = -1;
  private deck: Card[];

  constructor(
    cfg: HandConfig,
    private onEvent: (ev: HandEvent) => void = () => {},
  ) {
    if (cfg.players.length < 2) throw new Error('São necessários ao menos 2 jogadores');
    this.players = [...cfg.players]
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({
        seat: p.seat,
        id: p.id,
        stack: p.stack,
        hole: [],
        bet: 0,
        total: 0,
        folded: false,
        allIn: false,
        acted: false,
        actedAt: 0,
        lastAction: null,
        revealed: false,
      }));
    this.smallBlind = cfg.smallBlind;
    this.bigBlind = cfg.bigBlind;
    this.minRaise = cfg.bigBlind;
    this.deck = cfg.deck ? [...cfg.deck] : shuffle(newDeck());
    const d = this.players.findIndex((p) => p.seat === cfg.dealerSeat);
    this.dealerIdx = d >= 0 ? d : 0;
  }

  // ---------- consultas ----------

  bySeat(seat: number): HandPlayer | undefined {
    return this.players.find((p) => p.seat === seat);
  }

  get toActSeat(): number | null {
    return this.toAct === null ? null : this.players[this.toAct].seat;
  }

  /** Pote total incluindo apostas da rodada. */
  get totalPot(): number {
    return this.pot + this.players.reduce((s, p) => s + p.bet, 0);
  }

  private next(i: number): number {
    return (i + 1) % this.players.length;
  }

  private activePlayers(): HandPlayer[] {
    return this.players.filter((p) => !p.folded);
  }

  private needsToAct(p: HandPlayer): boolean {
    return !p.folded && !p.allIn && (!p.acted || p.bet < this.currentBet);
  }

  legalActions(seat: number): LegalActions | null {
    const p = this.bySeat(seat);
    if (!p || p.folded || p.allIn || this.finished) return null;
    const toCall = Math.max(0, this.currentBet - p.bet);
    const callAmount = Math.min(toCall, p.stack);
    const othersCanAct = this.players.some((o) => o !== p && !o.folded && !o.allIn);
    const reopened = !p.acted || this.currentBet - p.actedAt >= this.minRaise;
    const canRaise = p.stack > toCall && reopened && othersCanAct;
    const maxRaiseTo = p.bet + p.stack;
    const minRaiseTo = Math.min(this.currentBet + this.minRaise, maxRaiseTo);
    return {
      canFold: toCall > 0,
      canCheck: toCall === 0,
      canCall: toCall > 0,
      callAmount,
      canRaise,
      minRaiseTo,
      maxRaiseTo,
      isBet: this.currentBet === 0,
    };
  }

  // ---------- fluxo ----------

  start(): void {
    const n = this.players.length;
    if (n === 2) {
      this.sbIdx = this.dealerIdx;
      this.bbIdx = this.next(this.dealerIdx);
    } else {
      this.sbIdx = this.next(this.dealerIdx);
      this.bbIdx = this.next(this.sbIdx);
    }
    const posts: { seat: number; amount: number; kind: 'sb' | 'bb' }[] = [];
    const post = (i: number, amount: number, kind: 'sb' | 'bb') => {
      const p = this.players[i];
      const a = Math.min(p.stack, amount);
      p.stack -= a;
      p.bet += a;
      p.total += a;
      p.lastAction = kind;
      if (p.stack === 0) p.allIn = true;
      posts.push({ seat: p.seat, amount: a, kind });
    };
    post(this.sbIdx, this.smallBlind, 'sb');
    post(this.bbIdx, this.bigBlind, 'bb');
    this.currentBet = this.bigBlind;
    this.minRaise = this.bigBlind;
    this.onEvent({ t: 'blinds', posts });

    // distribuição: duas voltas começando à esquerda do dealer
    const order: number[] = [];
    for (let round = 0; round < 2; round++) {
      let i = this.next(this.dealerIdx);
      for (let k = 0; k < n; k++) {
        this.players[i].hole.push(this.deck.pop()!);
        order.push(this.players[i].seat);
        i = this.next(i);
      }
    }
    this.onEvent({ t: 'deal', order });

    // primeiro a agir no pré-flop: à esquerda do BB (no heads-up, o dealer/SB)
    this.advanceOrNext(this.bbIdx);
  }

  act(seat: number, action: PlayerAction): { ok: true } | { ok: false; error: string } {
    if (this.finished) return { ok: false, error: 'A mão já terminou' };
    if (this.toAct === null || this.players[this.toAct].seat !== seat)
      return { ok: false, error: 'Não é a sua vez' };
    const idx = this.toAct;
    const p = this.players[idx];
    const legal = this.legalActions(seat)!;
    let type = action.type;
    let added = 0;

    switch (type) {
      case 'fold': {
        if (legal.canCheck) type = 'check'; // nunca desistir de graça
        else p.folded = true;
        break;
      }
      case 'check': {
        if (!legal.canCheck) return { ok: false, error: 'Não é possível dar check' };
        break;
      }
      case 'call': {
        if (!legal.canCall) {
          type = 'check';
          break;
        }
        added = legal.callAmount;
        break;
      }
      case 'raise':
      case 'allin': {
        let to = type === 'allin' ? legal.maxRaiseTo : Math.floor(action.amount ?? 0);
        if (to >= legal.maxRaiseTo) {
          to = legal.maxRaiseTo;
          type = 'allin';
        }
        if (to <= this.currentBet) {
          // "all-in" que não cobre a aposta atual é um call
          if (type === 'allin') {
            added = p.stack;
            break;
          }
          return { ok: false, error: 'Valor de aumento inválido' };
        }
        if (!legal.canRaise) {
          if (type === 'allin') {
            // sem direito a aumentar: vira call (pode ser all-in se o call cobrir tudo)
            added = legal.callAmount;
            type = added === p.stack ? 'allin' : 'call';
            break;
          }
          return { ok: false, error: 'Aumento não permitido' };
        }
        if (to < legal.minRaiseTo && type !== 'allin')
          return { ok: false, error: `O aumento mínimo é para ${legal.minRaiseTo}` };
        const increment = to - this.currentBet;
        if (increment >= this.minRaise) this.minRaise = increment;
        this.currentBet = to;
        added = to - p.bet;
        break;
      }
      default:
        return { ok: false, error: 'Ação desconhecida' };
    }

    if (added > 0) {
      p.stack -= added;
      p.bet += added;
      p.total += added;
    }
    if (p.stack === 0 && !p.folded) {
      p.allIn = true;
      if (type !== 'fold') type = 'allin';
    }
    p.acted = true;
    p.actedAt = this.currentBet;
    p.lastAction = type;
    this.seq++;
    this.toAct = null;
    this.onEvent({ t: 'action', seat: p.seat, action: type, amount: added, betTo: p.bet, allIn: p.allIn });

    this.advanceOrNext(idx);
    return { ok: true };
  }

  private roundComplete(): boolean {
    const active = this.activePlayers();
    if (active.length <= 1) return true;
    const canAct = active.filter((p) => !p.allIn);
    if (canAct.length === 0) return true;
    if (canAct.length === 1) return canAct[0].bet >= this.currentBet;
    return canAct.every((p) => p.acted && p.bet === this.currentBet);
  }

  /** Após uma ação (ou início), decide se passa a vez ou encerra a rodada. */
  private advanceOrNext(fromIdx: number): void {
    if (!this.roundComplete()) {
      let i = this.next(fromIdx);
      for (let k = 0; k < this.players.length; k++) {
        if (this.needsToAct(this.players[i])) {
          this.toAct = i;
          return;
        }
        i = this.next(i);
      }
    }
    this.endStreet();
  }

  private endStreet(): void {
    this.toAct = null;
    // devolve aposta não pagada
    const sorted = [...this.players].sort((a, b) => b.bet - a.bet);
    if (sorted.length > 1 && sorted[0].bet > sorted[1].bet) {
      const top = sorted[0];
      const refund = top.bet - sorted[1].bet;
      top.bet -= refund;
      top.total -= refund;
      top.stack += refund;
      if (top.stack > 0) top.allIn = false;
      this.onEvent({ t: 'refund', seat: top.seat, amount: refund });
    }
    const bets = this.players.filter((p) => p.bet > 0).map((p) => ({ seat: p.seat, amount: p.bet }));
    if (bets.length) {
      for (const p of this.players) {
        this.pot += p.bet;
        p.bet = 0;
      }
      this.onEvent({ t: 'collect', bets });
    }
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    for (const p of this.players) {
      p.acted = false;
      p.actedAt = 0;
      if (p.lastAction !== 'fold' && p.lastAction !== 'allin') p.lastAction = null;
    }

    if (this.activePlayers().length <= 1) {
      this.finish();
      return;
    }

    // abre a próxima rua; se ninguém mais puder apostar, corre o bordo até o fim
    while (this.street !== 'river') {
      this.dealStreet();
      const canAct = this.activePlayers().filter((p) => !p.allIn);
      if (canAct.length >= 2) {
        // primeiro a agir: à esquerda do dealer
        let i = this.next(this.dealerIdx);
        for (let k = 0; k < this.players.length; k++) {
          if (this.needsToAct(this.players[i])) {
            this.toAct = i;
            return;
          }
          i = this.next(i);
        }
      }
    }
    this.finish();
  }

  private dealStreet(): void {
    this.deck.pop(); // queima
    let cards: Card[];
    if (this.street === 'preflop') {
      this.street = 'flop';
      cards = [this.deck.pop()!, this.deck.pop()!, this.deck.pop()!];
    } else if (this.street === 'flop') {
      this.street = 'turn';
      cards = [this.deck.pop()!];
    } else {
      this.street = 'river';
      cards = [this.deck.pop()!];
    }
    this.board.push(...cards);
    this.onEvent({ t: 'street', street: this.street, cards });
  }

  private finish(): void {
    this.toAct = null;
    const active = this.activePlayers();
    if (active.length === 1) {
      const w = active[0];
      const amount = this.pot;
      w.stack += amount;
      this.pot = 0;
      this.results = [{ amount, winners: [{ seat: w.seat, amount }] }];
      this.finished = true;
      this.onEvent({ t: 'win', pots: this.results, uncontested: true });
      return;
    }

    // showdown
    this.street = 'showdown';
    const values = new Map<number, ReturnType<typeof evaluateHand>>();
    for (const p of active) {
      values.set(p.seat, evaluateHand([...p.hole, ...this.board]));
      p.revealed = true;
    }
    // ordem de exibição: a partir da esquerda do dealer
    const reveals: { seat: number; cards: Card[]; hand: string }[] = [];
    let i = this.next(this.dealerIdx);
    for (let k = 0; k < this.players.length; k++) {
      const p = this.players[i];
      if (!p.folded) reveals.push({ seat: p.seat, cards: p.hole, hand: values.get(p.seat)!.name });
      i = this.next(i);
    }
    this.onEvent({ t: 'showdown', reveals });

    const pots = computePots(this.players);
    const results: PotResult[] = [];
    for (const pot of pots) {
      const eligible = pot.eligible.map((s) => this.bySeat(s)!);
      let bestScore = -1;
      for (const p of eligible) bestScore = Math.max(bestScore, values.get(p.seat)!.score);
      const winners = eligible.filter((p) => values.get(p.seat)!.score === bestScore);
      // fichas ímpares vão para o primeiro vencedor à esquerda do dealer
      winners.sort((a, b) => this.distFromDealer(a) - this.distFromDealer(b));
      const share = Math.floor(pot.amount / winners.length);
      let rem = pot.amount - share * winners.length;
      const pw: PotWinner[] = winners.map((w) => {
        const amt = share + (rem > 0 ? 1 : 0);
        if (rem > 0) rem--;
        w.stack += amt;
        const v = values.get(w.seat)!;
        return { seat: w.seat, amount: amt, hand: v.name, best: v.best };
      });
      results.push({ amount: pot.amount, winners: pw });
    }
    this.pot = 0;
    this.results = results;
    this.finished = true;
    this.onEvent({ t: 'win', pots: results, uncontested: false });
  }

  private distFromDealer(p: HandPlayer): number {
    const idx = this.players.indexOf(p);
    return (idx - this.dealerIdx + this.players.length) % this.players.length || this.players.length;
  }
}

/** Divide o pote em principal + laterais com base no total investido por cada jogador. */
export function computePots(players: { seat: number; total: number; folded: boolean }[]): {
  amount: number;
  eligible: number[];
}[] {
  const active = players.filter((p) => !p.folded);
  const levels = [...new Set(active.map((p) => p.total))].filter((l) => l > 0).sort((a, b) => a - b);
  const pots: { amount: number; eligible: number[] }[] = [];
  let prev = 0;
  let accounted = 0;
  for (const level of levels) {
    let amount = 0;
    for (const p of players) amount += Math.min(p.total, level) - Math.min(p.total, prev);
    const eligible = active.filter((p) => p.total >= level).map((p) => p.seat);
    if (amount > 0) pots.push({ amount, eligible });
    accounted += amount;
    prev = level;
  }
  const all = players.reduce((s, p) => s + p.total, 0);
  if (all > accounted && pots.length) pots[pots.length - 1].amount += all - accounted;
  // funde potes com o mesmo conjunto de elegíveis
  const merged: typeof pots = [];
  for (const pot of pots) {
    const last = merged[merged.length - 1];
    if (last && last.eligible.join(',') === pot.eligible.join(',')) last.amount += pot.amount;
    else merged.push({ ...pot });
  }
  return merged;
}
