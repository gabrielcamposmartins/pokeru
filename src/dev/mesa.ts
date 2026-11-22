/**
 * Página de apoio para desenvolvimento (não entra no app): abre /mesa.html e mostra os seis
 * personagens do jogo, cada um com o seu traje, em volta de uma mesa de poker — para achar o melhor
 * ângulo de câmera para a mesa. Um painel mostra (e deixa editar) a posição da câmera, o ponto para
 * onde ela olha, a distância, os ângulos e a lente; o enquadramento pode ser travado numa proporção
 * de tela (16:9, 4:3…), e a câmera fica no endereço da página (recarregar não perde o ângulo).
 *
 * A página abre com a câmera do jogo, fixa (`CAMERA_DO_JOGO`); o botão "Livre" solta a câmera para
 * procurar outro ângulo.
 *
 *   /mesa.html?livre=1&cam=px,py,pz,ax,ay,az,fov   já abre com a câmera solta, nessa posição
 *   /mesa.html?quadro=16:9                  o enquadramento: livre | 16:9 | 16:10 | 4:3 | 21:9 | 9:16
 *   /mesa.html?trajes=abel,agnes,goro       quem senta à mesa, até seis (sem isso: os seis primeiros de TRAJES)
 *   /mesa.html?jogador=marina               quem fica no lugar do jogador (o de baixo, em +z)
 *   /mesa.html?anim=variadas                paradas | descanso | variadas | dealer-entrega | dealer-abre | o id de uma animação
 *   /mesa.html?luz=anime                    suave | anime
 *   /mesa.html?qualidade=alta               a malha fina da página do personagem (mais lenta para abrir)
 *
 * Arrastar gira, a roda do mouse aproxima, o botão direito (ou dois dedos) desloca.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { abrirCartas, aplicar, criarClipes, entregarCartas, vistoDoLugar, type CartaEntregue, type Clipe, type Objeto } from '../personagem/animacoes';
import { Boneco, MESA } from '../personagem/boneco';
import { QUALIDADE, type Qualidade } from '../personagem/corpo';
import { montarEsqueleto } from '../personagem/esqueleto';
import type { Malha } from '../personagem/malha';
import { Pano, type MesaDoPano } from '../personagem/pano';
import { PanosRemotos, podeSimularFora } from '../personagem/panoRemoto';
import { TRAJES as TODOS_OS_TRAJES, type Roupa, type Traje } from '../personagem/roupa';
import { cor, criarObjetos, criarPele, criarTecido, criarTraco } from './materiais';

const pedido = new URLSearchParams(location.search);

/** Quem senta à mesa (são seis lugares): os de `?trajes=`, na ordem dada; sem isso, os seis primeiros. */
const TRAJES: Traje[] = (() => {
  const ids = (pedido.get('trajes') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const escolhidos = ids.map((id) => TODOS_OS_TRAJES.find((t) => t.id === id)).filter((t): t is Traje => !!t);
  return (escolhidos.length ? escolhidos : TODOS_OS_TRAJES).slice(0, 6);
})();

// ─────────────────────────────── a mesa ───────────────────────────────

/**
 * A mesa é um estádio (a forma de pista de corrida das mesas de poker): dois semicírculos de raio
 * `RAIO` ligados por retas de comprimento 2 × `MEIO`. A beirada de couro (`TRILHO`) fica rente ao
 * feltro, na altura do tampo, porque as mãos descansam nela. Cada personagem fica `RECUO` atrás da
 * beirada, como na página do personagem.
 */
const MEIO = 0.55;
const RAIO = 0.62;
const TRILHO = 0.085;
const RECUO = 0.12;
const PERIMETRO = 4 * MEIO + 2 * Math.PI * RAIO;
/** A qualidade da malha: mais grossa que a da página do personagem (a câmera fica mais longe). */
const QUALIDADE_DA_MESA: Qualidade = pedido.get('qualidade') === 'alta' ? QUALIDADE : { corpo: 0.0045, mao: 0.0016 };

/** O ponto da beirada a `s` metros do meio do lado de baixo (+z), andando para +x; e o rumo para fora. */
function naBeirada(s: number): { x: number; z: number; nx: number; nz: number } {
  let r = ((s % PERIMETRO) + PERIMETRO) % PERIMETRO;
  const arco = Math.PI * RAIO;
  if (r < MEIO) return { x: r, z: RAIO, nx: 0, nz: 1 };
  r -= MEIO;
  if (r < arco) {
    const a = r / RAIO;
    return { x: MEIO + RAIO * Math.sin(a), z: RAIO * Math.cos(a), nx: Math.sin(a), nz: Math.cos(a) };
  }
  r -= arco;
  if (r < 2 * MEIO) return { x: MEIO - r, z: -RAIO, nx: 0, nz: -1 };
  r -= 2 * MEIO;
  if (r < arco) {
    const a = Math.PI + r / RAIO;
    return { x: -MEIO + RAIO * Math.sin(a), z: RAIO * Math.cos(a), nx: Math.sin(a), nz: Math.cos(a) };
  }
  r -= arco;
  return { x: -MEIO + r, z: RAIO, nx: 0, nz: 1 };
}

/** Os seis lugares, espaçados por igual em volta da mesa; o 0 é o do jogador (no meio do lado de +z). */
const LUGARES = Array.from({ length: 6 }, (_, k) => {
  const b = naBeirada((k * PERIMETRO) / 6);
  return { x: b.x + b.nx * RECUO, z: b.z + b.nz * RECUO, giro: Math.atan2(-b.nx, -b.nz) };
});

function estadio(raio: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-MEIO, -raio);
  s.lineTo(MEIO, -raio);
  s.absarc(MEIO, 0, raio, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-MEIO, raio);
  s.absarc(-MEIO, 0, raio, Math.PI / 2, (3 * Math.PI) / 2, false);
  return s;
}

// ─────────────────────────────── a página ───────────────────────────────

const estilo = document.createElement('style');
estilo.textContent = `
  html, body { margin: 0; height: 100%; overflow: hidden; background: #15131a; color: #f1ecf4; font: 14px/1.4 system-ui, 'Segoe UI', sans-serif; }
  #root { position: absolute; inset: 0; }
  canvas { position: absolute; display: block; touch-action: none; cursor: grab; }
  canvas:active { cursor: grabbing; }
  .mz-painel { position: absolute; left: 16px; top: 14px; display: flex; flex-direction: column; gap: 7px; max-width: calc(100% - 380px); pointer-events: none; }
  .mz-titulo { font-size: 17px; font-weight: 700; }
  .mz-sub { opacity: 0.7; font-size: 12.5px; }
  .mz-linha { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; pointer-events: auto; }
  .mz-rotulo { width: 66px; opacity: 0.6; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.08em; }
  .mz-linha button, .mz-camera button { font: inherit; font-size: 13px; color: inherit; padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(20, 17, 28, 0.6); cursor: pointer; }
  .mz-linha button:hover, .mz-camera button:hover { background: rgba(255, 255, 255, 0.14); }
  .mz-linha button.on { background: #f3d9d6; color: #2a2030; border-color: #f3d9d6; font-weight: 600; }
  .mz-linha select { font: inherit; font-size: 13px; color: inherit; background: rgba(20, 17, 28, 0.8); border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 8px; padding: 3px 6px; }
  .mz-camera { position: absolute; right: 14px; top: 14px; width: 340px; max-height: calc(100% - 28px); overflow: auto; box-sizing: border-box; padding: 12px 14px; border-radius: 12px; background: rgba(16, 14, 22, 0.82); border: 1px solid rgba(255, 255, 255, 0.12); display: flex; flex-direction: column; gap: 9px; }
  .mz-camera h2 { margin: 0; font-size: 14px; font-weight: 700; }
  .mz-grade { display: grid; grid-template-columns: 74px 1fr 1fr 1fr; gap: 5px 6px; align-items: center; }
  .mz-grade label { opacity: 0.65; font-size: 12px; }
  .mz-grade span.mz-eixo { opacity: 0.45; font-size: 10.5px; text-align: center; }
  .mz-camera input[type=number] { width: 100%; box-sizing: border-box; font: inherit; font-size: 13px; font-variant-numeric: tabular-nums; color: inherit; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 6px; padding: 3px 5px; }
  .mz-camera input[type=number]:focus { outline: none; border-color: #f3d9d6; }
  .mz-camera input[type=range] { width: 100%; accent-color: #f3d9d6; }
  .mz-dado { display: flex; justify-content: space-between; font-size: 12.5px; }
  .mz-dado b { font-variant-numeric: tabular-nums; font-weight: 600; }
  .mz-camera textarea { width: 100%; box-sizing: border-box; height: 74px; resize: vertical; font: 11.5px/1.35 ui-monospace, Consolas, monospace; color: #e8e2ec; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 6px; padding: 5px 6px; }
  .mz-dica { opacity: 0.55; font-size: 11.5px; line-height: 1.35; }
  .mz-quadros { display: flex; flex-wrap: wrap; gap: 5px; }
  .mz-quadros button.on { background: #f3d9d6; color: #2a2030; border-color: #f3d9d6; font-weight: 600; }
  .mz-pe { position: absolute; left: 16px; bottom: 12px; opacity: 0.6; font-size: 12.5px; pointer-events: none; }
  .mz-espera { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; font-size: 15px; opacity: 0.85; pointer-events: none; white-space: pre-line; }
  @media (max-width: 760px) { .mz-camera { width: calc(100% - 28px); top: auto; bottom: 14px; max-height: 46%; } .mz-painel { max-width: calc(100% - 32px); } }
`;
document.head.append(estilo);

const raizDaPagina = document.getElementById('root')!;
const tela = document.createElement('canvas');
const painel = document.createElement('div');
painel.className = 'mz-painel';
const caixaDaCamera = document.createElement('div');
caixaDaCamera.className = 'mz-camera';
const pe = document.createElement('div');
pe.className = 'mz-pe';
const espera = document.createElement('div');
espera.className = 'mz-espera';
espera.textContent = 'Modelando os personagens…';
raizDaPagina.append(tela, painel, caixaDaCamera, pe, espera);

// ─────────────────────────────── a cena ───────────────────────────────

const renderer = new THREE.WebGLRenderer({ canvas: tela, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setClearColor(0x1d1a24);
const cena = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.02, 60);
const controle = new OrbitControls(camera, tela);
controle.enableDamping = true;
controle.dampingFactor = 0.12;
controle.minDistance = 0.1;
controle.maxDistance = 14;
controle.zoomSpeed = 1.4;
cena.add(new THREE.AmbientLight(0xffffff, 1.4));
const sol = new THREE.DirectionalLight(0xfff2ea, 1.6);
sol.position.set(-1.5, 4, 2.5);
cena.add(sol);

// o chão: um disco escuro que some nas bordas
{
  const chao = new THREE.Mesh(
    new THREE.CircleGeometry(6, 96),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec2 vP;
        void main() {
          float d = length(vP);
          gl_FragColor = vec4(mix(vec3(0.2, 0.17, 0.22), vec3(0.11, 0.1, 0.13), smoothstep(0.5, 4.5, d)), 1.0 - smoothstep(3.5, 6.0, d));
        }
      `,
    }),
  );
  chao.rotation.x = -Math.PI / 2;
  cena.add(chao);
}

// a mesa: o feltro, a beirada de couro (rente ao feltro), a saia de madeira e o pé
{
  const deitar = (g: THREE.BufferGeometry) => g.rotateX(-Math.PI / 2);
  // o feltro: verde, um pouco mais escuro perto da beirada, com a linha das apostas
  const feltro = new THREE.Mesh(
    deitar(new THREE.ShapeGeometry(estadio(RAIO - TRILHO + 0.002), 64)),
    new THREE.ShaderMaterial({
      uniforms: { uMeio: { value: MEIO }, uRaio: { value: RAIO - TRILHO } },
      vertexShader: /* glsl */ `varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uMeio, uRaio;
        varying vec2 vP;
        void main() {
          // a que distância da beirada do feltro (o estádio) o ponto está
          float d = uRaio - length(vec2(max(abs(vP.x) - uMeio, 0.0), vP.y));
          vec3 verde = mix(vec3(0.075, 0.27, 0.205), vec3(0.12, 0.4, 0.31), smoothstep(0.0, 0.42, d));
          float linha = smoothstep(0.004, 0.0015, abs(d - 0.2));
          float grao = fract(sin(dot(floor(vP * 900.0), vec2(12.9898, 78.233))) * 43758.5453);
          verde *= 0.97 + 0.05 * grao;
          gl_FragColor = vec4(mix(verde, vec3(0.78, 0.7, 0.48), linha * 0.55), 1.0);
        }
      `,
    }),
  );
  feltro.position.y = MESA - 0.0006;
  // a beirada: um anel de couro com as bordas arredondadas, de topo rente ao feltro
  const anel = estadio(RAIO);
  anel.holes.push(estadio(RAIO - TRILHO));
  const chanfro = 0.014;
  const beirada = new THREE.Mesh(
    deitar(new THREE.ExtrudeGeometry(anel, { depth: 0.05, bevelEnabled: true, bevelThickness: chanfro, bevelSize: chanfro, bevelSegments: 5, curveSegments: 48 })),
    new THREE.MeshStandardMaterial({ color: 0x3b2430, roughness: 0.55 }),
  );
  beirada.position.y = MESA - 0.05 - chanfro;
  // a saia, de madeira, um pouco recolhida
  const saia = new THREE.Mesh(deitar(new THREE.ExtrudeGeometry(estadio(RAIO - 0.03), { depth: 0.09, bevelEnabled: false, curveSegments: 48 })), new THREE.MeshStandardMaterial({ color: 0x5b3a26, roughness: 0.6 }));
  saia.position.y = MESA - 0.064 - 0.09;
  const coluna = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, MESA - 0.15, 32), new THREE.MeshStandardMaterial({ color: 0x2c2028, roughness: 0.7 }));
  coluna.position.y = (MESA - 0.15) / 2;
  const base = new THREE.Mesh(deitar(new THREE.ExtrudeGeometry(estadio(0.42), { depth: 0.04, bevelEnabled: false, curveSegments: 32 })).scale(0.62, 1, 0.7), new THREE.MeshStandardMaterial({ color: 0x2c2028, roughness: 0.7 }));
  cena.add(feltro, beirada, saia, coluna, base);
}

// ─────────────────────────────── os personagens ───────────────────────────────

interface Personagem {
  traje: Traje;
  boneco: Boneco;
  /** O lugar dele: o grupo leva o personagem (que é modelado na origem, olhando para +z) até lá. */
  grupo: THREE.Group;
  lugar: number;
  pele: THREE.ShaderMaterial;
  traco: THREE.ShaderMaterial;
  tecido: THREE.ShaderMaterial;
  /** As malhas que só aparecem no modo de desenho (o traço do corpo e o da roupa). */
  tracos: THREE.Object3D[];
  panos: { pano: Pano; parado: number; antes: Float32Array }[];
  /** Quem simula o pano fora da linha principal, como no jogo (null: sem pano, ou sem ajudante). */
  remoto: PanosRemotos | null;
  /** Com o ajudante: há quantos passos ninguém se mexe, e se o pano precisa recomeçar de onde os ossos estão. */
  paradoFora: number;
  recomecar: boolean;
  mesa: MesaDoPano;
  mostrar: (objs: Objeto[]) => void;
}
let personagens: Personagem[] = [];
let clipes: Clipe[] = [];

/** O que os personagens fazem: ficam parados, descansam (cada um de um jeito), fazem cada um uma coisa, ou todos a mesma animação. */
const DESCANSOS = ['idle-plana', 'idle-sobrepostas', 'idle-concha', 'idle-batucando', 'idle-plana', 'idle-concha'];
const VARIADAS = ['fichas', 'olhar', 'check-nos', 'virar', 'girar', 'check-dedos'];
let modo = pedido.get('anim') ?? 'paradas';
let tempo = 0;
let parado = false;
/** A pose mudou e os personagens parados precisam ser posados de novo. */
let reposar = true;
let luz: 'suave' | 'anime' = pedido.get('luz') === 'anime' ? 'anime' : 'suave';
let jogador = Math.max(0, TRAJES.findIndex((t) => t.id === pedido.get('jogador')));
let panoLigado = true;

/** O clipe e o instante de cada personagem agora. */
/** As animações do dealer (quem está no lugar do jogador), feitas para esta mesa: a entrega para os seis lugares e as cinco cartas abertas. */
let doDealer: { entrega: Clipe; abre: Clipe } | undefined;

/**
 * Monta as animações do dealer para os lugares desta mesa. Os alvos são pontos da mesa passados
 * para as coordenadas de quem entrega (`vistoDoLugar`): as duas cartas de cada um, à frente dele (uma
 * por vez, duas voltas pela mesa, começando por quem está à esquerda do dealer), deitadas de frente
 * para o dono; e as cinco cartas da mesa, no meio, em fila.
 */
function montarODealer(aux: Boneco) {
  const dealer = LUGARES[0];
  const cartas: CartaEntregue[] = [];
  for (const lado of [-0.04, 0.04]) {
    for (let k = 1; k <= 6; k++) {
      const l = LUGARES[k % 6];
      // (o ponto, visto de quem recebe, fica `lado` para a esquerda dele e 0,47 m à frente)
      const noMundo: [number, number] = [l.x + lado * Math.cos(l.giro) + 0.47 * Math.sin(l.giro), l.z - lado * Math.sin(l.giro) + 0.47 * Math.cos(l.giro)];
      cartas.push({ alvo: vistoDoLugar(dealer, noMundo), giro: l.giro - dealer.giro });
    }
  }
  const daMesa = [-2, -1, 0, 1, 2].map((k): [number, number] => vistoDoLugar(dealer, [k * 0.075, 0]));
  doDealer = { entrega: entregarCartas(aux, cartas, { cada: 1 }, 'dealer-entrega', 'Dealer entrega'), abre: abrirCartas(aux, daMesa, 0, {}, 'dealer-abre', 'Dealer abre') };
}

function oQueFaz(i: number): { clipe: Clipe; t: number; anda: boolean } | null {
  const porId = (id: string) => clipes.find((c) => c.id === id);
  if (modo === 'paradas') {
    const c = porId(DESCANSOS[i]);
    return c ? { clipe: c, t: 0, anda: false } : null;
  }
  // o dealer é quem está no lugar do jogador; os outros esperam, cada um do jeito dele
  if (modo === 'dealer-entrega' || modo === 'dealer-abre') {
    const doClipe = modo === 'dealer-entrega' ? doDealer?.entrega : doDealer?.abre;
    if (i === jogador && doClipe) return { clipe: doClipe, t: tempo % doClipe.dur, anda: !parado };
    const c = porId(DESCANSOS[i]);
    return c ? { clipe: c, t: 0, anda: false } : null;
  }
  const c = porId(modo === 'descanso' ? DESCANSOS[i] : modo === 'variadas' ? VARIADAS[i] : modo);
  if (!c) return null;
  // (cada um num instante diferente, para a mesa não se mexer em coro)
  return { clipe: c, t: (tempo + (i * c.dur) / 6) % c.dur, anda: !parado };
}

/** Põe cada personagem no lugar dele (o do jogador é o 0) e diz ao pano dele onde fica a mesa. */
function sentar() {
  for (const p of personagens) {
    const i = TRAJES.indexOf(p.traje);
    p.lugar = (i - jogador + 6) % 6;
    const l = LUGARES[p.lugar];
    p.grupo.position.set(l.x, 0, l.z);
    p.grupo.rotation.set(0, l.giro, 0);
    p.grupo.updateMatrixWorld(true);
    const a = p.grupo.worldToLocal(new THREE.Vector3(-MEIO, 0, 0));
    const b = p.grupo.worldToLocal(new THREE.Vector3(MEIO, 0, 0));
    p.mesa = { y: MESA, alto: 0.6, estadio: { a: [a.x, a.z], b: [b.x, b.z], raio: RAIO } };
  }
  reposar = true;
}

function iluminar(qual: 'suave' | 'anime') {
  luz = qual;
  for (const p of personagens) {
    p.pele.uniforms.uAnime.value = qual === 'anime' ? 1 : 0;
    p.tecido.uniforms.uAnime.value = qual === 'anime' ? 1 : 0;
    for (const t of p.tracos) t.visible = qual === 'anime';
  }
  pintarBotoes();
}

// ─────────────────────────────── a câmera ───────────────────────────────

/** O ponto para onde a câmera olha por padrão: o meio da mesa, na altura do tampo. */
const MEIO_DA_MESA = new THREE.Vector3(0, MESA, 0);

/** Onde ficam os olhos do personagem de um lugar (no mundo). */
function olhosDoLugar(lugar: number, frente = 0.075): THREE.Vector3 {
  const l = LUGARES[lugar];
  return new THREE.Vector3(0, 1.62, frente).applyAxisAngle(new THREE.Vector3(0, 1, 0), l.giro).add(new THREE.Vector3(l.x, 0, l.z));
}

/**
 * A câmera do jogo: a que foi achada nesta página (posição, alvo e campo de visão), com o eixo de
 * lado a lado posto no meio da mesa (x = 0): de cima e de trás do jogador, olhando a mesa toda.
 * Elevação de 68°, a 1,55 m do alvo.
 */
export const CAMERA_DO_JOGO = { posicao: [0, 2.554, 0.638] as const, alvo: [0, 1.116, 0.059] as const, fov: 39.5 };

interface Vista {
  nome: string;
  de: () => THREE.Vector3;
  alvo: () => THREE.Vector3;
  fov: number;
}
const VISTAS: Record<string, Vista> = {
  jogo: { nome: 'Do jogo', de: () => new THREE.Vector3(...CAMERA_DO_JOGO.posicao), alvo: () => new THREE.Vector3(...CAMERA_DO_JOGO.alvo), fov: CAMERA_DO_JOGO.fov },
  olhos: { nome: 'Olhos do jogador', de: () => olhosDoLugar(0), alvo: () => new THREE.Vector3(0, MESA, 0.05), fov: 62 },
  ombro: { nome: 'Atrás do jogador', de: () => olhosDoLugar(0, -0.55).add(new THREE.Vector3(0, 0.38, 0)), alvo: () => MEIO_DA_MESA.clone(), fov: 45 },
  alto: { nome: 'Do alto', de: () => new THREE.Vector3(0, 3.1, 2.7), alvo: () => MEIO_DA_MESA.clone(), fov: 38 },
  cima: { nome: 'De cima', de: () => new THREE.Vector3(0, 5.2, 0.001), alvo: () => MEIO_DA_MESA.clone(), fov: 40 },
  quina: { nome: 'Quina', de: () => new THREE.Vector3(2.6, 2.4, 2.4), alvo: () => MEIO_DA_MESA.clone(), fov: 38 },
  lado: { nome: 'Lado', de: () => new THREE.Vector3(3.6, 1.75, 0), alvo: () => MEIO_DA_MESA.clone(), fov: 38 },
};

/** A câmera está presa na do jogo (o mouse não a mexe, e os números não se editam). */
let fixa = pedido.get('livre') !== '1';
function fixar(sim: boolean) {
  fixa = sim;
  controle.enabled = !sim;
  if (sim) ver(VISTAS.jogo.alvo(), VISTAS.jogo.de(), VISTAS.jogo.fov);
  for (const el of [...Object.values(campos), fov]) el.disabled = sim;
  tela.style.cursor = sim ? 'default' : '';
  pintarBotoes();
  cameraMudou();
}

function ver(alvo: THREE.Vector3Like, de: THREE.Vector3Like, fov?: number) {
  controle.target.set(alvo.x, alvo.y, alvo.z);
  camera.position.set(de.x, de.y, de.z);
  if (fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  controle.update();
  cameraMudou();
}

/** Os ângulos da câmera em volta do alvo: azimute (0° = do lado do jogador, +z; 90° = do lado +x), elevação (para cima do alvo) e distância. */
function angulos() {
  const d = camera.position.clone().sub(controle.target);
  const dist = d.length();
  return { dist, azimute: THREE.MathUtils.radToDeg(Math.atan2(d.x, d.z)), elevacao: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(d.y / (dist || 1), -1, 1))) };
}
function porAngulos(azimute: number, elevacao: number, dist: number) {
  const az = THREE.MathUtils.degToRad(azimute);
  const el = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(elevacao, -89.9, 89.9));
  const t = controle.target;
  camera.position.set(t.x + dist * Math.cos(el) * Math.sin(az), t.y + dist * Math.sin(el), t.z + dist * Math.cos(el) * Math.cos(az));
  controle.update();
  cameraMudou();
}

// o enquadramento: a tela inteira, ou travado numa proporção (com faixas escuras em volta)
const QUADROS: Record<string, number | null> = { livre: null, '16:9': 16 / 9, '16:10': 16 / 10, '4:3': 4 / 3, '21:9': 21 / 9, '9:16': 9 / 16 };
let quadro = pedido.get('quadro') && pedido.get('quadro')! in QUADROS ? pedido.get('quadro')! : 'livre';

function medir() {
  const L = raizDaPagina.clientWidth || window.innerWidth;
  const A = raizDaPagina.clientHeight || window.innerHeight;
  const prop = QUADROS[quadro];
  let l = L;
  let a = A;
  if (prop) {
    if (L / A > prop) l = Math.round(A * prop);
    else a = Math.round(L / prop);
  }
  renderer.setSize(l, a, false);
  Object.assign(tela.style, { width: `${l}px`, height: `${a}px`, left: `${Math.round((L - l) / 2)}px`, top: `${Math.round((A - a) / 2)}px` });
  camera.aspect = l / a;
  camera.updateProjectionMatrix();
  for (const p of personagens) p.traco.uniforms.uTela.value.set(l, a);
  tracoDaRoupa.uniforms.uTela.value.set(l, a);
  cameraMudou();
}
/** O traço da roupa no modo de desenho (o mesmo para todos: a roupa não esconde a cabeça). */
const tracoDaRoupa = criarTraco();

// ── o painel da câmera ──

const n3 = (v: number) => (Math.abs(v) < 0.0005 ? 0 : v).toFixed(3);
const n1 = (v: number) => (Math.abs(v) < 0.05 ? 0 : v).toFixed(1);
const campos: Record<string, HTMLInputElement> = {};
function campo(nome: string, passo: number, aoMudar: () => void) {
  const el = document.createElement('input');
  el.type = 'number';
  el.step = String(passo);
  el.addEventListener('change', aoMudar);
  el.addEventListener('keydown', (e) => e.key === 'Enter' && aoMudar());
  campos[nome] = el;
  return el;
}
const valor = (nome: string) => Number(campos[nome].value);
const aplicarPosicao = () => ver(controle.target, { x: valor('px'), y: valor('py'), z: valor('pz') });
const aplicarAlvo = () => ver({ x: valor('ax'), y: valor('ay'), z: valor('az') }, camera.position);
const aplicarAngulos = () => porAngulos(valor('azimute'), valor('elevacao'), Math.max(0.1, valor('dist')));
const fov = document.createElement('input');
fov.type = 'range';
fov.min = '15';
fov.max = '90';
fov.step = '0.5';
const mudarFov = (v: number) => {
  camera.fov = THREE.MathUtils.clamp(v, 10, 100);
  camera.updateProjectionMatrix();
  cameraMudou();
};
fov.addEventListener('input', () => mudarFov(Number(fov.value)));
const dados: Record<string, HTMLElement> = {};
const dado = (rotulo: string, nome: string) => {
  const el = document.createElement('div');
  el.className = 'mz-dado';
  el.innerHTML = `<span>${rotulo}</span>`;
  const b = document.createElement('b');
  dados[nome] = b;
  el.append(b);
  return el;
};
const texto = document.createElement('textarea');
texto.readOnly = true;
texto.spellcheck = false;
const copiar = document.createElement('button');
copiar.type = 'button';
copiar.textContent = 'Copiar';
copiar.addEventListener('click', () => {
  texto.select();
  const feito = () => {
    copiar.textContent = 'Copiado';
    setTimeout(() => (copiar.textContent = 'Copiar'), 1200);
  };
  // (fora de https a área de transferência moderna não existe: aí vai o jeito antigo)
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(texto.value).then(feito, () => document.execCommand('copy') && feito());
  else if (document.execCommand('copy')) feito();
});
const titulo = document.createElement('h2');
const linhaDosQuadros = document.createElement('div');
linhaDosQuadros.className = 'mz-quadros';
const botoesDeQuadro: [string, HTMLButtonElement][] = Object.keys(QUADROS).map((q) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = q === 'livre' ? 'Livre' : q;
  b.addEventListener('click', () => {
    quadro = q;
    medir();
    for (const [nome, el] of botoesDeQuadro) el.classList.toggle('on', nome === quadro);
  });
  linhaDosQuadros.append(b);
  return [q, b];
});
for (const [nome, el] of botoesDeQuadro) el.classList.toggle('on', nome === quadro);
{
  const grade = document.createElement('div');
  grade.className = 'mz-grade';
  const rotulo = (t: string) => Object.assign(document.createElement('label'), { textContent: t });
  const eixo = (t: string) => Object.assign(document.createElement('span'), { className: 'mz-eixo', textContent: t });
  grade.append(document.createElement('span'), eixo('x'), eixo('y'), eixo('z'));
  grade.append(rotulo('Posição'), campo('px', 0.05, aplicarPosicao), campo('py', 0.05, aplicarPosicao), campo('pz', 0.05, aplicarPosicao));
  grade.append(rotulo('Alvo'), campo('ax', 0.05, aplicarAlvo), campo('ay', 0.05, aplicarAlvo), campo('az', 0.05, aplicarAlvo));
  grade.append(document.createElement('span'), eixo('azimute °'), eixo('elevação °'), eixo('distância m'));
  grade.append(rotulo('Em volta'), campo('azimute', 1, aplicarAngulos), campo('elevacao', 1, aplicarAngulos), campo('dist', 0.05, aplicarAngulos));
  const linhaFov = document.createElement('div');
  linhaFov.className = 'mz-grade';
  linhaFov.style.gridTemplateColumns = '74px 1fr 64px';
  linhaFov.append(rotulo('Campo de visão'), fov, campo('fov', 0.5, () => mudarFov(valor('fov'))));
  const dica = document.createElement('div');
  dica.className = 'mz-dica';
  dica.textContent =
    'Metros, com o meio da mesa em (0, 0, 0) e o tampo a 1,14 m do chão. O jogador fica no lado de +z (azimute 0°); +x fica à direita dele. Elevação é o quanto a câmera está acima do alvo (90° = de cima). Campo de visão é o vertical; a lente é a equivalente numa câmera de 35 mm. Os números mudam com o mouse e podem ser digitados.';
  const rodape = document.createElement('div');
  rodape.style.display = 'flex';
  rodape.style.gap = '6px';
  rodape.append(copiar);
  caixaDaCamera.append(titulo, grade, linhaFov, dado('Lente equivalente', 'lente'), dado('Altura acima do tampo', 'altura'), dado('Inclinação (olhando para baixo)', 'inclinacao'), dado('Proporção da tela', 'proporcao'), rotulo('Enquadramento'), linhaDosQuadros, texto, rodape, dica);
}

let urlAgendada = 0;
/** Atualiza o painel (menos o campo que está sendo digitado) e o endereço da página. */
function cameraMudou() {
  const p = camera.position;
  const t = controle.target;
  const { dist, azimute, elevacao } = angulos();
  const escreve = (nome: string, v: string) => {
    if (document.activeElement !== campos[nome]) campos[nome].value = v;
  };
  escreve('px', n3(p.x));
  escreve('py', n3(p.y));
  escreve('pz', n3(p.z));
  escreve('ax', n3(t.x));
  escreve('ay', n3(t.y));
  escreve('az', n3(t.z));
  escreve('azimute', n1(azimute));
  escreve('elevacao', n1(elevacao));
  escreve('dist', n3(dist));
  escreve('fov', n1(camera.fov));
  if (document.activeElement !== fov) fov.value = String(camera.fov);
  const lente = 12 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  dados.lente.textContent = `${lente.toFixed(0)} mm`;
  dados.altura.textContent = `${(p.y - MESA).toFixed(2).replace('.', ',')} m`;
  const olhando = new THREE.Vector3();
  camera.getWorldDirection(olhando);
  dados.inclinacao.textContent = `${n1(-THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(olhando.y, -1, 1))))}°`;
  dados.proporcao.textContent = `${camera.aspect.toFixed(3).replace('.', ',')}${quadro === 'livre' ? ' (livre)' : ` (${quadro})`}`;
  titulo.textContent = fixa ? 'Câmera do jogo (fixa)' : 'Câmera (livre)';
  const r = (v: number) => Number(v.toFixed(3));
  texto.value = JSON.stringify({ posicao: [r(p.x), r(p.y), r(p.z)], alvo: [r(t.x), r(t.y), r(t.z)], fov: Number(camera.fov.toFixed(1)), azimute: Number(azimute.toFixed(1)), elevacao: Number(elevacao.toFixed(1)), distancia: r(dist), proporcao: quadro });
  // a câmera fica no endereço (recarregar a página não perde o ângulo)
  clearTimeout(urlAgendada);
  urlAgendada = window.setTimeout(() => {
    const q = new URLSearchParams(location.search);
    if (fixa) {
      q.delete('cam');
      q.delete('livre');
    } else q.set('livre', '1');
    if (!fixa) q.set('cam', [p.x, p.y, p.z, t.x, t.y, t.z].map((v) => v.toFixed(3)).join(',') + ',' + camera.fov.toFixed(1));
    if (quadro !== 'livre') q.set('quadro', quadro);
    else q.delete('quadro');
    history.replaceState(null, '', `${location.pathname}?${q.toString().replace(/%2C/g, ',').replace(/%3A/g, ':')}`);
  }, 250);
}
controle.addEventListener('change', cameraMudou);

// ── os botões ──

const botoes: { el: HTMLButtonElement; ligado: () => boolean }[] = [];
function linha(rotulo: string, itens: [texto: string, ligado: () => boolean, aoClicar: () => void][]) {
  const el = document.createElement('div');
  el.className = 'mz-linha';
  el.append(Object.assign(document.createElement('span'), { className: 'mz-rotulo', textContent: rotulo }));
  for (const [t, ligado, aoClicar] of itens) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = t;
    b.addEventListener('click', aoClicar);
    botoes.push({ el: b, ligado });
    el.append(b);
  }
  return el;
}
function pintarBotoes() {
  for (const b of botoes) b.el.classList.toggle('on', b.ligado());
}
function animar(qual: string) {
  modo = qual;
  // (as do dealer começam do começo)
  if (qual.startsWith('dealer-')) tempo = 0;
  reposar = true;
  for (const p of personagens) {
    p.paradoFora = 0;
    for (const pn of p.panos) pn.parado = 0;
  }
  pintarBotoes();
  if (seletor) seletor.value = clipes.some((c) => c.id === modo) ? modo : '';
}
let seletor: HTMLSelectElement | undefined;

painel.append(
  Object.assign(document.createElement('div'), { innerHTML: '<div class="mz-titulo">Mesa 3D</div><div class="mz-sub">os seis personagens à mesa — para achar o ângulo da câmera</div>' }),
  linha('Câmera', [
    ['Fixa (do jogo)', () => fixa, () => fixar(true)],
    ['Livre', () => !fixa, () => fixar(false)],
  ]),
  linha(
    'Vista',
    Object.entries(VISTAS).map(([nome, v]) => [v.nome, () => false, () => (nome === 'jogo' ? fixar(true) : (fixar(false), ver(v.alvo(), v.de(), v.fov)))]),
  ),
);

// ─────────────────────────────── o quadro ───────────────────────────────

let antes = performance.now();
let quadros = 0;
let medidaDoQuadro = performance.now();
let fps = 0;
const cabeca = new THREE.Vector3();
function quadroDaCena(agora: number) {
  const dt = Math.min(0.1, (agora - antes) / 1000);
  antes = agora;
  controle.update(dt);
  if (!parado) tempo += dt;
  const algumAnda = modo !== 'paradas' && !parado;
  personagens.forEach((p, i) => {
    const faz = oQueFaz(i);
    if (faz && (faz.anda || reposar)) {
      p.mostrar(aplicar(p.boneco, faz.clipe, faz.t));
      p.boneco.raiz.updateMatrixWorld(true);
    }
    // o pano: anda junto com o personagem; parado, assenta e para de ser simulado (até a pose mudar)
    if (panoLigado && p.remoto && !p.remoto.falhou) {
      // (num ajudante, como no jogo: um passo por quadro, sem pesar no desenho)
      if (p.recomecar) p.recomecar = !p.remoto.assentar(p.mesa, 60);
      else if (p.remoto.assentado && (algumAnda || p.paradoFora < 60) && p.remoto.passo(dt, p.mesa)) p.paradoFora = algumAnda ? 0 : p.paradoFora + 1;
      if (p.remoto.assentado) p.remoto.repregar();
    } else if (panoLigado) {
      for (const pn of p.panos) {
        if (!algumAnda && pn.parado > 40) continue;
        pn.antes.set(pn.pano.pos);
        pn.pano.passo(dt, p.mesa);
        pn.pano.atualizar();
        let mexeu = 0;
        for (let k = 0; k < pn.antes.length; k++) mexeu = Math.max(mexeu, Math.abs(pn.pano.pos[k] - pn.antes[k]));
        pn.parado = algumAnda || mexeu > 0.00003 ? 0 : pn.parado + 1;
      }
    }
    // com a câmera dentro da cabeça de alguém (nos olhos dele), a cabeça dele não se desenha
    cabeca.setFromMatrixPosition(p.boneco.osso('cabeca').matrixWorld);
    p.grupo.localToWorld(cabeca.setY(cabeca.y + 0.08));
    const semCabeca = camera.position.distanceTo(cabeca) < 0.3 ? 1.5 : 99;
    p.pele.uniforms.uSemCabeca.value = semCabeca;
    p.traco.uniforms.uSemCabeca.value = semCabeca;
    p.tecido.uniforms.uSemCabeca.value = semCabeca;
  });
  reposar = false;
  renderer.render(cena, camera);
  quadros++;
  if (agora - medidaDoQuadro > 1000) {
    fps = (quadros * 1000) / (agora - medidaDoQuadro);
    quadros = 0;
    medidaDoQuadro = agora;
    if (personagens.length) pe.textContent = `${personagens.length} personagens · ${fps.toFixed(0)} quadros por segundo`;
  }
  requestAnimationFrame(quadroDaCena);
}

// a câmera do jogo, fixa; ou, com ?livre=1, a do endereço
{
  const cam = pedido.get('cam')?.split(',').map(Number);
  if (!fixa && cam && cam.length >= 6 && cam.every(Number.isFinite)) ver({ x: cam[3], y: cam[4], z: cam[5] }, { x: cam[0], y: cam[1], z: cam[2] }, cam[6]);
  else if (!fixa) ver(VISTAS.ombro.alvo(), VISTAS.ombro.de(), VISTAS.ombro.fov);
  fixar(fixa);
}
window.addEventListener('resize', medir);
medir();
requestAnimationFrame(quadroDaCena);

// ─────────────────────────────── a montagem ───────────────────────────────

/** Pede um trabalho a um ajudante (fora da página) e espera a resposta. */
function pedir<T>(ajudante: Worker, msg: unknown): Promise<T> {
  return new Promise((pronto, falhou) => {
    ajudante.onmessage = (e) => pronto(e.data as T);
    ajudante.onerror = (e) => falhou(new Error(e.message));
    ajudante.postMessage(msg);
  });
}

async function montar() {
  const t0 = performance.now();
  const novoAjudante = () => new Worker(new URL('./mesaTrabalho.ts', import.meta.url), { type: 'module' });
  // o corpo e as seis roupas, ao mesmo tempo, cada um num ajudante
  const doCorpo = novoAjudante();
  const daRoupa = TRAJES.map(() => novoAjudante());
  let prontas = 0;
  let corpoPronto = false;
  const contar = () => (espera.textContent = `Modelando os personagens…\ncorpo ${corpoPronto ? 'pronto' : '…'} · roupas ${prontas} de ${TRAJES.length}`);
  contar();
  const corpo = pedir<{ malha: Malha; pesos: { indices: Uint16Array; pesos: Float32Array; rosado: Float32Array } }>(doCorpo, { tipo: 'corpo', q: QUALIDADE_DA_MESA }).then((r) => {
    corpoPronto = true;
    contar();
    doCorpo.terminate();
    return r;
  });
  const roupas = await Promise.all(
    TRAJES.map(async (t, i) => {
      const r = await pedir<{ roupa: Omit<Roupa, 'coberto'> }>(daRoupa[i], { tipo: 'roupa', traje: t.id, q: QUALIDADE_DA_MESA });
      const c = await corpo;
      const { coberto } = await pedir<{ coberto: Float32Array }>(daRoupa[i], { tipo: 'coberto', pos: c.malha.pos.slice(), unha: c.malha.unha.slice() });
      daRoupa[i].terminate();
      prontas++;
      contar();
      return { ...r.roupa, coberto };
    }),
  );
  const { malha, pesos } = await corpo;

  // o que todos os corpos dividem: os vértices e os pesos (cada um tem a pele coberta e os triângulos dele)
  const comum: Record<string, THREE.BufferAttribute> = {
    position: new THREE.BufferAttribute(malha.pos, 3),
    normal: new THREE.BufferAttribute(malha.nor, 3),
    ar: new THREE.BufferAttribute(malha.ar, 1),
    unha: new THREE.BufferAttribute(malha.unha, 1),
    rosado: new THREE.BufferAttribute(pesos.rosado, 1),
    skinIndex: new THREE.BufferAttribute(pesos.indices, 4),
    skinWeight: new THREE.BufferAttribute(pesos.pesos, 4),
  };
  const esqueleto = montarEsqueleto();
  // as animações são calculadas num boneco à parte (que não aparece) e passadas para cada um
  const aux = new Boneco(esqueleto);
  clipes = criarClipes(aux);
  montarODealer(aux);
  let triangulos = 0;
  personagens = TRAJES.map((traje, i) => {
    const boneco = new Boneco(esqueleto);
    boneco.zerar();
    boneco.raiz.updateMatrixWorld(true);
    // (os ossos não entram na cena: as malhas vão no grupo do lugar, e a pele segue os ossos "soltos")
    const ossos = new THREE.Skeleton(boneco.ossos);
    const grupo = new THREE.Group();
    cena.add(grupo);
    const pele = criarPele();
    const p = traje.pele;
    pele.uniforms.uPele.value = cor(p.luz);
    pele.uniforms.uMeio.value = cor(p.meio);
    pele.uniforms.uSombra.value = cor(p.sombra);
    pele.uniforms.uFundo.value = cor(p.fundo);
    const traco = criarTraco();
    const tecido = criarTecido();
    const roupa = roupas[i];
    // o corpo: sem os triângulos que a roupa cobre inteiros
    const geo = new THREE.BufferGeometry();
    for (const [nome, attr] of Object.entries(comum)) geo.setAttribute(nome, attr);
    geo.setAttribute('coberto', new THREE.BufferAttribute(roupa.coberto, 1));
    const idx: number[] = [];
    const cob = roupa.coberto;
    for (let k = 0; k < malha.idx.length; k += 3) {
      const [a, b, c] = [malha.idx[k], malha.idx[k + 1], malha.idx[k + 2]];
      if (!(cob[a] && cob[b] && cob[c])) idx.push(a, b, c);
    }
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
    // a roupa
    const geoRoupa = new THREE.BufferGeometry();
    geoRoupa.setAttribute('position', new THREE.BufferAttribute(roupa.malha.pos, 3));
    geoRoupa.setAttribute('normal', new THREE.BufferAttribute(roupa.malha.nor, 3));
    geoRoupa.setAttribute('ar', new THREE.BufferAttribute(roupa.malha.ar, 1));
    geoRoupa.setAttribute('cor', new THREE.BufferAttribute(roupa.malha.cor, 3));
    geoRoupa.setAttribute('cor2', new THREE.BufferAttribute(roupa.malha.cor2, 3));
    geoRoupa.setAttribute('avesso', new THREE.BufferAttribute(roupa.malha.cor.map((v) => v * 0.72), 3));
    geoRoupa.setAttribute('enfeite', new THREE.BufferAttribute(roupa.malha.enfeite, 1));
    geoRoupa.setAttribute('repouso', new THREE.BufferAttribute(roupa.malha.pos, 3));
    geoRoupa.setAttribute('skinIndex', new THREE.BufferAttribute(roupa.indices, 4));
    geoRoupa.setAttribute('skinWeight', new THREE.BufferAttribute(roupa.pesos, 4));
    geoRoupa.setIndex(new THREE.BufferAttribute(roupa.malha.idx, 1));
    triangulos += idx.length / 3 + roupa.malha.idx.length / 3;
    const tracos: THREE.Object3D[] = [];
    const comOssos = (g: THREE.BufferGeometry, material: THREE.Material, eTraco = false) => {
      const m = new THREE.SkinnedMesh(g, material);
      m.bindMode = THREE.DetachedBindMode;
      m.bind(ossos, new THREE.Matrix4());
      m.frustumCulled = false;
      grupo.add(m);
      if (eTraco) tracos.push(m);
    };
    comOssos(geo, pele);
    comOssos(geo, traco, true);
    comOssos(geoRoupa, tecido);
    comOssos(geoRoupa, tracoDaRoupa, true);
    const panos = (traje.panos?.() ?? []).map((def) => {
      const pano = new Pano(boneco, def);
      const m = new THREE.Mesh(pano.geometria, tecido);
      m.frustumCulled = false;
      grupo.add(m);
      return { pano, parado: 0, antes: new Float32Array(pano.pos.length) };
    });
    let remoto: PanosRemotos | null = null;
    if (panos.length && podeSimularFora()) {
      try {
        remoto = new PanosRemotos(boneco, traje.id, panos.map((x) => x.pano));
      } catch {
        remoto = null;
      }
    }
    return { traje, boneco, grupo, lugar: i, pele, traco, tecido, tracos, panos, remoto, paradoFora: 0, recomecar: false, mesa: { y: MESA, alto: 0.6, z0: 0.08 }, mostrar: criarObjetos(grupo) };
  });
  sentar();

  // cada um na pose de partida, com a roupa assentada (um pouco por vez, para a página não travar)
  for (const [i, p] of personagens.entries()) {
    espera.textContent = `Assentando a roupa… ${i + 1} de ${personagens.length}`;
    await new Promise((r) => setTimeout(r, 0));
    const faz = oQueFaz(i);
    if (faz) p.mostrar(aplicar(p.boneco, faz.clipe, faz.t));
    p.boneco.raiz.updateMatrixWorld(true);
    if (p.remoto) {
      p.remoto.assentar(p.mesa, 90);
      continue;
    }
    for (const pn of p.panos) {
      pn.pano.recolocar();
      pn.pano.assentar(p.mesa, 90);
      pn.pano.atualizar();
    }
  }

  painel.append(
    linha('Jogador', TRAJES.map((t, i) => [t.nome, () => jogador === i, () => ((jogador = i), sentar(), recolocarPanos(), pintarBotoes())])),
    (() => {
      const l = linha('Fazem', [
        ['Parados', () => modo === 'paradas', () => animar('paradas')],
        ['Descanso', () => modo === 'descanso', () => animar('descanso')],
        ['Cada um uma', () => modo === 'variadas', () => animar('variadas')],
        ['Dealer entrega', () => modo === 'dealer-entrega', () => animar('dealer-entrega')],
        ['Dealer abre', () => modo === 'dealer-abre', () => animar('dealer-abre')],
      ]);
      seletor = document.createElement('select');
      seletor.append(Object.assign(document.createElement('option'), { value: '', textContent: 'Todos a mesma…' }));
      for (const c of clipes) seletor.append(Object.assign(document.createElement('option'), { value: c.id, textContent: c.nome }));
      seletor.value = clipes.some((c) => c.id === modo) ? modo : '';
      seletor.addEventListener('change', () => seletor!.value && animar(seletor!.value));
      l.append(seletor);
      return l;
    })(),
    linha('Luz', [
      ['Suave', () => luz === 'suave', () => iluminar('suave')],
      ['Anime', () => luz === 'anime', () => iluminar('anime')],
    ]),
    linha('Tempo', [
      ['Pausar', () => parado, () => ((parado = !parado), pintarBotoes())],
      ['Pano parado', () => !panoLigado, () => ((panoLigado = !panoLigado), pintarBotoes())],
    ]),
  );
  iluminar(luz);
  medir();
  espera.remove();
  pe.textContent = `${personagens.length} personagens · ${Math.round(triangulos / 1000).toLocaleString('pt-BR')} mil triângulos · pronto em ${((performance.now() - t0) / 1000).toFixed(1).replace('.', ',')} s`;
  document.title = 'Pokeru — mesa 3D (pronto)';
}

/** Depois de trocar os lugares: o pano recomeça de onde os ossos estão. */
function recolocarPanos() {
  for (const p of personagens) {
    const faz = oQueFaz(personagens.indexOf(p));
    if (faz) p.mostrar(aplicar(p.boneco, faz.clipe, faz.t));
    p.boneco.raiz.updateMatrixWorld(true);
    p.recomecar = !!p.remoto;
    p.paradoFora = 0;
    for (const pn of p.panos) {
      if (!p.remoto) pn.pano.recolocar();
      pn.parado = 0;
    }
  }
}

montar().catch((e) => {
  espera.textContent = `Não deu para montar a mesa:\n${(e as Error).message}`;
  console.error(e);
});

// para conferir de fora (as capturas automáticas)
(window as unknown as { mesa: unknown }).mesa = {
  ver: (alvo: [number, number, number], de: [number, number, number], campo?: number) => ver({ x: alvo[0], y: alvo[1], z: alvo[2] }, { x: de[0], y: de[1], z: de[2] }, campo),
  vista: (nome: string) => {
    if (nome === 'jogo') return fixar(true);
    fixar(false);
    if (VISTAS[nome]) ver(VISTAS[nome].alvo(), VISTAS[nome].de(), VISTAS[nome].fov);
  },
  fixar,
  animar,
  iluminar,
  enquadrar: (q: string) => {
    if (q in QUADROS) {
      quadro = q;
      medir();
    }
  },
  pausar: (sim: boolean) => (parado = sim),
  /** Vai para o instante `t` (segundos) e para ali. */
  irPara: (t: number) => {
    tempo = t;
    parado = true;
    reposar = true;
    for (const p of personagens) {
    p.paradoFora = 0;
    for (const pn of p.panos) pn.parado = 0;
  }
  },
  camera: () => JSON.parse(texto.value),
};
