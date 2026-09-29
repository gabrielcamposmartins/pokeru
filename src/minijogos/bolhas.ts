/**
 * Bolhas: o minijogo de atirar uma bolha colorida para cima e juntar três ou mais da mesma cor.
 *
 * As bolhas ficam numa grade de colmeia: as linhas alternam meia bolha para o lado. Quando a grade
 * ganha uma linha nova no alto, todas descem uma casa e o deslocamento das linhas se inverte — por
 * isso a grade guarda `par`, que diz se a linha de cima está deslocada.
 *
 * Só a regra mora aqui: geometria, o voo (com a tabela nas paredes), onde a bolha para, o que
 * estoura e o que cai por ter ficado solta. O desenho é de JogoBolhas.tsx, num canvas.
 */

export const COLS = 11;
/** Raio de uma bolha, nas unidades do tabuleiro (o canvas escala para a tela). */
export const R = 20;
export const LARGURA = COLS * 2 * R;
/** Distância vertical entre as linhas da colmeia. */
export const ALTURA_LINHA = R * Math.sqrt(3);
/** A bolha que chega nesta linha perde a partida. */
export const LINHA_LIMITE = 13;
export const ALTURA = Math.ceil(R + LINHA_LIMITE * ALTURA_LINHA + 110);
/** De onde sai o tiro. */
export const ATIRADOR = { x: LARGURA / 2, y: ALTURA - 52 };
export const VELOCIDADE = 900; // unidades por segundo

export const PALETA = ['#ff3b4a', '#ffb52e', '#3bd35a', '#2fa8ff', '#b04dff', '#39e3e0'] as const;

export interface Grade {
  linhas: (number | null)[][];
  /** 1 quando a linha 0 está deslocada meia bolha para a direita. */
  par: 0 | 1;
}

export interface Casa {
  r: number;
  c: number;
}

export type Rng = () => number;

export const deslocada = (g: Grade, r: number) => (r + g.par) % 2 === 1;
export const colunasDa = (g: Grade, r: number) => (deslocada(g, r) ? COLS - 1 : COLS);

export function centro(g: Grade, r: number, c: number): { x: number; y: number } {
  return { x: R + 2 * R * c + (deslocada(g, r) ? R : 0), y: R + r * ALTURA_LINHA };
}

const valida = (g: Grade, r: number, c: number) => r >= 0 && c >= 0 && c < colunasDa(g, r);
export const cor = (g: Grade, r: number, c: number) => (valida(g, r, c) ? (g.linhas[r]?.[c] ?? null) : null);

/** As seis vizinhas de uma casa (as que existem na grade). */
export function vizinhas(g: Grade, r: number, c: number): Casa[] {
  const d = deslocada(g, r);
  const cand: Casa[] = [
    { r, c: c - 1 },
    { r, c: c + 1 },
    { r: r - 1, c: d ? c : c - 1 },
    { r: r - 1, c: d ? c + 1 : c },
    { r: r + 1, c: d ? c : c - 1 },
    { r: r + 1, c: d ? c + 1 : c },
  ];
  return cand.filter((q) => valida(g, q.r, q.c));
}

/** Uma grade nova com `linhas` linhas cheias, das cores `0…cores-1`. */
export function criar(linhas: number, cores: number, rng: Rng = Math.random): Grade {
  const g: Grade = { linhas: [], par: 0 };
  for (let r = 0; r < linhas; r++) g.linhas.push(linhaNova(g, r, cores, rng));
  return g;
}

/**
 * Uma linha cheia. As cores vêm em manchas (a mesma da vizinha de cima ou do lado, às vezes), como
 * nos jogos do gênero: uma grade de cores sorteadas uma a uma quase não deixa jogada boa.
 */
function linhaNova(g: Grade, r: number, cores: number, rng: Rng, acima?: (number | null)[]): (number | null)[] {
  const n = colunasDa(g, r);
  const linha: (number | null)[] = [];
  for (let c = 0; c < n; c++) {
    const x = rng();
    if (c > 0 && x < 0.35) linha.push(linha[c - 1]);
    else if (acima?.[c] != null && x < 0.55) linha.push(acima[c]);
    else linha.push(Math.floor(rng() * cores));
  }
  return linha;
}

/** A grade ganha uma linha cheia no alto; todas as outras descem uma casa. */
export function empurrar(g: Grade, cores: number, rng: Rng = Math.random): Grade {
  const n: Grade = { linhas: [[], ...g.linhas.map((l) => l.slice())], par: (1 - g.par) as 0 | 1 };
  n.linhas[0] = linhaNova(n, 0, cores, rng, n.linhas[1]);
  return n;
}

/** As bolhas da mesma cor ligadas à casa (inclusive ela). */
export function grupo(g: Grade, r: number, c: number): Casa[] {
  const alvo = cor(g, r, c);
  if (alvo == null) return [];
  const vistas = new Set<string>([`${r},${c}`]);
  const fila: Casa[] = [{ r, c }];
  const out: Casa[] = [];
  while (fila.length) {
    const q = fila.pop()!;
    out.push(q);
    for (const v of vizinhas(g, q.r, q.c)) {
      const k = `${v.r},${v.c}`;
      if (!vistas.has(k) && cor(g, v.r, v.c) === alvo) {
        vistas.add(k);
        fila.push(v);
      }
    }
  }
  return out;
}

/** As bolhas que não estão presas ao teto por nenhum caminho (essas caem). */
export function soltas(g: Grade): Casa[] {
  const presas = new Set<string>();
  const fila: Casa[] = [];
  for (let c = 0; c < colunasDa(g, 0); c++)
    if (cor(g, 0, c) != null) {
      presas.add(`0,${c}`);
      fila.push({ r: 0, c });
    }
  while (fila.length) {
    const q = fila.pop()!;
    for (const v of vizinhas(g, q.r, q.c)) {
      const k = `${v.r},${v.c}`;
      if (!presas.has(k) && cor(g, v.r, v.c) != null) {
        presas.add(k);
        fila.push(v);
      }
    }
  }
  const out: Casa[] = [];
  g.linhas.forEach((l, r) => l.forEach((x, c) => x != null && !presas.has(`${r},${c}`) && out.push({ r, c })));
  return out;
}

/** As cores que ainda estão na grade (o atirador só recebe cores que servem). */
export function coresNaGrade(g: Grade): number[] {
  const s = new Set<number>();
  for (const l of g.linhas) for (const x of l) if (x != null) s.add(x);
  return [...s].sort((a, b) => a - b);
}

export const vazia = (g: Grade) => g.linhas.every((l) => l.every((x) => x == null));

/** A linha mais baixa que tem bolha (-1 se não houver nenhuma). */
export function ultimaLinha(g: Grade): number {
  for (let r = g.linhas.length - 1; r >= 0; r--) if (g.linhas[r].some((x) => x != null)) return r;
  return -1;
}

// ------------------------------------------------------------------ o voo

export interface Voo {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** O tiro, num ângulo (radianos, medido do chão: π/2 é reto para cima). */
export function atirar(angulo: number): Voo {
  return { x: ATIRADOR.x, y: ATIRADOR.y, vx: Math.cos(angulo) * VELOCIDADE, vy: -Math.sin(angulo) * VELOCIDADE };
}

/** O ângulo do tiro, preso entre 8° e 172° para a bolha nunca sair quase deitada. */
export function anguloPara(x: number, y: number): number {
  const a = Math.atan2(ATIRADOR.y - y, x - ATIRADOR.x);
  const min = (8 * Math.PI) / 180;
  if (a < 0) return x < ATIRADOR.x ? Math.PI - min : min;
  return Math.max(min, Math.min(Math.PI - min, a));
}

/** Uma colisão perdoa um pouco: a bolha passa raspando entre duas sem grudar. */
const TOQUE = 2 * R - 6;

/** A bolha bateu em alguma coisa? (no teto ou numa bolha da grade) */
function bateu(g: Grade, x: number, y: number): boolean {
  if (y <= R) return true;
  for (let r = 0; r < g.linhas.length; r++)
    for (let c = 0; c < g.linhas[r].length; c++) {
      if (g.linhas[r][c] == null) continue;
      const p = centro(g, r, c);
      if ((p.x - x) ** 2 + (p.y - y) ** 2 < TOQUE * TOQUE) return true;
    }
  return false;
}

/**
 * Anda o voo `dt` segundos, em passinhos (para não atravessar bolha), com a tabela nas paredes.
 * Devolve o voo novo e, se bateu, a casa onde a bolha para.
 */
export function avancar(g: Grade, v: Voo, dt: number): { voo: Voo; parou: Casa | null } {
  let { x, y, vx, vy } = v;
  const dist = Math.hypot(vx, vy) * dt;
  const passos = Math.max(1, Math.ceil(dist / 4));
  for (let i = 0; i < passos; i++) {
    x += (vx * dt) / passos;
    y += (vy * dt) / passos;
    if (x < R) {
      x = 2 * R - x;
      vx = Math.abs(vx);
    } else if (x > LARGURA - R) {
      x = 2 * (LARGURA - R) - x;
      vx = -Math.abs(vx);
    }
    if (bateu(g, x, y)) return { voo: { x, y, vx, vy }, parou: encaixe(g, x, y) };
  }
  return { voo: { x, y, vx, vy }, parou: null };
}

/** A casa vazia mais perto do ponto onde a bolha parou, colada em alguma bolha ou no teto. */
export function encaixe(g: Grade, x: number, y: number): Casa {
  let melhor: Casa | null = null;
  let menor = Infinity;
  const ate = Math.max(g.linhas.length, Math.floor((y - R) / ALTURA_LINHA) + 2);
  for (let r = 0; r <= ate; r++)
    for (let c = 0; c < colunasDa(g, r); c++) {
      if (cor(g, r, c) != null) continue;
      // só serve casa presa: no teto ou encostada em alguma bolha
      if (r > 0 && !vizinhas(g, r, c).some((q) => cor(g, q.r, q.c) != null)) continue;
      const p = centro(g, r, c);
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < menor) {
        menor = d;
        melhor = { r, c };
      }
    }
  return melhor ?? { r: 0, c: Math.max(0, Math.min(COLS - 1, Math.round((x - R) / (2 * R)))) };
}

/** O caminho da mira: os pontos do voo até a primeira batida (no máximo duas tabelas). */
export function mira(g: Grade, angulo: number): { x: number; y: number }[] {
  let v = atirar(angulo);
  const pts = [{ x: v.x, y: v.y }];
  let tabelas = 0;
  for (let i = 0; i < 400; i++) {
    const vxAntes = v.vx;
    const r = avancar(g, v, 1 / 120);
    v = r.voo;
    if (Math.sign(v.vx) !== Math.sign(vxAntes)) {
      pts.push({ x: v.x, y: v.y });
      if (++tabelas > 2) break;
    }
    if (r.parou) {
      pts.push({ x: v.x, y: v.y });
      break;
    }
  }
  if (pts.length === 1) pts.push({ x: v.x, y: v.y });
  return pts;
}

// ------------------------------------------------------------------ a jogada

export interface Resultado {
  grade: Grade;
  /** A casa onde a bolha atirada ficou. */
  casa: Casa;
  estouradas: Casa[];
  caidas: { casa: Casa; cor: number }[];
  pontos: number;
}

/**
 * A bolha para na casa: se juntou três ou mais da mesma cor, elas estouram, e o que ficou solto
 * do teto cai junto.
 */
export function pousar(g: Grade, casa: Casa, corDaBolha: number): Resultado {
  const n: Grade = { linhas: g.linhas.map((l) => l.slice()), par: g.par };
  while (n.linhas.length <= casa.r) n.linhas.push(new Array(colunasDa(n, n.linhas.length)).fill(null));
  n.linhas[casa.r][casa.c] = corDaBolha;
  const junto = grupo(n, casa.r, casa.c);
  if (junto.length < 3) return { grade: n, casa, estouradas: [], caidas: [], pontos: 0 };
  for (const q of junto) n.linhas[q.r][q.c] = null;
  const caidas = soltas(n).map((q) => ({ casa: q, cor: n.linhas[q.r][q.c]! }));
  for (const q of caidas) n.linhas[q.casa.r][q.casa.c] = null;
  // as linhas vazias do fim saem (a grade não cresce à toa)
  while (n.linhas.length && n.linhas[n.linhas.length - 1].every((x) => x == null)) n.linhas.pop();
  // estourar vale 10 cada; derrubar vale o dobro, e mais quanto mais cai de uma vez
  const pontos = junto.length * 10 + caidas.length * 20 * Math.max(1, Math.ceil(caidas.length / 4));
  return { grade: n, casa, estouradas: junto, caidas, pontos };
}

/** Tiros seguidos sem estourar nada até a grade descer uma linha. */
export const ERROS_ATE_DESCER = 6;
