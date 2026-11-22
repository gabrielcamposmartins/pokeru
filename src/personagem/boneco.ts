/**
 * O boneco: o esqueleto montado em ossos de verdade (three.js), com o que é preciso para posar.
 *
 *  - `dedos`: dobra e abre os dedos de uma mão a partir de 21 números (graus);
 *  - `braco`: dado onde o punho deve ficar e para onde a mão olha, acha o ombro e o cotovelo
 *    (cinemática inversa de dois ossos) e reparte a torção do punho pelo antebraço;
 *  - `resolver` / `apoiar`: acham onde pôr o punho para um ponto da mão (a pinça, a ponta de um
 *    dedo, a palma) cair num lugar dado, ou para a mão descansar em cima da mesa;
 *  - `folga`: o quanto falta para a mão encostar na mesa (negativo = entrou nela).
 *
 * Tudo é pensado para a mão esquerda (lado E, x > 0) e espelhado para a direita.
 */
import * as THREE from 'three';
import { juntas } from './corpo';
import { LADOS, NOMES_DOS_DEDOS, type Esqueleto, type Lado } from './esqueleto';

/** A altura do tampo da mesa. O personagem fica de pé atrás dela (da cintura para cima é o mesmo que sentado). */
export const MESA = 1.14;

const RAD = Math.PI / 180;
const EIXO_X = new THREE.Vector3(1, 0, 0);
const EIXO_Y = new THREE.Vector3(0, 1, 0);

/** Para onde o cotovelo prefere apontar (mão esquerda): para fora, para baixo e um pouco para trás. */
export const COTOVELO_PARA = new THREE.Vector3(0.75, -0.55, -0.35).normalize();
/** Quanto da torção do punho o antebraço acompanha. */
const TORCAO_NO_ANTEBRACO = 0.75;

/**
 * Os 21 números dos dedos de uma mão, em graus: para cada um dos quatro dedos (indicador, médio,
 * anelar, mínimo) a dobra das três juntas, da raiz à ponta; depois o quanto cada um abre para o
 * lado do polegar; e por fim o polegar: opõe (vai para baixo da palma), fecha (encosta no
 * indicador) e a dobra das três juntas.
 */
export type Dedos = number[];

export type Ancora = 'punho' | 'palma' | 'costas' | 'nos' | 'ponta_i' | 'ponta_m' | 'ponta_p' | 'pinca' | 'pinca3' | 'dedos';

interface Preso {
  osso: THREE.Bone;
  local: THREE.Vector3;
}
interface Esfera extends Preso {
  raio: number;
}

const espelhar = (q: THREE.Quaternion) => q.set(q.x, -q.y, -q.z, q.w);

export class Boneco {
  readonly ossos: THREE.Bone[];
  readonly raiz: THREE.Bone;
  private readonly porNome = new Map<string, THREE.Bone>();
  private readonly repouso = new Map<THREE.Bone, THREE.Vector3>();
  /** O eixo em que cada dedo dobra e o eixo em que abre (os quatro dedos e o polegar), na mão esquerda. */
  private readonly dobra: THREE.Vector3[] = [];
  private readonly abre: THREE.Vector3[] = [];
  private readonly polpas: Record<Lado, Preso[]> = { E: [], D: [] };
  private readonly presos: Record<Lado, Record<string, Preso>> = { E: {}, D: {} };
  private readonly esferas: Record<Lado, Esfera[]> = { E: [], D: [] };
  private readonly braco1: number;
  private readonly braco2: number;
  /**
   * Na T-pose os dois ossos do braço não ficam exatamente ao longo de x: estas rotações desfazem
   * essa diferença (levam o osso em repouso para o eixo x, com a dobradiça do cotovelo em y).
   */
  private readonly acerto1: THREE.Quaternion;
  private readonly acerto2: THREE.Quaternion;
  /** O quanto faltou para o punho chegar aonde foi pedido, na última vez (o braço tem um alcance). */
  readonly faltou: Record<Lado, number> = { E: 0, D: 0 };

  constructor(readonly esq: Esqueleto) {
    this.ossos = esq.ossos.map((o) => {
      const b = new THREE.Bone();
      b.name = o.nome;
      return b;
    });
    esq.ossos.forEach((o, i) => {
      const b = this.ossos[i];
      const pai = o.pai >= 0 ? esq.ossos[o.pai] : null;
      b.position.set(o.pos[0] - (pai?.pos[0] ?? 0), o.pos[1] - (pai?.pos[1] ?? 0), o.pos[2] - (pai?.pos[2] ?? 0));
      if (pai) this.ossos[o.pai].add(b);
      this.porNome.set(o.nome, b);
      this.repouso.set(b, new THREE.Vector3(...o.pos));
    });
    this.raiz = this.ossos[0];
    this.raiz.updateMatrixWorld(true);

    const J = juntas();
    this.braco1 = Math.hypot(J.cotovelo[0] - J.ombro[0], J.cotovelo[1] - J.ombro[1], J.cotovelo[2] - J.ombro[2]);
    this.braco2 = Math.hypot(J.punho[0] - J.cotovelo[0], J.punho[1] - J.cotovelo[1], J.punho[2] - J.cotovelo[2]);
    const acerto = (de: readonly number[], ate: readonly number[]) => {
      const x = new THREE.Vector3(ate[0] - de[0], ate[1] - de[1], ate[2] - de[2]).normalize();
      const y = new THREE.Vector3(0, 1, 0).addScaledVector(x, -x.y).normalize();
      return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, x.clone().cross(y))).invert();
    };
    this.acerto1 = acerto(J.ombro, J.cotovelo);
    this.acerto2 = acerto(J.cotovelo, J.punho);

    const vetor = (p: readonly number[]) => new THREE.Vector3(p[0], p[1], p[2]);
    /** O dorso de verdade de um dedo: a direção pedida, sem a parte que acompanha o dedo. */
    const aprumar = (rumo: THREE.Vector3, cima: THREE.Vector3) => cima.clone().addScaledVector(rumo, -rumo.dot(cima)).normalize();
    const cadeias = [...J.dedos.map((d) => ({ ...d, dorso: [0, 1, 0] as readonly number[] })), { ...J.polegar, grossura: 1.25 }];
    for (const c of cadeias) {
      const rumo = vetor(c.rumo);
      const dorso = aprumar(rumo, vetor(c.dorso));
      // dobrar leva o dedo para o lado da palma; abrir leva para o lado do polegar
      this.dobra.push(dorso.clone().cross(rumo).normalize());
      this.abre.push(dorso.clone().negate());
    }

    for (const lado of LADOS) {
      const s = lado === 'E' ? 1 : -1;
      /** Um ponto dado na T-pose da mão esquerda, preso a um osso deste lado. */
      const prender = (osso: string, p: THREE.Vector3): Preso => {
        const b = this.osso(`${osso}.${lado}`);
        return { osso: b, local: new THREE.Vector3(p.x * s, p.y, p.z).sub(this.repouso.get(b)!) };
      };
      const esfera = (osso: string, p: THREE.Vector3, raio: number) => this.esferas[lado].push({ ...prender(osso, p), raio });
      const nomes = [...NOMES_DOS_DEDOS, 'polegar'];
      cadeias.forEach((c, k) => {
        const raiz = vetor(c.raiz);
        const rumo = vetor(c.rumo);
        const dorso = aprumar(rumo, vetor(c.dorso));
        const g = c.grossura;
        const em = (dist: number) => raiz.clone().addScaledVector(rumo, dist);
        // a polpa: o lado de baixo da ponta do dedo
        this.polpas[lado].push(prender(`${nomes[k]}3`, em(c.ponta - 0.005).addScaledVector(dorso, -0.0034 * g)));
        esfera(`${nomes[k]}3`, em(c.ponta - 0.0042 * g), 0.0042 * g);
        esfera(`${nomes[k]}3`, em(c.j2), 0.0057 * g);
        esfera(`${nomes[k]}2`, em(c.j1), 0.0067 * g);
        if (k < 4) esfera(`${nomes[k]}1`, em(0), 0.0092);
      });
      const naMao = (x: number, y: number, z: number) => vetor(J.naMao(x, y, z));
      this.presos[lado] = {
        punho: prender('mao', naMao(0, 0, 0)),
        palma: prender('mao', naMao(0.055, -0.0125, 0)),
        costas: prender('mao', naMao(0.05, 0.011, 0)),
        nos: prender('medio2', vetor(J.dedos[1].raiz).addScaledVector(vetor(J.dedos[1].rumo), J.dedos[1].j1)),
      };
      // o que encosta na mesa além dos dedos: o punho, as duas almofadas e a beirada do lado do mínimo
      esfera('mao', naMao(0, 0, 0.008), 0.0155);
      esfera('mao', naMao(0, 0, -0.008), 0.0155);
      esfera('mao', naMao(0.036, -0.0098, 0.0215), 0.0105);
      esfera('mao', naMao(0.036, -0.0075, -0.022), 0.0088);
      esfera('mao', naMao(0.06, 0, -0.028), 0.0085);
      // o miolo da mão, entre o punho e os nós (o dorso e a palma)
      esfera('mao', naMao(0.025, 0, 0), 0.0135);
      esfera('mao', naMao(0.05, 0, 0.014), 0.0112);
      esfera('mao', naMao(0.05, 0, -0.012), 0.0108);
      esfera('mao', naMao(0.078, 0, 0.004), 0.0105);
    }
  }

  osso(nome: string): THREE.Bone {
    const b = this.porNome.get(nome);
    if (!b) throw new Error(`osso desconhecido: ${nome}`);
    return b;
  }

  /** Volta à T-pose. */
  zerar() {
    for (const b of this.ossos) b.quaternion.identity();
  }

  private mundo(p: Preso, out = new THREE.Vector3()) {
    return out.copy(p.local).applyMatrix4(p.osso.matrixWorld);
  }

  /** Onde está, no mundo, um ponto da mão (com os ossos já atualizados). */
  ancora(lado: Lado, qual: Ancora): THREE.Vector3 {
    const polpa = (k: number) => this.mundo(this.polpas[lado][k]);
    switch (qual) {
      case 'ponta_i':
        return polpa(0);
      case 'ponta_m':
        return polpa(1);
      case 'ponta_p':
        return polpa(4);
      case 'pinca':
        return polpa(4).add(polpa(0)).multiplyScalar(0.5);
      case 'pinca3':
        return polpa(4).add(polpa(0).add(polpa(1)).multiplyScalar(0.5)).multiplyScalar(0.5);
      case 'dedos':
        return polpa(0).add(polpa(1)).add(polpa(2)).add(polpa(3)).multiplyScalar(0.25);
      default:
        return this.mundo(this.presos[lado][qual]);
    }
  }

  /** Onde está uma junta de um dedo (0 = indicador … 3 = mínimo, 4 = polegar; junta 1 a 3, da raiz à ponta). */
  junta(lado: Lado, dedo: number, qual: 1 | 2 | 3): THREE.Vector3 {
    const nome = dedo === 4 ? 'polegar' : NOMES_DOS_DEDOS[dedo];
    return new THREE.Vector3().setFromMatrixPosition(this.osso(`${nome}${qual}.${lado}`).matrixWorld);
  }

  /** Dobra e abre os dedos de uma mão. */
  dedos(lado: Lado, f: Dedos) {
    const q = new THREE.Quaternion();
    const r = new THREE.Quaternion();
    const poe = (nome: string, valor: THREE.Quaternion) => {
      const b = this.osso(`${nome}.${lado}`);
      b.quaternion.copy(valor);
      if (lado === 'D') espelhar(b.quaternion);
    };
    for (let k = 0; k < 4; k++) {
      const nome = NOMES_DOS_DEDOS[k];
      q.setFromAxisAngle(this.abre[k], f[12 + k] * RAD).multiply(r.setFromAxisAngle(this.dobra[k], f[k * 3] * RAD));
      poe(`${nome}1`, q);
      poe(`${nome}2`, q.setFromAxisAngle(this.dobra[k], f[k * 3 + 1] * RAD));
      poe(`${nome}3`, q.setFromAxisAngle(this.dobra[k], f[k * 3 + 2] * RAD));
    }
    // o polegar: opõe em volta do comprimento da mão, fecha em volta do dorso, e dobra
    q.setFromAxisAngle(EIXO_X, f[16] * RAD)
      .multiply(r.setFromAxisAngle(EIXO_Y, f[17] * RAD))
      .multiply(r.setFromAxisAngle(this.dobra[4], f[18] * RAD));
    poe('polegar1', q);
    poe('polegar2', q.setFromAxisAngle(this.dobra[4], f[19] * RAD));
    poe('polegar3', q.setFromAxisAngle(this.dobra[4], f[20] * RAD));
  }

  /**
   * Só o polegar: os cinco ângulos dele (os últimos de `dedos`), com as matrizes dele já em dia — o
   * resto da mão fica como está. É para quem procura um jeito do polegar por tentativas (milhares
   * delas): reposar a mão inteira a cada uma custava segundos.
   */
  polegar(lado: Lado, a: readonly number[]) {
    const q = new THREE.Quaternion();
    const r = new THREE.Quaternion();
    const ossos = (this.doPolegar[lado] ??= [this.osso(`polegar1.${lado}`), this.osso(`polegar2.${lado}`), this.osso(`polegar3.${lado}`)]);
    const poe = (b: THREE.Bone, valor: THREE.Quaternion) => {
      b.quaternion.copy(valor);
      if (lado === 'D') espelhar(b.quaternion);
    };
    q.setFromAxisAngle(EIXO_X, a[0] * RAD)
      .multiply(r.setFromAxisAngle(EIXO_Y, a[1] * RAD))
      .multiply(r.setFromAxisAngle(this.dobra[4], a[2] * RAD));
    poe(ossos[0], q);
    poe(ossos[1], q.setFromAxisAngle(this.dobra[4], a[3] * RAD));
    poe(ossos[2], q.setFromAxisAngle(this.dobra[4], a[4] * RAD));
    ossos[0].updateWorldMatrix(false, true);
  }
  private readonly doPolegar: Partial<Record<Lado, THREE.Bone[]>> = {};

  /**
   * A rotação da mão no mundo, dado para onde os dedos apontam e para onde a palma olha (a palma é
   * acertada para ficar a 90° dos dedos).
   */
  orientar(lado: Lado, dedos: THREE.Vector3, palma: THREE.Vector3, out = new THREE.Quaternion()): THREE.Quaternion {
    const s = lado === 'E' ? 1 : -1;
    const x = new THREE.Vector3(dedos.x * s, dedos.y, dedos.z).normalize();
    const p = new THREE.Vector3(palma.x * s, palma.y, palma.z);
    const y = p.addScaledVector(x, -x.dot(p)).normalize().negate();
    const z = x.clone().cross(y);
    out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    return lado === 'D' ? espelhar(out) : out;
  }

  /**
   * Põe o punho em `punho` com a mão na rotação `mao` (as duas no mundo). O corpo já tem de estar
   * posado e atualizado; os ossos do braço saem atualizados. `cotovelo` diz para onde o cotovelo
   * prefere apontar (como se fosse o braço esquerdo; para o direito é espelhado); sem ele, vai para
   * fora, para baixo e um pouco para trás.
   */
  braco(lado: Lado, punho: THREE.Vector3, mao: THREE.Quaternion, cotovelo: THREE.Vector3 = COTOVELO_PARA) {
    const s = lado === 'E' ? 1 : -1;
    const ombro = this.osso(`braco.${lado}`);
    const antebraco = this.osso(`antebraco.${lado}`);
    const pai = ombro.parent!;
    // daqui em diante, tudo do lado esquerdo: o lado direito é resolvido no espelho
    const S = new THREE.Vector3().copy(ombro.position).applyMatrix4(pai.matrixWorld);
    S.x *= s;
    const W = new THREE.Vector3(punho.x * s, punho.y, punho.z);
    const n = W.clone().sub(S);
    const alcance = (this.braco1 + this.braco2) * 0.997;
    const pedido = n.length();
    const dist = Math.min(alcance, Math.max(pedido, Math.abs(this.braco1 - this.braco2) + 0.01));
    this.faltou[lado] = Math.abs(pedido - dist);
    n.normalize();
    W.copy(S).addScaledVector(n, dist);
    // o cotovelo: no círculo em volta da linha ombro–punho, do lado para onde ele prefere apontar
    const lado1 = (this.braco1 * this.braco1 - this.braco2 * this.braco2 + dist * dist) / (2 * dist);
    const alto = Math.sqrt(Math.max(0, this.braco1 * this.braco1 - lado1 * lado1));
    const fora = cotovelo.clone().addScaledVector(n, -n.dot(cotovelo)).normalize();
    const E = S.clone().addScaledVector(n, lado1).addScaledVector(fora, alto);
    // os dois ossos: x ao longo do osso, y no eixo da dobradiça do cotovelo
    const dobradica = n.clone().cross(fora).normalize();
    const x1 = E.clone().sub(S).normalize();
    const q1 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x1, dobradica, x1.clone().cross(dobradica))).multiply(this.acerto1);
    const x2 = W.clone().sub(E).normalize();
    const q2 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x2, dobradica, x2.clone().cross(dobradica))).multiply(this.acerto2);
    // a torção da mão em volta do antebraço, que o antebraço acompanha em parte
    const qm = mao.clone();
    if (lado === 'D') espelhar(qm);
    const rel = q2.clone().invert().multiply(qm);
    let torcao = 2 * Math.atan2(rel.x, rel.w);
    if (torcao > Math.PI) torcao -= 2 * Math.PI;
    if (torcao < -Math.PI) torcao += 2 * Math.PI;
    const giro = new THREE.Quaternion().setFromAxisAngle(EIXO_X, torcao * TORCAO_NO_ANTEBRACO);
    if (lado === 'D') {
      espelhar(q1);
      espelhar(q2);
      espelhar(giro);
    }
    const doPai = new THREE.Quaternion().setFromRotationMatrix(pai.matrixWorld);
    ombro.quaternion.copy(doPai.invert()).multiply(q1);
    antebraco.quaternion.copy(q1).invert().multiply(q2);
    this.osso(`giro.${lado}`).quaternion.copy(giro);
    this.osso(`mao.${lado}`).quaternion.copy(q2).invert().multiply(mao);
    ombro.updateWorldMatrix(false, true);
  }

  /** O quanto falta para a mão encostar na mesa (negativo = está dentro dela). */
  folga(lado: Lado): number {
    const p = new THREE.Vector3();
    let menor = Infinity;
    for (const e of this.esferas[lado]) menor = Math.min(menor, this.mundo(e, p).y - e.raio - MESA);
    return menor;
  }

  /** As esferas que fazem as vezes da mão quando se confere se ela encosta em alguma coisa (no mundo). */
  esferasNoMundo(lado: Lado): { p: THREE.Vector3; r: number }[] {
    return this.esferas[lado].map((e) => ({ p: this.mundo(e), r: e.raio }));
  }

  /** Um ponto da mão visto de dentro dela (do osso da mão), com os dedos em `f`. */
  private vistoDaMao(lado: Lado, f: Dedos, pontos: () => THREE.Vector3[]): THREE.Vector3[] {
    this.dedos(lado, f);
    const mao = this.osso(`mao.${lado}`);
    mao.updateWorldMatrix(true, true);
    return pontos().map((p) => mao.worldToLocal(p));
  }

  /** Onde pôr o punho para que a âncora `qual` caia em `em`, com a mão nessa rotação e os dedos em `f`. */
  resolver(lado: Lado, qual: Ancora, em: THREE.Vector3, mao: THREE.Quaternion, f: Dedos): THREE.Vector3 {
    const [local] = this.vistoDaMao(lado, f, () => [this.ancora(lado, qual)]);
    return em.clone().sub(local.applyQuaternion(mao));
  }

  /** Onde pôr o punho, em cima do ponto (x, z) da mesa, para a mão descansar encostada nela. */
  apoiar(lado: Lado, x: number, z: number, mao: THREE.Quaternion, f: Dedos): THREE.Vector3 {
    const es = this.esferas[lado];
    const locais = this.vistoDaMao(lado, f, () => es.map((e) => this.mundo(e)));
    let fundo = Infinity;
    locais.forEach((p, i) => (fundo = Math.min(fundo, p.applyQuaternion(mao).y - es[i].raio)));
    return new THREE.Vector3(x, MESA - fundo, z);
  }
}
