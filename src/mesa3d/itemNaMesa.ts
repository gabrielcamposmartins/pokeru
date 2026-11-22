/**
 * Um acessório apostado, solto em cima da mesa (veja shared/aposta.ts).
 *
 * É a mesma peça que o personagem usa (src/mesa3d/acessorios3d.ts), tirada da mão: a geometria vem
 * pronta para um osso da pose de repouso (o braço esquerdo estendido para o lado), então aqui ela é
 * trazida para a origem e deitada — o anel e a pulseira com o aro para cima, o relógio de pé sobre
 * a correia, com a caixa virada para o alto. Fica maior do que na mão, para se ver do alto da mesa.
 */
import * as THREE from 'three';
import { SEM_ACESSORIOS, findAcessorio, type Acessorios } from '../../shared/acessorios';
import { pecasDosAcessorios } from './acessorios3d';

/** Quanto a peça cresce em cima da mesa (na mão ela tem o tamanho de verdade). */
export const ESCALA_NA_MESA = 1.7;

/** A peça deitada na origem, apoiada no plano y = 0. null: não é anel, pulseira nem relógio. */
export function pecaNaMesa(id: string, escala = ESCALA_NA_MESA): THREE.Group | null {
  const def = findAcessorio(id);
  if (!def || (def.tipo !== 'anel' && def.tipo !== 'pulseira' && def.tipo !== 'relogio')) return null;
  const a: Acessorios = {
    ...SEM_ACESSORIOS,
    aneis: def.tipo === 'anel' ? [{ id, mao: 'E', dedo: 1 }] : [],
    bracos: { E: def.tipo === 'anel' ? [] : [id], D: [] },
  };
  const dentro = new THREE.Group();
  const caixa = new THREE.Box3();
  for (const peca of pecasDosAcessorios(a, 'nenhuma')) {
    for (const pedaco of peca.pedacos) {
      const m = new THREE.Mesh(pedaco.geo, pedaco.mat);
      m.castShadow = !pedaco.semSombra;
      m.frustumCulled = false;
      dentro.add(m);
      pedaco.geo.computeBoundingBox();
      if (pedaco.geo.boundingBox) caixa.union(pedaco.geo.boundingBox);
    }
  }
  if (caixa.isEmpty()) return null;
  dentro.position.copy(caixa.getCenter(new THREE.Vector3())).multiplyScalar(-1);
  const deitada = new THREE.Group();
  deitada.add(dentro);
  // (na pose de repouso o braço vai ao longo de x: é o eixo do aro. Deitado, o eixo fica para cima)
  if (def.tipo !== 'relogio') deitada.rotation.z = Math.PI / 2;
  deitada.scale.setScalar(escala);
  const grupo = new THREE.Group();
  grupo.add(deitada);
  grupo.updateMatrixWorld(true);
  // apoiada na mesa: sobe o que ficou abaixo do plano
  deitada.position.y = -new THREE.Box3().setFromObject(grupo).min.y;
  return grupo;
}

/** Solta a geometria de uma peça que saiu da mesa (os materiais são compartilhados com as das mãos: ficam). */
export function soltarPeca(grupo: THREE.Group): void {
  grupo.removeFromParent();
  grupo.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
}

// ───────────────────────────── o anel solto: um corpo que se joga ─────────────────────────────

/** O anel pronto para a física (src/mesa3d/fisica.ts): o desenho dele centrado, com o eixo do aro em y, e as medidas do disco que o representa. */
export interface PecaSolta {
  grupo: THREE.Group;
  raio: number;
  meia: number;
}

export function anelSolto(id: string, escala = ESCALA_NA_MESA): PecaSolta | null {
  const deitado = pecaNaMesa(id, escala);
  if (!deitado) return null;
  // (a peça deitada está apoiada em y = 0: o centro dela sobe para a origem)
  const caixa = new THREE.Box3().setFromObject(deitado);
  const meia = (caixa.max.y - caixa.min.y) / 2;
  const grupo = new THREE.Group();
  deitado.position.y = -(caixa.max.y + caixa.min.y) / 2;
  deitado.position.x = -(caixa.max.x + caixa.min.x) / 2;
  deitado.position.z = -(caixa.max.z + caixa.min.z) / 2;
  grupo.add(deitado);
  return { grupo, raio: Math.max(caixa.max.x - caixa.min.x, caixa.max.z - caixa.min.z) / 2, meia };
}

// ───────────────────────────── a correia que abre: pulseira e relógio ─────────────────────────────

/**
 * O quanto a correia está aberta em cada situação (a fração da volta que virou vão): fechada no
 * pulso; desabotoada mas ainda nele (as duas metades caem para os lados); pendurada dos dedos de
 * quem a leva; e **deitada** na mesa — quase reta, porque solta ela não fica em pé: o peso a deita, e
 * só sobra a curva que uma correia usada guarda.
 */
export const ABERTURA = { fechada: 0, solta: 0.3, pendurada: 0.52, deitada: 0.8 } as const;
/** Deitada, a pulseira (corrente, contas, couro) fica mais fechada que o relógio: um C largo, de lado na mesa. */
const PULSEIRA_DEITADA = 0.55;

/**
 * Como a peça aberta fica largada na mesa — cada uma sorteia o jeito dela **dentro destas faixas**
 * (ângulos em radianos), para duas nunca ficarem iguais e nenhuma ficar de pé e alinhada:
 *  - `giro`: o comprido dela fica mais para a horizontal da mesa (vista do lugar de quem joga) do
 *    que para a vertical — sai da horizontal até este tanto, para lá ou para cá; e a ponta que fica
 *    para a esquerda é uma ou outra, ao acaso;
 *  - `tomboDoRelogio` / `tomboDaPulseira`: o quanto ela tomba em volta do comprido, para um lado ou
 *    para o outro, ao acaso — o relógio inclinado sobre a correia (a caixa pesa), a pulseira deitada
 *    de lado, quase toda;
 *  - `cai`: um nada caída para uma ponta ou para a outra;
 *  - `desigual`: uma metade da correia desenrola este tanto a mais (ou a menos) que a outra.
 */
export const LARGADA = {
  giro: 0.5,
  tomboDoRelogio: [0.36, 0.66] as readonly [number, number],
  tomboDaPulseira: [Math.PI / 2 - 0.14, Math.PI / 2 - 0.04] as readonly [number, number],
  cai: 0.08,
  desigual: 0.1,
} as const;
const entre = (a: number, b: number): number => a + Math.random() * (b - a);
const umLado = (): number => (Math.random() < 0.5 ? -1 : 1);
/** A mola que leva a correia de uma abertura a outra: dura, com um nada de sobra (ela passa e volta). */
const MOLA = { dura: 150, freia: 14 };
/** Em quantas fatias da volta se mede o lado de dentro da correia. */
const FATIAS = 72;
/** Um pedaço que ocupa menos que isto da volta (rad, para cada lado) é rígido: a caixa do relógio, um fecho, um pingente. */
const RIGIDO_ATE = 0.6;

interface PedacoDaCorreia {
  malha: THREE.Mesh;
  pos0: Float32Array;
  nor0: Float32Array | null;
  /** Rígido: o ângulo e o raio do meio dele (ele vai inteiro com esse ponto da correia). */
  rigido: { t: number; r: number } | null;
  /**
   * Quantos índices da malha são de triângulos que **não** atravessam o fecho (os que atravessam
   * ficam no fim da lista). Com a correia aberta, os que atravessam esticariam de uma ponta à outra,
   * fechando o vão com uma faixa reta por baixo: aí simplesmente não são desenhados.
   */
  semFecho: number;
}

/**
 * Uma pulseira ou um relógio que se **desabotoa**.
 *
 * A peça da mão é um laço fechado em volta do pulso. Aqui ela é um corpo mole, mas bem duro: aberto
 * o fecho (que fica embaixo do pulso, do lado oposto ao da caixa), a correia desenrola um pouco —
 * o laço vira um arco mais aberto, com um vão embaixo — e, quando a peça é pousada, cede um nada
 * sob o próprio peso e volta, como uma mola dura. A forma muda pouco: é uma correia, não um pano.
 *
 * A conta é direta, sem partículas: cada ponto da peça tem o ângulo dele em volta do pulso; abrir
 * uma fração da volta encolhe todos os ângulos nessa proporção e aumenta o raio na mesma medida (o
 * comprimento da correia não muda). O alto do laço — onde fica a caixa do relógio — não sai do
 * lugar. Os pedaços pequenos (a caixa, o mostrador, um fecho) não dobram: vão inteiros com o ponto
 * da correia em que estão presos.
 *
 * O grupo tem a origem no centro do pulso e os eixos da pose de repouso: o braço ao longo de x, o
 * dorso da mão (a caixa do relógio) para +y. Para a mão direita o desenho é espelhado por dentro.
 */
export class Correia {
  readonly grupo = new THREE.Group();
  /** A fração da volta que está aberta agora (0 = fechada, no pulso). */
  abre = 0;
  private vel = 0;
  private alvo = 0;
  private readonly pedacos: PedacoDaCorreia[] = [];
  private readonly raio: number;
  private feita = -1;
  /**
   * O raio do lado de dentro da correia em cada fatia da volta. O pulso não é redondo (é largo e
   * chato), então o laço também não: medindo a grossura de cada ponto a partir deste perfil, e não
   * de um raio só, a correia aberta fica **plana** — o lado de dentro dela inteiro encosta na mesa.
   */
  private readonly dentro = new Float32Array(FATIAS);
  /** Não abre: um aro rígido (a argola), que sai do pulso pela mão. */
  readonly rigida: boolean;
  /** O osso a que a peça se prende na mão (sem o lado). */
  osso = '';
  /** É um relógio (tem a caixa, que pesa e fica por cima); senão, uma pulseira. */
  readonly relogio: boolean;
  /**
   * O jeito de cada peça ao ser largada — sorteado, para duas nunca ficarem iguais: uma metade da
   * correia desenrola um pouco mais que a outra; a peça tomba para um lado; e fica virada um tanto
   * para lá ou para cá de quem a pôs.
   */
  private readonly desigual: number;
  private readonly tomba: number;
  private readonly vira: number;
  private readonly cai: number;

  constructor(
    readonly id: string,
    mao: 'E' | 'D',
    centro: readonly [number, number, number],
    raio: number,
  ) {
    const def = findAcessorio(id);
    this.raio = raio;
    this.rigida = !def || (def.tipo === 'pulseira' && (def.feitio === 'argola' || def.feitio === 'argolas'));
    this.relogio = def?.tipo === 'relogio';
    // (tudo sorteado dentro das faixas de `LARGADA`)
    this.desigual = entre(-LARGADA.desigual, LARGADA.desigual);
    this.tomba = umLado() * entre(...(this.relogio ? LARGADA.tomboDoRelogio : LARGADA.tomboDaPulseira));
    // (o comprido da correia é o eixo z dela: a um quarto de volta, fica na horizontal da mesa)
    this.vira = umLado() * (Math.PI / 2) + entre(-LARGADA.giro, LARGADA.giro);
    this.cai = entre(-LARGADA.cai, LARGADA.cai);
    const dentro = new THREE.Group();
    if (mao === 'D') dentro.scale.x = -1;
    this.grupo.add(dentro);
    if (!def || (def.tipo !== 'pulseira' && def.tipo !== 'relogio')) return;
    const a: Acessorios = { ...SEM_ACESSORIOS, bracos: { E: [id], D: [] } };
    for (const peca of pecasDosAcessorios(a, 'nenhuma')) {
      this.osso = peca.osso;
      for (const ped of peca.pedacos) {
        const geo = ped.geo;
        // (tudo passa a ser medido do centro do pulso)
        geo.translate(-centro[0], -centro[1], -centro[2]);
        const pos = geo.getAttribute('position') as THREE.BufferAttribute;
        const pos0 = new Float32Array(pos.array as Float32Array);
        const nor = geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
        let sen = 0;
        let cos = 0;
        let r = 0;
        for (let i = 0; i < pos.count; i++) {
          const t = Math.atan2(pos0[i * 3 + 2], pos0[i * 3 + 1]);
          sen += Math.sin(t);
          cos += Math.cos(t);
          r += Math.hypot(pos0[i * 3 + 1], pos0[i * 3 + 2]);
        }
        const meio = Math.atan2(sen, cos);
        let largo = 0;
        for (let i = 0; i < pos.count; i++) {
          const t = Math.atan2(pos0[i * 3 + 2], pos0[i * 3 + 1]) - meio;
          largo = Math.max(largo, Math.abs(Math.atan2(Math.sin(t), Math.cos(t))));
        }
        const malha = new THREE.Mesh(geo, ped.mat);
        malha.castShadow = !ped.semSombra;
        malha.frustumCulled = false;
        dentro.add(malha);
        // os triângulos que cruzam o fecho (embaixo do pulso, onde o ângulo salta de +π para −π) vão para o
        // fim da lista: aberta a correia, a malha é desenhada só até eles
        const eRigido = largo < RIGIDO_ATE;
        const indice = geo.index;
        const cantos = indice ? indice.count : pos.count;
        const angulo = (v: number) => Math.atan2(pos0[v * 3 + 2], pos0[v * 3 + 1]);
        const inteiros: number[] = [];
        const cruzam: number[] = [];
        for (let i = 0; i + 2 < cantos; i += 3) {
          const vs = indice ? [indice.getX(i), indice.getX(i + 1), indice.getX(i + 2)] : [i, i + 1, i + 2];
          const ts = vs.map(angulo);
          (!eRigido && Math.max(...ts) > 2 && Math.min(...ts) < -2 ? cruzam : inteiros).push(...vs);
        }
        if (cruzam.length) geo.setIndex([...inteiros, ...cruzam]);
        this.pedacos.push({ malha, pos0, nor0: nor ? new Float32Array(nor.array as Float32Array) : null, rigido: eRigido ? { t: meio, r: r / Math.max(1, pos.count) } : null, semFecho: cruzam.length ? inteiros.length : Infinity });
      }
    }
    // o lado de dentro: em cada fatia, o ponto mais perto do meio do pulso (só da correia, não das peças rígidas)
    this.dentro.fill(Infinity);
    for (const p of this.pedacos) {
      if (p.rigido) continue;
      for (let i = 0; i < p.pos0.length; i += 3) {
        const f = this.fatia(Math.atan2(p.pos0[i + 2], p.pos0[i + 1]));
        this.dentro[f] = Math.min(this.dentro[f], Math.hypot(p.pos0[i + 1], p.pos0[i + 2]));
      }
    }
    // (a fatia sem pontos toma o valor da vizinha; e o perfil é alisado, para não imprimir degraus na correia)
    for (let volta = 0; volta < 2; volta++) for (let f = 0; f < FATIAS * 2; f++) if (!Number.isFinite(this.dentro[f % FATIAS])) this.dentro[f % FATIAS] = this.dentro[(f + FATIAS - 1) % FATIAS];
    for (let f = 0; f < FATIAS; f++) if (!Number.isFinite(this.dentro[f])) this.dentro[f] = raio;
    const cru = new Float32Array(this.dentro);
    for (let f = 0; f < FATIAS; f++) this.dentro[f] = (cru[(f + FATIAS - 1) % FATIAS] + 2 * cru[f] + cru[(f + 1) % FATIAS]) / 4;
    this.deformar();
  }

  private fatia(t: number): number {
    return ((Math.round((t / (Math.PI * 2)) * FATIAS) % FATIAS) + FATIAS) % FATIAS;
  }

  /** O raio do lado de dentro num ângulo da volta (entre as fatias, em linha reta). */
  private raioDeDentro(t: number): number {
    const x = (((t / (Math.PI * 2)) * FATIAS) % FATIAS + FATIAS) % FATIAS;
    const a = Math.floor(x);
    const u = x - a;
    return this.dentro[a % FATIAS] * (1 - u) + this.dentro[(a + 1) % FATIAS] * u;
  }

  private aberturaDe(situacao: keyof typeof ABERTURA): number {
    return situacao === 'deitada' && !this.relogio ? PULSEIRA_DEITADA : ABERTURA[situacao];
  }

  /** A correia vai (com a mola) para a abertura de uma situação: desabotoada, pendurada, deitada, fechada de novo. */
  ir(para: keyof typeof ABERTURA): void {
    if (!this.rigida) this.alvo = this.aberturaDe(para);
  }

  /** Já nessa abertura, parada (a peça que chega pousada: uma reconexão, a mesa aberta no meio da mão). */
  ja(em: keyof typeof ABERTURA): void {
    if (this.rigida) return;
    this.alvo = this.aberturaDe(em);
    this.abre = this.alvo;
    this.vel = 0;
    this.deformar();
  }

  /**
   * Como a peça fica largada na mesa (veja `LARGADA`): o comprido mais para a horizontal da mesa do
   * que para a vertical, tombada para um lado — o relógio inclinado sobre a correia, a pulseira
   * deitada de lado — e um nada caída para uma ponta. Nada disso é de pé e alinhado: ninguém pousa
   * um relógio em posição de sentido.
   */
  largada(): THREE.Quaternion {
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(this.cai, this.vira, this.tomba, 'YZX'));
  }

  /** Com esta orientação e este tamanho, a que altura o ponto mais baixo da peça fica abaixo da origem dela (para encostá-la na mesa). */
  abaixo(orientacao: THREE.Quaternion, escala: number): number {
    const m = new THREE.Matrix4().makeRotationFromQuaternion(orientacao).elements;
    const espelho = this.grupo.children[0]?.scale.x ?? 1;
    let y = Infinity;
    for (const p of this.pedacos) {
      const a = (p.malha.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
      // (um ponto em cada quatro basta: a malha é fina)
      for (let i = 0; i < a.length; i += 12) y = Math.min(y, m[1] * a[i] * espelho + m[5] * a[i + 1] + m[9] * a[i + 2]);
    }
    return Number.isFinite(y) ? -y * escala : 0;
  }

  /** Um tranco (a peça bateu na mesa): as pontas da correia saltam um nada e voltam a deitar. */
  bater(forca = 1): void {
    if (!this.rigida) this.vel -= 0.9 * forca;
  }

  /** Anda a mola. Devolve se a forma mudou. */
  passo(dt: number): boolean {
    if (this.rigida) return false;
    const h = Math.min(dt, 0.033);
    this.vel += (MOLA.dura * (this.alvo - this.abre) - MOLA.freia * this.vel) * h;
    this.abre = Math.min(0.97, Math.max(0, this.abre + this.vel * h));
    if ((this.abre === 0 && this.vel < 0) || (this.abre === 0.97 && this.vel > 0)) this.vel = 0;
    if (Math.abs(this.abre - this.feita) < 0.0006) return false;
    this.deformar();
    return true;
  }

  private deformar(): void {
    const abre = this.abre;
    this.feita = abre;
    // (uma metade desenrola um pouco mais que a outra: é o que tira a peça da simetria de fábrica)
    const kDe = (t0: number) => Math.max(0.03, 1 - abre * (1 + (t0 >= 0 ? this.desigual : -this.desigual)));
    const topo = this.raioDeDentro(0);
    for (const p of this.pedacos) {
      const pos = p.malha.geometry.getAttribute('position') as THREE.BufferAttribute;
      const nor = p.malha.geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
      const out = pos.array as Float32Array;
      const sai = nor ? (nor.array as Float32Array) : null;
      const n = pos.count;
      if (p.rigido) {
        // vai inteiro com o ponto da correia em que está preso: gira com ele e o acompanha
        const t0 = p.rigido.t;
        const k = kDe(t0);
        // (o comprimento da correia é o da volta de raio médio; o alto do laço, pelo lado de dentro, não sai do lugar)
        const R1 = this.raio / k;
        const t1 = t0 * k;
        const d = t1 - t0;
        const c = Math.cos(d);
        const s = Math.sin(d);
        const r0 = p.rigido.r;
        const grossura = r0 - this.raioDeDentro(t0);
        // o ponto de prender, antes e depois
        const y0 = r0 * Math.cos(t0);
        const z0 = r0 * Math.sin(t0);
        const y1 = (R1 + grossura) * Math.cos(t1) - (R1 - topo);
        const z1 = (R1 + grossura) * Math.sin(t1);
        for (let i = 0; i < n; i++) {
          const y = p.pos0[i * 3 + 1] - y0;
          const z = p.pos0[i * 3 + 2] - z0;
          out[i * 3 + 1] = y1 + y * c - z * s;
          out[i * 3 + 2] = z1 + y * s + z * c;
          if (sai && p.nor0) {
            const ny = p.nor0[i * 3 + 1];
            const nz = p.nor0[i * 3 + 2];
            sai[i * 3 + 1] = ny * c - nz * s;
            sai[i * 3 + 2] = ny * s + nz * c;
          }
        }
      } else {
        for (let i = 0; i < n; i++) {
          const y = p.pos0[i * 3 + 1];
          const z = p.pos0[i * 3 + 2];
          const t0 = Math.atan2(z, y);
          const k = kDe(t0);
          const R1 = this.raio / k;
          const t1 = t0 * k;
          const r1 = R1 + Math.hypot(y, z) - this.raioDeDentro(t0);
          out[i * 3 + 1] = r1 * Math.cos(t1) - (R1 - topo);
          out[i * 3 + 2] = r1 * Math.sin(t1);
          if (sai && p.nor0) {
            const d = t1 - t0;
            const c = Math.cos(d);
            const s = Math.sin(d);
            const ny = p.nor0[i * 3 + 1];
            const nz = p.nor0[i * 3 + 2];
            sai[i * 3 + 1] = ny * c - nz * s;
            sai[i * 3 + 2] = ny * s + nz * c;
          }
        }
      }
      // aberta, a correia tem um vão: o que o atravessava deixa de ser desenhado
      p.malha.geometry.setDrawRange(0, abre > 0.012 ? p.semFecho : Infinity);
      pos.needsUpdate = true;
      if (nor) nor.needsUpdate = true;
    }
  }

  soltar(): void {
    soltarPeca(this.grupo);
  }
}
