import type { Card } from './cards';

/**
 * O histórico das mãos de uma partida.
 *
 * Cada mão que acaba vira um registro: as cartas da mesa, o pote e, para cada jogador, o que ele
 * pôs e o que levou. As cartas fechadas de alguém só aparecem se ele as **mostrou** no showdown —
 * o histórico não pode ser o jeito de ver a mão de quem desistiu. As do próprio jogador vão à parte
 * (`minhas`), e só para ele.
 *
 * Vive em dois lugares: na mesa, durante a partida (o botão de histórico na tela do jogo), e na
 * conta, junto de cada partida do perfil. Na conta ele fica **fora** da foto da conta que vai ao
 * cliente a cada mudança: é pedido quando alguém abre a partida (`maosDaPartida`), porque dez
 * partidas de dezenas de mãos pesariam em toda atualização de saldo.
 */

export interface JogadorDaMao {
  seat: number;
  nome: string;
  bot: boolean;
  /** Id do personagem com que jogou a mão. */
  personagem: string;
  /** As cartas que ele mostrou no showdown (ausente = não mostrou). */
  cartas?: Card[];
  /** O nome da mão que ele mostrou ("Par de Ases"). */
  mao?: string;
  /** Quanto pôs no pote. */
  apostou: number;
  /** O saldo da mão: o que levou menos o que pôs. */
  resultado: number;
  desistiu: boolean;
  venceu: boolean;
  allIn: boolean;
}

export interface MaoDaPartida {
  /** O número da mão na partida. */
  n: number;
  /** As cartas comunitárias (vazio no poker de 5 cartas, ou se acabou antes do flop). */
  mesa: Card[];
  pote: number;
  jogadores: JogadorDaMao[];
  /** O assento de quem está vendo (ausente = não estava nesta mão). */
  meuAssento?: number;
  /** As cartas de quem está vendo — só dele, mesmo que tenha desistido. */
  minhas?: Card[];
}

/** Quantas mãos de uma partida ficam guardadas (as mais recentes): uma partida longa não cresce sem fim. */
export const MAOS_POR_PARTIDA = 80;
