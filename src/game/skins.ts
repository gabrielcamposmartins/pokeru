/**
 * De quem é cada skin na mesa.
 *
 * Numa mesa com mais de uma pessoa os cosméticos não são só seus: a **mesa** é a
 * do dealer, as **fichas de cada aposta** são do jogador que apostou, a **stack
 * principal** (o que vai para o pote) é a do dealer, e as **cartas abertas no
 * showdown** saem com a skin de quem está abrindo a mão.
 *
 * Contra bots, nada disso muda o que o jogador vê: sem outro humano na mesa a
 * skin continua sendo a dele. Assim jogar sozinho não vira uma surpresa visual.
 */

import type { TableView } from '../../shared/protocol';
import type { CardBackStyle, CardFaceStyle, ChipStyle, TableStyle } from '../../shared/styles';

/** Há outro ser humano sentado além de mim? */
export function hasOtherHumans(view: TableView): boolean {
  return view.seats.some((s, seat) => !!s && !s.isBot && seat !== view.mySeat);
}

/**
 * Mesa da partida: a do dealer quando há outros humanos, a minha caso contrário.
 * Sem dealer definido (mesa parada) também fica a minha.
 */
export function tableSkin(view: TableView, mine: TableStyle): TableStyle {
  if (!hasOtherHumans(view)) return mine;
  const dealer = view.dealerSeat === null ? null : view.seats[view.dealerSeat];
  return dealer?.cosmetics.table ?? mine;
}

/** Fichas de uma aposta: são de quem apostou. */
export function chipSkin(view: TableView, seat: number, mine: ChipStyle): ChipStyle {
  if (seat === view.mySeat) return mine;
  return view.seats[seat]?.cosmetics.chip ?? mine;
}

/**
 * Fichas da stack principal — o pote e as fichas em trânsito até ele.
 * São as do dealer, pela mesma razão da mesa.
 */
export function mainChipSkin(view: TableView, mine: ChipStyle): ChipStyle {
  if (!hasOtherHumans(view)) return mine;
  const dealer = view.dealerSeat === null ? null : view.seats[view.dealerSeat];
  return dealer?.cosmetics.chip ?? mine;
}

/**
 * Skin das cartas enquanto a mão está sendo aberta: a de quem abre.
 *
 * `opener` é o primeiro assento do showdown (quem mostra primeiro). Fora do
 * showdown, ou contra bots, devolve `null` — e aí cada carta usa o padrão de
 * sempre (a skin de quem está jogando).
 */
export function openerCardSkin(
  view: TableView,
  opener: number | null,
  mine: { face: CardFaceStyle; back: CardBackStyle },
): { face: CardFaceStyle; back: CardBackStyle } | null {
  if (opener === null || !hasOtherHumans(view)) return null;
  if (opener === view.mySeat) return mine;
  const s = view.seats[opener];
  if (!s) return null;
  return { face: s.cosmetics.face, back: s.cosmetics.back };
}
