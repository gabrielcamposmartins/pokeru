export type Suit = 's' | 'h' | 'd' | 'c';
/** 2..14 (11 = J, 12 = Q, 13 = K, 14 = A) */
export type Rank = number;

export interface Card {
  r: Rank;
  s: Suit;
}

export const SUITS: Suit[] = ['s', 'h', 'd', 'c'];
export const RANKS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

export const SUIT_NAMES: Record<Suit, string> = {
  s: 'Espadas',
  h: 'Copas',
  d: 'Ouros',
  c: 'Paus',
};

export function rankLabel(r: Rank): string {
  switch (r) {
    case 14:
      return 'A';
    case 13:
      return 'K';
    case 12:
      return 'Q';
    case 11:
      return 'J';
    default:
      return String(r);
  }
}

export function rankNamePlural(r: Rank): string {
  const names: Record<number, string> = {
    14: 'Ases',
    13: 'Reis',
    12: 'Damas',
    11: 'Valetes',
    10: 'Dez',
    9: 'Noves',
    8: 'Oitos',
    7: 'Setes',
    6: 'Seis',
    5: 'Cincos',
    4: 'Quatros',
    3: 'Três',
    2: 'Dois',
  };
  return names[r] ?? String(r);
}

export function cardToString(c: Card): string {
  return rankLabel(c.r) + c.s;
}

export function parseCard(code: string): Card {
  const s = code.slice(-1) as Suit;
  const rs = code.slice(0, -1).toUpperCase();
  const map: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
  const r = map[rs] ?? Number(rs);
  if (!SUITS.includes(s) || !(r >= 2 && r <= 14)) throw new Error(`Carta inválida: ${code}`);
  return { r, s };
}

export function sameCard(a: Card, b: Card): boolean {
  return a.r === b.r && a.s === b.s;
}

export function newDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ r, s });
  return deck;
}

/** Inteiro uniforme em [0, max) usando crypto quando disponível. */
export function randomInt(max: number): number {
  // tipado à mão: shared/ roda no navegador e no Node, sem depender dos tipos do DOM
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  if (c?.getRandomValues) {
    const buf = new Uint32Array(1);
    // rejeição para evitar viés de módulo
    const limit = Math.floor(0x100000000 / max) * max;
    let v: number;
    do {
      c.getRandomValues(buf);
      v = buf[0];
    } while (v >= limit);
    return v % max;
  }
  return Math.floor(Math.random() * max);
}

/** Fisher–Yates. */
export function shuffle<T>(arr: T[], rand: (max: number) => number = randomInt): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
