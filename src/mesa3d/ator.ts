/**
 * Um personagem sentado à mesa 3D: o corpo e a roupa (as malhas que vieram dos ajudantes, em
 * src/mesa3d/modelos.ts), o esqueleto que os move, o pano solto do traje e o que ele está fazendo
 * com as mãos agora.
 *
 * As mãos tocam os clipes de src/personagem/animacoes.ts. Um gesto (colocar fichas, bater na mesa,
 * olhar as cartas, entregar) começa saindo da pose em que as mãos estavam — a passagem de
 * `entrePoses`, um arco curto —, e quando acaba as mãos voltam ao descanso de cada um. O descanso é
 * o mesmo clipe sempre para o mesmo assento (cada personagem descansa de um jeito), em laço.
 *
 * O pano (mangas largas, jaqueta, casaco) é simulado só enquanto o personagem mexe as mãos e um
 * pouco depois, até assentar; parado, ele deixa de ser simulado. A conta é feita fora da linha
 * principal, num ajudante por personagem (src/personagem/panoRemoto.ts), a cada quadro; sem ajudante
 * (um navegador sem Web Worker), é feita aqui, um personagem por vez: veja `precisaDePano`.
 */
import * as THREE from 'three';
import { descansoDe, entrePoses, entreRelaxos, poseDe, posarPose, relaxar, relaxoAoAcaso, type Clipe, type EstadoDaMao, type Objeto, type Pose, type Relaxo } from '../personagem/animacoes';
import type { Lado } from '../personagem/esqueleto';
import { Boneco, MESA } from '../personagem/boneco';
import { juntas } from '../personagem/corpo';
import { Pano, type MesaDoPano } from '../personagem/pano';
import { PanosRemotos, podeSimularFora } from '../personagem/panoRemoto';
import { TRAJES, trajeTemLuva, type Roupa, type Traje } from '../personagem/roupa';
import { SEM_ACESSORIOS, chaveDosAcessorios, findAcessorio, type Acessorios } from '../../shared/acessorios';
import { ESPELHO, pecasDosAcessorios } from './acessorios3d';
import { cor, criarPele, criarTecido, criarTraco } from '../dev/materiais';
import { getTimeScale } from '../anim/tween';
import { ehDoBaralho, esqueletoDoJogo } from './clipes';
import { MEIO, RAIO, type Lugar } from './geometria';
import type { Corpo } from './modelos';
import { trajeDe } from './modelos';
import { sombraDosBracos } from './sombras';
import { hash01, sorteador } from '../util/rand';

/** Os descansos, um por assento (para a mesa não descansar em coro): o de cada um é o mesmo em todas as telas. */
export const DESCANSOS = ['idle-plana', 'idle-concha', 'idle-sobrepostas', 'idle-batucando', 'idle-plana', 'idle-concha'];
/** De quantos em quantos segundos o relaxo dos dedos de cada mão muda (veja `Ator.semente`). */
const RELAXO_S = 12;
/** Quanto dura a passagem de uma pose para a outra (segundos). */
const PASSAGEM = 0.32;
/** Quantos passos o pano continua simulado depois que as mãos param (para assentar). */
const ASSENTAR = 18;
/** O mesmo, com o pano num ajudante (aí é um passo por quadro: uns três quartos de segundo). */
const ASSENTAR_FORA = 45;
/** Quantos passos de 1/60 s o pano dá para assentar na primeira pose. */
const PASSOS_PARA_ASSENTAR = 48;

/** A altura (na T-pose) acima da qual fica a cabeça: é o que `uSemCabeca` deixa de desenhar. */
const ALTURA_DO_PESCOCO = 1.5;

/** A geometria do corpo, dividida por todos os personagens (os vértices e os pesos são os mesmos). */
const comuns = new WeakMap<Corpo, Record<string, THREE.BufferAttribute>>();
function atributosDoCorpo(c: Corpo): Record<string, THREE.BufferAttribute> {
  let a = comuns.get(c);
  if (!a) {
    const { malha, pesos } = c;
    a = {
      position: new THREE.BufferAttribute(malha.pos, 3),
      normal: new THREE.BufferAttribute(malha.nor, 3),
      ar: new THREE.BufferAttribute(malha.ar, 1),
      unha: new THREE.BufferAttribute(malha.unha, 1),
      aoLongoDaUnha: new THREE.BufferAttribute(aoLongoDasUnhas(malha), 1),
      rosado: new THREE.BufferAttribute(pesos.rosado, 1),
      skinIndex: new THREE.BufferAttribute(pesos.indices, 4),
      skinWeight: new THREE.BufferAttribute(pesos.pesos, 4),
    };
    comuns.set(c, a);
  }
  return a;
}

/**
 * Para cada vértice de unha, onde ele fica ao longo dela: 0 na raiz, 1 na ponta. É o que deixa o
 * esmalte pintar só a ponta (a francesinha) ou mudar de cor da raiz à ponta (o degradê). Cada
 * vértice é da unha do dedo de cujo eixo está mais perto (na pose de repouso, em que a malha é dada),
 * e a medida de cada unha vai do vértice mais recuado ao mais avançado dela.
 */
function aoLongoDasUnhas(malha: Corpo['malha']): Float32Array {
  const J = juntas();
  const dedos = [...J.dedos, J.polegar].map((d) => ({ raiz: d.raiz, rumo: d.rumo }));
  const n = malha.unha.length;
  const out = new Float32Array(n);
  const deQuem = new Int8Array(n).fill(-1);
  const faixa = Array.from({ length: 10 }, () => [Infinity, -Infinity]);
  for (let v = 0; v < n; v++) {
    if (malha.unha[v] < 0.5) continue;
    const x = malha.pos[v * 3];
    const p = [Math.abs(x), malha.pos[v * 3 + 1], malha.pos[v * 3 + 2]];
    let perto = Infinity;
    dedos.forEach((d, k) => {
      const r = [p[0] - d.raiz[0], p[1] - d.raiz[1], p[2] - d.raiz[2]];
      const s = r[0] * d.rumo[0] + r[1] * d.rumo[1] + r[2] * d.rumo[2];
      const fora = Math.hypot(r[0] - d.rumo[0] * s, r[1] - d.rumo[1] * s, r[2] - d.rumo[2] * s);
      if (fora < perto) {
        perto = fora;
        deQuem[v] = k + (x < 0 ? 5 : 0);
        out[v] = s;
      }
    });
    const f = faixa[deQuem[v]];
    f[0] = Math.min(f[0], out[v]);
    f[1] = Math.max(f[1], out[v]);
  }
  for (let v = 0; v < n; v++) {
    if (deQuem[v] < 0) continue;
    const [de, ate] = faixa[deQuem[v]];
    out[v] = ate > de ? (out[v] - de) / (ate - de) : 0;
  }
  return out;
}

interface Tocando {
  clipe: Clipe;
  t: number;
  vel: number;
  laco: boolean;
  /** Avisado a cada quadro com o instante do clipe (e quando ele acaba ou é interrompido). */
  aoAndar?: (t: number, objs: Objeto[], fim: boolean) => void;
}

export class Ator {
  readonly grupo = new THREE.Group();
  readonly boneco: Boneco;
  readonly traje: Traje;
  /** O id do personagem (o do jogo), para saber se o assento trocou de gente. */
  readonly personagem: string;
  private readonly pele: THREE.ShaderMaterial;
  private readonly tecido: THREE.ShaderMaterial;
  /** O traço do desenho (o contorno), do corpo e da roupa. */
  private readonly traco: THREE.ShaderMaterial;
  private readonly panos: { pano: Pano }[] = [];
  /** Quem simula o pano fora da linha principal (null: sem pano, ou sem ajudante). */
  private remoto: PanosRemotos | null = null;
  private pediuAssentar = false;
  private mesaDoPano: MesaDoPano = { y: MESA, alto: 0.6, z0: 0.08 };
  private tocando: Tocando | null = null;
  private descanso: Clipe | null = null;
  /** Onde cada mão fica no descanso de agora (é em volta dali que os dedos relaxam). */
  private repousoDeAgora: Record<Lado, EstadoDaMao> | null = null;
  private passagem: { de: Pose; u: number } | null = null;
  private pose: Pose | null = null;
  /** Passos do pano desde que as mãos pararam. */
  private semMexer = 0;
  /** Há quanto tempo (s) o pano não dá um passo. */
  private semPano = 0;
  /** Quantos passos do assentamento da primeira pose o pano já deu (é feito aos poucos, depois de montar). */
  private assentados = 0;
  /**
   * O relaxo dos dedos de cada mão no descanso: um jeito tirado ao acaso (cada personagem, cada mão
   * tem o seu), que de tempos em tempos muda devagar para outro — a mão parada não fica sempre igual,
   * nem de dedos esticados.
   */
  private relaxos: Record<Lado, { de: Relaxo; para: Relaxo; u: number; janela: number; repouso: EstadoDaMao }> | null = null;
  /**
   * A semente do acaso deste personagem (a sala e o assento: veja a cena). O relaxo dos dedos sai dela
   * e do relógio, e não de `Math.random`: assim cada mão relaxa do mesmo jeito, na mesma hora, em
   * todas as telas da mesa.
   */
  semente = 0;
  /**
   * Com o baralho na mão (quem dá as cartas, da hora em que o pega até pousá-lo): a esquerda fica
   * como o segura em qualquer gesto que não seja do próprio baralho — apostar, bater na mesa,
   * descansar —, e o baralho vai dentro dela.
   */
  private segurando: { mao: EstadoDaMao; baralho: (b: Boneco) => Objeto } | null = null;
  /** O descanso de sempre, guardado enquanto ele segura o baralho (aí descansa de mãos separadas). */
  private descansoDeSempre: Clipe | null = null;
  /** As fichas e cartas que o clipe atual mostra (no espaço do personagem). */
  objetos: Objeto[] = [];
  /** Os acessórios que ele usa (a chave deles: muda quando o jogador troca alguma coisa). */
  enfeites: string;
  /** As peças dos acessórios (anéis, pulseira, relógio): cada uma vai com um osso. */
  private presas: { malha: THREE.Mesh; osso: THREE.Bone; inversa: THREE.Matrix4 }[] = [];
  /** O que ele veste nas mãos agora, e as inversas dos ossos na pose de repouso (para prender as peças). */
  private acessorios: Acessorios;
  private inversasDosOssos: THREE.Matrix4[] = [];
  /** As posições da roupa na pose de repouso: é por cima delas que as pulseiras sobem o braço. */
  private readonly posDaRoupa: Float32Array;

  constructor(personagem: string, corpo: Corpo, roupa: Roupa, acessorios: Acessorios = SEM_ACESSORIOS) {
    this.personagem = personagem;
    this.acessorios = acessorios;
    this.posDaRoupa = roupa.malha.pos;
    this.enfeites = chaveDosAcessorios(acessorios);
    this.traje = TRAJES.find((t) => t.id === trajeDe(personagem)) ?? TRAJES[0];
    this.boneco = new Boneco(esqueletoDoJogo());
    this.boneco.zerar();
    this.boneco.raiz.updateMatrixWorld(true);
    // (os ossos não entram na cena: as malhas vão no grupo do lugar, e a pele segue os ossos "soltos")
    const ossos = new THREE.Skeleton(this.boneco.ossos);
    this.pele = criarPele();
    const p = this.traje.pele;
    this.pele.uniforms.uPele.value = cor(p.luz);
    this.pele.uniforms.uMeio.value = cor(p.meio);
    this.pele.uniforms.uSombra.value = cor(p.sombra);
    this.pele.uniforms.uFundo.value = cor(p.fundo);
    this.tecido = criarTecido();
    this.traco = criarTraco();
    // a luz é a de desenho ("anime") da página do personagem: duas cores chapadas e o traço em volta
    this.pele.uniforms.uAnime.value = 1;
    this.tecido.uniforms.uAnime.value = 1;

    // o corpo: sem os triângulos que a roupa cobre inteiros
    const geo = new THREE.BufferGeometry();
    for (const [nome, attr] of Object.entries(atributosDoCorpo(corpo))) geo.setAttribute(nome, attr);
    geo.setAttribute('coberto', new THREE.BufferAttribute(roupa.coberto, 1));
    const cob = roupa.coberto;
    const mi = corpo.malha.idx;
    const idx = new Uint32Array(mi.length);
    let ni = 0;
    for (let k = 0; k < mi.length; k += 3) {
      const a = mi[k];
      const b = mi[k + 1];
      const c = mi[k + 2];
      if (!(cob[a] && cob[b] && cob[c])) {
        idx[ni++] = a;
        idx[ni++] = b;
        idx[ni++] = c;
      }
    }
    geo.setIndex(new THREE.BufferAttribute(idx.slice(0, ni), 1));
    // a roupa
    const r = roupa.malha;
    const geoRoupa = new THREE.BufferGeometry();
    geoRoupa.setAttribute('position', new THREE.BufferAttribute(r.pos, 3));
    geoRoupa.setAttribute('normal', new THREE.BufferAttribute(r.nor, 3));
    geoRoupa.setAttribute('ar', new THREE.BufferAttribute(r.ar, 1));
    geoRoupa.setAttribute('cor', new THREE.BufferAttribute(r.cor, 3));
    geoRoupa.setAttribute('cor2', new THREE.BufferAttribute(r.cor2, 3));
    const avesso = new Float32Array(r.cor.length);
    for (let k = 0; k < avesso.length; k++) avesso[k] = r.cor[k] * 0.72;
    geoRoupa.setAttribute('avesso', new THREE.BufferAttribute(avesso, 3));
    geoRoupa.setAttribute('enfeite', new THREE.BufferAttribute(r.enfeite, 1));
    geoRoupa.setAttribute('repouso', new THREE.BufferAttribute(r.pos, 3));
    geoRoupa.setAttribute('skinIndex', new THREE.BufferAttribute(roupa.indices, 4));
    geoRoupa.setAttribute('skinWeight', new THREE.BufferAttribute(roupa.pesos, 4));
    geoRoupa.setIndex(new THREE.BufferAttribute(r.idx, 1));
    const comOssos = (g: THREE.BufferGeometry, material: THREE.Material) => {
      const m = new THREE.SkinnedMesh(g, material);
      m.bindMode = THREE.DetachedBindMode;
      m.bind(ossos, new THREE.Matrix4());
      m.frustumCulled = false;
      // (a esfera em volta do personagem, dada de antemão: sem ela o three.js a calcula no primeiro
      // desenho, passando osso por osso em cada vértice — um quarto de segundo de página travada por mesa)
      m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.1, 0), 1.6);
      // (o traço não faz sombra; e do corpo e da roupa, só os braços e as mãos — veja sombras.ts)
      if (material !== this.traco) {
        m.castShadow = true;
        m.customDepthMaterial = sombraDosBracos('position');
      }
      this.grupo.add(m);
    };
    comOssos(geo, this.pele);
    comOssos(geo, this.traco);
    comOssos(geoRoupa, this.tecido);
    comOssos(geoRoupa, this.traco);
    const defs = this.traje.panos?.() ?? [];
    // (com um ajudante para simular, os panos daqui são só o desenho)
    const fora = defs.length > 0 && podeSimularFora();
    for (const def of defs) {
      const pano = new Pano(this.boneco, def, fora);
      const m = new THREE.Mesh(pano.geometria, this.tecido);
      m.frustumCulled = false;
      m.castShadow = true;
      m.customDepthMaterial = sombraDosBracos('repouso');
      this.grupo.add(m);
      this.panos.push({ pano });
    }
    if (fora) this.remoto = new PanosRemotos(this.boneco, this.traje.id, this.panos.map((x) => x.pano));
    // o esmalte: a cor das unhas (a natural não pinta nada)
    const esmalte = findAcessorio(acessorios.esmalte);
    if (esmalte?.tipo === 'esmalte' && esmalte.cor) {
      this.pele.uniforms.uEsmalte.value = cor(esmalte.cor);
      this.pele.uniforms.uEsmalte2.value = cor(esmalte.cor2 ?? esmalte.cor);
      this.pele.uniforms.uEsmalteForca.value = 1;
      this.pele.uniforms.uEsmalteBrilho.value = esmalte.metalico ? 0.75 : 0.3;
      this.pele.uniforms.uEsmalteTipo.value = { liso: 0, francesinha: 1, degrade: 2, glitter: 3, cromado: 4 }[esmalte.efeito ?? 'liso'];
    }
    this.inversasDosOssos = ossos.boneInverses;
    this.prenderPecas();
  }

  /** Os anéis, as pulseiras e o relógio: peças rígidas, cada uma presa a um osso (por cima da luva da mão, se houver). */
  private prenderPecas() {
    const cobre = (mao: 'E' | 'D') => {
      const luva = findAcessorio(this.acessorios.luvas[mao]);
      return luva?.tipo === 'luva' && luva.feitio !== 'traje' ? luva.feitio : trajeTemLuva(this.traje);
    };
    for (const peca of pecasDosAcessorios(this.acessorios, { E: cobre('E'), D: cobre('D') }, this.posDaRoupa)) {
      const i = this.boneco.esq.indice[`${peca.osso}.${peca.mao}`];
      if (i === undefined) continue;
      const inversa = this.inversasDosOssos[i].clone();
      if (peca.mao === 'D') inversa.multiply(ESPELHO);
      for (const pedaco of peca.pedacos) {
        const malha = new THREE.Mesh(pedaco.geo, pedaco.mat);
        malha.matrixAutoUpdate = false;
        malha.frustumCulled = false;
        malha.castShadow = !pedaco.semSombra;
        // (já no lugar: um quadro com a peça na origem do personagem apareceria como um risco na mesa)
        malha.matrix.multiplyMatrices(this.boneco.ossos[i].matrixWorld, inversa);
        this.grupo.add(malha);
        this.presas.push({ malha, osso: this.boneco.ossos[i], inversa });
      }
    }
  }

  /**
   * A matriz que leva uma peça da pose de repouso, presa a este osso, para o mundo — neste quadro. É
   * com ela que um acessório que acabou de sair da mão (a correia desabotoada, ainda no pulso)
   * aparece exatamente onde o do personagem estava.
   */
  matrizDaPeca(osso: string, mao: 'E' | 'D'): THREE.Matrix4 | null {
    const i = this.boneco.esq.indice[`${osso}.${mao}`];
    if (i === undefined || !this.inversasDosOssos[i]) return null;
    return new THREE.Matrix4().multiplyMatrices(this.grupo.matrixWorld, this.boneco.ossos[i].matrixWorld).multiply(this.inversasDosOssos[i]);
  }

  /**
   * Troca os anéis e o que vai nos braços **sem refazer o personagem** — é o que acontece quando ele
   * aposta um acessório (a peça sai da mão) ou o ganha de volta. Só as peças rígidas: se o esmalte ou
   * uma luva mudaram, devolve false, e aí quem chama refaz o personagem (a luva é costurada com a roupa).
   */
  trocarEnfeites(novos: Acessorios): boolean {
    if (novos.esmalte !== this.acessorios.esmalte || novos.luvas.E !== this.acessorios.luvas.E || novos.luvas.D !== this.acessorios.luvas.D) return false;
    for (const p of this.presas) {
      p.malha.removeFromParent();
      p.malha.geometry.dispose();
    }
    this.presas = [];
    this.acessorios = novos;
    this.enfeites = chaveDosAcessorios(novos);
    this.prenderPecas();
    return true;
  }

  /** Põe o personagem no lugar e diz ao pano onde fica a mesa (nas coordenadas dele). */
  sentar(l: Lugar) {
    this.grupo.position.set(l.x, 0, l.z);
    this.grupo.rotation.set(0, l.giro, 0);
    this.grupo.updateMatrixWorld(true);
    const a = this.grupo.worldToLocal(new THREE.Vector3(-MEIO, 0, 0));
    const b = this.grupo.worldToLocal(new THREE.Vector3(MEIO, 0, 0));
    this.mesaDoPano = { y: MESA, alto: 0.6, estadio: { a: [a.x, a.z], b: [b.x, b.z], raio: RAIO } };
    this.semMexer = 0;
  }

  /**
   * Este é o personagem de quem joga: a câmera fica logo acima e atrás dele, e a cabeça taparia a
   * beirada de cá da mesa (e as cartas dele). Sem ela, aparecem os ombros e os braços, na borda de
   * baixo da tela.
   */
  semCabeca(sim: boolean) {
    for (const m of [this.pele, this.tecido, this.traco]) m.uniforms.uSemCabeca.value = sim ? ALTURA_DO_PESCOCO : 99;
  }

  /** O tamanho da tela em que a cena é desenhada (o traço tem a mesma grossura em qualquer tamanho). */
  tela(l: number, a: number) {
    this.traco.uniforms.uTela.value.set(l, a);
  }

  /** O descanso deste personagem (em laço, quando não está fazendo nada). */
  descansar(c: Clipe) {
    // (com o baralho na mão o descanso é o de mãos separadas: o pedido fica para quando ele o pousar)
    if (this.segurando && this.descansoDeSempre) {
      this.descansoDeSempre = c;
      return;
    }
    const estavaDescansando = !this.tocando || this.tocando.clipe === this.descanso;
    this.descanso = c;
    this.repousoDeAgora = poseDe(c, 0).maos;
    if (estavaDescansando) this.tocar(c, { laco: true, passagem: !!this.pose });
  }

  /**
   * Fica com o baralho na esquerda (`s`), ou deixa de ficar (null). Com ele, o descanso é `plano` — de
   * mãos separadas: num descanso de mãos juntas a direita ficaria sozinha no ar.
   */
  segurar(s: { mao: EstadoDaMao; baralho: (b: Boneco) => Objeto } | null, plano?: Clipe) {
    if (s && !this.segurando) {
      this.descansoDeSempre = this.descanso;
      if (plano) this.descansar(plano);
    } else if (!s && this.segurando && this.descansoDeSempre) {
      const de = this.descansoDeSempre;
      this.descansoDeSempre = null;
      this.descansar(de);
    }
    this.segurando = s;
  }

  get seguraOBaralho(): boolean {
    return !!this.segurando;
  }

  /** Onde um osso está agora, no mundo (o nome com o lado: `indicador1.E`, `mao.D`); null se não existe. */
  ossoNoMundo(nome: string): THREE.Vector3 | null {
    const i = this.boneco.esq.indice[nome];
    if (i === undefined) return null;
    return new THREE.Vector3().setFromMatrixPosition(this.boneco.ossos[i].matrixWorld).applyMatrix4(this.grupo.matrixWorld);
  }

  /** O descanso que ele tem (o id do clipe) — com o baralho na mão, o que volta a ter quando o pousar. */
  get descansando(): string | undefined {
    return (this.descansoDeSempre ?? this.descanso)?.id;
  }

  /** Larga o que está fazendo (um gesto em laço, como dar as cartas) e volta ao descanso. */
  voltarAoDescanso() {
    if (this.descanso && this.tocando?.clipe !== this.descanso) this.tocar(this.descanso, { laco: true });
  }

  /** O que está tocando agora (o id do clipe), fora o descanso. */
  get gesto(): string | null {
    return this.ocupado ? this.tocando!.clipe.id : null;
  }

  /** O instante do que está tocando agora (segundos, no tempo do clipe). */
  get instante(): number {
    return this.tocando?.t ?? 0;
  }

  /** Está num gesto (não no descanso)? */
  get ocupado(): boolean {
    return !!this.tocando && this.tocando.clipe !== this.descanso;
  }

  /**
   * Toca um clipe, saindo da pose atual. Um gesto (`laco` falso) volta ao descanso quando acaba.
   * O gesto que estava tocando é interrompido (e avisado, com `fim`).
   */
  tocar(c: Clipe, op: { vel?: number; laco?: boolean; passagem?: boolean; aoAndar?: Tocando['aoAndar'] } = {}) {
    const antes = this.tocando;
    if (antes?.aoAndar) antes.aoAndar(antes.t, this.objetos, true);
    this.tocando = { clipe: c, t: 0, vel: op.vel ?? 1, laco: op.laco ?? false, aoAndar: op.aoAndar };
    this.passagem = this.pose && op.passagem !== false ? { de: this.pose, u: 0 } : null;
    this.semMexer = 0;
  }

  /** Um quadro: anda o clipe, posa o boneco, e simula o pano se ele precisa. */
  quadro(dt: number) {
    const tc = this.tocando;
    if (!tc) return;
    // o ritmo da mesa (pular a mão, a fila de eventos atrasada) acelera os gestos como acelera os voos
    const passo = dt * (tc.clipe === this.descanso ? 1 : getTimeScale());
    tc.t += passo * tc.vel;
    let fim = false;
    if (tc.t >= tc.clipe.dur) {
      if (tc.laco) tc.t %= tc.clipe.dur;
      else {
        tc.t = tc.clipe.dur;
        fim = true;
      }
    }
    let pose = poseDe(tc.clipe, tc.t);
    const comBaralho = this.segurando && !ehDoBaralho(tc.clipe.id) ? this.segurando : null;
    if (comBaralho) {
      const m = comBaralho.mao;
      pose = { ...pose, maos: { ...pose.maos, E: { punho: m.punho.clone(), dedos: m.dedos.clone(), palma: m.palma.clone(), f: [...m.f] } } };
    }
    if (this.passagem) {
      this.passagem.u += passo / PASSAGEM;
      if (this.passagem.u >= 1) this.passagem = null;
      else pose = entrePoses(this.passagem.de, pose, this.passagem.u);
    }
    // (a pose guardada, de onde as passagens partem, é a do clipe; o relaxo dos dedos entra por cima, só no desenho)
    this.pose = pose;
    posarPose(this.boneco, this.relaxada(pose, tc.clipe, dt));
    this.objetos = tc.clipe.objetos?.(tc.t, this.boneco) ?? [];
    this.boneco.raiz.updateMatrixWorld(true);
    // (os acessórios vão com os ossos)
    for (const p of this.presas) {
      p.malha.matrix.multiplyMatrices(p.osso.matrixWorld, p.inversa);
      p.malha.matrixWorldNeedsUpdate = true;
    }
    if (comBaralho) this.objetos = [...this.objetos, comBaralho.baralho(this.boneco)];
    tc.aoAndar?.(tc.t, this.objetos, fim);
    // (o aviso pode ter posto outro gesto para tocar em seguida — pegar o baralho e repartir: aí não volta ao descanso)
    if (fim && this.tocando === tc) {
      this.tocando = null;
      if (this.descanso) this.tocar(this.descanso, { laco: true });
    }
    if (this.ocupado || this.passagem) this.semMexer = 0;
    this.semPano += dt;
  }

  /**
   * A pose com o relaxo dos dedos nas mãos que estão descansando (veja `relaxar`). No descanso de
   * mãos uma em cima da outra ele não entra: a de baixo, mais alta, atravessaria a de cima.
   */
  private relaxada(pose: Pose, clipe: Clipe, dt: number): Pose {
    if (clipe.id === 'idle-sobrepostas') return pose;
    // o jeito de cada mão muda a cada `RELAXO_S` segundos do relógio (cada mão com a sua defasagem), e
    // é sorteado da semente e da janela: as telas de todos chegam ao mesmo jeito na mesma hora
    const agora = Date.now() / 1000;
    const janelaDe = (lado: Lado) => Math.floor((agora + hash01(this.semente, lado === 'E' ? 1 : 2) * RELAXO_S) / RELAXO_S);
    const sorteado = (lado: Lado, janela: number) => relaxoAoAcaso(this.boneco, lado, sorteador(this.semente, lado === 'E' ? 1 : 2, janela));
    if (!this.relaxos) {
      const novo = (lado: Lado) => {
        const janela = janelaDe(lado);
        const r = sorteado(lado, janela);
        return { de: r, para: r, u: 1, janela, repouso: descansoDe(this.boneco, lado) };
      };
      this.relaxos = { E: novo('E'), D: novo('D') };
    }
    const maos = { ...pose.maos };
    for (const lado of ['E', 'D'] as const) {
      const r = this.relaxos[lado];
      const janela = janelaDe(lado);
      if (janela !== r.janela) {
        // de tempos em tempos, outro jeito (devagar: um segundo e meio de um para o outro)
        r.de = entreRelaxos(r.de, r.para, r.u);
        r.para = sorteado(lado, janela);
        r.u = 0;
        r.janela = janela;
      }
      r.u = Math.min(1, r.u + dt / 1.5);
      const m = pose.maos[lado];
      const mao: EstadoDaMao = { punho: m.punho.clone(), dedos: m.dedos.clone(), palma: m.palma.clone(), f: [...m.f] };
      relaxar(mao, entreRelaxos(r.de, r.para, r.u), this.repousoDeAgora?.[lado] ?? r.repouso);
      maos[lado] = mao;
    }
    return { ...pose, maos };
  }

  /**
   * O pano não é simulado aqui, a cada quadro: a cena dá a vez (`passoDoPano`) a um personagem por
   * quadro (um quadro sim, outro não), o que mais tempo está sem passo. Um passo do pano custa uns
   * 10 ms por personagem (são centenas de pontos, em doze passos miúdos), e três personagens mexendo
   * as mãos ao mesmo tempo derrubavam a mesa para 20 quadros por segundo. Com a vez, quem espera dá
   * um passo maior quando chega a vez dele (até 1/15 s: o pano segue estável, só um pouco menos fino
   * no balanço).
   */
  get precisaDePano(): boolean {
    // (com um ajudante, a conta não é feita aqui — os panos daqui nem têm elásticos)
    if (this.remoto) return false;
    return this.panos.length > 0 && (this.assentados < PASSOS_PARA_ASSENTAR || this.semMexer <= ASSENTAR);
  }

  /**
   * O pano num ajudante: a cada quadro, depois de posar. Na primeira vez pede que ele assente na pose
   * de agora; depois, enquanto as mãos mexem (e um pouco além), pede o passo do quadro. E a costura
   * acompanha os ossos de agora.
   */
  quadroDoPano(dt: number) {
    const r = this.remoto;
    if (!r || r.falhou || !this.tocando) return;
    if (!r.assentado) {
      if (!this.pediuAssentar) this.pediuAssentar = r.assentar(this.mesaDoPano, PASSOS_PARA_ASSENTAR);
      return;
    }
    if (this.semMexer <= ASSENTAR_FORA) {
      if (r.passo(dt, this.mesaDoPano)) this.semMexer++;
      this.custoDoPano = r.custo;
    }
    r.repregar();
  }

  /**
   * Pronto para aparecer: o pano (se há) já assentou na primeira pose. Antes disso as mangas estariam
   * esticadas como na T-pose, ou nem estariam.
   */
  get pronto(): boolean {
    if (!this.panos.length) return true;
    if (this.remoto) return this.remoto.assentado || this.remoto.falhou;
    return this.assentados >= PASSOS_PARA_ASSENTAR;
  }

  /** Há quanto tempo (s) o pano não dá um passo: é por isso que a cena escolhe de quem é a vez. */
  get esperaDoPano(): number {
    return this.assentados < PASSOS_PARA_ASSENTAR ? Infinity : this.semPano;
  }

  /** O quanto um passo do pano custou, em média (ms; para conferir de fora). */
  custoDoPano = 0;

  /** A vez deste personagem: um passo do pano (ou um pedaço do assentamento da primeira pose). */
  passoDoPano() {
    const t0 = performance.now();
    if (this.assentados < PASSOS_PARA_ASSENTAR) {
      // a primeira vez: o pano começa de onde os ossos estão e assenta aos poucos (uns passos por vez)
      for (const { pano } of this.panos) {
        if (this.assentados === 0) pano.recolocar();
        for (let k = 0; k < 4; k++) pano.passo(1 / 60, this.mesaDoPano);
        // (zera o embalo: assentado, ele não sai balançando)
        if (this.assentados + 4 >= PASSOS_PARA_ASSENTAR) pano.assentar(this.mesaDoPano, 0);
        pano.atualizar();
      }
      this.assentados += 4;
    } else {
      for (const { pano } of this.panos) {
        // (o tempo que não cabe no passo, o pano atravessa levado pelos ossos: veja `Pano.passo`)
        const dtDoPasso = Math.min(this.semPano, 1 / 15);
        pano.passo(dtDoPasso, this.mesaDoPano, this.semPano > 0 ? 1 - dtDoPasso / this.semPano : 0);
        pano.atualizar();
      }
      this.semMexer++;
    }
    this.semPano = 0;
    this.custoDoPano += (performance.now() - t0 - this.custoDoPano) * 0.1;
  }

  /** Um ponto do espaço do personagem no mundo. */
  noMundo(v: THREE.Vector3): THREE.Vector3 {
    return this.grupo.localToWorld(v);
  }

  destruir() {
    this.remoto?.destruir();
    this.grupo.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        // (a geometria do corpo é dividida: só os índices são dele, e somem com ela)
        o.geometry.dispose();
      }
    });
    this.pele.dispose();
    this.tecido.dispose();
    this.traco.dispose();
    this.grupo.removeFromParent();
  }
}
