/**
 * Apostar um acessório — o anel, a pulseira ou o relógio que o jogador está usando entram na aposta
 * no lugar de fichas.
 *
 * **Quanto vale.** O valor é medido em **big blinds**, pela raridade da peça: é a escala da mesa,
 * então o mesmo relógio é uma aposta séria numa mesa de blinds 10/20 e numa de 500/1.000. (Um valor
 * fixo em fichas seria troco numa mesa cara e impagável numa barata.)
 *
 * **O que acontece com ele.** O motor da mão (shared/engine.ts, `ItemApostado`) trata o valor como
 * aposta — os outros pagam, em fichas, para continuar —, mas ele nunca vira ficha: a peça fica na
 * mesa, no pote, e no fim vai inteira para quem ganhar. Nada é criado nem destruído: a peça só troca
 * de dono (a conta de quem perdeu deixa de tê-la; veja `transferirItem` em shared/accounts.ts).
 *
 * **O que pode ser apostado.** Só o que o jogador está **usando** na mesa — é da mão dele que a peça
 * sai — e só anel, pulseira e relógio. A aliança lisa, com que toda conta começa, também: quem a
 * perde fica sem (veja `DE_INICIO` em shared/catalog.ts).
 *
 * **A mesa decide.** Numa mesa Custom, quem a cria diz se os acessórios valem como aposta
 * (`apostaDeItens` nas regras da sala); nas partidas do jogo, valem.
 *
 * **Os bots.** Um em cada quatro vem com alguma peça (das que a loja vende). Sem fichas, o bot
 * aposta uma delas uma vez em dez. Mas a peça que **já esteve num pote** da partida continua em
 * jogo: o bot que ficar com ela a aposta sempre que zerar — ela circula até a partida acabar, e quem
 * a perdeu pode ganhá-la de volta.
 */
import { MAX_ANEIS, bracoDoRelogio, cabeNoBraco, comLegado, findAcessorio, porNoBraco, tirarDoBraco, type Acessorios, type AnelPosto, type Mao } from './acessorios';
import { isFree, itemKey, rarityOf, type Raridade } from './catalog';

/** Quantos big blinds vale, numa aposta, uma peça de cada raridade. */
export const VALOR_EM_BLINDS: Record<Raridade, number> = {
  comum: 2,
  incomum: 4,
  raro: 6,
  epico: 10,
  lendario: 16,
};

/** A chance de um bot sentar com acessórios, e a de ele apostar um deles quando fica sem fichas. */
export const BOT_COM_ACESSORIO = 0.25;
export const BOT_APOSTA = 0.1;

/** Quanto tempo quem ficou sem fichas tem para decidir se aposta um acessório (ms). */
export const TEMPO_DA_OFERTA = 15_000;

/** A chave do acessório no catálogo. */
export const chaveDoItem = (id: string): string => itemKey('acessorio', id);

/** A peça é das que se apostam? (anel, pulseira ou relógio — a aliança de início também; o que é grátis para sempre, não) */
export function podeApostar(id: string): boolean {
  const a = findAcessorio(id);
  if (!a || (a.tipo !== 'anel' && a.tipo !== 'pulseira' && a.tipo !== 'relogio')) return false;
  return !isFree(chaveDoItem(id));
}

/** Quanto a peça vale numa aposta, numa mesa com este big blind (0 = não se aposta). */
export function valorDaAposta(id: string, bigBlind: number): number {
  if (!podeApostar(id)) return 0;
  return Math.max(1, Math.round(VALOR_EM_BLINDS[rarityOf(chaveDoItem(id))] * bigBlind));
}

/**
 * Onde uma peça estava posta: o dedo, se era um anel; o braço e o lugar na fila dele (0 = junto da
 * mão), se era uma pulseira ou o relógio. Vazio: não estava nas mãos (a que um bot guardou).
 */
export interface OndeEstava {
  dedo?: AnelPosto;
  braco?: { mao: Mao; i: number };
}

/** As peças que o jogador está usando e pode apostar, sem repetição, na ordem: braços, depois anéis. */
export function apostaveis(a: Acessorios | undefined): string[] {
  if (!a) return [];
  const ids = [...a.bracos.E, ...a.bracos.D, ...a.aneis.map((x) => x.id)].filter((id) => podeApostar(id));
  return [...new Set(ids)];
}

/** O jogador está usando a peça? */
export const usando = (a: Acessorios | undefined, id: string): boolean => !!a && (a.bracos.E.includes(id) || a.bracos.D.includes(id) || a.aneis.some((x) => x.id === id));

/**
 * Tira **uma** peça das mãos — a conta pode ter mais de uma igual, e cada uma é uma aposta: a do alto
 * do braço (a última da fila), ou a do último dedo em que ela foi posta. Devolve as mãos sem ela e
 * onde ela estava, para poder voltar ao mesmo lugar.
 */
export function tirarDasMaos(a: Acessorios, id: string): { acessorios: Acessorios; onde: OndeEstava } {
  for (const mao of ['E', 'D'] as const) {
    const i = a.bracos[mao].lastIndexOf(id);
    if (i >= 0) return { acessorios: tirarDoBraco(a, mao, i), onde: { braco: { mao, i } } };
  }
  const k = a.aneis.map((x) => x.id).lastIndexOf(id);
  if (k >= 0) return { acessorios: comLegado({ ...a, aneis: a.aneis.filter((_, j) => j !== k) }), onde: { dedo: a.aneis[k] } };
  return { acessorios: a, onde: {} };
}

/** Os dedos em que quem ganha um anel o põe, na ordem de preferência (0 = indicador … 3 = mínimo). */
const DEDOS_DE_ANEL = [2, 1, 0, 3] as const;

/**
 * Põe uma peça em quem a ganhou, onde houver lugar: o anel no primeiro dedo livre; a pulseira no alto
 * do primeiro braço que ainda tem lugar; o relógio no pulso esquerdo, se ele ainda não usa um. null:
 * não há onde (aí ela fica guardada).
 */
export function vestirOndeDer(a: Acessorios, id: string): Acessorios | null {
  const def = findAcessorio(id);
  if (!def) return null;
  if (def.tipo === 'anel') {
    if (a.aneis.length >= MAX_ANEIS) return null;
    for (const mao of ['E', 'D'] as const) for (const dedo of DEDOS_DE_ANEL) if (!a.aneis.some((x) => x.mao === mao && x.dedo === dedo)) return comLegado({ ...a, aneis: [...a.aneis, { id, mao, dedo }] });
    return null;
  }
  if (def.tipo === 'relogio') return bracoDoRelogio(a) ? null : porNoBraco(a, id, 'E');
  if (def.tipo !== 'pulseira') return null;
  for (const mao of ['E', 'D'] as const) if (cabeNoBraco(a, id, mao)) return porNoBraco(a, id, mao);
  return null;
}

/** Põe a peça de volta onde estava (se o lugar continua livre: o dedo vazio, o braço com lugar, nenhum outro relógio). */
export function devolverAsMaos(a: Acessorios, id: string, onde: OndeEstava): Acessorios {
  const { dedo, braco } = onde;
  if (dedo) return a.aneis.some((y) => y.mao === dedo.mao && y.dedo === dedo.dedo) ? a : comLegado({ ...a, aneis: [...a.aneis, { ...dedo, id }] });
  if (!braco) return a;
  if (findAcessorio(id)?.tipo === 'relogio' && bracoDoRelogio(a)) return a;
  return porNoBraco(a, id, braco.mao, braco.i);
}
