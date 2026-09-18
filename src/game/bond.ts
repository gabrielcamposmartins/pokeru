/**
 * Vínculo com os personagens.
 *
 * Jogar com um personagem aproxima você dele: cada mão rende pontos de vínculo (ganhar vale mais,
 * mas perder também conta) e cada partida terminada dá um bônus. A barra tem cinco corações; a cada
 * coração completo o personagem entrega uma recompensa dele — uma voz nova, um emote, uma skin…
 *
 * Aqui fica só o modelo (pontos, corações e catálogo de recompensas), sem estado: o progresso
 * salvo está em src/store/bond.ts e a interface em src/game/BondBar.tsx.
 *
 * ── Como acrescentar uma recompensa ──────────────────────────────────────────────
 * A escada de recompensas é a mesma para todos os personagens (DEFAULT_LADDER), e cada personagem
 * pode ter a sua em BOND_LADDERS. Um degrau é um `RewardSpec`: diga o coração, o tipo, o
 * nome/descrição (texto ou função que recebe o personagem) e o que ele libera:
 *
 *   voice: 'lose'          uma fala própria do personagem (momento em FALA_SLOTS, src/audio/voice.ts)
 *   emotes: ['🔥']         emotes novos (precisam estar em EMOTES, em shared/protocol.ts)
 *   skin: { kind, id }     um estilo (preset de shared/styles.ts)
 *   soon: true             recompensa ainda não implementada: aparece como "em breve" e não libera nada
 *
 * Quem consome: as vozes em src/game/director.ts (via voiceUnlocked), os emotes no menu de emotes
 * e as skins na lista de estilos — todos só perguntam se a recompensa está liberada.
 */
import type { CharacterStyle } from '../../shared/styles';
import type { ComumSlot, FalaSlot } from '../audio/voice';
import type { StyleKind } from '../store/profile';

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

// ------------------------------------------------------------------ recompensas

export type BondRewardKind = 'voice' | 'emote' | 'skin';

export interface BondReward {
  /** Id único da recompensa: `<personagem>:<coração>`. */
  id: string;
  /** Personagem que entrega a recompensa. */
  char: string;
  /** Coração que libera (1 a HEARTS). */
  heart: number;
  kind: BondRewardKind;
  name: string;
  description: string;
  /** Símbolo curto mostrado na lista. */
  icon: string;
  /** Fala própria do personagem liberada. */
  voice?: FalaSlot;
  /** Chamada comum que a fala própria substitui (a página mostra as duas). */
  replaces?: ComumSlot;
  /** Emotes liberados. */
  emotes?: string[];
  /** Estilo liberado. */
  skin?: { kind: StyleKind; id: string };
  /** Ainda não implementada: aparece como "em breve". */
  soon?: boolean;
}

export const REWARD_KIND_LABEL: Record<BondRewardKind, string> = { voice: 'Voz', emote: 'Emote', skin: 'Skin' };

type Text = string | ((c: CharacterStyle) => string);

/** Um degrau da escada de recompensas (o id e o personagem saem de `rewardsOf`). */
export type RewardSpec = Omit<BondReward, 'id' | 'char' | 'name' | 'description'> & { name: Text; description: Text };

/**
 * Escada padrão: vale para qualquer personagem sem escada própria em BOND_LADDERS.
 *
 * As vozes usam as falas próprias que o jogo ainda não toca (o texto de cada uma está em
 * assets/characters/falas/<personagem>.jsonc): sem vínculo o personagem usa a chamada comum,
 * com o vínculo ele fala com a voz dele naquele momento.
 */
const DEFAULT_LADDER: RewardSpec[] = [
  {
    heart: 1,
    kind: 'voice',
    icon: '♪',
    voice: 'showdown',
    replaces: 'show',
    name: 'Voz de mão completa',
    description: (c) => `No showdown, ${c.name} abre as cartas com a fala dela em vez da chamada comum.`,
  },
  {
    heart: 2,
    kind: 'emote',
    icon: '☻',
    soon: true,
    name: 'Emote exclusivo',
    description: (c) => `Um emote só de ${c.name} para usar na mesa.`,
  },
  {
    heart: 3,
    kind: 'voice',
    icon: '♪',
    voice: 'lose',
    name: 'Voz de derrota',
    description: (c) => `${c.name} responde à altura quando a mão não vem.`,
  },
  {
    heart: 4,
    kind: 'voice',
    icon: '♫',
    voice: 'turn',
    name: 'Voz na sua vez',
    description: (c) => `${c.name} anuncia a vez antes de você jogar.`,
  },
  {
    heart: 5,
    kind: 'skin',
    icon: '✿',
    soon: true,
    name: 'Skin alternativa',
    description: (c) => `Uma segunda aparência de ${c.name}, o presente de vínculo completo.`,
  },
];

/**
 * Escadas próprias, por personagem (id do personagem → degraus). Quem não estiver aqui usa
 * DEFAULT_LADDER; uma escada própria pode ter os mesmos cinco degraus em outra ordem.
 */
const BOND_LADDERS: Record<string, RewardSpec[]> = {};

const text = (t: Text, c: CharacterStyle): string => (typeof t === 'function' ? t(c) : t);

/** As cinco recompensas de um personagem, na ordem dos corações. */
export function rewardsOf(char: CharacterStyle): BondReward[] {
  const ladder = BOND_LADDERS[char.id] ?? DEFAULT_LADDER;
  return ladder
    .map((spec) => ({
      ...spec,
      id: `${char.id}:${spec.heart}`,
      char: char.id,
      name: text(spec.name, char),
      description: text(spec.description, char),
    }))
    .sort((a, b) => a.heart - b.heart);
}

/** A recompensa de um coração (null se a escada não tiver esse degrau). */
export function rewardAt(char: CharacterStyle, heart: number): BondReward | null {
  return rewardsOf(char).find((r) => r.heart === heart) ?? null;
}

/** As recompensas já recebidas com `points` pontos (as "em breve" entram: o coração foi completado). */
export function unlockedRewards(char: CharacterStyle, points: number): BondReward[] {
  const hearts = heartsOf(points);
  return rewardsOf(char).filter((r) => r.heart <= hearts);
}

/** A fala própria `slot` do personagem já foi liberada pelo vínculo? */
export function voiceUnlockedAt(char: CharacterStyle, points: number, slot: FalaSlot): boolean {
  return unlockedRewards(char, points).some((r) => !r.soon && r.voice === slot);
}

/** Emotes liberados pelo vínculo com o personagem. */
export function emotesUnlockedAt(char: CharacterStyle, points: number): string[] {
  return unlockedRewards(char, points).flatMap((r) => (r.soon ? [] : (r.emotes ?? [])));
}

/** Estilos liberados pelo vínculo com o personagem. */
export function skinsUnlockedAt(char: CharacterStyle, points: number): { kind: StyleKind; id: string }[] {
  return unlockedRewards(char, points).flatMap((r) => (r.soon || !r.skin ? [] : [r.skin]));
}

/**
 * Todos os emotes que são recompensa de vínculo (de qualquer personagem): no menu de emotes eles
 * ficam de fora até o coração que os libera fechar.
 */
export function allBondEmotes(): string[] {
  const out = new Set<string>();
  for (const ladder of [DEFAULT_LADDER, ...Object.values(BOND_LADDERS)]) {
    for (const spec of ladder) for (const e of spec.emotes ?? []) out.add(e);
  }
  return [...out];
}

/** Todas as falas próprias que o vínculo pode liberar (o jogo só as toca com o vínculo feito). */
export function bondVoiceSlots(): FalaSlot[] {
  const slots = new Set<FalaSlot>();
  for (const ladder of [DEFAULT_LADDER, ...Object.values(BOND_LADDERS)]) {
    for (const spec of ladder) if (!spec.soon && spec.voice) slots.add(spec.voice);
  }
  return [...slots];
}
