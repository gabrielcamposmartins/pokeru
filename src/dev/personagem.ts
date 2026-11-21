/**
 * Página de apoio para desenvolvimento (não entra no app): abre /personagem.html e mostra só o
 * modelo 3D do personagem-base (src/personagem/corpo.ts), com o esqueleto e as animações de braços
 * e dedos à mesa (src/personagem/animacoes.ts). Trocar de animação não troca de pose de repente: as
 * mãos passam de onde estão para o começo da animação nova.
 *
 *   /personagem.html                 o corpo inteiro, de frente, em T-pose
 *   /personagem.html?vista=mao       já abre numa vista: corpo | costas | lado | quina | cabeca | braco | mao | palma | unhas | dedos | mesa | olhos | perfil
 *   /personagem.html?luz=anime       o jeito de iluminar: suave | anime | malha
 *   /personagem.html?anim=fichas     já abre numa animação (o id dela); &t=1.2 para no instante dado; &ritmo=0.5 toca a meia velocidade
 *   /personagem.html?roupa=tobi      já abre vestido: alistair | marina | ren | tobi | violetta | yukina
 *   /personagem.html?gira=1          girando devagar
 *
 * Arrastar gira, a roda do mouse aproxima, o botão direito (ou dois dedos) desloca.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { aplicar, criarClipes, entrePoses, poseDe, poseT, posarPose, type Clipe, type Pose } from '../personagem/animacoes';
import { Boneco, MESA } from '../personagem/boneco';
import { ALTURA, PONTOS, QUALIDADE, gerarPersonagem } from '../personagem/corpo';
import { montarEsqueleto, pesar, type Esqueleto } from '../personagem/esqueleto';
import type { Malha } from '../personagem/malha';
import { Pano, type MesaDoPano } from '../personagem/pano';
import { PELE_CLARA, TRAJES, costurar, type Pele } from '../personagem/roupa';
import { cor, criarObjetos, criarPele, criarTecido, criarTraco } from './materiais';

type Luz = 'suave' | 'anime' | 'malha';
interface Vista {
  nome: string;
  /** Para onde a câmera olha e de onde. */
  alvo: [number, number, number];
  de: [number, number, number];
  /** A vista é da mesa (das animações) e não da T-pose. */
  daMesa?: boolean;
}

const [mx, my, mz] = PONTOS.mao;
const VISTAS: Record<string, Vista> = {
  corpo: { nome: 'Corpo', alvo: [0, 0.88, 0], de: [0, 0.95, 4.1] },
  costas: { nome: 'Costas', alvo: [0, 0.88, 0], de: [0, 0.95, -4.1] },
  lado: { nome: 'Lado', alvo: [0, 0.88, 0], de: [4.1, 0.95, 0] },
  quina: { nome: '3/4', alvo: [0, 0.9, 0], de: [2.3, 1.35, 3.3] },
  cabeca: { nome: 'Cabeça', alvo: [0, 1.6, 0], de: [0.3, 1.66, 1.05] },
  braco: { nome: 'Braço', alvo: [0.47, 1.4, 0], de: [0.62, 1.62, 1.02] },
  mao: { nome: 'Mão', alvo: [mx, my, mz], de: [mx + 0.05, my + 0.36, mz + 0.19] },
  palma: { nome: 'Palma', alvo: [mx, my, mz], de: [mx + 0.05, my - 0.36, mz + 0.19] },
  unhas: { nome: 'Unhas', alvo: [mx + 0.058, my - 0.006, mz + 0.004], de: [mx + 0.1, my + 0.27, mz + 0.1] },
  dedos: { nome: 'Dedos', alvo: [mx + 0.035, my - 0.004, mz - 0.004], de: [mx + 0.2, my + 0.2, mz - 0.22] },
  mesa: { nome: 'Mesa', alvo: [0, MESA + 0.06, 0.42], de: [0, MESA + 0.66, 1.7], daMesa: true },
  olhos: { nome: 'Dos olhos', alvo: [0, MESA, 0.5], de: [0, 1.66, 0.02], daMesa: true },
  perfil: { nome: 'De lado', alvo: [-0.05, MESA + 0.05, 0.42], de: [-1.25, MESA + 0.4, 0.75], daMesa: true },
};

const pedido = new URLSearchParams(location.search);

// ─────────────────────────────── a página ───────────────────────────────

const estilo = document.createElement('style');
estilo.textContent = `
  html, body { margin: 0; height: 100%; overflow: hidden; background: radial-gradient(120% 90% at 50% 38%, #4a4656 0%, #2c2935 55%, #1b1922 100%); color: #f1ecf4; font: 14px/1.4 system-ui, 'Segoe UI', sans-serif; }
  #root, canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  canvas { touch-action: none; cursor: grab; }
  canvas:active { cursor: grabbing; }
  .pg-painel { position: absolute; left: 18px; top: 16px; display: flex; flex-direction: column; gap: 8px; max-width: calc(100% - 36px); pointer-events: none; }
  .pg-titulo { font-size: 17px; font-weight: 700; letter-spacing: 0.02em; }
  .pg-sub { opacity: 0.7; font-size: 12.5px; }
  .pg-linha { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; pointer-events: auto; }
  .pg-rotulo { width: 62px; opacity: 0.6; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.08em; }
  .pg-linha button { font: inherit; font-size: 13px; color: inherit; padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(20, 17, 28, 0.55); cursor: pointer; }
  .pg-linha button:hover { background: rgba(255, 255, 255, 0.14); }
  .pg-linha button.on { background: #f3d9d6; color: #2a2030; border-color: #f3d9d6; font-weight: 600; }
  .pg-ritmo { width: 300px; accent-color: #f3d9d6; cursor: pointer; }
  .pg-ritmo-valor { min-width: 44px; text-align: center; font-variant-numeric: tabular-nums; font-size: 13px; font-weight: 600; padding: 4px 9px; border-radius: 999px; background: rgba(20, 17, 28, 0.7); border: 1px solid rgba(255, 255, 255, 0.18); }
  .pg-pe { position: absolute; left: 18px; bottom: 14px; opacity: 0.62; font-size: 12.5px; pointer-events: none; }
  .pg-espera { position: absolute; inset: 0; display: grid; place-items: center; font-size: 16px; opacity: 0.8; pointer-events: none; }
`;
document.head.append(estilo);

const raizDaPagina = document.getElementById('root')!;
const tela = document.createElement('canvas');
const painel = document.createElement('div');
painel.className = 'pg-painel';
const pe = document.createElement('div');
pe.className = 'pg-pe';
const espera = document.createElement('div');
espera.className = 'pg-espera';
espera.textContent = 'Modelando o personagem…';
raizDaPagina.append(tela, painel, pe, espera);

// ─────────────────────────────── a cena ───────────────────────────────

const renderer = new THREE.WebGLRenderer({ canvas: tela, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
const cena = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(26, 1, 0.02, 40);
const controle = new OrbitControls(camera, tela);
controle.enableDamping = true;
controle.dampingFactor = 0.12;
controle.minDistance = 0.08;
controle.maxDistance = 9;
controle.zoomSpeed = 1.6;
// as fichas, as cartas e a mesa usam os materiais prontos, que pedem luz
cena.add(new THREE.AmbientLight(0xffffff, 1.5));
const sol = new THREE.DirectionalLight(0xfff2ea, 1.7);
sol.position.set(-1.2, 3, 2);
cena.add(sol);

const pele = criarPele();
const traco = criarTraco();
const arame = new THREE.MeshBasicMaterial({ color: 0x4a2a36, wireframe: true, transparent: true, opacity: 0.32 });
const tecido = criarTecido();

// o chão: um disco que some nas bordas, só para o personagem não flutuar
const chao = new THREE.Mesh(
  new THREE.CircleGeometry(1.5, 64),
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec2 vP;
      void main() {
        float d = length(vP);
        float pe = max(exp(-pow(length((vP - vec2(0.076, -0.04)) / vec2(0.07, 0.15)), 2.0)), exp(-pow(length((vP - vec2(-0.076, -0.04)) / vec2(0.07, 0.15)), 2.0)));
        gl_FragColor = vec4(vec3(0.07, 0.05, 0.09), (1.0 - smoothstep(0.2, 1.5, d)) * 0.34 + pe * 0.35);
      }
    `,
  }),
);
chao.rotation.x = -Math.PI / 2;
cena.add(chao);

// ─────────────────────── a mesa, as fichas e as cartas ───────────────────────

const mesa = new THREE.Group();
mesa.visible = false;
cena.add(mesa);
{
  const tampo = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.045, 1.16), new THREE.MeshStandardMaterial({ color: 0x1f6a55, roughness: 0.95 }));
  tampo.position.set(0, MESA - 0.0225, 0.7);
  const beira = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.06, 1.24), new THREE.MeshStandardMaterial({ color: 0x3a2430, roughness: 0.7 }));
  beira.position.set(0, MESA - 0.034, 0.7);
  mesa.add(tampo, beira);
}
/** Põe na mesa as fichas e cartas de um instante. */
const mostrarObjetos = criarObjetos(mesa);

// ─────────────────────────────── o estado ───────────────────────────────

/** A velocidade máxima do preview, e quanto dura a passagem entre duas animações (mais comprida de e para a T-pose). */
const RITMO_MAX = 6;
const PASSAGEM = { entreAnimacoes: 0.6, comATPose: 1 };

let contorno: THREE.SkinnedMesh | undefined;
/** O corpo, guardado para vestir: a malha, a geometria, o esqueleto e os ossos. */
let corpo: { malha: Malha; geo: THREE.BufferGeometry; esqueleto: Esqueleto; ossos: THREE.Skeleton } | undefined;
/** O traje vestido ('' = nenhum), as roupas já costuradas, e as malhas da que está em cena. */
let traje = '';
const costuradas = new Map<string, { geo: THREE.BufferGeometry; coberto: Float32Array }>();
let pecasEmCena: THREE.SkinnedMesh[] = [];
/** As partes soltas da roupa vestida: pano simulado a cada quadro. */
let panos: { pano: Pano; malha: THREE.Mesh }[] = [];
/** A pose deu um pulo (ou a roupa acabou de ser vestida): o pano recomeça do lugar e assenta. */
let reassentar = false;
/** A mesa, para o pano pousar nela: o tampo, a beirada de cá e a espessura. */
const MESA_DO_PANO: MesaDoPano = { y: MESA, z0: 0.08, alto: 0.6 };
let grade: THREE.SkinnedMesh | undefined;
let boneco: Boneco | undefined;
let clipes: Clipe[] = [];

let luz: Luz = (['suave', 'anime', 'malha'] as const).find((l) => l === pedido.get('luz')) ?? 'suave';
let vista = pedido.get('vista') && VISTAS[pedido.get('vista')!] ? pedido.get('vista')! : 'corpo';
let girando = pedido.get('gira') === '1';
/** A animação que está tocando ('' = T-pose), o instante dela, se está parada e o ritmo (1 = velocidade normal). */
let anim = '';
let tempo = 0;
let parado = false;
let ritmo = Math.min(RITMO_MAX, Math.max(0.05, Number(pedido.get('ritmo')) || 1));
/**
 * A passagem de uma animação para a outra: em vez de trocar de pose de repente, as mãos vão da pose
 * em que estavam (`de`) até o começo da animação nova. `u` vai de 0 a 1.
 */
let passagem: { de: Pose; u: number; dura: number } | null = null;

function olhar(qual: string) {
  vista = qual;
  const v = VISTAS[qual];
  // numa tela estreita o corpo de braços abertos não cabe: a câmera recua
  const aperto = Math.max(1, 1.05 / camera.aspect);
  const longe = qual === 'corpo' || qual === 'costas' || qual === 'quina' || v.daMesa ? aperto : 1;
  controle.target.set(...v.alvo);
  camera.position.set(v.alvo[0] + (v.de[0] - v.alvo[0]) * longe, v.alvo[1] + (v.de[1] - v.alvo[1]) * longe, v.alvo[2] + (v.de[2] - v.alvo[2]) * longe);
  controle.update();
  pintarBotoes();
}
/** Pinta a pele com as cores dadas. */
function pintarPele(p: Pele) {
  pele.uniforms.uPele.value = cor(p.luz);
  pele.uniforms.uMeio.value = cor(p.meio);
  pele.uniforms.uSombra.value = cor(p.sombra);
  pele.uniforms.uFundo.value = cor(p.fundo);
}

/**
 * Veste o personagem com o traje de um dos personagens do jogo (ou tira a roupa, com ''). A roupa é
 * costurada na primeira vez que se pede, o que leva um instante; a promessa cumpre quando ela está em cena.
 */
function vestir(qual: string): Promise<void> {
  const escolhido = TRAJES.find((t) => t.id === qual);
  traje = escolhido ? qual : '';
  pintarBotoes();
  return new Promise((pronto) => {
    if (!corpo) return pronto();
    const c = corpo;
    const por = () => {
      for (const m of pecasEmCena) cena.remove(m);
      pecasEmCena = [];
      for (const { pano, malha } of panos) {
        cena.remove(malha);
        pano.geometria.dispose();
      }
      panos = [];
      const feita = escolhido ? costuradas.get(escolhido.id) : undefined;
      (c.geo.getAttribute('coberto') as THREE.BufferAttribute).array.set(feita ? feita.coberto : new Float32Array(c.malha.pos.length / 3));
      c.geo.getAttribute('coberto').needsUpdate = true;
      pintarPele(escolhido ? escolhido.pele : PELE_CLARA);
      if (feita) {
        for (const material of [tecido, traco]) {
          const m = new THREE.SkinnedMesh(feita.geo, material);
          m.bind(c.ossos, new THREE.Matrix4());
          m.frustumCulled = false;
          m.visible = material === tecido || luz === 'anime';
          cena.add(m);
          pecasEmCena.push(m);
        }
      }
      // as partes soltas: pano novo, que assenta no próximo quadro
      if (escolhido && boneco) {
        for (const def of escolhido.panos?.() ?? []) {
          const pano = new Pano(boneco, def);
          const malha = new THREE.Mesh(pano.geometria, tecido);
          malha.frustumCulled = false;
          cena.add(malha);
          panos.push({ pano, malha });
        }
        reassentar = true;
      }
      espera.remove();
      pronto();
    };
    if (!escolhido || costuradas.has(escolhido.id)) return por();
    espera.textContent = 'Costurando a roupa…';
    raizDaPagina.append(espera);
    // (um instante para o aviso aparecer antes de a conta travar a página)
    setTimeout(() => {
      const r = costurar(escolhido, c.esqueleto, c.malha, QUALIDADE);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(r.malha.pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(r.malha.nor, 3));
      geo.setAttribute('ar', new THREE.BufferAttribute(r.malha.ar, 1));
      geo.setAttribute('cor', new THREE.BufferAttribute(r.malha.cor, 3));
      geo.setAttribute('cor2', new THREE.BufferAttribute(r.malha.cor2, 3));
      geo.setAttribute('avesso', new THREE.BufferAttribute(r.malha.cor.map((c) => c * 0.72), 3));
      geo.setAttribute('enfeite', new THREE.BufferAttribute(r.malha.enfeite, 1));
      // (o desenho do enfeite é feito em cima de onde o ponto fica na T-pose)
      geo.setAttribute('repouso', new THREE.BufferAttribute(r.malha.pos, 3));
      geo.setAttribute('skinIndex', new THREE.BufferAttribute(r.indices, 4));
      geo.setAttribute('skinWeight', new THREE.BufferAttribute(r.pesos, 4));
      geo.setIndex(new THREE.BufferAttribute(r.malha.idx, 1));
      geo.computeBoundingSphere();
      costuradas.set(escolhido.id, { geo, coberto: r.coberto });
      por();
    }, 40);
  });
}

function iluminar(qual: Luz) {
  luz = qual;
  pele.uniforms.uAnime.value = qual === 'anime' ? 1 : 0;
  tecido.uniforms.uAnime.value = qual === 'anime' ? 1 : 0;
  // (das duas malhas da roupa, a segunda é o traço dela)
  if (pecasEmCena[1]) pecasEmCena[1].visible = qual === 'anime';
  if (contorno) contorno.visible = qual === 'anime';
  if (grade) grade.visible = qual === 'malha';
  pintarBotoes();
}
/** A pose em que o boneco está agora (a meio de uma passagem, numa animação ou na T-pose). */
function poseDeAgora(b: Boneco): Pose {
  const clipe = clipes.find((c) => c.id === anim);
  const destino = clipe ? poseDe(clipe, passagem ? 0 : tempo) : poseT(b);
  return passagem ? entrePoses(passagem.de, destino, passagem.u) : destino;
}

/**
 * Toca uma animação (ou volta à T-pose, com ''): as mãos passam da pose em que estão para o começo
 * dela. Com `em`, vai direto para esse instante e para ali. A câmera vai para a mesa, ou volta dela.
 */
function animar(qual: string, em?: number) {
  const nova = clipes.some((c) => c.id === qual) ? qual : '';
  passagem = boneco && em === undefined ? { de: poseDeAgora(boneco), u: 0, dura: nova === '' || anim === '' ? PASSAGEM.comATPose : PASSAGEM.entreAnimacoes } : null;
  anim = nova;
  tempo = em ?? 0;
  parado = em !== undefined;
  if (!passagem) reassentar = true;
  mesa.visible = anim !== '';
  chao.visible = anim === '';
  if (anim === '') {
    if (!passagem) boneco?.zerar();
    mostrarObjetos([]);
    if (VISTAS[vista]?.daMesa) olhar('corpo');
  } else if (!VISTAS[vista]?.daMesa) olhar('mesa');
  pintarBotoes();
}

// ─────────────────────────────── os botões ───────────────────────────────

const botoes: { el: HTMLButtonElement; ligado: () => boolean }[] = [];
function linha(rotulo: string, itens: [texto: string, ligado: () => boolean, aoClicar: () => void][]) {
  const el = document.createElement('div');
  el.className = 'pg-linha';
  const r = document.createElement('span');
  r.className = 'pg-rotulo';
  r.textContent = rotulo;
  el.append(r);
  for (const [texto, ligado, aoClicar] of itens) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = texto;
    b.addEventListener('click', aoClicar);
    botoes.push({ el: b, ligado });
    el.append(b);
  }
  return el;
}
function pintarBotoes() {
  for (const b of botoes) b.el.classList.toggle('on', b.ligado());
}

const titulo = document.createElement('div');
titulo.innerHTML = `<div class="pg-titulo">Personagem-base</div><div class="pg-sub">modelo 3D com esqueleto e animações — ainda fora do jogo</div>`;
painel.append(
  titulo,
  linha('Vista', Object.entries(VISTAS).map(([id, v]) => [v.nome, () => vista === id, () => olhar(id)])),
  linha('Luz', [
    ['Suave', () => luz === 'suave', () => iluminar('suave')],
    ['Anime', () => luz === 'anime', () => iluminar('anime')],
    ['Malha', () => luz === 'malha', () => iluminar('malha')],
    ['Girar', () => girando, () => ((girando = !girando), pintarBotoes())],
  ]),
);
// quem mexe na câmera à mão sai da vista pronta
controle.addEventListener('start', () => {
  vista = '';
  pintarBotoes();
});

// ─────────────────────────────── o quadro ───────────────────────────────

function medir() {
  const l = raizDaPagina.clientWidth || window.innerWidth;
  const a = raizDaPagina.clientHeight || window.innerHeight;
  renderer.setSize(l, a, false);
  camera.aspect = l / a;
  camera.updateProjectionMatrix();
  traco.uniforms.uTela.value.set(l, a);
}
window.addEventListener('resize', medir);
medir();
olhar(vista);

let antes = performance.now();
function quadro(t: number) {
  const dt = Math.min(0.1, (t - antes) / 1000);
  antes = t;
  controle.autoRotate = girando;
  controle.autoRotateSpeed = 4;
  controle.update(dt);
  const clipe = clipes.find((c) => c.id === anim);
  if (boneco && passagem) {
    // a passagem: da pose de antes até o começo da animação nova (ou até a T-pose)
    if (!parado) passagem.u += (dt * ritmo) / passagem.dura;
    if (passagem.u >= 1) {
      passagem = null;
      tempo = 0;
      if (!clipe) boneco.zerar();
    } else {
      posarPose(boneco, entrePoses(passagem.de, clipe ? poseDe(clipe, 0) : poseT(boneco), passagem.u));
      mostrarObjetos(clipe?.objetos?.(0, boneco) ?? []);
    }
  }
  if (boneco && clipe && !passagem) {
    if (!parado) tempo = (tempo + dt * ritmo) % clipe.dur;
    mostrarObjetos(aplicar(boneco, clipe, tempo));
  }
  if (boneco && panos.length) {
    // o pano solto: cai, balança e pousa, com os ossos onde estão agora
    boneco.raiz.updateMatrixWorld(true);
    const naMesa = mesa.visible ? MESA_DO_PANO : null;
    for (const { pano } of panos) {
      if (reassentar) {
        pano.recolocar();
        pano.assentar(naMesa);
      } else {
        // (um passo a cada sexagésimo de segundo; num quadro demorado, mais de um)
        const passos = Math.min(4, Math.max(1, Math.round(dt * 60)));
        for (let k = 0; k < passos; k++) pano.passo(dt / passos, naMesa);
      }
      pano.atualizar();
    }
  }
  reassentar = false;
  renderer.render(cena, camera);
  requestAnimationFrame(quadro);
}
requestAnimationFrame(quadro);

// a modelagem leva um instante: primeiro a página aparece, depois o corpo
setTimeout(() => {
  const t0 = performance.now();
  const malha = gerarPersonagem(QUALIDADE);
  const esqueleto = montarEsqueleto();
  const pesos = pesar(malha, esqueleto);
  boneco = new Boneco(esqueleto);
  clipes = criarClipes(boneco);
  boneco.zerar();
  const ms = performance.now() - t0;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(malha.pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(malha.nor, 3));
  geo.setAttribute('ar', new THREE.BufferAttribute(malha.ar, 1));
  geo.setAttribute('unha', new THREE.BufferAttribute(malha.unha, 1));
  geo.setAttribute('rosado', new THREE.BufferAttribute(pesos.rosado, 1));
  geo.setAttribute('coberto', new THREE.BufferAttribute(new Float32Array(malha.pos.length / 3), 1));
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(pesos.indices, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(pesos.pesos, 4));
  geo.setIndex(new THREE.BufferAttribute(malha.idx, 1));
  geo.computeBoundingSphere();

  // os ossos entram na cena uma vez só; as três malhas (pele, traço e arame) obedecem aos mesmos
  cena.add(boneco.raiz);
  boneco.raiz.updateMatrixWorld(true);
  const ossos = new THREE.Skeleton(boneco.ossos);
  const comOssos = (material: THREE.Material) => {
    const m = new THREE.SkinnedMesh(geo, material);
    m.bind(ossos, new THREE.Matrix4());
    m.frustumCulled = false;
    cena.add(m);
    return m;
  };
  comOssos(pele);
  contorno = comOssos(traco);
  grade = comOssos(arame);
  corpo = { malha, geo, esqueleto, ossos };
  iluminar(luz);

  painel.append(
    linha('Roupa', [['Nenhuma', () => traje === '', () => void vestir('')], ...TRAJES.map((t): [string, () => boolean, () => void] => [t.nome, () => traje === t.id, () => void vestir(t.id)])]),
    linha('Animar', [['T-pose', () => anim === '', () => animar('')], ...clipes.map((c): [string, () => boolean, () => void] => [c.nome, () => anim === c.id, () => animar(c.id)])]),
  );
  // o tempo: pausar, e a velocidade num controle deslizante (de 0,05× a 6×)
  const doTempo = linha('Tempo', [['Pausar', () => parado, () => ((parado = !parado), pintarBotoes())]]);
  const deslizante = document.createElement('input');
  deslizante.type = 'range';
  deslizante.min = '0.05';
  deslizante.max = String(RITMO_MAX);
  deslizante.step = '0.05';
  deslizante.value = String(ritmo);
  deslizante.className = 'pg-ritmo';
  deslizante.setAttribute('aria-label', 'Velocidade da animação');
  const mostrador = document.createElement('span');
  mostrador.className = 'pg-ritmo-valor';
  const escrever = () => (mostrador.textContent = ritmo.toFixed(2).replace('.', ',') + '×');
  deslizante.addEventListener('input', () => {
    ritmo = Number(deslizante.value);
    escrever();
  });
  // um duplo clique volta à velocidade normal
  deslizante.addEventListener('dblclick', () => {
    ritmo = 1;
    deslizante.value = '1';
    escrever();
  });
  escrever();
  doTempo.append(deslizante, mostrador);
  painel.append(doTempo);
  if (pedido.get('anim')) animar(pedido.get('anim')!, pedido.has('t') ? Number(pedido.get('t')) : undefined);
  if (pedido.get('roupa')) void vestir(pedido.get('roupa')!);
  pintarBotoes();

  espera.remove();
  const mil = (n: number) => Math.round(n / 1000).toLocaleString('pt-BR');
  pe.textContent = `${ALTURA.toFixed(2).replace('.', ',')} m de altura · ${mil(malha.idx.length / 3)} mil triângulos · ${esqueleto.ossos.length} ossos · ${clipes.length} animações · pronto em ${(ms / 1000).toFixed(1).replace('.', ',')} s`;
  document.title = 'Pokeru — personagem 3D (pronto)';
}, 30);

// para conferir de fora (as capturas automáticas): window.personagem.animar('fichas', 1.2)
/** Põe a câmera num lugar qualquer (para olhar de perto um detalhe). */
function ver(alvo: [number, number, number], de: [number, number, number]) {
  vista = '';
  controle.target.set(...alvo);
  camera.position.set(...de);
  controle.update();
  pintarBotoes();
}
/** Para a meio de uma passagem (para conferir de fora): do instante `em` da animação `de` para a animação `para`. */
function passar(de: string, em: number, para: string, u: number) {
  animar(de, em);
  animar(para);
  if (passagem) passagem.u = u;
  parado = true;
  reassentar = true;
}
(window as unknown as { personagem: unknown }).personagem = { animar, olhar, iluminar, ver, passar, vestir, panos: () => panos.map((p) => p.pano) };
