/**
 * Catálogo de recompensas do vínculo (a parte que é do cliente: vozes, emotes e skins).
 *
 * As regras — pontos, corações e missões — ficam em shared/bond.ts, porque o servidor hospedado
 * pontua as contas com as mesmas contas. Este arquivo reexporta tudo, então quem já importava de
 * 'src/game/bond' continua funcionando.
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
import { heartsOf } from '../../shared/bond';

export * from '../../shared/bond';

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
