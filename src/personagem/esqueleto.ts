/**
 * O esqueleto do personagem e os pesos da pele (a que osso cada vértice obedece, e quanto).
 *
 * Os ossos ficam nas juntas da T-pose (src/personagem/corpo.ts) e todos nascem sem rotação: na
 * T-pose os eixos de cada osso são os do mundo. O lado x > 0 é a esquerda do personagem (".E") e o
 * lado x < 0, a direita (".D").
 *
 * Os pesos saem das mesmas peças que desenham o corpo: um vértice é da peça em cuja superfície ele
 * está (ou das duas, na emenda), e dentro da peça o peso corre ao longo da cadeia de ossos dela,
 * misturando dois ossos perto de cada junta. Entre os dedos não há mistura — cada vértice é de um
 * dedo só —, senão um dedo arrastaria o vizinho.
 */
import type { V3 } from './campo';
import { juntas, partesDoCorpo } from './corpo';
import type { Malha } from './malha';

export type Lado = 'E' | 'D';
export const LADOS: Lado[] = ['E', 'D'];
export const NOMES_DOS_DEDOS = ['indicador', 'medio', 'anelar', 'minimo'] as const;

export interface Osso {
  nome: string;
  /** O índice do osso pai (-1 na raiz). */
  pai: number;
  /** Onde o osso fica na T-pose, no mundo. */
  pos: V3;
}
export interface Esqueleto {
  ossos: Osso[];
  indice: Record<string, number>;
}

export function montarEsqueleto(): Esqueleto {
  const J = juntas();
  const ossos: Osso[] = [];
  const indice: Record<string, number> = {};
  const poe = (nome: string, pai: string | null, pos: V3) => {
    indice[nome] = ossos.length;
    ossos.push({ nome, pai: pai === null ? -1 : indice[pai], pos });
  };
  poe('raiz', null, [0, 0.93, 0]);
  poe('coluna', 'raiz', [0, 1.06, 0]);
  poe('peito', 'coluna', [0, 1.22, 0]);
  poe('pescoco', 'peito', [0, 1.43, -0.012]);
  poe('cabeca', 'pescoco', [0, 1.535, -0.006]);
  for (const l of LADOS) {
    const s = l === 'E' ? 1 : -1;
    const m = (p: V3): V3 => [p[0] * s, p[1], p[2]];
    poe(`clavicula.${l}`, 'peito', m([0.03, 1.41, 0]));
    poe(`braco.${l}`, `clavicula.${l}`, m(J.ombro));
    poe(`antebraco.${l}`, `braco.${l}`, m(J.cotovelo));
    // o giro do antebraço: fica no cotovelo e só roda em volta do próprio antebraço (leva a pele do punho)
    poe(`giro.${l}`, `antebraco.${l}`, m(J.cotovelo));
    poe(`mao.${l}`, `antebraco.${l}`, m(J.punho));
    const cadeia = (nome: string, d: { raiz: V3; rumo: V3; j1: number; j2: number }) => {
      const em = (dist: number): V3 => m([d.raiz[0] + d.rumo[0] * dist, d.raiz[1] + d.rumo[1] * dist, d.raiz[2] + d.rumo[2] * dist]);
      poe(`${nome}1.${l}`, `mao.${l}`, em(0));
      poe(`${nome}2.${l}`, `${nome}1.${l}`, em(d.j1));
      poe(`${nome}3.${l}`, `${nome}2.${l}`, em(d.j2));
    };
    J.dedos.forEach((d, k) => cadeia(NOMES_DOS_DEDOS[k], d));
    cadeia('polegar', J.polegar);
    poe(`coxa.${l}`, 'raiz', m(J.quadril));
    poe(`canela.${l}`, `coxa.${l}`, m(J.joelho));
    poe(`pe.${l}`, `canela.${l}`, m(J.tornozelo));
  }
  return { ossos, indice };
}

const degrau = (de: number, ate: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - de) / (ate - de)));
  return t * t * (3 - 2 * t);
};

/** A partir desta distância da superfície de uma peça, ela não pesa nada no vértice. */
const LONGE = 0.04;

/** A que distância da superfície de uma peça o peso dela cai a um terço. */
const ALCANCE = { tronco: 0.02, cabeca: 0.012, perna: 0.02, braco: 0.02, palma: 0.003, dedo: 0.0015, polegar: 0.003 };

/**
 * Os pesos de cada vértice: até quatro ossos (os índices) e o quanto cada um manda (somando 1). E,
 * de quebra, o `rosado`: o quanto o vértice está na ponta de um dedo (0 na junta, 1 na ponta), que é
 * onde a pele puxa para o rosa.
 */
export function pesar(malha: Malha, esq: Esqueleto): { indices: Uint16Array; pesos: Float32Array; rosado: Float32Array } {
  const P = partesDoCorpo();
  const J = juntas();
  const n = malha.pos.length / 3;
  const indices = new Uint16Array(n * 4);
  const pesos = new Float32Array(n * 4);
  const rosado = new Float32Array(n);
  const id = (nome: string) => esq.indice[nome];

  const soma = new Float64Array(esq.ossos.length);
  const usados: number[] = [];
  const poe = (osso: number, w: number) => {
    if (w <= 1e-5) return;
    if (soma[osso] === 0) usados.push(osso);
    soma[osso] += w;
  };
  // Só pesa a peça que está perto. De longe o campo de uma peça não é a distância de verdade (é um
  // atalho, que pula de valor de um lugar para o outro): sem este corte, faixas do braço ganhavam
  // 1 ou 2% de peso do osso do peito, e a pele saía do lugar em degraus.
  const perto = (d: number, alcance: number) => (d >= LONGE ? 0 : Math.exp(-Math.max(d, 0) / alcance) * (1 - degrau(LONGE * 0.6, LONGE, d)));

  const raiz = id('raiz');
  const coluna = id('coluna');
  const peito = id('peito');
  const pescoco = id('pescoco');
  const cabeca = id('cabeca');
  const doLado = LADOS.map((l) => ({
    sinal: l === 'E' ? 1 : -1,
    clavicula: id(`clavicula.${l}`),
    braco: id(`braco.${l}`),
    antebraco: id(`antebraco.${l}`),
    giro: id(`giro.${l}`),
    mao: id(`mao.${l}`),
    dedos: NOMES_DOS_DEDOS.map((nome) => [id(`${nome}1.${l}`), id(`${nome}2.${l}`), id(`${nome}3.${l}`)]),
    polegar: [id(`polegar1.${l}`), id(`polegar2.${l}`), id(`polegar3.${l}`)],
    coxa: id(`coxa.${l}`),
    canela: id(`canela.${l}`),
    pe: id(`pe.${l}`),
  }));
  const [ombroX, cotoveloX, punhoX] = [J.ombro[0], J.cotovelo[0], J.punho[0]];

  /** Uma cadeia de dedo: a mão antes do nó, e os três ossos misturados dois a dois em cada junta. */
  const noDedo = (w: number, mao: number, ossos: number[], dist: number, d: { j1: number; j2: number }, folga: number, naRaiz: [number, number]) => {
    const u1 = degrau(naRaiz[0], naRaiz[1], dist);
    const u2 = degrau(d.j1 - folga, d.j1 + folga, dist);
    const u3 = degrau(d.j2 - folga * 0.85, d.j2 + folga * 0.85, dist);
    poe(mao, w * (1 - u1));
    poe(ossos[0], w * u1 * (1 - u2));
    poe(ossos[1], w * u2 * (1 - u3));
    poe(ossos[2], w * u3);
  };

  for (let v = 0; v < n; v++) {
    const x = malha.pos[v * 3];
    const y = malha.pos[v * 3 + 1];
    const z = malha.pos[v * 3 + 2];
    const ax = Math.abs(x);

    // a unha é dura: vai inteira com o último osso do dedo dela
    if (malha.unha[v] === 1) {
      const L = doLado[x >= 0 ? 0 : 1];
      let dono = L.polegar[2];
      let menor = P.polegar.d(ax, y, z);
      for (let k = 0; k < 4; k++) {
        const d = P.dedos[k].d(ax, y, z);
        if (d < menor) {
          menor = d;
          dono = L.dedos[k][2];
        }
      }
      indices[v * 4] = dono;
      pesos[v * 4] = 1;
      continue;
    }

    // o tronco: bacia, coluna e peito, de baixo para cima
    {
      // (as dobras da axila e o trapézio são do tronco mas avançam pelo braço: dali para fora quem manda é o braço)
      const w = perto(P.tronco.d(ax, y, z), ALCANCE.tronco) * (y > 1.2 ? 1 - degrau(0.15, 0.215, ax) : 1);
      const sobe = degrau(0.98, 1.1, y);
      const maisAlto = degrau(1.14, 1.28, y);
      poe(raiz, w * (1 - sobe));
      poe(coluna, w * sobe * (1 - maisAlto));
      poe(peito, w * maisAlto);
    }
    // o pescoço e a cabeça
    if (y > 1.36) {
      const w = perto(Math.min(P.pescoco.d(ax, y, z), P.cabeca.d(ax, y, z)), ALCANCE.cabeca);
      const noPescoco = degrau(1.4, 1.46, y);
      const naCabeca = degrau(1.51, 1.56, y);
      poe(peito, w * (1 - noPescoco));
      poe(pescoco, w * noPescoco * (1 - naCabeca));
      poe(cabeca, w * naCabeca);
    }
    // os membros dos dois lados (cada lado vê o ponto na sua própria metade)
    for (const L of doLado) {
      const sx = x * L.sinal;
      if (y < 1.1 && sx > -0.06) {
        const w = perto(P.perna.d(sx, y, z), ALCANCE.perna);
        const naCoxa = 1 - degrau(0.86, 1.0, y);
        const naCanela = 1 - degrau(0.45, 0.53, y);
        const noPe = 1 - degrau(0.06, 0.11, y);
        poe(raiz, w * (1 - naCoxa));
        poe(L.coxa, w * naCoxa * (1 - naCanela));
        poe(L.canela, w * naCanela * (1 - noPe));
        poe(L.pe, w * noPe);
      }
      if (y > 1.2 && sx > 0.03) {
        const w = perto(P.braco.d(sx, y, z), ALCANCE.braco);
        const naClavicula = degrau(0.05, 0.1, sx);
        const noBraco = degrau(ombroX - 0.05, ombroX + 0.07, sx);
        // A mistura do cotovelo é larga atrás (a ponta do cotovelo fica redonda) e estreita na frente,
        // do lado de dentro da dobra: ali uma mistura larga afundava a pele num vão grande quando o
        // braço dobrava; estreita, o braço e o antebraço se encontram num vinco, como uma dobra de verdade.
        const naDobra = degrau(-0.4, 0.7, (z - J.cotovelo[2]) / 0.03);
        const meia = 0.05 + (0.02 - 0.05) * naDobra;
        const noAntebraco = degrau(cotoveloX - meia, cotoveloX + meia, sx);
        // o giro vai tomando o antebraço aos poucos, do cotovelo ao punho: é o que espalha a torção
        const noGiro = degrau(cotoveloX + 0.05, punhoX - 0.02, sx);
        const naMao = degrau(punhoX - 0.012, punhoX + 0.014, sx);
        poe(peito, w * (1 - naClavicula));
        poe(L.clavicula, w * naClavicula * (1 - noBraco));
        poe(L.braco, w * noBraco * (1 - noAntebraco));
        poe(L.antebraco, w * noAntebraco * (1 - noGiro) * (1 - naMao));
        poe(L.giro, w * noAntebraco * noGiro * (1 - naMao));
        poe(L.mao, w * naMao);
      }
      if (sx > 0.62) {
        // dos quatro dedos, o mais próximo e o vizinho dele
        let qual = 0;
        let menor = Infinity;
        let vizinho = 0;
        let segundo = Infinity;
        for (let k = 0; k < 4; k++) {
          const d = P.dedos[k].d(sx, y, z);
          if (d < menor) {
            segundo = menor;
            vizinho = qual;
            menor = d;
            qual = k;
          } else if (d < segundo) {
            segundo = d;
            vizinho = k;
          }
        }
        const dd = J.dedos[qual];
        const ao = (sx - dd.raiz[0]) * dd.rumo[0] + (y - dd.raiz[1]) * dd.rumo[1] + (z - dd.raiz[2]) * dd.rumo[2];
        // a palma é da mão — menos o que passa do nó dos dedos (a pele entre eles, o próprio nó):
        // isso acompanha o primeiro osso do dedo mais próximo, repartido com o vizinho. Sem isso, ao
        // fechar a mão essa pele ficava para trás, espetada para a frente.
        {
          const w = perto(P.palma.d(sx, y, z), ALCANCE.palma);
          const passou = degrau(-0.008, 0.006, ao);
          const a = Math.max(menor, 0);
          const z2 = Math.max(segundo, 0);
          const doMaisPerto = z2 > 0.02 || a + z2 < 1e-9 ? 1 : z2 / (a + z2);
          poe(L.mao, w * (1 - passou));
          poe(L.dedos[qual][0], w * passou * doMaisPerto);
          poe(L.dedos[vizinho][0], w * passou * (1 - doMaisPerto));
        }
        noDedo(perto(menor, ALCANCE.dedo), L.mao, L.dedos[qual], ao, dd, 0.006 * dd.grossura, [-0.008, 0.006]);
        if (menor < 0.004) rosado[v] = Math.max(rosado[v], degrau(dd.j2 - 0.008, dd.ponta - 0.004, ao));
        const pp = J.polegar;
        const aoPolegar = (sx - pp.raiz[0]) * pp.rumo[0] + (y - pp.raiz[1]) * pp.rumo[1] + (z - pp.raiz[2]) * pp.rumo[2];
        const doPolegar = P.polegar.d(sx, y, z);
        noDedo(perto(doPolegar, ALCANCE.polegar), L.mao, L.polegar, aoPolegar, pp, 0.007, [-0.006, 0.012]);
        if (doPolegar < 0.004) rosado[v] = Math.max(rosado[v], degrau(pp.j2 - 0.008, pp.ponta - 0.004, aoPolegar));
      }
    }

    // ficam os quatro ossos que mais mandam
    usados.sort((a, b) => soma[b] - soma[a]);
    let total = 0;
    for (let i = 0; i < 4 && i < usados.length; i++) total += soma[usados[i]];
    for (let i = 0; i < 4; i++) {
      const osso = i < usados.length ? usados[i] : 0;
      indices[v * 4 + i] = osso;
      pesos[v * 4 + i] = i < usados.length && total > 0 ? soma[osso] / total : 0;
    }
    if (total <= 0) pesos[v * 4] = 1;
    for (const o of usados) soma[o] = 0;
    usados.length = 0;
  }
  return { indices, pesos, rosado };
}
