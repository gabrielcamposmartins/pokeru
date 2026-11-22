/**
 * A roupa da parte de cima do corpo: camisa ou casaco, mangas, punhos e luvas — o que aparece dos
 * braços e das mãos na mesa. Há um traje para cada personagem do jogo, tirado da ilustração dele
 * (assets/characters): o feitio das mangas, o punho, a luva, as cores, as estampas e os enfeites.
 *
 * A roupa tem dois tipos de peça:
 *
 * - As que acompanham o corpo coladas nele são feitas do mesmo jeito que o corpo
 *   (src/personagem/campo.ts): cada peça é uma forma, e a malha sai de onde o campo dela vale zero.
 *   Peça justa (luva, corpete) é a própria pele engordada de um ou dois milímetros; manga é um tubo
 *   em cima do eixo do braço, com a folga que se quiser em cada altura. Cada vértice obedece aos
 *   mesmos ossos que o ponto da pele que fica debaixo dele, e a pele coberta deixa de ser desenhada.
 * - As soltas (a manga em sino, o corpo da jaqueta caída dos ombros, o casaco nos ombros, os babados
 *   de renda) são pano de verdade, simulado (src/personagem/pano.ts): pendem, balançam e pousam na mesa.
 *
 * As estampas (o dragão bordado, o canelado do punho, a renda) não são malha: são desenhadas pelo
 * material do tecido, em cima de onde cada ponto fica na T-pose (ver `ENFEITE`).
 */
import { capsula, cavar, cortar, deCampo, elipsoide, engordar, fundir, membro, unir, type Campo, type Estacao, type Forma, type V3 } from './campo';
import { BRACO, PONTOS, QUALIDADE, campoDoCorpo, juntas, partesDoCorpo, type Qualidade } from './corpo';
import { LADOS, NOMES_DOS_DEDOS, pesar, type Esqueleto, type Lado } from './esqueleto';
import { espelhar, juntar, malhar, type Malha } from './malha';
import type { DefDeColisor, DefDePano } from './pano';

/** As cores da pele: da luz cheia ao fundo da sombra. */
export interface Pele {
  luz: string;
  meio: string;
  sombra: string;
  fundo: string;
}
export const PELE_CLARA: Pele = { luz: '#fff6f2', meio: '#f9e0da', sombra: '#e4b2b0', fundo: '#c18b8f' };
export const PELE_MORENA: Pele = { luz: '#e2a987', meio: '#c98a68', sombra: '#a0644c', fundo: '#774436' };

/**
 * Os enfeites que o material do tecido sabe desenhar, com a segunda cor da peça (`cor2`):
 * o canelado (as nervuras de um punho de malha, com listras), o dragão bordado (uma faixa de
 * escamas que dá a volta na manga; `dragaoE` só do lado esquerdo; `dragaoComFaixa` com uma faixa
 * preta de frisos acima do cotovelo), a renda (vazada), os ramos bordados perto da barra e o
 * brocado (losangos miúdos), a treliça (losangos grandes da segunda cor, entre faixas da cor da
 * peça debruadas de creme: a manga de quimono do Goro) e as glicínias (cachos de florzinhas da
 * segunda cor, que pendem: o quimono da Hina) e o gótico (na barra da manga, uma arcada de arcos
 * ogivais com cruzes e trevos; dali para o ombro, cruzes semeadas: a manga em sino da Agnes).
 */
export const ENFEITE = { liso: 0, canelado: 1, dragao: 2, renda: 3, ramos: 4, brocado: 5, dragaoE: 6, dragaoComFaixa: 7, trelica: 8, glicinias: 9, gotico: 10 } as const;

/** Uma peça de roupa: a forma (descrita só no lado x > 0, como o corpo) e como ela é pintada e presa. */
export interface Peca {
  forma: Forma;
  cor: string;
  /** A cor do enfeite. */
  cor2?: string;
  enfeite?: number;
  /** Manga ou punho: obedece ao antebraço mesmo onde passa por cima da mão. */
  doBraco?: boolean;
  /** A peça só existe de um lado do corpo (um emblema no peito). */
  lado?: Lado;
  /** Renda: deixa ver a pele por baixo (ela continua a ser desenhada). */
  vazada?: boolean;
  /** Peça miúda (um botão): a malha dela é mais fina, por este fator. */
  fino?: number;
  /**
   * A pele continua a ser desenhada por baixo da beirada da peça, até esta distância para dentro
   * dela (metros). Sem isto, a pele acaba junto da beirada — e, numa peça justa e fina como a luva
   * sem dedos, a emenda entre as duas aparece serrilhada na boca de cada dedo. Com isto ela fica
   * escondida debaixo do pano.
   */
  beira?: number;
  /** Um enfeite por cima de outra peça (uma bainha, uma nervura): não esconde a pele que há debaixo dele. */
  semCobrir?: boolean;
  /** É da luva do traje (a luva, as costuras, a faixa e o emblema dela): sai quando o jogador escolhe outro estilo de luva. */
  luva?: boolean;
  /** A peça sobe acima do pescoço (um capuz posto na cabeça): até que altura procurar a malha dela. */
  alto?: number;
}

/** Um estilo de luva escolhido pelo jogador (shared/acessorios.ts), no lugar da luva do traje. */
export interface EstiloDeLuva {
  feitio: 'nenhuma' | 'inteira' | 'sem-dedos' | 'tatica' | 'renda' | 'opera' | 'manopla';
  cor: string;
  /** A cor das costuras, das bainhas, dos reforços dos nós, das placas. */
  cor2: string;
  /** A cor do metal: o botão de pressão da tira, os frisos. */
  cor3?: string;
}

/** A luva de uma mão: um estilo escolhido, ou `'traje'` — a do traje, como ele é (com ou sem luva). */
export type LuvaDoLado = EstiloDeLuva | 'traje';

/** As luvas de um traje: a mesma nas duas mãos (um estilo; sem dizer, a do traje), ou uma para cada mão. */
export type LuvasDoTraje = EstiloDeLuva | { E: LuvaDoLado; D: LuvaDoLado } | undefined;

export interface Traje {
  id: string;
  nome: string;
  /** O que o traje tem, em poucas palavras. */
  resumo: string;
  pele: Pele;
  pecas: () => Peca[];
  /** As partes soltas, de pano simulado. */
  panos?: () => DefDePano[];
}

export interface Roupa {
  /** A malha da roupa, com a cor, a segunda cor e o enfeite de cada vértice. */
  malha: Malha & { cor: Float32Array; cor2: Float32Array; enfeite: Float32Array };
  /** Os pesos da pele da roupa, como os de `pesar`. */
  indices: Uint16Array;
  pesos: Float32Array;
  /** Para cada vértice do corpo: 1 se a roupa o cobre (não se desenha), 0 se não. */
  coberto: Float32Array;
}

// ───────────────────────────── as ferramentas ─────────────────────────────

const FRENTE: V3 = [0, 0, 1];
/** Onde o punho fica, ao longo do braço, e até onde vão as mangas e começam as luvas. */
const PUNHO_X = BRACO.ate[0];
const FIM_DA_MANGA = PUNHO_X - 0.012;
/**
 * Até onde vai uma manga arriada (puxada para cima): o meio do antebraço. Dali à luva o braço
 * aparece. O punho canelado dela ocupa os últimos centímetros, e o pano acaba debaixo dele.
 */
const MEIA_MANGA = (PONTOS.cotovelo[0] + PUNHO_X) / 2;
const PUNHO_DA_MEIA_MANGA = MEIA_MANGA - 0.054;
/** Até onde vai a manga da Glitch, arriada só um pouco: a uns três quartos do antebraço. */
const PUNHO_DA_ZUZU = 0.612;
/** Até onde (em x) vai o tronco de uma peça sem mangas, e o de uma com mangas (que cobre as dobras da axila). */
const SEM_MANGA = 0.168;
const COM_MANGA = 0.224;

const OURO = '#e0ad3e';
const PRETO = '#18171d';

/** O corte do braço na altura x (interpolado do perfil dele): os raios (para cima e para a frente) e o desvio do centro. */
function noBraco(x: number): { ru: number; rv: number; ou: number; ov: number } {
  const p = BRACO.perfil;
  let i = 0;
  while (i < p.length - 2 && x > p[i + 1][0]) i++;
  const k = Math.min(1, Math.max(0, (x - p[i][0]) / (p[i + 1][0] - p[i][0])));
  const mix = (n: 1 | 2 | 3 | 4) => (p[i][n] ?? 0) + ((p[i + 1][n] ?? 0) - (p[i][n] ?? 0)) * k;
  return { ru: mix(1), rv: mix(2), ou: mix(3), ov: mix(4) };
}
/** O ponto do eixo do braço na altura x. */
const noEixo = (x: number): V3 => [x, BRACO.de[1], BRACO.de[2] + ((BRACO.ate[2] - BRACO.de[2]) * (x - BRACO.de[0])) / (BRACO.ate[0] - BRACO.de[0])];

type Folga = (x: number) => number | { raio: number; cai?: number };

/**
 * Uma manga: um tubo em cima do eixo do braço, de `de` a `ate`. `folga(x)` é o quanto ela fica longe
 * da pele em cada altura (ou `{ raio, cai }`: redonda, de raio dado, com o centro `cai` metros abaixo
 * do braço). A ponta de lá é cortada reta. Um trecho curto dela é um anel: uma faixa, um friso.
 */
function manga(de: number, ate: number, folga: Folga, passo = 0.015): Forma {
  const xs = new Set<number>([de, ate]);
  for (const [x] of BRACO.perfil) if (x > de && x < ate) xs.add(x);
  // (`passo`: de quanto em quanto a folga é lida; uma manga com dobras miúdas pede um passo menor)
  for (let x = de + passo; x < ate; x += passo) xs.add(x);
  const estacoes: Estacao[] = [...xs]
    .sort((a, b) => a - b)
    .map((x) => {
      const braco = noBraco(Math.min(x, PUNHO_X));
      const f = folga(x);
      const t = (x - de) / (ate - de);
      if (typeof f === 'number') return { t, ru: braco.ru + f, rv: braco.rv + f, ou: braco.ou, ov: braco.ov };
      const raio = Math.max(f.raio, Math.max(braco.ru, braco.rv) + 0.002);
      return { t, ru: raio, rv: raio, ou: braco.ou - (f.cai ?? 0), ov: braco.ov };
    });
  return membro(noEixo(de), noEixo(ate), FRENTE, estacoes, { a: Math.min(0.004, (ate - de) / 3), b: 0.0006 });
}
/** Uma manga oca perto da boca: tira-se de dentro dela a mesma manga, mais fina de `parede`, a partir de `desde`. */
function oca(m: Forma, desde: number, ate: number, folga: Folga, parede: number, passo?: number): Forma {
  // (`passo`: o mesmo da manga de fora, quando ela tem dobras miúdas — senão a parede sai desigual, e fura)
  const dentro = manga(desde, ate + 0.03, (x) => {
    const f = folga(Math.min(x, ate));
    return typeof f === 'number' ? Math.max(0.001, f - parede) : { raio: f.raio - parede, cai: f.cai };
  }, passo);
  return cavar(m, [0.0015, dentro]);
}
const degrau = (de: number, ate: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - de) / (ate - de)));
  return t * t * (3 - 2 * t);
};
/** Um calombo: 0 fora de [de, ate], 1 no meio. */
const calombo = (de: number, ate: number, x: number) => (x <= de || x >= ate ? 0 : Math.sin((Math.PI * (x - de)) / (ate - de)) ** 2);

/** O quanto um ponto (x, y) passa para fora de um polígono convexo (metros; negativo = dentro dele). */
function foraDoPoligono(pts: readonly (readonly [number, number])[]): (x: number, y: number) => number {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const lados = pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const n = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // (a normal de cada lado, virada para fora: o meio do polígono fica do lado de dentro)
    const s = (cx - a[0]) * (b[1] - a[1]) - (cy - a[1]) * (b[0] - a[0]) > 0 ? -1 : 1;
    return { ax: a[0], ay: a[1], nx: (s * (b[1] - a[1])) / n, ny: (-s * (b[0] - a[0])) / n };
  });
  return (x, y) => {
    let d = -Infinity;
    for (const l of lados) d = Math.max(d, (x - l.ax) * l.nx + (y - l.ay) * l.ny);
    return d;
  };
}

/** As ferramentas que dependem do corpo: a pele engordada (peças justas), os cortes dos dedos, e onde fica a superfície. */
function ferramentas() {
  const pele = campoDoCorpo();
  const P = partesDoCorpo();
  const J = juntas();
  /** A pele engordada de `e`, dentro da esfera dada: uma peça justa. */
  const justa = (e: number, c: V3, r: number) => deCampo((x, y, z) => pele(x, y, z) - e, c, r);
  /** A que z fica a frente da roupa (a pele engordada de `e`) no ponto (x, y) do peito. */
  const frente = (x: number, y: number, e: number) => {
    let z = 0.22;
    for (let i = 0; i < 80; i++) {
      const d = pele(x, y, z) - e;
      if (d < 0.0002) break;
      z -= Math.max(d * 0.7, 0.0002);
    }
    return z;
  };
  /** A que y fica o lado de cima da roupa do braço ou da mão no ponto (x, z). */
  const dorso = (x: number, z: number, e: number) => {
    let y = BRACO.de[1] + 0.12;
    for (let i = 0; i < 80; i++) {
      const d = pele(x, y, z) - e;
      if (d < 0.0002) break;
      y -= Math.max(d * 0.7, 0.0002);
    }
    return y;
  };
  /**
   * O tronco vestido: a pele engordada de `e`, da altura y0 à y1, até o começo do braço. `tira`, se
   * dado, mede o que mais se corta (positivo = fora): um decote, a cava de um colete.
   */
  const tronco = (e: number, y0: number, y1: number, tira?: Campo, ateX = SEM_MANGA) =>
    cortar(justa(e, [0, 1.2, 0], 0.42), (x, y, z) => Math.max(y0 - y, y - y1, x - ateX, tira ? tira(x, y, z) : -1), 0.003);
  /** Uma tira de pano rente ao peito, na frente, no meio: uma gravata, um jabô. `larg(y)` é a meia-largura em cada altura. */
  const noPeito = (e: number, y0: number, y1: number, larg: (y: number) => number) =>
    cortar(justa(e, [0, (y0 + y1) / 2, 0.06], 0.2), (x, y, z) => Math.max(y0 - y, y - y1, x - larg(y), -z), 0.002);
  /** Um friso rente ao peito, seguindo a linha x = larg(y) (a beirada de uma lapela), de meia-largura `meia`. */
  const debrum = (e: number, y0: number, y1: number, larg: (y: number) => number, meia: number) =>
    cortar(justa(e, [0, (y0 + y1) / 2, 0.06], 0.2), (x, y, z) => Math.max(y0 - y, y - y1, Math.abs(x - larg(y)) - meia, -z), 0.001);
  /** Uma faixa rente ao peito, fora do meio: de x0 a x1 e de y0 a y1 (um cordão). */
  const faixa = (e: number, x0: number, x1: number, y0: number, y1: number) =>
    cortar(justa(e, [(x0 + x1) / 2, (y0 + y1) / 2, 0.06], 0.2), (x, y, z) => Math.max(y0 - y, y - y1, x0 - x, x - x1, -z), 0.001);
  /** Um remendo rente ao peito: um disco (ou um quadrado) de meia-largura `meia` em volta do ponto (x, y) da frente. */
  const remendo = (e: number, x0: number, y0: number, meia: number, quadrado = false) => {
    const z0 = frente(x0, y0, e);
    return cortar(justa(e, [x0, y0, z0], meia * 2 + 0.01), (x, y, z) => Math.max(quadrado ? Math.max(Math.abs(x - x0), Math.abs(y - y0)) - meia : Math.hypot(x - x0, y - y0) - meia, z0 - 0.03 - z), 0.0008);
  };
  /** Um remendo nas costas da mão (ou em cima do braço): um disco em volta do ponto (x, z) de cima. */
  const noDorso = (e: number, x0: number, z0: number, meia: number) => {
    const y0 = dorso(x0, z0, e);
    return cortar(justa(e, [x0, y0, z0], meia * 2 + 0.01), (x, y, z) => Math.hypot(x - x0, y - y0, z - z0) - meia, 0.0006);
  };
  /**
   * Um recorte de pano rente ao peito, na frente: um polígono convexo (visto de frente), na grossura
   * `e` — ou `e(x, y)`, que varia de um ponto a outro (a ponta do colarinho, que sai rente à camisa e
   * acaba por cima da lapela). É do que se fazem as lapelas e as pontas de um colarinho.
   */
  const recorte = (e: number | ((x: number, y: number) => number), pts: readonly (readonly [number, number])[], k = 0.0008) => {
    const fora = foraDoPoligono(pts);
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const raio = Math.max(...pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy))) + 0.04;
    const d: Campo = typeof e === 'number' ? (x, y, z) => pele(x, y, z) - e : (x, y, z) => pele(x, y, z) - e(x, y);
    // (só a frente: atrás, na mesma altura, ficam as costas)
    return cortar(deCampo(d, [cx, cy, frente(cx, cy, 0)], raio), (x, y, z) => Math.max(fora(x, y), -0.015 - z), k);
  };
  /** Um botão (um disco abaulado) na frente da roupa. */
  const botao =(x: number, y: number, e: number, r: number) => elipsoide([x, y, frente(x, y, e)], [r, r, r * 0.6]);
  /** Uma gola em pé: a pele do pescoço engordada, de y0 a y1, aberta na frente numa meia-largura `abertura`. */
  const gola = (e: number, y0: number, y1: number, abertura: number) =>
    cortar(justa(e, [0, (y0 + y1) / 2, 0], 0.14), (x, y, z) => Math.max(y0 - y, y - y1, Math.min(z, abertura - x)), 0.0015);
  /** Onde a luva sem dedos acaba em cada dedo (a distância da raiz, ao longo dele): no meio do primeiro osso. E no polegar. */
  const fimNoDedo = (k: number) => J.dedos[k].j1 * 0.52;
  const fimNoPolegar = J.polegar.j1 + (J.polegar.j2 - J.polegar.j1) * 0.3;
  /** O quanto um ponto está além da raiz de um dedo, ao longo dele. */
  const aoLongo = (d: { raiz: V3; rumo: V3 }, x: number, y: number, z: number) => (x - d.raiz[0]) * d.rumo[0] + (y - d.raiz[1]) * d.rumo[1] + (z - d.raiz[2]) * d.rumo[2];
  /** A altura do meio da mão: acima dela fica o dorso (as costas da mão). */
  const yDoMeio = J.punho[1];
  /**
   * A abertura das costas da mão da luva de meio dedo: uma elipse entre o punho e os nós, por onde
   * a pele aparece — o que faz dela uma luva de dirigir, e não uma luva de que se cortaram os dedos.
   */
  const ABERTURA = { x: PUNHO_X + 0.049, z: (J.dedos[1].raiz[2] + J.dedos[2].raiz[2]) / 2 + 0.0015, a: 0.0125, b: 0.0158 };
  /** O quanto um ponto passa da beirada da abertura para fora dela (metros; negativo = dentro), olhando de cima. */
  const daAbertura = (x: number, z: number) => (Math.hypot((x - ABERTURA.x) / ABERTURA.a, (z - ABERTURA.z) / ABERTURA.b) - 1) * ABERTURA.a;
  /**
   * A luva: a pele da mão engordada, de `desde` para a frente. Sem dedos, vai só até o meio do
   * primeiro osso de cada dedo. `aberta`: com a abertura nas costas da mão. `raio`: até onde a peça
   * alcança (a luva comprida, que sobe pelo antebraço, pede mais).
   */
  const luva = (e: number, semDedos: boolean, desde = FIM_DA_MANGA - 0.006, aberta = false, raio = 0.19) => {
    const cortes: Campo[] = [];
    if (aberta) cortes.push((x, y, z) => Math.min(-daAbertura(x, z), y - yDoMeio));
    if (semDedos) {
      J.dedos.forEach((d, k) => {
        cortes.push((x, y, z) => Math.min(aoLongo(d, x, y, z) - fimNoDedo(k), 0.006 - P.dedos[k].d(x, y, z)));
      });
      const p = J.polegar;
      cortes.push((x, y, z) => Math.min(aoLongo(p, x, y, z) - fimNoPolegar, 0.007 - P.polegar.d(x, y, z)));
    }
    return cortar(justa(e, [PUNHO_X + 0.09, 1.4, 0.01], raio), (x, y, z) => {
      let fora = desde - x;
      for (const c of cortes) fora = Math.max(fora, c(x, y, z));
      return fora;
    }, 0.0008);
  };
  /** A orla da abertura das costas da mão: um debrum em volta dela, de meia-largura `meia`. */
  const orla = (e: number, meia = 0.0017) => cortar(justa(e, [ABERTURA.x, yDoMeio, ABERTURA.z], 0.05), (x, y, z) => Math.max(Math.abs(daAbertura(x, z)) - meia, yDoMeio - y), 0.0004);
  /**
   * A tira do pulso: uma faixa por cima das costas da mão, logo depois do punho, que dá a volta até
   * os lados — é ela que ajusta a luva. `de` e `ate` dizem onde ela fica ao longo da mão.
   */
  const tira = (e: number, de = PUNHO_X + 0.005, ate = PUNHO_X + 0.019) =>
    cortar(justa(e, [(de + ate) / 2, yDoMeio, 0], 0.07), (x, y) => Math.max(de - x, x - ate, yDoMeio - 0.007 - y), 0.0007);
  /** Faixas em volta dos dedos (e do polegar): em cada um, os trechos `[de, ate]` ditos (distâncias da raiz, ao longo dele). */
  const emVoltaDosDedos = (e: number, trechos: (d: { j1: number; j2: number; ponta: number }, k: number) => [number, number][]) => {
    const dedos = [...J.dedos.map((d, k) => ({ d, campo: P.dedos[k].d, k })), { d: J.polegar, campo: P.polegar.d, k: 4 }];
    const todos = dedos.map((x) => ({ ...x, trechos: trechos(x.d, x.k) }));
    return cortar(justa(e, [PUNHO_X + 0.09, 1.4, 0.01], 0.19), (x, y, z) => {
      let fora = Infinity;
      for (const { d, campo, trechos: ts } of todos) {
        const s = aoLongo(d, x, y, z);
        // (só a casca do próprio dedo, como nas bainhas)
        const casca = campo(x, y, z) - e - 0.0005;
        for (const [de, ate] of ts) fora = Math.min(fora, Math.max(s - ate, de - s, casca));
      }
      return fora;
    }, 0.0005);
  };
  /**
   * As bainhas da luva sem dedos: um rolinho de pano na boca de cada dedo e do polegar (os últimos
   * milímetros antes do corte, um pouco mais grossos que a luva). `e` é a grossura da bainha.
   */
  const bainhas = (e: number, larga = 0.0036) => {
    const p = J.polegar;
    return cortar(justa(e, [PUNHO_X + 0.09, 1.4, 0.01], 0.19), (x, y, z) => {
      let fora = Infinity;
      J.dedos.forEach((d, k) => {
        const s = aoLongo(d, x, y, z);
        // (só a casca do próprio dedo: a dos vizinhos, que passa perto, viraria uma aba entre os dois)
        fora = Math.min(fora, Math.max(s - fimNoDedo(k), fimNoDedo(k) - larga - s, P.dedos[k].d(x, y, z) - e - 0.0005));
      });
      const s = aoLongo(p, x, y, z);
      return Math.min(fora, Math.max(s - fimNoPolegar, fimNoPolegar - larga - s, P.polegar.d(x, y, z) - e - 0.0005));
    }, 0.0005);
  };
  /** As almofadas dos nós: um calombo redondo em cima do nó de cada um dos quatro dedos (da luva de motoqueiro). */
  const almofadas = (e: number, raio = 0.0058) => unir(...J.dedos.map((d) => noDorso(e, d.raiz[0] - 0.0035, d.raiz[2], raio)));
  /** Riscos em relevo nas costas da mão: cada um, um segmento (visto de cima) de meia-largura `meia`. */
  const riscosNoDorso = (e: number, linhas: { ax: number; az: number; bx: number; bz: number }[], meia: number) =>
    cortar(justa(e, [PUNHO_X + 0.07, yDoMeio, 0.0], 0.13), (x, y, z) => {
      let perto = Infinity;
      for (const l of linhas) {
        const t = Math.min(1, Math.max(0, ((x - l.ax) * (l.bx - l.ax) + (z - l.az) * (l.bz - l.az)) / ((l.bx - l.ax) ** 2 + (l.bz - l.az) ** 2)));
        perto = Math.min(perto, Math.hypot(x - (l.ax + (l.bx - l.ax) * t), z - (l.az + (l.bz - l.az) * t)));
      }
      return Math.max(perto - meia, yDoMeio - y);
    }, 0.0005);
  /**
   * Os reforços dos nós da luva de meio dedo: uma almofada comprida em cima de cada nó, no rumo do
   * dedo — é como se costura um reforço, e lê melhor que quatro bolinhas.
   */
  const reforcos = (e: number, meia = 0.0041) =>
    riscosNoDorso(
      e,
      J.dedos.map((d) => ({ ax: d.raiz[0] - 0.0105 * d.rumo[0], az: d.raiz[2] - 0.0105 * d.rumo[2], bx: d.raiz[0] + 0.0015 * d.rumo[0], bz: d.raiz[2] + 0.0015 * d.rumo[2] })),
      meia,
    );
  /** A placa dos nós da luva tática: uma barra dura moldada, de um nó ao outro, do indicador ao mínimo. */
  const placaDosNos = (e: number, meia = 0.0068) =>
    riscosNoDorso(
      e,
      [0, 1, 2].map((k) => ({ ax: J.dedos[k].raiz[0] - 0.005, az: J.dedos[k].raiz[2], bx: J.dedos[k + 1].raiz[0] - 0.005, bz: J.dedos[k + 1].raiz[2] })),
      meia,
    );
  /** As costas de cada dedo, do nó até `ate` do primeiro osso: as talas de uma luva tática, as placas de uma manopla. */
  const talas = (e: number, de: number, ate: number, meia: number) =>
    riscosNoDorso(
      e,
      J.dedos.map((d) => ({ ax: d.raiz[0] + d.j1 * de * d.rumo[0], az: d.raiz[2] + d.j1 * de * d.rumo[2], bx: d.raiz[0] + d.j1 * ate * d.rumo[0], bz: d.raiz[2] + d.j1 * ate * d.rumo[2] })),
      meia,
    );
  /**
   * As nervuras das costas da luva: três costuras em relevo, do nó de cada dedo (indicador, médio e
   * anelar) para o punho, um pouco convergentes — o enfeite de sempre de uma luva de passeio.
   */
  const nervuras = (e: number, meia = 0.0011) => {
    const zDoMeio = (J.dedos[1].raiz[2] + J.dedos[2].raiz[2]) / 2;
    const linhas = [0, 1, 2].map((k) => {
      const d = J.dedos[k];
      // (começam dois centímetros antes do nó: em cima dele, a costura esticaria quando o dedo dobra)
      return { ax: d.raiz[0] - 0.02, az: d.raiz[2], bx: PUNHO_X + 0.028, bz: zDoMeio + (d.raiz[2] - zDoMeio) * 0.5 };
    });
    return cortar(justa(e, [PUNHO_X + 0.06, yDoMeio, 0.01], 0.12), (x, y, z) => {
      let perto = Infinity;
      for (const l of linhas) {
        const t = Math.min(1, Math.max(0, ((x - l.ax) * (l.bx - l.ax) + (z - l.az) * (l.bz - l.az)) / ((l.bx - l.ax) ** 2 + (l.bz - l.az) ** 2)));
        perto = Math.min(perto, Math.hypot(x - (l.ax + (l.bx - l.ax) * t), z - (l.az + (l.bz - l.az) * t)));
      }
      // (só do lado de cima da mão)
      return Math.max(perto - meia, yDoMeio - y);
    }, 0.0004);
  };
  return { justa, frente, dorso, tronco, noPeito, debrum, faixa, remendo, recorte, noDorso, botao, gola, luva, bainhas, almofadas, nervuras, orla, tira, emVoltaDosDedos, reforcos, placaDosNos, talas };
}

/** A mistura de duas cores (t = 0: a primeira; 1: a segunda), em hexadecimal. */
function misturar(a: string, b: string, t: number): string {
  const ca = cor(a);
  const cb = cor(b);
  const c = ca.map((v, i) => Math.round((v + (cb[i] - v) * t) * 255));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/**
 * O corpo de um quimono: o tronco de gola cruzada (aberto em V na frente, do pescoço até o peito),
 * a gola dele (a faixa larga que acompanha o V e dá a volta por trás do pescoço) e, por dentro do V,
 * a gola branca do juban, que sobe acima da do quimono na nuca. `ombro` vai até onde a manga solta
 * se prende.
 */
function quimono(F: ReturnType<typeof ferramentas>, e: number, ombro: number, fecha = 1.27) {
  /** A meia-largura do V em cada altura: fecha no peito, abre até o pescoço. */
  const v = (y: number) => 0.052 * degrau(fecha, 1.452, y);
  const corpo = fundir(
    F.tronco(e, 1.0, 1.452, (x, y, z) => Math.min(z, v(y) - x), COM_MANGA),
    [0.03, manga(0.11, ombro, () => e + 0.004)],
  );
  const gola = unir(F.debrum(e + 0.0022, fecha - 0.015, 1.452, (y) => v(y) + 0.009, 0.0095), F.gola(e + 0.0012, 1.43, 1.468, 0.032));
  // (fino: um filete branco rente à gola do quimono, e um nada dele acima dela na nuca)
  const juban = unir(F.debrum(e - 0.0035, fecha + 0.005, 1.452, (y) => v(y) + 0.0002, 0.003), F.gola(0.0022, 1.44, 1.474, 0.03));
  return { corpo, gola, juban };
}

/**
 * Um paletó aberto na frente (as duas frentes caem afastadas, e a camisa aparece entre elas): o
 * tronco dele, com a gola que dá a volta por trás do pescoço (e cobre o alto dos ombros junto dele),
 * e, por cima, as lapelas de entalhe — a lapela e a ponta da gola acima do entalhe. `aberto(y)` é a meia-largura da abertura em cada
 * altura; `pe`, a altura em que a lapela nasce; `bico`, a ponta de fora dela (x, y).
 */
function paleto(F: ReturnType<typeof ferramentas>, e: number, aberto: (y: number) => number, pe: number, [bx, by]: readonly [number, number]) {
  const corpo = F.tronco(e, 1.0, 1.452, (x, y, z) => Math.min(z, aberto(y) - x), COM_MANGA);
  const topo = by + 0.048;
  // (a beirada de dentro passa um nada para cima da camisa: esconde o corte do paletó)
  // (e nasce rente ao paletó: no pé ela não tem grossura, que cresce nos primeiros centímetros)
  const lapela = F.recorte((_x, y) => e + 0.0004 + 0.0018 * degrau(pe, pe + 0.06, y), [[aberto(pe) - 0.003, pe], [bx, by], [bx - 0.017, by + 0.028], [aberto(topo) - 0.004, topo]]);
  const ponta = F.recorte(e + 0.0022, [[aberto(topo) - 0.004, topo - 0.005], [bx - 0.015, by + 0.024], [bx + 0.007, by + 0.048], [bx - 0.005, 1.452], [aberto(1.452), 1.452]]);
  const gola = F.gola(e + 0.0018, 1.425, 1.47, aberto(1.45));
  return { corpo: unir(corpo, gola), lapelas: unir(lapela, ponta) };
}

// ─────────────────────────────── o pano solto ───────────────────────────────

/**
 * Do que o pano desvia: o tronco, o pescoço, os ombros, os braços, as mãos e os dedos, dos dois
 * lados. `g` engorda o tronco e os braços (a roupa que há por baixo).
 */
function colisoresDoCorpo(g = 0): DefDeColisor[] {
  const J = juntas();
  const c: DefDeColisor[] = [
    { tipo: 'elipsoide', osso: 'peito', centro: [0, 1.29, -0.002], raios: [0.137 + g, 0.17, 0.09 + g] },
    { tipo: 'elipsoide', osso: 'coluna', centro: [0, 1.08, -0.002], raios: [0.12 + g, 0.15, 0.08 + g] },
    { tipo: 'elipsoide', osso: 'raiz', centro: [0, 0.93, -0.01], raios: [0.13 + g, 0.11, 0.092 + g] },
    { tipo: 'capsula', ossoA: 'pescoco', a: [0, 1.43, -0.012], ossoB: 'cabeca', b: [0, 1.54, -0.006], ra: 0.04, rb: 0.04 },
  ];
  for (const l of LADOS) {
    const s = l === 'E' ? 1 : -1;
    const m = (p: V3): V3 => [p[0] * s, p[1], p[2]];
    c.push(
      { tipo: 'capsula', ossoA: 'peito', a: [s * 0.04, 1.425, -0.01], ossoB: `braco.${l}`, b: [s * 0.148, 1.4, -0.004], ra: 0.04 + g, rb: 0.044 + g },
      // a escápula, que salta nas costas
      { tipo: 'elipsoide', osso: 'peito', centro: [s * 0.078, 1.325, -0.066], raios: [0.034 + g, 0.062 + g, 0.042 + g] },
      // o braço e o antebraço (um pouco mais gordos que o osso: o braço não é redondo)
      { tipo: 'capsula', ossoA: `braco.${l}`, a: [s * 0.148, 1.4, -0.004], ossoB: `antebraco.${l}`, b: [s * 0.432, 1.4, -0.002], ra: 0.045 + g, rb: 0.0325 + g },
      { tipo: 'capsula', ossoA: `antebraco.${l}`, a: [s * 0.432, 1.4, -0.002], ossoB: `mao.${l}`, b: [s * 0.68, 1.4, 0], ra: 0.0355 + g, rb: 0.0245 + g * 0.5 },
      // a mão: a palma (achatada) e os dedos, do nó à ponta
      { tipo: 'elipsoide', osso: `mao.${l}`, centro: [s * (PUNHO_X + 0.05), 1.398, 0.005], raios: [0.056, 0.0145, 0.044] },
    );
    const dedo = (nome: string, d: { raiz: V3; rumo: V3; j1: number; j2: number }, raio: number) => {
      const em = (dist: number): V3 => m([d.raiz[0] + d.rumo[0] * dist, d.raiz[1] + d.rumo[1] * dist, d.raiz[2] + d.rumo[2] * dist]);
      c.push({ tipo: 'capsula', ossoA: `${nome}1.${l}`, a: em(0), ossoB: `${nome}3.${l}`, b: em(d.j2 + (d.j2 - d.j1) * 0.8), ra: raio, rb: raio * 0.85 });
    };
    J.dedos.forEach((d, k) => dedo(NOMES_DOS_DEDOS[k], d, 0.0095));
    dedo('polegar', J.polegar, 0.011);
  }
  return c;
}

interface Tubo {
  nome: string;
  /** De onde a onde, ao longo do braço. */
  de: number;
  ate: number;
  cols: number;
  rows: number;
  /** O quanto o tubo fica longe da pele do braço em cada altura (na T-pose, antes de cair). */
  folga: (x: number) => number;
  /** Quantas fileiras do começo ficam presas ao osso, e a qual (sem o lado). */
  presas: number;
  osso: string;
  /** Preso também na outra ponta (a manga colhida no punho): quantas fileiras, e a que osso. */
  fim?: { presas: number; osso: string };
  /**
   * Quantas vezes o pano é mais comprido do que o trecho de braço que ele veste (1,3 = 30% a mais):
   * a sobra é o que deixa a manga arriada, com o tecido juntando em dobras.
   */
  sobra?: number;
  cor: string;
  avesso: string;
  cor2?: string;
  enfeite?: number;
  /** A cor de uma barra, pela altura x. */
  pinta?: (x: number) => string | null;
  dureza?: number;
  /** A folga entre o pano e o corpo. */
  folgaDoCorpo?: number;
}
/** Um tubo de pano em volta do braço, dos dois lados do corpo: uma manga solta, uma manga arriada, um babado. */
function tubos(o: Tubo): DefDePano[] {
  return LADOS.map((l): DefDePano => {
    const s = l === 'E' ? 1 : -1;
    const xDe = (r: number) => o.de + ((o.ate - o.de) * r) / (o.rows - 1);
    /** O ponto do tubo na coluna c, cortado na altura x do braço e posto na altura `em`. */
    const ponto = (c: number, x: number, em: number, mais = 0): V3 => {
      const t = (2 * Math.PI * c) / o.cols;
      const braco = noBraco(Math.min(x, PUNHO_X));
      const eixo = noEixo(x);
      const f = o.folga(x) + mais;
      return [s * em, eixo[1] + braco.ou + (braco.ru + f) * Math.cos(t), eixo[2] + braco.ov + (braco.rv + f) * Math.sin(t)];
    };
    const ultimas = o.fim ? o.rows - o.fim.presas : Infinity;
    // o pano que sobra começa pregueado em sanfona: fileira sim, fileira não, mais para fora ou mais
    // para dentro, o bastante para cada fileira ficar à distância certa da vizinha
    const prega = o.sobra ? (((o.ate - o.de) / (o.rows - 1)) * Math.sqrt(o.sobra * o.sobra - 1)) / 2 : 0;
    const pregueado = (r: number) => (r % 2 ? 1 : -1) * prega * Math.min(1, (r - o.presas + 1) / 3, (ultimas - r) / 3);
    // (as pregas começam um pouco tortas: uma ruga perfeitamente em pé, em cima do braço, não tomba)
    const torto = (c: number, r: number) => (o.sobra ? 0.004 * Math.sin(c * 1.7 + r * 2.3) * Math.min(1, (r - o.presas + 1) / 3, (ultimas - r) / 3) : 0);
    return {
      nome: `${o.nome}.${l}`,
      cols: o.cols,
      rows: o.rows,
      fechado: true,
      inverte: s > 0,
      repouso: (c, r) => ponto(c, xDe(r), xDe(r) + (r >= o.presas && r < ultimas ? torto(c, r) : 0), r >= o.presas && r < ultimas ? pregueado(r) : 0),
      // o pano de verdade é mais comprido do que o braço: é a sobra que arria
      medida: o.sobra ? (c, r) => ponto(c, xDe(r), o.de + (xDe(r) - o.de) * o.sobra!) : undefined,
      preso: (_c, r) => (r < o.presas ? `${o.osso}.${l}` : r >= ultimas ? `${o.fim!.osso}.${l}` : null),
      guia: (_c, r) => `${xDe(r) < 0.432 ? (o.osso === 'antebraco' ? 'antebraco' : 'braco') : 'antebraco'}.${l}`,
      cor: o.cor,
      avesso: o.avesso,
      cor2: o.cor2,
      enfeite: o.enfeite,
      pinta: o.pinta ? (_c, r) => o.pinta!(xDe(r)) : undefined,
      colisores: colisoresDoCorpo(),
      folga: o.folgaDoCorpo ?? 0.006,
      dureza: o.dureza,
    };
  });
}

/**
 * O corpo de uma jaqueta caída dos ombros: um pano só, que sai da frente de um braço, passa por
 * baixo dele, cruza as costas e volta pela frente do outro. Em cada braço há uma cava (um buraco no
 * pano) cuja beirada fica presa em volta do braço, onde a manga começa — é por ali que os braços
 * seguram a jaqueta; a gola e as costas ficam soltas, e por isso ela cai abaixo dos ombros.
 */
function jaquetaCaida(o: { cor: string; avesso: string; gola: string; barra: string; listra: string; ziper: string; ondeX: number; raio: number }): DefDePano {
  const passo = 0.02;
  // em quadrados do molde: a aba da frente, o trecho de baixo do braço, e a metade das costas
  const ABA = 3;
  const BAIXO = 6;
  const COSTAS = 14;
  const meio = ABA + BAIXO + COSTAS;
  const cols = meio * 2 + 1;
  // (curta: a barra fica na altura do tampo da mesa, e não pendurada no vão entre o corpo e a mesa)
  const rows = 14;
  /** A altura da cava, em fileiras. */
  const CAVA = 5;
  const altura = BRACO.de[1];
  /** O ângulo que cada costura da cava cobre em volta do braço, a partir de cima. */
  const costura = (CAVA * passo) / o.raio;
  const noAnel = (s: number, ang: number): V3 => [s * o.ondeX, altura + o.raio * Math.cos(ang), o.raio * Math.sin(ang)];
  /** De que lado a coluna fica, e a que distância (em colunas) da beirada da frente. */
  const lugar = (c: number) => (c <= meio ? { s: 1, cc: c } : { s: -1, cc: cols - 1 - c });
  const naCava = (cc: number, r: number) => cc > ABA && cc < ABA + BAIXO && r < CAVA;
  const naBeirada = (cc: number, r: number) => ((cc === ABA || cc === ABA + BAIXO) && r <= CAVA) || (r === CAVA && cc >= ABA && cc <= ABA + BAIXO);
  return {
    nome: 'jaqueta',
    cols,
    rows,
    fechado: false,
    plano: (c, r) => [c * passo, r * passo],
    existe: (c, r) => !naCava(lugar(c).cc, r),
    repouso: (c, r) => {
      const { s, cc } = lugar(c);
      const desce = Math.max(0, r - CAVA) * passo;
      if (cc <= ABA) {
        // a aba da frente: da costura da frente da cava para o meio do peito
        const base = noAnel(s, (Math.min(r, CAVA) * passo) / o.raio);
        const fora = (ABA - cc) * passo;
        return [s * (o.ondeX - fora * 0.7), base[1] - desce, base[2] + 0.02 + fora * 0.5];
      }
      if (cc <= ABA + BAIXO) {
        // por baixo do braço, de uma costura à outra
        const base = noAnel(s, costura + ((cc - ABA) / BAIXO) * (2 * Math.PI - 2 * costura));
        return [s * o.ondeX, base[1] - desce, base[2]];
      }
      // as costas: da costura de trás da cava até o meio das costas
      const t = (cc - ABA - BAIXO) / COSTAS;
      const base = noAnel(s, (-Math.min(r, CAVA) * passo) / o.raio);
      const z = base[2] + (-0.15 - base[2]) * degrau(0, 0.22, t);
      return [s * o.ondeX * (1 - t), base[1] - desce - 0.03 * Math.sin((t * Math.PI) / 2), z];
    },
    preso: (c, r) => {
      const { s, cc } = lugar(c);
      return naBeirada(cc, r) ? `braco.${s > 0 ? 'E' : 'D'}` : null;
    },
    guia: (c) => {
      const { s, cc } = lugar(c);
      return cc <= ABA + BAIXO + 3 ? `braco.${s > 0 ? 'E' : 'D'}` : 'peito';
    },
    cor: o.cor,
    avesso: o.avesso,
    cor2: o.listra,
    enfeite: (_c, r) => (r < 2 || r >= rows - 2 ? ENFEITE.canelado : ENFEITE.liso),
    pinta: (c, r) => (r < 2 ? o.gola : r >= rows - 2 ? o.barra : c === 0 || c === cols - 1 ? o.ziper : null),
    colisores: colisoresDoCorpo(0.012),
    folga: 0.005,
    // (pano encorpado, de jaqueta)
    dureza: 1,
  };
}

/**
 * Um casaco posto nos ombros, sem vestir as mangas: a pala dele (a gola e o trecho de cima das
 * costas e dos ombros) fica presa ao tronco, e o resto cai pelas costas e por trás dos braços.
 * Não tem frente: com as mãos na mesa, uma frente cairia em cima dos antebraços e os esconderia.
 */
function casacoNosOmbros(o: { cor: string; avesso: string; debrum: string }): DefDePano {
  const cols = 41;
  const rows = 25;
  const passo = 0.02;
  const lado = (c: number) => 1 - (2 * c) / (cols - 1);
  /** A largura do pano estendido, a `h` metros da gola: abre logo, para cobrir os ombros, e segue abrindo. */
  const largura = (h: number) => 0.3 + 0.4 * degrau(0, 0.08, h) + 0.5 * h;
  /** Com o pano estendido como um leque em volta do pescoço: a distância até ele e o ângulo (0 = atrás). */
  const noLeque = (c: number, r: number) => {
    const raio = 0.068 + r * passo;
    return { raio, ang: lado(c) * Math.min(2.6, largura(r * passo) / 2 / raio) };
  };
  /** A altura do alto do ombro (por cima da roupa) a cada distância do meio do corpo. */
  const cumeeira = (x: number) => 1.498 - 0.2 * Math.max(0, Math.abs(x) - 0.05);
  /** A que distância atrás do pescoço as costas começam a descer, e até que fileira vai a pala. */
  const BEIRA = 0.08;
  const NA_PALA = 4;
  return {
    nome: 'casaco',
    cols,
    rows,
    fechado: false,
    plano: (c, r) => [(-lado(c) * largura(r * passo)) / 2, r * passo],
    // na T-pose o casaco fica estendido como um leque por cima dos ombros, dobrado para baixo nas costas
    repouso: (c, r) => {
      const { raio, ang } = noLeque(c, r);
      const x = raio * Math.sin(ang);
      const atras = raio * Math.cos(ang);
      const topo = r === 0 ? 1.49 - 0.03 * lado(c) ** 2 : cumeeira(x) + 0.004;
      if (atras <= BEIRA) return [x, topo, -0.005 - atras];
      return [x, topo - (atras - BEIRA), -0.09 - 0.04 * Math.min(1, (atras - BEIRA) / 0.03)];
    },
    preso: (c, r) => (r === 0 || (r <= NA_PALA && Math.abs(noLeque(c, r).ang) <= 1.5) ? 'peito' : null),
    guia: () => 'peito',
    cor: o.cor,
    avesso: o.avesso,
    pinta: (c, r) => (c === 0 || c === cols - 1 || r === rows - 1 || r === 0 ? o.debrum : null),
    colisores: colisoresDoCorpo(0.02),
    folga: 0.006,
    dureza: 0.4,
  };
}

// ─────────────────────────────── os trajes ───────────────────────────────

export const TRAJES: Traje[] = [
  {
    id: 'alistair',
    nome: 'Alistair',
    resumo: 'camisa branca de manga bufante, colete cinza de botões dourados, jabô com broche, luvas pretas e o casaco carmesim nos ombros',
    pele: PELE_CLARA,
    pecas: () => {
      const F = ferramentas();
      // a manga enche até o antebraço e é colhida no punho
      const folga = (x: number) => 0.004 + 0.016 * calombo(0.2, 0.66, x) + 0.005 * calombo(0.12, 0.3, x);
      const camisa = fundir(F.tronco(0.0035, 1.0, 1.447, undefined, COM_MANGA), [0.03, manga(0.11, 0.652, folga)]);
      const punho = manga(0.64, FIM_DA_MANGA + 0.004, () => 0.0042);
      const abotoadura = elipsoide([0.656, F.dorso(0.656, 0.012, 0.0042), 0.012], [0.0045, 0.003, 0.0045]);
      // o jabô: duas camadas de pano no peito, a de cima mais curta, com um broche no colarinho
      const jabo = unir(F.noPeito(0.0105, 1.285, 1.425, (y) => 0.012 + 0.03 * calombo(1.24, 1.47, y)), F.noPeito(0.0145, 1.345, 1.428, (y) => 0.01 + 0.024 * calombo(1.31, 1.46, y)));
      const broche = elipsoide([0, 1.42, F.frente(0, 1.42, 0.0145)], [0.011, 0.012, 0.006]);
      const colarinho = F.gola(0.0045, 1.43, 1.476, 0.006);
      // o colete: a camisa engordada, sem mangas (com a cava em volta do braço), decotado em V, de alças
      // por cima do ombro e duas fileiras de botões
      const colete = cortar(engordar(camisa, 0.0042), (x, y, z) => Math.max(1.02 - y, y - 1.44, x - SEM_MANGA, Math.min(x - 0.1, 0.066 - Math.hypot(y - 1.4, z + 0.004)), Math.min(z, y - 1.25 - 2.9 * x)), 0.003);
      const botoes = unir(...[1.215, 1.16, 1.105].map((y) => F.botao(0.027, y, 0.0075, 0.0062)));
      return [
        { forma: unir(camisa, jabo, colarinho), cor: '#f4f1ec' },
        { forma: punho, cor: '#f4f1ec', doBraco: true },
        { forma: unir(broche, botoes), cor: OURO, fino: 0.5 },
        { forma: abotoadura, cor: OURO, doBraco: true, fino: 0.5 },
        { forma: colete, cor: '#6d707b', cor2: '#7d808b', enfeite: ENFEITE.brocado },
        { forma: F.luva(0.0012, false), cor: '#1c1a21', luva: true },
        { forma: F.nervuras(0.0021), cor: '#3a3843', semCobrir: true, fino: 0.6, luva: true },
      ];
    },
    panos: () => [casacoNosOmbros({ cor: '#8e1f2c', avesso: '#27408b', debrum: OURO })],
  },
  {
    id: 'marina',
    nome: 'Marina',
    resumo: 'jaqueta vermelha caída abaixo dos ombros (forro dourado, punho canelado), de mangas largas e arriadas com chamas bordadas, top preto, fones no pescoço e luvas sem dedos',
    pele: PELE_MORENA,
    pecas: () => {
      const F = ferramentas();
      // (as mangas da jaqueta são pano solto: ver `panos`; aqui fica só o punho canelado que as colhe)
      const canelado = manga(PUNHO_DA_MEIA_MANGA, MEIA_MANGA, () => 0.0065);
      const top = F.tronco(0.003, 1.225, 1.368);
      // os fones pendurados no pescoço: as duas conchas na frente e o arco por trás
      const conchas = elipsoide([0.07, 1.43, 0.053], [0.03, 0.034, 0.019]);
      const arco = unir(capsula([0.083, 1.452, 0.03], [0.07, 1.476, -0.04], 0.008), capsula([0.07, 1.476, -0.04], [0, 1.482, -0.072], 0.008));
      const discos = elipsoide([0.073, 1.43, 0.066], [0.019, 0.022, 0.011]);
      return [
        { forma: canelado, cor: PRETO, cor2: '#c9262f', enfeite: ENFEITE.canelado, doBraco: true },
        { forma: top, cor: '#1b1a20' },
        { forma: F.remendo(0.0042, 0, 1.3, 0.011), cor: OURO, fino: 0.5 },
        { forma: unir(conchas, arco), cor: '#1f1d24', fino: 0.6 },
        { forma: discos, cor: '#c9262f', fino: 0.6 },
        // (a luva de meio dedo, com a faixa vermelha no punho e o botão dourado na tira)
        ...meioDedo(F, { cor: '#17161b', cor2: '#34323d', cor3: OURO }),
        { forma: manga(PUNHO_X - 0.008, PUNHO_X - 0.003, () => 0.0048), cor: '#c9262f', fino: 0.5, luva: true },
      ];
    },
    panos: () => [
      jaquetaCaida({ cor: '#c9262f', avesso: '#c08a34', gola: '#a31d27', barra: PRETO, listra: '#c9262f', ziper: OURO, ondeX: 0.215, raio: 0.052 }),
      // as mangas: largas, presas onde a jaqueta caída segura no braço e arriadas até o meio do
      // antebraço, onde o punho as colhe (dali à luva o braço aparece). Têm um terço de pano a mais
      // do que o trecho de braço que vestem: a sobra junta em dobras em cima do punho
      ...tubos({
        nome: 'manga',
        de: 0.213,
        ate: PUNHO_DA_MEIA_MANGA + 0.014,
        cols: 36,
        rows: 28,
        folga: (x) => {
          // (afina devagar até o punho: afinando de repente, o pano da ponta vira uma aba que fica em pé)
          const fim = degrau(0.39, PUNHO_DA_MEIA_MANGA + 0.014, x);
          return (0.012 + 0.04 * degrau(0.25, 0.4, x)) * (1 - fim) + 0.004 * fim;
        },
        presas: 2,
        osso: 'braco',
        fim: { presas: 2, osso: 'antebraco' },
        sobra: 1.32,
        cor: '#c9262f',
        avesso: '#c08a34',
        cor2: OURO,
        enfeite: ENFEITE.dragao,
        folgaDoCorpo: 0.005,
        dureza: 1,
      }),
    ],
  },
  {
    id: 'ren',
    nome: 'Ren',
    resumo: 'casaco preto com dragão verde bordado no braço, punho virado com frisos e botão dourados, colete de brocado verde, gravata e luvas pretas',
    pele: PELE_CLARA,
    pecas: () => {
      const F = ferramentas();
      const E = 0.007;
      // manga reta de casaco, um pouco aberta na boca (oca, para o punho da luva aparecer dentro dela)
      const folga = (x: number) => 0.0075 + 0.005 * degrau(0.5, 0.67, x);
      const boca = FIM_DA_MANGA + 0.006;
      const casaco = fundir(F.tronco(E, 1.0, 1.452, undefined, COM_MANGA), [0.03, oca(manga(0.11, boca, folga), 0.62, boca, folga, 0.0045)]);
      // o punho virado: uma faixa mais grossa, com um friso dourado de cada lado e um botão em cima
      const virado = (x: number) => folga(x) + 0.0022;
      const punho = oca(manga(0.598, boca - 0.014, virado), 0.62, boca - 0.014, folga, 0.0045);
      const frisos = unir(manga(0.596, 0.6005, (x) => virado(x) + 0.0011), oca(manga(boca - 0.0185, boca - 0.014, (x) => virado(x) + 0.0011), boca - 0.03, boca - 0.014, folga, 0.0045));
      const debrum = oca(manga(boca - 0.014, boca + 0.001, virado), boca - 0.03, boca + 0.001, folga, 0.0045);
      const botao = elipsoide([0.633, F.dorso(0.633, 0, 0) + virado(0.633), 0], [0.0075, 0.0035, 0.0075]);
      // no peito: as lapelas abrem em V sobre o colete de brocado; a gravata por cima; a gola em pé
      const v = (y: number) => 0.008 + 0.05 * degrau(1.18, 1.425, y);
      const colete = F.noPeito(E + 0.0012, 1.0, 1.43, v);
      const lapelas = F.debrum(E + 0.0022, 1.02, 1.43, v, 0.0024);
      const gravata = F.noPeito(E + 0.0038, 1.2, 1.436, (y) => 0.008 + 0.009 * degrau(1.43, 1.26, y) - 0.012 * degrau(1.235, 1.2, y));
      const gola = F.gola(E + 0.003, 1.432, 1.488, 0.022);
      return [
        { forma: casaco, cor: '#17171c', cor2: '#2f8a5e', enfeite: ENFEITE.dragaoE },
        { forma: punho, cor: '#202027', doBraco: true },
        { forma: unir(frisos, botao), cor: OURO, doBraco: true, fino: 0.6 },
        { forma: debrum, cor: '#1f6b4a', doBraco: true },
        { forma: colete, cor: '#14342a', cor2: '#2c7354', enfeite: ENFEITE.brocado },
        { forma: lapelas, cor: OURO, fino: 0.6 },
        { forma: gravata, cor: '#237652', cor2: '#2f9166', enfeite: ENFEITE.brocado },
        { forma: gola, cor: '#17171c' },
        { forma: F.luva(0.0012, false, 0.636), cor: '#131217', luva: true },
        { forma: F.nervuras(0.0021), cor: '#2f2d38', semCobrir: true, fino: 0.6, luva: true },
      ];
    },
  },
  {
    id: 'tobi',
    nome: 'Tobi',
    resumo: 'moletom branco com dragão dourado, capuz, zíper e cordões, mangas largas e arriadas com faixa preta de frisos dourados, punho canelado e luvas sem dedos com emblema',
    pele: PELE_CLARA,
    pecas: () => {
      const F = ferramentas();
      const E = 0.009;
      // do moletom, o que acompanha o corpo é o tronco, até a costura do ombro caído; dali ao punho a
      // manga é pano solto (ver `panos`)
      // o capuz caído nas costas, com a gola dele subindo pelos lados do pescoço
      const capuz = fundir(elipsoide([0, 1.462, -0.078], [0.092, 0.05, 0.05]), [0.02, elipsoide([0.068, 1.455, -0.022], [0.042, 0.027, 0.05])]);
      const moletom = fundir(F.tronco(E, 1.0, 1.452, undefined, COM_MANGA), [0.02, capuz]);
      const barra = F.tronco(E + 0.0016, 1.0, 1.04);
      const ziper = F.noPeito(E + 0.0022, 1.0, 1.44, () => 0.0052);
      const cordoes = F.faixa(E + 0.003, 0.0255, 0.0315, 1.3, 1.44);
      const ponteiras = F.faixa(E + 0.0042, 0.024, 0.033, 1.282, 1.303);
      // (a faixa preta de frisos dourados fica na manga de pano)
      const frisos = manga(PUNHO_DA_MEIA_MANGA - 0.004, PUNHO_DA_MEIA_MANGA + 0.0015, () => 0.0086);
      const canelado = manga(PUNHO_DA_MEIA_MANGA, MEIA_MANGA, () => 0.007);
      return [
        { forma: moletom, cor: '#f1eee6', cor2: '#dba93a', enfeite: ENFEITE.dragao },
        { forma: unir(ziper, cordoes, barra), cor: PRETO, cor2: '#2a2932', enfeite: ENFEITE.canelado },
        { forma: ponteiras, cor: OURO, fino: 0.6 },
        { forma: F.remendo(E + 0.0018, 0.06, 1.315, 0.017, true), cor: OURO, lado: 'D' },
        { forma: F.remendo(E + 0.003, 0.06, 1.315, 0.009, true), cor: PRETO, lado: 'D', fino: 0.6 },
        { forma: frisos, cor: OURO, doBraco: true, fino: 0.6 },
        { forma: canelado, cor: PRETO, cor2: '#2a2932', enfeite: ENFEITE.canelado, doBraco: true },
        // (a luva de meio dedo, com a faixa dourada no punho e o botão dourado na tira)
        ...meioDedo(F, { cor: '#17171c', cor2: '#34333e', cor3: OURO }),
        { forma: manga(PUNHO_X - 0.008, PUNHO_X - 0.003, () => 0.0048), cor: OURO, fino: 0.5, luva: true },
      ];
    },
    // as mangas: largas desde o ombro caído e arriadas até o meio do antebraço, onde o punho as colhe
    // (dali à luva o braço aparece). Têm um quarto de pano a mais do que o trecho de braço que vestem:
    // a sobra junta em dobras em cima do punho
    panos: () =>
      tubos({
        nome: 'manga',
        de: 0.192,
        ate: PUNHO_DA_MEIA_MANGA + 0.014,
        cols: 36,
        rows: 28,
        folga: (x) => {
          const fim = degrau(0.43, PUNHO_DA_MEIA_MANGA + 0.014, x);
          return (0.012 + 0.009 * degrau(0.195, 0.24, x) + 0.022 * degrau(0.28, 0.42, x)) * (1 - fim) + 0.0045 * fim;
        },
        presas: 2,
        osso: 'braco',
        fim: { presas: 2, osso: 'antebraco' },
        sobra: 1.25,
        cor: '#f1eee6',
        avesso: '#d9d5cb',
        cor2: '#dba93a',
        // (com a faixa preta de frisos dourados, acima do cotovelo)
        enfeite: ENFEITE.dragaoComFaixa,
        folgaDoCorpo: 0.005,
        dureza: 1,
      }),
  },
  {
    id: 'violetta',
    nome: 'Violetta',
    resumo: 'vestido azul de ombro bufante e manga justa, colo e gola de renda preta com gema, botões dourados, e babados de renda no braço e no punho',
    pele: PELE_CLARA,
    pecas: () => {
      const F = ferramentas();
      // o bufante vai do ombro ao meio do braço; dali ao punho a manga é justa
      const folga = (x: number) => 0.0035 + 0.034 * calombo(0.12, 0.32, x) + 0.004 * calombo(0.37, 0.5, x);
      // o corpete, com decote quadrado na frente
      const corpete = F.tronco(0.0035, 1.0, 1.412, (x, y, z) => Math.min(z + 0.01, y - 1.342, 0.072 - x), COM_MANGA);
      const vestido = fundir(corpete, [0.03, manga(0.112, 0.652, folga)]);
      // a renda do colo sobe até a gola alta, e deixa ver a pele
      const colo = F.tronco(0.0022, 1.335, 1.492, undefined, 0.158);
      const gema = elipsoide([0, 1.43, F.frente(0, 1.43, 0.0022) + 0.002], [0.009, 0.011, 0.006]);
      const botoes = unir(...[1.3, 1.25, 1.2, 1.15, 1.1].map((y) => F.botao(0, y, 0.0035, 0.0048)));
      // o galão dourado: duas linhas descendo o corpete e o contorno do decote
      const galao = unir(F.debrum(0.0048, 1.02, 1.34, () => 0.018, 0.0017), F.faixa(0.0048, 0, 0.0745, 1.3365, 1.3435), F.debrum(0.0048, 1.34, 1.411, () => 0.0725, 0.0017));
      const faixas = unir(manga(0.314, 0.332, () => 0.0075), manga(0.636, 0.656, () => 0.0048));
      return [
        { forma: vestido, cor: '#22409f' },
        { forma: colo, cor: '#17151c', enfeite: ENFEITE.renda, vazada: true },
        { forma: gema, cor: '#8a48c7', fino: 0.5 },
        { forma: unir(botoes, galao), cor: OURO, fino: 0.5 },
        { forma: faixas, cor: '#172c78', doBraco: true },
      ];
    },
    panos: () => [
      ...tubos({ nome: 'babado', de: 0.324, ate: 0.384, cols: 30, rows: 7, folga: (x) => 0.006 + 0.036 * degrau(0.324, 0.384, x), presas: 2, osso: 'braco', cor: '#17151c', avesso: '#17151c', enfeite: ENFEITE.renda, dureza: 0.5 }),
      ...tubos({ nome: 'renda', de: 0.646, ate: 0.7, cols: 30, rows: 7, folga: (x) => 0.004 + 0.034 * degrau(0.646, 0.7, x), presas: 2, osso: 'antebraco', cor: '#17151c', avesso: '#17151c', enfeite: ENFEITE.renda, dureza: 0.5 }),
    ],
  },
  {
    id: 'yukina',
    nome: 'Yukina',
    resumo: 'ombros nus, frente única branca com gola azul-marinho e jade, faixa bordada na cintura, e mangas soltas em sino (pano de verdade) com ramos dourados e barra azul-marinho',
    pele: PELE_CLARA,
    pecas: () => {
      const F = ferramentas();
      const marinho = '#22305a';
      const jade = '#3fae8f';
      // o top sem alças, preso ao pescoço por uma frente única que afina até a gola
      const afina = (y: number) => 0.078 - 0.062 * degrau(1.33, 1.44, y);
      const top = unir(F.tronco(0.0035, 1.05, 1.338), F.noPeito(0.0035, 1.32, 1.452, afina));
      const gola = F.gola(0.0042, 1.44, 1.49, 0);
      const vies = F.debrum(0.0046, 1.33, 1.445, afina, 0.0026);
      const conta = elipsoide([0, 1.39, F.frente(0, 1.39, 0.0035) + 0.002], [0.0105, 0.0105, 0.006]);
      const borla = F.noPeito(0.0052, 1.315, 1.38, () => 0.0042);
      // a faixa da cintura, com um cordão dourado e o ornamento na frente
      const cintura = F.tronco(0.0075, 1.062, 1.135);
      const cordao = F.tronco(0.0094, 1.09, 1.107);
      const ornamento = F.remendo(0.0104, 0, 1.0985, 0.02);
      const pedra = elipsoide([0, 1.0985, F.frente(0, 1.0985, 0.0104) + 0.001], [0.008, 0.008, 0.005]);
      // nos braços: a barra de cima (onde a manga solta se prende) e uma pulseira de jade
      const barraDeCima = manga(0.262, 0.296, () => 0.0105);
      const frisos = unir(manga(0.26, 0.2645, () => 0.0116), manga(0.2935, 0.298, () => 0.0116));
      const pulseira = manga(0.651, 0.6595, () => 0.0036);
      return [
        { forma: top, cor: '#f3f1ee' },
        { forma: unir(gola, vies, borla), cor: marinho },
        { forma: unir(conta, pedra), cor: jade, fino: 0.5 },
        { forma: cintura, cor: marinho, cor2: '#3a4d86', enfeite: ENFEITE.brocado },
        { forma: unir(cordao, ornamento), cor: OURO, fino: 0.6 },
        { forma: barraDeCima, cor: marinho, doBraco: true },
        { forma: frisos, cor: OURO, doBraco: true, fino: 0.6 },
        { forma: pulseira, cor: jade, doBraco: true },
      ];
    },
    // a manga é solta: prende-se no braço pela barra de cima e abre num sino largo, que pende e pousa na mesa
    panos: () =>
      tubos({
        nome: 'manga',
        de: 0.278,
        ate: 0.664,
        cols: 34,
        rows: 30,
        folga: (x) => 0.008 + 0.05 * degrau(0.3, 0.664, x),
        presas: 2,
        osso: 'braco',
        cor: '#f3f1ee',
        avesso: '#dfe2ec',
        cor2: '#d2a544',
        enfeite: ENFEITE.ramos,
        pinta: (x) => (x > 0.636 ? '#22305a' : null),
      }),
  },
  {
    id: 'abel',
    nome: 'Abel',
    resumo: 'batina preta abotoada de cima a baixo, colarinho clerical branco, estola carmesim no pescoço, faixa preta na cintura e punhos brancos (o terço é um acessório à parte: shared/acessorios.ts)',
    pele: PELE_CLARA,
    pecas: () => {
      const F = ferramentas();
      const E = 0.006;
      // a manga da batina, justa e reta até o punho (oca na boca: o punho branco aparece dentro dela)
      const folga = (x: number) => 0.0062 + 0.0018 * degrau(0.5, 0.66, x);
      const boca = FIM_DA_MANGA - 0.006;
      const batina = fundir(F.tronco(E, 1.0, 1.45, undefined, COM_MANGA), [0.03, oca(manga(0.11, boca, folga), 0.6, boca, folga, 0.004)]);
      const punho = manga(boca - 0.03, FIM_DA_MANGA + 0.006, () => 0.0042);
      // o colarinho clerical: a gola em pé, preta, com o quadradinho branco na frente
      const gola = F.gola(E + 0.0025, 1.43, 1.478, 0);
      const aba = F.remendo(E + 0.0042, 0, 1.456, 0.0085, true);
      // a fileira de botões miúdos, de cima a baixo (menos onde passa a faixa)
      const botoes = unir(...[1.416, 1.384, 1.352, 1.32, 1.288, 1.256, 1.224, 1.192, 1.16, 1.03].map((y) => F.botao(0, y, E, 0.0042)));
      // a estola: as duas tiras que descem pela frente, mais o trecho que dá a volta na nuca
      const estola = unir(
        F.debrum(E + 0.006, 1.0, 1.446, (y) => 0.083 - 0.022 * degrau(1.37, 1.446, y), 0.02),
        F.tronco(E + 0.006, 1.415, 1.452, (x, _y, z) => Math.max(z - 0.004, x - 0.105)),
      );
      const faixa = F.tronco(E + 0.003, 1.06, 1.125);
      return [
        { forma: batina, cor: '#1c1416' },
        { forma: punho, cor: '#efe9df', doBraco: true },
        { forma: gola, cor: '#1c1416' },
        { forma: aba, cor: '#efe9df', fino: 0.6 },
        { forma: botoes, cor: '#0b0809', fino: 0.5 },
        { forma: estola, cor: '#8a1c2b' },
        { forma: faixa, cor: '#141012' },
      ];
    },
  },
  {
    id: 'agnes',
    nome: 'Agnes',
    resumo: 'hábito preto de gola alta e ombros de renda vazada (a pele aparece pelos furos), corpete amarrado na frente, a cruz de vitral verde-azulado e dourado no peito, cinto de fivela dourada, e mangas em sino (pano de verdade) com uma arcada gótica dourada na barra e cruzes semeadas, sobre um punho de renda',
    pele: PELE_CLARA,
    pecas: () => {
      const F = ferramentas();
      const E = 0.005;
      const HABITO = '#141416';
      const DOURADO = '#d99a3a';
      // por baixo da manga em sino, a manga justa do hábito, até onde começa a renda do pulso
      const folga = (x: number) => 0.004 + 0.002 * degrau(0.5, 0.66, x);
      /** Onde a renda dos ombros começa em cada altura (o meio do peito fica liso, com a cruz), e até onde vai. */
      const daRenda = (y: number) => 0.072 + 0.04 * degrau(1.36, 1.3, y);
      const FIM_DA_RENDA = COM_MANGA + 0.01;
      // o hábito não passa por baixo da renda: nos ombros ele é cortado onde ela fica, e acaba na base da gola
      const habito = cortar(
        fundir(F.tronco(E, 1.0, 1.44, undefined, COM_MANGA), [0.03, manga(0.11, 0.602, folga)]),
        (x, y) => Math.min(y - 1.3, x - daRenda(y) - 0.002, FIM_DA_RENDA - 0.002 - x),
        0.002,
      );
      // a gola alta e os ombros de renda: vazados, sem nada por baixo
      const gola = F.gola(E, 1.425, 1.5, 0);
      const capinha = F.tronco(E + 0.001, 1.3, 1.475, (x, y) => daRenda(y) - x, FIM_DA_RENDA);
      // o corpete amarrado na frente (o brocado faz o cruzado do cordão)
      const amarracao = F.noPeito(E + 0.0012, 1.12, 1.3, () => 0.011);
      // a cruz de vitral: a moldura dourada e, dentro, os vidros verde-azulados
      const cruz = (e: number, meia: number) => unir(...[[0, 1.387], [0, 1.372], [0, 1.357], [0, 1.342], [0.0135, 1.372]].map(([x, y]) => F.remendo(e, x, y, meia, true)));
      const cinto = F.tronco(E + 0.003, 1.08, 1.105);
      // o punho de renda, por dentro da manga em sino: rente ao braço até a boca dela (o pano da manga
      // pousa por cima sem atravessá-lo) e aberto dali para a mão, onde aparece
      const daRendaDoPulso = (x: number) => 0.0042 + 0.0085 * degrau(0.668, 0.694, x);
      const rendaDoPulso = oca(manga(0.598, 0.694, daRendaDoPulso), 0.6, 0.694, daRendaDoPulso, 0.0038);
      return [
        { forma: habito, cor: HABITO },
        { forma: rendaDoPulso, cor: '#1d1d22', enfeite: ENFEITE.renda, vazada: true, doBraco: true },
        { forma: gola, cor: '#1d1d22', enfeite: ENFEITE.renda, vazada: true },
        { forma: capinha, cor: '#1d1d22', enfeite: ENFEITE.renda, vazada: true },
        { forma: amarracao, cor: '#0b0b0d', cor2: '#3a3a42', enfeite: ENFEITE.brocado },
        { forma: cruz(E + 0.0058, 0.0066), cor: DOURADO, fino: 0.6 },
        { forma: cruz(E + 0.0072, 0.0038), cor: '#2f7f8a', fino: 0.5 },
        { forma: cinto, cor: '#0e0e10' },
        { forma: F.remendo(E + 0.0046, 0, 1.0925, 0.0105, true), cor: DOURADO, fino: 0.6 },
        { forma: F.remendo(E + 0.0062, 0, 1.0925, 0.0052, true), cor: '#0e0e10', fino: 0.5 },
      ];
    },
    panos: () => [
      // a manga em sino: presa no braço e aberta até a mão, com a arcada gótica dourada na barra (o punho
      // de renda não é pano: dois panos não desviam um do outro, e ele atravessava a manga)
      ...tubos({
        nome: 'manga',
        de: 0.25,
        ate: 0.672,
        cols: 36,
        rows: 30,
        folga: (x) => 0.008 + 0.058 * degrau(0.29, 0.672, x),
        presas: 2,
        osso: 'braco',
        cor: '#141416',
        avesso: '#0f0f11',
        cor2: '#d99a3a',
        enfeite: ENFEITE.gotico,
      }),
    ],
  },
  {
    id: 'goro',
    nome: 'Goro',
    resumo: 'quimono laranja de gola cruzada sobre o juban branco, brasões creme no peito, faixa preta na cintura e mangas enormes (pano de verdade) com a treliça de losangos azuis debruados de creme',
    pele: PELE_CLARA,
    pecas: () => {
      const F = ferramentas();
      const E = 0.008;
      const LARANJA = '#e2611b';
      const CREME = '#f5f0e6';
      const q = quimono(F, E, 0.24);
      // o brasão (mon) de cada lado do peito: um disco creme, um anel laranja e o miolo creme
      const mon = (e: number, r: number) => F.remendo(e, 0.088, 1.37, r);
      // por baixo da manga solta, a manga branca do juban, que aparece na boca dela
      const juban = manga(0.2, FIM_DA_MANGA - 0.004, (x) => 0.0022 + 0.001 * degrau(0.5, 0.66, x));
      // o alto da manga, no ombro, acompanha o braço (é onde a manga solta se prende)
      const ombro = manga(0.2, 0.31, () => 0.0125);
      return [
        { forma: q.corpo, cor: LARANJA },
        { forma: ombro, cor: LARANJA, cor2: '#3a5fa8', enfeite: ENFEITE.trelica },
        { forma: q.gola, cor: '#c9521a' },
        { forma: unir(q.juban, juban), cor: CREME },
        { forma: mon(E + 0.0015, 0.0135), cor: CREME, fino: 0.6 },
        { forma: mon(E + 0.0026, 0.0098), cor: LARANJA, fino: 0.5 },
        { forma: mon(E + 0.0037, 0.0058), cor: CREME, fino: 0.5 },
        { forma: F.tronco(E + 0.007, 1.0, 1.1), cor: '#1a1a1a' },
      ];
    },
    panos: () =>
      tubos({
        nome: 'manga',
        // (abre aos poucos, do ombro à boca: larga de uma vez, perto do ombro, ela afundava para dentro
        // e a barra virava, mostrando o forro)
        de: 0.29,
        ate: 0.665,
        cols: 36,
        rows: 26,
        folga: (x) => 0.013 + 0.046 * degrau(0.31, 0.62, x),
        presas: 2,
        osso: 'braco',
        cor: '#e2611b',
        // (o forro: escuro, como o lado de dentro de uma manga, na sombra; claro, ele parecia a manga virada)
        avesso: '#8a3c14',
        cor2: '#3a5fa8',
        enfeite: ENFEITE.trelica,
        dureza: 1,
      }),
  },
  {
    id: 'hina',
    nome: 'Hina',
    resumo: 'furisode lilás de glicínias, de gola cruzada fechada no alto do peito (sem nada por baixo), obi verde-menta com o cordão dourado e dois guizos, e as mangas compridas (pano de verdade) que pendem até a mesa e clareiam para o menta na barra',
    pele: PELE_CLARA,
    pecas: () => {
      const F = ferramentas();
      const E = 0.0065;
      const LILAS = '#c7b2ea';
      const OURO_CLARO = '#f2c94c';
      const q = quimono(F, E, 0.24, 1.355);
      const ombro = manga(0.2, 0.31, () => 0.011);
      // o obi, e por cima dele o cordão (obijime) com o laço na frente e os dois guizos pendurados
      const obi = F.tronco(E + 0.008, 1.04, 1.16);
      const cordao = unir(F.tronco(E + 0.0115, 1.098, 1.108), F.remendo(E + 0.013, 0.011, 1.104, 0.0075));
      const zGuizo = F.frente(0.011, 1.074, E + 0.008) + 0.009;
      const guizos = unir(elipsoide([0.011, 1.074, zGuizo], [0.0085, 0.0085, 0.0085]), capsula([0.011, 1.1, zGuizo - 0.004], [0.011, 1.08, zGuizo], 0.0013));
      return [
        { forma: q.corpo, cor: LILAS, cor2: '#8f72cf', enfeite: ENFEITE.glicinias },
        { forma: ombro, cor: LILAS, cor2: '#8f72cf', enfeite: ENFEITE.glicinias },
        { forma: q.gola, cor: '#b39ddf' },
        { forma: obi, cor: '#a8e6cf', cor2: '#c6f1de', enfeite: ENFEITE.brocado },
        { forma: unir(cordao, guizos), cor: OURO_CLARO, fino: 0.5 },
      ];
    },
    panos: () =>
      tubos({
        nome: 'manga',
        de: 0.29,
        ate: 0.665,
        cols: 38,
        rows: 28,
        folga: (x) => 0.012 + 0.056 * degrau(0.31, 0.62, x),
        presas: 2,
        osso: 'braco',
        cor: '#c7b2ea',
        avesso: '#9483bd',
        cor2: '#8f72cf',
        enfeite: ENFEITE.glicinias,
        pinta: (x) => (x > 0.5 ? misturar('#c7b2ea', '#a8e6cf', degrau(0.5, 0.665, x)) : null),
      }),
  },
  {
    id: 'zuzu',
    nome: 'Glitch',
    resumo: 'moletom verde-limão largo com o capuz de orelhas de gato (filetes ciano) posto na cabeça, cordões pretos de ponta ciano, gola alta preta, punhos canelados e luvas sem dedos',
    pele: PELE_CLARA,
    pecas: () => {
      const F = ferramentas();
      const E = 0.011;
      const LIMAO = '#b6ff00';
      const CIANO = '#00e5ff';
      const NOITE = '#14141f';
      // do moletom, o que acompanha o corpo é o tronco; a manga é pano solto, arriada (ver `panos`), e
      // o punho canelado a colhe a uns três quartos do antebraço
      const moletom = F.tronco(E, 1.0, 1.45, undefined, COM_MANGA);
      const canelado = manga(PUNHO_DA_ZUZU - 0.04, PUNHO_DA_ZUZU, () => 0.0068);
      // o capuz posto na cabeça: uma casca entre a pele engordada de 1,8 e de 3 cm, aberta no rosto
      const fora = fundir(F.justa(0.03, [0, 1.6, -0.01], 0.2), [0.03, elipsoide([0, 1.5, -0.035], [0.095, 0.075, 0.085])]);
      const casca = cavar(fora, [0.002, F.justa(0.018, [0, 1.6, -0.01], 0.2)]);
      const rosto = (x: number, y: number, z: number) => Math.max(1.435 - y, Math.min(z + 0.004, (1 - Math.hypot(x / 0.07, (y - 1.603) / 0.098)) * 0.07));
      const capuz = cortar(casca, rosto, 0.002);
      // as orelhas de gato em cima do capuz: triângulos achatados, pontudos, um pouco abertos para os
      // lados, com o filete de luz ciano na frente
      const orelha = membro([0.048, 1.712, -0.012], [0.076, 1.792, -0.012], FRENTE, [
        { t: 0, ru: 0.03, rv: 0.009 },
        { t: 1, ru: 0.003, rv: 0.003 },
      ]);
      const filete = membro([0.053, 1.733, -0.0028], [0.07, 1.776, -0.0028], FRENTE, [
        { t: 0, ru: 0.011, rv: 0.0028 },
        { t: 1, ru: 0.0015, rv: 0.0014 },
      ]);
      return [
        { forma: moletom, cor: LIMAO },
        { forma: canelado, cor: '#a3e600', cor2: '#94d100', enfeite: ENFEITE.canelado, doBraco: true },
        { forma: capuz, cor: LIMAO, alto: 1.8 },
        { forma: orelha, cor: LIMAO, alto: 1.8, fino: 0.6 },
        { forma: filete, cor: CIANO, alto: 1.8, fino: 0.5 },
        { forma: F.gola(0.004, 1.43, 1.5, 0), cor: NOITE },
        { forma: F.faixa(E + 0.003, 0.028, 0.034, 1.25, 1.44), cor: PRETO, fino: 0.6 },
        { forma: F.faixa(E + 0.0042, 0.026, 0.036, 1.234, 1.256), cor: CIANO, fino: 0.6 },
        { forma: F.noPeito(E + 0.0022, 1.04, 1.16, (y) => 0.085 - 0.01 * degrau(1.12, 1.16, y)), cor: '#a8eb00' },
        // (a luva de meio dedo, escura, com o botão ciano na tira)
        ...meioDedo(F, { cor: NOITE, cor2: '#2a2a38', cor3: CIANO }),
      ];
    },
    // as mangas: largas desde o ombro caído e arriadas um pouco, até o punho canelado. Têm quase metade
    // de pano a mais do que o trecho de braço que vestem: a sobra enruga a manga inteira
    panos: () =>
      tubos({
        nome: 'manga',
        de: 0.192,
        ate: PUNHO_DA_ZUZU - 0.026,
        cols: 36,
        rows: 34,
        folga: (x) => {
          const fim = degrau(0.47, PUNHO_DA_ZUZU - 0.026, x);
          return (0.015 + 0.015 * degrau(0.2, 0.3, x)) * (1 - fim) + 0.0048 * fim;
        },
        presas: 2,
        osso: 'braco',
        fim: { presas: 2, osso: 'antebraco' },
        sobra: 1.42,
        cor: '#b6ff00',
        avesso: '#9ccf00',
        folgaDoCorpo: 0.005,
        dureza: 1,
      }),
  },
  {
    id: 'nobu',
    nome: 'Nobu',
    resumo: 'terno preto amarrotado, aberto na frente, camisa creme de colarinho desabotoado, gravata cinza-chumbo frouxa (o nó caído abaixo do colarinho), bilhetes de aposta no bolso do peito e o punho da camisa aparecendo (o relógio é um acessório à parte: shared/acessorios.ts)',
    pele: PELE_CLARA,
    pecas: () => {
      const F = ferramentas();
      const E = 0.0072;
      const CAMISA = '#efe6d5';
      const LAPELA = '#26262d';
      // o paletó fica aberto: a camisa aparece do colarinho à cintura, mais larga no peito
      const aberto = (y: number) => 0.036 + 0.026 * degrau(1.2, 1.41, y);
      const p = paleto(F, E, aberto, 1.2, [0.09, 1.362]);
      // a manga: reta, amarrotada na dobra do cotovelo (pregas miúdas) e oca na boca, onde aparece o punho da camisa
      const folga = (x: number) => 0.0072 + 0.0028 * degrau(0.5, 0.67, x) + 0.0022 * calombo(0.35, 0.53, x) * Math.sin((x - 0.35) * 190);
      const boca = FIM_DA_MANGA - 0.004;
      const terno = fundir(p.corpo, [0.03, oca(manga(0.11, boca, folga, 0.006), 0.61, boca, folga, 0.004, 0.006)]);
      const punho = manga(boca - 0.03, FIM_DA_MANGA + 0.007, () => 0.0042);
      // a camisa: só o que aparece na abertura do paletó (e um pouco para dentro dela), com o
      // colarinho desabotoado — um V de pele no pescoço
      const decote = (y: number) => 0.021 * degrau(1.392, 1.448, y);
      const camisa = cortar(F.justa(0.0032, [0, 1.23, 0.04], 0.27), (x, y, z) => Math.max(1.0 - y, y - 1.452, x - aberto(y) - 0.014, -z, decote(y) - x), 0.0015);
      // o colarinho: em pé em volta do pescoço, aberto na frente, e as duas pontas caídas no peito
      const colarinho = unir(cortar(F.gola(0.0045, 1.438, 1.486, 0.018), (x) => x - 0.05, 0.004), F.recorte(0.0068, [[0.017, 1.45], [0.062, 1.453], [0.05, 1.392], [0.026, 1.4]], 0.0012));
      // a gravata, frouxa: o nó caído abaixo do colarinho, as duas pernas dela subindo para debaixo
      // das pontas dele, e a lâmina descendo até perto da cintura
      const G = 0.0062;
      const lamina = F.noPeito(G, 1.132, 1.39, (y) => 0.0078 + 0.0105 * degrau(1.375, 1.2, y) - 0.02 * degrau(1.178, 1.134, y));
      const no = elipsoide([0, 1.388, F.frente(0, 1.388, G) + 0.0005], [0.0125, 0.0125, 0.0058]);
      const pernas = F.recorte(G - 0.0016, [[0.004, 1.392], [0.012, 1.386], [0.034, 1.44], [0.024, 1.446]]);
      // no bolso do peito, os bilhetes de aposta que ele guarda "para dar sorte": três, desencontrados
      const bolso = F.faixa(E + 0.0016, 0.08, 0.119, 1.316, 1.3215);
      const bilhetes = unir(
        F.recorte(E + 0.002, [[0.083, 1.32], [0.094, 1.32], [0.091, 1.344], [0.08, 1.341]]),
        F.recorte(E + 0.0032, [[0.092, 1.32], [0.104, 1.32], [0.1055, 1.356], [0.0935, 1.357]]),
        F.recorte(E + 0.002, [[0.105, 1.32], [0.116, 1.32], [0.12, 1.348], [0.109, 1.351]]),
      );
      const botoes = unir(F.botao(0.05, 1.15, E, 0.0062), F.botao(0.049, 1.085, E, 0.0062));
      // o cinto, na abertura do paletó, com a fivela de metal
      const cinto = F.noPeito(0.0048, 1.0, 1.03, (y) => aberto(y) + 0.012);
      const fivela = F.remendo(0.006, 0, 1.015, 0.011, true);
      return [
        { forma: terno, cor: '#1b1b20' },
        { forma: p.lapelas, cor: LAPELA },
        { forma: punho, cor: CAMISA, doBraco: true },
        // (malha mais fina, e a pele desenhada até debaixo da beirada: a boca do colarinho não sai serrilhada)
        { forma: camisa, cor: CAMISA, fino: 0.6, beira: 0.004 },
        { forma: colarinho, cor: CAMISA, fino: 0.5 },
        { forma: unir(lamina, pernas, no), cor: '#3b3e49', fino: 0.6 },
        { forma: bolso, cor: LAPELA, lado: 'E', fino: 0.6 },
        { forma: bilhetes, cor: '#f3efe4', lado: 'E', fino: 0.5 },
        { forma: botoes, cor: '#303038', lado: 'D', fino: 0.5 },
        { forma: cinto, cor: '#141317' },
        { forma: fivela, cor: '#a4a9b3', fino: 0.5 },
      ];
    },
  },
  {
    id: 'saeko',
    nome: 'Saeko',
    resumo: 'blazer preto aberto, de ombros armados e mangas arregaçadas até abaixo do cotovelo, camisa branca de colarinho aberto por cima das lapelas, colar fino de ouro com pingente, broche dourado na lapela e cinto vinho de fivela dourada sobre a saia preta',
    pele: PELE_CLARA,
    pecas: () => {
      const F = ferramentas();
      const E = 0.007;
      const BRANCO = '#f4f2ee';
      // o blazer fica aberto: junto na cintura, afastado no colo
      const aberto = (y: number) => 0.042 + 0.024 * degrau(1.12, 1.38, y);
      const p = paleto(F, E, aberto, 1.13, [0.094, 1.345]);
      // a manga, arregaçada: acaba abaixo do cotovelo, e o pano empurrado para cima junta em pregas,
      // que acabam num rolo liso em volta do braço (a boca não é oca: a parede fina dela saía
      // esfiapada); o ombro é armado
      const FIM = 0.506;
      const folga = (x: number) => 0.007 + 0.0035 * calombo(0.09, 0.25, x) + degrau(0.37, 0.425, x) * (0.0042 + 0.003 * Math.sin((x - 0.37) * 215) * (1 - degrau(0.482, 0.496, x)));
      const blazer = fundir(p.corpo, [0.03, manga(0.11, FIM, folga, 0.005)]);
      // a camisa: aberta num V fundo, do pescoço ao colo (a pele e o colar aparecem nele)
      const decote = (y: number) => 0.04 * degrau(1.305, 1.44, y);
      const camisa = cortar(F.justa(0.0032, [0, 1.23, 0.04], 0.27), (x, y, z) => Math.max(1.0 - y, y - 1.452, x - aberto(y) - 0.014, -z, decote(y) - x), 0.0015);
      // o colarinho: em pé atrás do pescoço, e as duas pontas largas abertas por cima das lapelas
      // (saem rentes à camisa, na beirada do V, e sobem para cima do blazer)
      const ponta = F.recorte((x) => 0.0046 + (E + 0.0042 - 0.0046) * degrau(0.044, 0.07, x), [[0.039, 1.452], [0.08, 1.456], [0.09, 1.4], [0.03, 1.384]], 0.0012);
      const colarinho = unir(cortar(F.gola(0.0046, 1.44, 1.486, 0.04), (x) => x - 0.05, 0.004), ponta);
      const botoes = unir(...[1.27, 1.225, 1.18, 1.135].map((y) => F.botao(0, y, 0.0032, 0.0034)));
      // o colar: um fio de ouro que desce da nuca pelo V, com um pingente em barra
      const fio = cortar(F.justa(0.0013, [0, 1.405, 0.05], 0.075), (x, y, z) => Math.max(1.366 - y, y - 1.446, Math.abs(x - 0.0005 - 0.035 * (Math.max(0, y - 1.366) / 0.078) ** 1.25) - 0.001, -z), 0.0004);
      const pingente = elipsoide([0, 1.359, F.frente(0, 1.36, 0) + 0.0011], [0.0021, 0.007, 0.0019]);
      const broche = F.remendo(E + 0.0042, 0.083, 1.372, 0.0055);
      // a saia, o cinto e a fivela: o que aparece na abertura do blazer, da cintura para baixo
      const saia = F.noPeito(0.0042, 1.0, 1.078, (y) => aberto(y) + 0.012);
      const cinto = F.noPeito(0.0056, 1.072, 1.098, (y) => aberto(y) + 0.012);
      const fivela = F.remendo(0.0068, 0, 1.085, 0.0115, true);
      const miolo = F.remendo(0.0076, 0, 1.085, 0.0065, true);
      return [
        { forma: blazer, cor: '#1a1a1f' },
        { forma: p.lapelas, cor: '#25252c' },
        // (malha mais fina, e a pele desenhada até debaixo da beirada: a beirada do V não sai serrilhada)
        { forma: camisa, cor: BRANCO, fino: 0.6, beira: 0.004 },
        { forma: colarinho, cor: BRANCO, fino: 0.5 },
        { forma: botoes, cor: '#d5d1c8', fino: 0.5 },
        { forma: unir(fio, pingente), cor: OURO, fino: 0.25, semCobrir: true },
        { forma: broche, cor: OURO, lado: 'E', fino: 0.5 },
        { forma: saia, cor: '#17171b' },
        { forma: cinto, cor: '#7c2230' },
        { forma: fivela, cor: OURO, fino: 0.5 },
        { forma: miolo, cor: '#7c2230', fino: 0.5 },
      ];
    },
  },
];

// ─────────────────────────────── a costura ───────────────────────────────

/** Onde a malha fina (a das mãos, dos punhos e das bocas das mangas) começa, como no corpo. */
const CORTE_DA_MAO = 0.6;

function cor(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Só os triângulos de um lado do corpo. */
function soDoLado(m: Malha, lado: Lado): Malha {
  const fica = (v: number) => (lado === 'E' ? m.pos[v * 3] > 0 : m.pos[v * 3] < 0);
  const idx: number[] = [];
  for (let t = 0; t < m.idx.length; t += 3) if (fica(m.idx[t]) && fica(m.idx[t + 1]) && fica(m.idx[t + 2])) idx.push(m.idx[t], m.idx[t + 1], m.idx[t + 2]);
  return { ...m, idx: new Uint32Array(idx) };
}

/**
 * A luva de meio dedo, a de dirigir: o pano de dois milímetros que acaba no meio do primeiro osso de
 * cada dedo, com
 *  - a **abertura** nas costas da mão (a pele aparece por ela), debruada;
 *  - a bainha na boca de cada dedo e um reforço comprido em cima de cada nó;
 *  - a **tira do pulso**, por cima das costas da mão, presa por um botão de pressão;
 *  - e o punho dela em volta do pulso.
 */
function meioDedo(F: ReturnType<typeof ferramentas>, { cor, cor2, cor3 }: { cor: string; cor2: string; cor3: string }): Peca[] {
  return [
    { forma: unir(F.luva(0.002, true, undefined, true), manga(FIM_DA_MANGA - 0.004, PUNHO_X + 0.006, () => 0.0036)), cor, beira: 0.0012, luva: true },
    { forma: unir(F.bainhas(0.0031), F.orla(0.0031), F.reforcos(0.0032)), cor: cor2, semCobrir: true, fino: 0.6, luva: true },
    { forma: F.tira(0.0034), cor: cor2, semCobrir: true, fino: 0.7, luva: true },
    { forma: F.noDorso(0.0046, PUNHO_X + 0.012, 0.013, 0.0037), cor: cor3, semCobrir: true, fino: 0.5, luva: true },
  ];
}

/**
 * As peças de uma luva escolhida pelo jogador:
 *  - `inteira`: a de passeio, com as três nervuras nas costas da mão;
 *  - `sem-dedos`: a de meio dedo (veja `meioDedo`);
 *  - `tatica`: de meio dedo e fechada nas costas, com uma placa dura moldada em cima dos nós, uma
 *    tala em cada dedo e a tira do pulso;
 *  - `renda`: inteira, de renda vazada (a pele aparece pelo desenho), com um punho liso;
 *  - `opera`: inteira e comprida, lisa, até o meio do antebraço, com uma bainha no alto;
 *  - `manopla`: a luva de armadura — a malha por baixo, placas em cada osso de cada dedo, a placa
 *    das costas da mão, a barra dos nós e o punho aberto em sino, com frisos de metal.
 */
export function pecasDaLuva(estilo: EstiloDeLuva): Peca[] {
  if (estilo.feitio === 'nenhuma') return [];
  const F = ferramentas();
  const { cor, cor2 } = estilo;
  const cor3 = estilo.cor3 ?? OURO;
  switch (estilo.feitio) {
    case 'inteira':
      return [
        { forma: unir(F.luva(0.0013, false), manga(FIM_DA_MANGA - 0.004, PUNHO_X + 0.004, () => 0.0026)), cor, luva: true },
        { forma: F.nervuras(0.0022), cor: cor2, semCobrir: true, fino: 0.6, luva: true },
      ];
    case 'sem-dedos':
      return meioDedo(F, { cor, cor2, cor3 });
    case 'tatica':
      return [
        { forma: unir(F.luva(0.0022, true), manga(FIM_DA_MANGA - 0.004, PUNHO_X + 0.008, () => 0.0038)), cor, beira: 0.0012, luva: true },
        { forma: unir(F.bainhas(0.0033), F.tira(0.0038), F.talas(0.0034, 0.1, 0.44, 0.0032)), cor: cor2, semCobrir: true, fino: 0.6, luva: true },
        { forma: F.placaDosNos(0.0056), cor: cor2, semCobrir: true, fino: 0.6, luva: true },
        { forma: unir(F.noDorso(0.005, PUNHO_X + 0.012, 0.013, 0.0037), ...[0.012, -0.004, -0.02].map((z) => F.noDorso(0.0038, PUNHO_X + 0.05, z, 0.0026))), cor: cor3, semCobrir: true, fino: 0.5, luva: true },
      ];
    case 'renda':
      return [
        // (o pano da renda fica um nada mais longe da pele, para ela aparecer nos furos)
        { forma: F.luva(0.0015, false, FIM_DA_MANGA + 0.002), cor, cor2, enfeite: ENFEITE.renda, vazada: true, luva: true },
        { forma: manga(FIM_DA_MANGA - 0.004, PUNHO_X + 0.001, () => 0.0028), cor, luva: true },
        { forma: manga(FIM_DA_MANGA - 0.005, FIM_DA_MANGA - 0.001, () => 0.004), cor: cor2, fino: 0.6, luva: true },
      ];
    case 'opera': {
      const alto = PUNHO_X - 0.098;
      return [
        { forma: F.luva(0.0012, false, alto, false, 0.25), cor, luva: true },
        { forma: manga(alto - 0.001, alto + 0.005, () => 0.0027), cor: cor2, doBraco: true, fino: 0.6, luva: true },
        // (três pregas no pulso, onde o cetim comprido se junta)
        { forma: unir(...[-0.018, -0.009, 0].map((dx) => manga(PUNHO_X + dx - 0.0012, PUNHO_X + dx + 0.0012, () => 0.0022))), cor: cor2, semCobrir: true, fino: 0.6, luva: true },
      ];
    }
    case 'manopla': {
      const boca = FIM_DA_MANGA - 0.03;
      const sino = (x: number) => 0.0036 + 0.013 * (1 - degrau(boca, PUNHO_X - 0.002, x));
      return [
        // a malha por baixo, que aparece nas juntas
        { forma: F.luva(0.0018, false), cor: cor2, luva: true },
        // as placas: uma em cada osso de cada dedo (a junta fica livre), e a das costas da mão
        {
          forma: unir(
            F.emVoltaDosDedos(0.0034, (d, k) =>
              k === 4
                ? [
                    [d.j1 + (d.j2 - d.j1) * 0.12, d.j1 + (d.j2 - d.j1) * 0.82],
                    [d.j2 + (d.ponta - d.j2) * 0.14, d.ponta + 0.004],
                  ]
                : [
                    [d.j1 * 0.2, d.j1 * 0.84],
                    [d.j1 + (d.j2 - d.j1) * 0.16, d.j1 + (d.j2 - d.j1) * 0.84],
                    [d.j2 + (d.ponta - d.j2) * 0.16, d.ponta + 0.004],
                  ],
            ),
            F.noDorso(0.0036, PUNHO_X + 0.047, 0.0, 0.027),
          ),
          cor,
          semCobrir: true,
          luva: true,
        },
        // o punho em sino, que abre para o antebraço (maciço: oco, a parede fina saía picotada na malha)
        { forma: manga(boca, PUNHO_X + 0.004, sino), cor, doBraco: true, luva: true },
        // os frisos de metal: a barra dos nós, a boca do sino e o aro do punho
        {
          forma: unir(F.placaDosNos(0.0052, 0.0052), manga(boca - 0.0005, boca + 0.0035, (x) => sino(x) + 0.0012), manga(PUNHO_X - 0.001, PUNHO_X + 0.0045, () => 0.0052)),
          cor: cor3,
          semCobrir: true,
          fino: 0.6,
          luva: true,
        },
      ];
    }
  }
}

/**
 * As peças de um traje, com a luva dele — ou, com `luva`, com a do estilo escolhido no lugar dela.
 *
 * Com uma luva para cada mão (`{ E, D }`), cada uma vai só do lado dela (`lado`): a malha é feita dos
 * dois lados, como todas, e a do outro lado é jogada fora. Custa o dobro de costura só a quem usa
 * luvas diferentes — com a mesma nas duas mãos, é o caminho de sempre.
 */
export function pecasDoTraje(traje: Traje, luva?: LuvasDoTraje): Peca[] {
  const pecas = traje.pecas();
  if (!luva) return pecas;
  if (!('E' in luva)) return [...pecas.filter((p) => !p.luva), ...pecasDaLuva(luva)];
  const doLado = (l: LuvaDoLado, lado: Lado): Peca[] =>
    (l === 'traje' ? pecas.filter((p) => p.luva) : pecasDaLuva(l)).filter((p) => !p.lado || p.lado === lado).map((p) => ({ ...p, lado }));
  return [...pecas.filter((p) => !p.luva), ...doLado(luva.E, 'E'), ...doLado(luva.D, 'D')];
}

/** O traje tem luva? (Com ela, os anéis e a pulseira vão por cima do pano.) */
export function trajeTemLuva(traje: Traje): 'nenhuma' | 'inteira' | 'sem-dedos' {
  return LUVA_DO_TRAJE[traje.id] ?? 'nenhuma';
}
const LUVA_DO_TRAJE: Record<string, 'inteira' | 'sem-dedos'> = { alistair: 'inteira', ren: 'inteira', marina: 'sem-dedos', tobi: 'sem-dedos', zuzu: 'sem-dedos' };

/**
 * Faz a roupa de um traje (as peças que acompanham o corpo; as soltas são os `panos` dele): a malha,
 * os pesos (a que ossos cada vértice obedece) e o que ela cobre do corpo. `corpo` é a malha do corpo
 * (para marcar a pele coberta).
 */
export function costurar(traje: Traje, esq: Esqueleto, corpo: Malha, q: Qualidade = QUALIDADE, luva?: LuvasDoTraje): Roupa {
  const pecas = pecasDoTraje(traje, luva);
  return { ...costurarPecas(pecas, esq, q), coberto: cobertoPor(pecas, corpo) };
}

/** A malha e os pesos das peças de um traje (a parte de `costurar` que não depende do corpo). */
export function costurarPecas(pecas: Peca[], esq: Esqueleto, q: Qualidade = QUALIDADE): Omit<Roupa, 'coberto'> {
  const malhas: Malha[] = [];
  const cores: number[] = [];
  const cores2: number[] = [];
  const enfeites: number[] = [];
  const presas: number[] = [];
  for (const peca of pecas) {
    const campo = peca.forma.d;
    const passo = q.corpo * (peca.fino ?? 1);
    const sobra = passo * 1.5;
    const { cx, r } = peca.forma;
    const partes: Malha[] = [];
    // (cada peça só é procurada onde ela pode estar: aquém ou além do corte da mão)
    if (cx - r < CORTE_DA_MAO + 0.03) partes.push(malhar({ campo, min: [0, 0.95, -0.26], max: [CORTE_DA_MAO + 0.03, peca.alto ?? 1.6, 0.26], passo, simetrica: true, aceita: (x) => x < CORTE_DA_MAO + sobra }));
    if (cx + r > CORTE_DA_MAO - 0.012) partes.push(malhar({ campo, min: [CORTE_DA_MAO - 0.012, 1.24, -0.15], max: [0.93, 1.56, 0.15], passo: Math.min(passo, q.mao * 1.25), aceita: (x) => x > CORTE_DA_MAO }));
    let m = espelhar(juntar(partes));
    if (peca.lado) m = soDoLado(m, peca.lado);
    malhas.push(m);
    const c = cor(peca.cor);
    const c2 = cor(peca.cor2 ?? peca.cor);
    for (let v = 0; v < m.pos.length / 3; v++) {
      cores.push(c[0], c[1], c[2]);
      cores2.push(c2[0], c2[1], c2[2]);
      enfeites.push(peca.enfeite ?? 0);
      presas.push(peca.doBraco ? 1 : 0);
    }
  }
  const malha = Object.assign(juntar(malhas), { cor: new Float32Array(cores), cor2: new Float32Array(cores2), enfeite: new Float32Array(enfeites) });

  // cada vértice da roupa obedece aos ossos do ponto da pele que fica debaixo dele. Nas peças justas
  // acha-se esse ponto descendo pelo campo do corpo; nas do braço (mangas, punhos) é o ponto do braço
  // na mesma altura, e nunca passa do punho, para a manga não acompanhar a mão.
  const pele = campoDoCorpo();
  const n = malha.pos.length / 3;
  const naPele = new Float32Array(malha.pos);
  const eps = 0.002;
  for (let v = 0; v < n; v++) {
    let x = naPele[v * 3];
    let y = naPele[v * 3 + 1];
    let z = naPele[v * 3 + 2];
    if (presas[v]) {
      // manga ou punho: o ponto do braço na mesma altura e do mesmo lado (a manga larga fica longe
      // demais da pele para se descer até ela pelo campo)
      const lado = Math.sign(x) || 1;
      const ax = Math.min(Math.abs(x), FIM_DA_MANGA - 0.022);
      const eixo = noEixo(ax);
      const braco = noBraco(ax);
      const ry = y - eixo[1] - braco.ou;
      const rz = z - eixo[2] - braco.ov;
      const r = Math.hypot(ry, rz) || 1;
      const raio = Math.min(braco.ru, braco.rv);
      naPele[v * 3] = lado * ax;
      naPele[v * 3 + 1] = eixo[1] + braco.ou + (ry / r) * raio;
      naPele[v * 3 + 2] = eixo[2] + braco.ov + (rz / r) * raio;
      continue;
    }
    for (let volta = 0; volta < 8; volta++) {
      const d = pele(x, y, z);
      if (Math.abs(d) < 0.0004) break;
      let gx = pele(x + eps, y, z) - pele(x - eps, y, z);
      let gy = pele(x, y + eps, z) - pele(x, y - eps, z);
      let gz = pele(x, y, z + eps) - pele(x, y, z - eps);
      const g = Math.hypot(gx, gy, gz) || 1;
      gx /= g;
      gy /= g;
      gz /= g;
      const anda = Math.max(-0.03, Math.min(0.03, (d * 2 * eps) / g));
      x -= gx * anda;
      y -= gy * anda;
      z -= gz * anda;
    }
    naPele[v * 3] = x;
    naPele[v * 3 + 1] = y;
    naPele[v * 3 + 2] = z;
  }
  const { indices, pesos } = pesar({ ...malha, pos: naPele, unha: new Float32Array(n) }, esq);
  return { malha, indices, pesos };
}

/** Para cada vértice do corpo: 1 se as peças o cobrem (e ele não se desenha), 0 se não. */
export function cobertoPor(pecas: Peca[], corpo: Pick<Malha, 'pos' | 'unha'>): Float32Array {
  // a pele que a roupa cobre (as unhas ficam um pouco para fora da pele: contam com folga). A renda não cobre.
  // (a peça de um lado só — a luva de uma mão — cobre só a pele daquele lado: o esquerdo é o de x > 0)
  const campos = pecas.filter((p) => !p.vazada && !p.semCobrir).map((p) => ({ d: p.forma.d, beira: p.beira, lado: p.lado }));
  const coberto = new Float32Array(corpo.pos.length / 3);
  for (let v = 0; v < coberto.length; v++) {
    const x = Math.abs(corpo.pos[v * 3]);
    const lado: Lado = corpo.pos[v * 3] > 0 ? 'E' : 'D';
    const y = corpo.pos[v * 3 + 1];
    const z = corpo.pos[v * 3 + 2];
    if (y < 0.93) continue;
    const unha = corpo.unha[v] === 1;
    for (const campo of campos) {
      if (campo.lado && campo.lado !== lado) continue;
      // (a pele junto da beirada de uma peça com `beira` fica: é o pano, por cima, que a esconde)
      if (campo.d(x, y, z) < (unha ? 0.003 : campo.beira !== undefined ? -campo.beira : 0.0006)) {
        coberto[v] = 1;
        break;
      }
    }
  }
  return coberto;
}
