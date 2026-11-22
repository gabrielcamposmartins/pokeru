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
import { TIRADA, TIRAR, colocarAcessorio, jogarFichas, tirarAcessorio } from '../personagem/animacoes';
import { tirarDasMaos } from '../../shared/aposta';
import { Mesa as MesaDeFisica, disco, type Disco } from './fisica';
import { CHIP_VALUES } from '../../shared/styles';
import { Correia, anelSolto, pecaNaMesa, soltarPeca } from './itemNaMesa';
import { medidasDosLacos } from './acessorios3d';
import { findAcessorio } from '../../shared/acessorios';
import { BARALHO, BATIDAS, CARTA, DESISTIR_SOLTA, FICHA, GANHAR, RITMO_MAIS_LIGEIRO, abrirCartas, desistir as desistirDaMao, entregarCartas, meioDoMonteGanho, vistoDoLugar, type Clipe, type Objeto, CARTA_ABERTA } from '../personagem/animacoes';
import { Boneco } from '../personagem/boneco';
import { materiaisDaCarta, materiaisDaCartaAberta, materiaisDaFicha, materiaisDoBaralho, materiaisDoBotao, chaveDoEstilo, texturaDoFeltro, FELTRO } from './aparencia';
import { geometriaDaFicha } from './ficha';
import { prepararSombra, RUMO_DA_LUZ, SOMBRA, SombrasDeContato } from './sombras';
import { Ator, DESCANSOS } from './ator';
import { bonecoDeConta, clipe, clipesProntos, ehDoBaralho, esqueletoDoJogo, maoQueSegura, prepararClipes, descansoComAbertas } from './clipes';
import { ALTURA_DA_MESA as MESA, CAMERA_DO_JOGO, DESCARTE, MONTE_DAS_PECAS, GIRO_DO_BARALHO, MARCAS, MEIO, METRO_POR_PX, POTE_3D, RAIO, TRILHO, lenteDaTela, planoParaMundo, seatLayout3d, type SeatGeo3D } from './geometria';
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
  /**
   * As fichas vão **empurradas pelo feltro**, e não pelo ar: cada coluna escorrega rente à mesa, uma
   * um nada atrás da outra, pendendo para trás ao arrancar e para a frente ao parar; a fila delas vira
   * do rumo em que estava (`ladoDe`) para o de quem as recebe (`ladoAte`). A semente é a do monte em
   * que elas viram ao chegar — para cada ficha pousar já como vai ficar.
   */
  empurrado?: { ladoDe: THREE.Vector3; ladoAte: THREE.Vector3; semente: number };
  /** Uma coluna só, de um valor de ficha (em vez do monte que soma `valor`): a que vai para cima da pilha de quem ganhou. */
  coluna?: { ti: number; count: number; semente: number };
  pronto: () => void;
}

/** No empurrão do pote, quanto do caminho a última coluna sai depois da primeira. */
const FILA_DO_POTE = 0.16;
/** O que quem ganhou acabou de pôr junto da pilha: fica ali até o estado da mesa contar as fichas na pilha dele. */
interface Recebidas {
  estilo: ChipStyle;
  cols: { ti: number; count: number; semente: number; x: number; z: number; y0: number }[];
  /** A pilha dele quando as fichas chegaram (quando ela mudar, é a pilha que as mostra). */
  pilhaAntes: number;
  /** Até quando esperar pelo estado (ms do relógio do quadro). */
  ate: number;
}

/** Uma aposta em curso: o personagem está levando o punhado da pilha para a mesa. */
interface Apostando {
  valor: number;
  /** A aposta que o estado tinha quando o gesto começou: enquanto ela não muda, as colunas continuam sem as fichas que saíram. */
  antes: number;
  estado: 'pilha' | 'mao' | 'pousou';
  /** As fichas que estão na mão (cada uma diz, em `n`, de que pegada veio). */
  objs: Objeto[];
  /** De que colunas da pilha as fichas saem: a coluna, o valor das fichas dela, quantas vão, e se a mão já as tirou. */
  pegas: { coluna: number; ti: number; leva: number; pegou: boolean }[];
}

/** Uma ficha solta na mesa: jogada numa aposta, com corpo (src/mesa3d/fisica.ts), até a rua ser recolhida. */
interface FichaSolta {
  d: Disco;
  ti: number;
  estilo: ChipStyle;
}

/** A mesa é um estádio: dois meios círculos de raio `RAIO` em volta de (±MEIO, 0). Um ponto está no feltro, com folga? */
const noFeltro = (x: number, z: number): boolean => Math.hypot(x - Math.max(-MEIO, Math.min(MEIO, x)), z) < RAIO - 0.07;

/** Um acessório apostado, em cima da mesa: parado, indo de um lugar a outro, ou ainda na mão de quem o tira. */
interface ItemNaCena {
  seat: number;
  id: string;
  grupo: THREE.Group;
  /** Onde está (ou para onde o voo o leva). */
  em: THREE.Vector3;
  /** Na frente do dono (apostado nesta rua) ou no monte das peças (o pote delas). */
  lugar: 'aposta' | 'pote';
  /** A altura do que está por baixo dela, a contar do tampo (no monte, as peças que chegaram antes). */
  base: number;
  voo?: { de: THREE.Vector3; inicio: number; dur: number; arco: number; some: boolean; pronto: () => void; giroDe: THREE.Quaternion };
  /** Vai na mão de quem o está pondo na mesa (segue o gesto). */
  naMao: boolean;
  /** O estado da mesa já o conta (antes disso é só do gesto: não some por não estar no estado). */
  contado: boolean;
  desde: number;
  /** A que altura do tampo fica a origem do desenho, com a peça pousada (o anel é centrado; a correia mede-se do meio do laço). */
  alto: number;
  /** O anel jogado: o corpo dele na física da mesa, enquanto não é levado dali. */
  corpo?: Disco;
  /** A pulseira ou o relógio que desabotoa (o corpo mole dela). */
  correia?: Correia;
  /** O giro em volta do eixo vertical com que a peça foi posta (o de quem a pôs). */
  giro: number;
  /** De onde ela saiu, em quem a apostou: é para onde volta, se voltar. */
  usa?: { mao: 'E' | 'D'; onde: 'pulso' | number };
  /** Está sendo colocada de volta pelo dono (o estado da mesa já não a conta, mas ela ainda está em cena). */
  voltando?: boolean;
  /** Largada na mesa, a correia tomba até o jeito em que fica: de onde partiu, e quando. */
  tombando?: { de: THREE.Quaternion; inicio: number };
}

/** Quanto a correia leva para tombar e deitar, depois de largada (ms). */
const TOMBO = 420;

/** O tamanho da correia em cima da mesa (no pulso ela tem o de verdade; cresce no caminho). */
const ESCALA_DA_CORREIA = 1.3;
/** Como o aro (o anel, a argola) vai entre os dedos de quem o leva: de pé, pendurado — o eixo dele deitado. */
const DE_PE = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.35, 0, 0.12));

/** Quanto uma peça fica ao lado da outra, quando o mesmo jogador aposta mais de uma (metros). */
const ENTRE_ITENS = 0.05;
/** No monte das peças: até onde cada uma cai fora do meio dele, e quanto cada uma sobe sobre as que já estão. */
const MONTE = { espalha: 0.034, sobe: 0.0055, aneis: 0.085 };

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
  /**
   * Quem já foi montado mas ainda não aparece: entra na cena quando os programas da placa de vídeo
   * dele estão compilados e o pano assentou (antes disso o primeiro desenho travava a página, e as
   * mangas apareciam esticadas). `desde`: quando foi montado — passado um tempo, entra assim mesmo.
   */
  private readonly chegando = new Map<Ator, { compilado: boolean; desde: number }>();
  /** Ficou gente por sentar (monta-se um personagem por quadro, para não travar um quadro inteiro). */
  private faltaSentar = false;
  /** A mesa já pode ser desenhada (os programas dela estão compilados). */
  private pronta = false;
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
  /** As fichas que cada um ganhou e já pôs na pilha, enquanto o estado da mesa não as conta. */
  private readonly recebidas = new Map<number, Recebidas>();
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
  /** A física do que é jogado na mesa (as fichas das apostas, os anéis). */
  private readonly fisica = new MesaDeFisica(MESA, noFeltro);
  private antesDaFisica = 0;
  private antesDasPecas = 0;
  /** As fichas soltas da aposta de cada um: jogadas na mesa, ficam onde caíram até a rua ser recolhida. */
  private readonly soltas = new Map<number, FichaSolta[]>();
  /** O gesto de pegar fichas e jogar, por colunas visitadas (a coluna, a altura dela e quantas saem). */
  private readonly jogadas = new Map<string, ReturnType<typeof jogarFichas> | undefined>();
  /** Os acessórios apostados que estão em cima da mesa (por dono e peça). */
  private readonly itens = new Map<string, ItemNaCena>();
  /** O gesto de tirar um acessório (e o de colocá-lo de volta), por mão e lugar (do pulso, de cada dedo) e por onde ele é pousado. */
  private readonly tiradas = new Map<string, Clipe | undefined>();
  /**
   * As peças que o estado da mesa já dá como postas em alguém, mas que ele ainda está colocando (o
   * gesto de pôr de volta o que voltou): até acabar, o personagem aparece sem elas.
   */
  private readonly escondidos = new Map<number, Set<string>>();
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
    // os programas da mesa compilam em segundo plano: o primeiro desenho espera por eles (meio segundo,
    // no máximo), em vez de travar a página enquanto a placa de vídeo os compila
    // (as fichas e as cartas só aparecem depois, e os programas delas compilariam no meio da partida:
    // um exemplar escondido de cada entra na conta agora, e sai quando ela acaba)
    const amostra = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    amostra.colorSpace = THREE.SRGBColorSpace;
    amostra.needsUpdate = true;
    const comDesenho = new THREE.MeshStandardMaterial({ map: amostra, roughness: 0.4 });
    const liso = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    const recortado = new THREE.MeshStandardMaterial({ map: amostra, roughness: 0.55, alphaTest: 0.5 });
    const semLuz = new THREE.MeshBasicMaterial({ map: amostra, alphaTest: 0.5 });
    const aquecer: THREE.Mesh[] = [new THREE.InstancedMesh(this.geoFicha, [comDesenho, comDesenho, comDesenho], 1), new THREE.Mesh(this.geoCarta, [liso, liso, recortado, semLuz, liso, liso])];
    for (const m of aquecer) {
      m.castShadow = m.receiveShadow = true;
      m.visible = false;
      this.cena.add(m);
    }
    const liberar = () => {
      this.pronta = true;
      for (const m of aquecer.splice(0)) m.removeFromParent();
    };
    this.renderer.compileAsync(this.cena, this.camera).then(liberar, liberar);
    setTimeout(liberar, 1500);
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
    this.acertarItens();
    for (const seat of [...this.soltas.keys()]) if ((v.seats[seat]?.bet ?? 0) === 0 && !this.apostando.has(seat)) this.tirarSoltas(seat);
    // a aposta que o estado já conta: o punhado pousado sai de cena
    for (const [seat, a] of this.apostando) if ((v.seats[seat]?.bet ?? 0) !== a.antes && a.estado === 'pousou') this.apostando.delete(seat);
    // (quem senta e quem sai é visto no próximo quadro: montar um personagem aqui travava o quadro em que o estado chega)
    this.faltaSentar = true;
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
      // (só os anéis ou o que vai no pulso mudaram — ele apostou um acessório, ou ganhou um de volta: troca as peças, sem refazê-lo)
      const acessorios = this.acessoriosVisiveis(seat);
      if (s && this.geo[seat] && e.personagemDe(seat) === ator.personagem && chaveDosAcessorios(acessorios) !== ator.enfeites && ator.trocarEnfeites(acessorios)) continue;
      // (trocou de personagem, de luva ou de esmalte: o personagem é refeito)
      if (!s || !this.geo[seat] || e.personagemDe(seat) !== ator.personagem || chaveDosAcessorios(acessorios) !== ator.enfeites) {
        ator.destruir();
        this.chegando.delete(ator);
        this.atores.delete(seat);
      }
    }
    let montados = 0;
    this.faltaSentar = false;
    v.seats.forEach((s, seat) => {
      const g = this.geo[seat];
      if (!s || !g || this.atores.has(seat)) return;
      const id = e.personagemDe(seat);
      const acessorios = this.acessoriosVisiveis(seat);
      // (a roupa é a do traje com a luva que o jogador escolheu)
      const comLuva = vestido(id, acessorios.luva);
      const modelo = modeloPronto(comLuva);
      if (!modelo) {
        // (ainda não: começa a modelar; o aviso do andamento chama isto de novo)
        void prepararRoupa(comLuva).catch(() => {});
        return;
      }
      // (um por quadro: montar um personagem leva dezenas de milissegundos)
      if (montados++ > 0) {
        this.faltaSentar = true;
        return;
      }
      const ator = new Ator(id, modelo.corpo, modelo.roupa, acessorios);
      if (this.comBaralho === seat) this.comBaralho = null;
      ator.tela(this.medida.l || 1600, this.medida.a || 900);
      ator.semCabeca(seat === v.mySeat);
      ator.sentar(g.lugar);
      ator.descansar(clipe(DESCANSOS[g.vis]) ?? clipe('idle-plana')!);
      this.atores.set(seat, ator);
      // ainda fora da cena: entra quando estiver pronto para aparecer (veja `chegando`)
      const espera = { compilado: false, desde: performance.now() };
      this.chegando.set(ator, espera);
      const compilou = () => (espera.compilado = true);
      this.renderer.compileAsync(ator.grupo, this.camera, this.cena).then(compilou, compilou);
    });
  }

  /**
   * Põe na cena quem já está pronto para aparecer (ou esperou demais) — um de cada vez, com uns
   * quadros entre um e outro: o primeiro desenho de um personagem manda as malhas dele para a placa
   * de vídeo, e os seis no mesmo quadro travavam a página por meio segundo.
   */
  private receberQuemChegou(agora: number) {
    if (agora < this.proximaChegada) return;
    for (const [ator, espera] of this.chegando) {
      const demorou = agora - espera.desde > 4000;
      if (!demorou && !(espera.compilado && ator.pronto)) continue;
      this.cena.add(ator.grupo);
      this.chegando.delete(ator);
      this.proximaChegada = agora + 70;
      return;
    }
  }
  private proximaChegada = 0;

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

  /** Onde fica a coluna `j` da pilha de um jogador, nas coordenadas dele: a primeira na marca, as outras para fora, em ziguezague. */
  private colunaDaPilha(j: number): [number, number] {
    return j === 0 ? [MARCAS.pilha[0], MARCAS.pilha[1]] : [MARCAS.pilha[0] - j * ENTRE_COLUNAS * 1.02, MARCAS.pilha[1] - ((j - 1) % 2) * 0.012];
  }

  private tirarSoltas(seat: number, ateValor = Infinity): void {
    const lista = this.soltas.get(seat);
    if (!lista) return;
    let saiu = 0;
    while (lista.length && saiu < ateValor) {
      const f = lista.pop()!;
      saiu += CHIP_VALUES[f.ti] ?? 0;
      this.fisica.tirar(f.d);
    }
    if (!lista.length) this.soltas.delete(seat);
  }

  /** As fichas saem da mão: daqui em diante são da mesa — cada uma com a velocidade da mão, um giro e um desvio dela. */
  private soltar(seat: number, ator: Ator, objs: Objeto[], pegas: Apostando['pegas'], forte: boolean) {
    const estilo = this.entrada?.fichaDe(seat);
    if (!estilo) return;
    const origem = ator.noMundo(V(0, 0, 0));
    const frente = ator.noMundo(V(0, 0, 1)).sub(origem).setY(0).normalize();
    const lado = V(frente.z, 0, -frente.x);
    const lista = this.soltas.get(seat) ?? [];
    this.soltas.set(seat, lista);
    const giroDoAtor = new THREE.Quaternion().setFromAxisAngle(EIXO_Y, Math.atan2(frente.x, frente.z));
    objs.forEach((o, i) => {
      const r = (k: number) => hash01(seat * 131 + i * 17 + k, performance.now() | 0);
      const impulso = (forte ? 0.62 : 0.44) * (0.82 + 0.36 * r(1));
      const vel = frente.clone().multiplyScalar(impulso).addScaledVector(lado, (r(2) - 0.5) * 0.2).add(V(0, 0.04 + 0.12 * r(3), 0));
      // (saem quase deitadas, cada uma um pouco torta: é o que as faz cair de quina e rodopiar)
      const torta = new THREE.Quaternion().setFromEuler(new THREE.Euler((r(4) - 0.5) * 0.7, r(5) * 6.28, (r(6) - 0.5) * 0.7));
      const giro = V((r(7) - 0.5) * 9, (r(8) - 0.5) * 10, (r(9) - 0.5) * 9);
      const d = this.fisica.por(disco(ator.noMundo(o.pos.clone()), giroDoAtor.clone().multiply(torta), vel, giro, FICHA.raio, FICHA.alto / 2));
      lista.push({ d, ti: pegas[o.n ?? 0]?.ti ?? pegas[0]?.ti ?? 0, estilo });
    });
  }

  apostar(seat: number, valor: number, allin = false): Promise<void> {
    const ator = this.atores.get(seat);
    const s = this.entrada?.view.seats[seat];
    // sem personagem (ainda modelando): as fichas voam da pilha para a aposta
    const voando = () =>
      this.voar({ tipo: 'fichas', de: this.pontoDaPilha(seat), ate: this.pontoDaAposta(seat), giroDe: 0, giroAte: 0, arco: 0.06, some: false, valor, estilo: this.entrada?.fichaDe(seat), ms: VOO.aposta });
    if (!ator || !s || valor <= 0 || !this.geo[seat]) return voando();
    // As fichas que vão para a mesa são as da aposta (200 são duas de 100), e a mão vai buscá-las nas
    // colunas desses valores — no máximo duas colunas, as que mais pesam na aposta, um punhado de cada.
    // Quando a pilha não tem ficha daquele valor, sai da menor coluna que o cobre: é o troco.
    const antes = breakdown(s.stack, 4, 99);
    if (!antes.length) return voando();
    const partes = breakdown(valor, 4, 99)
      .sort((x, y) => (CHIP_VALUES[y.ti] ?? 0) * y.count - (CHIP_VALUES[x.ti] ?? 0) * x.count)
      .slice(0, 2);
    if (!partes.length) return voando();
    const pegas: (Apostando['pegas'][number] & { altura: number })[] = [];
    for (const parte of partes) {
      let coluna = antes.findIndex((c) => c.ti === parte.ti);
      // (as colunas vão do maior valor para o menor: a última que vale mais é a menor que cobre)
      if (coluna < 0) for (let j = antes.length - 1; j >= 0 && coluna < 0; j--) if (antes[j].ti > parte.ti) coluna = j;
      if (coluna < 0) coluna = 0;
      // (duas partes da mesma coluna: uma pegada só)
      if (pegas.some((x) => x.coluna === coluna)) continue;
      pegas.push({ coluna, ti: parte.ti, leva: Math.min(parte.count, NO_PUNHADO), pegou: false, altura: Math.min(antes[coluna].count, NA_PILHA) });
    }
    const chave = pegas.map((x) => `${x.coluna}:${x.altura}:${x.leva}`).join('|');
    if (!this.jogadas.has(chave)) {
      try {
        this.jogadas.set(chave, jogarFichas(bonecoDeConta(), pegas.map((x) => ({ em: this.colunaDaPilha(x.coluna), altura: x.altura, leva: x.leva })), [MARCAS.aposta[0], MARCAS.aposta[1]]));
      } catch (err) {
        console.warn('[mesa 3D] sem o gesto de pegar as fichas', err);
        this.jogadas.set(chave, undefined);
      }
    }
    const jogada = this.jogadas.get(chave);
    if (!jogada) return voando();
    return new Promise((pronto) => {
      const a: Apostando = { valor, antes: s.bet ?? 0, estado: 'pilha', objs: [], pegas };
      this.apostando.set(seat, a);
      let avisou = false;
      const avisar = () => {
        if (!avisou) {
          avisou = true;
          pronto();
        }
      };
      let naMao: Objeto[] = [];
      ator.tocar(jogada.clipe, {
        vel: 1.7,
        aoAndar: (t, objs, fim) => {
          pegas.forEach((x, k) => {
            if (t >= jogada.pegou[k]) x.pegou = true;
          });
          if (t < jogada.soltou) {
            a.objs = objs;
            if (objs.length) {
              a.estado = 'mao';
              naMao = objs;
            }
          } else if (a.estado !== 'pousou') {
            // a mão abriu: as fichas são da mesa, e o estado conta a aposta quando elas batem nela
            a.estado = 'pousou';
            a.objs = [];
            this.soltar(seat, ator, naMao, pegas, allin);
            setTimeout(avisar, scaled(240));
          }
          if (fim) {
            avisar();
            if (this.apostando.get(seat) === a) this.apostando.delete(seat);
          }
        },
      });
      // (uma rede: se o gesto não acabar — a aba escondida, um clipe diferente —, a mesa não trava)
      setTimeout(avisar, scaled(3600));
    });
  }

  // ─────────────────────────────── os acessórios apostados ───────────────────────────────

  /** Onde a peça de um jogador fica pousada, na frente dele (`k`: quantas ele já tem ali). */
  private pontoDoItem(seat: number, k = 0): THREE.Vector3 {
    return this.doAssento(seat, TIRADA.alvo[0] + ENTRE_ITENS * k, MESA, TIRADA.alvo[1]);
  }

  /**
   * Onde a peça fica no monte das peças (o "pote" delas: do lado oposto ao do descarte). É um monte
   * como o das cartas: a correia cai um pouco fora do meio, por cima das que já estão;
   * o anel e a argola, miúdos, ficam ao pé dele, no feltro — por baixo de um relógio sumiriam.
   */
  private pontoNoPote(id: string, menos?: ItemNaCena): THREE.Vector3 {
    const eMiudo = (qual: string) => {
      const def = findAcessorio(qual);
      return def?.tipo === 'anel' || (def?.tipo === 'pulseira' && (def.feitio === 'argola' || def.feitio === 'argolas'));
    };
    const miudo = eMiudo(id);
    // (quantas do mesmo tipo já estão lá: as correias empilham; os miúdos espalham-se ao pé do monte)
    const k = [...this.itens.values()].filter((i) => i !== menos && i.lugar === 'pote' && eMiudo(i.id) === miudo).length;
    const [x, z] = MONTE_DAS_PECAS;
    if (miudo) return V(x + jitter(613, k, 3) * 0.06, MESA, z + MONTE.aneis + jitter(613, k, 4) * 0.012);
    return V(x + jitter(613, k) * MONTE.espalha, MESA + k * MONTE.sobe, z + jitter(613, k, 5) * MONTE.espalha);
  }

  /** A mão do dono, em descanso: de onde a peça sai (e para onde volta) quando não há o gesto. */
  private maoDe(seat: number): THREE.Vector3 {
    return this.doAssento(seat, 0.17, MESA + 0.03, 0.31);
  }

  /** O que o personagem veste nas mãos agora: o que o estado diz, menos as peças que ele ainda está colocando de volta. */
  private acessoriosVisiveis(seat: number): Acessorios {
    let a = this.entrada?.acessoriosDe?.(seat) ?? SEM_ACESSORIOS;
    for (const id of this.escondidos.get(seat) ?? []) a = tirarDasMaos(a, id).acessorios;
    return a;
  }

  private esconder(seat: number, id: string, sim: boolean) {
    const s = this.escondidos.get(seat) ?? new Set<string>();
    if (sim) s.add(id);
    else s.delete(id);
    if (s.size) this.escondidos.set(seat, s);
    else this.escondidos.delete(seat);
    this.faltaSentar = true;
  }

  /** As medidas do pulso na pose de repouso (o centro do laço e o raio médio): é de onde a correia é medida. */
  private pulso(): { centro: [number, number, number]; raio: number } {
    const m = medidasDosLacos();
    const c = m.centros[m.centros.length - 1];
    return { centro: [c[0], c[1], c[2]], raio: m.pulso };
  }

  /**
   * Põe uma peça na cena. O anel é um desenho centrado, pronto para a física; a pulseira e o relógio
   * de fecho são uma correia que abre (`mao`: de que pulso saiu — o desenho da direita é espelhado);
   * o aro rígido é a peça deitada. `pousada`: já chega no lugar, aberta e do tamanho da mesa.
   */
  private porItem(seat: number, id: string, em: THREE.Vector3, lugar: ItemNaCena['lugar'], mao: 'E' | 'D' = 'E', pousada = true): ItemNaCena | null {
    const chave = `${seat}:${id}`;
    const ja = this.itens.get(chave);
    if (ja) return ja;
    const def = findAcessorio(id);
    let grupo: THREE.Group | null = null;
    let alto = 0;
    let correia: Correia | undefined;
    const aro = def?.tipo === 'anel' || (def?.tipo === 'pulseira' && (def.feitio === 'argola' || def.feitio === 'argolas'));
    if (aro) {
      const solto = anelSolto(id);
      if (solto) {
        grupo = solto.grupo;
        alto = solto.meia;
        grupo.userData.raio = solto.raio;
      }
    } else if (def?.tipo === 'pulseira' || def?.tipo === 'relogio') {
      const { centro, raio } = this.pulso();
      const c = new Correia(id, mao, centro, raio);
      if (c.rigida) c.soltar();
      else {
        correia = c;
        grupo = c.grupo;
        if (pousada) {
          c.ja('deitada');
          grupo.scale.setScalar(ESCALA_DA_CORREIA);
          grupo.quaternion.copy(c.largada());
          alto = c.abaixo(grupo.quaternion, ESCALA_DA_CORREIA);
        }
      }
    }
    grupo ??= pecaNaMesa(id);
    if (!grupo) return null;
    const giro = this.giroDo(seat);
    if (!correia) grupo.rotation.y = giro;
    grupo.position.copy(em);
    // (só a que já chega pousada tem algo por baixo — as do monte; a que nasce na mão do dono vai para o tampo)
    const base = pousada ? Math.max(0, em.y - MESA) : 0;
    if (pousada) grupo.position.y = MESA + base + alto;
    this.cena.add(grupo);
    const item: ItemNaCena = { seat, id, grupo, em: grupo.position.clone(), lugar, base, naMao: false, contado: false, desde: performance.now(), alto, correia, giro, usa: this.ondeUsa(seat, id) ?? undefined };
    this.itens.set(chave, item);
    return item;
  }

  private tirarItem(item: ItemNaCena) {
    item.voo?.pronto();
    if (item.corpo) this.fisica.tirar(item.corpo);
    soltarPeca(item.grupo);
    this.itens.delete(`${item.seat}:${item.id}`);
  }

  /** A peça vai de onde está até `ate` (um ponto do tampo: ela pousa na altura dela); some ao chegar, se for o caso. */
  private levarItem(item: ItemNaCena, ate: THREE.Vector3, ms: number, arco: number, some = false): Promise<void> {
    item.voo?.pronto();
    // (a que foi jogada deixa de ser da física: daqui em diante ela é levada)
    if (item.corpo) {
      this.fisica.tirar(item.corpo);
      item.corpo = undefined;
    }
    const dur = scaled(ms);
    return new Promise((pronto) => {
      item.voo = { de: item.grupo.position.clone(), inicio: performance.now(), dur: Math.max(1, dur), arco, some, pronto, giroDe: item.grupo.quaternion.clone() };
      item.em.copy(ate);
      // (pousa na altura dela, por cima do que já houver ali — no monte, as peças que chegaram antes)
      item.base = some ? 0 : Math.max(0, ate.y - MESA);
      if (!some) item.em.y = MESA + item.base + item.alto;
    });
  }

  /** O estado da mesa mudou: põe na mesa as peças que ele conta e ainda não estão, e tira as que ele deixou de contar. */
  private acertarItens() {
    const v = this.entrada?.view;
    if (!v) return;
    const noEstado = new Set((v.itens ?? []).map((i) => `${i.seat}:${i.id}`));
    for (const item of [...this.itens.values()]) {
      const chave = `${item.seat}:${item.id}`;
      if (noEstado.has(chave)) item.contado = true;
      // (a que só o gesto conhece espera o estado alcançá-la — mas não para sempre)
      else if (!item.voo && !item.naMao && !item.voltando && (item.contado || performance.now() - item.desde > 9000)) this.tirarItem(item);
    }
    for (const i of v.itens ?? []) {
      // (a que ainda está na mão do dono — a entrada de quem ficou sem fichas — espera o gesto dele)
      if (i.chegando || this.itens.has(`${i.seat}:${i.id}`) || !this.geo[i.seat]) continue;
      // (chegou com a mão andando — uma reconexão, a mesa aberta no meio: na frente de quem ainda tem aposta na rua, senão no pote)
      const naRua = (v.seats[i.seat]?.bet ?? 0) > 0;
      const item = this.porItem(i.seat, i.id, i.naAposta && naRua ? this.pontoDoItem(i.seat) : this.pontoNoPote(i.id), i.naAposta && naRua ? 'aposta' : 'pote');
      if (item) item.contado = true;
    }
  }

  /** Onde o jogador usa a peça: em que mão, e se no pulso ou em que dedo (pelo que ele veste agora). */
  private ondeUsa(seat: number, id: string): { mao: 'E' | 'D'; onde: 'pulso' | number } | null {
    const a = this.entrada?.acessoriosDe?.(seat);
    if (!a) return null;
    for (const m of ['E', 'D'] as const) if (a.pulsos[m] === id) return { mao: m, onde: 'pulso' };
    const anel = a.aneis.find((x) => x.id === id);
    return anel ? { mao: anel.mao, onde: anel.dedo } : null;
  }

  apostarItem(seat: number, id: string, aoTirar: () => void): Promise<void> {
    const k = [...this.itens.values()].filter((i) => i.seat === seat && i.lugar === 'aposta').length;
    const destino = this.pontoDoItem(seat, k);
    const ator = this.atores.get(seat);
    const usa = this.ondeUsa(seat, id);
    const semGesto = () => {
      // sem o personagem (ainda modelando) ou sem saber de onde a peça sai: ela voa da mão para a mesa
      aoTirar();
      const item = this.porItem(seat, id, this.maoDe(seat), 'aposta', usa?.mao);
      return item ? this.levarItem(item, destino, 520, 0.07) : Promise.resolve();
    };
    if (!ator || !usa || !this.geo[seat]) return semGesto();
    // O jeito de tirar: o anel é puxado do dedo e jogado; a pulseira e o relógio de fecho são
    // desabotoados e pousados; o aro rígido sai pela mão e é pousado.
    const def = findAcessorio(id);
    const rigido = def?.tipo === 'pulseira' && (def.feitio === 'argola' || def.feitio === 'argolas');
    const jeito = usa.onde !== 'pulso' ? 'jogar' : rigido ? 'puxar' : 'desabotoar';
    const chave = `${usa.mao}:${usa.onde}:${k}:${jeito}`;
    if (!this.tiradas.has(chave)) {
      try {
        this.tiradas.set(chave, tirarAcessorio(bonecoDeConta(), { mao: usa.mao, onde: usa.onde, alvo: [TIRADA.alvo[0] + ENTRE_ITENS * k, TIRADA.alvo[1]], jeito }));
      } catch (err) {
        console.warn('[mesa 3D] sem o gesto de tirar o acessório', err);
        this.tiradas.set(chave, undefined);
      }
    }
    const gesto = this.tiradas.get(chave);
    if (!gesto) return semGesto();
    return new Promise((pronto) => {
      let item: ItemNaCena | null = null;
      let avisou = false;
      let noPulso: THREE.Quaternion | null = null;
      const emPe = new THREE.Quaternion().setFromAxisAngle(EIXO_Y, this.giroDo(seat));
      const avisar = () => {
        if (!avisou) {
          avisou = true;
          pronto();
        }
      };
      /** A peça chegou à mesa (pousada pela mão): fica no lugar dela, e a correia cede com a batida. */
      const pousou = () => {
        if (avisou) return;
        if (!item) {
          aoTirar();
          item = this.porItem(seat, id, destino, 'aposta', usa.mao);
          if (item) item.usa = usa;
        }
        if (item) {
          item.naMao = false;
          if (item.correia) {
            // solta na mesa, a correia não fica em pé: as metades desenrolam, ela tomba para um lado e deita
            item.grupo.scale.setScalar(ESCALA_DA_CORREIA);
            item.correia.ir('deitada');
            item.tombando = { de: item.grupo.quaternion.clone(), inicio: performance.now() };
            item.alto = item.correia.abaixo(item.grupo.quaternion, ESCALA_DA_CORREIA);
            item.base = 0;
            item.em.copy(destino).setY(MESA + item.alto);
            item.grupo.position.copy(item.em);
          } else {
            // o aro que não abre é largado de pé, rente à mesa: tomba e deita de lado, pelo próprio peso
            const r = (n: number) => hash01(seat * 53 + n, performance.now() | 0);
            const cai = V((r(1) - 0.5) * 0.05, 0, 0.03 + 0.04 * r(2));
            item.corpo = this.fisica.por(disco(item.grupo.position, item.grupo.quaternion, cai, V(2.5 + 2 * r(3), (r(4) - 0.5) * 3, (r(5) - 0.5) * 2), (item.grupo.userData.raio as number) ?? 0.03, Math.max(0.003, item.alto)));
          }
        }
        avisar();
      };
      /** O anel saiu dos dedos no ar: vira um corpo da mesa, com a velocidade da mão e um giro. */
      const jogou = () => {
        if (avisou || !item) return;
        item.naMao = false;
        const frente = ator.noMundo(V(0, 0, 1)).sub(ator.noMundo(V(0, 0, 0))).setY(0).normalize();
        const r = (n: number) => hash01(seat * 71 + n, performance.now() | 0);
        const vel = frente.clone().multiplyScalar(0.46 + 0.14 * r(1)).addScaledVector(V(frente.z, 0, -frente.x), (r(2) - 0.5) * 0.12).add(V(0, 0.1 + 0.1 * r(3), 0));
        const torto = item.grupo.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((r(4) - 0.5) * 0.5, 0, (r(5) - 0.5) * 0.5)));
        item.corpo = this.fisica.por(disco(item.grupo.position, torto, vel, V((r(6) - 0.5) * 10, (r(7) - 0.5) * 6, (r(8) - 0.5) * 10 + 4), (item.grupo.userData.raio as number) ?? 0.018, Math.max(0.003, item.alto)));
        // o estado conta a aposta quando ele bate na mesa
        setTimeout(avisar, scaled(300));
      };
      ator.tocar(gesto, {
        vel: 1.5,
        aoAndar: (t, objs, fim) => {
          const o = objs[0];
          if (!avisou && t >= TIRAR.pega) {
            // a peça saiu de quem a usava: daqui em diante é da mesa (o personagem deixa de tê-la)
            if (!item && o) {
              aoTirar();
              item = this.porItem(seat, id, ator.noMundo(o.pos.clone()), 'aposta', usa.mao, false);
              if (item) {
                item.naMao = true;
                item.usa = usa;
              }
            }
            if (item?.naMao && item.correia) {
              // a correia: no pulso (onde a do personagem estava) até ser levantada; aí vai pendurada dos dedos,
              // virando-se de pé e crescendo até o tamanho da mesa
              const c = item.correia;
              // desabotoada, as metades caem para os lados do pulso; levantada, ela pende dos dedos
              c.ir(t >= TIRAR.saiu - 0.25 ? 'pendurada' : t >= TIRAR.abre ? 'solta' : 'fechada');
              const m = ator.matrizDaPeca(c.osso, usa.mao);
              const { centro } = this.pulso();
              const sobe = macio(Math.min(1, Math.max(0, (t - (TIRAR.saiu - 0.25)) / (TIRAR.pousa - (TIRAR.saiu - 0.25)))));
              if (m) {
                const meio = V(usa.mao === 'D' ? -centro[0] : centro[0], centro[1], centro[2]).applyMatrix4(m);
                noPulso = new THREE.Quaternion().setFromRotationMatrix(m);
                if (t < TIRAR.saiu - 0.25) item.grupo.position.copy(meio);
                else if (o) item.grupo.position.copy(ator.noMundo(o.pos.clone()));
                item.grupo.quaternion.copy(noPulso).slerp(emPe, sobe);
              } else if (o) item.grupo.position.copy(ator.noMundo(o.pos.clone()));
              item.grupo.scale.setScalar(1 + (ESCALA_DA_CORREIA - 1) * sobe);
              item.em.copy(item.grupo.position);
            } else if (item?.naMao && o) {
              // o aro vai de pé entre os dedos (pendurado deles), um pouco abaixo da pinça
              item.grupo.position.copy(ator.noMundo(o.pos.clone()));
              item.grupo.quaternion.copy(emPe).multiply(DE_PE);
              item.em.copy(item.grupo.position);
            }
          }
          if (jeito === 'jogar') {
            if (t >= TIRAR.joga && item?.naMao) jogou();
          } else if (t >= TIRAR.pousa) pousou();
          if (fim) {
            if (jeito === 'jogar' && item?.naMao) jogou();
            else if (jeito !== 'jogar') pousou();
            avisar();
          }
        },
      });
      // (uma rede: se o gesto não acabar — a aba escondida —, a mesa não trava)
      setTimeout(() => (jeito === 'jogar' ? avisar() : pousou()), scaled(4600));
    });
  }

  devolverItem(seat: number, id: string): Promise<void> {
    const item = this.itens.get(`${seat}:${id}`);
    if (!item) return Promise.resolve();
    return this.colocarItem(item);
  }

  /**
   * O dono põe de volta a peça que voltou para ele: pega-a na mesa e a coloca onde estava — o anel
   * no dedo, a correia fechada no pulso. Enquanto isso o personagem aparece sem ela (o estado da mesa
   * já a dá como posta). Sem o gesto (o personagem ainda modelando, a peça sem lugar sabido), ela voa
   * para a mão dele.
   */
  private colocarItem(item: ItemNaCena): Promise<void> {
    const { seat, id } = item;
    const ator = this.atores.get(seat);
    const usa = item.usa;
    const voando = () => this.levarItem(item, this.maoDe(seat), 560, 0.07, true);
    if (!ator || !usa || !this.geo[seat]) return voando();
    const def = findAcessorio(id);
    const rigido = def?.tipo === 'pulseira' && (def.feitio === 'argola' || def.feitio === 'argolas');
    const jeito = usa.onde !== 'pulso' || rigido ? 'puxar' : 'desabotoar';
    const chave = `por:${usa.mao}:${usa.onde}:${jeito}`;
    if (!this.tiradas.has(chave)) {
      try {
        this.tiradas.set(chave, colocarAcessorio(bonecoDeConta(), { mao: usa.mao, onde: usa.onde, alvo: [TIRADA.alvo[0], TIRADA.alvo[1]], jeito }));
      } catch (err) {
        console.warn('[mesa 3D] sem o gesto de colocar o acessório', err);
        this.tiradas.set(chave, undefined);
      }
    }
    const gesto = this.tiradas.get(chave);
    if (!gesto) return voando();
    item.voltando = true;
    this.esconder(seat, id, true);
    const acabou = () => {
      if (this.itens.get(`${seat}:${id}`) === item) this.tirarItem(item);
      this.esconder(seat, id, false);
    };
    const emPe = new THREE.Quaternion().setFromAxisAngle(EIXO_Y, this.giroDo(seat));
    // primeiro a peça vai para a frente dele, onde a mão a alcança; aí ele a pega
    return this.levarItem(item, this.pontoDoItem(seat), 340, 0.035).then(
      () =>
        new Promise<void>((pronto) => {
          const desde = performance.now();
          let feito = false;
          const fim = () => {
            if (feito) return;
            feito = true;
            acabou();
            pronto();
          };
          const comecar = () => {
            if (feito) return;
            if (this.itens.get(`${seat}:${id}`) !== item) return fim();
            // (ocupado com outro gesto — puxando o pote que ganhou: espera; demorou demais, a peça voa para a mão)
            if (this.emGesto(ator) || this.ganhando.has(seat) || this.apostando.has(seat)) {
              if (performance.now() - desde > 7000) void voando().then(fim);
              else setTimeout(comecar, 160);
              return;
            }
            ator.tocar(gesto, {
              vel: 1.5,
              aoAndar: (t, objs, acabouOGesto) => {
                // (o gesto é o de tirar, de trás para a frente: os instantes contam do fim)
                const tt = gesto.dur - t;
                const o = objs[0];
                if (!feito && tt < TIRAR.pousa && tt >= TIRAR.pega) {
                  item.naMao = true;
                  if (item.correia) {
                    const c = item.correia;
                    c.ir(tt >= TIRAR.saiu - 0.25 ? 'pendurada' : tt >= TIRAR.abre ? 'solta' : 'fechada');
                    const m = ator.matrizDaPeca(c.osso, usa.mao);
                    const { centro } = this.pulso();
                    const sobe = macio(Math.min(1, Math.max(0, (tt - (TIRAR.saiu - 0.25)) / (TIRAR.pousa - (TIRAR.saiu - 0.25)))));
                    if (m) {
                      if (tt < TIRAR.saiu - 0.25) item.grupo.position.copy(V(usa.mao === 'D' ? -centro[0] : centro[0], centro[1], centro[2]).applyMatrix4(m));
                      else if (o) item.grupo.position.copy(ator.noMundo(o.pos.clone()));
                      item.grupo.quaternion.setFromRotationMatrix(m).slerp(emPe, sobe);
                    } else if (o) item.grupo.position.copy(ator.noMundo(o.pos.clone()));
                    item.grupo.scale.setScalar(1 + (ESCALA_DA_CORREIA - 1) * sobe);
                  } else if (o) {
                    item.grupo.position.copy(ator.noMundo(o.pos.clone()));
                    item.grupo.quaternion.copy(emPe).multiply(DE_PE);
                  }
                  item.em.copy(item.grupo.position);
                }
                // chegou ao lugar (o dedo, o pulso fechado): dali em diante é do personagem
                if (tt < TIRAR.pega || acabouOGesto) fim();
              },
            });
          };
          comecar();
          setTimeout(fim, scaled(9000));
        }),
    );
  }

  recolherItens(): Promise<void> {
    const indo = [...this.itens.values()].filter((i) => i.lugar === 'aposta' && !i.naMao);
    return Promise.all(
      indo.map((item) => {
        item.lugar = 'pote';
        return this.levarItem(item, this.pontoNoPote(item.id, item), VOO.recolherFichas + 260, 0.07);
      }),
    ).then(() => {});
  }

  entregarItens(itens: { seat: number; id: string; para: number }[]): Promise<void> {
    return Promise.all(
      itens.map(async ({ seat, id, para }, k) => {
        const item = this.itens.get(`${seat}:${id}`);
        if (!item || !this.geo[para]) return;
        // voltou para o dono: ele a coloca de volta (sem prender a mesa à espera do gesto)
        if (para === seat) {
          item.voltando = true;
          void this.colocarItem(item);
          await new Promise<void>((r) => setTimeout(r, scaled(700)));
          return;
        }
        // pousa na frente de quem ganhou, fica um instante à vista e vai para a mão dele
        await this.levarItem(item, this.pontoDoItem(para, k), VOO.pote + 120, 0.11);
        await new Promise<void>((r) => setTimeout(r, scaled(650)));
        if (this.itens.get(`${seat}:${id}`) === item) await this.levarItem(item, this.maoDe(para), 520, 0.05, true);
      }),
    ).then(() => {});
  }

  devolver(seat: number, valor: number): Promise<void> {
    // (as fichas soltas que voltam saem da mesa; o que sobrar da aposta fica onde caiu)
    this.tirarSoltas(seat, valor);
    return this.voar({ tipo: 'fichas', de: this.pontoDaAposta(seat), ate: this.pontoDaPilha(seat), giroDe: 0, giroAte: 0, arco: 0.04, some: true, valor, estilo: this.entrada?.fichaDe(seat), ms: VOO.aposta });
  }

  bater(seat: number, aoBater?: () => void): boolean {
    const ator = this.atores.get(seat);
    if (!ator || this.emGesto(ator)) return false;
    // de cada seis vezes: três com os nós dos dedos (o punho fechado), duas com o tapinha e uma com os dois dedos
    const ids = ['check-nos', 'check-nos', 'check-nos', 'check-palma', 'check-palma', 'check-dedos'];
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
      if (dealer && !soBaralho(dealer.gesto) && !this.emGesto(dealer)) dealer.tocar(entregar, { vel: 1.5, laco: true });
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
        if (!this.emGesto(ator) && !s.folded) ator.tocar(olhar, { vel: 1.25 });
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
  /**
   * Num gesto de verdade? Brincar com a ficha não conta: é um passatempo de quem espera, e qualquer
   * gesto do jogo (passar, olhar as cartas, pousar o baralho) o interrompe.
   */
  private emGesto(ator: Ator): boolean {
    return ator.ocupado && ator.gesto !== 'girar';
  }

  /** Quando cada assento brinca de novo com uma ficha (o instante, em ms). */
  private readonly proximaBrincadeira = new Map<number, number>();

  /**
   * De vez em quando, quem está esperando brinca com uma ficha: ela rola por cima dos dedos da mão
   * direita e volta por baixo. Só quem está de mãos livres — sem a vez, sem o baralho, sem cartas
   * abertas na frente, sem aposta nem pote a caminho — e tem fichas na mesa.
   */
  private brincadeiras(agora: number) {
    const v = this.entrada?.view;
    const girar = clipe('girar');
    if (!v || !girar) return;
    for (const [seat, ator] of this.atores) {
      let quando = this.proximaBrincadeira.get(seat);
      if (quando === undefined) this.proximaBrincadeira.set(seat, (quando = agora + 8000 + Math.random() * 30000));
      if (agora < quando) continue;
      this.proximaBrincadeira.set(seat, agora + 25000 + Math.random() * 35000);
      const s = v.seats[seat];
      const livre = s && s.stack > 0 && v.toAct !== seat && !ator.ocupado && !ator.seguraOBaralho && !this.chegando.has(ator);
      if (!livre || this.comAbertas(seat) || this.apostando.has(seat) || this.ganhando.has(seat) || this.entrega?.dealer === seat) continue;
      ator.tocar(girar);
    }
  }

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
        if (this.emGesto(ator) && tentativas++ < 25) {
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
          // (a curva não pode passar do destino e voltar: a carta de quem desiste para no monte, não o ultrapassa)
          const rx = ate.x - de.x;
          const rz = ate.z - de.z;
          const reta = rx * rx + rz * rz || 1;
          let passa = false;
          for (let k = 1; k < 16 && !passa; k++) {
            const u = k / 16;
            const x = (1 - u) * (1 - u) * de.x + 2 * u * (1 - u) * por.x + u * u * ate.x;
            const z = (1 - u) * (1 - u) * de.z + 2 * u * (1 - u) * por.z + u * u * ate.z;
            const ao = ((x - de.x) * rx + (z - de.z) * rz) / reta;
            passa = ao > 1.03 || ao < -0.03;
          }
          if (passa) continue;
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
    // (as fichas soltas de cada aposta juntam-se num monte, que é o que voa para o pote)
    for (const a of apostas) this.tirarSoltas(a.seat);
    const pote = this.doPlano(POTE_3D);
    const estilo = this.entrada?.fichaDoPote;
    return Promise.all(
      apostas.map((a) => this.voar({ tipo: 'fichas', de: this.pontoDaAposta(a.seat), ate: pote, giroDe: 0, giroAte: 0, arco: 0.05 + Math.random() * 0.03, some: true, valor: a.valor, estilo: this.entrada?.fichaDe(a.seat) ?? estilo, ms: VOO.recolherFichas + Math.random() * 120 })),
    ).then(() => {});
  }

  /**
   * Onde cada coluna do que ele ganhou fica junto da pilha dele: ao lado das colunas que já tem,
   * enquanto houver lugar (são quatro); depois, em cima da mais baixa.
   */
  private lugaresNaPilha(seat: number, cols: { count: number }[]): { x: number; z: number; y0: number }[] {
    const pilha = this.entrada?.view.seats[seat]?.stack ?? 0;
    const alturas = pilha > 0 ? breakdown(pilha, 4, 99).map((c) => Math.min(c.count, NA_PILHA)) : [];
    return cols.map((c) => {
      const j = alturas.length < 4 ? alturas.push(0) - 1 : alturas.indexOf(Math.min(...alturas));
      const [cx, cz] = this.colunaDaPilha(j);
      const w = this.doAssento(seat, cx, 0, cz);
      const y0 = MESA + alturas[j] * FICHA.alto;
      alturas[j] += c.count;
      return { x: w.x, z: w.z, y0 };
    });
  }

  /**
   * O pote vai para quem ganhou — como numa mesa de verdade: **empurrado pelo feltro** até a frente
   * dele (não voa), ele o puxa com as pontas dos dedos para junto da pilha e as colunas sobem para a
   * pilha, onde ficam até o estado da mesa contar as fichas (nada some no caminho).
   */
  pagar(seat: number, valor: number): Promise<void> {
    const estilo = this.entrada?.fichaDoPote;
    const pote = this.doPlano(POTE_3D);
    const semente = seat * 29 + 5;
    const lado = this.geo[seat] ? this.doAssento(seat, 1, 0, 0).sub(this.doAssento(seat, 0, 0, 0)).setY(0).normalize() : V(1, 0, 0);
    const empurrar = (ate: THREE.Vector3, some: boolean, ms: number) =>
      this.voar({ tipo: 'fichas', de: pote, ate, por: this.contorno(pote, ate), giroDe: 0, giroAte: 0, arco: 0, some, valor, estilo, empurrado: { ladoDe: V(1, 0, 0), ladoAte: lado, semente }, ms });
    const direto = () => empurrar(this.pontoDaPilha(seat), true, VOO.pote);
    const ator = this.atores.get(seat);
    // (com as cartas abertas na frente, o gesto parte do descanso de mãos fora delas, e volta para ele)
    const gesto = (this.comAbertas(seat) ? clipe('ganhar-abertas') : undefined) ?? clipe('ganhar');
    // (sem o personagem ou o gesto — ou já puxando outro pote —, as fichas vão direto para a pilha dele)
    if (!ator || !gesto || !this.geo[seat] || this.ganhando.has(seat)) return direto();
    // (quem está pousando o baralho puxa o pote quando acabar)
    if (this.largando?.seat === seat) return this.largando.fim.then(() => this.pagar(seat, valor));
    // O pote escorrega do meio da mesa e para na frente de quem ganhou no instante em que a mão dele
    // chega para puxá-lo; dali vai com as pontas dos dedos até junto da pilha dele — e a outra mão comemora.
    const g = { valor, estilo, naMesa: false, t: 0 };
    this.ganhando.set(seat, g);
    void empurrar(this.doAssento(seat, GANHAR.chega[0], MESA, GANHAR.chega[1]), false, (GANHAR.toca / VEL_DE_GANHAR) * 1000).then(() => {
      g.naMesa = true;
    });
    return new Promise((pronto) => {
      let feito = false;
      /** A mão largou o monte junto da pilha: cada coluna sobe para o lugar dela na pilha. */
      const guardar = () => {
        if (feito) return;
        feito = true;
        const meio = meioDoMonteGanho(ator.objetos) ?? V(GANHAR.fica[0], MESA, GANHAR.fica[1]);
        if (this.ganhando.get(seat) === g) this.ganhando.delete(seat);
        if (!estilo || !g.naMesa) return pronto();
        const centro = this.doAssento(seat, meio.x, MESA, meio.z);
        const cols = breakdown(valor, 3, 6);
        const lugares = this.lugaresNaPilha(seat, cols);
        const rec: Recebidas = this.recebidas.get(seat) ?? { estilo, cols: [], pilhaAntes: this.entrada?.view.seats[seat]?.stack ?? 0, ate: performance.now() + 15000 };
        this.recebidas.set(seat, rec);
        void Promise.all(
          cols.map((c, i) => {
            const k = i - (cols.length - 1) / 2;
            const l = lugares[i];
            const coluna = { ti: c.ti, count: c.count, semente: semente + i * 31 };
            const de = V(centro.x + lado.x * k * ENTRE_COLUNAS, MESA, centro.z + lado.z * k * ENTRE_COLUNAS);
            // (a que vai mais longe sai junto e chega depois; o salto passa por cima do que a pilha já tem)
            return this.voar({ tipo: 'fichas', de, ate: V(l.x, l.y0, l.z), giroDe: 0, giroAte: 0, arco: 0.026 + (l.y0 - MESA) * 0.5, some: false, estilo, coluna, ms: 250 + i * 70 }).then(() => {
              rec.cols.push({ ...coluna, ...l });
            });
          }),
        ).then(() => pronto());
      };
      ator.tocar(gesto, {
        vel: VEL_DE_GANHAR,
        aoAndar: (t, _objs, fim) => {
          g.t = t;
          // (um instante depois de largar: a mão já subiu de cima do monte)
          if (t >= GANHAR.solta + 0.1 || fim) guardar();
        },
      });
      setTimeout(guardar, scaled((GANHAR.solta / VEL_DE_GANHAR) * 1000) + 1500);
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
      this.brincadeiras(agora);
      if (this.faltaSentar) this.sincronizarAtores();
      for (const ator of this.atores.values()) {
        ator.quadro(dt);
        ator.quadroDoPano(dt);
      }
      if (this.chegando.size) this.receberQuemChegou(agora);
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
      if (this.pronta) this.renderer.render(this.cena, this.camera);
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
    // o que foi jogado na mesa cai, quica e assenta
    this.fisica.passo(this.antesDaFisica ? Math.min(0.05, (agora - this.antesDaFisica) / 1000) : 0);
    this.antesDaFisica = agora;
    // os acessórios apostados: cada um no lugar dele, ou no meio do caminho
    const dtDasPecas = Math.min(0.05, Math.max(0, (agora - this.antesDasPecas) / 1000));
    this.antesDasPecas = agora;
    for (const item of [...this.itens.values()]) {
      // o anel jogado: vai com o corpo dele (e, parado, é ali que ele fica)
      if (item.corpo) {
        item.grupo.position.copy(item.corpo.pos);
        item.grupo.quaternion.copy(item.corpo.quat);
        item.em.copy(item.corpo.pos);
        if (item.corpo.dorme) item.alto = item.corpo.pos.y - MESA;
      }
      // a correia: a mola dela anda e, largada, ela tomba até o jeito em que fica; pousada, a peça acompanha
      // a própria forma — o ponto mais baixo dela é o que encosta na mesa (não afunda nem flutua)
      if (item.correia) {
        const mudou = item.correia.passo(dtDasPecas);
        const tombo = item.tombando;
        if (tombo && !item.naMao && !item.voo) {
          const u = Math.min(1, (agora - tombo.inicio) / scaled(TOMBO));
          item.grupo.quaternion.copy(tombo.de).slerp(item.correia.largada(), macio(u));
          if (u >= 1) item.tombando = undefined;
        }
        if ((mudou || tombo) && !item.naMao && !item.voo) {
          item.alto = item.correia.abaixo(item.grupo.quaternion, item.grupo.scale.x);
          item.em.y = MESA + item.base + item.alto;
          item.grupo.position.y = item.em.y;
        }
      }
      const voo = item.voo;
      if (!voo) continue;
      const u = Math.min(1, (agora - voo.inicio) / voo.dur);
      item.grupo.position.lerpVectors(voo.de, item.em, macio(u));
      item.grupo.position.y += voo.arco * Math.sin(Math.PI * u);
      // (levada, a peça toma o jeito em que fica pousada: o anel que caiu torto endireita no caminho, a correia chega já deitada)
      item.grupo.quaternion.copy(voo.giroDe).slerp(item.correia && !voo.some ? item.correia.largada() : new THREE.Quaternion().setFromAxisAngle(EIXO_Y, item.giro), macio(Math.min(1, u * 1.6)));
      if (item.correia && !voo.some) {
        // (e pousa na altura do jeito com que chega)
        item.alto = item.correia.abaixo(item.correia.largada(), ESCALA_DA_CORREIA);
        item.em.y = MESA + item.base + item.alto;
      }
      // (a que some encolhe no fim do caminho: chega à mão e desaparece nela)
      const tamanho = item.correia ? ESCALA_DA_CORREIA : 1;
      item.grupo.scale.setScalar(tamanho * (voo.some ? 1 - 0.75 * macio(Math.max(0, (u - 0.6) / 0.4)) : 1));
      if (u >= 1) {
        item.voo = undefined;
        voo.pronto();
        if (voo.some) this.tirarItem(item);
      }
    }
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
    const ficha = (st: ChipStyle, ti: number, pos: THREE.Vector3, giro: number, virada?: THREE.Quaternion, escala = 1) => {
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
      if (virada) q.copy(virada);
      else q.setFromAxisAngle(EIXO_Y, giro);
      f.malha.setMatrixAt(f.usadas++, matriz.compose(pos, q, escala === 1 ? um : V(escala, escala, escala)));
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
        if (s.stack > 0) {
          // uma coluna por valor de ficha; as outras vão para fora da aposta (para a direita do jogador), em ziguezague
          breakdown(s.stack, 4, 99).forEach((c, j) => {
            const [cx, cz] = this.colunaDaPilha(j);
            const w = this.doAssento(seat, cx, 0, cz);
            // (a coluna de onde a mão já tirou fichas fica sem elas, até o estado contar a aposta)
            const saiu = ap?.pegas.find((x) => x.coluna === j && x.pegou)?.leva ?? 0;
            coluna(st, c.ti, Math.max(0, Math.min(c.count, NA_PILHA) - saiu), w.x, w.z, seat * 97 + j);
          });
        }
        // o que ele acabou de ganhar e pôr na pilha: ali fica até o estado contar (aí a pilha é que mostra)
        const rec = this.recebidas.get(seat);
        if (rec) {
          if (s.stack !== rec.pilhaAntes || agora > rec.ate) this.recebidas.delete(seat);
          else for (const c of rec.cols) coluna(rec.estilo, c.ti, c.count, c.x, c.z, c.semente, c.y0);
        }
        // as fichas na mão, cada uma com o valor da coluna de onde saiu
        if (ap && ator) {
          for (const o of ap.objs) ficha(st, ap.pegas[o.n ?? 0]?.ti ?? ap.pegas[0]?.ti ?? 0, ator.noMundo(o.pos.clone()), 0);
        }
        // a aposta: só as fichas (o valor de um acessório apostado está no número dela, mas a peça é que está na mesa)
        const emFichas = s.bet - (v.itens ?? []).reduce((t, i) => t + (i.seat === seat && i.naAposta ? i.emJogo : 0), 0);
        const soltas = this.soltas.get(seat);
        if (soltas?.length) {
          // jogadas na mesa: cada uma onde caiu (a sombra, só debaixo das que já deitaram)
          for (const f of soltas) {
            ficha(f.estilo, f.ti, f.d.pos, 0, f.d.quat);
            if (f.d.pos.y < MESA + FICHA.alto) this.sombraDasFichas.por(f.d.pos.x + DESVIO_DA_SOMBRA.x, NIVEL_DA_SOMBRA, f.d.pos.z + DESVIO_DA_SOMBRA.z, 0);
          }
        } else if (emFichas > 0) monte(st, emFichas, this.pontoDaAposta(seat), lado, seat * 13 + 1, 3, 10);
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
        // a ficha com que ele brinca: uma das dele, rolando nos dedos (surge e some encolhida, na mão)
        if (ator && gesto === 'girar') {
          const o = ator.objetos.find((x) => x.tipo === 'ficha');
          const dur = clipe('girar')?.dur ?? 1;
          const escala = macio(Math.min(ator.instante, dur - ator.instante) / 0.16);
          if (o && escala > 0.02) ficha(st, breakdown(Math.max(1, s.stack), 4, NA_PILHA)[0]?.ti ?? 0, ator.noMundo(o.pos.clone()), 0, ator.grupo.quaternion.clone().multiply(o.quat), escala);
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
      // (o pote em fichas: o que é acessório está ao lado, em peça)
      const poteEmFichas = v.pot - (v.itens ?? []).reduce((t, i) => t + (i.naAposta ? 0 : i.emJogo), 0);
      if (poteEmFichas > 0) monte(e.fichaDoPote, poteEmFichas, this.doPlano(POTE_3D), V(1, 0, 0), 777, 5, 12);
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
      const noCaminho = (k: number) => {
        const pos = vo.por ? vo.de.clone().multiplyScalar((1 - k) * (1 - k)).addScaledVector(vo.por, 2 * k * (1 - k)).addScaledVector(vo.ate, k * k) : vo.de.clone().lerp(vo.ate, k);
        if (vo.por) pos.y = vo.de.y + (vo.ate.y - vo.de.y) * k;
        pos.y += vo.arco * Math.sin(Math.PI * k);
        return pos;
      };
      const pos = noCaminho(k);
      const giro = vo.giroDe + (vo.giroAte - vo.giroDe) * macio(u);
      const escala = vo.some ? 1 - macio((u - 0.75) / 0.25) : 1;
      if (vo.tipo === 'carta' && e) {
        const m = pegarCarta(materiaisDaCarta(e.cartas.back, e.cartas.face));
        m.position.copy(pos);
        m.quaternion.setFromAxisAngle(EIXO_Y, giro);
        m.scale.setScalar(Math.max(0.001, escala));
      } else if (vo.tipo === 'fichas' && vo.estilo && vo.coluna) {
        // uma coluna que sobe para a pilha de quem ganhou: as fichas vão como estavam no monte
        const c = vo.coluna;
        for (let j = 0; j < c.count; j++) ficha(vo.estilo, c.ti, V(pos.x + jitter(c.semente, c.ti, j) * 0.0012, pos.y + (j + 0.5) * FICHA.alto, pos.z + jitter(c.semente, c.ti, j, 7) * 0.0012), hash01(c.semente, j) * 6.28);
      } else if (vo.tipo === 'fichas' && vo.estilo && vo.valor && vo.empurrado && escala > 0.05) {
        // o pote empurrado pelo feltro: cada coluna escorrega, uma um nada atrás da outra
        const em = vo.empurrado;
        const cols = breakdown(vo.valor, 3, 6);
        cols.forEach((c, i) => {
          const ui = Math.min(1, Math.max(0, (u - (i / cols.length) * FILA_DO_POTE) / (1 - FILA_DO_POTE)));
          const ki = macio(ui);
          const p = noCaminho(ki);
          const lado = em.ladoDe.clone().lerp(em.ladoAte, ki).normalize();
          const off = (i - (cols.length - 1) / 2) * ENTRE_COLUNAS;
          const x = p.x + lado.x * off;
          const z = p.z + lado.z * off;
          // (para onde vai: a coluna pende para trás enquanto ganha velocidade e para a frente enquanto a perde)
          const rumo = noCaminho(Math.min(1, ki + 0.02)).sub(noCaminho(Math.max(0, ki - 0.02))).setY(0);
          if (rumo.lengthSq() > 1e-10) rumo.normalize();
          const pende = Math.sin(2 * Math.PI * ui) * 0.32 * FICHA.alto;
          const sem = em.semente + i * 31;
          const n = Math.ceil(c.count * escala);
          if (n > 0) this.sombraDasFichas.por(x + DESVIO_DA_SOMBRA.x, NIVEL_DA_SOMBRA, z + DESVIO_DA_SOMBRA.z, 0);
          for (let j = 0; j < n; j++) {
            ficha(vo.estilo!, c.ti, V(x + jitter(sem, c.ti, j) * 0.0012 - rumo.x * pende * j, MESA + (j + 0.5) * FICHA.alto, z + jitter(sem, c.ti, j, 7) * 0.0012 - rumo.z * pende * j), hash01(sem, j) * 6.28);
          }
        });
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
      chegando: this.chegando.size,
      tela: { ...this.medida },
    };
  }

  destruir() {
    cancelAnimationFrame(this.quadroPedido);
    for (const d of this.desligar) d();
    for (const v of this.voos) v.pronto();
    this.voos = [];
    for (const item of [...this.itens.values()]) this.tirarItem(item);
    for (const a of this.atores.values()) a.destruir();
    this.atores.clear();
    this.chegando.clear();
    this.renderer.dispose();
  }
}
