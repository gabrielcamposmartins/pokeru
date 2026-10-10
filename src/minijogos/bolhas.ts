/**
 * Bolhas: o minijogo de atirar uma bolha colorida para cima e juntar três ou mais da mesma cor.
 *
 * As bolhas ficam numa grade de colmeia: as linhas alternam meia bolha para o lado. Quando a grade
 * ganha uma linha nova no alto, todas descem uma casa e o deslocamento das linhas se inverte — por
 * isso a grade guarda `par`, que diz se a linha de cima está deslocada.
 *
 * Só a regra mora aqui: geometria, o voo (com a tabela nas paredes), onde a bolha para, o que
 * estoura e o que cai por ter ficado solta. O desenho é de JogoBolhas.tsx, num canvas.
 *
 * **O que cabe numa casa** é um número, e o número diz a cor e o tipo (veja `corDe` e `tipoDe`):
 *
 *   - `0…7`: a bolha comum, de uma das oito cores;
 *   - `RAIO + cor`: a bolha-raio — estoura como as outras da cor dela e leva a linha inteira junto;
 *   - `ESTRELA + cor`: a bolha-estrela — o estouro em que ela entra vale o dobro;
 *   - `PEDRA`: a pedra, sem cor — não estoura por cor; só sai caindo, na bomba ou no raio.
 *
 * E o atirador, além das cores, às vezes tem na mão uma **bomba** (`BOMBA`, explode tudo em volta
 * de onde para) ou um **curinga** (`CURINGA`, vira a cor que mais estoura onde encostar).
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

/**
 * As cores das bolhas, iguais em qualquer tema: vermelho, âmbar, verde, azul, violeta, turquesa,
 * rosa e laranja. As duas últimas só entram nos níveis altos (veja `nivelBolhas`).
 */
export const PALETA = ['#ff4459', '#ffbe2e', '#3fd46a', '#3a9dff', '#b25bff', '#2fe0cf', '#ff6fd0', '#ff8a1f'] as const;

/** Onde começam os números de cada tipo de casa (a cor vem somada). */
export const RAIO = 20;
export const ESTRELA = 40;
export const PEDRA = 100;
/** As bolhas especiais do atirador (nunca ficam na grade como estão: viram outra coisa ao parar). */
export const BOMBA = 200;
export const CURINGA = 201;

export type TipoDeBolha = 'cor' | 'raio' | 'estrela' | 'pedra' | 'bomba' | 'curinga';

/** A cor de uma casa ou bolha (null para a pedra, a bomba e o curinga, que não têm cor). */
export function corDe(v: number | null | undefined): number | null {
  if (v == null || v >= PEDRA) return null;
  return v % 20;
}

export function tipoDe(v: number): TipoDeBolha {
  if (v === BOMBA) return 'bomba';
  if (v === CURINGA) return 'curinga';
  if (v >= PEDRA) return 'pedra';
  if (v >= ESTRELA) return 'estrela';
  if (v >= RAIO) return 'raio';
  return 'cor';
}

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

/** Com que chance cada casa nova sai especial (0 = nunca). */
export interface ChancesBolhas {
  raio: number;
  estrela: number;
  pedra: number;
}

const SEM_ESPECIAIS: ChancesBolhas = { raio: 0, estrela: 0, pedra: 0 };

export const deslocada = (g: Grade, r: number) => (r + g.par) % 2 === 1;
export const colunasDa = (g: Grade, r: number) => (deslocada(g, r) ? COLS - 1 : COLS);

export function centro(g: Grade, r: number, c: number): { x: number; y: number } {
  return { x: R + 2 * R * c + (deslocada(g, r) ? R : 0), y: R + r * ALTURA_LINHA };
}

const valida = (g: Grade, r: number, c: number) => r >= 0 && c >= 0 && c < colunasDa(g, r);
/** O que está na casa (a cor com o tipo, ou null se vazia). */
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

/** Uma grade nova com `linhas` linhas cheias, das cores `0…cores-1` (e as especiais do nível). */
export function criar(linhas: number, cores: number, rng: Rng = Math.random, chances: ChancesBolhas = SEM_ESPECIAIS): Grade {
  const g: Grade = { linhas: [], par: 0 };
  for (let r = 0; r < linhas; r++) g.linhas.push(linhaNova(g, r, cores, rng, g.linhas[r - 1], chances));
  return g;
}

/**
 * Uma linha cheia. As cores vêm em manchas (a mesma da vizinha de cima ou do lado, às vezes), como
 * nos jogos do gênero: uma grade de cores sorteadas uma a uma quase não deixa jogada boa.
 *
 * Depois da cor, a casa pode virar especial. A pedra nunca nasce na linha do teto quando ela é a
 * única linha — uma grade só de pedras presas não teria como ser limpa.
 */
function linhaNova(g: Grade, r: number, cores: number, rng: Rng, acima: (number | null)[] | undefined, chances: ChancesBolhas): (number | null)[] {
  const n = colunasDa(g, r);
  const linha: (number | null)[] = [];
  const corDaCasa: number[] = [];
  for (let c = 0; c < n; c++) {
    const x = rng();
    const corAcima = corDe(acima?.[c]);
    let k: number;
    if (c > 0 && x < 0.35) k = corDaCasa[c - 1];
    else if (corAcima != null && x < 0.55) k = corAcima;
    else k = Math.floor(rng() * cores);
    corDaCasa.push(k);
    const e = rng();
    if (e < chances.pedra) linha.push(PEDRA);
    else if (e < chances.pedra + chances.raio) linha.push(RAIO + k);
    else if (e < chances.pedra + chances.raio + chances.estrela) linha.push(ESTRELA + k);
    else linha.push(k);
  }
  // uma linha inteira de pedras não deixaria o tiro estourar nada nela
  if (linha.every((v): boolean => v === PEDRA)) linha[0] = corDaCasa[0];
  return linha;
}

/** A grade ganha uma linha cheia no alto; todas as outras descem uma casa. */
export function empurrar(g: Grade, cores: number, rng: Rng = Math.random, chances: ChancesBolhas = SEM_ESPECIAIS): Grade {
  const n: Grade = { linhas: [[], ...g.linhas.map((l) => l.slice())], par: (1 - g.par) as 0 | 1 };
  n.linhas[0] = linhaNova(n, 0, cores, rng, n.linhas[1], chances);
  return n;
}

/** As bolhas da mesma cor ligadas à casa (inclusive ela). Raio e estrela contam pela cor delas. */
export function grupo(g: Grade, r: number, c: number): Casa[] {
  const alvo = corDe(cor(g, r, c));
  if (alvo == null) return [];
  const vistas = new Set<string>([`${r},${c}`]);
  const fila: Casa[] = [{ r, c }];
  const out: Casa[] = [];
  while (fila.length) {
    const q = fila.pop()!;
    out.push(q);
    for (const v of vizinhas(g, q.r, q.c)) {
      const k = `${v.r},${v.c}`;
      if (!vistas.has(k) && corDe(cor(g, v.r, v.c)) === alvo) {
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

/** As cores que ainda estão na grade (o atirador só recebe cores que servem). A pedra não conta. */
export function coresNaGrade(g: Grade): number[] {
  const s = new Set<number>();
  for (const l of g.linhas)
    for (const x of l) {
      const k = corDe(x);
      if (k != null) s.add(k);
    }
  return [...s].sort((a, b) => a - b);
}

export const vazia = (g: Grade) => g.linhas.every((l) => l.every((x) => x == null));

/**
 * A grade está limpa: não sobrou nenhuma bolha de cor. Pedras presas no teto não seguram o nível —
 * elas não estouram por cor, e exigir que caíssem deixaria nível sem saída.
 */
export const limpa = (g: Grade) => g.linhas.every((l) => l.every((x) => corDe(x) == null));

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

/**
 * A mira pontilhada só no primeiro nível.
 *
 * Ela é o tutorial: mostra a tabela na parede e onde a bolha encaixa. Do segundo nível em diante
 * acertar o ângulo passa a ser parte do jogo — sobra a seta do lançador.
 */
export const temMira = (nivel: number) => nivel <= 1;

// ------------------------------------------------------------------ a jogada

export interface Resultado {
  grade: Grade;
  /** A casa onde a bolha atirada ficou. */
  casa: Casa;
  /** O que estourou (por cor, pela bomba ou pelo raio), com o que havia em cada casa. */
  estouradas: Casa[];
  /** O valor de cada casa estourada, na mesma ordem (para a tela pintar os cacos da cor certa). */
  valores: number[];
  caidas: { casa: Casa; cor: number }[];
  pontos: number;
  /** A bolha atirada era uma bomba, e explodiu. */
  explodiu: boolean;
  /** Linhas levadas por bolhas-raio. */
  raios: number[];
  /** O multiplicador das estrelas (1 sem estrela). */
  multiplicador: number;
}

/** Até quantas casas da bomba a explosão alcança (1 = as vizinhas; 2 = as vizinhas das vizinhas). */
export const ALCANCE_DA_BOMBA = 2;

/** As casas ocupadas a até `alcance` passos da casa (ela inclusive), ignorando a cor. */
function emVolta(g: Grade, casa: Casa, alcance: number): Casa[] {
  const vistas = new Set<string>([`${casa.r},${casa.c}`]);
  let borda: Casa[] = [casa];
  const out: Casa[] = [casa];
  for (let passo = 0; passo < alcance; passo++) {
    const prox: Casa[] = [];
    for (const q of borda)
      for (const v of vizinhas(g, q.r, q.c)) {
        const k = `${v.r},${v.c}`;
        if (vistas.has(k)) continue;
        vistas.add(k);
        prox.push(v);
        if (cor(g, v.r, v.c) != null) out.push(v);
      }
    borda = prox;
  }
  return out;
}

/**
 * O curinga vira a cor que faz o maior grupo onde ele parou (entre as cores das vizinhas). Sem
 * vizinha de cor (só pedra, ou o teto vazio), ele fica com a primeira cor da grade.
 */
export function corDoCuringa(g: Grade, casa: Casa): number {
  const candidatas = new Set<number>();
  for (const v of vizinhas(g, casa.r, casa.c)) {
    const k = corDe(cor(g, v.r, v.c));
    if (k != null) candidatas.add(k);
  }
  let melhor = coresNaGrade(g)[0] ?? 0;
  let maior = -1;
  for (const k of candidatas) {
    const n: Grade = { linhas: g.linhas.map((l) => l.slice()), par: g.par };
    while (n.linhas.length <= casa.r) n.linhas.push(new Array(colunasDa(n, n.linhas.length)).fill(null));
    n.linhas[casa.r][casa.c] = k;
    const tam = grupo(n, casa.r, casa.c).length;
    if (tam > maior) {
      maior = tam;
      melhor = k;
    }
  }
  return melhor;
}

/**
 * A bolha para na casa: se juntou três ou mais da mesma cor, elas estouram, e o que ficou solto
 * do teto cai junto. A bomba explode tudo em volta, sem olhar a cor; o curinga vira a melhor cor
 * antes de conferir. Uma bolha-raio que estoura leva a linha dela inteira (e um raio na linha
 * levada dispara o dele também).
 */
export function pousar(g: Grade, casa: Casa, bolha: number): Resultado {
  const n: Grade = { linhas: g.linhas.map((l) => l.slice()), par: g.par };
  while (n.linhas.length <= casa.r) n.linhas.push(new Array(colunasDa(n, n.linhas.length)).fill(null));
  const explodiu = bolha === BOMBA;
  const valor = bolha === CURINGA ? corDoCuringa(n, casa) : bolha;
  n.linhas[casa.r][casa.c] = valor;

  let alvo: Casa[];
  if (explodiu) alvo = emVolta(n, casa, ALCANCE_DA_BOMBA);
  else {
    alvo = grupo(n, casa.r, casa.c);
    if (alvo.length < 3) {
      return { grade: n, casa, estouradas: [], valores: [], caidas: [], pontos: 0, explodiu: false, raios: [], multiplicador: 1 };
    }
  }

  // o que estourou pela cor (a bomba não estoura nada por cor)
  const porCor = explodiu ? 0 : alvo.length;
  // os raios: cada um no alvo leva a linha dele, e o que a linha leva pode ter outro raio
  const marcadas = new Set(alvo.map((q) => `${q.r},${q.c}`));
  const raios: number[] = [];
  const fila = alvo.filter((q) => tipoDe(n.linhas[q.r][q.c] ?? 0) === 'raio');
  while (fila.length) {
    const q = fila.pop()!;
    if (raios.includes(q.r)) continue;
    raios.push(q.r);
    for (let c = 0; c < colunasDa(n, q.r); c++) {
      const v = n.linhas[q.r][c];
      if (v == null || marcadas.has(`${q.r},${c}`)) continue;
      marcadas.add(`${q.r},${c}`);
      alvo.push({ r: q.r, c });
      if (tipoDe(v) === 'raio') fila.push({ r: q.r, c });
    }
  }

  const valores = alvo.map((q) => n.linhas[q.r][q.c]!);
  const estrelas = valores.filter((v) => tipoDe(v) === 'estrela').length;
  // cada estrela dobra, até ×4: duas estrelas num estouro já é sorte bastante
  const multiplicador = Math.min(4, 2 ** estrelas);
  if (explodiu) n.linhas[casa.r][casa.c] = null;
  for (const q of alvo) n.linhas[q.r][q.c] = null;
  const caidas = soltas(n).map((q) => ({ casa: q, cor: n.linhas[q.r][q.c]! }));
  for (const q of caidas) n.linhas[q.casa.r][q.casa.c] = null;
  // as linhas vazias do fim saem (a grade não cresce à toa)
  while (n.linhas.length && n.linhas[n.linhas.length - 1].every((x) => x == null)) n.linhas.pop();
  // estourar vale 10 cada (15 pela bomba e pelo raio); derrubar vale o dobro, e mais quanto mais cai de uma vez
  const pelosPoderes = alvo.length - porCor;
  const pontos = (porCor * 10 + pelosPoderes * 15 + caidas.length * 20 * Math.max(1, Math.ceil(caidas.length / 4))) * multiplicador;
  return { grade: n, casa, estouradas: alvo, valores, caidas, pontos, explodiu, raios, multiplicador };
}

/** Tiros seguidos sem estourar nada até a grade descer uma linha (o padrão; cada nível tem o seu). */
export const ERROS_ATE_DESCER = 6;

/** Quantas bolhas há na grade (as pedras inclusive). */
export function contar(g: Grade): number {
  let n = 0;
  for (const l of g.linhas) for (const x of l) if (x != null) n++;
  return n;
}

/** Quantas bolhas de cor há na grade — as que o nível pede para limpar. */
export function contarCor(g: Grade): number {
  let n = 0;
  for (const l of g.linhas) for (const x of l) if (corDe(x) != null) n++;
  return n;
}

/** A casa onde um tiro neste ângulo vai parar (para a mira mostrar a bolha-fantasma). */
export function alvoDaMira(g: Grade, angulo: number): Casa | null {
  let v = atirar(angulo);
  for (let i = 0; i < 600; i++) {
    const r = avancar(g, v, 1 / 120);
    v = r.voo;
    if (r.parou) return r.parou;
  }
  return null;
}

export interface NivelBolhas {
  n: number;
  /** Linhas cheias com que a grade começa. */
  linhas: number;
  cores: number;
  /** Tiros sem estourar nada até a grade descer. */
  errosAteDescer: number;
  /** Segundos para limpar a grade. */
  tempo: number;
  /** As casas especiais que nascem na grade. */
  chances: ChancesBolhas;
  /** Chance de a próxima bolha do atirador vir bomba ou curinga (além das que se ganham jogando). */
  sorteio: { bomba: number; curinga: number };
}

/** O tempo de nível mais curto. Limpar nove linhas de oito cores nisso pede derrubar em bloco. */
export const TEMPO_MIN_BOLHAS = 100;

/**
 * O nível `n`: o primeiro é o tutorial (três cores, cinco linhas, paciência de sete tiros); a cada
 * nível entra uma linha e uma cor até o quarto nível — seis cores, e a descida a cada quatro erros.
 * Depois entram a sétima cor (nível 7) e a oitava (nível 11), e as linhas param nas nove.
 *
 * As especiais chegam aos poucos: raio e estrela no 2, a bomba e o curinga sorteados no 3, a pedra
 * no 5 (e cada vez mais pedras, até uma em cada oito casas).
 *
 * O tempo cai a cada nível — de 3 minutos no tutorial até `TEMPO_MIN_BOLHAS`, no nível 13.
 */
export function nivelBolhas(n: number): NivelBolhas {
  const nivel = Math.max(1, Math.floor(n));
  const cores = nivel <= 4 ? 2 + nivel : nivel < 7 ? 6 : nivel < 11 ? 7 : 8;
  return {
    n: nivel,
    linhas: Math.min(9, 4 + nivel),
    cores,
    errosAteDescer: Math.max(4, 8 - nivel),
    tempo: Math.max(TEMPO_MIN_BOLHAS, 180 - 7 * (nivel - 1)),
    chances: {
      raio: nivel >= 2 ? 0.025 : 0,
      estrela: nivel >= 2 ? 0.03 : 0,
      pedra: nivel >= 5 ? Math.min(0.125, 0.04 + 0.01 * (nivel - 5)) : 0,
    },
    sorteio: nivel >= 3 ? { bomba: 0.03, curinga: 0.04 } : { bomba: 0, curinga: 0 },
  };
}

/** A cada tantos estouros seguidos, a próxima bolha vira um curinga. */
export const SEQUENCIA_DO_CURINGA = 4;
/** Um tiro que tira tantas bolhas de uma vez ganha uma bomba. */
export const ESTOURO_DA_BOMBA = 10;

/** Pontos por segundo que sobra quando a grade fica limpa. */
export const PONTOS_POR_SEGUNDO = 25;

/** As estrelas do nível, pelos tiros: limpar com poucos tiros vale mais (a referência é o tamanho da grade). */
export function estrelasBolhas(bolhasNoInicio: number, tiros: number): number {
  const par = Math.max(4, Math.round(bolhasNoInicio / 2.6));
  return tiros <= par ? 3 : tiros <= par * 1.45 ? 2 : 1;
}
