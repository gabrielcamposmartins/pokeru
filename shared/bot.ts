import { Card, newDeck, randomInt, sameCard } from './cards';
import { evaluateHand } from './evaluator';
import type { LegalActions, PlayerAction, Street } from './engine';
import type { BotDifficulty } from './protocol';

export interface BotContext {
  hole: Card[];
  board: Card[];
  legal: LegalActions;
  /** Pote total incluindo apostas da rodada. */
  pot: number;
  bigBlind: number;
  stack: number;
  opponents: number;
  street: Street;
  difficulty: BotDifficulty;
}

/** Equidade estimada por Monte Carlo contra N oponentes com mãos aleatórias. */
export function estimateEquity(hole: Card[], board: Card[], opponents: number, iterations: number): number {
  const known = [...hole, ...board];
  const rest = newDeck().filter((c) => !known.some((k) => sameCard(k, c)));
  let score = 0;
  const need = 5 - board.length;
  for (let it = 0; it < iterations; it++) {
    // embaralhamento parcial: só o necessário
    const draw = need + opponents * 2;
    for (let i = 0; i < draw; i++) {
      const j = i + Math.floor(Math.random() * (rest.length - i));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const fullBoard = board.concat(rest.slice(0, need));
    const mine = evaluateHand([...hole, ...fullBoard]).score;
    let best = true;
    let ties = 0;
    for (let o = 0; o < opponents; o++) {
      const oh = [rest[need + o * 2], rest[need + o * 2 + 1]];
      const theirs = evaluateHand([...oh, ...fullBoard]).score;
      if (theirs > mine) {
        best = false;
        break;
      }
      if (theirs === mine) ties++;
    }
    if (best) score += ties ? 1 / (ties + 1) : 1;
  }
  return score / iterations;
}

const PROFILE: Record<BotDifficulty, { iters: number; noise: number; bluff: number; aggression: number; margin: number }> = {
  easy: { iters: 120, noise: 0.18, bluff: 0.04, aggression: 0.35, margin: -0.04 },
  normal: { iters: 260, noise: 0.08, bluff: 0.08, aggression: 0.55, margin: 0.02 },
  hard: { iters: 500, noise: 0.03, bluff: 0.12, aggression: 0.7, margin: 0.04 },
};

function roundTo(v: number, step: number): number {
  return Math.max(step, Math.round(v / step) * step);
}

export function botDecide(ctx: BotContext): PlayerAction {
  const prof = PROFILE[ctx.difficulty];
  const { legal } = ctx;
  const opp = Math.max(1, Math.min(ctx.opponents, 5));
  let equity = estimateEquity(ctx.hole, ctx.board, opp, prof.iters);
  equity += (Math.random() - 0.5) * 2 * prof.noise;
  const toCall = legal.callAmount;
  const potOdds = toCall > 0 ? toCall / (ctx.pot + toCall) : 0;
  const r = Math.random();
  // normaliza equidade para "força relativa" (equidade justa = 1/(opp+1))
  const fair = 1 / (opp + 1);
  const strength = (equity - fair) / (1 - fair); // <0 fraco, ~1 muito forte

  const raiseTo = (fraction: number): PlayerAction => {
    const potAfterCall = ctx.pot + toCall;
    const target = legal.maxRaiseTo - ctx.stack + toCall + potAfterCall * fraction; // bet atual + call + fração
    let to = roundTo(target, Math.max(1, Math.floor(ctx.bigBlind / 2)));
    to = Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, to));
    if (to >= legal.maxRaiseTo) return { type: 'allin' };
    return { type: 'raise', amount: to };
  };

  if (toCall === 0) {
    if (legal.canRaise) {
      if (strength > 0.55 && r < 0.5 + prof.aggression * 0.5) return raiseTo(0.55 + Math.random() * 0.45);
      if (strength > 0.25 && r < prof.aggression * 0.6) return raiseTo(0.4 + Math.random() * 0.3);
      if (r < prof.bluff) return raiseTo(0.5);
    }
    return { type: 'check' };
  }

  // enfrentando aposta
  const commit = toCall / Math.max(1, ctx.stack + toCall);
  if (legal.canRaise && strength > 0.6 && r < prof.aggression) {
    return raiseTo(0.7 + Math.random() * 0.6);
  }
  if (equity > potOdds + prof.margin + commit * 0.15) {
    if (legal.canRaise && strength > 0.4 && r < prof.aggression * 0.3) return raiseTo(0.6);
    return { type: 'call' };
  }
  // chamada barata com mão especulativa
  if (toCall <= ctx.bigBlind && ctx.street === 'preflop' && equity > fair * 0.8) return { type: 'call' };
  if (legal.canRaise && r < prof.bluff * 0.4 && ctx.street !== 'river') return raiseTo(0.8);
  return { type: 'fold' };
}

export function botThinkTimeMs(): number {
  return 700 + randomInt(1400);
}
