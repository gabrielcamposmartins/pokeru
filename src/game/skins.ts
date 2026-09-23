/**
 * De quem é cada skin na mesa.
 *
 * Numa mesa com mais de uma pessoa os cosméticos não são só seus: a **mesa** é a
 * do dealer, as **fichas de cada aposta** são do jogador que apostou, a **stack
 * principal** (o que vai para o pote) é a do dealer, e as **cartas abertas no
 * showdown** saem com a skin de quem está abrindo a mão.
 *
 * **Bot não empresta skin.** Os bots recebem cosméticos sorteados, e deixar um
 * deles mandar no feltro faria a mesa mudar de cor sozinha a cada mão — na fila,
 * onde a mesa nasce com três bots, isso seria a regra e não a exceção. Quando
 * quem manda é um bot, vale a skin do jogador: contra bots, jogar sozinho não
 * vira surpresa visual.
 */

import type { TableView } from '../../shared/protocol';
import type { CardBackStyle, CardFaceStyle, ChipStyle, TableStyle } from '../../shared/styles';

/** Há outro ser humano sentado além de mim? */
export function hasOtherHumans(view: TableView): boolean {
  return view.seats.some((s, seat) => !!s && !s.isBot && seat !== view.mySeat);
}

/** O assento, se houver gente nele — bot não conta, porque bot não empresta skin. */
function human(view: TableView, seat: number | null) {
  if (seat === null) return null;
  const s = view.seats[seat];
  return s && !s.isBot ? s : null;
}

/**
 * Mesa da partida: a do dealer, **só quando há outra pessoa na mesa**.
 *
 * Contra bots a mesa é sempre a minha, de ponta a ponta. Com gente, ela é a de quem está com o
 * botão — e quando o botão está comigo, ou num bot, ou ainda não foi sorteado, volta a ser a
 * minha. A minha sai do **perfil**, e não da cópia que o servidor guarda: é a troca mais recente,
 * que eu fiz no Estúdio há um minuto, e que o servidor pode ainda não ter recebido.
 */
export function tableSkin(view: TableView, mine: TableStyle): TableStyle {
  if (!hasOtherHumans(view) || view.dealerSeat === view.mySeat) return mine;
  return human(view, view.dealerSeat)?.cosmetics.table ?? mine;
}

/** Fichas de uma aposta: são de quem apostou, se for gente. */
export function chipSkin(view: TableView, seat: number, mine: ChipStyle): ChipStyle {
  if (seat === view.mySeat) return mine;
  return human(view, seat)?.cosmetics.chip ?? mine;
}

/**
 * Fichas da stack principal — o pote e as fichas em trânsito até ele.
 * São as do dealer, pela mesma razão da mesa.
 */
export function mainChipSkin(view: TableView, mine: ChipStyle): ChipStyle {
  if (!hasOtherHumans(view) || view.dealerSeat === view.mySeat) return mine;
  return human(view, view.dealerSeat)?.cosmetics.chip ?? mine;
}

/**
 * Skin das cartas enquanto a mão está sendo aberta: a de quem abre.
 *
 * `opener` é o primeiro assento do showdown (quem mostra primeiro). Fora do
 * showdown, ou quando quem abre é um bot, devolve `null` — e aí cada carta usa o
 * padrão de sempre (a skin de quem está jogando).
 */
export function openerCardSkin(
  view: TableView,
  opener: number | null,
  mine: { face: CardFaceStyle; back: CardBackStyle },
): { face: CardFaceStyle; back: CardBackStyle } | null {
  if (opener === null) return null;
  if (opener === view.mySeat) return mine;
  const s = human(view, opener);
  if (!s) return null;
  return { face: s.cosmetics.face, back: s.cosmetics.back };
}
