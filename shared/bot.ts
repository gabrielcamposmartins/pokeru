import { Card, newDeck, randomInt, sameCard, type Rank } from './cards';
import { HandCategory, evaluateHand } from './evaluator';
import { isFirstStreet, type GameVariant, type LegalActions, type PlayerAction, type Street } from './engine';
import type { BotDifficulty } from './protocol';
import { estiloDoBot, type EstiloBot, type Personalidade } from './personality';

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
  /** Padrão: Texas Hold'em. No poker de 5 cartas a mão já está fechada (não há bordo). */
  variant?: GameVariant;
  difficulty: BotDifficulty;
  /**
   * O jeito do personagem (shared/personality.ts). A dificuldade diz o quanto o bot **sabe**; o
   * traço diz o que ele **faz** com o que sabe. Sem ele, joga o estilo puro da dificuldade.
   */
  traits?: Personalidade;
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

/**
 * Equidade no poker de 5 cartas: a mão já está fechada, então basta comparar com mãos aleatórias
 * de cinco cartas dos oponentes (Monte Carlo sobre o resto do baralho).
 */
export function estimateEquity5(hole: Card[], opponents: number, iterations: number): number {
  const rest = newDeck().filter((c) => !hole.some((k) => sameCard(k, c)));
  const mine = evaluateHand(hole).score;
  let score = 0;
  for (let it = 0; it < iterations; it++) {
    const draw = opponents * 5;
    for (let i = 0; i < draw; i++) {
      const j = i + Math.floor(Math.random() * (rest.length - i));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    let best = true;
    let ties = 0;
    for (let o = 0; o < opponents; o++) {
      const theirs = evaluateHand(rest.slice(o * 5, o * 5 + 5)).score;
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

/**
 * A mão tem um projeto de flush ou de sequência (quatro cartas, ao menos uma delas na mão), e
 * ainda não está feita? É a mão que ainda pode virar — e não a que já é fraca e vai continuar.
 */
export function temProjeto(hole: Card[], board: Card[]): boolean {
  const todas = [...hole, ...board];
  if (todas.length < 5 || evaluateHand(todas).category >= HandCategory.Straight) return false;
  const naipes = new Map<string, number>();
  for (const c of todas) naipes.set(c.s, (naipes.get(c.s) ?? 0) + 1);
  if (hole.some((c) => naipes.get(c.s) === 4)) return true;
  const valores = (cs: Card[]) => new Set(cs.flatMap((c) => ((c.r as number) === 14 ? [14, 1] : [c.r as number])));
  const tem = valores(todas);
  const daMao = valores(hole);
  for (let baixo = 1; baixo <= 10; baixo++) {
    const janela = [0, 1, 2, 3, 4].map((d) => baixo + d);
    if (janela.filter((v) => tem.has(v)).length >= 4 && janela.some((v) => daMao.has(v))) return true;
  }
  return false;
}

function roundTo(v: number, step: number): number {
  return Math.max(step, Math.round(v / step) * step);
}

export function botDecide(ctx: BotContext): PlayerAction {
  const prof: EstiloBot = estiloDoBot(ctx.difficulty, ctx.traits);
  const { legal } = ctx;
  const opp = Math.max(1, Math.min(ctx.opponents, 5));
  let equity =
    ctx.variant === 'draw5' ? estimateEquity5(ctx.hole, opp, prof.iters) : estimateEquity(ctx.hole, ctx.board, opp, prof.iters);
  equity += (Math.random() - 0.5) * 2 * prof.noise;
  const toCall = legal.callAmount;
  const potOdds = toCall > 0 ? toCall / (ctx.pot + toCall) : 0;
  const r = Math.random();
  // normaliza equidade para "força relativa" (equidade justa = 1/(opp+1))
  const fair = 1 / (opp + 1);
  const strength = (equity - fair) / (1 - fair); // <0 fraco, ~1 muito forte
  const lastStreet = ctx.street === 'river' || ctx.street === 'postdraw';
  /*
   * O blefe, contado pelos oponentes: blefar contra cinco é jogar ficha fora (alguém sempre tem
   * alguma coisa), contra um é o jogo. Quem blefa muito continua blefando numa mesa cheia — só
   * menos, como uma pessoa faria.
   */
  const blefe = prof.bluff / (1 + 0.3 * (opp - 1));
  /*
   * O "projeto": a mão que ainda não é nada mas pode virar — quatro do mesmo naipe, quatro em
   * sequência —, antes da última rua. É com ela que o tomador de risco aposta e paga, e o blefador
   * aposta com mais gosto.
   */
  const projeto = !lastStreet && ctx.variant !== 'draw5' && ctx.board.length >= 3 && temProjeto(ctx.hole, ctx.board);

  const raiseTo = (base: number): PlayerAction => {
    // quem gosta de risco aposta maior a mesma coisa: o traço é um multiplicador do tamanho de sempre
    const fraction = base * prof.bet;
    const potAfterCall = ctx.pot + toCall;
    const target = legal.maxRaiseTo - ctx.stack + toCall + potAfterCall * fraction; // bet atual + call + fração
    let to = roundTo(target, Math.max(1, Math.floor(ctx.bigBlind / 2)));
    to = Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, to));
    if (to >= legal.maxRaiseTo) return { type: 'allin' };
    return { type: 'raise', amount: to };
  };
  /** O tamanho de um blefe: entre metade e quase o pote (o blefe não tem sempre a mesma cara). */
  const blefar = (): PlayerAction => raiseTo(0.5 + Math.random() * 0.4);

  if (toCall === 0) {
    if (legal.canRaise) {
      if (strength > 0.55 && r < 0.5 + prof.aggression * 0.5) {
        // o tomador de risco empurra tudo com a mão boa, em vez de construir o pote devagar
        if (strength > 0.7 && Math.random() < prof.gamble * 0.35) return { type: 'allin' };
        return raiseTo(0.55 + Math.random() * 0.45);
      }
      if (strength > 0.25 && r < prof.aggression * 0.6) return raiseTo(0.4 + Math.random() * 0.3);
      // o semiblefe: aposta o projeto, que ganha se todos largarem e ainda pode virar se pagarem
      if (projeto && Math.random() < blefe * 0.8 + prof.gamble * 0.5) return raiseTo(0.45 + Math.random() * 0.3);
      // o blefe puro: aposta sem nada — inclusive na última rua, que é onde o blefe se decide
      if (Math.random() < blefe) return blefar();
    }
    return { type: 'check' };
  }

  // enfrentando aposta
  const commit = toCall / Math.max(1, ctx.stack + toCall);
  if (legal.canRaise && strength > 0.6 && r < prof.aggression) {
    if (Math.random() < prof.gamble * 0.4) return { type: 'allin' };
    return raiseTo(0.7 + Math.random() * 0.6);
  }
  // o tomador de risco não se assusta com o tamanho da aposta: o quanto ela compromete pesa menos
  if (equity > potOdds + prof.margin + commit * 0.15 * (1 - prof.gamble)) {
    if (legal.canRaise && strength > 0.4 && r < prof.aggression * 0.3) return raiseTo(0.6);
    // a mão razoável, empurrada de uma vez: o all-in de quem prefere decidir agora a ver mais uma carta
    if (legal.canRaise && strength > 0.2 && Math.random() < prof.gamble * 0.12) return { type: 'allin' };
    return { type: 'call' };
  }
  // chamada barata na primeira rodada, com mão que ainda pode melhorar (o arriscado entra com mais,
  // e paga um aumento para ver o flop)
  if (toCall <= ctx.bigBlind * (1 + prof.gamble * 6) && isFirstStreet(ctx.street) && equity > fair * (0.8 - prof.gamble * 0.4)) {
    return { type: 'call' };
  }
  // correr atrás do projeto: pagar sem as chances do pote, na esperança da carta que falta
  if (projeto && commit < 0.5 && equity > potOdds * 0.55 && Math.random() < prof.gamble) return { type: 'call' };
  // o blefe de volta: aumentar a aposta de quem apostou, sem nada na mão (na última rua, mais raro —
  // é a hora em que o outro paga só para ver)
  if (legal.canRaise && commit < 0.35 && Math.random() < blefe * (lastStreet ? 0.3 : 0.6)) return raiseTo(0.8 + Math.random() * 0.4);
  /*
   * A teimosia: pagar a última aposta só para ver.
   *
   * As contas já disseram que não compensa — é exatamente por isso que isto é traço e não
   * cálculo. Só vale quando a aposta cabe no bolso (até metade do pote): teimoso não é o mesmo
   * que distraído, e um Tobi que paga qualquer all-in do river morre na segunda mão.
   */
  if (lastStreet && toCall <= ctx.pot * 0.5 && toCall < ctx.stack && Math.random() < prof.callDown) return { type: 'call' };
  return { type: 'fold' };
}

// ------------------------------------------------------------------ troca de cartas (poker de 5)

/** Quantas cartas de cada naipe e de cada valor a mão tem. */
function tally(hole: Card[]): { suits: Map<string, number[]>; ranks: Map<Rank, number[]> } {
  const suits = new Map<string, number[]>();
  const ranks = new Map<Rank, number[]>();
  hole.forEach((c, i) => {
    suits.set(c.s, [...(suits.get(c.s) ?? []), i]);
    ranks.set(c.r, [...(ranks.get(c.r) ?? []), i]);
  });
  return { suits, ranks };
}

/** Índices que formam um projeto de sequência de quatro cartas (sem par), se houver. */
function straightDraw(hole: Card[]): number[] | null {
  const uniq = [...new Map(hole.map((c, i) => [c.r, i])).values()];
  if (uniq.length < 4) return null;
  // testa cada janela de 5 valores e conta quantas cartas da mão caem nela
  const rankOf = (i: number) => hole[i].r as number;
  for (const low of [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]) {
    const window = new Set(low === 1 ? [14, 2, 3, 4, 5] : [low, low + 1, low + 2, low + 3, low + 4]);
    const inside = uniq.filter((i) => window.has(rankOf(i)));
    if (inside.length >= 4) return inside.slice(0, 4);
  }
  return null;
}

/**
 * O que o bot descarta no poker de 5 cartas: mantém o que já vale (sequência ou melhor, trinca,
 * dois pares, par) e os projetos de quatro cartas para flush ou sequência; sem nada disso, fica
 * com as cartas altas. No fácil, às vezes troca errado de propósito.
 */
export function botDraw(hole: Card[], difficulty: BotDifficulty = 'normal'): number[] {
  if (hole.length < 5) return [];
  const all = hole.map((_, i) => i);
  const keepToDiscard = (keep: number[]) => all.filter((i) => !keep.includes(i));
  const slip = difficulty === 'easy' ? 0.25 : difficulty === 'normal' ? 0.08 : 0;
  if (Math.random() < slip) {
    // troca boba: descarta uma carta qualquer
    return [randomInt(5)];
  }

  const value = evaluateHand(hole);
  // mão feita: não mexe
  if (value.category >= HandCategory.Straight) return [];

  const { suits, ranks } = tally(hole);
  const groups = [...ranks.values()].sort((a, b) => b.length - a.length);
  if (groups[0].length >= 3) return keepToDiscard(groups[0]); // trinca: troca as duas soltas
  if (groups[0].length === 2 && groups[1]?.length === 2) return keepToDiscard([...groups[0], ...groups[1]]);

  // projeto de flush (quatro do mesmo naipe) vale mais que um par
  const four = [...suits.values()].find((idx) => idx.length === 4);
  if (four) return keepToDiscard(four);

  if (groups[0].length === 2) return keepToDiscard(groups[0]); // par: troca três

  const sd = straightDraw(hole);
  if (sd) return keepToDiscard(sd);

  // nada: fica com as cartas altas (A/K/Q) e troca o resto
  const high = all.filter((i) => (hole[i].r as number) >= 12).slice(0, 2);
  const keep = high.length ? high : [all.reduce((b, i) => ((hole[i].r as number) > (hole[b].r as number) ? i : b), 0)];
  return keepToDiscard(keep);
}

export function botThinkTimeMs(): number {
  return 700 + randomInt(1400);
}
