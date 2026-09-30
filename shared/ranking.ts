/**
 * O ranking: uma aba por jogo e uma geral que junta todas.
 *
 * **Para acrescentar um quadro**, basta uma entrada em `QUADROS`: um id, o nome, a unidade e de
 * onde sai o número de cada conta. Os minijogos entram sozinhos — cada jogo de `MINIJOGOS`
 * (shared/minijogos.ts) vira um quadro pelo recorde dele —, então um minijogo novo aparece no
 * ranking sem tocar neste arquivo.
 *
 * O **geral** não soma números de jogos diferentes (pontos de Joias não se comparam com partidas
 * de poker): cada quadro vale até `PONTOS_POR_QUADRO` e a conta leva a fração do líder daquele
 * quadro. Quem lidera um quadro leva o máximo dele; quem tem metade do recorde do líder, metade.
 * Assim o geral premia quem vai bem em tudo, e um quadro novo pesa igual aos outros.
 *
 * Quem monta é o servidor (ele tem as contas); o cliente só desenha.
 */
import { MINIJOGOS, NOME_DO_MINIJOGO, type Minijogo } from './minijogos';

/** O que o ranking lê de cada conta. */
export interface ContaRanking {
  id: string;
  name: string;
  character: string;
  frame?: string;
  /** Partidas de poker ganhas em primeiro lugar. */
  matchWins: number;
  /** Partidas de poker terminadas (vai de informação na linha). */
  matches: number;
  /** O recorde de cada minijogo. */
  recordes: Partial<Record<Minijogo, number>>;
  /** Tudo o que a conta já ganhou em fichas (lucro nas mesas e prêmios). */
  ganhosFichas?: number;
  /** O mesmo em padocoins (0 para quem não tem Discord). */
  ganhosPado?: number;
}

export interface QuadroDef {
  id: string;
  nome: string;
  /** Como se lê o número ("vitórias", "pontos"). */
  unidade: string;
  valorDe(c: ContaRanking): number;
  /** Uma linha pequena embaixo do número (opcional). */
  detalheDe?(c: ContaRanking): string;
}

export const ID_GERAL = 'geral';

export const QUADROS: QuadroDef[] = [
  {
    id: 'poker',
    nome: 'Poker',
    unidade: 'vitórias',
    valorDe: (c) => c.matchWins,
    detalheDe: (c) => `${c.matches} ${c.matches === 1 ? 'partida' : 'partidas'}`,
  },
  {
    id: 'ganhos',
    nome: 'Ganhos',
    unidade: 'fichas',
    valorDe: (c) => c.ganhosFichas ?? 0,
    detalheDe: (c) => (c.ganhosPado ? `+ ${c.ganhosPado.toLocaleString('pt-BR')} padocoins` : ''),
  },
  ...MINIJOGOS.map(
    (jogo): QuadroDef => ({
      id: jogo,
      nome: NOME_DO_MINIJOGO[jogo],
      unidade: 'pontos',
      valorDe: (c) => c.recordes[jogo] ?? 0,
    }),
  ),
];

/** Quanto cada quadro vale no geral, para quem lidera ele. */
export const PONTOS_POR_QUADRO = 1000;

/** Quantas linhas cada quadro manda (a sua posição vai à parte, se ficar de fora). */
export const LINHAS_POR_QUADRO = 50;

export interface LinhaRanking {
  pos: number;
  id: string;
  name: string;
  character: string;
  frame?: string;
  valor: number;
  detalhe?: string;
  /** No geral: quanto cada quadro deu (id do quadro → pontos). */
  partes?: Record<string, number>;
}

export interface QuadroRanking {
  id: string;
  nome: string;
  unidade: string;
  linhas: LinhaRanking[];
  /** A linha de quem pediu, mesmo fora das primeiras (null = sem conta, ou sem número ali). */
  eu: LinhaRanking | null;
}

export interface Ranking {
  /** O geral primeiro, depois os quadros na ordem de `QUADROS`. */
  quadros: QuadroRanking[];
  /** Quando foi montado (ISO). */
  em: string;
}

/**
 * Ordena e numera: maior valor primeiro, empate pelo nome (para a ordem não pular a cada pedido).
 * Empatados dividem a posição (1, 2, 2, 4).
 */
function ordenar(itens: { c: ContaRanking; valor: number; detalhe?: string; partes?: Record<string, number> }[]): LinhaRanking[] {
  const ord = itens.filter((i) => i.valor > 0).sort((a, b) => b.valor - a.valor || a.c.name.localeCompare(b.c.name) || a.c.id.localeCompare(b.c.id));
  let pos = 0;
  return ord.map((i, k) => {
    if (k === 0 || i.valor !== ord[k - 1].valor) pos = k + 1;
    return {
      pos,
      id: i.c.id,
      name: i.c.name,
      character: i.c.character,
      ...(i.c.frame ? { frame: i.c.frame } : {}),
      valor: i.valor,
      ...(i.detalhe ? { detalhe: i.detalhe } : {}),
      ...(i.partes ? { partes: i.partes } : {}),
    };
  });
}

function recortar(id: string, nome: string, unidade: string, todas: LinhaRanking[], euId: string | null, limite: number): QuadroRanking {
  return { id, nome, unidade, linhas: todas.slice(0, limite), eu: (euId && todas.find((l) => l.id === euId)) || null };
}

/** Monta o ranking inteiro a partir das contas. */
export function montarRanking(contas: ContaRanking[], euId: string | null, agora = new Date(), limite = LINHAS_POR_QUADRO): Ranking {
  const porQuadro = QUADROS.map((q) => ({
    q,
    linhas: ordenar(contas.map((c) => ({ c, valor: Math.max(0, Math.floor(q.valorDe(c))), detalhe: q.detalheDe?.(c) }))),
  }));

  // o geral: cada quadro dá a fração do líder dele, até PONTOS_POR_QUADRO
  const lider = new Map(porQuadro.map(({ q, linhas }) => [q.id, linhas[0]?.valor ?? 0]));
  const geral = ordenar(
    contas.map((c) => {
      const partes: Record<string, number> = {};
      let soma = 0;
      for (const q of QUADROS) {
        const topo = lider.get(q.id) ?? 0;
        const v = Math.max(0, q.valorDe(c));
        const p = topo > 0 ? Math.round((v / topo) * PONTOS_POR_QUADRO) : 0;
        if (p > 0) partes[q.id] = p;
        soma += p;
      }
      return { c, valor: soma, partes };
    }),
  );

  return {
    quadros: [
      recortar(ID_GERAL, 'Geral', 'pontos', geral, euId, limite),
      ...porQuadro.map(({ q, linhas }) => recortar(q.id, q.nome, q.unidade, linhas, euId, limite)),
    ],
    em: agora.toISOString(),
  };
}
