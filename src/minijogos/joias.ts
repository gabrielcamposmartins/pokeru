/**
 * Joias: o minijogo de trocar peças vizinhas e alinhar três ou mais da mesma cor.
 *
 * Só a regra mora aqui — o tabuleiro, as trocas, o que some, o que cai e o que nasce. A tela
 * (JogoJoias.tsx) pega os passos que `jogar` devolve e anima um de cada vez.
 *
 * As peças especiais que se **fazem** alinhando:
 *   - quatro em linha deixam uma **joia listrada** no lugar: quando ela some, leva a linha inteira
 *     (listras deitadas levam a linha, em pé levam a coluna);
 *   - um **L ou T** (duas sequências da mesma cor que se cruzam) deixa uma **bomba**: quando some,
 *     leva as oito vizinhas;
 *   - um L ou T de seis joias ou mais (um dos braços com quatro) deixa uma **cruz**: leva a linha
 *     e a coluna de uma vez;
 *   - cinco ou mais em linha deixam uma **estrela**: trocada com qualquer joia, leva todas daquela cor.
 *
 * E as que **caem** do alto, de vez em quando, no lugar de uma joia comum (elas têm cor e se
 * alinham como qualquer outra):
 *   - o **relógio** devolve segundos ao nível quando some;
 *   - o **×2** dobra os pontos do passo em que some.
 */

export const LADO = 8;
export const CORES = 6;

export type Especial = 'linha-h' | 'linha-v' | 'estrela' | 'bomba' | 'cruz' | 'relogio' | 'x2';

/** Com que chance cada joia nova que cai do alto vem relógio ou ×2 (0 = nunca). */
export interface ChancesJoias {
  relogio: number;
  x2: number;
}

const SEM_EXTRAS: ChancesJoias = { relogio: 0, x2: 0 };

/** Segundos que cada relógio devolve ao nível. */
export const SEGUNDOS_DO_RELOGIO = 5;

export interface Gema {
  id: number;
  /** 0…CORES-1; a estrela não tem cor (-1) e nunca entra num alinhamento. */
  cor: number;
  especial?: Especial;
  /** Quantas casas acima do tabuleiro a joia nova nasce (a tela anima a queda a partir daí). */
  nasce?: number;
}

export type Tabuleiro = (Gema | null)[][];

export interface Pos {
  r: number;
  c: number;
}

export type Rng = () => number;

let ultimoId = 0;
const novaGema = (cor: number, especial?: Especial): Gema => ({ id: ++ultimoId, cor, ...(especial ? { especial } : {}) });

const idx = (p: Pos) => p.r * LADO + p.c;
const pos = (i: number): Pos => ({ r: Math.floor(i / LADO), c: i % LADO });
const dentro = (p: Pos) => p.r >= 0 && p.r < LADO && p.c >= 0 && p.c < LADO;
const copiar = (t: Tabuleiro): Tabuleiro => t.map((l) => l.slice());

export function vizinhas(a: Pos, b: Pos): boolean {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

/**
 * Um tabuleiro novo, sem nenhum alinhamento pronto e com pelo menos uma jogada.
 *
 * `cores` é quantas das seis joias entram: com cinco sobram mais alinhamentos e cascatas (é como os
 * primeiros níveis ficam mais fáceis), com seis é o jogo cheio.
 */
export function criar(rng: Rng = Math.random, cores = CORES): Tabuleiro {
  for (;;) {
    const t: Tabuleiro = [];
    for (let r = 0; r < LADO; r++) {
      t.push([]);
      for (let c = 0; c < LADO; c++) {
        let cor: number;
        do cor = Math.floor(rng() * cores);
        while (
          (c >= 2 && t[r][c - 1]!.cor === cor && t[r][c - 2]!.cor === cor) ||
          (r >= 2 && t[r - 1][c]!.cor === cor && t[r - 2][c]!.cor === cor)
        );
        t[r].push(novaGema(cor));
      }
    }
    if (temJogada(t)) return t;
  }
}

interface Sequencia {
  casas: Pos[];
  dir: 'h' | 'v';
}

/** As sequências de três ou mais da mesma cor, deitadas e em pé. */
export function sequencias(t: Tabuleiro): Sequencia[] {
  const out: Sequencia[] = [];
  const cor = (r: number, c: number) => t[r][c]?.cor ?? -1;
  for (let r = 0; r < LADO; r++) {
    let ini = 0;
    for (let c = 1; c <= LADO; c++) {
      if (c < LADO && cor(r, c) === cor(r, ini) && cor(r, ini) >= 0) continue;
      if (c - ini >= 3 && cor(r, ini) >= 0) out.push({ dir: 'h', casas: Array.from({ length: c - ini }, (_, k) => ({ r, c: ini + k })) });
      ini = c;
    }
  }
  for (let c = 0; c < LADO; c++) {
    let ini = 0;
    for (let r = 1; r <= LADO; r++) {
      if (r < LADO && cor(r, c) === cor(ini, c) && cor(ini, c) >= 0) continue;
      if (r - ini >= 3 && cor(ini, c) >= 0) out.push({ dir: 'v', casas: Array.from({ length: r - ini }, (_, k) => ({ r: ini + k, c })) });
      ini = r;
    }
  }
  return out;
}

/** A cor que mais aparece (é o que uma estrela leva quando uma listra a pega de passagem). */
function corMaisComum(t: Tabuleiro): number {
  const n = new Array<number>(CORES).fill(0);
  for (const l of t) for (const g of l) if (g && g.cor >= 0) n[g.cor]++;
  return n.indexOf(Math.max(...n));
}

/**
 * Some com as casas marcadas, detonando as especiais que estiverem no caminho: a listra leva a
 * linha (ou a coluna), a estrela leva a cor mais comum. `protegidas` são as especiais que acabaram
 * de nascer neste passo — elas ficam.
 */
function detonar(t: Tabuleiro, alvo: Set<number>, protegidas: Set<number>): number[] {
  const fila = [...alvo];
  const feitas = new Set<number>();
  while (fila.length) {
    const i = fila.pop()!;
    if (feitas.has(i) || protegidas.has(i)) continue;
    const p = pos(i);
    const g = t[p.r][p.c];
    if (!g) continue;
    feitas.add(i);
    const junta = (q: Pos) => {
      const j = idx(q);
      if (!feitas.has(j)) fila.push(j);
    };
    if (g.especial === 'linha-h') for (let c = 0; c < LADO; c++) junta({ r: p.r, c });
    else if (g.especial === 'linha-v') for (let r = 0; r < LADO; r++) junta({ r, c: p.c });
    else if (g.especial === 'cruz') {
      for (let c = 0; c < LADO; c++) junta({ r: p.r, c });
      for (let r = 0; r < LADO; r++) junta({ r, c: p.c });
    } else if (g.especial === 'bomba') {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dentro({ r: p.r + dr, c: p.c + dc })) junta({ r: p.r + dr, c: p.c + dc });
    } else if (g.especial === 'estrela') {
      const cor = corMaisComum(t);
      for (let r = 0; r < LADO; r++) for (let c = 0; c < LADO; c++) if (t[r][c]?.cor === cor) junta({ r, c });
    }
  }
  return [...feitas];
}

/** Uma joia nova do alto: quase sempre comum; às vezes um relógio ou um ×2, da mesma cor sorteada. */
function joiaQueCai(rng: Rng, cores: number, chances: ChancesJoias): Gema {
  const cor = Math.floor(rng() * cores);
  if (!chances.relogio && !chances.x2) return novaGema(cor);
  const x = rng();
  if (x < chances.relogio) return novaGema(cor, 'relogio');
  if (x < chances.relogio + chances.x2) return novaGema(cor, 'x2');
  return novaGema(cor);
}

/** As joias descem para os buracos e nascem novas no alto de cada coluna. */
export function cair(t: Tabuleiro, rng: Rng = Math.random, cores = CORES, chances: ChancesJoias = SEM_EXTRAS): Tabuleiro {
  const n = copiar(t);
  for (let c = 0; c < LADO; c++) {
    const ficam: Gema[] = [];
    for (let r = LADO - 1; r >= 0; r--) {
      const g = n[r][c];
      if (g) ficam.push({ ...g, nasce: undefined });
    }
    const faltam = LADO - ficam.length;
    for (let r = LADO - 1, k = 0; r >= 0; r--, k++) {
      if (k < ficam.length) n[r][c] = ficam[k];
      else n[r][c] = { ...joiaQueCai(rng, cores, chances), nasce: faltam };
    }
  }
  return n;
}

export interface Passo {
  /** As casas que somem neste passo. */
  limpas: Pos[];
  /** O tabuleiro com os buracos (e as especiais recém-nascidas no lugar). */
  comBuracos: Tabuleiro;
  /** O tabuleiro depois da queda. */
  depois: Tabuleiro;
  pontos: number;
  /** 1 na jogada, 2 na primeira cascata, e assim por diante. */
  combo: number;
  /** Quantas de cada cor sumiram. */
  porCor: number[];
  /** Segundos que os relógios que sumiram devolvem ao nível. */
  segundos: number;
  /** O multiplicador dos ×2 que sumiram (1 sem nenhum; no máximo 4). */
  multiplicador: number;
  /** As especiais que detonaram neste passo (para a tela fazer a festa de cada uma). */
  detonadas: Especial[];
}

export type Jogada = { valida: false } | { valida: true; trocado: Tabuleiro; passos: Passo[]; final: Tabuleiro };

const PONTOS_POR_JOIA = 20;

function contar(t: Tabuleiro, limpas: number[]): number[] {
  const porCor = new Array<number>(CORES).fill(0);
  for (const i of limpas) {
    const p = pos(i);
    const cor = t[p.r][p.c]?.cor ?? -1;
    if (cor >= 0) porCor[cor]++;
  }
  return porCor;
}

/** Monta um passo: some com `alvo`, põe as especiais novas e deixa cair. */
function passo(t: Tabuleiro, alvo: Set<number>, novas: Map<number, Gema>, combo: number, rng: Rng, cores: number, chances: ChancesJoias): Passo {
  const protegidas = new Set(novas.keys());
  const limpas = detonar(t, alvo, protegidas);
  const porCor = contar(t, limpas);
  const detonadas: Especial[] = [];
  for (const i of limpas) {
    const p = pos(i);
    const e = t[p.r][p.c]?.especial;
    if (e) detonadas.push(e);
  }
  const segundos = detonadas.filter((e) => e === 'relogio').length * SEGUNDOS_DO_RELOGIO;
  const multiplicador = Math.min(4, 2 ** detonadas.filter((e) => e === 'x2').length);
  const comBuracos = copiar(t);
  for (const i of limpas) {
    const p = pos(i);
    comBuracos[p.r][p.c] = null;
  }
  for (const [i, g] of novas) {
    const p = pos(i);
    comBuracos[p.r][p.c] = g;
  }
  const pontos = (limpas.length + novas.size) * PONTOS_POR_JOIA * combo * multiplicador;
  return { limpas: limpas.map(pos), comBuracos, depois: cair(comBuracos, rng, cores, chances), pontos, combo, porCor, segundos, multiplicador, detonadas };
}

/**
 * Os alinhamentos do tabuleiro viram um passo (ou null, se não houver nenhum). `preferidas` são as
 * casas da troca: a especial nasce onde o jogador mexeu, quando o alinhamento passa por ali.
 *
 * Primeiro os cruzamentos (uma sequência deitada e uma em pé que dividem uma casa — o L e o T): a
 * especial nasce na casa do cruzamento, e as duas sequências não dão mais nada. Depois, as
 * sequências que sobraram: quatro dão a listrada, cinco a estrela.
 */
function alinhamentos(t: Tabuleiro, preferidas: Pos[], combo: number, rng: Rng, cores: number, chances: ChancesJoias): Passo | null {
  const seqs = sequencias(t);
  if (!seqs.length) return null;
  const alvo = new Set<number>();
  const novas = new Map<number, Gema>();
  for (const s of seqs) for (const p of s.casas) alvo.add(idx(p));
  const usadas = new Set<Sequencia>();
  for (const h of seqs) {
    if (h.dir !== 'h' || usadas.has(h)) continue;
    for (const v of seqs) {
      if (v.dir !== 'v' || usadas.has(v)) continue;
      const x = h.casas.find((p) => v.casas.some((q) => q.r === p.r && q.c === p.c));
      if (!x) continue;
      usadas.add(h);
      usadas.add(v);
      const i = idx(x);
      if (novas.has(i)) break;
      const velha = t[x.r][x.c]!;
      const tam = h.casas.length + v.casas.length - 1;
      novas.set(
        i,
        h.casas.length >= 5 || v.casas.length >= 5
          ? novaGema(-1, 'estrela')
          : { ...novaGema(velha.cor, tam >= 6 ? 'cruz' : 'bomba'), id: velha.id },
      );
      break;
    }
  }
  for (const s of seqs) {
    if (usadas.has(s) || s.casas.length < 4) continue;
    const onde = s.casas.find((p) => preferidas.some((q) => q.r === p.r && q.c === p.c)) ?? s.casas[Math.floor(s.casas.length / 2)];
    const i = idx(onde);
    if (novas.has(i)) continue;
    const velha = t[onde.r][onde.c]!;
    novas.set(i, s.casas.length >= 5 ? novaGema(-1, 'estrela') : { ...novaGema(velha.cor, s.dir === 'h' ? 'linha-h' : 'linha-v'), id: velha.id });
  }
  return passo(t, alvo, novas, combo, rng, cores, chances);
}

/** As cascatas: depois de cada queda, o que se alinhou sozinho some também. */
function cascatas(inicio: Passo | null, rng: Rng, cores: number, chances: ChancesJoias): { passos: Passo[]; final: Tabuleiro } | null {
  if (!inicio) return null;
  const passos = [inicio];
  for (;;) {
    const ultimo = passos[passos.length - 1];
    const prox = alinhamentos(ultimo.depois, [], ultimo.combo + 1, rng, cores, chances);
    if (!prox) return { passos, final: ultimo.depois };
    passos.push(prox);
  }
}

/**
 * Troca duas joias vizinhas. Vale se a troca alinha alguma coisa ou se uma delas é estrela; senão
 * é inválida (e a tela desfaz a troca).
 */
export function jogar(t: Tabuleiro, a: Pos, b: Pos, rng: Rng = Math.random, cores = CORES, chances: ChancesJoias = SEM_EXTRAS): Jogada {
  if (!dentro(a) || !dentro(b) || !vizinhas(a, b)) return { valida: false };
  const ga = t[a.r][a.c];
  const gb = t[b.r][b.c];
  if (!ga || !gb) return { valida: false };
  const trocado = copiar(t);
  trocado[a.r][a.c] = gb;
  trocado[b.r][b.c] = ga;

  // a estrela leva a cor da vizinha (duas estrelas levam tudo)
  const estrela = ga.especial === 'estrela' ? a : gb.especial === 'estrela' ? b : null;
  if (estrela) {
    const outra = estrela === a ? gb : ga;
    const alvo = new Set<number>([idx(a), idx(b)]);
    for (let r = 0; r < LADO; r++)
      for (let c = 0; c < LADO; c++) {
        const g = trocado[r][c];
        if (g && (outra.especial === 'estrela' || g.cor === outra.cor)) alvo.add(r * LADO + c);
      }
    // a estrela já foi usada: sem o poder, ela não detona de novo (a cor mais comum) no caminho
    const gasta = trocado.map((l) => l.map((g) => (g?.especial === 'estrela' && (g === ga || g === gb) ? { ...g, especial: undefined } : g)));
    const r = cascatas(passo(gasta, alvo, new Map(), 1, rng, cores, chances), rng, cores, chances)!;
    return { valida: true, trocado, ...r };
  }

  const r = cascatas(alinhamentos(trocado, [a, b], 1, rng, cores, chances), rng, cores, chances);
  return r ? { valida: true, trocado, ...r } : { valida: false };
}

/** Se ainda existe alguma troca que vale. */
export function temJogada(t: Tabuleiro): boolean {
  for (let r = 0; r < LADO; r++)
    for (let c = 0; c < LADO; c++) {
      if (t[r][c]?.especial === 'estrela') return true;
      for (const q of [
        { r, c: c + 1 },
        { r: r + 1, c },
      ]) {
        if (!dentro(q)) continue;
        const u = copiar(t);
        [u[r][c], u[q.r][q.c]] = [u[q.r][q.c], u[r][c]];
        if (sequencias(u).length) return true;
      }
    }
  return false;
}

/** Uma troca que vale (para a dica), ou null. */
export function dica(t: Tabuleiro): [Pos, Pos] | null {
  for (let r = 0; r < LADO; r++)
    for (let c = 0; c < LADO; c++)
      for (const q of [
        { r, c: c + 1 },
        { r: r + 1, c },
      ]) {
        if (!dentro(q)) continue;
        const u = copiar(t);
        [u[r][c], u[q.r][q.c]] = [u[q.r][q.c], u[r][c]];
        if (t[r][c]?.especial === 'estrela' || t[q.r][q.c]?.especial === 'estrela' || sequencias(u).length) return [{ r, c }, q];
      }
  return null;
}

/** Embaralha as joias que estão no tabuleiro até sobrar jogada e não sobrar alinhamento pronto. */
export function embaralhar(t: Tabuleiro, rng: Rng = Math.random, cores = CORES): Tabuleiro {
  const todas = t.flat().filter((g): g is Gema => !!g);
  for (let tentativa = 0; tentativa < 200; tentativa++) {
    for (let i = todas.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [todas[i], todas[j]] = [todas[j], todas[i]];
    }
    const n: Tabuleiro = Array.from({ length: LADO }, (_, r) => todas.slice(r * LADO, r * LADO + LADO).map((g) => ({ ...g, nasce: undefined })));
    if (!sequencias(n).length && temJogada(n)) return n;
  }
  return criar(rng, cores);
}

// ------------------------------------------------------------------ os níveis

/** Juntar `qtd` joias da cor `cor` (as que somem, em qualquer passo, contam). */
export interface Coleta {
  cor: number;
  qtd: number;
}

export interface NivelJoias {
  n: number;
  /** Pontos que o nível pede (contados só dentro dele). */
  meta: number;
  jogadas: number;
  /** Quantas das seis joias entram no tabuleiro. */
  cores: number;
  coletar: Coleta[];
  /** Segundos para cumprir o nível (o relógio para enquanto as joias caem). */
  tempo: number;
  /** As joias especiais que caem do alto. */
  chances: ChancesJoias;
}

/** O tempo de nível mais curto: dois segundos e pouco para pensar cada jogada. */
export const TEMPO_MIN_JOIAS = 60;

/**
 * O nível `n`.
 *
 * A curva saiu de simulação (centenas de partidas de um jogador que troca ao acaso e de um que
 * pega sempre a troca que mais pontua): com cinco cores, 20 jogadas rendem ~4.700 pontos na
 * mediana; com seis, ~3.000, e ~18 joias de uma mesma cor. Por isso:
 *
 *   - níveis 1 e 2 têm cinco cores e metas que quase todo mundo passa (é o tutorial);
 *   - do 3 em diante entram as seis cores, e a meta cresce mais depressa que as jogadas extras —
 *     por volta do nível 8 só passa quem procura as listradas e as estrelas;
 *   - a coleta começa no 2 (uma cor) e vira duas cores no 5.
 *
 * O tempo cai a cada nível — de dois minutos e meio no primeiro até `TEMPO_MIN_JOIAS`, no 14. Ele
 * só corre enquanto se pensa: a animação das cascatas não come tempo de ninguém. O relógio cai do
 * alto desde o nível 2, e o ×2 desde o 3.
 */
export function nivelJoias(n: number): NivelJoias {
  const nivel = Math.max(1, Math.floor(n));
  const cores = nivel <= 2 ? 5 : CORES;
  const jogadas = Math.min(30, 20 + 2 * Math.floor((nivel - 1) / 2));
  const meta = nivel === 1 ? 2000 : nivel === 2 ? 3000 : nivel <= 10 ? 2400 + 400 * (nivel - 3) : 5200 + 250 * (nivel - 10);
  const corA = (nivel * 2) % cores;
  const corB = (nivel * 2 + 3) % cores;
  const coletar: Coleta[] =
    nivel === 1 ? [] : nivel < 5 ? [{ cor: corA, qtd: Math.min(28, 8 + 2 * nivel) }] : [
      { cor: corA, qtd: Math.min(24, 6 + nivel) },
      { cor: corB, qtd: Math.min(24, 6 + nivel) },
    ];
  const tempo = Math.max(TEMPO_MIN_JOIAS, 150 - 7 * (nivel - 1));
  const chances: ChancesJoias = { relogio: nivel >= 2 ? 0.02 : 0, x2: nivel >= 3 ? 0.015 : 0 };
  return { n: nivel, meta, jogadas, cores, coletar, tempo, chances };
}

/** O nível está cumprido com estes pontos e estas joias juntadas (por cor)? */
export function cumpriu(nivel: NivelJoias, pontos: number, juntadas: number[]): boolean {
  return pontos >= nivel.meta && nivel.coletar.every((c) => (juntadas[c.cor] ?? 0) >= c.qtd);
}

/** Cada jogada que sobra quando o nível termina vira estes pontos. */
export const BONUS_POR_JOGADA = 150;

/** As estrelas do nível: uma na meta, duas com 30% a mais, três com 60% a mais. */
export function estrelasDoNivel(nivel: NivelJoias, pontos: number): number {
  return [1, 1.3, 1.6].filter((k) => pontos >= nivel.meta * k).length;
}
