/**
 * O ritmo das cartas: quanto tempo a mesa dá para o dealer repartir a mão e abrir as cartas do
 * meio. É o mesmo número dos dois lados — a sala espera esse tanto antes do evento seguinte
 * (shared/room.ts) e a mesa 3D faz o gesto do dealer caber nele (src/mesa3d/cena.ts) —, para a
 * animação não ficar para trás do jogo.
 */

/** Uma carta a cada 0,3 s; e, com muitas (o poker de 5 cartas com a mesa cheia são trinta), o dealer aperta o passo: no máximo 4,5 s. */
export function tempoDeRepartir(cartas: number): number {
  return Math.min(cartas * 300, 4500);
}

/** Abrir as cartas da mesa: as três do flop, ou uma (o turn, o river). */
export const TEMPO_DE_ABRIR = { flop: 1700, uma: 1150 };

/** Pegar o baralho da mesa antes de repartir (uma vez por mão: quem dá as cartas fica com ele na mão até o fim). */
export const TEMPO_DE_PEGAR = 1100;
