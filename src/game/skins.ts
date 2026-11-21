/**
 * De quem é cada skin na mesa.
 *
 * Numa mesa com mais de uma pessoa os cosméticos não são só seus: a **mesa** é a
 * do dealer, as **cartas da rodada** (o baralho) são as do dealer — todas, do
 * começo ao fim da mão, abra quem abrir e ganhe quem ganhar —, as **fichas de
 * cada aposta** são do jogador que apostou, e a **stack principal** (o que vai
 * para o pote) é a do dealer.
 *
 * **Bot não empresta skin.** Os bots recebem cosméticos sorteados, e deixar um
 * deles mandar no feltro faria a mesa mudar de cor sozinha a cada mão — na fila,
 * onde a mesa nasce com três bots, isso seria a regra e não a exceção. Quando
 * quem manda é um bot, vale a skin do jogador: contra bots, jogar sozinho não
 * vira surpresa visual.
 */

import type { TableView } from '../../shared/protocol';
import type { CardBackStyle, CardFaceStyle, ChipStyle, TableStyle } from '../../shared/styles';

/**
 * De quem são as skins na página de apoio (/preview.html). No jogo vale sempre `'regra'`.
 *  - `'minhas'`: tudo sai com as minhas, haja quem houver na mesa (para olhar uma skin de cada vez);
 *  - `'de-cada-um'`: bot também empresta — a mesa e o baralho do dealer, as fichas de quem apostou —,
 *    para ver a mesa com as skins de várias pessoas sem precisar de várias pessoas.
 */
export type SkinsDeApoio = 'regra' | 'minhas' | 'de-cada-um';
let apoio: SkinsDeApoio = 'regra';
export function skinsDeApoio(modo: SkinsDeApoio): void {
  apoio = modo;
}

/** Este assento empresta skin? Gente, sim; bot, não (a não ser na página de apoio). */
const empresta = (s: { isBot: boolean }) => apoio === 'de-cada-um' || (apoio === 'regra' && !s.isBot);

/** Há outro ser humano sentado além de mim? */
export function hasOtherHumans(view: TableView): boolean {
  return view.seats.some((s, seat) => !!s && empresta(s) && seat !== view.mySeat);
}

/** O assento, se houver gente nele — bot não conta, porque bot não empresta skin. */
function human(view: TableView, seat: number | null) {
  if (seat === null) return null;
  const s = view.seats[seat];
  return s && empresta(s) ? s : null;
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
 * Cartas da rodada: as do dealer, pela mesma regra da mesa.
 *
 * O baralho é um só e quem reparte é o dealer: o verso das cartas fechadas (as que voam, as que
 * ficam na frente de cada um) e a frente de todas as que se abrem — as da mesa, as da minha mão, as
 * de quem mostra no showdown, as do painel de quem ganhou — saem do baralho dele, a mão inteira.
 * Quem abre primeiro e quem ganha não mudam nada: a carta que foi repartida é a mesma que se vira.
 * Com gente, o baralho troca quando o botão passa; contra bots, ou com o botão comigo, é o meu (o
 * do perfil, a troca mais recente).
 */
export function dealerCardSkin(
  view: TableView,
  mine: { face: CardFaceStyle; back: CardBackStyle },
): { face: CardFaceStyle; back: CardBackStyle } {
  if (!hasOtherHumans(view) || view.dealerSeat === view.mySeat) return mine;
  const s = human(view, view.dealerSeat);
  return s ? { face: s.cosmetics.face, back: s.cosmetics.back } : mine;
}
