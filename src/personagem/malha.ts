/**
 * Do campo de distância para a malha de triângulos.
 *
 * O espaço é cortado numa grade de cubinhos de lado `passo`. Todo cubinho que a superfície atravessa
 * (o campo é negativo num canto e positivo noutro) ganha um vértice, posto no meio dos pontos onde
 * ela cruza as arestas dele; e cada aresta cruzada vira um quadrado ligando os quatro cubinhos que
 * a rodeiam. (É o método "surface nets".) Depois cada vértice é empurrado para cima da superfície
 * de verdade, e a normal dele vem da inclinação do campo — por isso a luz corre lisa mesmo com a
 * malha grossa.
 *
 * Só se calcula perto da superfície: a grade é percorrida em blocos, e o bloco cujo centro está
 * longe dela é pulado inteiro.
 */
import type { Campo, V3 } from './campo';

export interface Malha {
  /** x, y, z de cada vértice. */
  pos: Float32Array;
  /** A normal de cada vértice. */
  nor: Float32Array;
  /** O quanto cada vértice está "ao ar livre": 1 = aberto, menos = no fundo de uma dobra. */
  ar: Float32Array;
  /** 1 nos vértices das unhas, 0 na pele. */
  unha: Float32Array;
  /** Os triângulos: três índices de vértice cada. */
  idx: Uint32Array;
}

export interface Pedido {
  campo: Campo;
  /** A caixa a percorrer. */
  min: V3;
  max: V3;
  /** O lado do cubinho. */
  passo: number;
  /**
   * O campo é igual dos dois lados do plano x = 0: só o lado x ≥ 0 é percorrido, com uma fileira de
   * cubinhos centrada no plano — os vértices dela caem exatamente em x = 0, e `espelhar` fecha a
   * malha sem costura.
   */
  simetrica?: boolean;
  /** Só os cubinhos cujo centro passa aqui entram na malha (para cortar uma região). */
  aceita?: (x: number, y: number, z: number) => boolean;
}

/** Cubinhos por lado de um bloco. */
const BLOCO = 8;

export function malhar({ campo, min, max, passo: h, simetrica, aceita }: Pedido): Malha {
  const ox = simetrica ? -h / 2 : min[0];
  const oy = min[1];
  const oz = min[2];
  const nx = Math.ceil((max[0] - ox) / h);
  const ny = Math.ceil((max[1] - oy) / h);
  const nz = Math.ceil((max[2] - oz) / h);
  const S = BLOCO + 1;
  const amostras = new Float64Array(S * S * S);
  /** A distância do centro de um bloco ao canto dele. */
  const raio = (BLOCO * h * Math.sqrt(3)) / 2;

  const pos: number[] = [];
  /** O vértice de cada cubinho que tem um. */
  const vertice = new Map<number, number>();
  const chave = (i: number, j: number, k: number) => i + (nx + 1) * (j + (ny + 1) * k);
  /** As arestas cruzadas: i, j, k do canto onde ela começa, o eixo, e se o começo está dentro. */
  const arestas: number[] = [];

  for (let bk = 0; bk < nz; bk += BLOCO) {
    for (let bj = 0; bj < ny; bj += BLOCO) {
      for (let bi = 0; bi < nx; bi += BLOCO) {
        const dc = campo(ox + (bi + BLOCO / 2) * h, oy + (bj + BLOCO / 2) * h, oz + (bk + BLOCO / 2) * h);
        // o campo não é uma distância exata: a folga cobre o quanto ele pode exagerar
        if (Math.abs(dc) > raio * 1.8 + 0.004) continue;

        for (let c = 0; c < S; c++) for (let b = 0; b < S; b++) for (let a = 0; a < S; a++) amostras[a + S * (b + S * c)] = campo(ox + (bi + a) * h, oy + (bj + b) * h, oz + (bk + c) * h);

        for (let c = 0; c < BLOCO; c++) {
          for (let b = 0; b < BLOCO; b++) {
            for (let a = 0; a < BLOCO; a++) {
              const i = bi + a;
              const j = bj + b;
              const k = bk + c;
              if (i >= nx || j >= ny || k >= nz) continue;
              const base = a + S * (b + S * c);
              const v0 = amostras[base];
              const v1 = amostras[base + 1];
              const v2 = amostras[base + S];
              const v3 = amostras[base + S + 1];
              const v4 = amostras[base + S * S];
              const v5 = amostras[base + S * S + 1];
              const v6 = amostras[base + S * S + S];
              const v7 = amostras[base + S * S + S + 1];
              const dentro = (v0 < 0 ? 1 : 0) + (v1 < 0 ? 1 : 0) + (v2 < 0 ? 1 : 0) + (v3 < 0 ? 1 : 0) + (v4 < 0 ? 1 : 0) + (v5 < 0 ? 1 : 0) + (v6 < 0 ? 1 : 0) + (v7 < 0 ? 1 : 0);
              if (dentro === 0 || dentro === 8) continue;

              // as três arestas que saem do canto de baixo deste cubinho são dele
              if (v0 < 0 !== v1 < 0) arestas.push(i, j, k, 0, v0 < 0 ? 1 : 0);
              if (v0 < 0 !== v2 < 0) arestas.push(i, j, k, 1, v0 < 0 ? 1 : 0);
              if (v0 < 0 !== v4 < 0) arestas.push(i, j, k, 2, v0 < 0 ? 1 : 0);

              if (aceita && !aceita(ox + (i + 0.5) * h, oy + (j + 0.5) * h, oz + (k + 0.5) * h)) continue;

              // o vértice: a média dos pontos onde a superfície cruza as doze arestas
              let sx = 0;
              let sy = 0;
              let sz = 0;
              let n = 0;
              const cruza = (va: number, vb: number, x: number, y: number, z: number, eixo: number) => {
                if (va < 0 === vb < 0) return;
                const t = va / (va - vb);
                sx += eixo === 0 ? x + t : x;
                sy += eixo === 1 ? y + t : y;
                sz += eixo === 2 ? z + t : z;
                n++;
              };
              cruza(v0, v1, 0, 0, 0, 0);
              cruza(v2, v3, 0, 1, 0, 0);
              cruza(v4, v5, 0, 0, 1, 0);
              cruza(v6, v7, 0, 1, 1, 0);
              cruza(v0, v2, 0, 0, 0, 1);
              cruza(v1, v3, 1, 0, 0, 1);
              cruza(v4, v6, 0, 0, 1, 1);
              cruza(v5, v7, 1, 0, 1, 1);
              cruza(v0, v4, 0, 0, 0, 2);
              cruza(v1, v5, 1, 0, 0, 2);
              cruza(v2, v6, 0, 1, 0, 2);
              cruza(v3, v7, 1, 1, 0, 2);
              vertice.set(chave(i, j, k), pos.length / 3);
              pos.push(simetrica && i === 0 ? 0 : ox + (i + sx / n) * h, oy + (j + sy / n) * h, oz + (k + sz / n) * h);
            }
          }
        }
      }
    }
  }

  // cada aresta cruzada vira um quadrado entre os quatro cubinhos em volta dela
  const idx: number[] = [];
  const passoDe = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let e = 0; e < arestas.length; e += 5) {
    const i = arestas[e];
    const j = arestas[e + 1];
    const k = arestas[e + 2];
    const eixo = arestas[e + 3];
    const b = passoDe[(eixo + 1) % 3];
    const c = passoDe[(eixo + 2) % 3];
    if (i - b[0] - c[0] < 0 || j - b[1] - c[1] < 0 || k - b[2] - c[2] < 0) continue;
    const q0 = vertice.get(chave(i, j, k));
    const q1 = vertice.get(chave(i - b[0], j - b[1], k - b[2]));
    const q2 = vertice.get(chave(i - b[0] - c[0], j - b[1] - c[1], k - b[2] - c[2]));
    const q3 = vertice.get(chave(i - c[0], j - c[1], k - c[2]));
    if (q0 === undefined || q1 === undefined || q2 === undefined || q3 === undefined) continue;
    // o começo da aresta está dentro: a face olha para o lado do eixo
    if (arestas[e + 4]) idx.push(q0, q1, q2, q0, q2, q3);
    else idx.push(q0, q2, q1, q0, q3, q2);
  }

  // cada vértice vai para cima da superfície de verdade, e ganha a normal e o "ar livre"
  const n = pos.length / 3;
  const P = new Float32Array(pos);
  const N = new Float32Array(n * 3);
  const A = new Float32Array(n);
  const eps = h * 0.8;
  for (let v = 0; v < n; v++) {
    let x = P[v * 3];
    let y = P[v * 3 + 1];
    let z = P[v * 3 + 2];
    const noPlano = !!simetrica && x === 0;
    let gx = 0;
    let gy = 0;
    let gz = 0;
    for (let volta = 0; volta < 2; volta++) {
      gx = noPlano ? 0 : campo(x + eps, y, z) - campo(x - eps, y, z);
      gy = campo(x, y + eps, z) - campo(x, y - eps, z);
      gz = campo(x, y, z + eps) - campo(x, y, z - eps);
      const g = Math.hypot(gx, gy, gz) || 1;
      gx /= g;
      gy /= g;
      gz /= g;
      if (volta === 1) break;
      // a inclinação do campo por metro é g / (2 eps); o passo não passa de um cubinho
      const anda = Math.max(-h, Math.min(h, (campo(x, y, z) * 2 * eps) / g));
      x -= gx * anda;
      y -= gy * anda;
      z -= gz * anda;
    }
    P[v * 3] = x;
    P[v * 3 + 1] = y;
    P[v * 3 + 2] = z;
    N[v * 3] = gx;
    N[v * 3 + 1] = gy;
    N[v * 3 + 2] = gz;
    // quanto de espaço vazio há à frente do vértice, de perto e de longe
    let ar = 0;
    for (const [r, peso] of ALCANCES) ar += peso * Math.min(1, Math.max(0, campo(x + gx * r, y + gy * r, z + gz * r) / r));
    A[v] = ar;
  }

  return { pos: P, nor: N, ar: A, unha: new Float32Array(n), idx: new Uint32Array(idx) };
}

/** As distâncias (em metros) em que se mede o "ar livre" de um vértice, e o peso de cada uma. */
const ALCANCES: [number, number][] = [
  [0.004, 0.3],
  [0.012, 0.35],
  [0.035, 0.35],
];

/** Completa uma malha feita com `simetrica`: copia o lado x > 0 para o lado x < 0. */
export function espelhar(m: Malha): Malha {
  const n = m.pos.length / 3;
  const par = new Uint32Array(n);
  let extra = 0;
  for (let v = 0; v < n; v++) par[v] = m.pos[v * 3] === 0 ? v : n + extra++;
  const pos = new Float32Array((n + extra) * 3);
  const nor = new Float32Array((n + extra) * 3);
  const ar = new Float32Array(n + extra);
  const unha = new Float32Array(n + extra);
  pos.set(m.pos);
  nor.set(m.nor);
  ar.set(m.ar);
  unha.set(m.unha);
  for (let v = 0; v < n; v++) {
    const w = par[v];
    if (w === v) continue;
    pos[w * 3] = -m.pos[v * 3];
    pos[w * 3 + 1] = m.pos[v * 3 + 1];
    pos[w * 3 + 2] = m.pos[v * 3 + 2];
    nor[w * 3] = -m.nor[v * 3];
    nor[w * 3 + 1] = m.nor[v * 3 + 1];
    nor[w * 3 + 2] = m.nor[v * 3 + 2];
    ar[w] = m.ar[v];
    unha[w] = m.unha[v];
  }
  const idx = new Uint32Array(m.idx.length * 2);
  idx.set(m.idx);
  for (let t = 0; t < m.idx.length; t += 3) {
    // o espelho vira a face do avesso: a ordem dos cantos troca
    idx[m.idx.length + t] = par[m.idx[t]];
    idx[m.idx.length + t + 1] = par[m.idx[t + 2]];
    idx[m.idx.length + t + 2] = par[m.idx[t + 1]];
  }
  return { pos, nor, ar, unha, idx };
}

/** Várias malhas numa só. */
export function juntar(malhas: Malha[]): Malha {
  const nv = malhas.reduce((s, m) => s + m.pos.length / 3, 0);
  const nt = malhas.reduce((s, m) => s + m.idx.length, 0);
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const ar = new Float32Array(nv);
  const unha = new Float32Array(nv);
  const idx = new Uint32Array(nt);
  let v = 0;
  let t = 0;
  for (const m of malhas) {
    pos.set(m.pos, v * 3);
    nor.set(m.nor, v * 3);
    ar.set(m.ar, v);
    unha.set(m.unha, v);
    for (let i = 0; i < m.idx.length; i++) idx[t + i] = m.idx[i] + v;
    v += m.pos.length / 3;
    t += m.idx.length;
  }
  return { pos, nor, ar, unha, idx };
}
