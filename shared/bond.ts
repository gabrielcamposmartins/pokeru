/**
 * Vínculo com os personagens — as regras.
 *
 * Jogar com um personagem aproxima você dele: cada mão rende pontos de vínculo (ganhar vale mais,
 * mas perder também conta) e cada partida terminada dá um bônus. A barra tem cinco corações; a cada
 * coração completo o personagem entrega uma recompensa.
 *
 * **Jogar não basta.** Cada coração tem uma tranca, e quem a abre são as **missões** do
 * personagem: tantas mãos ao lado dele, tantas vitórias, tantas partidas até o fim. A barra enche
 * até a borda do coração e para ali enquanto a missão não fecha — a barra não desperdiça o que
 * você jogou, ela espera.
 *
 * **Os presentes dão pontos.** Eles não abrem coração nenhum: enchem a barra mais depressa, e só
 * isso. O que eles pedem é altura: o primeiro coração aceita um ramo de sakura, o quinto já não
 * se impressiona com menos que um kimono. É a mesma escada de raridade do resto do jogo
 * (shared/catalog.ts), o que dá ao presente caro um lugar onde ele vale a pena.
 *
 * Este arquivo é comum ao servidor e ao cliente: o servidor hospedado pontua o vínculo das contas
 * com as mesmas contas daqui. O catálogo de recompensas (vozes, emotes, skins) é do cliente e fica
 * em src/game/bond.ts; a interface, em src/game/BondBar.tsx e BondPage.tsx.
 */
import { itemKey, rarityOf, rarityRank, type Raridade } from './catalog';

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
// A tranca: as missões do personagem
// ---------------------------------------------------------------------

/** Um requisito de missão: tanto de um contador da ficha do personagem. */
export interface HeartQuest {
  counter: keyof BondStats;
  need: number;
}

/**
 * O que cada coração pede para abrir.
 *
 * São os contadores que a página de vínculo já mostra — mãos, vitórias, partidas —, e só esses:
 * pedir "desista de 20 mãos" transformaria a afeição em tarefa. A escada acompanha o custo em
 * pontos de cada coração, de modo que a missão fecha mais ou menos quando a barra enche; quem joga
 * bem chega antes pela missão, quem dá presente chega antes pela barra, e o coração abre quando as
 * duas coisas se encontram.
 */
export const HEART_QUESTS: readonly (readonly HeartQuest[])[] = [
  [{ counter: 'hands', need: 10 }],
  [
    { counter: 'hands', need: 30 },
    { counter: 'matches', need: 2 },
  ],
  [
    { counter: 'hands', need: 80 },
    { counter: 'wins', need: 20 },
    { counter: 'matches', need: 5 },
  ],
  [
    { counter: 'hands', need: 180 },
    { counter: 'wins', need: 50 },
    { counter: 'matches', need: 12 },
  ],
  [
    { counter: 'hands', need: 350 },
    { counter: 'wins', need: 100 },
    { counter: 'matches', need: 25 },
  ],
];

/** As missões do coração `heart` (1 a HEARTS). */
export function questsFor(heart: number): readonly HeartQuest[] {
  return HEART_QUESTS[heart - 1] ?? [];
}

/** A missão está cumprida? */
export const questDone = (st: BondStats, q: HeartQuest): boolean => (st[q.counter] ?? 0) >= q.need;

/**
 * Quantos corações as missões já abriram.
 *
 * Para no primeiro que falta: os corações são uma escada, não um cardápio. Quem cumpriu a missão
 * do terceiro sem a do segundo cumpriu a do segundo também — os requisitos só crescem —, então na
 * prática isto nunca prende ninguém sem motivo.
 */
export function questHearts(st: BondStats): number {
  let n = 0;
  while (n < HEARTS && questsFor(n + 1).every((q) => questDone(st, q))) n++;
  return n;
}

// ---------------------------------------------------------------------
// Os presentes: pontos, e a altura que cada coração exige
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
 * O degrau mínimo que cada coração aceita.
 *
 * Um ramo de sakura diz muito no primeiro dia e diz pouco no quinto. Cada coração sobe um degrau
 * da escada de raridade: presente abaixo da altura do coração é recusado — não dá pontos e não é
 * consumido —, e presente acima vale o que ele é, sem desconto. Assim o presente caro tem um
 * lugar, e o barato não vira moeda de rolo para acelerar o vínculo inteiro.
 */
export const HEART_GIFT_RARITY: readonly Raridade[] = ['comum', 'incomum', 'raro', 'epico', 'lendario'];

/** O degrau mínimo do coração em que a pessoa está (`unlocked` corações abertos). */
export function giftRarityFor(unlocked: number): Raridade {
  const i = Math.max(0, Math.min(HEARTS - 1, Math.floor(unlocked)));
  return HEART_GIFT_RARITY[i];
}

/** O presente é alto o bastante para este coração? */
export function giftFits(giftId: string, unlocked: number): boolean {
  return rarityRank(rarityOf(itemKey('gift', giftId))) <= rarityRank(giftRarityFor(unlocked));
}

/**
 * Quanto cada degrau rende de vínculo.
 *
 * A escala é mais íngreme que a do preço de propósito: o lendário custa sete vezes o comum e vale
 * doze. Um presente caro tem de **parecer** um gesto, não um pagamento proporcional.
 */
export const GIFT_POINTS: Record<Raridade, number> = {
  comum: 25,
  incomum: 45,
  raro: 80,
  epico: 150,
  lendario: 300,
};

/**
 * Os gostos de cada personagem: o presente predileto rende meio a mais.
 *
 * É o que sobrou — e o que importava — das antigas receitas por coração: quem gosta de flores se
 * ilumina com flores. A diferença não é grande o bastante para obrigar ninguém a decorar tabela,
 * só para recompensar quem reparou.
 */
export const BOND_GOSTOS: Record<string, readonly string[]> = {
  // Marina: barulho, açúcar e brilho
  marina: ['fone', 'bolo', 'joia'],
  // Ren: silêncio, leitura e cedro
  ren: ['livro', 'incenso', 'cha'],
  // Tobi: dourado, doce e mais dourado
  tobi: ['joia', 'bolo', 'fone'],
  // Yukina: flores, chá e o leque
  yukina: ['flor', 'cha', 'leque'],
};

/** O bônus de acertar o gosto. */
export const BONUS_GOSTO = 1.5;

export const gostaDe = (character: string, giftId: string): boolean => (BOND_GOSTOS[character] ?? []).includes(giftId);

/** Quantos pontos de vínculo um presente rende a um personagem. */
export function giftPoints(character: string, giftId: string): number {
  const base = GIFT_POINTS[rarityOf(itemKey('gift', giftId))];
  return Math.round(base * (gostaDe(character, giftId) ? BONUS_GOSTO : 1));
}

/** Tira um presente do estoque: devolve o estoque novo (não mexe no antigo). */
export function payGift(stock: Readonly<Record<string, number>>, giftId: string): Record<string, number> {
  const out = { ...stock };
  const resta = (out[giftId] ?? 0) - 1;
  if (resta > 0) out[giftId] = resta;
  else delete out[giftId];
  return out;
}
