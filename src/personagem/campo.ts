/**
 * Campos de distância: o jeito como o corpo do personagem é descrito.
 *
 * Cada forma (um membro, um osso do dedo, um músculo) é uma função que diz, para um ponto do espaço,
 * a que distância ele está da superfície dela: negativa dentro, positiva fora. Juntar duas formas é
 * ficar com a menor das duas distâncias; juntar *derretendo* uma na outra (`fundir`) arredonda a
 * emenda, que é o que faz ombro, axila e a raiz dos dedos parecerem um corpo só e não peças
 * encaixadas. A malha sai depois, de src/personagem/malha.ts, que procura onde o campo vale zero.
 *
 * As distâncias são aproximadas (certas na superfície, razoáveis perto dela), e isso basta: o que
 * se desenha é só a superfície.
 */

export type V3 = readonly [number, number, number];
export type Campo = (x: number, y: number, z: number) => number;

/** Uma forma: o campo dela e uma esfera que a contém inteira (para não calcular de longe). */
export interface Forma {
  d: Campo;
  cx: number;
  cy: number;
  cz: number;
  r: number;
}

/**
 * De longe ninguém precisa da distância exata: a mais de `CORTE` da esfera de uma forma, vale a
 * distância até a esfera. Tem de ser maior que o maior arredondamento de emenda usado no corpo —
 * senão a emenda seria calculada com um número grosseiro.
 */
const CORTE = 0.08;

function limitada(d: Campo, cx: number, cy: number, cz: number, r: number): Forma {
  const lim = (r + CORTE) * (r + CORTE);
  return {
    cx,
    cy,
    cz,
    r,
    d: (x, y, z) => {
      const dx = x - cx;
      const dy = y - cy;
      const dz = z - cz;
      const q = dx * dx + dy * dy + dz * dz;
      return q > lim ? Math.sqrt(q) - r : d(x, y, z);
    },
  };
}

/** A esfera que contém todas as formas dadas, com uma folga. */
function englobar(formas: Forma[], folga: number): [number, number, number, number] {
  let x0 = Infinity;
  let y0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  let z1 = -Infinity;
  for (const f of formas) {
    x0 = Math.min(x0, f.cx - f.r);
    y0 = Math.min(y0, f.cy - f.r);
    z0 = Math.min(z0, f.cz - f.r);
    x1 = Math.max(x1, f.cx + f.r);
    y1 = Math.max(y1, f.cy + f.r);
    z1 = Math.max(z1, f.cz + f.r);
  }
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const cz = (z0 + z1) / 2;
  let r = 0;
  for (const f of formas) r = Math.max(r, Math.hypot(f.cx - cx, f.cy - cy, f.cz - cz) + f.r);
  return [cx, cy, cz, r + folga];
}

/**
 * A que distância (pelo menos) o ponto está de uma forma, medida pela esfera dela. Serve para pular
 * a conta de uma peça que está longe demais para mudar o resultado; a folga cobre o quanto o campo
 * de uma peça pode dizer menos do que a distância de verdade.
 */
const FOLGA_DE_PULAR = 0.003;
function longe(f: Forma, x: number, y: number, z: number, alcance: number): boolean {
  const lim = alcance + FOLGA_DE_PULAR + f.r;
  if (lim <= 0) return true;
  const dx = x - f.cx;
  const dy = y - f.cy;
  const dz = z - f.cz;
  return dx * dx + dy * dy + dz * dz > lim * lim;
}

/** O menor de dois, com a emenda arredondada num raio de mais ou menos `k`. */
function menorSuave(a: number, b: number, k: number): number {
  const m = a < b ? a : b;
  if (k <= 0) return m;
  const h = k - Math.abs(a - b);
  return h <= 0 ? m : m - (h * h) / (4 * k);
}
/** O maior de dois, idem. */
function maiorSuave(a: number, b: number, k: number): number {
  return -menorSuave(-a, -b, k);
}

const sub = (a: V3, b: V3): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vetorial = (a: V3, b: V3): [number, number, number] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function unitario(a: V3): [number, number, number] {
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / n, a[1] / n, a[2] / n];
}

/**
 * Um elipsoide de centro `c` e raios `r`. Sem mais nada, os raios seguem x, y e z; com `ao`, o
 * primeiro raio segue essa direção, e `cima` diz para que lado fica (mais ou menos) o segundo.
 */
export function elipsoide(c: V3, r: V3, ao?: V3, cima: V3 = [0, 1, 0]): Forma {
  let ex: V3 = [1, 0, 0];
  let ey: V3 = [0, 1, 0];
  let ez: V3 = [0, 0, 1];
  if (ao) {
    ex = unitario(ao);
    ez = unitario(vetorial(ex, cima));
    ey = vetorial(ez, ex);
  }
  const [cx, cy, cz] = c;
  const [rx, ry, rz] = r;
  const menor = Math.min(rx, ry, rz);
  return limitada(
    (x, y, z) => {
      const px = x - cx;
      const py = y - cy;
      const pz = z - cz;
      const a = (px * ex[0] + py * ex[1] + pz * ex[2]) / rx;
      const b = (px * ey[0] + py * ey[1] + pz * ey[2]) / ry;
      const c2 = (px * ez[0] + py * ez[1] + pz * ez[2]) / rz;
      const k0 = Math.sqrt(a * a + b * b + c2 * c2);
      if (k0 < 1e-6) return -menor;
      const k1 = Math.sqrt((a * a) / (rx * rx) + (b * b) / (ry * ry) + (c2 * c2) / (rz * rz));
      return (k0 * (k0 - 1)) / k1;
    },
    cx,
    cy,
    cz,
    Math.max(rx, ry, rz),
  );
}

/** Uma cápsula de `a` a `b`, com raio `ra` numa ponta e `rb` na outra. */
export function capsula(a: V3, b: V3, ra: number, rb = ra): Forma {
  const [ax, ay, az] = a;
  const e = sub(b, a);
  const l2 = e[0] * e[0] + e[1] * e[1] + e[2] * e[2] || 1;
  return limitada(
    (x, y, z) => {
      const px = x - ax;
      const py = y - ay;
      const pz = z - az;
      let t = (px * e[0] + py * e[1] + pz * e[2]) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      return Math.hypot(px - e[0] * t, py - e[1] * t, pz - e[2] * t) - (ra + (rb - ra) * t);
    },
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
    (a[2] + b[2]) / 2,
    Math.sqrt(l2) / 2 + Math.max(ra, rb),
  );
}

/**
 * Um corte ao longo de um membro: em `t` (0 na ponta `a`, 1 na ponta `b`) ele tem meia-largura
 * `ru` e meia-espessura `rv`; `ou` e `ov` empurram o centro do corte para um lado (é o que faz a
 * barriga da perna ir para trás e o bíceps para a frente); `n` é o quanto o corte é quadrado
 * (2 = elipse, 3 ou mais = um retângulo de cantos redondos).
 */
export interface Estacao {
  t: number;
  ru: number;
  rv: number;
  ou?: number;
  ov?: number;
  n?: number;
}

const AMOSTRAS = 96;

/** Interpola as estações (curva suave que passa por todas) numa tabela de `AMOSTRAS` valores. */
function tabela(est: Estacao[], valor: (e: Estacao) => number): Float64Array {
  const n = est.length;
  const v = est.map(valor);
  const t = est.map((e) => e.t);
  // a inclinação em cada estação: a da reta entre as vizinhas
  const m = v.map((_, i) => {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    return a === b ? 0 : (v[b] - v[a]) / (t[b] - t[a]);
  });
  const out = new Float64Array(AMOSTRAS);
  let i = 0;
  for (let k = 0; k < AMOSTRAS; k++) {
    const x = t[0] + ((t[n - 1] - t[0]) * k) / (AMOSTRAS - 1);
    while (i < n - 2 && x > t[i + 1]) i++;
    const h = t[i + 1] - t[i] || 1;
    const s = Math.min(1, Math.max(0, (x - t[i]) / h));
    const s2 = s * s;
    const s3 = s2 * s;
    out[k] = (2 * s3 - 3 * s2 + 1) * v[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * v[i + 1] + (s3 - s2) * h * m[i + 1];
  }
  return out;
}

/**
 * Um membro: um tubo reto de `a` a `b` cujo corte muda ao longo do caminho (as `estacoes`, com `t`
 * de 0 a 1). `frente` diz para que lado fica a espessura (`rv`, `ov`); a largura (`ru`, `ou`) fica
 * no lado `frente × eixo`. As pontas são arredondadas: `pontas.a` e `pontas.b` dizem o quanto o
 * membro passa de cada ponta (sem elas, o tanto da menor medida do corte ali).
 */
export function membro(a: V3, b: V3, frente: V3, estacoes: Estacao[], pontas: { a?: number; b?: number } = {}): Forma {
  const eixo = sub(b, a);
  const L = Math.hypot(eixo[0], eixo[1], eixo[2]);
  const w = unitario(eixo);
  const u = unitario(vetorial(frente, w));
  const v = vetorial(w, u);
  const est = [...estacoes].sort((p, q) => p.t - q.t);
  const RU = tabela(est, (e) => e.ru);
  const RV = tabela(est, (e) => e.rv);
  const OU = tabela(est, (e) => e.ou ?? 0);
  const OV = tabela(est, (e) => e.ov ?? 0);
  const EN = tabela(est, (e) => e.n ?? 2);
  const redondo = est.every((e) => (e.n ?? 2) === 2);
  const t0 = est[0].t;
  const t1 = est[est.length - 1].t;
  const pa = Math.max(1e-4, pontas.a ?? Math.min(RU[0], RV[0]));
  const pb = Math.max(1e-4, pontas.b ?? Math.min(RU[AMOSTRAS - 1], RV[AMOSTRAS - 1]));
  const [ax, ay, az] = a;

  let gordura = 0;
  for (let i = 0; i < AMOSTRAS; i++) gordura = Math.max(gordura, Math.max(RU[i], RV[i]) + Math.hypot(OU[i], OV[i]));

  return limitada(
    (x, y, z) => {
      const px = x - ax;
      const py = y - ay;
      const pz = z - az;
      const s = px * w[0] + py * w[1] + pz * w[2];
      let t = s / L;
      // o quanto o ponto passa da ponta, e o arredondamento dela
      let e = 0;
      let rc = 1;
      if (t < t0) {
        e = (t0 - t) * L;
        t = t0;
        rc = pa;
      } else if (t > t1) {
        e = (t - t1) * L;
        t = t1;
        rc = pb;
      }
      const f = ((t - t0) / (t1 - t0)) * (AMOSTRAS - 1);
      let i = f | 0;
      if (i > AMOSTRAS - 2) i = AMOSTRAS - 2;
      const k = f - i;
      const ru = RU[i] + (RU[i + 1] - RU[i]) * k;
      const rv = RV[i] + (RV[i + 1] - RV[i]) * k;
      const qu = Math.abs(px * u[0] + py * u[1] + pz * u[2] - (OU[i] + (OU[i + 1] - OU[i]) * k)) / ru;
      const qv = Math.abs(px * v[0] + py * v[1] + pz * v[2] - (OV[i] + (OV[i + 1] - OV[i]) * k)) / rv;
      // g vale 1 no contorno do corte; gu e gv dizem o quanto g cresce por metro em cada lado
      let g: number;
      let gu: number;
      let gv: number;
      if (redondo) {
        g = Math.sqrt(qu * qu + qv * qv);
        if (g < 1e-6) return e > 0 ? e - rc : -Math.min(ru, rv);
        gu = qu / (ru * g);
        gv = qv / (rv * g);
      } else {
        const n = EN[i] + (EN[i + 1] - EN[i]) * k;
        const soma = Math.pow(qu, n) + Math.pow(qv, n);
        if (soma < 1e-12) return e > 0 ? e - rc : -Math.min(ru, rv);
        g = Math.pow(soma, 1 / n);
        const c = Math.pow(soma, 1 / n - 1);
        gu = (c * Math.pow(qu, n - 1)) / ru;
        gv = (c * Math.pow(qv, n - 1)) / rv;
      }
      if (e > 0) {
        const qe = e / rc;
        const G = Math.sqrt(g * g + qe * qe);
        return ((G - 1) * G) / Math.sqrt(g * g * (gu * gu + gv * gv) + (qe * qe) / (rc * rc));
      }
      return (g - 1) / Math.sqrt(gu * gu + gv * gv);
    },
    a[0] + (eixo[0] * (t0 + t1)) / 2,
    a[1] + (eixo[1] * (t0 + t1)) / 2,
    a[2] + (eixo[2] * (t0 + t1)) / 2,
    (L * (t1 - t0)) / 2 + Math.max(pa, pb) + gordura,
  );
}

/** Uma peça a fundir (ou a cavar) numa base: o raio do arredondamento da emenda e a forma. */
export type Peca = readonly [k: number, forma: Forma];

/** Junta as peças na base, uma depois da outra, cada uma com a sua emenda arredondada. */
export function fundir(base: Forma, ...pecas: Peca[]): Forma {
  const n = pecas.length;
  const ks = pecas.map((p) => p[0]);
  const fs = pecas.map((p) => p[1]);
  const [cx, cy, cz, r] = englobar([base, ...fs], Math.max(0, ...ks));
  return limitada(
    (x, y, z) => {
      let d = base.d(x, y, z);
      // uma peça só muda o resultado se chegar a menos de k do que já se tem
      for (let i = 0; i < n; i++) if (!longe(fs[i], x, y, z, d + ks[i])) d = menorSuave(d, fs[i].d(x, y, z), ks[i]);
      return d;
    },
    cx,
    cy,
    cz,
    r,
  );
}

/** Tira as peças da base (sulcos, covas), cada uma com a borda arredondada. */
export function cavar(base: Forma, ...pecas: Peca[]): Forma {
  const n = pecas.length;
  const ks = pecas.map((p) => p[0]);
  const fs = pecas.map((p) => p[1]);
  return limitada(
    (x, y, z) => {
      let d = base.d(x, y, z);
      for (let i = 0; i < n; i++) if (!longe(fs[i], x, y, z, ks[i] - d)) d = maiorSuave(d, -fs[i].d(x, y, z), ks[i]);
      return d;
    },
    base.cx,
    base.cy,
    base.cz,
    base.r,
  );
}

/**
 * Funde cada peça na base *sem* fundir as peças entre si: é assim que os dedos nascem da palma sem
 * grudarem uns nos outros. Onde as emendas de duas peças vizinhas se encontram fica um vinco, que
 * `entre` amacia — mas só ali: longe das peças a base fica exatamente como era.
 */
export function fundirCadaUma(base: Forma, entre: number, ...pecas: Peca[]): Forma {
  const n = pecas.length;
  const ks = pecas.map((p) => p[0]);
  const fs = pecas.map((p) => p[1]);
  const [cx, cy, cz, r] = englobar([base, ...fs], Math.max(0, ...ks));
  return limitada(
    (x, y, z) => {
      const b = base.d(x, y, z);
      let d = b;
      for (let i = 0; i < n; i++) {
        // a peça só muda alguma coisa se chegar a menos de k da base
        if (longe(fs[i], x, y, z, b + ks[i])) continue;
        const junto = menorSuave(b, fs[i].d(x, y, z), ks[i]);
        // o vinco entre esta emenda e as anteriores só é amaciado na medida em que as duas saem da base
        d = menorSuave(d, junto, Math.min(entre, b - d, b - junto));
      }
      return d;
    },
    cx,
    cy,
    cz,
    r,
  );
}

/** Corta o que ficar abaixo da altura `y0` (o chão embaixo do pé). */
export function acimaDe(forma: Forma, y0: number, k: number): Forma {
  return limitada((x, y, z) => maiorSuave(forma.d(x, y, z), y0 - y, k), forma.cx, forma.cy, forma.cz, forma.r);
}

/** Uma forma a partir de um campo qualquer e da esfera que a contém. */
export function deCampo(d: Campo, c: V3, r: number): Forma {
  return limitada(d, c[0], c[1], c[2], r);
}

/** A forma engordada de `e` metros para todos os lados (uma roupa por cima de um corpo). */
export function engordar(forma: Forma, e: number): Forma {
  return limitada((x, y, z) => forma.d(x, y, z) - e, forma.cx, forma.cy, forma.cz, forma.r + Math.max(0, e));
}

/** Fica só a parte da forma onde `fora` é negativo (`fora` mede, em metros, o quanto se passou do corte). */
export function cortar(forma: Forma, fora: Campo, k = 0): Forma {
  return limitada((x, y, z) => maiorSuave(forma.d(x, y, z), fora(x, y, z), k), forma.cx, forma.cy, forma.cz, forma.r);
}

/** Várias formas juntas, sem arredondar as emendas. */
export function unir(...formas: Forma[]): Forma {
  const [cx, cy, cz, r] = englobar(formas, 0);
  return limitada(
    (x, y, z) => {
      let d = Infinity;
      for (const f of formas) {
        const v = f.d(x, y, z);
        if (v < d) d = v;
      }
      return d;
    },
    cx,
    cy,
    cz,
    r,
  );
}
