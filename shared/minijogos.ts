/**
 * O prêmio dos minijogos: fichas e padocoins por nível passado.
 *
 * **Quem decide é o servidor.** O cliente só avisa "passei o nível N das Joias"; aqui se confere o
 * jogo, o nível e o ritmo. Não há teto: cada nível passado rende. A única trava é o **intervalo
 * mínimo** (`SEGUNDOS_ENTRE_PREMIOS`) — nenhum nível de verdade termina em menos que isso, então
 * pedidos mais rápidos são de robô, e não rendem.
 */

export const MINIJOGOS = ['joias', 'bolhas'] as const;
export type Minijogo = (typeof MINIJOGOS)[number];

export const ehMinijogo = (x: unknown): x is Minijogo => MINIJOGOS.includes(x as Minijogo);

/**
 * O nome de cada minijogo, para as telas que listam todos (o ranking tem uma aba por jogo).
 * Um minijogo novo entra em `MINIJOGOS` e aqui — o resto (prêmio, ranking) acompanha sozinho.
 */
export const NOME_DO_MINIJOGO: Record<Minijogo, string> = {
  joias: 'Joias',
  bolhas: 'Bolhas',
};

/**
 * O teto de pontos por nível alcançado, para aceitar um recorde.
 *
 * O recorde vem do cliente (o jogo roda lá), então o servidor só consegue barrar o absurdo: um
 * número que nenhuma partida de verdade daria até aquele nível. É bem folgado de propósito —
 * uma cascata rara não pode ser recusada.
 */
export const PONTOS_MAX_POR_NIVEL = 80_000;

/** O recorde é plausível? (jogo que existe, nível e pontos inteiros, dentro do teto) */
export function recordePlausivel(jogo: unknown, pontos: unknown, nivel: unknown): boolean {
  return (
    ehMinijogo(jogo) &&
    typeof pontos === 'number' &&
    typeof nivel === 'number' &&
    Number.isInteger(pontos) &&
    Number.isInteger(nivel) &&
    pontos > 0 &&
    nivel >= 1 &&
    nivel <= NIVEL_MAXIMO &&
    pontos <= nivel * PONTOS_MAX_POR_NIVEL
  );
}

/** O que cada nível passado rende. Padocoin só chega a quem tem Discord vinculado. */
export const PREMIO_POR_NIVEL = { fichas: 50, pado: 50 } as const;

/** O menor intervalo entre dois prêmios da mesma conta. */
export const SEGUNDOS_ENTRE_PREMIOS = 15;

/** Um nível que dá para acreditar (o cliente manda um número; o resto é recusado). */
export const NIVEL_MAXIMO = 999;

export type Decisao = { ok: true } | { ok: false; motivo: string };

/**
 * Pode premiar este nível agora? `ultimo` é o instante do último prêmio da conta (qualquer
 * minijogo), ou undefined.
 */
export function decidirPremio(jogo: unknown, nivel: unknown, ultimo: number | undefined, agora: number): Decisao {
  if (!ehMinijogo(jogo)) return { ok: false, motivo: 'esse minijogo não existe' };
  if (typeof nivel !== 'number' || !Number.isInteger(nivel) || nivel < 1 || nivel > NIVEL_MAXIMO) {
    return { ok: false, motivo: 'nível inválido' };
  }
  if (ultimo !== undefined && agora - ultimo < SEGUNDOS_ENTRE_PREMIOS * 1000) {
    return { ok: false, motivo: 'rápido demais: esse nível não rendeu prêmio' };
  }
  return { ok: true };
}
