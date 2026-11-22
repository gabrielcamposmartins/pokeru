/**
 * Pano solto (softbody): as partes da roupa que não acompanham o corpo coladas nele, mas pendem,
 * balançam e pousam — a manga larga, o corpo de uma jaqueta caída dos ombros, um casaco nos ombros.
 *
 * Um pano é uma grade de pontos ligados por elásticos curtos (vizinhos, diagonais e de dois em
 * dois, que é o que o impede de dobrar em quina). A cada passo os pontos caem com a gravidade, os
 * elásticos são puxados de volta ao comprimento deles, e cada ponto é empurrado para fora do que
 * estiver no caminho: os braços, as mãos e o tronco (cápsulas e elipsoides presos aos ossos) e a
 * mesa. Alguns pontos ficam presos a um osso — é por onde o pano segura no corpo.
 *
 * O passo de um quadro é dividido em muitos passos miúdos, cada um com uma só volta de acertos
 * ("position based dynamics" de passo pequeno). É isso que deixa o pano parar: num passo miúdo a
 * gravidade desloca um ponto centésimos de milímetro, e o que os acertos não desfazem não se vê —
 * com um passo grande por quadro, o pano em repouso ficava fervendo. Onde o pano encosta em alguma
 * coisa há atrito de verdade (de Coulomb): numa rampa suave ele gruda, numa íngreme escorrega.
 */
import * as THREE from 'three';
import type { Boneco } from './boneco';

type V3 = readonly [number, number, number];

/** Do que o pano desvia: uma cápsula entre dois pontos presos a ossos, ou um elipsoide preso a um osso. */
export type DefDeColisor =
  | { tipo: 'capsula'; ossoA: string; a: V3; ossoB: string; b: V3; ra: number; rb: number }
  | { tipo: 'elipsoide'; osso: string; centro: V3; raios: V3 };

export interface DefDePano {
  nome: string;
  /** A grade: colunas e fileiras de pontos. `fechado` liga a última coluna à primeira (um tubo). */
  cols: number;
  rows: number;
  fechado: boolean;
  /** Onde fica cada ponto na T-pose (no mundo). */
  repouso: (c: number, r: number) => V3;
  /** O molde: onde o ponto fica no pano estendido (em metros). Sem ele (e sem `medida`), os comprimentos saem do repouso. */
  plano?: (c: number, r: number) => readonly [number, number];
  /**
   * O pano no tamanho de verdade, quando ele é maior do que o lugar onde é posto (uma manga mais
   * comprida que o braço, que por isso fica arriada): os comprimentos saem daqui.
   */
  medida?: (c: number, r: number) => V3;
  /** Os pontos que não existem (um buraco no pano: a cava da manga). */
  existe?: (c: number, r: number) => boolean;
  /** O osso a que o ponto fica preso, se fica. */
  preso: (c: number, r: number) => string | null;
  /** O osso que leva o ponto quando a pose dá um pulo (de onde ele recomeça a cair). */
  guia: (c: number, r: number) => string;
  /** A cor de fora, a de dentro (o forro) e a do enfeite. `pinta` troca a cor de fora de alguns pontos (uma barra). */
  cor: string;
  avesso: string;
  cor2?: string;
  /** O enfeite (um dos de ENFEITE, em roupa.ts), no pano todo ou ponto a ponto. */
  enfeite?: number | ((c: number, r: number) => number);
  pinta?: (c: number, r: number) => string | null;
  /** Vira as faces: o lado de fora passa a ser o outro. */
  inverte?: boolean;
  colisores: DefDeColisor[];
  /** A folga entre o pano e aquilo de que ele desvia (a roupa que há por baixo). */
  folga?: number;
  /** O quanto o pano resiste a dobrar (0 = mole, 1 = duro; acima de 0,5 é pano encorpado, de jaqueta). */
  dureza?: number;
}

/**
 * A mesa, para o pano: a altura do tampo, a espessura (até onde, para baixo, o pano não entra — o
 * corpo está encostado nela: o pano não tem como passar por baixo) e o contorno dela, visto de cima.
 * O contorno é uma beirada reta, em z = `z0` (a mesa fica do lado de z maior), ou um estádio (a mesa
 * de poker: dois semicírculos ligados por retas), dado pelo segmento do meio dele, `a`–`b` (x, z), e
 * pelo raio. Tudo nas coordenadas do personagem.
 */
export type MesaDoPano = { y: number; alto: number } & ({ z0: number } | { estadio: { a: readonly [number, number]; b: readonly [number, number]; raio: number } });

const GRAVIDADE = 9.8;
/** O quanto da velocidade sobra a cada sexagésimo de segundo (o ar e o próprio pano freiam). */
const AMORTECE = 0.9;
/**
 * Em quantos passos miúdos se divide um passo de um sexagésimo de segundo. Um passo mais comprido (um
 * quadro que demorou, um ajudante que atrasou) é dividido em mais passos miúdos, do mesmo tamanho, até
 * o dobro deles: com o passo miúdo maior, os elásticos cediam e a manga comprida ficava mole,
 * balançando como ao vento.
 */
const MIUDOS = 12;
/** O atrito do pano no que ele encosta (o coeficiente de Coulomb). */
const ATRITO = 0.4;
/** A velocidade máxima de um ponto, em metros por segundo (segura um pulo grande demais). */
const VELOCIDADE_MAXIMA = 1.5;
/**
 * O quanto, a cada passo miúdo, a velocidade de um ponto se aproxima da dos vizinhos: o pano freia
 * o próprio tremor (os pontos deixam de ir cada um para um lado) sem deixar de acompanhar o braço.
 */
const FREIO_INTERNO = 0.1;
/** A força dos elásticos de dobrar: os curtos (no máximo) e, num pano encorpado, os longos (alcance e força). */
const DOBRA_CURTA = 0.4;
const DOBRAS_LONGAS: [number, number][] = [[4, 0.3], [6, 0.2]];
/** O raio da quina arredondada da mesa, para o pano. */
const QUINA = 0.008;
/**
 * Abaixo desta velocidade (em metros por segundo) o ponto não guarda embalo: é o que faz o pano
 * sossegar de vez, em vez de ficar tremendo em volta do lugar dele. (Menos do que a gravidade dá
 * num passo miúdo, para o pano parado ainda poder começar a cair.)
 */
const SOSSEGO = 0.0085;
/** O quanto um ponto encostado pode andar num passo miúdo (em metros) e ainda contar como parado. */
const QUIETO = 0.00005;

/**
 * A que distância um ponto (x, z) está para dentro da beirada da mesa (negativo: fora dela), e para
 * que lado fica a beirada (o rumo para fora, na horizontal). Escreve em `saida`: [dentro, nx, nz].
 */
function beirada(mesa: MesaDoPano, x: number, z: number, saida: Float64Array) {
  if ('z0' in mesa) {
    saida[0] = z - mesa.z0;
    saida[1] = 0;
    saida[2] = -1;
    return;
  }
  const { a, b, raio } = mesa.estadio;
  const ex = b[0] - a[0];
  const ez = b[1] - a[1];
  let t = ((x - a[0]) * ex + (z - a[1]) * ez) / (ex * ex + ez * ez || 1);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ux = x - a[0] - ex * t;
  const uz = z - a[1] - ez * t;
  const d = Math.sqrt(ux * ux + uz * uz) || 1e-9;
  saida[0] = raio - d;
  saida[1] = ux / d;
  saida[2] = uz / d;
}

interface Atado {
  i: number;
  osso: THREE.Bone;
  local: THREE.Vector3;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export class Pano {
  readonly nome: string;
  readonly n: number;
  /** Os pontos, para desenhar e para conferir (a conta é feita em `x`, com mais casas). */
  readonly pos: Float32Array;
  private readonly x: Float64Array;
  private readonly antes: Float64Array;
  /** 1 nos pontos que caem; 0 nos presos e nos que não existem. */
  private readonly solto: Uint8Array;
  private readonly vivo: Uint8Array;
  private readonly presos: Atado[] = [];
  private readonly guias: Atado[] = [];
  private readonly ligas: number[] = [];
  private readonly comprimento: number[] = [];
  private readonly forca: number[] = [];
  /** Os elásticos entre vizinhos de dois pontos soltos: é por eles que o pano freia o próprio tremor. */
  private readonly vizinhos: number[] = [];
  private readonly capsulas: { a: { osso: THREE.Bone; local: THREE.Vector3 }; b: { osso: THREE.Bone; local: THREE.Vector3 }; ra: number; rb: number }[] = [];
  private readonly elipsoides: { osso: THREE.Bone; centro: THREE.Vector3; raios: THREE.Vector3 }[] = [];
  private readonly folga: number;
  /** Onde os pontos presos e as pontas das cápsulas estavam no passo anterior (entre um e outro, vão em linha reta). */
  private readonly pinosAntes: Float64Array;
  private readonly pinosAgora: Float64Array;
  private readonly pontasAntes: Float64Array;
  private readonly pontasAgora: Float64Array;
  private semHistoria = true;
  /** As listas dos elásticos em vetores de números, para a conta (feitos no primeiro passo). */
  private rapidas: { ligas: Int32Array; comprimento: Float64Array; forca: Float64Array; vizinhos: Int32Array; presos: Int32Array } | null = null;
  readonly geometria = new THREE.BufferGeometry();
  readonly normais: Float32Array;
  readonly indices: Uint32Array;

  /**
   * `soDesenho`: este pano só é desenhado — quem o simula é outro, num ajudante (panoRemoto.ts). Os
   * elásticos não são montados (é metade do custo de fazer um pano, e a linha principal não os usa).
   */
  constructor(b: Boneco, def: DefDePano, soDesenho = false) {
    const { cols, rows, fechado } = def;
    this.nome = def.nome;
    this.n = cols * rows;
    this.folga = def.folga ?? 0.004;
    this.pos = new Float32Array(this.n * 3);
    this.x = new Float64Array(this.n * 3);
    this.antes = new Float64Array(this.n * 3);
    this.normais = new Float32Array(this.n * 3);
    this.solto = new Uint8Array(this.n);
    this.vivo = new Uint8Array(this.n);
    const i = (c: number, r: number) => r * cols + (((c % cols) + cols) % cols);
    const repousos = new Map<string, THREE.Vector3>();
    const noRepouso = (osso: string) => {
      let p = repousos.get(osso);
      if (!p) repousos.set(osso, (p = new THREE.Vector3(...b.esq.ossos[b.esq.indice[osso]].pos)));
      return p;
    };
    const cores = new Float32Array(this.n * 3);
    const avessos = new Float32Array(this.n * 3);
    const cores2 = new Float32Array(this.n * 3);
    const enfeites = new Float32Array(this.n);
    const avesso = rgb(def.avesso);
    const cor2 = rgb(def.cor2 ?? def.cor);
    // de onde saem os comprimentos dos elásticos: do molde plano, da medida de verdade, ou do repouso
    const molde = new Float64Array(this.n * 3);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = i(c, r);
        const p = def.repouso(c, r);
        this.x.set(p, k * 3);
        if (def.plano) molde.set(def.plano(c, r), k * 3);
        else molde.set(def.medida ? def.medida(c, r) : p, k * 3);
        if (def.existe && !def.existe(c, r)) continue;
        this.vivo[k] = 1;
        const osso = def.preso(c, r);
        if (osso) this.presos.push({ i: k, osso: b.osso(osso), local: new THREE.Vector3(...p).sub(noRepouso(osso)) });
        else this.solto[k] = 1;
        const guia = def.guia(c, r);
        this.guias.push({ i: k, osso: b.osso(guia), local: new THREE.Vector3(...p).sub(noRepouso(guia)) });
        cores.set(rgb(def.pinta?.(c, r) ?? def.cor), k * 3);
        avessos.set(avesso, k * 3);
        cores2.set(cor2, k * 3);
        enfeites[k] = typeof def.enfeite === 'function' ? def.enfeite(c, r) : (def.enfeite ?? 0);
      }
    }
    this.antes.set(this.x);
    this.pos.set(this.x);
    // os elásticos: os vizinhos, as diagonais e os de dois em dois
    const dureza = def.dureza ?? 0.25;
    const liga = (a: number, z: number, forca: number, vizinho = false) => {
      if (!this.vivo[a] || !this.vivo[z]) return;
      this.ligas.push(a, z);
      this.comprimento.push(Math.hypot(molde[a * 3] - molde[z * 3], molde[a * 3 + 1] - molde[z * 3 + 1], molde[a * 3 + 2] - molde[z * 3 + 2]));
      this.forca.push(forca);
      if (vizinho && this.solto[a] && this.solto[z]) this.vizinhos.push(a, z);
    };
    const ultima = fechado ? cols : cols - 1;
    for (let r = 0; r < (soDesenho ? 0 : rows); r++) {
      for (let c = 0; c < cols; c++) {
        if (c < ultima) liga(i(c, r), i(c + 1, r), 1, true);
        if (r + 1 < rows) liga(i(c, r), i(c, r + 1), 1, true);
        if (c < ultima && r + 1 < rows) {
          liga(i(c, r), i(c + 1, r + 1), 0.6);
          liga(i(c + 1, r), i(c, r + 1), 0.6);
        }
        // os elásticos de dobrar, de dois em dois. (Nunca no máximo: o pano que sobra numa manga
        // arriada não tem como obedecer a todos os elásticos ao mesmo tempo, e com eles no máximo
        // fica brigando sem parar.)
        const curta = Math.min(DOBRA_CURTA, dureza);
        if ((fechado || c + 2 < cols) && this.vivo[i(c + 1, r)]) liga(i(c, r), i(c + 2, r), curta);
        if (r + 2 < rows && this.vivo[i(c, r + 1)]) liga(i(c, r), i(c, r + 2), curta);
        // um pano encorpado (uma jaqueta) resiste também a dobras mais abertas: elásticos mais longos,
        // de quatro em quatro e de seis em seis, mais fracos. É o alcance deles, mais do que a força,
        // que deixa o pano rígido: ele só dobra em curvas largas.
        if (dureza > 0.5) {
          for (const [passo, quanto] of DOBRAS_LONGAS) {
            const todos = Array.from({ length: passo - 1 }, (_, k) => k + 1);
            if ((fechado || c + passo < cols) && todos.every((k) => this.vivo[i(c + k, r)])) liga(i(c, r), i(c + passo, r), quanto * dureza);
            if (r + passo < rows && todos.every((k) => this.vivo[i(c, r + k)])) liga(i(c, r), i(c, r + passo), quanto * dureza);
          }
        }
      }
    }
    for (const col of def.colisores) {
      if (col.tipo === 'capsula') {
        this.capsulas.push({
          a: { osso: b.osso(col.ossoA), local: new THREE.Vector3(...col.a).sub(noRepouso(col.ossoA)) },
          b: { osso: b.osso(col.ossoB), local: new THREE.Vector3(...col.b).sub(noRepouso(col.ossoB)) },
          ra: col.ra,
          rb: col.rb,
        });
      } else {
        this.elipsoides.push({ osso: b.osso(col.osso), centro: new THREE.Vector3(...col.centro).sub(noRepouso(col.osso)), raios: new THREE.Vector3(...col.raios) });
      }
    }
    this.pinosAntes = new Float64Array(this.presos.length * 3);
    this.pinosAgora = new Float64Array(this.presos.length * 3);
    this.pontasAntes = new Float64Array(this.capsulas.length * 6);
    this.pontasAgora = new Float64Array(this.capsulas.length * 6);
    // a malha: dois triângulos por quadrado da grade
    const idx: number[] = [];
    for (let r = 0; r + 1 < rows; r++) {
      for (let c = 0; c < ultima; c++) {
        const [p00, p10, p01, p11] = [i(c, r), i(c + 1, r), i(c, r + 1), i(c + 1, r + 1)];
        if (!this.vivo[p00] || !this.vivo[p10] || !this.vivo[p01] || !this.vivo[p11]) continue;
        if (def.inverte) idx.push(p00, p10, p01, p10, p11, p01);
        else idx.push(p00, p01, p10, p10, p01, p11);
      }
    }
    this.indices = new Uint32Array(idx);
    this.geometria.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geometria.setAttribute('normal', new THREE.BufferAttribute(this.normais, 3));
    // (o desenho do enfeite é feito em cima de onde o ponto fica na T-pose)
    this.geometria.setAttribute('repouso', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    this.geometria.setAttribute('cor', new THREE.BufferAttribute(cores, 3));
    this.geometria.setAttribute('avesso', new THREE.BufferAttribute(avessos, 3));
    this.geometria.setAttribute('cor2', new THREE.BufferAttribute(cores2, 3));
    this.geometria.setAttribute('enfeite', new THREE.BufferAttribute(enfeites, 1));
    this.geometria.setAttribute('ar', new THREE.BufferAttribute(new Float32Array(this.n).fill(1), 1));
    this.geometria.setIndex(new THREE.BufferAttribute(this.indices, 1));
    this.geometria.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.2, 0), 3);
    this.atualizar();
  }

  /** Um passo de `dt` segundos, com os ossos como estão agora (as matrizes deles em dia). `mesa`: a mesa, se há. */
  passo(dt: number, mesa: MesaDoPano | null) {
    const { x, antes, solto, folga, n } = this;
    const v = new THREE.Vector3();
    // onde os pontos presos e as cápsulas estão agora; durante o passo, vão de onde estavam até aqui
    this.pinosAntes.set(this.pinosAgora);
    this.pontasAntes.set(this.pontasAgora);
    this.presos.forEach((preso, k) => {
      v.copy(preso.local).applyMatrix4(preso.osso.matrixWorld);
      this.pinosAgora.set([v.x, v.y, v.z], k * 3);
    });
    this.capsulas.forEach((c, k) => {
      v.copy(c.a.local).applyMatrix4(c.a.osso.matrixWorld);
      this.pontasAgora.set([v.x, v.y, v.z], k * 6);
      v.copy(c.b.local).applyMatrix4(c.b.osso.matrixWorld);
      this.pontasAgora.set([v.x, v.y, v.z], k * 6 + 3);
    });
    if (this.semHistoria) {
      this.pinosAntes.set(this.pinosAgora);
      this.pontasAntes.set(this.pontasAgora);
      this.semHistoria = false;
    }
    // os elipsoides: a matriz que leva do mundo para dentro deles, e a de volta
    const nc = this.capsulas.length;
    const ne = this.elipsoides.length;
    const ida = new Float64Array(ne * 12);
    const volta = new Float64Array(ne * 12);
    const meio = new Float64Array(ne * 3);
    const raios = new Float64Array(ne * 3);
    const inversa = new THREE.Matrix4();
    this.elipsoides.forEach((e, k) => {
      const m = e.osso.matrixWorld.elements;
      const im = inversa.copy(e.osso.matrixWorld).invert().elements;
      for (let l = 0; l < 3; l++) for (let c = 0; c < 4; c++) {
        volta[k * 12 + l * 4 + c] = m[c * 4 + l];
        ida[k * 12 + l * 4 + c] = im[c * 4 + l];
      }
      meio.set([e.centro.x, e.centro.y, e.centro.z], k * 3);
      raios.set([e.raios.x + folga, e.raios.y + folga, e.raios.z + folga], k * 3);
    });
    const capa = new Float64Array(nc * 9);
    const borda = new Float64Array(3);
    // só se confere o que está perto do pano neste quadro (o outro braço, quase sempre, não está)
    const caixa = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (let k = 0; k < n; k++) {
      if (!this.vivo[k]) continue;
      for (let e = 0; e < 3; e++) {
        if (x[k * 3 + e] < caixa[e]) caixa[e] = x[k * 3 + e];
        if (x[k * 3 + e] > caixa[e + 3]) caixa[e + 3] = x[k * 3 + e];
      }
    }
    const perto = (lo: number[], hi: number[], raio: number) => lo.every((v, e) => v - raio - 0.03 < caixa[e + 3]) && hi.every((v, e) => v + raio + 0.03 > caixa[e]);
    const capsulasPerto: number[] = [];
    for (let k = 0; k < nc; k++) {
      const pontas = [0, 1, 2].map((e) => [this.pontasAntes[k * 6 + e], this.pontasAntes[k * 6 + 3 + e], this.pontasAgora[k * 6 + e], this.pontasAgora[k * 6 + 3 + e]]);
      if (perto(pontas.map((v) => Math.min(...v)), pontas.map((v) => Math.max(...v)), Math.max(this.capsulas[k].ra, this.capsulas[k].rb) + folga)) capsulasPerto.push(k);
    }
    const elipsoidesPerto: number[] = [];
    this.elipsoides.forEach((e, k) => {
      v.copy(e.centro).applyMatrix4(e.osso.matrixWorld);
      if (perto([v.x, v.y, v.z], [v.x, v.y, v.z], Math.max(e.raios.x, e.raios.y, e.raios.z) + folga)) elipsoidesPerto.push(k);
    });
    const ncp = capsulasPerto.length;
    const nep = elipsoidesPerto.length;

    const miudos = Math.max(6, Math.min(2 * MIUDOS, Math.round(dt * 60 * MIUDOS)));
    const h = dt / miudos;
    const cai = GRAVIDADE * h * h;
    const freio = Math.pow(AMORTECE, (dt * 60) / miudos);
    const limite = VELOCIDADE_MAXIMA * h;
    const sossego = Math.min(SOSSEGO * h, cai * 0.65);
    /** O quanto um ponto encostado pode andar num passo miúdo e ainda contar como parado. */
    const grude = cai * 1.2;
    const rapidas = (this.rapidas ??= {
      ligas: Int32Array.from(this.ligas),
      comprimento: Float64Array.from(this.comprimento),
      forca: Float64Array.from(this.forca),
      vizinhos: Int32Array.from(this.vizinhos),
      presos: Int32Array.from(this.presos, (preso) => preso.i),
    });
    const { ligas, comprimento, forca, vizinhos, presos } = rapidas;
    const nl = comprimento.length;
    const nv = vizinhos.length;
    const np = presos.length;
    const { pinosAntes, pinosAgora, pontasAntes, pontasAgora } = this;
    /** A caixa em volta de cada cápsula neste passo miúdo (com o raio): o ponto que está fora dela nem faz a conta. */
    const caixaDe = new Float64Array(nc * 6);
    for (let miudo = 1; miudo <= miudos; miudo++) {
      const f = miudo / miudos;
      // 0. o freio interno: a velocidade de cada ponto se aproxima da dos vizinhos
      for (let l = 0; l < nv; l += 2) {
        const oa = vizinhos[l] * 3;
        const oz = vizinhos[l + 1] * 3;
        for (let e = 0; e < 3; e++) {
          const dv = (x[oz + e] - antes[oz + e] - (x[oa + e] - antes[oa + e])) * FREIO_INTERNO;
          antes[oa + e] -= dv;
          antes[oz + e] += dv;
        }
      }
      // 1. cada ponto segue com a velocidade que tinha, freada, e cai
      for (let k = 0; k < n; k++) {
        if (!solto[k]) continue;
        const o = k * 3;
        let dx = (x[o] - antes[o]) * freio;
        let dy = (x[o + 1] - antes[o + 1]) * freio;
        let dz = (x[o + 2] - antes[o + 2]) * freio;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > limite * limite) {
          const s = limite / Math.sqrt(d2);
          dx *= s;
          dy *= s;
          dz *= s;
        } else if (d2 < sossego * sossego) {
          dx = 0;
          dy = 0;
          dz = 0;
        }
        antes[o] = x[o];
        antes[o + 1] = x[o + 1];
        antes[o + 2] = x[o + 2];
        x[o] += dx;
        x[o + 1] += dy - cai;
        x[o + 2] += dz;
      }
      // 2. os pontos presos vão para onde o osso deles está neste instante
      for (let k = 0; k < np; k++) {
        const o = presos[k] * 3;
        for (let e = 0; e < 3; e++) x[o + e] = pinosAntes[k * 3 + e] + (pinosAgora[k * 3 + e] - pinosAntes[k * 3 + e]) * f;
      }
      // 3. os elásticos voltam ao comprimento deles
      for (let l = 0; l < nl; l++) {
        const a = ligas[l * 2];
        const z = ligas[l * 2 + 1];
        const pesoA = solto[a];
        const pesoZ = solto[z];
        if (pesoA + pesoZ === 0) continue;
        const oa = a * 3;
        const oz = z * 3;
        const dx = x[oz] - x[oa];
        const dy = x[oz + 1] - x[oa + 1];
        const dz = x[oz + 2] - x[oa + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
        const corrige = (((d - comprimento[l]) / d) * forca[l]) / (pesoA + pesoZ);
        if (pesoA) {
          x[oa] += dx * corrige;
          x[oa + 1] += dy * corrige;
          x[oa + 2] += dz * corrige;
        }
        if (pesoZ) {
          x[oz] -= dx * corrige;
          x[oz + 1] -= dy * corrige;
          x[oz + 2] -= dz * corrige;
        }
      }
      // 4. e nada fica dentro do corpo nem da mesa
      for (let j = 0; j < ncp; j++) {
        const k = capsulasPerto[j];
        const o = k * 6;
        const ax = pontasAntes[o] + (pontasAgora[o] - pontasAntes[o]) * f;
        const ay = pontasAntes[o + 1] + (pontasAgora[o + 1] - pontasAntes[o + 1]) * f;
        const az = pontasAntes[o + 2] + (pontasAgora[o + 2] - pontasAntes[o + 2]) * f;
        const ex = pontasAntes[o + 3] + (pontasAgora[o + 3] - pontasAntes[o + 3]) * f - ax;
        const ey = pontasAntes[o + 4] + (pontasAgora[o + 4] - pontasAntes[o + 4]) * f - ay;
        const ez = pontasAntes[o + 5] + (pontasAgora[o + 5] - pontasAntes[o + 5]) * f - az;
        const ra = this.capsulas[k].ra + folga;
        const rb = this.capsulas[k].rb + folga;
        const q = k * 9;
        capa[q] = ax;
        capa[q + 1] = ay;
        capa[q + 2] = az;
        capa[q + 3] = ex;
        capa[q + 4] = ey;
        capa[q + 5] = ez;
        capa[q + 6] = ex * ex + ey * ey + ez * ez || 1;
        capa[q + 7] = ra;
        capa[q + 8] = rb;
        const r = ra > rb ? ra : rb;
        const c = k * 6;
        caixaDe[c] = (ex < 0 ? ax + ex : ax) - r;
        caixaDe[c + 1] = (ey < 0 ? ay + ey : ay) - r;
        caixaDe[c + 2] = (ez < 0 ? az + ez : az) - r;
        caixaDe[c + 3] = (ex > 0 ? ax + ex : ax) + r;
        caixaDe[c + 4] = (ey > 0 ? ay + ey : ay) + r;
        caixaDe[c + 5] = (ez > 0 ? az + ez : az) + r;
      }
      for (let k = 0; k < n; k++) {
        if (!solto[k]) continue;
        const o = k * 3;
        let px = x[o];
        let py = x[o + 1];
        let pz = x[o + 2];
        for (let j = 0; j < ncp; j++) {
          const c = capsulasPerto[j] * 6;
          if (px < caixaDe[c] || px > caixaDe[c + 3] || py < caixaDe[c + 1] || py > caixaDe[c + 4] || pz < caixaDe[c + 2] || pz > caixaDe[c + 5]) continue;
          const q = capsulasPerto[j] * 9;
          const rx = px - capa[q];
          const ry = py - capa[q + 1];
          const rz = pz - capa[q + 2];
          let t = (rx * capa[q + 3] + ry * capa[q + 4] + rz * capa[q + 5]) / capa[q + 6];
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const raio = capa[q + 7] + (capa[q + 8] - capa[q + 7]) * t;
          const ux = rx - capa[q + 3] * t;
          const uy = ry - capa[q + 4] * t;
          const uz = rz - capa[q + 5] * t;
          const d2 = ux * ux + uy * uy + uz * uz;
          if (d2 >= raio * raio) continue;
          if (d2 < 1e-14) {
            py += raio;
            continue;
          }
          const s = raio / Math.sqrt(d2) - 1;
          px += ux * s;
          py += uy * s;
          pz += uz * s;
        }
        for (let j = 0; j < nep; j++) {
          const e = elipsoidesPerto[j];
          const m = e * 12;
          const ux = (ida[m] * px + ida[m + 1] * py + ida[m + 2] * pz + ida[m + 3] - meio[e * 3]) / raios[e * 3];
          const uy = (ida[m + 4] * px + ida[m + 5] * py + ida[m + 6] * pz + ida[m + 7] - meio[e * 3 + 1]) / raios[e * 3 + 1];
          const uz = (ida[m + 8] * px + ida[m + 9] * py + ida[m + 10] * pz + ida[m + 11] - meio[e * 3 + 2]) / raios[e * 3 + 2];
          const d2 = ux * ux + uy * uy + uz * uz;
          if (d2 >= 1) continue;
          const s = 1 / (Math.sqrt(d2) || 1e-9);
          const lx = ux * s * raios[e * 3] + meio[e * 3];
          const ly = uy * s * raios[e * 3 + 1] + meio[e * 3 + 1];
          const lz = uz * s * raios[e * 3 + 2] + meio[e * 3 + 2];
          px = volta[m] * lx + volta[m + 1] * ly + volta[m + 2] * lz + volta[m + 3];
          py = volta[m + 4] * lx + volta[m + 5] * ly + volta[m + 6] * lz + volta[m + 7];
          pz = volta[m + 8] * lx + volta[m + 9] * ly + volta[m + 10] * lz + volta[m + 11];
        }
        if (mesa && py < mesa.y + folga && py > mesa.y - mesa.alto) {
          // a que profundidade o ponto está, na horizontal, para dentro da beirada (h) e abaixo do
          // tampo (v), contando a folga; e para que lado fica a beirada (nx, nz: para fora)
          beirada(mesa, px, pz, borda);
          let h = borda[0] + folga;
          const topo = mesa.y + folga;
          if (h > 0) {
            // se foi o braço (ou o tronco) que o empurrou para dentro da mesa, o ponto está espremido
            // entre os dois: fica onde estava, assentado no tampo. (Empurrado ora por um, ora pelo
            // outro, ele andaria um pouco de lado a cada passo, e a manga inteira subiria pelo braço.)
            if (px !== x[o] || py !== x[o + 1] || pz !== x[o + 2]) {
              px = x[o];
              py = x[o + 1];
              pz = x[o + 2];
              beirada(mesa, px, pz, borda);
              h = borda[0] + folga;
              if (h > QUINA && py > topo) py = topo;
            }
            // dentro da mesa: sai pelo tampo ou pela beirada, o que estiver mais perto. A quina entre
            // os dois é arredondada: o pano que sobe pela beirada dá a volta nela e entra no tampo sem
            // pulo, e não fica tremendo entre um lado e o outro.
            const v = topo - py;
            if (h > 0 && v > 0) {
              let h2 = h;
              let v2 = v;
              if (v < QUINA && h < QUINA) {
                const d = Math.hypot(QUINA - h, QUINA - v);
                if (d < QUINA && d > 1e-9) {
                  h2 = QUINA - ((QUINA - h) * QUINA) / d;
                  v2 = QUINA - ((QUINA - v) * QUINA) / d;
                }
              } else if (v < QUINA) v2 = 0;
              else if (h < QUINA) h2 = 0;
              else if (h < v) h2 = 0;
              else v2 = 0;
              px -= borda[1] * (h2 - h);
              pz -= borda[2] * (h2 - h);
              py = topo - v2;
            }
          }
        }
        // o empurrão para fora: por onde ele veio é a normal do contato
        const ex = px - x[o];
        const ey = py - x[o + 1];
        const ez = pz - x[o + 2];
        const empurrao = Math.sqrt(ex * ex + ey * ey + ez * ez);
        if (empurrao < 1e-12) continue;
        // encostado e quase sem sair do lugar neste passo miúdo: fica exatamente onde estava. (Numa
        // quina — a beirada da mesa, o vão entre o braço e o tronco — o ponto empurrado ora por um
        // lado, ora por outro ficaria tremendo para sempre.)
        if ((px - antes[o]) ** 2 + (py - antes[o + 1]) ** 2 + (pz - antes[o + 2]) ** 2 < QUIETO * QUIETO) {
          x[o] = antes[o];
          x[o + 1] = antes[o + 1];
          x[o + 2] = antes[o + 2];
          continue;
        }
        x[o] = px;
        x[o + 1] = py;
        x[o + 2] = pz;
        // encostado, o ponto perde a velocidade (o empurrão não vira impulso, e ele não quica). Ao
        // longo da superfície há atrito: se o que ele andou for menos que `ATRITO` vezes o empurrão
        // (e pouco), ele fica onde estava
        const nx = ex / empurrao;
        const ny = ey / empurrao;
        const nz = ez / empurrao;
        let dx = px - antes[o];
        let dy = py - antes[o + 1];
        let dz = pz - antes[o + 2];
        const dn = dx * nx + dy * ny + dz * nz;
        dx -= dn * nx;
        dy -= dn * ny;
        dz -= dn * nz;
        const desliza = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (desliza <= Math.min(ATRITO * empurrao, grude)) {
          // grudado: nem escorrega (volta o pouco que andou ao longo da superfície neste passo miúdo)
          x[o] = antes[o] = px - dx;
          x[o + 1] = antes[o + 1] = py - dy;
          x[o + 2] = antes[o + 2] = pz - dz;
        } else {
          // escorregando (puxado pelos vizinhos, ou numa rampa íngreme): anda, mas sem guardar
          // embalo — com embalo, o pano encostado fica indo e voltando
          antes[o] = px;
          antes[o + 1] = py;
          antes[o + 2] = pz;
        }
      }
    }
    this.pos.set(x);
  }

  /**
   * Recebe os pontos e as normais de quem simulou este pano em outro lugar (um ajudante em segundo
   * plano: veja panoRemoto.ts). Este pano só os desenha.
   */
  receber(pos: Float32Array, normais: Float32Array) {
    this.pos.set(pos);
    this.normais.set(normais);
    this.geometria.getAttribute('position').needsUpdate = true;
    this.geometria.getAttribute('normal').needsUpdate = true;
  }

  /**
   * Leva os pontos presos para onde os ossos deles estão agora. O pano simulado num ajudante chega
   * com um quadro de atraso: o miolo dele não mostra isso, mas a costura (onde ele segura no braço)
   * se soltaria do corpo num gesto rápido.
   */
  repregar() {
    const v = new THREE.Vector3();
    for (const preso of this.presos) {
      v.copy(preso.local).applyMatrix4(preso.osso.matrixWorld);
      this.pos[preso.i * 3] = v.x;
      this.pos[preso.i * 3 + 1] = v.y;
      this.pos[preso.i * 3 + 2] = v.z;
    }
    this.geometria.getAttribute('position').needsUpdate = true;
  }

  /** Põe cada ponto onde o osso-guia dele o levaria, parado: o recomeço depois de um pulo de pose. */
  recolocar() {
    const p = new THREE.Vector3();
    for (const guia of this.guias) {
      p.copy(guia.local).applyMatrix4(guia.osso.matrixWorld);
      this.x[guia.i * 3] = p.x;
      this.x[guia.i * 3 + 1] = p.y;
      this.x[guia.i * 3 + 2] = p.z;
    }
    this.antes.set(this.x);
    this.pos.set(this.x);
    this.semHistoria = true;
  }

  /** Deixa o pano assentar na pose de agora (ao vestir, ou depois de um pulo de pose). */
  assentar(mesa: MesaDoPano | null, passos = 240) {
    for (let k = 0; k < passos; k++) this.passo(1 / 60, mesa);
    // parado, para não sair balançando
    this.antes.set(this.x);
  }

  /**
   * O quanto os elásticos passaram do comprimento deles (1 = o dobro): o pior de todos ou, com
   * `quantil` (0,95, por exemplo), o valor abaixo do qual está essa parte deles.
   */
  esticado(quantil = 1): number {
    const todos: number[] = [];
    for (let l = 0; l < this.comprimento.length; l++) {
      if (this.forca[l] < 1) continue;
      const a = this.ligas[l * 2] * 3;
      const z = this.ligas[l * 2 + 1] * 3;
      if (!this.solto[a / 3] && !this.solto[z / 3]) continue;
      todos.push(Math.hypot(this.x[a] - this.x[z], this.x[a + 1] - this.x[z + 1], this.x[a + 2] - this.x[z + 2]) / this.comprimento[l] - 1);
    }
    todos.sort((p, q) => p - q);
    return todos[Math.min(todos.length - 1, Math.floor(quantil * todos.length))] ?? 0;
  }

  /** Se o ponto existe e cai (para conferir de fora). */
  livre(k: number): boolean {
    return this.solto[k] === 1;
  }

  /** Refaz as normais e avisa a geometria de que os pontos mudaram. */
  atualizar() {
    const { pos, normais, indices } = this;
    normais.fill(0);
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t] * 3;
      const b = indices[t + 1] * 3;
      const c = indices[t + 2] * 3;
      const ux = pos[b] - pos[a];
      const uy = pos[b + 1] - pos[a + 1];
      const uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a];
      const vy = pos[c + 1] - pos[a + 1];
      const vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      for (const k of [a, b, c]) {
        normais[k] += nx;
        normais[k + 1] += ny;
        normais[k + 2] += nz;
      }
    }
    for (let k = 0; k < normais.length; k += 3) {
      const d = Math.hypot(normais[k], normais[k + 1], normais[k + 2]) || 1;
      normais[k] /= d;
      normais[k + 1] /= d;
      normais[k + 2] /= d;
    }
    this.geometria.getAttribute('position').needsUpdate = true;
    this.geometria.getAttribute('normal').needsUpdate = true;
  }
}
