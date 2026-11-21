/**
 * O corpo-base do personagem: esguio, sem sexo definido, em T-pose, sem roupa.
 *
 * É daqui que saem as mãos e os braços que jogam fichas e cartas na mesa; por isso o capricho está
 * neles (dedos, unhas, nós, palma, punho, antebraço). O rosto e os pés são só o volume.
 *
 * As medidas estão em metros. O personagem olha para +z, y é para cima, e os braços vão ao longo
 * de x. Só o lado x > 0 é descrito: o outro é o espelho. Na T-pose a palma olha para baixo, então
 * na mão o polegar fica em +z, o dorso em +y e os dedos apontam para +x.
 *
 * As proporções são as de desenho de anime: oito cabeças de altura, cabeça pequena de queixo
 * fino, pescoço comprido, ombros estreitos, cintura fina, pernas longas, dedos compridos.
 *
 * Um aviso para quem for mexer: fundir uma peça numa base *engorda* a emenda em até um quarto do
 * raio do arredondamento (e cavar afunda o mesmo tanto). Peça que mal sai da base pede raio pequeno.
 */
import { acimaDe, capsula, cavar, elipsoide, fundir, fundirCadaUma, membro, type Campo, type Estacao, type Forma, type Peca, type V3 } from './campo';
import { espelhar, juntar, malhar, type Malha } from './malha';
import { malharUnha, type Unha } from './unha';

/** A altura do personagem. */
export const ALTURA = 1.72;

/** As juntas do braço, na T-pose. */
const OMBRO: V3 = [0.148, 1.4, -0.004];
const PUNHO: V3 = [0.68, 1.4, 0];
const COTOVELO_X = 0.432;

const FRENTE: V3 = [0, 0, 1];
const CIMA: V3 = [0, 1, 0];

/** Estações dadas pela posição ao longo do eixo (x ou y) em vez de por t. */
function porPosicao(de: number, ate: number, linhas: [pos: number, ru: number, rv: number, ou?: number, ov?: number, n?: number][]): Estacao[] {
  return linhas.map(([pos, ru, rv, ou, ov, n]) => ({ t: (pos - de) / (ate - de), ru, rv, ou, ov, n }));
}

// ───────────────────────────── cabeça e pescoço ─────────────────────────────

function cabeca(): Forma {
  const cranio = elipsoide([0, 1.632, -0.012], [0.078, 0.088, 0.093]);
  // o rosto: um ovo deitado para a frente, que desce do crânio afinando até o queixo, como nos desenhos
  const rosto = elipsoide([0, 1.59, 0.02], [0.084, 0.058, 0.064], [0, -1, 0.3], [0, 0.3, 1]);
  const orelha = elipsoide([0.0735, 1.6, -0.014], [0.014, 0.024, 0.005], [0.12, 0, 1], [0.1, 1, -0.25]);
  // do nariz, só um nada de volume: o rosto fica para depois
  const nariz = elipsoide([0, 1.577, 0.0735], [0.0045, 0.011, 0.007]);
  return fundir(cranio, [0.03, rosto], [0.006, orelha], [0.012, nariz]);
}

function pescoco(): Forma {
  return membro([0, 1.4, -0.016], [0, 1.56, -0.006], FRENTE, [
    { t: 0, ru: 0.046, rv: 0.044 },
    { t: 0.3, ru: 0.034, rv: 0.036 },
    { t: 0.6, ru: 0.031, rv: 0.034 },
    { t: 1, ru: 0.033, rv: 0.036 },
  ]);
}

// ─────────────────────────────────── tronco ───────────────────────────────────

function tronco(): Forma {
  // de baixo para cima: virilha, quadril, cintura, costelas, peito, ombros, base do pescoço.
  // A cintura afina pouco e o quadril abre pouco: o corpo não é nem de homem nem de mulher.
  const miolo = membro([0, 0.845, 0], [0, 1.45, 0], FRENTE, porPosicao(0.845, 1.45, [
    [0.845, 0.094, 0.07, 0, -0.008, 2.2],
    [0.89, 0.116, 0.083, 0, -0.01, 2.4],
    [0.935, 0.122, 0.085, 0, -0.01, 2.5],
    [1.0, 0.118, 0.078, 0, -0.006, 2.5],
    [1.085, 0.109, 0.069, 0, 0, 2.35],
    [1.16, 0.113, 0.075, 0, 0.002, 2.4],
    [1.26, 0.125, 0.085, 0, 0.003, 2.55],
    [1.335, 0.13, 0.083, 0, 0, 2.55],
    [1.395, 0.114, 0.068, 0, -0.006, 2.4],
    [1.43, 0.076, 0.054, 0, -0.01, 2.2],
    [1.45, 0.04, 0.04, 0, -0.012, 2],
  ]), { a: 0.022, b: 0.02 });

  const gluteo = elipsoide([0.062, 0.905, -0.05], [0.062, 0.07, 0.054]);
  // o trapézio: do lado do pescoço até a ponta do ombro
  const trapezio = membro([0.022, 1.468, -0.022], [0.14, 1.424, -0.012], CIMA, [
    { t: 0, ru: 0.03, rv: 0.02 },
    { t: 0.5, ru: 0.03, rv: 0.018 },
    { t: 1, ru: 0.026, rv: 0.017 },
  ]);
  const escapula = elipsoide([0.078, 1.325, -0.066], [0.056, 0.018, 0.038], [0.3, 1, 0], [0, 0, 1]);
  // as dobras da axila: o peitoral pela frente e o grande dorsal por trás, indo para o braço
  const dobraDaFrente = membro([0.085, 1.31, 0.044], [0.205, 1.384, 0.008], CIMA, [
    { t: 0, ru: 0.018, rv: 0.02 },
    { t: 1, ru: 0.013, rv: 0.016 },
  ]);
  const dobraDeTras = membro([0.09, 1.255, -0.056], [0.205, 1.378, -0.02], CIMA, [
    { t: 0, ru: 0.022, rv: 0.028 },
    { t: 1, ru: 0.013, rv: 0.016 },
  ]);
  const clavicula = capsula([0.02, 1.418, 0.039], [0.138, 1.431, 0.018], 0.005, 0.0055);

  const cheio = fundir(miolo, [0.025, gluteo], [0.03, trapezio], [0.016, escapula], [0.022, dobraDaFrente], [0.022, dobraDeTras], [0.008, clavicula]);

  // os sulcos, rasos: a coluna nas costas e o umbigo
  const coluna = capsula([0, 1.0, -0.094], [0, 1.4, -0.09], 0.008, 0.007);
  const umbigo = elipsoide([0, 1.078, 0.071], [0.005, 0.007, 0.007]);
  return cavar(cheio, [0.014, coluna], [0.007, umbigo]);
}

// ─────────────────────────────────── perna ───────────────────────────────────

/** O eixo da perna: começa dentro do tronco e vai até o tornozelo. */
const TOPO_DA_PERNA: V3 = [0.084, 1.03, -0.006];
const FIM_DA_PERNA: V3 = [0.072, 0.07, -0.014];

function perna(): Forma {
  const quadril = TOPO_DA_PERNA;
  const tornozelo = FIM_DA_PERNA;
  // largura (ru) para o lado de fora, espessura (rv) para a frente
  const osso = membro(quadril, tornozelo, FRENTE, porPosicao(1.03, 0.07, [
    [1.03, 0.03, 0.044],
    [0.98, 0.046, 0.058],
    [0.93, 0.058, 0.07, 0, -0.001],
    [0.88, 0.062, 0.078, 0, -0.002],
    [0.8, 0.061, 0.074, 0, 0.001],
    [0.68, 0.054, 0.063, 0, 0.004],
    [0.57, 0.0455, 0.051, 0, 0.004],
    [0.495, 0.0415, 0.045, 0, 0.002],
    [0.44, 0.039, 0.042, 0, -0.002],
    [0.36, 0.0415, 0.047, 0.001, -0.009],
    [0.27, 0.0355, 0.04, 0, -0.007],
    [0.17, 0.0265, 0.031, 0, -0.003],
    [0.1, 0.0225, 0.0275, 0, 0],
    [0.07, 0.0235, 0.028, 0, 0],
  ]), { b: 0.03 });
  const rotula = elipsoide([0.079, 0.492, 0.03], [0.017, 0.023, 0.011]);
  const tornozeloDeFora = elipsoide([0.0905, 0.078, -0.016], [0.007, 0.01, 0.009]);
  const tornozeloDeDentro = elipsoide([0.0535, 0.088, -0.012], [0.007, 0.01, 0.009]);
  // o pé: só o volume, do calcanhar à ponta
  const pe = acimaDe(
    membro([0.072, 0.036, -0.05], [0.08, 0.02, 0.15], CIMA, [
      { t: 0, ru: 0.026, rv: 0.03, ov: 0.004 },
      { t: 0.3, ru: 0.03, rv: 0.036, ov: 0.012 },
      { t: 0.65, ru: 0.04, rv: 0.024, ov: 0.006 },
      { t: 1, ru: 0.036, rv: 0.013, ov: 0 },
    ], { a: 0.024, b: 0.02 }),
    0,
    0.006,
  );
  return fundir(osso, [0.015, rotula], [0.008, tornozeloDeFora], [0.008, tornozeloDeDentro], [0.022, pe]);
}

// ─────────────────────────────────── braço ───────────────────────────────────

/**
 * O braço, do ombro ao punho numa peça só: o eixo dele e o corte em cada altura (x, meia-altura,
 * meia-espessura, e o quanto o centro sobe e avança). As mangas da roupa são feitas em cima disto.
 */
export const BRACO: { de: V3; ate: V3; perfil: [pos: number, ru: number, rv: number, ou?: number, ov?: number][] } = {
  de: [0.108, OMBRO[1], OMBRO[2]],
  ate: PUNHO,
  perfil: [
    [0.108, 0.04, 0.04],
    [0.158, 0.043, 0.0445, 0.004, 0],
    [0.215, 0.0395, 0.0415, 0.002, 0.001],
    [0.275, 0.0345, 0.038, 0, 0.003],
    [0.35, 0.0305, 0.0335, 0, 0.001],
    [0.405, 0.0285, 0.0295, 0, -0.001],
    [COTOVELO_X, 0.03, 0.0285, 0, -0.001],
    [0.478, 0.0335, 0.031, 0, 0.001],
    [0.535, 0.03, 0.029, 0, 0.001],
    [0.6, 0.0235, 0.0255, 0, 0],
    [0.65, 0.0178, 0.024, 0, 0],
    [0.68, 0.0158, 0.0232, 0, 0],
  ],
};

function braco(): Forma {
  // do ombro ao punho numa peça só: altura (ru) para cima, espessura (rv) para a frente.
  // Perto do cotovelo o antebraço é mais alto do que largo; no punho é o contrário, largo e chato.
  const osso = membro(BRACO.de, BRACO.ate, FRENTE, porPosicao(BRACO.de[0], BRACO.ate[0], BRACO.perfil), { b: 0.014 });
  const deltoide = elipsoide([0.166, 1.411, -0.004], [0.05, 0.038, 0.045]);
  // a ponta do cotovelo (para trás) e os dois ossos de cada lado dele (em cima e embaixo)
  const pontaDoCotovelo = elipsoide([COTOVELO_X + 0.002, 1.398, -0.0265], [0.015, 0.012, 0.009]);
  const cotoveloDeCima = elipsoide([COTOVELO_X - 0.004, 1.4225, -0.008], [0.01, 0.007, 0.01]);
  const cotoveloDeBaixo = elipsoide([COTOVELO_X - 0.004, 1.3765, -0.008], [0.01, 0.007, 0.01]);
  // o osso do punho, do lado do dedo mínimo, no dorso
  const ossoDoPunho = elipsoide([PUNHO[0] - 0.012, PUNHO[1] + 0.0104, -0.014], [0.009, 0.0045, 0.0075]);
  return fundir(osso, [0.028, deltoide], [0.012, pontaDoCotovelo], [0.008, cotoveloDeCima], [0.008, cotoveloDeBaixo], [0.008, ossoDoPunho]);
}

// ──────────────────────────────────── mão ────────────────────────────────────

/** Um ponto da mão: x ao longo dos dedos (a partir do punho), y para o dorso, z para o polegar. */
const naMao = (x: number, y: number, z: number): V3 => [PUNHO[0] + x, PUNHO[1] + y, PUNHO[2] + z];

/**
 * Os quatro dedos: onde nasce cada um (o nó, na palma), para onde abre (graus, + = para o polegar),
 * o comprimento dos três ossos (o último vai até a ponta do dedo) e a grossura.
 */
const DEDOS: { nome: string; no: [number, number, number]; abre: number; ossos: [number, number, number]; grossura: number }[] = [
  { nome: 'indicador', no: [0.092, 0.002, 0.0245], abre: 4.5, ossos: [0.043, 0.025, 0.0225], grossura: 0.93 },
  { nome: 'médio', no: [0.096, 0.003, 0.0055], abre: 0.5, ossos: [0.047, 0.028, 0.0235], grossura: 0.96 },
  { nome: 'anelar', no: [0.091, 0.002, -0.013], abre: -3.5, ossos: [0.044, 0.0265, 0.0225], grossura: 0.89 },
  { nome: 'mínimo', no: [0.082, -0.001, -0.03], abre: -8.5, ossos: [0.035, 0.02, 0.02], grossura: 0.78 },
];
/** O quanto os dedos caem para a palma (graus): na T-pose eles ficam retos, só um pouco descansados. */
const QUEDA_DO_DEDO = 4;

/** O eixo de um dedo: de onde sai, para onde aponta, e a que distância ficam as juntas e a ponta. */
function eixoDoDedo({ no, abre, ossos, grossura }: (typeof DEDOS)[number]) {
  const a = (abre * Math.PI) / 180;
  const queda = (QUEDA_DO_DEDO * Math.PI) / 180;
  const rumo: V3 = [Math.cos(a) * Math.cos(queda), -Math.sin(queda), Math.sin(a) * Math.cos(queda)];
  /** O arredondamento da ponta. */
  const ponta = 0.0049 * grossura;
  const j1 = ossos[0];
  const j2 = j1 + ossos[1];
  return { raiz: naMao(...no), rumo, j1, j2, ponta, fim: j2 + ossos[2] - ponta };
}

/**
 * Um dedo, numa peça só da raiz à ponta: afina aos poucos, sem degrau nas juntas, e a polpa (ov
 * negativo) enche o lado da palma. Perto do fim ele para de afinar, e a ponta fecha numa cúpula
 * redonda, sem quina.
 */
function dedo(qual: (typeof DEDOS)[number]): Forma {
  const { raiz, rumo, j1, j2, ponta, fim } = eixoDoDedo(qual);
  const g = qual.grossura;
  const em = (dist: number, ru: number, rv: number, ov = 0): Estacao => ({ t: dist / fim, ru: ru * g, rv: rv * g, ov });
  // largura (ru) e espessura (rv, do dorso à polpa)
  return membro(raiz, [raiz[0] + rumo[0] * fim, raiz[1] + rumo[1] * fim, raiz[2] + rumo[2] * fim], CIMA, [
    em(-0.004, 0.0082, 0.0081),
    em(j1 * 0.5, 0.0078, 0.0074, -0.0005),
    em(j1, 0.0074, 0.0069, -0.0002),
    em((j1 + j2) / 2, 0.0069, 0.0063, -0.0004),
    em(j2, 0.0065, 0.0058, -0.0002),
    em(j2 + (fim - j2) * 0.42, 0.0061, 0.0052, -0.0005),
    em(j2 + (fim - j2) * 0.8, 0.0055, 0.0045, -0.0005),
    em(fim - 0.0013, 0.00497, 0.00398, -0.0004),
    em(fim, 0.0049, 0.0039, -0.0004),
  ], { a: 0.006, b: ponta });
}

/** Os três ossos do polegar: sai do pé da palma, para a frente e um pouco para baixo, aberto do indicador. */
const POLEGAR = {
  raiz: [0.016, -0.006, 0.019] as const,
  rumos: [
    [0.8, -0.16, 0.58],
    [0.9, -0.13, 0.42],
    [0.93, -0.1, 0.36],
  ] as const,
  ossos: [0.043, 0.034, 0.029] as const,
  /** Para onde olha o dorso (a unha) do polegar. */
  dorso: [-0.25, 0.75, 0.6] as const,
};

/** O arredondamento da ponta do polegar. */
const PONTA_DO_POLEGAR = 0.0056;

/** O eixo do polegar: a raiz (dentro da palma), o fim do dedo e a que distância da raiz fica cada junta. */
function eixoDoPolegar() {
  const { rumos, ossos } = POLEGAR;
  const anda = (p: V3, d: V3, l: number): V3 => {
    const n = Math.hypot(d[0], d[1], d[2]);
    return [p[0] + (d[0] / n) * l, p[1] + (d[1] / n) * l, p[2] + (d[2] / n) * l];
  };
  const raiz = naMao(...POLEGAR.raiz);
  const fimDoDedo = anda(anda(anda(raiz, rumos[0], ossos[0]), rumos[1], ossos[1]), rumos[2], ossos[2]);
  const todo = Math.hypot(fimDoDedo[0] - raiz[0], fimDoDedo[1] - raiz[1], fimDoDedo[2] - raiz[2]);
  const rumo: V3 = [(fimDoDedo[0] - raiz[0]) / todo, (fimDoDedo[1] - raiz[1]) / todo, (fimDoDedo[2] - raiz[2]) / todo];
  // as juntas ficam na mesma proporção dos ossos
  const soma = ossos[0] + ossos[1] + ossos[2];
  return { raiz, rumo, fimDoDedo, j1: (todo * ossos[0]) / soma, j2: (todo * (ossos[0] + ossos[1])) / soma, fim: todo - PONTA_DO_POLEGAR };
}

/**
 * O polegar, numa peça só da raiz à ponta. O primeiro osso fica dentro da palma (é a almofada do
 * polegar que o cobre); como não há emenda na junta da base, não fica caroço ali.
 */
function polegar(): Forma {
  const { raiz, rumo, j1, j2, fim } = eixoDoPolegar();
  const em = (dist: number, ru: number, rv: number, ov = 0): Estacao => ({ t: dist / fim, ru, rv, ov });
  return membro(raiz, [raiz[0] + rumo[0] * fim, raiz[1] + rumo[1] * fim, raiz[2] + rumo[2] * fim], POLEGAR.dorso, [
    em(0, 0.0088, 0.0086),
    em(j1 * 0.5, 0.0088, 0.0084),
    em(j1, 0.0084, 0.0078),
    em((j1 + j2) / 2, 0.008, 0.0072, -0.0003),
    em(j2, 0.0078, 0.0068, -0.0002),
    em(j2 + (fim - j2) * 0.4, 0.0074, 0.006, -0.0005),
    em(j2 + (fim - j2) * 0.78, 0.0065, 0.005, -0.0004),
    em(fim - 0.0014, 0.00585, 0.00425, -0.0003),
    em(fim, 0.0058, 0.0042, -0.0003),
  ], { a: 0.006, b: PONTA_DO_POLEGAR });
}

/** O comprimento das unhas, em relação ao de uma unha curta (que acaba junto com o dedo). */
const MAIS_LONGA = 1.3;

/** Onde fica e de que tamanho é a unha de cada dedo (os quatro dedos e o polegar). */
function unhas(): Unha[] {
  const normal = (a: V3): V3 => {
    const n = Math.hypot(a[0], a[1], a[2]);
    return [a[0] / n, a[1] / n, a[2] / n];
  };
  const vezes = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  /** O dorso de verdade: a direção pedida, sem a parte que acompanha o dedo. */
  const aprumar = (eixo: V3, cima: V3): V3 => {
    const k = eixo[0] * cima[0] + eixo[1] * cima[1] + eixo[2] * cima[2];
    return normal([cima[0] - eixo[0] * k, cima[1] - eixo[1] * k, cima[2] - eixo[2] * k]);
  };
  const lista = DEDOS.map((d): Unha => {
    const { raiz, rumo, fim, ponta } = eixoDoDedo(d);
    const dorso = aprumar(rumo, CIMA);
    const ate = fim + ponta;
    return { ponta: [raiz[0] + rumo[0] * ate, raiz[1] + rumo[1] * ate, raiz[2] + rumo[2] * ate], eixo: rumo, dorso, lado: vezes(rumo, dorso), comp: 0.0118 * MAIS_LONGA * d.grossura, larg: 0.0078 * d.grossura, passa: 0.0016 * d.grossura, solta: 0.0054 * d.grossura };
  });
  const { rumo: eixo, fimDoDedo } = eixoDoPolegar();
  const dorso = aprumar(eixo, POLEGAR.dorso);
  lista.push({ ponta: fimDoDedo, eixo, dorso, lado: vezes(eixo, dorso), comp: 0.0132 * MAIS_LONGA, larg: 0.0098, passa: 0.0018, solta: PONTA_DO_POLEGAR + 0.0006 });
  return lista;
}

/** A palma: os quatro ossos que vão do punho aos nós, as almofadas e a cova do meio. */
function palma(): Forma {
  /** Onde cada osso da palma começa, no punho. */
  const raizes = [0.0145, 0.0045, -0.0055, -0.015];
  const raios = DEDOS.map((d, i) =>
    membro(naMao(0.01, 0, raizes[i]), naMao(...d.no), CIMA, [
      { t: 0, ru: 0.0096, rv: 0.0108 },
      { t: 0.6, ru: 0.0094 * Math.min(1, d.grossura + 0.09), rv: 0.0102 * Math.min(1, d.grossura + 0.1) },
      { t: 1, ru: 0.0092 * (d.grossura - 0.12), rv: 0.0096 * Math.min(1, d.grossura - 0.03) },
    ], { b: 0.0045 }),
  );
  const carpo = elipsoide(naMao(0.012, 0, 0), [0.024, 0.0152, 0.0255]);
  // o pé do polegar (a almofada grande) e a almofada do lado do mínimo
  const almofadaDoPolegar = elipsoide(naMao(0.036, -0.0098, 0.0215), [0.027, 0.0105, 0.0145], POLEGAR.rumos[0]);
  const almofadaDoMinimo = elipsoide(naMao(0.036, -0.0075, -0.022), [0.028, 0.0088, 0.0095]);
  // a almofada ao pé dos dedos, atravessando a palma
  const almofadaDosDedos = capsula(naMao(0.081, -0.0055, 0.024), naMao(0.074, -0.005, -0.0235), 0.0076, 0.005);
  // a pele entre o polegar e o indicador
  const membrana = membro(naMao(0.05, -0.0105, 0.038), naMao(0.079, -0.002, 0.03), POLEGAR.dorso, [
    { t: 0, ru: 0.0085, rv: 0.004 },
    { t: 1, ru: 0.0075, rv: 0.004 },
  ]);
  const pecas: Peca[] = [
    [0.012, raios[1]],
    [0.012, raios[2]],
    [0.012, raios[3]],
    [0.012, carpo],
    [0.01, almofadaDoPolegar],
    [0.009, almofadaDoMinimo],
    [0.009, almofadaDosDedos],
    [0.006, membrana],
  ];
  // a pele entre um dedo e o vizinho: vai mais longe do lado da palma do que do lado do dorso
  for (let i = 0; i + 1 < DEDOS.length; i++) {
    const a = DEDOS[i].no;
    const b = DEDOS[i + 1].no;
    pecas.push([0.007, elipsoide(naMao((a[0] + b[0]) / 2 + 0.0085, (a[1] + b[1]) / 2 - 0.0035, (a[2] + b[2]) / 2), [0.011, 0.0048, 0.0085], [1, -0.18, 0])]);
  }
  // o nó de cada dedo, no dorso: baixo e bem derretido na mão, para o dorso ficar liso.
  // O mínimo não leva: ali o nó virava um caroço na beirada da mão.
  for (const d of DEDOS.slice(0, 3)) pecas.push([0.008, elipsoide(naMao(d.no[0] - 0.002, d.no[1] + 0.0026, d.no[2]), [0.0098 * d.grossura, 0.006 * d.grossura, 0.0068 * d.grossura])]);
  const cheia = fundir(raios[0], ...pecas);
  const cova = elipsoide(naMao(0.06, -0.0225, -0.002), [0.018, 0.0105, 0.013]);
  return cavar(cheia, [0.014, cova]);
}

/** O braço com a mão na ponta. */
function bracoComMao(): Forma {
  const base = fundir(braco(), [0.012, palma()]);
  return fundirCadaUma(base, 0.004, ...DEDOS.map((d): Peca => [0.005, dedo(d)]), [0.013, polegar()]);
}

// ──────────────────────────────── o corpo todo ────────────────────────────────

/** O campo do corpo inteiro (dos dois lados: o lado x < 0 é o espelho). */
export function campoDoCorpo(): Campo {
  const meio = fundir(tronco(), [0.03, pescoco()], [0.022, cabeca()], [0.035, perna()], [0.03, bracoComMao()]);
  return (x, y, z) => meio.d(x < 0 ? -x : x, y, z);
}

/** Onde a malha fina da mão começa: no antebraço, antes do punho. */
const CORTE_DA_MAO = 0.6;

export interface Qualidade {
  /** O lado do cubinho da malha no corpo e na mão, em metros. */
  corpo: number;
  mao: number;
}
export const QUALIDADE: Qualidade = { corpo: 0.0034, mao: 0.0011 };

/**
 * A malha do personagem. O corpo e as mãos são malhados em separado — as mãos bem mais finas — e
 * as duas malhas se sobrepõem num trecho curto do antebraço (são a mesma superfície, não se nota).
 * As unhas têm a malha delas (src/personagem/unha.ts), posta por cima da ponta de cada dedo.
 */
export function gerarPersonagem(q: Qualidade = QUALIDADE): Malha {
  const campo = campoDoCorpo();
  const sobra = q.corpo * 1.5;
  const corpo = malhar({
    campo,
    min: [0, -0.02, -0.2],
    max: [CORTE_DA_MAO + 0.03, ALTURA + 0.03, 0.22],
    passo: q.corpo,
    simetrica: true,
    aceita: (x) => x < CORTE_DA_MAO + sobra,
  });
  const mao = malhar({
    campo,
    min: [CORTE_DA_MAO - 0.012, PUNHO[1] - 0.06, -0.075],
    max: [PUNHO[0] + 0.215, PUNHO[1] + 0.045, 0.105],
    passo: q.mao,
    aceita: (x) => x > CORTE_DA_MAO,
  });
  return espelhar(juntar([corpo, mao, ...unhas().map((u) => malharUnha(campo, u))]));
}

/** As peças do corpo, uma a uma (lado x > 0): é por elas que se sabe a que osso cada pedaço de pele obedece. */
export function partesDoCorpo() {
  return { tronco: tronco(), pescoco: pescoco(), cabeca: cabeca(), perna: perna(), braco: braco(), palma: palma(), dedos: DEDOS.map(dedo), polegar: polegar() };
}

/** Onde ficam as juntas na T-pose (lado x > 0), para montar o esqueleto. */
export function juntas() {
  const naPerna = (y: number): V3 => {
    const t = (TOPO_DA_PERNA[1] - y) / (TOPO_DA_PERNA[1] - FIM_DA_PERNA[1]);
    return [TOPO_DA_PERNA[0] + (FIM_DA_PERNA[0] - TOPO_DA_PERNA[0]) * t, y, TOPO_DA_PERNA[2] + (FIM_DA_PERNA[2] - TOPO_DA_PERNA[2]) * t];
  };
  const p = eixoDoPolegar();
  return {
    ombro: OMBRO,
    cotovelo: [COTOVELO_X, OMBRO[1], -0.0017] as V3,
    punho: PUNHO,
    quadril: naPerna(0.93),
    joelho: naPerna(0.49),
    tornozelo: naPerna(0.08),
    /** De cada dedo: a raiz (o nó), o rumo, a distância da raiz a cada junta e à ponta, e a grossura. */
    dedos: DEDOS.map((d) => {
      const e = eixoDoDedo(d);
      return { raiz: e.raiz, rumo: e.rumo, j1: e.j1, j2: e.j2, ponta: e.fim + e.ponta, grossura: d.grossura };
    }),
    polegar: { raiz: p.raiz, rumo: p.rumo, j1: p.j1, j2: p.j2, ponta: p.fim + PONTA_DO_POLEGAR, dorso: POLEGAR.dorso as V3 },
    /** Um ponto da mão esquerda (x ao longo dos dedos, y para o dorso, z para o polegar). */
    naMao,
  };
}

/** Os pontos de interesse do corpo, para a câmera do preview. */
export const PONTOS = { ombro: OMBRO, cotovelo: [COTOVELO_X, OMBRO[1], OMBRO[2]] as V3, punho: PUNHO, mao: naMao(0.095, 0, 0.012) };
