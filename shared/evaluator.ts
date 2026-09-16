import { Card, Rank, rankNamePlural, rankLabel } from './cards';

export enum HandCategory {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  Trips = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  Quads = 7,
  StraightFlush = 8,
}

export const CATEGORY_NAMES: Record<HandCategory, string> = {
  [HandCategory.HighCard]: 'Carta Alta',
  [HandCategory.Pair]: 'Par',
  [HandCategory.TwoPair]: 'Dois Pares',
  [HandCategory.Trips]: 'Trinca',
  [HandCategory.Straight]: 'Sequência',
  [HandCategory.Flush]: 'Flush',
  [HandCategory.FullHouse]: 'Full House',
  [HandCategory.Quads]: 'Quadra',
  [HandCategory.StraightFlush]: 'Straight Flush',
};

export interface HandValue {
  /** Maior = melhor. Comparável diretamente. */
  score: number;
  category: HandCategory;
  /** Nome amigável em português, ex.: "Full House, Reis sobre Setes". */
  name: string;
  /** As 5 cartas que formam a mão (apenas quando há >= 5 cartas). */
  best: Card[];
}

const BASE = 16;

function pack(category: HandCategory, ranks: Rank[]): number {
  let score = category;
  for (let i = 0; i < 5; i++) score = score * BASE + (ranks[i] ?? 0);
  return score;
}

interface Eval5 {
  score: number;
  category: HandCategory;
  ranks: Rank[];
}

/** Avalia exatamente 5 cartas. */
export function evaluate5(cards: Card[]): Eval5 {
  const counts = new Map<Rank, number>();
  for (const c of cards) counts.set(c.r, (counts.get(c.r) ?? 0) + 1);
  // grupos ordenados por (quantidade desc, rank desc)
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every((c) => c.s === cards[0].s);

  let straightHigh = 0;
  if (groups.length === 5) {
    const sorted = groups.map((g) => g[0]).sort((a, b) => b - a);
    if (sorted[0] - sorted[4] === 4) straightHigh = sorted[0];
    else if (sorted[0] === 14 && sorted[1] === 5) straightHigh = 5; // roda A-2-3-4-5
  }

  let category: HandCategory;
  let ranks: Rank[];
  if (straightHigh && flush) {
    category = HandCategory.StraightFlush;
    ranks = [straightHigh];
  } else if (groups[0][1] === 4) {
    category = HandCategory.Quads;
    ranks = [groups[0][0], groups[1][0]];
  } else if (groups[0][1] === 3 && groups[1][1] === 2) {
    category = HandCategory.FullHouse;
    ranks = [groups[0][0], groups[1][0]];
  } else if (flush) {
    category = HandCategory.Flush;
    ranks = groups.map((g) => g[0]);
  } else if (straightHigh) {
    category = HandCategory.Straight;
    ranks = [straightHigh];
  } else if (groups[0][1] === 3) {
    category = HandCategory.Trips;
    ranks = groups.map((g) => g[0]);
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    category = HandCategory.TwoPair;
    ranks = groups.map((g) => g[0]);
  } else if (groups[0][1] === 2) {
    category = HandCategory.Pair;
    ranks = groups.map((g) => g[0]);
  } else {
    category = HandCategory.HighCard;
    ranks = groups.map((g) => g[0]);
  }
  return { score: pack(category, ranks), category, ranks };
}

function describe(category: HandCategory, ranks: Rank[]): string {
  switch (category) {
    case HandCategory.StraightFlush:
      return ranks[0] === 14 ? 'Royal Flush' : `Straight Flush até ${rankLabel(ranks[0])}`;
    case HandCategory.Quads:
      return `Quadra de ${rankNamePlural(ranks[0])}`;
    case HandCategory.FullHouse:
      return `Full House, ${rankNamePlural(ranks[0])} com ${rankNamePlural(ranks[1])}`;
    case HandCategory.Flush:
      return `Flush, ${rankLabel(ranks[0])} alto`;
    case HandCategory.Straight:
      return `Sequência até ${rankLabel(ranks[0])}`;
    case HandCategory.Trips:
      return `Trinca de ${rankNamePlural(ranks[0])}`;
    case HandCategory.TwoPair:
      return `Dois Pares, ${rankNamePlural(ranks[0])} e ${rankNamePlural(ranks[1])}`;
    case HandCategory.Pair:
      return `Par de ${rankNamePlural(ranks[0])}`;
    default:
      return `Carta Alta ${rankLabel(ranks[0])}`;
  }
}

/** Melhor mão de 5 a partir de 5–7 cartas. Com menos de 5, faz uma avaliação parcial (para dicas). */
export function evaluateHand(cards: Card[]): HandValue {
  if (cards.length < 5) return evaluatePartial(cards);
  let best: Eval5 | null = null;
  let bestCards: Card[] = [];
  const n = cards.length;
  const combo: Card[] = new Array(5);
  // gera todas as combinações C(n,5) — no máximo 21
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 3; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            combo[0] = cards[a];
            combo[1] = cards[b];
            combo[2] = cards[c];
            combo[3] = cards[d];
            combo[4] = cards[e];
            const ev = evaluate5(combo);
            if (!best || ev.score > best.score) {
              best = ev;
              bestCards = combo.slice();
            }
          }
  const ev = best!;
  return { score: ev.score, category: ev.category, name: describe(ev.category, ev.ranks), best: bestCards };
}

/** Avaliação com 1–4 cartas (apenas pares/trincas/quadras), usada para dicas de UI. */
export function evaluatePartial(cards: Card[]): HandValue {
  if (cards.length === 0) return { score: 0, category: HandCategory.HighCard, name: '', best: [] };
  const counts = new Map<Rank, number>();
  for (const c of cards) counts.set(c.r, (counts.get(c.r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  let category = HandCategory.HighCard;
  if (groups[0][1] === 4) category = HandCategory.Quads;
  else if (groups[0][1] === 3) category = HandCategory.Trips;
  else if (groups[0][1] === 2 && groups[1]?.[1] === 2) category = HandCategory.TwoPair;
  else if (groups[0][1] === 2) category = HandCategory.Pair;
  const ranks = groups.map((g) => g[0]);
  return { score: pack(category, ranks), category, name: describe(category, ranks), best: [] };
}

export function compareHands(a: HandValue, b: HandValue): number {
  return a.score - b.score;
}
