/**
 * As sombras da mesa 3D.
 *
 * São de dois tipos, que se completam:
 *  - a **sombra de verdade** (o mapa de sombras de uma luz): as mãos e os braços, as cartas e as
 *    fichas a fazem, e quem a recebe é o feltro (por um plano transparente em cima dele — o feltro
 *    em si não tem luz, é o desenho da mesa 2D), a beirada de couro, as fichas e as cartas. É ela
 *    que mostra a que altura a mão está, e que anda com o gesto;
 *  - a **sombra de contato**: um borrão escuro debaixo de cada carta deitada e de cada coluna de
 *    fichas. Uma carta tem meio milímetro de altura e uma ficha, três: a sombra de verdade delas
 *    no feltro é mais fina que um ponto do mapa, e sem o borrão elas pareceriam coladas na mesa.
 *
 * O tronco e a cabeça não fazem sombra: a luz vem de cima e do lado de lá, e a sombra de quem senta
 * do outro lado cobriria metade da mesa. Só o que fica do ombro para fora (os braços e as mãos).
 */
import * as THREE from 'three';
import { PONTOS } from '../personagem/corpo';
import { CARTA, FICHA } from '../personagem/animacoes';

/**
 * De onde vem a luz (o rumo dela, a contar da mesa): de cima, um pouco da esquerda e do lado de lá.
 * As sombras caem para a direita e para cá — o lado em que a sombra das cartas 2D já cai.
 */
export const RUMO_DA_LUZ = new THREE.Vector3(-0.38, 1, -0.34).normalize();

/** A sombra no feltro: a cor e o quanto escurece. */
export const SOMBRA = { cor: 0x12081c, forca: 0.42, mapa: [4096, 2048] as const, macio: 2.2 };

/**
 * Prepara a luz para fazer sombra: põe-na no rumo dado, apontada para `alvo`, e ajusta a caixa do
 * mapa de sombras ao que precisa caber nela (os cantos dados, no mundo) — quanto mais justa, mais
 * fino o mapa.
 */
export function prepararSombra(luz: THREE.DirectionalLight, alvo: THREE.Vector3, cantos: THREE.Vector3[], teto: number): void {
  luz.position.copy(alvo).addScaledVector(RUMO_DA_LUZ, 4);
  luz.target.position.copy(alvo);
  luz.target.updateMatrixWorld(true);
  luz.castShadow = true;
  // (a câmera da sombra olha da luz para o alvo, como esta)
  const olho = new THREE.Object3D();
  olho.position.copy(luz.position);
  olho.lookAt(alvo);
  olho.updateMatrixWorld(true);
  // (um objeto olha com o +z; a câmera, com o −z: os lados trocam, a altura não)
  const caixa = new THREE.Box3();
  for (const c of cantos) caixa.expandByPoint(olho.worldToLocal(c.clone()));
  const cam = luz.shadow.camera;
  cam.left = -caixa.max.x;
  cam.right = -caixa.min.x;
  cam.bottom = caixa.min.y;
  cam.top = caixa.max.y;
  cam.near = caixa.min.z;
  cam.far = caixa.max.z;
  cam.updateProjectionMatrix();
  luz.shadow.mapSize.set(Math.min(SOMBRA.mapa[0], teto), Math.min(SOMBRA.mapa[1], teto));
  luz.shadow.radius = SOMBRA.macio;
  luz.shadow.bias = -0.00015;
}

/**
 * O material com que um personagem entra no mapa de sombras: só o que, na pose de repouso (de
 * braços abertos), fica do ombro para fora. `repouso` é o atributo que guarda essa pose — a própria
 * posição nas malhas que seguem os ossos, e `repouso` no pano solto, que é simulado.
 */
const dosBracos = new Map<string, THREE.MeshDepthMaterial>();
export function sombraDosBracos(repouso: 'position' | 'repouso'): THREE.MeshDepthMaterial {
  let m = dosBracos.get(repouso);
  if (!m) {
    m = new THREE.MeshDepthMaterial();
    const ombro = PONTOS.ombro[0] + 0.03;
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uOmbro = { value: ombro };
      shader.vertexShader = `varying float vLado;\n${repouso === 'repouso' ? 'attribute vec3 repouso;\n' : ''}${shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n\tvLado = abs(${repouso}.x);`)}`;
      shader.fragmentShader = `varying float vLado;\nuniform float uOmbro;\n${shader.fragmentShader.replace('void main() {', 'void main() {\n\tif (vLado < uOmbro) discard;')}`;
    };
    m.customProgramCacheKey = () => `sombra-dos-bracos:${repouso}`;
    dosBracos.set(repouso, m);
  }
  return m;
}

/** Um borrão escuro num quadrado: `forma` diz, de 0 a 1, o quanto cada ponto (de −1 a 1) fica dentro da sombra. */
function texturaDeBorrao(l: number, a: number, forma: (x: number, y: number) => number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = l;
  canvas.height = a;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(l, a);
  for (let y = 0; y < a; y++) {
    for (let x = 0; x < l; x++) {
      const k = Math.min(1, Math.max(0, forma(((x + 0.5) / l) * 2 - 1, ((y + 0.5) / a) * 2 - 1)));
      // (macio: sobe devagar na beirada e assenta no meio)
      img.data[(y * l + x) * 4 + 3] = Math.round(255 * k * k * (3 - 2 * k));
    }
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

/** O quanto o borrão passa do objeto, para cada lado (fração do tamanho dele). */
export const BORRAO = { ficha: 1.42, carta: 1.2 };

/**
 * As sombras de contato de um tipo de objeto: um plano deitado no feltro por objeto, todos numa
 * malha só. `usar()` no começo do quadro, `por()` para cada sombra, `fechar()` no fim.
 */
export class SombrasDeContato {
  readonly malha: THREE.InstancedMesh;
  private usadas = 0;
  private readonly matriz = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly escala = new THREE.Vector3();
  private readonly eixo = new THREE.Vector3(0, 1, 0);

  constructor(tipo: 'ficha' | 'carta', forca: number, quantas = 256) {
    const geo = (tipo === 'ficha' ? new THREE.PlaneGeometry(FICHA.raio * 2 * BORRAO.ficha, FICHA.raio * 2 * BORRAO.ficha) : new THREE.PlaneGeometry(CARTA.larg * BORRAO.carta, CARTA.comp * BORRAO.carta)).rotateX(-Math.PI / 2);
    const tex =
      tipo === 'ficha'
        ? // (redondo: cheio até a beirada da ficha, e dali some)
          texturaDeBorrao(64, 64, (x, y) => (1 - Math.hypot(x, y)) / (1 - 1 / BORRAO.ficha) )
        : // (o retângulo da carta, de cantos redondos)
          texturaDeBorrao(64, 88, (x, y) => {
            const dentro = 1 / BORRAO.carta;
            const dx = Math.max(0, Math.abs(x) - dentro * 0.86) * CARTA.larg;
            const dy = Math.max(0, Math.abs(y) - dentro * 0.9) * CARTA.comp;
            return 1 - Math.hypot(dx, dy) / ((1 - dentro * 0.86) * CARTA.larg);
          });
    const mat = new THREE.MeshBasicMaterial({ color: SOMBRA.cor, map: tex, transparent: true, opacity: forca, depthWrite: false });
    this.malha = new THREE.InstancedMesh(geo, mat, quantas);
    this.malha.frustumCulled = false;
    this.malha.renderOrder = 1;
    this.malha.count = 0;
  }

  usar() {
    this.usadas = 0;
  }

  /** Uma sombra em (x, z), na altura `y`, girada de `giro` e do tamanho `escala` (1 = o do objeto). */
  por(x: number, y: number, z: number, giro: number, escala = 1) {
    if (this.usadas >= this.malha.instanceMatrix.count || escala <= 0.02) return;
    this.q.setFromAxisAngle(this.eixo, giro);
    this.malha.setMatrixAt(this.usadas++, this.matriz.compose(new THREE.Vector3(x, y, z), this.q, this.escala.set(escala, 1, escala)));
  }

  fechar() {
    this.malha.count = this.usadas;
    this.malha.instanceMatrix.needsUpdate = true;
  }
}
