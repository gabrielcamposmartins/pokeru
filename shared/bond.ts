/**
 * Vínculo com os personagens — as regras.
 *
 * Jogar com um personagem aproxima você dele: cada mão rende pontos de vínculo (ganhar vale mais,
 * mas perder também conta) e cada partida terminada dá um bônus. A barra tem cinco corações; a cada
 * coração completo o personagem entrega uma recompensa.
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

/** Soma um momento ao vínculo: devolve a ficha nova (não mexe na antiga). */
export function addBond(cur: BondStats, ev: BondEvent): BondStats {
  const next = { ...cur, points: cur.points + BOND_POINTS[ev] };
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

