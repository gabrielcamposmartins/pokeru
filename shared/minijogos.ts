/**
 * O prêmio dos minijogos: fichas e padocoins por nível passado.
 *
 * **Quem decide é o servidor.** O cliente só avisa "passei o nível N das Joias"; aqui se confere se
 * a conta ainda pode ganhar hoje e se não passou tempo de menos desde o último prêmio. Um cliente
 * modificado pode mentir que passou de nível, mas não ganha mais do que o teto do dia — e o teto é
 * pequeno de propósito: minijogo é passatempo, não a forma de enriquecer.
 *
 * As duas travas:
 *   - **teto diário** (`NIVEIS_PREMIADOS_POR_DIA`): conta por dia de Brasília, na conta — sobrevive
 *     a reconexão e a reinício do servidor;
 *   - **intervalo mínimo** (`SEGUNDOS_ENTRE_PREMIOS`): nenhum nível de verdade termina em menos que
 *     isso, então pedidos mais rápidos são de robô.
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

/** Quantos níveis rendem prêmio por dia, somando os minijogos. */
export const NIVEIS_PREMIADOS_POR_DIA = 20;

/** O menor intervalo entre dois prêmios da mesma conta. */
export const SEGUNDOS_ENTRE_PREMIOS = 15;

/** Um nível que dá para acreditar (o cliente manda um número; o resto é recusado). */
export const NIVEL_MAXIMO = 999;

/** Quantos níveis a conta já teve premiados, e em que dia. */
export interface PremiosDoDia {
  /** Dia de Brasília, `AAAA-MM-DD`. */
  dia: string;
  niveis: number;
}

/** O dia de Brasília (UTC−3) de um instante — é quando o teto zera. */
export function diaDe(ms: number): string {
  return new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);
}

/** Quantos níveis a conta já teve premiados hoje (um registro de outro dia vale zero). */
export function premiadosHoje(p: PremiosDoDia | undefined, agora: number): number {
  return p && p.dia === diaDe(agora) ? p.niveis : 0;
}

export type Decisao =
  | { ok: true; registro: PremiosDoDia; restantes: number }
  | { ok: false; motivo: string; restantes: number };

/**
 * Pode premiar este nível agora?
 *
 * `ultimo` é o instante do último prêmio da conta (qualquer minijogo), ou undefined.
 * Devolve o registro novo do dia quando pode — quem chama grava e entrega o prêmio.
 */
export function decidirPremio(jogo: unknown, nivel: unknown, p: PremiosDoDia | undefined, ultimo: number | undefined, agora: number): Decisao {
  const feitos = premiadosHoje(p, agora);
  const restantes = Math.max(0, NIVEIS_PREMIADOS_POR_DIA - feitos);
  if (!ehMinijogo(jogo)) return { ok: false, motivo: 'esse minijogo não existe', restantes };
  if (typeof nivel !== 'number' || !Number.isInteger(nivel) || nivel < 1 || nivel > NIVEL_MAXIMO) {
    return { ok: false, motivo: 'nível inválido', restantes };
  }
  if (restantes <= 0) return { ok: false, motivo: 'os prêmios de hoje já acabaram — volte amanhã', restantes: 0 };
  if (ultimo !== undefined && agora - ultimo < SEGUNDOS_ENTRE_PREMIOS * 1000) {
    return { ok: false, motivo: 'rápido demais: esse nível não rendeu prêmio', restantes };
  }
  return { ok: true, registro: { dia: diaDe(agora), niveis: feitos + 1 }, restantes: restantes - 1 };
}
