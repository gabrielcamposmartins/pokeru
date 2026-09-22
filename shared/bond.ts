/**
 * Vínculo com os personagens — as regras.
 *
 * Jogar com um personagem aproxima você dele: cada mão rende pontos de vínculo (ganhar vale mais,
 * mas perder também conta) e cada partida terminada dá um bônus. A barra tem cinco corações; a cada
 * coração completo o personagem entrega uma recompensa.
 *
 * **Jogar não basta.** Cada coração tem uma tranca: a barra enche até a borda dele e para ali. O
 * que abre é uma combinação de presentes (shared/catalog.ts), diferente para cada personagem e
 * cada coração — quem gosta de flores não se contenta com um livro. Enquanto o coração está
 * trancado, os pontos que continuariam entrando simplesmente não entram: a barra não desperdiça o
 * que você jogou, ela espera.
 *
 * Este arquivo é comum ao servidor e ao cliente: o servidor hospedado pontua o vínculo das contas
 * com as mesmas contas daqui. O catálogo de recompensas (vozes, emotes, skins) é do cliente e fica
 * em src/game/bond.ts; a interface, em src/game/BondBar.tsx e BondPage.tsx.
 */
/** Corações da barra de vínculo. */
export const HEARTS = 5;

/** Pontos para completar cada coração (o 1º é rápido; o 5º é a maratona). */
export const HEART_COST: readonly number[] = [60, 140, 260, 440, 700];

/** Pontos do vínculo completo (cinco corações). */
export const BOND_MAX = HEART_COST.reduce((t, c) => t + c, 0);

/** O que rende pontos de vínculo. */
export type BondEvent = 'win' | 'bigWin' | 'loss' | 'fold' | 'match' | 'matchWin';

/** Quanto cada momento rende. Ganhar vale mais, mas perder junto com o personagem também aproxima. */
export const BOND_POINTS: Record<BondEvent, number> = {
  win: 10,
  bigWin: 18,
  loss: 4,
  fold: 1,
  match: 20,
  matchWin: 40,
};

/** O que você acumulou jogando com um personagem. */
export interface BondStats {
  points: number;
  /** Mãos ganhas. */
  wins: number;
  /** Mãos disputadas e perdidas (chegou ao fim e não levou o pote). */
  losses: number;
  /** Mãos em que você desistiu. */
  folds: number;
  hands: number;
  matches: number;
}

export const EMPTY_BOND: BondStats = { points: 0, wins: 0, losses: 0, folds: 0, hands: 0, matches: 0 };

/** Contadores mostrados na página de vínculo. */
export const BOND_COUNTERS: { key: keyof BondStats; label: string }[] = [
  { key: 'wins', label: 'vitórias' },
  { key: 'losses', label: 'derrotas' },
  { key: 'folds', label: 'desistências' },
  { key: 'hands', label: 'mãos' },
  { key: 'matches', label: 'partidas' },
];

/**
 * As missões do vínculo: o que rende pontos, com o contador que cada uma alimenta.
 * São a lista mostrada na página de vínculo, na ordem em que aparecem lá.
 */
export interface BondMission {
  ev: BondEvent;
  label: string;
  hint: string;
  /** Contador da ficha do personagem que essa missão faz subir. */
  counter: keyof BondStats;
}

export const BOND_MISSIONS: BondMission[] = [
  { ev: 'win', label: 'Leve o pote', hint: 'Qualquer mão que você ganhar, no showdown ou porque todos desistiram.', counter: 'wins' },
  { ev: 'bigWin', label: 'Ganhe com uma mão grande', hint: 'Sequência, flush, full house, quadra ou straight flush — no lugar dos 10 pontos da mão ganha.', counter: 'wins' },
  { ev: 'loss', label: 'Vá até o fim e perca', hint: 'Chegar ao showdown e não levar o pote também aproxima.', counter: 'losses' },
  { ev: 'fold', label: 'Desista de uma mão', hint: 'Fazer companhia conta pouco, mas conta.', counter: 'folds' },
  { ev: 'match', label: 'Termine a partida', hint: 'Vale ao acabar o jogo ou ao sair da mesa depois de jogar.', counter: 'matches' },
  { ev: 'matchWin', label: 'Termine a partida em 1º', hint: 'No lugar dos 20 pontos da partida completa.', counter: 'matches' },
];

/** Quanto cada momento mexe nos contadores, além dos pontos. */
const COUNTERS: Record<BondEvent, Partial<BondStats>> = {
  win: { wins: 1, hands: 1 },
  bigWin: { wins: 1, hands: 1 },
  loss: { losses: 1, hands: 1 },
  fold: { folds: 1, hands: 1 },
  match: { matches: 1 },
  matchWin: { matches: 1 },
};

/**
 * Soma um momento ao vínculo: devolve a ficha nova (não mexe na antiga).
 *
 * `cap` é o limite de pontos do coração destrancado mais recente (veja `bondCap`). Os contadores
 * sobem de todo jeito — as missões continuam valendo, e é o que a página mostra —, mas os pontos
 * param na borda do coração trancado.
 */
export function addBond(cur: BondStats, ev: BondEvent, cap = Infinity): BondStats {
  const next = { ...cur, points: Math.min(cur.points + BOND_POINTS[ev], cap) };
  for (const [k, v] of Object.entries(COUNTERS[ev]) as [keyof BondStats, number][]) next[k] = cur[k] + v;
  return next;
}

/** Onde o vínculo está: corações completos e o quanto falta para o próximo. */
export interface BondLevel {
  points: number;
  /** Corações completos (0 a HEARTS). */
  hearts: number;
  /** Pontos dentro do coração em andamento. */
  intoHeart: number;
  /** Custo do coração em andamento (0 no vínculo completo). */
  heartCost: number;
  /** Pontos que faltam para o próximo coração (0 no vínculo completo). */
  toNext: number;
  /** Quanto do coração em andamento está preenchido (0 a 1; 1 no vínculo completo). */
  progress: number;
  max: boolean;
}

export function bondLevel(points: number): BondLevel {
  const total = Math.max(0, Math.floor(points));
  let rest = total;
  let hearts = 0;
  while (hearts < HEARTS && rest >= HEART_COST[hearts]) {
    rest -= HEART_COST[hearts];
    hearts++;
  }
  const max = hearts >= HEARTS;
  const heartCost = max ? 0 : HEART_COST[hearts];
  return {
    points: total,
    hearts,
    intoHeart: max ? 0 : rest,
    heartCost,
    toNext: max ? 0 : heartCost - rest,
    progress: max ? 1 : rest / heartCost,
    max,
  };
}

/** Corações completos com `points` pontos. */
export function heartsOf(points: number): number {
  return bondLevel(points).hearts;
}

// ---------------------------------------------------------------------
// A tranca: presentes por coração
// ---------------------------------------------------------------------

/**
 * Até quantos pontos a barra sobe com `unlocked` corações destrancados.
 *
 * É a soma dos custos até **fechar** o coração seguinte: com nenhum destrancado, a barra enche o
 * primeiro coração e para; destrancado o primeiro, ela passa a poder fechar o segundo. Assim o
 * jogador sempre vê um coração cheio esperando presentes, nunca uma barra que anda sem fim.
 */
export function bondCap(unlocked: number): number {
  const u = Math.max(0, Math.min(HEARTS, Math.floor(unlocked)));
  if (u >= HEARTS) return BOND_MAX;
  return HEART_COST.slice(0, u + 1).reduce((t, c) => t + c, 0);
}

/** O coração está cheio e trancado, esperando os presentes? */
export function bondBlocked(points: number, unlocked: number): boolean {
  return unlocked < HEARTS && points >= bondCap(unlocked);
}

/**
 * As receitas de presentes, por personagem e por coração.
 *
 * Cada personagem tem os seus gostos, e a conta sobe a cada coração: o primeiro é um presente, o
 * quinto é um punhado. Os ids são os de GIFTS, em shared/catalog.ts.
 */
export type GiftRecipe = Readonly<Record<string, number>>;

export const BOND_RECIPES: Record<string, readonly GiftRecipe[]> = {
  // Marina: barulho, açúcar e brilho
  marina: [{ fone: 1 }, { fone: 1, bolo: 2 }, { fone: 2, bolo: 2 }, { fone: 3, joia: 1 }, { fone: 4, joia: 2, bolo: 3 }],
  // Ren: silêncio, leitura e cedro
  ren: [{ livro: 1 }, { livro: 2, cha: 1 }, { livro: 2, incenso: 2 }, { livro: 3, incenso: 2 }, { livro: 4, incenso: 3, joia: 1 }],
  // Tobi: dourado, doce e mais dourado
  tobi: [{ joia: 1 }, { joia: 1, bolo: 2 }, { joia: 2, fone: 1 }, { joia: 2, bolo: 3 }, { joia: 4, fone: 2, bolo: 3 }],
  // Yukina: flores, chá e o leque
  yukina: [{ flor: 1 }, { flor: 2, cha: 1 }, { flor: 2, leque: 1 }, { flor: 3, cha: 2, leque: 1 }, { flor: 4, leque: 2, joia: 1 }],
};

/** A receita do coração `heart` (1 a HEARTS) do personagem, ou null quando não há. */
export function recipeFor(character: string, heart: number): GiftRecipe | null {
  const lista = BOND_RECIPES[character];
  if (!lista || heart < 1 || heart > lista.length) return null;
  return lista[heart - 1];
}

/** A receita do próximo coração a destrancar. */
export function nextRecipe(character: string, unlocked: number): GiftRecipe | null {
  return recipeFor(character, unlocked + 1);
}

/** O estoque dá para a receita? */
export function hasGifts(stock: Readonly<Record<string, number>> | undefined, need: GiftRecipe): boolean {
  return Object.entries(need).every(([id, qty]) => (stock?.[id] ?? 0) >= qty);
}

/** Desconta a receita do estoque: devolve o estoque novo (não mexe no antigo). */
export function payGifts(stock: Readonly<Record<string, number>>, need: GiftRecipe): Record<string, number> {
  const out = { ...stock };
  for (const [id, qty] of Object.entries(need)) {
    const resta = (out[id] ?? 0) - qty;
    if (resta > 0) out[id] = resta;
    else delete out[id];
  }
  return out;
}

