/**
 * A mesa 3D da partida: a mesa em estádio com o feltro, o couro e a madeira do estilo da mesa; os
 * personagens sentados, com as mãos na mesa; as pilhas de fichas de cada um, as apostas e o pote;
 * as cartas fechadas; o baralho e o botão do dealer. É o "palco" do diretor (src/mesa3d/palco.ts):
 * cada gesto que ele pede vira uma animação dos personagens ou um voo de objetos aqui.
 *
 * O que fica parado na mesa sai do estado da partida (`atualizar`, a cada mudança do `TableView`):
 * as fichas de cada um, as apostas, o pote, quantas cartas fechadas cada um tem, quem é o dealer.
 * O que se mexe vem por cima: os voos (cartas e fichas indo de um ponto a outro) e o que as mãos
 * levam (o punhado de fichas da aposta, as cartas que alguém levanta para espiar, o baralho na mão
 * de quem dá as cartas). Enquanto uma coisa voa, o estado ainda não a conta — o diretor só muda o
 * estado quando o voo chega —, então nada aparece em dobro.
 *
 * As cartas abertas não são daqui: continuam 2D, na camada deitada no tampo (src/mesa3d/geometria.ts).
 */
import * as THREE from 'three';
import type { Card } from '../../shared/cards';
import type { TableView } from '../../shared/protocol';
import { TEMPO_DE_ABRIR, TEMPO_DE_PEGAR, tempoDeRepartir } from '../../shared/ritmo';
import type { CardBackStyle, CardFaceStyle, ChipStyle, TableStyle } from '../../shared/styles';
import { CARD_W, MUCK_POS, STAGE_H, STAGE_W, boardSlot, type Pt } from '../game/layout';
import { breakdown } from '../render/Chip';
import { getTimeScale, scaled } from '../anim/tween';
import { BARALHO, BATIDAS, CARTA, DESISTIR_SOLTA, FICHA, GANHAR, RITMO_MAIS_LIGEIRO, abrirCartas, desistir as desistirDaMao, entregarCartas, meioDoMonteGanho, vistoDoLugar, type Clipe, type Objeto, CARTA_ABERTA } from '../personagem/animacoes';
import { Boneco } from '../personagem/boneco';
import { materiaisDaCarta, materiaisDaCartaAberta, materiaisDaFicha, materiaisDoBaralho, materiaisDoBotao, chaveDoEstilo, texturaDoFeltro, FELTRO } from './aparencia';
import { geometriaDaFicha } from './ficha';
import { prepararSombra, RUMO_DA_LUZ, SOMBRA, SombrasDeContato } from './sombras';
import { Ator, DESCANSOS } from './ator';
import { bonecoDeConta, clipe, clipesProntos, ehDoBaralho, esqueletoDoJogo, maoQueSegura, prepararClipes, descansoComAbertas } from './clipes';
import { ALTURA_DA_MESA as MESA, CAMERA_DO_JOGO, DESCARTE, GIRO_DO_BARALHO, MARCAS, MEIO, METRO_POR_PX, POTE_3D, RAIO, TRILHO, lenteDaTela, planoParaMundo, seatLayout3d, type SeatGeo3D } from './geometria';
import { modeloPronto, prepararRoupa, useModelos, vestido } from './modelos';
import { SEM_ACESSORIOS, chaveDosAcessorios, type Acessorios } from '../../shared/acessorios';
import type { Palco3D } from './palco';
import { shade } from '../util/color';
import { hash01, jitter } from '../util/rand';

/** O que a cena precisa saber da partida (e dos cosméticos que valem nela agora). */
export interface EntradaDaCena {
  view: TableView;
  /** A mesa da rodada (a do dealer, com gente; a minha, contra bots). */
  mesa: TableStyle;
  /** O baralho da rodada: o verso das cartas fechadas e o papel delas. */
  cartas: { face: CardFaceStyle; back: CardBackStyle };
  /** As fichas de cada jogador (as apostas e a pilha dele saem com elas). */
  fichaDe: (seat: number) => ChipStyle;
  /** As fichas do pote. */
  fichaDoPote: ChipStyle;
  /** O personagem de cada assento (o id de `CHARACTER_PRESETS`). */
  personagemDe: (seat: number) => string;
  /** O que cada um usa nas mãos (anéis, pulseira, relógio, esmalte, luva); sem isto, nada. */
  acessoriosDe?: (seat: number) => Acessorios | undefined;
}

// ─────────────────────────────── medidas ───────────────────────────────

/** Quantas fichas a coluna da pilha tem (a de onde "colocar fichas" tira o punhado: 8 ficam, 5 vão). */
const NA_PILHA = 13;
const NO_PUNHADO = 5;
/** O passo entre colunas de fichas lado a lado. */
const ENTRE_COLUNAS = FICHA.raio * 2 + 0.003;
/** As durações dos voos (ms, antes do ritmo da mesa), as mesmas dos voos 2D. */
const VOO = { carta: 300, recolher: 420, descarte: 400, aposta: 420, recolherFichas: 520, pote: 760 };

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const EIXO_Y = V(0, 1, 0);
const macio = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const sai = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

/**
 * O dealer reparte e abre as cartas no tempo que a mesa dá para isso (shared/ritmo.ts): o gesto,
 * feito no passo de quem entrega com calma (uma carta a cada 0,9 s, no mínimo), é acelerado até
 * caber nele — e nunca anda mais devagar do que isto.
 */
const VEL_MINIMA_DA_ENTREGA = 1.6;
/**
 * Como a carta aberta fica deitada no tampo (o giro em volta de y, no mundo): ela vira em volta do
 * próprio comprimento, e com meia-volta o alto da face fica para o lado de lá da mesa — como a da
 * carta 2D que toma o lugar dela.
 */
const GIRO_DA_ABERTA = Math.PI;
/** O quanto a carta aberta 2D é maior que a 3D (ela cresce no ar até o tamanho da 2D que a substitui). */
const ESCALA_DA_ABERTA = (CARD_W * METRO_POR_PX) / CARTA.larg;
/**
 * O retângulo das cartas abertas do meio da mesa, no tampo (metros), com a folga de uma carta que
 * passa deitada: |x| até `x`, z de `z0` a `z1`.
 */
const CARTAS_DO_MEIO = (() => {
  const a = planoParaMundo({ x: boardSlot(0).x - CARD_W / 2, y: boardSlot(0).y - (CARD_W * 1.4) / 2 });
  const b = planoParaMundo({ x: boardSlot(4).x + CARD_W / 2, y: boardSlot(4).y + (CARD_W * 1.4) / 2 });
  const folga = 0.055;
  return { x: Math.max(Math.abs(a.x), Math.abs(b.x)) + folga, z0: Math.min(a.z, b.z) - folga, z1: Math.max(a.z, b.z) + folga };
})();
/** O clarão em volta de uma carta: branco no meio (do tamanho dela), sumindo para as bordas. A cor vem do material. */
function texturaDoBrilho(): THREE.Texture {
  const L = 128;
  const A = 160;
  const tela = document.createElement('canvas');
  tela.width = L;
  tela.height = A;
  const ctx = tela.getContext('2d')!;
  // (um retângulo de cantos redondos, do tamanho da carta, bem desfocado)
  ctx.filter = 'blur(13px)';
  ctx.fillStyle = '#ffffff';
  const l = L / 2.3;
  const a = A / 2.05;
  ctx.beginPath();
  ctx.roundRect((L - l) / 2 - 5, (A - a) / 2 - 5, l + 10, a + 10, 12);
  ctx.fill();
  const tex = new THREE.CanvasTexture(tela);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** O mesmo para as cartas que um jogador vira no showdown (as 2D dele são menores que as do meio da mesa). */
const ESCALA_DA_VIRADA = (72 * METRO_POR_PX) / CARTA.larg;
/** A que velocidade os personagens viram as cartas no showdown. */
const VEL_DE_VIRAR = 1.8;

/**
 * Uma entrega em curso: o dealer está repartindo as cartas da mão, ou abrindo as da mesa, com as
 * mãos. As cartas do gesto dele aparecem enquanto estão na mão e no ar; quando uma pousa, o estado
 * da mesa passa a contá-la (`aoChegar`) e quem a desenha é ele: a carta fechada na frente do
 * jogador, ou a carta aberta 2D.
 */
interface Entrega {
  dealer: number;
  /** As cartas da mão (para quem vai cada uma)… */
  daMao?: { seat: number; i: number; n: number }[];
  /** …ou as da mesa (a carta, e depois de quantas ela fica). */
  daMesa?: { cartas: Card[]; jaNaMesa: number; ate: THREE.Vector3[] };
  /** Depois destas não há mais cartas a dar: acabado o gesto, o baralho volta para a mesa. */
  ultimas?: boolean;
  chegou: Set<number>;
  saiu: Set<number>;
}

/** Os gestos do dealer com o baralho (pegá-lo, dar as cartas, abrir as da mesa, pousá-lo): o baralho é do próprio gesto. */
const soBaralho = ehDoBaralho;
/** A que velocidade quem ganhou puxa o pote. */
const VEL_DE_GANHAR = 1.25;
/** A que velocidade o dealer pousa o baralho de volta na mesa. */
const VEL_DE_POUSAR = 2;

function estadio(raio: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-MEIO, -raio);
  s.lineTo(MEIO, -raio);
  s.absarc(MEIO, 0, raio, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-MEIO, raio);
  s.absarc(-MEIO, 0, raio, Math.PI / 2, (3 * Math.PI) / 2, false);
  return s;
}

/** As sombras de contato ficam entre o feltro e o fundo das cartas, um nada para o lado em que a sombra cai, e somem a esta altura da mesa. */
const NIVEL_DA_SOMBRA = MESA - 0.00015;
const DESVIO_DA_SOMBRA = { x: -RUMO_DA_LUZ.x * 0.0045, z: -RUMO_DA_LUZ.z * 0.0045 };
const ALCANCE_DA_SOMBRA = 0.02;

/** Uma ficha ou carta posta num lugar do mundo, num quadro. */
interface Posta {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
}

/** Um objeto voando de um ponto a outro do mundo (cartas fechadas ou uma pilha de fichas). */
interface Voo {
  tipo: 'carta' | 'fichas';
  de: THREE.Vector3;
  ate: THREE.Vector3;
  /** O giro (em volta do eixo vertical) na saída e na chegada. */
  giroDe: number;
  giroAte: number;
  /** O quanto sobe no meio do caminho (metros). */
  arco: number;
  /** Um ponto por onde o caminho se curva (contornando as cartas do meio da mesa), em vez de ir reto. */
  por?: THREE.Vector3;
  inicio: number;
  dur: number;
  /** Some ao chegar (o descarte, o baralho) — encolhe no fim, em vez de pousar. */
  some: boolean;
  valor?: number;
  estilo?: ChipStyle;
  pronto: () => void;
}

/** Uma aposta em curso: o personagem está levando o punhado da pilha para a mesa. */
interface Apostando {
  valor: number;
  /** A aposta que o estado tinha quando o gesto começou: enquanto ela não muda, o punhado pousado continua à vista. */
  antes: number;
  estado: 'pilha' | 'mao' | 'pousou';
  objs: Objeto[];
}

export class Cena3D implements Palco3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly cena = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly feltro: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly couro: THREE.MeshStandardMaterial;
  private readonly madeira: THREE.MeshStandardMaterial;
  private readonly pe: THREE.MeshStandardMaterial;
  private estiloDaMesa = '';
  private entrada: EntradaDaCena | null = null;
  private geo: SeatGeo3D[] = [];
  private chaveDoGeo = '';
  /** Um ponto vazio em cada lugar: leva o que é dito no espaço do personagem para o mundo. */
  private ancoras: THREE.Group[] = [];
  private readonly atores = new Map<number, Ator>();
  private readonly apostando = new Map<number, Apostando>();
  /** O dealer está dando cartas (o gesto de entregar volta ao descanso um pouco depois da última). */
  private entregando: { seat: number; ate: number } | null = null;
  /** A pilha do descarte: as cartas de quem desistiu (e as trocadas), todas no mesmo monte, até o fim da mão. */
  private descarte: { pos: THREE.Vector3; giro: number }[] = [];
  /** Quantas cartas estão a caminho da pilha (cada uma já tem o lugar dela guardado). */
  private aCaminhoDoDescarte = 0;
  /** De que mão é a pilha. */
  private maoDoDescarte: number | undefined;
  /** Quem já lançou as cartas no gesto de desistir (dali em diante elas são da cena, a caminho da pilha). */
  private readonly lancou = new Set<number>();
  /** O pote que cada vencedor está puxando: quanto, com que fichas, se já pousou na frente dele e o instante do gesto. */
  private readonly ganhando = new Map<number, { valor: number; estilo: ChipStyle | undefined; naMesa: boolean; t: number }>();
  /** As cartas fechadas que brilham (as de quem ganhou, antes de virar): a cor do brilho de cada assento. */
  private readonly brilhando = new Map<number, THREE.Color>();
  /** De que mão são os brilhos (eles acabam com ela). */
  private maoDosBrilhos: number | undefined;
  private readonly brilhos: THREE.Mesh[] = [];
  private texturaDoBrilho: THREE.Texture | null = null;
  /** Quem está com o baralho na mão (o dealer, da hora em que o pega para repartir até pousá-lo). */
  private comBaralho: number | null = null;
  /** O baralho sendo pousado de volta (quem o pousa, e quando acaba). */
  private largando: { seat: number; fim: Promise<void> } | null = null;
  /** As cartas que cada um está virando no showdown (para a face aparecer enquanto viram). */
  private readonly viradas = new Map<number, Card[]>();
  /** O dealer repartindo ou abrindo cartas com as mãos (veja `Entrega`). */
  private entrega: Entrega | null = null;
  /** Os gestos de repartir e de abrir, por arrumação da mesa (montar um custa um instante). */
  private readonly entregas = new Map<string, Clipe | undefined>();
  private voos: Voo[] = [];
  private readonly geoCarta = new THREE.BoxGeometry(CARTA.larg, CARTA.alto, CARTA.comp);
  private readonly geoBaralho = new THREE.BoxGeometry(CARTA.larg, BARALHO.alto, CARTA.comp);
  private readonly geoFicha = geometriaDaFicha();
  /** As sombras de contato (o borrão debaixo de cada coluna de fichas e de cada carta deitada). */
  private readonly sombraDasFichas = new SombrasDeContato('ficha', 0.36, 512);
  private readonly sombraDasCartas = new SombrasDeContato('carta', 0.34, 128);
  private readonly cartas: THREE.Mesh[] = [];
  private readonly fichas = new Map<string, { malha: THREE.InstancedMesh; usadas: number }>();
  private readonly baralho: THREE.Mesh;
  private readonly botao: THREE.Mesh;
  private botaoEm: THREE.Vector3 | null = null;
  /** As cartas fechadas paradas na frente de cada um (no espaço do personagem), por quantas são. */
  private repousos = new Map<number, Posta[]>();
  /** O gesto de desistir de cada assento (montado na primeira vez que ele desiste). */
  private readonly desistencias = new Map<string, Clipe | undefined>();
  private quadroPedido = 0;
  private antes = performance.now();
  private medida = { l: 0, a: 0 };
  private desligar: (() => void)[] = [];
  /** Quadros por segundo (para conferir de fora). */
  fps = 0;
  private falhou = false;
  private readonly custo = { atores: 0, montar: 0, desenho: 0 };
  private quadroDoPano = false;
  private quadros = 0;
  private desdeFps = performance.now();

  constructor(private readonly tela: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas: tela, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.camera = new THREE.PerspectiveCamera(CAMERA_DO_JOGO.fov, 16 / 9, 0.05, 30);
    this.camera.position.set(...CAMERA_DO_JOGO.posicao);
    this.camera.lookAt(V(...CAMERA_DO_JOGO.alvo));
    this.cena.add(new THREE.AmbientLight(0xffffff, 1.5));
    // a luz que faz as sombras: o mapa dela cobre o tampo e o que fica até dois palmos acima dele
    const sol = new THREE.DirectionalLight(0xfff2ea, 1.7);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const borda = [MEIO + RAIO + 0.03, RAIO + 0.03];
    const cantos = [MESA - 0.07, MESA + 0.4].flatMap((y) => [-1, 1].flatMap((i) => [-1, 1].map((j) => V(i * borda[0], y, j * borda[1]))));
    prepararSombra(sol, V(0, MESA, 0), cantos, this.renderer.capabilities.maxTextureSize);
    this.cena.add(sol, sol.target);

    // a mesa: o feltro, a beirada de couro (rente ao feltro), a saia de madeira, a coluna e o pé
    const deitar = (g: THREE.BufferGeometry) => g.rotateX(-Math.PI / 2);
    const geoFeltro = deitar(new THREE.ShapeGeometry(estadio(RAIO - TRILHO + 0.002), 64));
    // (as coordenadas da textura: o retângulo do feltro inteiro, com o lado de lá em cima)
    const pos = geoFeltro.getAttribute('position');
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      uv[i * 2] = (pos.getX(i) + FELTRO.meioX) / (2 * FELTRO.meioX);
      uv[i * 2 + 1] = 1 - (pos.getZ(i) + FELTRO.meioZ) / (2 * FELTRO.meioZ);
    }
    geoFeltro.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.feltro = new THREE.Mesh(geoFeltro, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.feltro.position.y = MESA - 0.0006;
    // o feltro não tem luz (é o desenho da mesa): quem recebe a sombra é este plano, transparente, em cima dele
    const pano = new THREE.Mesh(geoFeltro, new THREE.ShadowMaterial({ color: SOMBRA.cor, opacity: SOMBRA.forca, depthWrite: false }));
    pano.position.y = MESA - 0.0003;
    pano.receiveShadow = true;
    pano.renderOrder = 1;
    this.couro = new THREE.MeshStandardMaterial({ color: 0x3b2430, roughness: 0.55 });
    this.madeira = new THREE.MeshStandardMaterial({ color: 0x5b3a26, roughness: 0.6 });
    this.pe = new THREE.MeshStandardMaterial({ color: 0x2c2028, roughness: 0.7 });
    const anel = estadio(RAIO);
    anel.holes.push(estadio(RAIO - TRILHO));
    const chanfro = 0.014;
    const beirada = new THREE.Mesh(deitar(new THREE.ExtrudeGeometry(anel, { depth: 0.05, bevelEnabled: true, bevelThickness: chanfro, bevelSize: chanfro, bevelSegments: 5, curveSegments: 48 })), this.couro);
    beirada.position.y = MESA - 0.05 - chanfro;
    beirada.receiveShadow = true;
    const saia = new THREE.Mesh(deitar(new THREE.ExtrudeGeometry(estadio(RAIO - 0.03), { depth: 0.09, bevelEnabled: false, curveSegments: 48 })), this.madeira);
    saia.position.y = MESA - 0.064 - 0.09;
    const coluna = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, MESA - 0.15, 32), this.pe);
    coluna.position.y = (MESA - 0.15) / 2;
    const base = new THREE.Mesh(deitar(new THREE.ExtrudeGeometry(estadio(0.42), { depth: 0.04, bevelEnabled: false, curveSegments: 32 })).scale(0.62, 1, 0.7), this.pe);
    this.cena.add(this.feltro, pano, beirada, saia, coluna, base, this.sombraDasFichas.malha, this.sombraDasCartas.malha);

    this.baralho = new THREE.Mesh(this.geoBaralho);
    this.baralho.visible = false;
    this.botao = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.007, 36), materiaisDoBotao());
    this.botao.visible = false;
    for (const m of [this.baralho, this.botao]) m.castShadow = m.receiveShadow = true;
    this.cena.add(this.baralho, this.botao);

    // quem chega no meio da partida é modelado em segundo plano: quando fica pronto, senta
    // (fora do aviso: sentar alguém pode pedir outra roupa, que avisa de novo)
    this.desligar.push(useModelos.subscribe(() => queueMicrotask(() => this.sincronizarAtores())));
    void prepararClipes()
      .then(() => this.sincronizarAtores())
      .catch(() => {});
    const medir = () => this.medir();
    window.addEventListener('resize', medir);
    this.desligar.push(() => window.removeEventListener('resize', medir));
    this.medir();
    this.quadroPedido = requestAnimationFrame(this.quadro);
  }

  // ─────────────────────────────── o estado da partida ───────────────────────────────

  /** O estado da partida mudou (ou os cosméticos): a cena parada se ajusta a ele. */
  atualizar(e: EntradaDaCena) {
    this.entrada = e;
    const v = e.view;
    const chave = `${v.maxPlayers}:${v.mySeat}`;
    if (chave !== this.chaveDoGeo) {
      this.chaveDoGeo = chave;
      this.geo = seatLayout3d(v.maxPlayers, v.mySeat ?? 0, v.mySeat !== null);
      for (const a of this.ancoras) a.removeFromParent();
      this.ancoras = this.geo.map((g) => {
        const a = new THREE.Group();
        a.position.set(g.lugar.x, 0, g.lugar.z);
        a.rotation.set(0, g.lugar.giro, 0);
        a.updateMatrixWorld(true);
        this.cena.add(a);
        return a;
      });
      for (const [seat, ator] of this.atores) {
        const g = this.geo[seat];
        ator.semCabeca(seat === v.mySeat);
        if (g) ator.sentar(g.lugar);
        if (g) ator.descansar(clipe(DESCANSOS[g.vis]) ?? clipe('idle-plana')!);
      }
    }
    const k = chaveDoEstilo(e.mesa);
    if (k !== this.estiloDaMesa) {
      this.estiloDaMesa = k;
      this.feltro.material.map = texturaDoFeltro(e.mesa);
      this.feltro.material.needsUpdate = true;
      this.couro.color.set(e.mesa.rail);
      this.madeira.color.set(shade(e.mesa.rail, -0.25));
      this.pe.color.set(shade(e.mesa.rail, -0.55));
    }
    this.baralho.material = materiaisDoBaralho(e.cartas.back);
    // a aposta que o estado já conta: o punhado pousado sai de cena
    for (const [seat, a] of this.apostando) if ((v.seats[seat]?.bet ?? 0) !== a.antes && a.estado === 'pousou') this.apostando.delete(seat);
    this.sincronizarAtores();
  }

  /** Senta quem está na mesa (quando o modelo dele está pronto) e levanta quem saiu. */
  private sincronizarAtores() {
    const e = this.entrada;
    if (!e) return;
    const v = e.view;
    if (!clipesProntos()) {
      // (sem as animações ainda não dá para sentar ninguém; mas a modelagem já pode correr)
      v.seats.forEach((s, seat) => s && void prepararRoupa(vestido(e.personagemDe(seat), e.acessoriosDe?.(seat)?.luva)).catch(() => {}));
      return;
    }
    for (const [seat, ator] of this.atores) {
      const s = v.seats[seat];
      // (trocou de personagem, ou de acessórios: o personagem é refeito)
      if (!s || !this.geo[seat] || e.personagemDe(seat) !== ator.personagem || chaveDosAcessorios(e.acessoriosDe?.(seat) ?? SEM_ACESSORIOS) !== ator.enfeites) {
        ator.destruir();
        this.atores.delete(seat);
      }
    }
    v.seats.forEach((s, seat) => {
      const g = this.geo[seat];
      if (!s || !g || this.atores.has(seat)) return;
      const id = e.personagemDe(seat);
      const acessorios = e.acessoriosDe?.(seat) ?? SEM_ACESSORIOS;
      // (a roupa é a do traje com a luva que o jogador escolheu)
      const comLuva = vestido(id, acessorios.luva);
      const modelo = modeloPronto(comLuva);
      if (!modelo) {
        // (ainda não: começa a modelar; o aviso do andamento chama isto de novo)
        void prepararRoupa(comLuva).catch(() => {});
        return;
      }
      const ator = new Ator(id, modelo.corpo, modelo.roupa, acessorios);
      if (this.comBaralho === seat) this.comBaralho = null;
      ator.tela(this.medida.l || 1600, this.medida.a || 900);
      ator.semCabeca(seat === v.mySeat);
      ator.sentar(g.lugar);
      ator.descansar(clipe(DESCANSOS[g.vis]) ?? clipe('idle-plana')!);
      this.cena.add(ator.grupo);
      this.atores.set(seat, ator);
    });
  }

  // ─────────────────────────────── pontos da mesa ───────────────────────────────

  /** Um ponto do espaço do personagem do assento, no mundo. */
  private doAssento(seat: number, x: number, y: number, z: number): THREE.Vector3 {
    const a = this.ancoras[seat];
    return a ? a.localToWorld(V(x, y, z)) : V(x, y, z);
  }

  /** O giro (em volta do eixo vertical) do assento. */
  private giroDo(seat: number): number {
    return this.geo[seat]?.lugar.giro ?? 0;
  }

  private doPlano(p: Pt, alto = 0): THREE.Vector3 {
    const w = planoParaMundo(p);
    return V(w.x, MESA + alto, w.z);
  }

  /** As cartas fechadas paradas na frente de um jogador: as duas de "olhar as cartas", ou um leque. */
  private repouso(n: number): Posta[] {
    let r = this.repousos.get(n);
    if (r) return r;
    const [cx, cz] = MARCAS.cartas;
    const olhar = n === 2 ? clipe('olhar') : undefined;
    if (olhar?.objetos) {
      // (as do instante 0 da animação: é dali que as mãos as levantam)
      r = olhar.objetos(0, new Boneco(esqueletoDoJogo())).map((o) => ({ pos: o.pos.clone(), quat: o.quat.clone() }));
    } else {
      r = Array.from({ length: n }, (_, i) => {
        const k = i - (n - 1) / 2;
        return { pos: V(cx + k * 0.024, MESA + CARTA.alto * (i + 0.5), cz + Math.abs(k) * 0.004), quat: new THREE.Quaternion().setFromAxisAngle(EIXO_Y, -k * 0.09) };
      });
    }
    // (o leque provisório das duas cartas não fica guardado: quando as animações ficarem prontas, valem as delas)
    if (n !== 2 || olhar) this.repousos.set(n, r);
    return r;
  }

  /** Onde está (no mundo) a carta `i` de `n` parada na frente de um jogador, e o giro dela. */
  private cartaDoAssento(seat: number, i: number, n: number): { pos: THREE.Vector3; giro: number } {
    const r = this.repouso(n)[Math.min(i, n - 1)] ?? { pos: V(MARCAS.cartas[0], MESA, MARCAS.cartas[1]), quat: new THREE.Quaternion() };
    const e = new THREE.Euler().setFromQuaternion(r.quat, 'YXZ');
    return { pos: this.doAssento(seat, r.pos.x, r.pos.y, r.pos.z), giro: this.giroDo(seat) + e.y };
  }

  /** De onde as cartas saem: o baralho na mão de quem dá as cartas, ou o baralho na mesa. */
  private deOndeSaiACarta(): THREE.Vector3 {
    const d = this.entrada?.view.dealerSeat;
    if (d === null || d === undefined) return this.doPlano(MUCK_POS, 0.01);
    const ator = this.atores.get(d);
    const naMao = soBaralho(ator?.gesto) ? ator!.objetos.find((o) => o.tipo === 'baralho') : undefined;
    if (naMao && ator) return ator.noMundo(naMao.pos.clone().add(V(0, BARALHO.alto / 2, 0)));
    return this.doAssento(d, MARCAS.baralho[0], MESA + BARALHO.alto, MARCAS.baralho[1]);
  }

  private pontoDaPilha(seat: number) {
    return this.doAssento(seat, MARCAS.pilha[0], MESA, MARCAS.pilha[1]);
  }
  private pontoDaAposta(seat: number) {
    return this.doAssento(seat, MARCAS.aposta[0], MESA, MARCAS.aposta[1]);
  }

  // ─────────────────────────────── os pedidos do diretor ───────────────────────────────

  private voar(v: Omit<Voo, 'inicio' | 'dur' | 'pronto'> & { ms: number }): Promise<void> {
    const dur = scaled(v.ms);
    if (dur <= 8) return Promise.resolve();
    return new Promise((pronto) => this.voos.push({ ...v, inicio: performance.now(), dur, pronto }));
  }

  apostar(seat: number, valor: number): Promise<void> {
    const ator = this.atores.get(seat);
    const fichas = clipe('fichas');
    const s = this.entrada?.view.seats[seat];
    if (!ator || !fichas || valor <= 0) {
      // sem personagem (ainda modelando): as fichas voam da pilha para a aposta
      return this.voar({ tipo: 'fichas', de: this.pontoDaPilha(seat), ate: this.pontoDaAposta(seat), giroDe: 0, giroAte: 0, arco: 0.06, some: false, valor, estilo: this.entrada?.fichaDe(seat), ms: VOO.aposta });
    }
    return new Promise((pronto) => {
      const a: Apostando = { valor, antes: s?.bet ?? 0, estado: 'pilha', objs: [] };
      this.apostando.set(seat, a);
      // os pontos do clipe (no espaço do personagem) para saber onde o punhado está
      const [px, pz] = MARCAS.pilha;
      const [ax, az] = MARCAS.aposta;
      let avisou = false;
      const avisar = () => {
        if (!avisou) {
          avisou = true;
          pronto();
        }
      };
      ator.tocar(fichas, {
        vel: 1.7,
        aoAndar: (_t, objs, fim) => {
          const punhado = objs.slice(-NO_PUNHADO);
          a.objs = punhado;
          const p = punhado[0]?.pos;
          if (p) {
            const naPilha = Math.hypot(p.x - px, p.z - pz) < 0.004;
            const naAposta = Math.hypot(p.x - ax, p.z - az) < 0.004 && p.y < MESA + 0.02;
            if (naAposta) a.estado = 'pousou';
            else if (!naPilha) a.estado = 'mao';
          }
          if (a.estado === 'pousou') avisar();
          if (fim) {
            avisar();
            if (this.apostando.get(seat) === a) this.apostando.delete(seat);
          }
        },
      });
      // (uma rede: se o gesto não acabar — a aba escondida, um clipe diferente —, a mesa não trava)
      setTimeout(avisar, scaled(3200));
    });
  }

  devolver(seat: number, valor: number): Promise<void> {
    return this.voar({ tipo: 'fichas', de: this.pontoDaAposta(seat), ate: this.pontoDaPilha(seat), giroDe: 0, giroAte: 0, arco: 0.04, some: true, valor, estilo: this.entrada?.fichaDe(seat), ms: VOO.aposta });
  }

  bater(seat: number, aoBater?: () => void): boolean {
    const ator = this.atores.get(seat);
    if (!ator || ator.ocupado) return false;
    const ids = ['check-nos', 'check-dedos', 'check-palma'];
    const c = clipe(ids[Math.floor(Math.random() * ids.length)]);
    if (!c) return false;
    // (avisa a cada vez que a mão bate na mesa: é quando o som toca)
    const batidas = BATIDAS[c.id] ?? [];
    let dadas = 0;
    ator.tocar(c, {
      vel: 1.35,
      aoAndar: (t) => {
        while (dadas < batidas.length && t >= batidas[dadas]) {
          dadas++;
          aoBater?.();
        }
      },
    });
    return batidas.length > 0;
  }

  /** Uma carta que voa sozinha do baralho para a frente de um jogador: o jeito simples, para quando o dealer não está em cena. */
  private darCarta(seat: number, i: number, n: number): Promise<void> {
    // quem dá as cartas faz o gesto de entregar enquanto elas saem
    const d = this.entrada?.view.dealerSeat;
    const entregar = clipe('entregar');
    if (d !== null && d !== undefined && entregar) {
      const dealer = this.atores.get(d);
      if (dealer && !soBaralho(dealer.gesto) && !dealer.ocupado) dealer.tocar(entregar, { vel: 1.5, laco: true });
      this.entregando = { seat: d, ate: performance.now() + scaled(700) + 400 };
    }
    const alvo = this.cartaDoAssento(seat, i, n);
    return this.voar({ tipo: 'carta', de: this.deOndeSaiACarta(), ate: alvo.pos, giroDe: this.giroDo(d ?? seat), giroAte: alvo.giro, arco: 0.05, some: false, ms: VOO.carta });
  }

  olharCartas(seats: number[]) {
    const olhar = clipe('olhar');
    if (!olhar) return;
    for (const seat of seats) {
      const ator = this.atores.get(seat);
      const s = this.entrada?.view.seats[seat];
      // (eu não espio: as minhas cartas estão abertas, grandes, embaixo da tela)
      // (nem quem está com o baralho na mão: é a esquerda que esconde as cartas)
      if (!ator || !s || seat === this.entrada?.view.mySeat || seat === this.comBaralho || s.cards.length !== 2) continue;
      setTimeout(() => {
        if (!ator.ocupado && !s.folded) ator.tocar(olhar, { vel: 1.25 });
      }, 150 + Math.random() * 900);
    }
  }

/**
   * O dealer faz o gesto `montar()` (guardado por `chave`) e avisa a saída e a chegada de cada carta
   * dele. Sem o personagem do dealer (ainda modelando), sem as animações, ou se o gesto não puder ser
   * montado, devolve null: quem chama faz as cartas voarem do jeito simples.
   */
  private entregar(e: Omit<Entrega, 'chegou' | 'saiu' | 'dealer'>, quantas: number, tempo: number, chave: string, montar: (b: Boneco, l: SeatGeo3D['lugar']) => Clipe, aoChegar: (k: number) => void, aoSair?: (k: number) => void): Promise<void> | null {
    const d = this.entrada?.view.dealerSeat;
    const dealer = d !== null && d !== undefined ? this.atores.get(d) : undefined;
    const l = d !== null && d !== undefined ? this.geo[d]?.lugar : undefined;
    if (d === null || d === undefined || !dealer || !l || !clipesProntos() || quantas <= 0) return null;
    const k = `${this.chaveDoGeo}:${d}:${chave}`;
    if (!this.entregas.has(k)) {
      let c: Clipe | undefined;
      try {
        c = montar(bonecoDeConta(), l);
      } catch (err) {
        console.warn('[mesa 3D] sem o gesto de entregar', err);
      }
      this.entregas.set(k, c);
    }
    const gesto = this.entregas.get(k);
    if (!gesto) return null;
    // (o gesto inteiro — com a mão indo ao baralho e voltando — no tempo dado)
    const vel = Math.max(VEL_MINIMA_DA_ENTREGA, (gesto.dur * 1000) / tempo);
    return new Promise((pronto) => {
      const entrega: Entrega = { ...e, dealer: d, chegou: new Set(), saiu: new Set() };
      this.entrega = entrega;
      let acabou = false;
      const acabar = () => {
        if (acabou) return;
        acabou = true;
        // (o que não chegou a pousar — o gesto foi interrompido — conta como chegado: a mesa não fica sem carta)
        for (let i = 0; i < quantas; i++) {
          if (!entrega.chegou.has(i)) {
            entrega.chegou.add(i);
            aoChegar(i);
          }
        }
        pronto();
      };
      const repartir = () =>
        dealer.tocar(gesto, {
          vel,
          aoAndar: (_t, objs, fim) => {
            for (const o of objs) {
              if (o.tipo !== 'carta' || o.n === undefined) continue;
              // (`pousada` só existe depois que a carta sai da mão: no baralho e na mão ela não vem)
              if (o.pousada !== undefined && !entrega.saiu.has(o.n)) {
                entrega.saiu.add(o.n);
                aoSair?.(o.n);
              }
              if (o.pousada && !entrega.chegou.has(o.n)) {
                entrega.chegou.add(o.n);
                aoChegar(o.n);
              }
            }
            if (entrega.chegou.size >= quantas || fim) acabar();
            if (fim && this.entrega === entrega) this.entrega = null;
            if (fim && e.ultimas) void this.largarBaralho();
          },
        });
      // quem ainda não está com o baralho na mão pega-o primeiro, de onde ele fica na mesa — e fica com ele até o fim da mão
      const pega = this.comBaralho === d ? undefined : clipe('pegar-baralho');
      const segura = maoQueSegura();
      if (!pega || !segura) repartir();
      else {
        let passou = false;
        dealer.tocar(pega, {
          vel: Math.max(VEL_MINIMA_DA_ENTREGA, (pega.dur * 1000) / TEMPO_DE_PEGAR),
          aoAndar: (t, _objs, fim) => {
            if (!fim || passou) return;
            passou = true;
            if (t >= pega.dur - 1e-6) {
              this.comBaralho = d;
              for (const [outro, a] of this.atores) if (outro !== d) a.segurar(null);
              dealer.segurar(segura, clipe('idle-plana'));
              repartir();
            } else {
              // (interrompido antes de pegar: as cartas contam como entregues, e o baralho fica na mesa)
              acabar();
              if (this.entrega === entrega) this.entrega = null;
            }
          },
        });
      }
      // (uma rede: se o gesto não andar — a aba escondida —, a mesa não trava)
      setTimeout(acabar, scaled((gesto.dur / vel) * 1000 + TEMPO_DE_PEGAR) + 1500);
    });
  }

  darCartas(cartas: { seat: number; i: number; n: number }[], aoChegar: (k: number) => void, aoSair?: (k: number) => void): Promise<void> {
    const feita = this.entregar(
      { daMao: cartas },
      cartas.length,
      tempoDeRepartir(cartas.length) + 500,
      'mao:' + cartas.map((c) => `${c.seat}.${c.i}.${c.n}`).join(','),
      (b, l) =>
        entregarCartas(
          b,
          cartas.map((c) => {
            // onde a carta fica parada na frente de quem a recebe, visto do dealer
            const a = this.cartaDoAssento(c.seat, c.i, c.n);
            return { alvo: vistoDoLugar(l, [a.pos.x, a.pos.z]), giro: a.giro - l.giro };
          }),
          { cada: RITMO_MAIS_LIGEIRO },
          'entregar-mao',
        ),
      aoChegar,
      aoSair,
    );
    if (feita) return feita;
    // sem o dealer em cena: as cartas voam do baralho, uma atrás da outra
    return Promise.all(
      cartas.map(
        (c, k) =>
          new Promise<void>((pronto) =>
            setTimeout(() => {
              aoSair?.(k);
              void this.darCarta(c.seat, c.i, c.n).then(() => {
                aoChegar(k);
                pronto();
              });
            }, scaled(165 * k)),
          ),
      ),
    ).then(() => {});
  }

  abrirMesa(cartas: Card[], jaNaMesa: number, aoChegar: (k: number) => void): Promise<void> {
    // os lugares das cartas novas, no tampo (os mesmos das cartas 2D que tomam o lugar delas)
    const ate = cartas.map((_, k) => this.doPlano(boardSlot(jaNaMesa + k), CARTA.alto));
    const feita = this.entregar(
      { daMesa: { cartas, jaNaMesa, ate }, ultimas: jaNaMesa + cartas.length >= 5 },
      cartas.length,
      cartas.length > 1 ? TEMPO_DE_ABRIR.flop : TEMPO_DE_ABRIR.uma,
      `mesa:${jaNaMesa}+${cartas.length}`,
      // (deitadas como as 2D: ao comprido para o jogador, com o alto da carta para o lado de lá da mesa)
      (b, l) => abrirCartas(b, ate.map((p) => vistoDoLugar(l, [p.x, p.z])), GIRO_DA_ABERTA - l.giro, { cada: 1 }, 'abrir-mesa'),
      aoChegar,
    );
    if (feita) return feita;
    cartas.forEach((_, k) => aoChegar(k));
    return Promise.resolve();
  }

  /**
   * Só quem dá as cartas nesta mão fica com o baralho na mão. O aviso de pousá-lo vem com os eventos
   * da mão (o river, o showdown, o fim dela) — e eles podem não chegar aqui: com a janela em segundo
   * plano a mesa não os toca, e uma ressincronização os descarta. Então a cena confere por conta
   * própria, a cada quadro: se o dealer mudou, ou se alguém que não é quem a cena sabe que o pegou
   * ainda o segura, o baralho volta para a mesa na hora.
   */
  /** Este lugar tem cartas abertas na frente (as 2D do showdown, ou as que ele está virando)? */
  private comAbertas(seat: number): boolean {
    if (this.viradas.has(seat)) return true;
    const v = this.entrada?.view;
    const s = v?.seats[seat];
    if (!v || !s || !s.cards.some(Boolean)) return false;
    // (as minhas só ficam abertas na mesa no showdown; até lá estão na minha mão, embaixo da tela)
    return seat === v.mySeat ? !!s.handName && !s.folded : true;
  }

  /**
   * O descanso de cada um: o de sempre — ou, com cartas abertas na frente, o de mãos fora delas. As
   * cartas abertas são 2D, desenhadas por cima de tudo o que é 3D: uma mão descansando em cima delas
   * apareceria debaixo delas.
   */
  private descansos() {
    const v = this.entrada?.view;
    for (const [seat, ator] of this.atores) {
      const g = this.geo[seat];
      if (!g) continue;
      let quer = clipe(DESCANSOS[g.vis]) ?? clipe('idle-plana');
      if (this.comAbertas(seat)) {
        const n = v?.seats[seat]?.cards.length ?? 2;
        // (as duas do hold'em ficam onde a mão as deixou ao virá-las; as outras, onde estavam fechadas)
        const r = n === 2 ? undefined : this.repouso(n);
        const fora = r && { x0: Math.min(...r.map((c) => c.pos.x)) - CARTA_ABERTA.comp / 2, x1: Math.max(...r.map((c) => c.pos.x)) + CARTA_ABERTA.comp / 2, z0: Math.min(...r.map((c) => c.pos.z)) - CARTA_ABERTA.comp / 2, z1: Math.max(...r.map((c) => c.pos.z)) + CARTA_ABERTA.comp / 2 };
        quer = descansoComAbertas(fora) ?? quer;
      }
      if (quer && ator.descansando !== quer.id) ator.descansar(quer);
    }
  }

  private soODealerSegura() {
    // (a pilha do descarte é da mão em que foi feita: se a seguinte começou sem recolhê-la, some)
    if (this.descarte.length && this.maoDoDescarte !== undefined && this.entrada?.view.handNo !== this.maoDoDescarte) {
      this.descarte = [];
      this.maoDoDescarte = undefined;
    }
    // (e os brilhos das cartas de quem ganhou são da mão em que ele ganhou: na seguinte, acabam)
    if (this.brilhando.size && this.entrada?.view.handNo !== this.maoDosBrilhos) this.brilhando.clear();
    const d = this.entrada?.view.dealerSeat ?? null;
    if (this.comBaralho !== null && this.comBaralho !== d && this.largando?.seat !== this.comBaralho) this.comBaralho = null;
    for (const [seat, ator] of this.atores) if (ator.seguraOBaralho && seat !== this.comBaralho) ator.segurar(null);
  }

  /**
   * Quem está com o baralho o pousa de volta no lugar dele na mesa: depois da última carta da mesa, e
   * quando a mão acaba antes disso. (No meio de outro gesto — apostando —, espera ele acabar.)
   */
  largarBaralho(): Promise<void> {
    const seat = this.comBaralho;
    if (seat === null) return Promise.resolve();
    if (this.largando?.seat === seat) return this.largando.fim;
    const ator = this.atores.get(seat);
    const pousa = clipe('pousar-baralho');
    if (!ator || !pousa) {
      ator?.segurar(null);
      this.comBaralho = null;
      return Promise.resolve();
    }
    const fim = new Promise<void>((pronto) => {
      let feito = false;
      const pousado = () => {
        if (feito) return;
        feito = true;
        ator.segurar(null);
        if (this.comBaralho === seat) this.comBaralho = null;
        if (this.largando?.seat === seat) this.largando = null;
        pronto();
      };
      let tentativas = 0;
      const comeca = () => {
        if (feito || this.comBaralho !== seat) return pousado();
        if (ator.ocupado && tentativas++ < 25) {
          setTimeout(comeca, 100);
          return;
        }
        // (o gesto leva o baralho na mão dele: a esquerda deixa de segurá-lo por conta própria)
        ator.segurar(null);
        ator.tocar(pousa, { vel: VEL_DE_POUSAR, aoAndar: (_t, _objs, acabou) => acabou && pousado() });
        setTimeout(pousado, scaled((pousa.dur / VEL_DE_POUSAR) * 1000) + 2500);
      };
      comeca();
    });
    this.largando = { seat, fim };
    return fim;
  }

  virarCartas(seat: number, cartas: Card[]): Promise<void> {
    // (quem está pousando o baralho vira as cartas dele quando acabar)
    if (this.largando?.seat === seat) return this.largando.fim.then(() => this.virarCartas(seat, cartas));
    const ator = this.atores.get(seat);
    const gesto = clipe('virar-pilha');
    // (o gesto é o das duas cartas do hold'em; sem ele — ou sem o personagem — as cartas abrem na hora)
    if (!ator || !gesto || cartas.length !== 2) return Promise.resolve();
    this.viradas.set(seat, cartas);
    return new Promise((pronto) => {
      let feito = false;
      const abriu = () => {
        if (feito) return;
        feito = true;
        pronto();
      };
      ator.tocar(gesto, {
        vel: VEL_DE_VIRAR,
        aoAndar: (_t, objs, fim) => {
          if (fim || objs.every((o) => o.tipo !== 'carta' || o.aberta)) abriu();
          if (fim && this.viradas.get(seat) === cartas) this.viradas.delete(seat);
        },
      });
      setTimeout(abriu, scaled((gesto.dur / VEL_DE_VIRAR) * 1000) + 1000);
    });
  }

  /**
   * Por onde curvar o caminho de `de` a `ate` para não passar por baixo das cartas abertas do meio da
   * mesa (que são 2D, por cima de tudo o que é 3D): undefined se o caminho reto já passa por fora;
   * senão, o ponto de controle de uma curva que dá a volta por um dos cantos delas.
   */
  private contorno(de: THREE.Vector3, ate: THREE.Vector3): THREE.Vector3 | undefined {
    const M = CARTAS_DO_MEIO;
    const cruza = (por?: THREE.Vector3) => {
      for (let k = 1; k < 28; k++) {
        const u = k / 28;
        const x = por ? (1 - u) * (1 - u) * de.x + 2 * u * (1 - u) * por.x + u * u * ate.x : de.x + (ate.x - de.x) * u;
        const z = por ? (1 - u) * (1 - u) * de.z + 2 * u * (1 - u) * por.z + u * u * ate.z : de.z + (ate.z - de.z) * u;
        if (Math.abs(x) < M.x && z > M.z0 && z < M.z1) return true;
      }
      return false;
    };
    if (!cruza()) return undefined;
    // a curva que passa, no meio, por um ponto além de um canto: o canto (e a folga) que dá o caminho mais curto
    let melhor: THREE.Vector3 | undefined;
    let menor = Infinity;
    for (const folga of [0.05, 0.1, 0.17, 0.26]) {
      for (const cx of [-1, 1]) {
        for (const cz of [M.z0 - folga, M.z1 + folga]) {
          const canto = V(cx * (M.x + folga), 0, cz);
          const por = V(2 * canto.x - (de.x + ate.x) / 2, de.y, 2 * canto.z - (de.z + ate.z) / 2);
          const comprido = Math.hypot(canto.x - de.x, canto.z - de.z) + Math.hypot(ate.x - canto.x, ate.z - canto.z);
          if (comprido < menor && !cruza(por)) {
            menor = comprido;
            melhor = por;
          }
        }
      }
      if (melhor) break;
    }
    return melhor;
  }

  /** Uma carta fechada vai, rente ao feltro, de onde está para a pilha do descarte — e fica lá. */
  private paraODescarte(de: THREE.Vector3, giroDe: number, ms = VOO.descarte + 160): Promise<void> {
    // o lugar dela no monte: em cima das que já estão (e das que vêm a caminho), um pouco fora de esquadro
    const i = this.descarte.length + this.aCaminhoDoDescarte++;
    this.maoDoDescarte ??= this.entrada?.view.handNo;
    const ate = V(DESCARTE[0] + jitter(977, i) * 0.014, MESA + CARTA.alto * (i + 0.5), DESCARTE[1] + jitter(977, i, 5) * 0.014);
    const giro = giroDe + 1.6 + jitter(977, i, 9) * 1.3;
    const sai = V(de.x, Math.max(de.y, MESA + CARTA.alto / 2), de.z);
    return this.voar({ tipo: 'carta', de: sai, ate, por: this.contorno(sai, ate), giroDe, giroAte: giro, arco: 0.006, some: false, ms }).then(() => {
      this.aCaminhoDoDescarte = Math.max(0, this.aCaminhoDoDescarte - 1);
      this.descarte.push({ pos: ate, giro });
    });
  }

  desistir(seat: number, quantas: number, aoLancar?: () => void): Promise<void> {
    if (quantas <= 0) return Promise.resolve();
    // com o gesto de desistir, a mão junta as duas cartas e as lança para o monte do meio da mesa
    const ator = this.atores.get(seat);
    const gesto = ator && quantas === 2 ? this.clipeDeDesistir(seat) : undefined;
    if (gesto && ator) {
      // (avisa quando as cartas saem da mão: é quando o som toca)
      // — e é dali que elas passam a ser da cena: vão para a pilha do descarte, a mesma de todos)
      let lancou = false;
      this.lancou.delete(seat);
      ator.tocar(gesto, {
        vel: 1.4,
        aoAndar: (t, objs, fim) => {
          if (fim) this.lancou.delete(seat);
          if (lancou || (t < DESISTIR_SOLTA && !fim)) return;
          lancou = true;
          if (!fim) this.lancou.add(seat);
          if (t >= DESISTIR_SOLTA) aoLancar?.();
          // (de onde a mão as largou — ou, se o gesto foi interrompido antes, de onde estavam)
          const daMao = objs.filter((o) => o.tipo === 'carta');
          for (let i = 0; i < quantas; i++) {
            const o = daMao[i];
            const c = this.cartaDoAssento(seat, i, quantas);
            const giro = o ? this.giroDo(seat) + new THREE.Euler().setFromQuaternion(o.quat, 'YXZ').y : c.giro;
            void this.paraODescarte(o ? ator.noMundo(o.pos.clone()) : c.pos, giro);
          }
        },
      });
      return new Promise((r) => setTimeout(r, scaled(450)));
    }
    aoLancar?.();
    for (let i = 0; i < quantas; i++) {
      const c = this.cartaDoAssento(seat, i, quantas);
      void this.paraODescarte(c.pos, c.giro);
    }
    return new Promise((r) => setTimeout(r, scaled(VOO.descarte)));
  }

  /**
   * O gesto de desistir deste assento: as cartas saem de onde estão paradas (as de "olhar as
   * cartas") e vão para o monte, no meio da mesa — dito no espaço do personagem. Montar o clipe custa
   * algumas dezenas de milissegundos: é feito uma vez por assento (e por arrumação da mesa).
   */
  private clipeDeDesistir(seat: number): Clipe | undefined {
    const l = this.geo[seat]?.lugar;
    if (!l || !clipesProntos()) return undefined;
    const k = `${this.chaveDoGeo}:${seat}`;
    if (this.desistencias.has(k)) return this.desistencias.get(k);
    let c: Clipe | undefined;
    try {
      const [a, b] = this.repouso(2);
      // as cartas vão para a pilha do descarte (a mesma de todos); quem tem as cartas abertas do meio
      // da mesa no caminho lança-as no rumo da curva que dá a volta nelas
      const daqui = this.doAssento(seat, (a.pos.x + b.pos.x) / 2, MESA, (a.pos.z + b.pos.z) / 2);
      const pilha = V(DESCARTE[0], MESA, DESCARTE[1]);
      const por = this.contorno(daqui, pilha);
      const para: [number, number] = por ? [por.x, por.z] : [pilha.x, pilha.z];
      c = desistirDaMao(bonecoDeConta(), { cartas: [[a.pos.x, a.pos.z], [b.pos.x, b.pos.z]], alvo: vistoDoLugar(l, para) });
    } catch (err) {
      console.warn('[mesa 3D] sem o gesto de desistir', err);
    }
    this.desistencias.set(k, c);
    return c;
  }

  descartar(seat: number, indices: number[], n: number): Promise<void> {
    return Promise.all(
      indices.map((i) => {
        const c = this.cartaDoAssento(seat, i, n);
        return this.paraODescarte(c.pos, c.giro, VOO.descarte);
      }),
    ).then(() => {});
  }

  recolherCartas(paraSeat: number | null, cartas: { seat: number; n: number }[]): Promise<void> {
    this.brilhando.clear();
    // (a mão acabou: se alguém ainda está com o baralho, ele volta para a mesa já)
    if (this.comBaralho !== null) {
      this.atores.get(this.comBaralho)?.segurar(null);
      this.comBaralho = null;
    }
    const ate = paraSeat !== null && this.geo[paraSeat] ? this.doAssento(paraSeat, MARCAS.baralho[0], MESA + BARALHO.alto, MARCAS.baralho[1]) : this.doPlano(MUCK_POS, 0.01);
    const voos = cartas.flatMap(({ seat, n }) =>
      Array.from({ length: n }, (_, i) => {
        const c = this.cartaDoAssento(seat, i, n);
        return this.voar({ tipo: 'carta', de: c.pos, ate, giroDe: c.giro, giroAte: this.giroDo(paraSeat ?? seat) + Math.PI / 2, arco: 0.04, some: true, ms: VOO.recolher });
      }),
    );
    // e a pilha do descarte vai junto (as de cima voam; o resto some com elas)
    for (const c of this.descarte.slice(-10)) voos.push(this.voar({ tipo: 'carta', de: c.pos, ate, giroDe: c.giro, giroAte: this.giroDo(paraSeat ?? 0) + Math.PI / 2, arco: 0.04, some: true, ms: VOO.recolher }));
    this.descarte = [];
    this.maoDoDescarte = undefined;
    return Promise.all(voos).then(() => {});
  }

  recolherApostas(apostas: { seat: number; valor: number }[]): Promise<void> {
    const pote = this.doPlano(POTE_3D);
    const estilo = this.entrada?.fichaDoPote;
    return Promise.all(
      apostas.map((a) => this.voar({ tipo: 'fichas', de: this.pontoDaAposta(a.seat), ate: pote, giroDe: 0, giroAte: 0, arco: 0.05 + Math.random() * 0.03, some: true, valor: a.valor, estilo: this.entrada?.fichaDe(a.seat) ?? estilo, ms: VOO.recolherFichas + Math.random() * 120 })),
    ).then(() => {});
  }

  pagar(seat: number, valor: number): Promise<void> {
    const estilo = this.entrada?.fichaDoPote;
    const direto = () => this.voar({ tipo: 'fichas', de: this.doPlano(POTE_3D), ate: this.pontoDaPilha(seat), giroDe: 0, giroAte: 0, arco: 0.1, some: true, valor, estilo, ms: VOO.pote });
    const ator = this.atores.get(seat);
    // (com as cartas abertas na frente, o gesto parte do descanso de mãos fora delas, e volta para ele)
    const gesto = (this.comAbertas(seat) ? clipe('ganhar-abertas') : undefined) ?? clipe('ganhar');
    // (sem o personagem ou o gesto — ou já puxando outro pote —, as fichas voam direto para a pilha dele)
    if (!ator || !gesto || !this.geo[seat] || this.ganhando.has(seat)) return direto();
    // (quem está pousando o baralho puxa o pote quando acabar)
    if (this.largando?.seat === seat) return this.largando.fim.then(() => this.pagar(seat, valor));
    // O pote voa do meio da mesa e pousa na frente de quem ganhou no instante em que a mão dele chega
    // para puxá-lo; dali vai com as pontas dos dedos até junto da pilha dele — e a outra mão comemora.
    const g = { valor, estilo, naMesa: false, t: 0 };
    this.ganhando.set(seat, g);
    void this.voar({ tipo: 'fichas', de: this.doPlano(POTE_3D), ate: this.doAssento(seat, GANHAR.chega[0], MESA, GANHAR.chega[1]), giroDe: 0, giroAte: 0, arco: 0.1, some: false, valor, estilo, ms: (GANHAR.toca / VEL_DE_GANHAR) * 1000 }).then(() => {
      g.naMesa = true;
    });
    return new Promise((pronto) => {
      let feito = false;
      const puxou = () => {
        if (feito) return;
        feito = true;
        if (this.ganhando.get(seat) === g) this.ganhando.delete(seat);
        pronto();
      };
      ator.tocar(gesto, {
        vel: VEL_DE_GANHAR,
        aoAndar: (t, _objs, fim) => {
          g.t = t;
          if (t >= GANHAR.solta || fim) puxou();
        },
      });
      setTimeout(puxou, scaled((GANHAR.solta / VEL_DE_GANHAR) * 1000) + 1500);
    });
  }

  brilhar(quem: { seat: number; cor: string }[]) {
    this.brilhando.clear();
    this.maoDosBrilhos = this.entrada?.view.handNo;
    for (const { seat, cor } of quem) this.brilhando.set(seat, new THREE.Color(cor));
  }

  // ─────────────────────────────── o quadro ───────────────────────────────

  private medir() {
    const r = this.tela.getBoundingClientRect();
    if (!r.width || !r.height) return;
    // a mesa é desenhada no tamanho em que aparece na tela (o palco é escalado), com um teto
    const razao = Math.min(window.devicePixelRatio || 1, 1.75);
    let l = Math.round(r.width * razao);
    let a = Math.round(r.height * razao);
    const teto = 2560;
    if (l > teto) {
      a = Math.round((a * teto) / l);
      l = teto;
    }
    // a tela ocupa a janela inteira, com o palco no meio: a lente abre o que passa dele (em unidades
    // do palco, que é como o CSS a mede — a escala do palco não entra)
    const lente = lenteDaTela(this.tela.clientWidth / STAGE_W || 1, this.tela.clientHeight / STAGE_H || 1);
    if (l === this.medida.l && a === this.medida.a && Math.abs(lente.aspecto - this.camera.aspect) < 1e-4 && Math.abs(lente.fov - this.camera.fov) < 1e-4) return;
    this.medida = { l, a };
    for (const ator of this.atores.values()) ator.tela(l, a);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(l, a, false);
    this.camera.fov = lente.fov;
    this.camera.aspect = lente.aspecto;
    this.camera.updateProjectionMatrix();
  }

  private readonly quadro = (agora: number) => {
    this.quadroPedido = requestAnimationFrame(this.quadro);
    if (document.hidden) return;
    const dt = Math.min(0.1, (agora - this.antes) / 1000);
    this.antes = agora;
    if (this.quadros % 30 === 0) this.medir();
    // o dealer para de entregar um pouco depois da última carta
    if (this.entregando && agora > this.entregando.ate) {
      this.atores.get(this.entregando.seat)?.voltarAoDescanso();
      this.entregando = null;
    }
    try {
      const t0 = performance.now();
      this.soODealerSegura();
      this.descansos();
      for (const ator of this.atores.values()) ator.quadro(dt);
      // o pano: um quadro sim, um não, a vez é de um personagem — o que mais esperou (veja
      // `Ator.precisaDePano`); assim o quadro com pano ainda cabe num sexagésimo de segundo
      this.quadroDoPano = !this.quadroDoPano;
      if (this.quadroDoPano) {
        let vez: Ator | undefined;
        for (const ator of this.atores.values()) if (ator.precisaDePano && (!vez || ator.esperaDoPano > vez.esperaDoPano)) vez = ator;
        vez?.passoDoPano();
      }
      const t1 = performance.now();
      this.montar(agora);
      const t2 = performance.now();
      this.renderer.render(this.cena, this.camera);
      const t3 = performance.now();
      // (médias móveis do custo de cada parte do quadro, em ms: para conferir de fora)
      const m = this.custo;
      m.atores += (t1 - t0 - m.atores) * 0.05;
      m.montar += (t2 - t1 - m.montar) * 0.05;
      m.desenho += (t3 - t2 - m.desenho) * 0.05;
    } catch (err) {
      // um quadro que falha não derruba a partida (e o erro aparece uma vez, não sessenta por segundo)
      if (!this.falhou) console.error('[mesa 3D]', err);
      this.falhou = true;
    }
    this.quadros++;
    if (agora - this.desdeFps > 1000) {
      this.fps = (this.quadros * 1000) / (agora - this.desdeFps);
      this.quadros = 0;
      this.desdeFps = agora;
    }
  };

  /** Põe na mesa, neste quadro, tudo o que é ficha e carta: o que está parado, o que as mãos levam e o que voa. */
  private montar(agora: number) {
    for (const f of this.fichas.values()) f.usadas = 0;
    this.sombraDasFichas.usar();
    this.sombraDasCartas.usar();
    let cartasUsadas = 0;
    const e = this.entrada;
    const q = new THREE.Quaternion();
    const matriz = new THREE.Matrix4();
    const um = V(1, 1, 1);
    const pegarCarta = (mats: THREE.Material[], geo: THREE.BufferGeometry = this.geoCarta) => {
      let m = this.cartas[cartasUsadas];
      if (!m) {
        m = new THREE.Mesh(geo, mats);
        m.castShadow = m.receiveShadow = true;
        this.cartas.push(m);
        this.cena.add(m);
      }
      m.geometry = geo;
      m.material = mats;
      m.visible = true;
      m.scale.setScalar(1);
      cartasUsadas++;
      return m;
    };
    /** O brilho em volta de uma carta fechada (de quem ganhou): um clarão da cor do efeito dele, logo abaixo dela, que pulsa. */
    let brilhosUsados = 0;
    const brilho = (carta: THREE.Mesh, cor: THREE.Color) => {
      let m = this.brilhos[brilhosUsados];
      if (!m) {
        this.texturaDoBrilho ??= texturaDoBrilho();
        const geo = new THREE.PlaneGeometry(CARTA.larg * 2.3, CARTA.comp * 2.05).rotateX(-Math.PI / 2);
        m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.texturaDoBrilho, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        m.renderOrder = 2;
        this.brilhos.push(m);
        this.cena.add(m);
      }
      brilhosUsados++;
      m.visible = true;
      // (um nada abaixo da carta, no rumo das costas dela: a carta tapa o meio e o clarão aparece em volta)
      m.quaternion.copy(carta.quaternion);
      m.position.copy(carta.position).add(V(0, -0.0006, 0).applyQuaternion(carta.quaternion));
      m.scale.setScalar(carta.scale.x);
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.color.copy(cor);
      mat.opacity = 0.62 + 0.3 * Math.sin(agora / 170);
    };
    /** Uma ficha neste quadro (as fichas de um mesmo estilo e valor são uma malha só, repetida). */
    const ficha = (st: ChipStyle, ti: number, pos: THREE.Vector3, giro: number) => {
      const k = `${chaveDoEstilo(st)}#${ti}`;
      let f = this.fichas.get(k);
      if (!f) {
        const malha = new THREE.InstancedMesh(this.geoFicha, materiaisDaFicha(st, ti), 256);
        malha.frustumCulled = false;
        malha.castShadow = malha.receiveShadow = true;
        this.cena.add(malha);
        f = { malha, usadas: 0 };
        this.fichas.set(k, f);
      } else if (f.usadas >= f.malha.instanceMatrix.count) {
        // (cresce: refaz com o dobro de lugares, levando o que já foi posto neste quadro)
        const nova = new THREE.InstancedMesh(this.geoFicha, materiaisDaFicha(st, ti), f.malha.instanceMatrix.count * 2);
        (nova.instanceMatrix.array as Float32Array).set(f.malha.instanceMatrix.array as Float32Array);
        nova.frustumCulled = false;
        nova.castShadow = nova.receiveShadow = true;
        f.malha.removeFromParent();
        f.malha.dispose();
        this.cena.add(nova);
        f = { malha: nova, usadas: f.usadas };
        this.fichas.set(k, f);
      }
      q.setFromAxisAngle(EIXO_Y, giro);
      f.malha.setMatrixAt(f.usadas++, matriz.compose(pos, q, um));
    };
    /** Uma coluna de `n` fichas de um valor, de pé em (x, z), começando na altura y0. */
    const coluna = (st: ChipStyle, ti: number, n: number, x: number, z: number, semente: number, y0 = MESA) => {
      // (a sombra de contato da coluna, um nada para o lado em que a sombra cai)
      if (n > 0 && y0 <= MESA + 1e-6) this.sombraDasFichas.por(x + DESVIO_DA_SOMBRA.x, NIVEL_DA_SOMBRA, z + DESVIO_DA_SOMBRA.z, 0);
      for (let i = 0; i < n; i++) {
        // cada ficha sai um tantinho do prumo: a pilha parece feita à mão
        const dx = jitter(semente, ti, i) * 0.0012;
        const dz = jitter(semente, ti, i, 7) * 0.0012;
        ficha(st, ti, V(x + dx, y0 + (i + 0.5) * FICHA.alto, z + dz), hash01(semente, i) * 6.28);
      }
    };
    /** Um monte de fichas que soma `valor`, em colunas lado a lado ao longo de `lado` (um rumo no chão). */
    const monte = (st: ChipStyle, valor: number, centro: THREE.Vector3, lado: THREE.Vector3, semente: number, maxCols = 3, maxAlto = 10) => {
      const cols = breakdown(valor, maxCols, maxAlto);
      cols.forEach((c, i) => {
        const k = i - (cols.length - 1) / 2;
        coluna(st, c.ti, c.count, centro.x + lado.x * k * ENTRE_COLUNAS, centro.z + lado.z * k * ENTRE_COLUNAS, semente + i * 31);
      });
    };

    if (e) {
      const v = e.view;
      const cartaMats = materiaisDaCarta(e.cartas.back, e.cartas.face);
      v.seats.forEach((s, seat) => {
        if (!s || !this.geo[seat]) return;
        const ator = this.atores.get(seat);
        const ap = this.apostando.get(seat);
        const st = e.fichaDe(seat);
        const lado = this.doAssento(seat, 1, 0, 0).sub(this.doAssento(seat, 0, 0, 0));
        // a pilha do jogador: a coluna de onde o punhado sai, e o resto do que ele tem ao lado
        if (s.stack > 0 || ap) {
          const cols = breakdown(s.stack, 4, NA_PILHA);
          const p = this.pontoDaPilha(seat);
          const ti0 = cols[0]?.ti ?? breakdown(Math.max(1, ap?.valor ?? 1))[0]?.ti ?? 0;
          const fora = ap && ap.estado !== 'pilha' ? NA_PILHA - NO_PUNHADO : NA_PILHA;
          coluna(st, ti0, fora, p.x, p.z, seat * 97);
          cols.slice(1).forEach((c, i) => {
            // as outras colunas vão para fora da aposta (para a direita do jogador) e um pouco para trás
            const w = this.doAssento(seat, MARCAS.pilha[0] - (i + 1) * ENTRE_COLUNAS * 1.02, 0, MARCAS.pilha[1] - (i % 2) * 0.012);
            coluna(st, c.ti, c.count, w.x, w.z, seat * 97 + i + 1);
          });
        }
        // o punhado na mão (ou já pousado, até o estado contar a aposta)
        if (ap && ap.estado !== 'pilha' && ator) {
          const ti = breakdown(ap.valor)[0]?.ti ?? 0;
          for (const o of ap.objs) {
            const w = ator.noMundo(o.pos.clone());
            ficha(st, ti, w, 0);
          }
        }
        // a aposta
        if (s.bet > 0) monte(st, s.bet, this.pontoDaAposta(seat), lado, seat * 13 + 1, 3, 10);
        // as cartas fechadas na frente dele. As minhas também ficam na mesa, na frente do meu personagem
        // (abertas, grandes, só embaixo da tela), até eu as virar no showdown — que é quando a mão ganha nome
        const fechadas = s.cards.length > 0 && !s.folded && (seat === v.mySeat ? !s.handName : s.cards.every((c) => !c));
        const gesto = ator?.gesto;
        const naMao = gesto && !soBaralho(gesto) && ator!.objetos.some((o) => o.tipo === 'carta');
        if (fechadas && !naMao) {
          const n = s.cards.length;
          const cor = this.brilhando.get(seat);
          this.repouso(n).forEach((r) => {
            const m = pegarCarta(cartaMats);
            m.position.copy(this.doAssento(seat, r.pos.x, r.pos.y, r.pos.z));
            m.quaternion.copy(this.ancoras[seat].quaternion).multiply(r.quat);
            if (cor) brilho(m, cor);
          });
        }
        // o pote que ele ganhou: pousado na frente dele, vai com as pontas dos dedos até junto da pilha
        const ganho = this.ganhando.get(seat);
        if (ganho?.naMesa && ganho.estilo) {
          const meio = (ganho.t >= GANHAR.puxa && ator && meioDoMonteGanho(ator.objetos)) || V(GANHAR.chega[0], MESA, GANHAR.chega[1]);
          monte(ganho.estilo, ganho.valor, this.doAssento(seat, meio.x, MESA, meio.z), lado, seat * 29 + 5, 3, 6);
        }
        // o que as mãos levam: as cartas que ele espia (as dele) — e o baralho na mão de quem dá as cartas
        if (ator && (gesto || ator.seguraOBaralho)) {
          for (const o of ator.objetos) {
            if (o.tipo === 'ficha' || (o.tipo === 'carta' && !gesto)) continue;
            // as cartas que o dealer reparte ou abre: aparecem na mão dele e no ar; pousadas, são do
            // estado da mesa (a fechada na frente do jogador, a aberta 2D) — e a 3D fica até ele as contar
            let mats = cartaMats;
            let escala = 1;
            if (o.tipo === 'carta' && soBaralho(gesto)) {
              const en = this.entrega;
              if (!en || en.dealer !== seat || o.n === undefined) continue;
              if (en.daMao) {
                const c = en.daMao[o.n];
                // (pousada e já contada pelo estado: quem a desenha é ele — na troca de cartas ela já estava contada)
                if (!c || (en.chegou.has(o.n) && (v.seats[c.seat]?.cards.length ?? 0) > c.i)) continue;
              } else if (en.daMesa) {
                const carta = en.daMesa.cartas[o.n];
                if (!carta || v.board.length > en.daMesa.jaNaMesa + o.n) continue;
                mats = materiaisDaCartaAberta(carta, e.cartas.back, e.cartas.face);
                // cresce no ar até o tamanho da carta 2D que toma o lugar dela
                const falta = ator.noMundo(o.pos.clone()).distanceTo(en.daMesa.ate[o.n]);
                escala = 1 + (ESCALA_DA_ABERTA - 1) * macio(1 - falta / 0.3);
              }
            } else if (o.tipo === 'carta' && gesto === 'desistir' && this.lancou.has(seat)) continue;
            else if (o.tipo === 'carta' && !fechadas && gesto !== 'desistir') continue;
            else if (o.tipo === 'carta' && gesto === 'virar-pilha') {
              // as que ele vira no showdown: com a face de verdade, crescendo até o tamanho das 2D que as substituem
              const carta = o.n !== undefined ? this.viradas.get(seat)?.[o.n] : undefined;
              if (carta) mats = materiaisDaCartaAberta(carta, e.cartas.back, e.cartas.face);
              const virada = (1 - V(0, 1, 0).applyQuaternion(o.quat).y) / 2;
              escala = 1 + (ESCALA_DA_VIRADA - 1) * virada;
            }
            // (as outras cartas de um gesto: as que ele espia são as dele, fechadas; as de quem desiste vão com a mão para o descarte)
            const m = o.tipo === 'baralho' ? pegarCarta(materiaisDoBaralho(e.cartas.back), this.geoBaralho) : pegarCarta(mats);
            m.position.copy(ator.noMundo(o.pos.clone()));
            m.quaternion.copy(ator.grupo.quaternion).multiply(o.quat);
            m.scale.setScalar(escala);
            // (as que quem ganhou está virando continuam brilhando até pousarem abertas)
            const cor = o.tipo === 'carta' && gesto === 'virar-pilha' ? this.brilhando.get(seat) : undefined;
            if (cor) brilho(m, cor);
          }
        }
      });
      // a pilha do descarte
      for (const c of this.descarte) {
        const m = pegarCarta(cartaMats);
        m.position.copy(c.pos);
        m.quaternion.setFromAxisAngle(EIXO_Y, c.giro);
      }
      // o pote
      if (v.pot > 0) monte(e.fichaDoPote, v.pot, this.doPlano(POTE_3D), V(1, 0, 0), 777, 5, 12);
      // o baralho do dealer, na mesa (quando não está na mão dele) e o botão
      const d = v.dealerSeat;
      const dealer = d !== null ? this.atores.get(d) : undefined;
      this.baralho.visible = d !== null && !!this.geo[d] && !soBaralho(dealer?.gesto) && this.comBaralho !== d;
      if (this.baralho.visible && d !== null) {
        this.baralho.position.copy(this.doAssento(d, MARCAS.baralho[0], MESA + BARALHO.alto / 2, MARCAS.baralho[1]));
        this.baralho.rotation.set(0, this.giroDo(d) + GIRO_DO_BARALHO, 0);
      }
      if (d !== null && this.geo[d]) {
        const alvo = this.doAssento(d, MARCAS.botao[0], MESA + 0.0035, MARCAS.botao[1]);
        if (!this.botaoEm) this.botaoEm = alvo.clone();
        this.botaoEm.lerp(alvo, Math.min(1, 0.09 * getTimeScale()));
        this.botao.position.copy(this.botaoEm);
        this.botao.visible = true;
      } else this.botao.visible = false;
    }

    // os voos
    const vivos: Voo[] = [];
    for (const vo of this.voos) {
      const u = Math.min(1, (agora - vo.inicio) / vo.dur);
      const k = sai(u);
      // (reto, ou curvando pelo ponto dado)
      const pos = vo.por ? vo.de.clone().multiplyScalar((1 - k) * (1 - k)).addScaledVector(vo.por, 2 * k * (1 - k)).addScaledVector(vo.ate, k * k) : vo.de.clone().lerp(vo.ate, k);
      if (vo.por) pos.y = vo.de.y + (vo.ate.y - vo.de.y) * k;
      pos.y += vo.arco * Math.sin(Math.PI * k);
      const giro = vo.giroDe + (vo.giroAte - vo.giroDe) * macio(u);
      const escala = vo.some ? 1 - macio((u - 0.75) / 0.25) : 1;
      if (vo.tipo === 'carta' && e) {
        const m = pegarCarta(materiaisDaCarta(e.cartas.back, e.cartas.face));
        m.position.copy(pos);
        m.quaternion.setFromAxisAngle(EIXO_Y, giro);
        m.scale.setScalar(Math.max(0.001, escala));
      } else if (vo.tipo === 'fichas' && vo.estilo && vo.valor && escala > 0.05) {
        const cols = breakdown(vo.valor, 3, 6);
        cols.forEach((c, i) => {
          const off = (i - (cols.length - 1) / 2) * ENTRE_COLUNAS;
          for (let j = 0; j < Math.ceil(c.count * escala); j++) ficha(vo.estilo!, c.ti, V(pos.x + off, pos.y + (j + 0.5) * FICHA.alto, pos.z), giro + j);
        });
      }
      if (u >= 1) vo.pronto();
      else vivos.push(vo);
    }
    this.voos = vivos;

    // as sombras de contato das cartas deitadas (as paradas e as que passam rente à mesa) e do baralho
    const comSombra: THREE.Vector3[] = [];
    const sombraDe = (m: THREE.Mesh, alto: number) => {
      const cima = V(0, 1, 0).applyQuaternion(m.quaternion);
      const sobe = m.position.y - alto / 2 - MESA;
      if (Math.abs(cima.y) < 0.9 || sobe > ALCANCE_DA_SOMBRA) return;
      // (num monte — o descarte, as duas cartas de cada um — uma sombra só, para não somar preto)
      if (comSombra.some((p) => Math.hypot(p.x - m.position.x, p.z - m.position.z) < 0.015)) return;
      comSombra.push(m.position);
      const frente = V(0, 0, 1).applyQuaternion(m.quaternion);
      // (levantada, a sombra encolhe para debaixo da carta: aí a sombra de verdade toma o lugar)
      const k = 1 - Math.max(0, sobe) / ALCANCE_DA_SOMBRA;
      this.sombraDasCartas.por(m.position.x + DESVIO_DA_SOMBRA.x, NIVEL_DA_SOMBRA, m.position.z + DESVIO_DA_SOMBRA.z, Math.atan2(frente.x, frente.z), m.scale.x * (0.8 + 0.2 * k));
    };
    for (let i = 0; i < cartasUsadas; i++) sombraDe(this.cartas[i], this.cartas[i].geometry === this.geoBaralho ? BARALHO.alto : CARTA.alto);
    if (this.baralho.visible) sombraDe(this.baralho, BARALHO.alto);
    if (this.botao.visible) this.sombraDasFichas.por(this.botao.position.x + DESVIO_DA_SOMBRA.x, NIVEL_DA_SOMBRA, this.botao.position.z + DESVIO_DA_SOMBRA.z, 0, 1.08);
    this.sombraDasFichas.fechar();
    this.sombraDasCartas.fechar();

    for (let i = cartasUsadas; i < this.cartas.length; i++) this.cartas[i].visible = false;
    for (let i = brilhosUsados; i < this.brilhos.length; i++) this.brilhos[i].visible = false;
    for (const f of this.fichas.values()) {
      f.malha.count = f.usadas;
      f.malha.instanceMatrix.needsUpdate = true;
    }
  }

  /** Para conferir de fora (as capturas automáticas): quem está sentado, o andamento da modelagem e o ritmo. */
  diagnostico() {
    return {
      fps: Math.round(this.fps * 10) / 10,
      ms: { atores: +this.custo.atores.toFixed(2), montar: +this.custo.montar.toFixed(2), desenho: +this.custo.desenho.toFixed(2), pano: [...this.atores.values()].map((a) => +a.custoDoPano.toFixed(2)) },
      atores: [...this.atores.entries()].map(([seat, a]) => ({ seat, personagem: a.personagem, gesto: a.gesto })),
      andamento: useModelos.getState(),
      clipes: !!clipesProntos(),
      voos: this.voos.length,
      tela: { ...this.medida },
    };
  }

  destruir() {
    cancelAnimationFrame(this.quadroPedido);
    for (const d of this.desligar) d();
    for (const v of this.voos) v.pronto();
    this.voos = [];
    for (const a of this.atores.values()) a.destruir();
    this.atores.clear();
    this.renderer.dispose();
  }
}
