/**
 * Os acessórios das mãos na mesa 3D: os anéis, as pulseiras e os relógios (shared/acessorios.ts).
 * (A luva é costurada com a roupa — src/personagem/roupa.ts — e o esmalte é uma cor no material da
 * pele — src/dev/materiais.ts.)
 *
 * Cada peça é feita **sob medida**: o aro de um anel segue o corte do dedo no lugar em que ele fica
 * (tirado do próprio campo do corpo, src/personagem/corpo.ts), com a folga de quem o usa por cima
 * da pele ou por cima da luva; a pulseira e a correia do relógio seguem o corte do pulso. A peça é
 * rígida e vai presa a um osso só — o primeiro do dedo, o do giro do antebraço —, como um anel de
 * verdade, que não dobra com o dedo.
 *
 * As peças são desenhadas na T-pose, do lado esquerdo (x > 0), como a pele; a do lado direito é o
 * espelho. Quem as usa (src/mesa3d/ator.ts) as leva com o osso a cada quadro.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { coberturaDaLuva, findAcessorio, type Acessorios, type Anel, type Luva, type Mao, type Pulseira, type Relogio } from '../../shared/acessorios';
import { campoDoCorpo, juntas, partesDoCorpo, PONTOS } from '../personagem/corpo';
import { shade } from '../util/color';

type V3 = [number, number, number];
const V = (p: readonly number[]) => new THREE.Vector3(p[0], p[1], p[2]);

/** Onde uma peça vai: o osso que a leva (sem o lado) e o laço em volta do dedo ou do pulso. */
interface Laco {
  osso: string;
  centro: THREE.Vector3;
  /** Ao longo do dedo (ou do braço). */
  eixo: THREE.Vector3;
  /** Para o dorso (onde a pedra e a caixa do relógio ficam). */
  cima: THREE.Vector3;
  lado: THREE.Vector3;
  /** O raio da pele em cada direção em volta do eixo (a partir de `cima`, girando para `lado`). */
  raios: number[];
}

const N = 36;

/** Mede o corte de um campo em volta de um eixo: de `centro`, em cada direção, até onde a pele vai. */
function medir(campo: (x: number, y: number, z: number) => number, osso: string, centro: THREE.Vector3, eixo: THREE.Vector3, paraCima: THREE.Vector3, maximo: number): Laco {
  const cima = paraCima.clone().addScaledVector(eixo, -eixo.dot(paraCima)).normalize();
  const lado = new THREE.Vector3().crossVectors(eixo, cima).normalize();
  const p = new THREE.Vector3();
  const fora = (dir: THREE.Vector3, r: number) => {
    p.copy(centro).addScaledVector(dir, r);
    return campo(p.x, p.y, p.z) > 0;
  };
  const raios: number[] = [];
  const dir = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    dir.copy(cima).multiplyScalar(Math.cos(t)).addScaledVector(lado, Math.sin(t));
    let a = 0;
    let z = 0.001;
    while (z < maximo && !fora(dir, z)) {
      a = z;
      z += 0.001;
    }
    for (let k = 0; k < 12; k++) {
      const m = (a + z) / 2;
      if (fora(dir, m)) z = m;
      else a = m;
    }
    raios.push(a);
  }
  return { osso, centro, eixo, cima, lado, raios };
}

const NOMES = ['indicador', 'medio', 'anelar', 'minimo'];
let lacos: { dedos: Laco[]; dedosLargos: Laco[]; pulso: Laco } | null = null;

/** Os laços dos cinco dedos (0 = indicador … 3 = mínimo, 4 = polegar) e o do pulso, medidos uma vez. */
function osLacos() {
  if (lacos) return lacos;
  const J = juntas();
  const P = partesDoCorpo();
  const corpo = campoDoCorpo();
  /**
   * O laço de um dedo: o corte da pele de verdade (o corpo inteiro, em que a palma e os dedos se
   * fundem) — mas sem passar muito do corte do dedo sozinho: entre dois dedos a pele do vão é do
   * vizinho também, e um aro que a contornasse ficaria do tamanho dos dois.
   */
  const noCorte = (so: (x: number, y: number, z: number) => number, osso: string, centro: THREE.Vector3, rumo: THREE.Vector3, cima: THREE.Vector3, maximo: number): Laco => {
    const dele = medir(so, osso, centro, rumo, cima, maximo);
    const inteiro = medir(corpo, osso, centro, rumo, cima, maximo);
    return { ...dele, raios: dele.raios.map((r, i) => Math.min(Math.max(r, inteiro.raios[i]), r + 0.0022)) };
  };
  /** (Um aro largo cobre um trecho do dedo, que engrossa para o nó: para ele vale o maior corte do trecho.) */
  const largos: Laco[] = [];
  const noDedo = (so: (x: number, y: number, z: number) => number, osso: string, centro: THREE.Vector3, rumo: THREE.Vector3, cima: THREE.Vector3, maximo: number): Laco => {
    const cortes = [-0.003, 0, 0.003].map((d) => noCorte(so, osso, centro.clone().addScaledVector(rumo, d), rumo, cima, maximo));
    largos.push({ ...cortes[1], raios: cortes[1].raios.map((_, i) => Math.max(...cortes.map((c) => c.raios[i]))) });
    return cortes[1];
  };
  const dedos = J.dedos.map((d, k) => {
    const rumo = V(d.rumo).normalize();
    // (dois terços do primeiro osso: passa da boca da luva sem dedos, e fica longe do nó e do vão entre os dedos)
    return noDedo(P.dedos[k].d, `${NOMES[k]}1`, V(d.raiz).addScaledVector(rumo, d.j1 * 0.66), rumo, new THREE.Vector3(0, 1, 0), 0.02);
  });
  const pol = J.polegar;
  const rumoDoPolegar = V(pol.rumo).normalize();
  dedos.push(noDedo(P.polegar.d, 'polegar2', V(pol.raiz).addScaledVector(rumoDoPolegar, pol.j1 + (pol.j2 - pol.j1) * 0.56), rumoDoPolegar, V(pol.dorso), 0.022));
  // o pulso: logo antes da junta, entre o fim da manga e a mão. Uma peça larga (o couro, a correia) cobre
  // um trecho do braço, que engrossa para os dois lados: vale o maior corte do trecho
  const noPulso = (dx: number) => medir(corpo, 'giro', new THREE.Vector3(PONTOS.punho[0] - 0.007 + dx, PONTOS.punho[1], PONTOS.punho[2]), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), 0.06);
  const cortes = [-0.0085, 0, 0.0085].map(noPulso);
  const pulso: Laco = { ...cortes[1], raios: cortes[1].raios.map((_, i) => Math.max(...cortes.map((c) => c.raios[i]))) };
  lacos = { dedos, dedosLargos: largos, pulso };
  return lacos;
}

/** A direção em volta do laço, no ângulo `t` (0 = para o dorso). */
const rumoEm = (l: Laco, t: number) => l.cima.clone().multiplyScalar(Math.cos(t)).addScaledVector(l.lado, Math.sin(t));
/** O raio da pele no ângulo `t` (entre as amostras). */
function raioEm(l: Laco, t: number): number {
  const x = ((((t / (Math.PI * 2)) % 1) + 1) % 1) * N;
  const i = Math.floor(x);
  const k = x - i;
  return l.raios[i % N] * (1 - k) + l.raios[(i + 1) % N] * k;
}
/** Um ponto em volta do laço, `alto` metros acima da pele (mais a folga). */
const sobre = (l: Laco, t: number, alto: number) => l.centro.clone().addScaledVector(rumoEm(l, t), raioEm(l, t) + alto);
/** Os eixos de uma peça pousada no ângulo `t`: x ao longo do dedo, y para fora, z em volta. */
function eixosEm(l: Laco, t: number, pos: THREE.Vector3): THREE.Matrix4 {
  const y = rumoEm(l, t);
  const z = new THREE.Vector3().crossVectors(l.eixo, y).normalize();
  return new THREE.Matrix4().makeBasis(l.eixo, y, z).setPosition(pos);
}

/** Um número, ou um número que muda em volta do laço (o ângulo `t`, 0 no dorso). */
type EmVolta = number | ((t: number) => number);
const em = (v: EmVolta, t: number) => (typeof v === 'number' ? v : v(t));

/**
 * Uma faixa em volta do laço: `larg` ao longo do dedo, `gross` para fora, `folga` acima da pele;
 * `desvio`: fora do meio do laço, ao longo do dedo. `quina` diz o feitio do corte dela: 2 é oval
 * (um aro abaulado), 4 ou mais é uma fita chata de quinas marcadas (uma tira de couro, um aro reto).
 * A largura e a grossura podem mudar em volta (os ombros de um anel, que engrossam para a pedra).
 */
function faixa(l: Laco, o: { larg: EmVolta; gross: EmVolta; folga: number; desvio?: number; quina?: number }): THREE.BufferGeometry {
  const n = o.quina ?? 2;
  const M = n > 2.5 ? 20 : 12;
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const pot = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** e;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2;
    const dir = rumoEm(l, t);
    const larg = em(o.larg, t);
    const gross = em(o.gross, t);
    const base = l.centro.clone().addScaledVector(dir, l.raios[i] + o.folga + gross / 2).addScaledVector(l.eixo, o.desvio ?? 0);
    for (let j = 0; j < M; j++) {
      const f = (j / M) * Math.PI * 2;
      // (uma superelipse: com o expoente alto, quase um retângulo de cantos redondos)
      const c = pot(Math.cos(f), 2 / n);
      const s = pot(Math.sin(f), 2 / n);
      const p = base.clone().addScaledVector(dir, (gross / 2) * c).addScaledVector(l.eixo, (larg / 2) * s);
      const nd = dir
        .clone()
        .multiplyScalar(pot(c, n - 1) / gross)
        .addScaledVector(l.eixo, pot(s, n - 1) / larg)
        .normalize();
      pos.push(p.x, p.y, p.z);
      nor.push(nd.x, nd.y, nd.z);
      const a = i * M + j;
      const b = ((i + 1) % N) * M + j;
      const a1 = i * M + ((j + 1) % M);
      const b1 = ((i + 1) % N) * M + ((j + 1) % M);
      idx.push(a, b1, a1, a, b, b1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** Um fio fino em volta do laço, `alto` acima da pele e a `desvio` do meio: um friso, um debrum, a beirada de uma tira. */
const fio = (l: Laco, folga: number, alto: number, desvio: number, r: number) => faixa(l, { larg: r * 2, gross: r * 2, folga: folga + alto - r, desvio });

/**
 * Um tubo ao longo de uma fila de pontos (um fio, uma cobra, a virola de uma pedra): em cada ponto,
 * um aro de raio `raio(i)` em volta do rumo do caminho. `fechado`: o fim emenda no começo. `centro`:
 * de onde se mede o "para fora" (para o aro não torcer ao longo da volta).
 */
function tubo(pontos: THREE.Vector3[], raio: (i: number) => number, fechado: boolean, centro: THREE.Vector3, lados = 8): THREE.BufferGeometry {
  const n = pontos.length;
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    const antes = pontos[fechado ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const depois = pontos[fechado ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const t = depois.clone().sub(antes).normalize();
    const fora = pontos[i].clone().sub(centro);
    const u = fora.addScaledVector(t, -t.dot(fora));
    if (u.lengthSq() < 1e-14) u.set(0, 1, 0).addScaledVector(t, -t.y);
    u.normalize();
    const w = new THREE.Vector3().crossVectors(t, u);
    for (let j = 0; j < lados; j++) {
      const f = (j / lados) * Math.PI * 2;
      const d = u.clone().multiplyScalar(Math.cos(f)).addScaledVector(w, Math.sin(f));
      const q = pontos[i].clone().addScaledVector(d, raio(i));
      pos.push(q.x, q.y, q.z);
      nor.push(d.x, d.y, d.z);
    }
  }
  const voltas = fechado ? n : n - 1;
  for (let i = 0; i < voltas; i++) {
    for (let j = 0; j < lados; j++) {
      const a = i * lados + j;
      const b = ((i + 1) % n) * lados + j;
      const a1 = i * lados + ((j + 1) % lados);
      const b1 = ((i + 1) % n) * lados + ((j + 1) % lados);
      idx.push(a, a1, b1, a, b1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/** Uma geometria de três.js sem as coordenadas de textura (para juntar com as feitas à mão), posta no lugar. */
function posta(g: THREE.BufferGeometry, m: THREE.Matrix4): THREE.BufferGeometry {
  const s = g.index ? g.toNonIndexed() : g;
  s.deleteAttribute('uv');
  s.applyMatrix4(m);
  return s;
}
const juntar = (gs: THREE.BufferGeometry[]) => mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => (g.deleteAttribute('uv'), g)), false)!;
const escala = (x: number, y: number, z: number) => new THREE.Matrix4().makeScale(x, y, z);
const mover = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);

// ─────────────────────────────── os contornos ───────────────────────────────

/**
 * Um contorno visto de cima, no lugar em que uma peça pousa: `x` ao longo do dedo (para a ponta
 * dele), `z` em volta. É a forma da pedra — e do engaste, da virola e do aro que a cercam.
 */
type Contorno = [number, number][];

/** Uma superelipse de meios-eixos `a` e `b`: o expoente 2 dá a elipse; mais alto, um retângulo de cantos redondos. */
function superelipse(a: number, b: number, n = 2, pontos = 32): Contorno {
  const pot = (v: number) => Math.sign(v) * Math.abs(v) ** (2 / n);
  return Array.from({ length: pontos }, (_, i) => {
    const t = (i / pontos) * Math.PI * 2;
    return [a * pot(Math.cos(t)), b * pot(Math.sin(t))];
  });
}
/** A navete (a lapidação marquise): comprida, de duas pontas. */
function navete(a: number, b: number, pontos = 14): Contorno {
  const lado = (s: number) => Array.from({ length: pontos }, (_, i) => [a * (1 - (2 * i) / pontos) * s, b * Math.sin((Math.PI * i) / pontos) ** 0.9 * s] as [number, number]);
  return [...lado(1), ...lado(-1)];
}
/** A pera (a gota): redonda de um lado, em ponta do outro (a ponta para +x). */
function pera(a: number, b: number, pontos = 30): Contorno {
  return Array.from({ length: pontos }, (_, i) => {
    const t = (i / pontos) * Math.PI * 2;
    // (a metade de cá é um círculo; a de lá afina até a ponta)
    const c = Math.cos(t);
    const afina = c > 0 ? 1 - c ** 1.6 * 0.94 : 1;
    return [a * (c > 0 ? c * 1.25 : c * 0.75) + a * 0.0, b * Math.sin(t) * (c > 0 ? afina : 1)];
  });
}
/** O coração, com as duas voltas para a ponta do dedo e o bico para o punho. */
function coracao(a: number, b: number, pontos = 36): Contorno {
  return Array.from({ length: pontos }, (_, i) => {
    const t = (i / pontos) * Math.PI * 2;
    const x = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return [(a * (x + 2.5)) / 14.5, (b * 16 * Math.sin(t) ** 3) / 16];
  });
}
/** O octógono (a caixa de oito lados de um relógio moderno): `r` é a distância do meio a cada lado; os lados das doze, das três, das seis e das nove ficam retos. */
function oitavado(r: number, porLado = 4): Contorno {
  const canto = (k: number): [number, number] => {
    const t = ((k + 0.5) / 8) * Math.PI * 2;
    const d = r / Math.cos(Math.PI / 8);
    return [d * Math.cos(t), d * Math.sin(t)];
  };
  const c: Contorno = [];
  for (let k = 0; k < 8; k++) {
    const [a, b] = [canto(k), canto(k + 1)];
    for (let i = 0; i < porLado; i++) c.push([a[0] + ((b[0] - a[0]) * i) / porLado, a[1] + ((b[1] - a[1]) * i) / porLado]);
  }
  return c;
}
const vezes = (c: Contorno, k: number, kz = k): Contorno => c.map(([x, z]) => [x * k, z * kz]);

/** Uma chapa com a forma do contorno, deitada (o contorno em x e z, a altura em y, de 0 a `alto`); `bisel`: as quinas de cima e de baixo chanfradas. */
function chapa(c: Contorno, alto: number, bisel?: { alto: number; dentro: number; passos?: number }): THREE.BufferGeometry {
  const forma = new THREE.Shape(c.map(([x, z]) => new THREE.Vector2(x, -z)));
  const b = bisel ?? { alto: 0, dentro: 0 };
  const g = new THREE.ExtrudeGeometry(forma, { depth: Math.max(1e-6, alto - 2 * b.alto), bevelEnabled: !!bisel, bevelThickness: b.alto, bevelSize: b.dentro, bevelOffset: -b.dentro, bevelSegments: b.passos ?? 1, curveSegments: 4 });
  // (a forma nasce em pé, com a altura em z: deita-a, e sobe o que o chanfro pôs abaixo do chão)
  g.applyMatrix4(mover(0, b.alto, 0).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)));
  return g;
}

// ─────────────────────────────── os materiais ───────────────────────────────

const materiais = new Map<string, THREE.Material>();
function material(chave: string, faz: () => THREE.Material): THREE.Material {
  let m = materiais.get(chave);
  if (!m) materiais.set(chave, (m = faz()));
  return m;
}
/** O metal: sem um ambiente para refletir, um metal de verdade ficaria escuro — este é claro, com um brilho próprio discreto. */
const metal = (cor: string) => material('metal:' + cor, () => new THREE.MeshStandardMaterial({ color: cor, metalness: 0.3, roughness: 0.28, emissive: shade(cor, -0.55), emissiveIntensity: 0.5 }));
/** O metal polido das bordas (a virola de uma pedra, o aro de um relógio): um tom mais claro, que desenha o contorno. */
const polido = (cor: string) => metal(shade(cor, 0.22));
/** A pedra: lapidada (facetas chapadas) ou polida, com um fundo de luz da própria cor. */
const pedra = (cor: string, lapidada: boolean) => material(`pedra:${cor}:${lapidada}`, () => new THREE.MeshStandardMaterial({ color: cor, roughness: 0.12, metalness: 0, flatShading: lapidada, emissive: cor, emissiveIntensity: 0.32 }));
const fosco = (cor: string, aspero = 0.8) => material(`fosco:${cor}:${aspero}`, () => new THREE.MeshStandardMaterial({ color: cor, roughness: aspero }));
/** O metal jateado (a caixa de um relógio de campo): a cor do metal, sem o lustro do polimento. */
const jateado = (cor: string) => material('jateado:' + cor, () => new THREE.MeshStandardMaterial({ color: cor, metalness: 0.2, roughness: 0.68, emissive: shade(cor, -0.6), emissiveIntensity: 0.4 }));
/** O vidro de um relógio: quase invisível, só o reflexo. */
const vidro = () => material('vidro', () => new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, roughness: 0.04, depthWrite: false }));

/** Uma textura desenhada num quadrado de `lado` pontos, com o meio na origem. */
function desenhada(chave: string, lado: number, desenha: (x: CanvasRenderingContext2D, meio: number) => void, opcoes: { aspero?: number; dosDoisLados?: boolean; depois?: (m: THREE.MeshStandardMaterial) => void } = {}): THREE.Material {
  return material(chave, () => {
    const c = document.createElement('canvas');
    c.width = c.height = lado;
    const x = c.getContext('2d')!;
    x.translate(lado / 2, lado / 2);
    desenha(x, lado / 2);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: opcoes.aspero ?? 0.25, side: opcoes.dosDoisLados ? THREE.DoubleSide : THREE.FrontSide });
    opcoes.depois?.(m);
    return m;
  });
}

/**
 * Faz de um material desenhado um **prisma**: a parte clara do desenho ganha as cores do arco-íris,
 * e a cor de cada ponto depende de onde ele está no mostrador (os raios de um CD: a cor dá duas
 * voltas em torno do meio) **e do ângulo de quem olha** — o reflexo do olhar na face, que muda quando
 * o pulso vira ou a câmera anda. É por isso que as cores correm, em vez de ficarem pintadas.
 *
 * Não é o `iridescence` do material físico do three.js: aquele só aparece no reflexo de um ambiente,
 * e a mesa não tem ambiente para refletir (veja `metal`). Aqui a cor entra na própria tinta e num
 * brilho próprio discreto, e por isso se vê com qualquer luz. O que é escuro no desenho — os
 * ponteiros, os índices — fica como está.
 */
function prismatico(m: THREE.MeshStandardMaterial): void {
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
	{
		vec3 prismaOlhar = normalize( vViewPosition );
		vec3 prismaReflexo = reflect( -prismaOlhar, normal );
		vec2 prismaP = vMapUv - 0.5;
		float prismaTom = atan( prismaP.y, prismaP.x ) / 3.14159265 + length( prismaP ) * 0.9 + prismaReflexo.x * 1.9 + prismaReflexo.y * 1.3;
		vec3 prismaCor = 0.56 + 0.44 * cos( 6.2831853 * ( prismaTom + vec3( 0.0, 0.33, 0.67 ) ) );
		float prismaClaro = smoothstep( 0.3, 0.75, dot( diffuseColor.rgb, vec3( 0.3333 ) ) );
		diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * prismaCor, prismaClaro );
		totalEmissiveRadiance += prismaCor * prismaClaro * 0.2;
	}`,
    );
  };
  m.customProgramCacheKey = () => 'mostrador-prismatico';
}

/**
 * O mostrador de um relógio: o fundo, a trilha dos minutos, os índices das horas (os de três em três,
 * maiores), os ponteiros nas dez e dez com o dos segundos, e o que cada um tem de seu — os três
 * mostradores pequenos do esportivo e do cronógrafo, a janela da data, a lua e as estrelas, os doze
 * algarismos do relógio de campo, os raios do prismático, ou os algarismos do visor.
 */
function mostrador(r: Relogio): THREE.Material {
  // (dos dois lados: o mostrador espelhado da mão direita tem as faces ao contrário)
  return desenhada(
    'mostrador:' + r.id,
    256,
    (x, m) => {
      x.fillStyle = r.mostrador;
      x.fillRect(-m, -m, 2 * m, 2 * m);
      if (r.visor === 'prisma' || r.visor === 'cronografo') {
        // o fundo raiado (o "sol" de um mostrador escovado): gomos finos, um claro e um nem tanto — no
        // prismático é por eles que as cores correm; no cronógrafo, é o lustro da prata
        const gomos = 96;
        for (let k = 0; k < gomos; k++) {
          x.fillStyle = shade(r.mostrador, -0.02 - 0.09 * (0.5 + 0.5 * Math.sin(k * 2.4)) * (k % 2 ? 1 : 0.35));
          x.beginPath();
          x.moveTo(0, 0);
          x.arc(0, 0, 2 * m, (k / gomos) * Math.PI * 2, ((k + 1) / gomos) * Math.PI * 2 + 0.01);
          x.fill();
        }
      }
      x.strokeStyle = r.ponteiros;
      x.fillStyle = r.ponteiros;
      x.lineCap = 'round';
      const texto = (s: string, px: number, cx: number, cy: number, peso = 700) => {
        x.font = `${peso} ${px}px "M PLUS Rounded 1c", "Segoe UI", sans-serif`;
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText(s, cx, cy);
      };
      if (r.visor === 'digital') {
        // o visor de cristal líquido: a data, um traço, as horas em algarismos grandes e os segundos
        x.font = '900 86px Consolas, "Courier New", monospace';
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText('10:08', -8, 22);
        x.font = '700 30px Consolas, "Courier New", monospace';
        x.fillText('SÁB 21-11', -18, -62);
        x.fillText('36', 98, 60);
        x.fillRect(-112, -36, 224, 5);
        x.fillRect(-112, 78, 224, 4);
        x.font = '700 19px Consolas, "Courier New", monospace';
        x.fillText('ALARME   LUZ', 0, 100);
        return;
      }
      const raio = m * 0.94;
      const oval = r.caixa === 'oval';
      const ponto = (h: number, de: number) => [Math.sin((h * Math.PI) / 6) * raio * de * (oval ? 0.76 : 1), -Math.cos((h * Math.PI) / 6) * raio * de] as const;
      // a trilha dos minutos
      x.globalAlpha = 0.6;
      for (let k = 0; k < 60; k++) {
        if (k % 5 === 0) continue;
        const [ax, ay] = ponto(k / 5, 0.93);
        const [bx, by] = ponto(k / 5, 0.985);
        x.lineWidth = 2;
        x.beginPath();
        x.moveTo(ax, ay);
        x.lineTo(bx, by);
        x.stroke();
      }
      x.globalAlpha = 1;
      // os índices das horas: barras, e algarismos nas doze, três, seis e nove do clássico — ou nas doze
      // horas do relógio de campo, que se lê de relance; o prismático tem só barras finas, todas iguais
      const deCampo = r.correia === 'lona';
      const liso = r.visor === 'prisma';
      for (let h = 0; h < 12; h++) {
        const grande = h % 3 === 0;
        if (deCampo || (grande && r.id === 'relogio-classico')) {
          const [cx, cy] = ponto(h, deCampo ? 0.72 : 0.76);
          texto(String(h === 0 ? 12 : h), deCampo ? (grande ? 36 : 28) : 34, cx, cy, 800);
          continue;
        }
        const [ax, ay] = ponto(h, liso ? 0.74 : grande ? 0.7 : 0.78);
        const [bx, by] = ponto(h, 0.9);
        x.lineWidth = liso ? (h === 0 ? 9 : 5) : grande ? 11 : 6;
        x.beginPath();
        x.moveTo(ax, ay);
        x.lineTo(bx, by);
        x.stroke();
      }
      if (r.visor === 'lua') {
        // as estrelas (sempre nos mesmos lugares) e a lua crescente, numa janela no alto do mostrador
        for (let i = 0; i < 34; i++) {
          const a = i * 2.399963;
          const d = 24 + ((i * 37) % 58);
          x.globalAlpha = 0.45 + ((i * 13) % 5) / 9;
          x.beginPath();
          x.arc(Math.cos(a) * d, Math.sin(a) * d, i % 4 === 0 ? 3.4 : 2, 0, Math.PI * 2);
          x.fill();
        }
        x.globalAlpha = 1;
        x.beginPath();
        x.arc(0, -46, 25, 0, Math.PI * 2);
        x.fill();
        x.fillStyle = r.mostrador;
        x.beginPath();
        x.arc(12, -52, 21, 0, Math.PI * 2);
        x.fill();
        x.fillStyle = r.ponteiros;
      }
      if (r.id === 'relogio-esportivo' || r.visor === 'cronografo') {
        // os três mostradores pequenos de um cronógrafo (no bicolor, cheios do metal da caixa: o bronze sobre a prata)
        for (const [cx, cy] of [[-48, 0], [48, 0], [0, 48]]) {
          x.globalAlpha = r.visor === 'cronografo' ? 0.92 : 0.28;
          if (r.visor === 'cronografo') x.fillStyle = r.metal;
          x.beginPath();
          x.arc(cx, cy, 25, 0, Math.PI * 2);
          x.fill();
          x.fillStyle = r.ponteiros;
          x.globalAlpha = 1;
          x.lineWidth = 2.5;
          x.beginPath();
          x.arc(cx, cy, 25, 0, Math.PI * 2);
          x.moveTo(cx, cy);
          x.lineTo(cx + 9, cy - 16);
          x.stroke();
        }
      }
      if (r.id === 'relogio-classico' || r.id === 'relogio-mergulho') {
        // a janela da data, às três (no de mergulho; no clássico, às seis)
        const [dx, dy] = r.id === 'relogio-mergulho' ? [62, 0] : [0, 56];
        x.fillStyle = r.id === 'relogio-mergulho' ? '#f4f4f8' : '#2a2140';
        x.fillRect(dx - 17, dy - 13, 34, 26);
        x.fillStyle = r.id === 'relogio-mergulho' ? '#101014' : '#fbf7ee';
        texto('21', 21, dx, dy + 1, 800);
        x.fillStyle = r.ponteiros;
      }
      // os ponteiros: as dez e dez, e o dos segundos (mais fino, de outra cor) nos trinta e cinco
      const ponteiro = (ang: number, comp: number, larg: number, recua = 0) => {
        x.lineWidth = larg;
        x.beginPath();
        x.moveTo(-Math.sin(ang) * recua * (oval ? 0.76 : 1), Math.cos(ang) * recua);
        x.lineTo(Math.sin(ang) * comp * (oval ? 0.76 : 1), -Math.cos(ang) * comp);
        x.stroke();
      };
      ponteiro((-60 * Math.PI) / 180, raio * 0.48, 12, 10);
      ponteiro((60 * Math.PI) / 180, raio * 0.72, 8, 12);
      x.strokeStyle = r.id === 'relogio-noturno' || r.id === 'relogio-lua' || r.visor === 'prisma' ? r.ponteiros : '#d8283a';
      ponteiro((210 * Math.PI) / 180, raio * 0.8, 3, 24);
      x.beginPath();
      x.arc(0, 0, 9, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = r.mostrador;
      x.beginPath();
      x.arc(0, 0, 3, 0, Math.PI * 2);
      x.fill();
    },
    { dosDoisLados: true, depois: r.visor === 'prisma' ? prismatico : undefined },
  );
}

/**
 * O aro de um cronógrafo: uma coroa chata no segundo metal, escovada, com a escala gravada em volta —
 * um risco por unidade, um mais comprido a cada cinco e os algarismos, deitados no rumo do aro, na
 * cor da caixa (o bronze gravado na prata).
 */
function aroGravado(r: Relogio, cor: string): THREE.Material {
  return desenhada('aro-gravado:' + r.id, 256, (x, m) => {
    x.fillStyle = shade(cor, 0.12);
    x.fillRect(-m, -m, 2 * m, 2 * m);
    // o escovado: gomos finos, quase da mesma cor
    for (let k = 0; k < 120; k += 2) {
      x.fillStyle = shade(cor, 0.02);
      x.beginPath();
      x.moveTo(0, 0);
      x.arc(0, 0, 2 * m, (k / 120) * Math.PI * 2, ((k + 1) / 120) * Math.PI * 2);
      x.fill();
    }
    const tinta = shade(r.metal, -0.5);
    x.strokeStyle = tinta;
    x.fillStyle = tinta;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = '800 13px "Segoe UI", sans-serif';
    const escala = ['60', '65', '70', '80', '90', '100', '120', '140', '170', '200', '300', '500'];
    for (let k = 0; k < 60; k++) {
      const t = (k / 60) * Math.PI * 2;
      const [c, s] = [Math.sin(t), -Math.cos(t)];
      x.lineWidth = k % 5 ? 1.6 : 2.6;
      x.beginPath();
      x.moveTo(c * 99, s * 99);
      x.lineTo(c * (k % 5 ? 103 : 105), s * (k % 5 ? 103 : 105));
      x.stroke();
      if (k % 5 === 0) {
        x.save();
        x.translate(c * 114, s * 114);
        x.rotate(t);
        x.fillText(escala[k / 5], 0, 0);
        x.restore();
      }
    }
  }, { aspero: 0.34 });
}

/** O aro giratório de um relógio de mergulho: as duas metades de cor, os riscos dos minutos, os algarismos e o triângulo do zero. */
function aroDeMergulho(r: Relogio, cores: [string, string]): THREE.Material {
  return desenhada('aro:' + r.id, 256, (x, m) => {
    x.fillStyle = cores[0];
    x.fillRect(-m, -m, 2 * m, m);
    x.fillStyle = cores[1];
    x.fillRect(-m, 0, 2 * m, m);
    x.fillStyle = '#f4f4f8';
    x.strokeStyle = '#f4f4f8';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = '800 22px "Segoe UI", sans-serif';
    for (let k = 0; k < 60; k++) {
      const t = (k / 60) * Math.PI * 2;
      const [c, s] = [Math.sin(t), -Math.cos(t)];
      if (k === 0) {
        x.beginPath();
        x.moveTo(c * 110 - 11, s * 110 - 9);
        x.lineTo(c * 110 + 11, s * 110 - 9);
        x.lineTo(c * 110, s * 110 + 12);
        x.fill();
      } else if (k % 10 === 0) x.fillText(String(k), c * 110, s * 110);
      else if (k % 5 === 0) x.fillRect(c * 110 - 3, s * 110 - 3, 6, 6);
      else if (k < 15) {
        x.lineWidth = 2;
        x.beginPath();
        x.moveTo(c * 104, s * 104);
        x.lineTo(c * 116, s * 116);
        x.stroke();
      }
    }
  });
}

// ─────────────────────────────── as peças ───────────────────────────────

/** Um pedaço de uma peça: a geometria (na T-pose do lado esquerdo) e o material. `semSombra`: não faz sombra (o vidro). */
export interface Pedaco {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  semSombra?: boolean;
}

/** A folga de uma peça: por cima da pele, ou por cima do pano da luva (a de placas é a mais grossa). */
const FOLGA = { pele: 0.0004, luva: 0.0021, punhoDaLuva: 0.0046 };
/** A folga de um anel e a do que vai no pulso, com cada feitio de luva. */
function folgasCom(luva: Luva['feitio']): { anel: number; pulso: number } {
  if (luva === 'manopla') return { anel: 0.0041, pulso: 0.0068 };
  if (luva === 'opera') return { anel: FOLGA.luva, pulso: 0.0034 };
  const cobre = coberturaDaLuva(luva);
  // (a luva sem dedos acaba antes do lugar do anel: ali o dedo está nu)
  return { anel: cobre === 'inteira' ? FOLGA.luva : FOLGA.pele, pulso: cobre === 'nenhuma' ? FOLGA.pele + 0.0006 : FOLGA.punhoDaLuva };
}

/**
 * Quem monta uma joia no alto de um laço: junta os pedaços de metal, de metal polido (as bordas) e
 * de pedra, cada um posto no lugar dele — `m` é onde a joia pousa (x ao longo do dedo, y para
 * fora, z em volta), e as alturas são a contar dali.
 */
class Joia {
  readonly metais: THREE.BufferGeometry[] = [];
  readonly bordas: THREE.BufferGeometry[] = [];
  readonly pedras: THREE.BufferGeometry[] = [];
  constructor(readonly m: THREE.Matrix4) {}
  private no(y: number) {
    return this.m.clone().multiply(mover(0, y, 0));
  }
  /** O copo do engaste: uma chapa com a forma do contorno, de `de` a `ate`, um nada mais larga embaixo. */
  copo(c: Contorno, de: number, ate: number) {
    this.metais.push(posta(chapa(c, ate - de, { alto: Math.min(0.00025, (ate - de) / 3), dentro: 0.00018 }), this.no(de)));
    return this;
  }
  /** A virola: o fio de metal polido que cerca a pedra, por cima do contorno, na altura `y`. */
  virola(c: Contorno, y: number, r = 0.00034) {
    const centro = new THREE.Vector3(0, y, 0).applyMatrix4(this.m);
    this.bordas.push(
      tubo(
        c.map(([x, z]) => new THREE.Vector3(x, y, z).applyMatrix4(this.m)),
        () => r,
        true,
        centro,
        6,
      ),
    );
    return this;
  }
  /** Uma fila de bolinhas de metal por cima do contorno (o granulado de uma joia antiga). */
  granulado(c: Contorno, y: number, r = 0.00027, quantas = 24) {
    for (let i = 0; i < quantas; i++) {
      const [x, z] = c[Math.floor((i * c.length) / quantas)];
      this.bordas.push(posta(new THREE.SphereGeometry(r, 6, 4), this.no(y).multiply(mover(x, 0, z))));
    }
    return this;
  }
  /** Uma garra: uma haste de metal de `de` a `ate` (pontos no lugar da joia), com a ponta redonda dobrada sobre a pedra. */
  garra(de: [number, number, number], ate: [number, number, number], r = 0.00032) {
    const a = new THREE.Vector3(...de);
    const b = new THREE.Vector3(...ate);
    const meio = a.clone().add(b).multiplyScalar(0.5);
    const giro = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    this.bordas.push(posta(new THREE.CylinderGeometry(r, r * 1.25, a.distanceTo(b), 6), this.m.clone().multiply(new THREE.Matrix4().compose(meio, giro, new THREE.Vector3(1, 1, 1)))));
    this.bordas.push(posta(new THREE.SphereGeometry(r * 1.45, 8, 6), this.m.clone().multiply(mover(b.x, b.y, b.z))));
    return this;
  }
  /** As garras em volta de um contorno: nos pontos dados dele (frações da volta), do pé `y0` à cintura da pedra `y1`. */
  garras(c: Contorno, onde: number[], y0: number, y1: number, r = 0.00032) {
    for (const u of onde) {
      const [x, z] = c[Math.floor((((u % 1) + 1) % 1) * c.length)];
      this.garra([x * 0.78, y0, z * 0.78], [x * 0.94, y1, z * 0.94], r);
    }
    return this;
  }
  /** Um brilhante: a coroa oitavada com a mesa em cima e o pavilhão em cone embaixo; a cintura (de raio `r`) fica em `y`. */
  brilhante(r: number, y: number, x = 0, z = 0) {
    this.pedras.push(posta(new THREE.CylinderGeometry(r * 0.56, r, r * 0.36, 8), this.no(y + r * 0.18).multiply(mover(x, 0, z))));
    this.pedras.push(posta(new THREE.ConeGeometry(r, r * 0.8, 8), this.no(y - r * 0.4).multiply(mover(x, 0, z)).multiply(new THREE.Matrix4().makeRotationX(Math.PI))));
    return this;
  }
  /** Uma pedra facetada com a forma do contorno: a cintura embaixo, as facetas da coroa subindo até a mesa. */
  facetada(c: Contorno, y: number, alto: number, mesa = 0.42) {
    const menor = Math.min(...c.map(([x, z]) => Math.hypot(x, z)));
    this.pedras.push(posta(chapa(c, alto, { alto: alto * 0.42, dentro: menor * (1 - mesa) * 0.55 }), this.no(y)));
    return this;
  }
  /** Um cabochão: meia pedra polida, sem facetas, com a forma de uma elipse. */
  cabochao(a: number, b: number, alto: number, y: number) {
    this.pedras.push(posta(new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.no(y).multiply(escala(a, alto, b))));
    return this;
  }
  pedacos(a: { metal: string }, daPedra: THREE.Material): Pedaco[] {
    const out: Pedaco[] = [];
    if (this.metais.length) out.push({ geo: juntar(this.metais), mat: metal(a.metal) });
    if (this.bordas.length) out.push({ geo: juntar(this.bordas), mat: polido(a.metal) });
    if (this.pedras.length) out.push({ geo: juntar(this.pedras), mat: daPedra });
    return out;
  }
}

/**
 * Um anel no laço de um dedo. O aro engrossa nos ombros, para a pedra; e cada pedra tem o engaste
 * dela — o copo de metal que a recebe, a **virola** polida que a cerca (é a borda que desenha a
 * pedra), e as garras ou o granulado de cada feitio.
 */
function anel(a: Anel, l: Laco, folga: number): Pedaco[] {
  if (a.pedra === 'serpente') {
    // a cobra: o corpo dá quase duas voltas no dedo, afinando para a cauda; a cabeça fica no dorso, com dois olhos de pedra
    const VOLTAS = 1.85;
    const K = 120;
    const ate = 0.35;
    const de = ate - VOLTAS * Math.PI * 2;
    const passo = 0.0029;
    const corpo: THREE.Vector3[] = [];
    for (let i = 0; i <= K; i++) {
      const t = de + ((ate - de) * i) / K;
      corpo.push(sobre(l, t, folga + 0.0012).addScaledVector(l.eixo, passo * ((t - (de + ate) / 2) / (Math.PI * 2))));
    }
    const grossura = (i: number) => 0.00035 + 0.0009 * Math.min(1, (i / K) * 3.2);
    const cabeca = corpo[K].clone().addScaledVector(corpo[K].clone().sub(corpo[K - 3]).normalize(), 0.0017);
    const m = eixosEm(l, ate, cabeca).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
    // as escamas: anéis finos ao longo do corpo, e a crista da cabeça
    const escamas: THREE.BufferGeometry[] = [];
    for (let i = 14; i < K - 4; i += 5) {
      const t = corpo[i + 1].clone().sub(corpo[i - 1]).normalize();
      const giro = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), t);
      escamas.push(posta(new THREE.TorusGeometry(grossura(i) * 1.02, 0.00013, 4, 10), new THREE.Matrix4().compose(corpo[i], giro, new THREE.Vector3(1, 1, 1))));
    }
    return [
      { geo: juntar([tubo(corpo, grossura, false, l.centro.clone(), 10), posta(new THREE.SphereGeometry(1, 16, 10), m.clone().multiply(escala(0.0029, 0.0013, 0.002)))]), mat: metal(a.metal) },
      { geo: juntar(escamas), mat: polido(a.metal) },
      { geo: juntar([1, -1].map((lado) => posta(new THREE.SphereGeometry(0.0005, 8, 6), m.clone().multiply(mover(0.0012, 0.00105, lado * 0.00095))))), mat: pedra(a.cor, false) },
    ];
  }
  if (a.pedra === 'incrustada') {
    // um aro largo e reto de outro material (a madeira), preso entre dois frisos de metal, com um filete no meio
    return [
      { geo: faixa(l, { larg: 0.0056, gross: 0.0014, folga, quina: 5 }), mat: fosco(a.cor, 0.5) },
      { geo: juntar([-1, 1].map((lado) => faixa(l, { larg: 0.0012, gross: 0.0019, folga, desvio: lado * 0.003, quina: 3 }))), mat: metal(a.metal) },
      { geo: fio(l, folga, 0.00155, 0, 0.00022), mat: polido(a.metal) },
    ];
  }
  const liso = a.pedra === 'nenhuma';
  // os ombros: o aro alarga e engrossa para a pedra
  const ombro = (t: number) => Math.exp(-((Math.atan2(Math.sin(t), Math.cos(t)) / 0.6) ** 2));
  const larg = liso ? 0.0038 : (t: number) => 0.0021 + 0.0009 * ombro(t);
  const gross = liso ? 0.0014 : (t: number) => 0.0011 + 0.0006 * ombro(t);
  const j = new Joia(eixosEm(l, 0, sobre(l, 0, folga + em(gross, 0) - 0.0003)));
  j.metais.push(faixa(l, { larg, gross, folga, quina: liso ? 3 : 2.4 }));
  // (no alto do aro, girado em volta do dedo: onde pousam as pedras de lado da trinca)
  const emVolta = (t: number) => new Joia(eixosEm(l, t, sobre(l, t, folga + em(gross, t) - 0.0003)));
  let daPedra = pedra(a.cor, true);
  switch (a.pedra) {
    case 'nenhuma':
      // a aliança: um friso polido em cada beirada
      j.bordas.push(fio(l, folga, 0.0014, -0.0016, 0.0003), fio(l, folga, 0.0014, 0.0016, 0.0003));
      break;
    case 'redonda': {
      // o solitário: a cesta, seis garras, e o brilhante no alto, com o pavilhão à vista entre elas
      const r = 0.0031;
      const cintura = superelipse(r, r, 2, 24);
      j.metais.push(posta(new THREE.CylinderGeometry(r * 0.62, r * 0.3, 0.0018, 14), j.m.clone().multiply(mover(0, 0.0011, 0))));
      j.virola(vezes(cintura, 0.62), 0.002, 0.00026);
      j.garras(cintura, [0, 1, 2, 3, 4, 5].map((k) => k / 6 + 1 / 12), 0.0004, 0.0031);
      j.brilhante(r, 0.0027);
      break;
    }
    case 'trinca':
      // três brilhantes em fila, em volta do dedo: o do meio maior, cada um nas quatro garras dele
      for (const [t, r] of [[0, 0.0026], [0.46, 0.0019], [-0.46, 0.0019]]) {
        const k = emVolta(t);
        const cintura = superelipse(r, r, 2, 16);
        k.metais.push(posta(new THREE.CylinderGeometry(r * 0.66, r * 0.34, r * 0.6, 12), k.m.clone().multiply(mover(0, r * 0.42, 0))));
        k.garras(cintura, [0.125, 0.375, 0.625, 0.875], 0.0003, r * 0.98, 0.00026);
        k.brilhante(r, r * 0.86);
        j.metais.push(...k.metais);
        j.bordas.push(...k.bordas);
        j.pedras.push(...k.pedras);
      }
      break;
    case 'esmeralda': {
      // o corte esmeralda, em degraus, num engaste retangular de cantos cortados, com duas garras em cada canto
      const c = superelipse(0.0036, 0.0029, 4.5);
      j.copo(vezes(c, 1.1), 0, 0.0014).virola(vezes(c, 1.08), 0.0014, 0.00036);
      for (const [k, h] of [[1, 0.0011], [0.76, 0.0018], [0.5, 0.0024]] as const) j.pedras.push(posta(chapa(vezes(c, k), 0.0007), j.m.clone().multiply(mover(0, h, 0))));
      j.garras(c, [0.105, 0.145, 0.355, 0.395, 0.605, 0.645, 0.855, 0.895], 0.0008, 0.0022, 0.00024);
      break;
    }
    case 'oval': {
      // o cabochão: meia pedra polida, cercada pela virola e por uma volta de granulado
      const c = superelipse(0.0037, 0.003);
      j.copo(vezes(c, 1.16), 0, 0.0012).virola(vezes(c, 1.02), 0.0013, 0.0004).granulado(vezes(c, 1.2), 0.0011, 0.00027, 26);
      j.cabochao(0.0034, 0.0027, 0.0023, 0.0012);
      daPedra = pedra(a.cor, false);
      break;
    }
    case 'marquise': {
      // a navete: comprida, de duas pontas, com uma garra em V em cada uma
      const c = navete(0.0048, 0.0023);
      j.copo(vezes(c, 1.1), 0, 0.0012).virola(vezes(c, 1.06), 0.0013, 0.00032);
      j.facetada(vezes(c, 0.94), 0.0011, 0.0016);
      for (const s of [1, -1]) j.garra([s * 0.0043, 0.0006, 0], [s * 0.0045, 0.0021, 0], 0.00034);
      j.garras(c, [0.25, 0.75], 0.0008, 0.0021, 0.00024);
      break;
    }
    case 'gota': {
      // a lapidação em pera: redonda de um lado, em ponta do outro (a ponta para a ponta do dedo)
      const c = vezes(pera(0.0034, 0.0029), 1).map(([x, z]) => [x - 0.0006, z] as [number, number]);
      j.copo(vezes(c, 1.1), 0, 0.0012).virola(vezes(c, 1.07), 0.0013, 0.00032);
      j.facetada(vezes(c, 0.94), 0.0011, 0.0017);
      j.garra([0.0034, 0.0006, 0], [0.0035, 0.0022, 0], 0.00034);
      j.garras(c, [0.3, 0.5, 0.7], 0.0008, 0.0021, 0.00024);
      break;
    }
    case 'coracao': {
      // o coração: as duas voltas para a ponta do dedo e o bico para o punho, na virola dele
      const c = coracao(0.0032, 0.0033);
      j.copo(vezes(c, 1.12), 0, 0.0012).virola(vezes(c, 1.07), 0.0013, 0.00034);
      j.pedras.push(posta(chapa(vezes(c, 0.95), 0.0019, { alto: 0.00075, dentro: 0.0009, passos: 3 }), j.m.clone().multiply(mover(0, 0.0011, 0))));
      j.garra([-0.0034, 0.0006, 0], [-0.0031, 0.0024, 0], 0.00032);
      j.garras(c, [0.19, 0.81], 0.0008, 0.0024, 0.00026);
      daPedra = pedra(a.cor, false);
      break;
    }
    case 'perola': {
      // a pérola no cálice dela: um copinho e cinco pétalas de metal que a abraçam
      const c = superelipse(0.002, 0.002, 2, 20);
      j.copo(c, 0, 0.001).virola(c, 0.001, 0.00028);
      for (let k = 0; k < 5; k++) {
        const t = (k / 5) * Math.PI * 2 + 0.3;
        j.bordas.push(posta(new THREE.SphereGeometry(1, 8, 6), j.m.clone().multiply(mover(Math.cos(t) * 0.0023, 0.0017, Math.sin(t) * 0.0023)).multiply(new THREE.Matrix4().makeRotationY(-t)).multiply(new THREE.Matrix4().makeRotationZ(0.7)).multiply(escala(0.00042, 0.0012, 0.0008))));
      }
      j.pedras.push(posta(new THREE.SphereGeometry(0.0031, 22, 16), j.m.clone().multiply(mover(0, 0.0036, 0))));
      daPedra = fosco(a.cor, 0.3);
      break;
    }
    case 'sinete': {
      // o anel de selo: a chapa oval em dois degraus, a virola em volta do campo e a espada gravada nele
      const c = superelipse(0.0049, 0.0039);
      j.metais.push(posta(chapa(c, 0.0013, { alto: 0.0003, dentro: 0.0003 }), j.m.clone()));
      j.virola(vezes(c, 0.9), 0.0013, 0.0003);
      j.pedras.push(posta(chapa(vezes(c, 0.84), 0.00025), j.m.clone().multiply(mover(0, 0.00125, 0))));
      // (a espada do baralho: um coração de bico para a ponta do dedo, e o pé)
      const naipe = coracao(0.0019, 0.0018, 28).map(([x, z]) => [-x + 0.0004, z] as [number, number]);
      j.bordas.push(posta(chapa(naipe, 0.0003), j.m.clone().multiply(mover(0, 0.00145, 0))));
      j.bordas.push(posta(chapa([[-0.0022, 0.0009], [-0.0022, -0.0009], [-0.0009, 0]], 0.0003), j.m.clone().multiply(mover(0, 0.00145, 0))));
      daPedra = metal(a.cor);
      break;
    }
    case 'quadrada': {
      // a placa quadrada de ônix, na moldura dela, presa por uma garra em cada canto
      const c = superelipse(0.003, 0.003, 9);
      j.copo(vezes(c, 1.12), 0, 0.0013).virola(vezes(c, 1.08), 0.0013, 0.0004);
      j.pedras.push(posta(chapa(vezes(c, 0.95), 0.0011, { alto: 0.0004, dentro: 0.00055 }), j.m.clone().multiply(mover(0, 0.0011, 0))));
      j.garras(c, [0.125, 0.375, 0.625, 0.875], 0.0007, 0.0022, 0.00038);
      daPedra = pedra(a.cor, true);
      break;
    }
  }
  return j.pedacos(a, a.pedra === 'sinete' ? daPedra : daPedra);
}

/** O comprimento da volta do laço, `alto` acima da pele. */
function volta(l: Laco, alto: number): number {
  let c = 0;
  for (let i = 0; i < N; i++) c += sobre(l, (i / N) * Math.PI * 2, alto).distanceTo(sobre(l, ((i + 1) / N) * Math.PI * 2, alto));
  return c;
}

/** Os pespontos de uma tira: uma fila de pontos de linha rente a cada beirada dela. */
function pespontos(l: Laco, larg: number, folga: number, alto: number): THREE.BufferGeometry {
  const n = Math.max(20, Math.round(volta(l, folga + alto) / 0.0024));
  const pontos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    for (const lado of [-1, 1]) pontos.push(posta(new THREE.BoxGeometry(0.00034, 0.00026, 0.0014), eixosEm(l, t, sobre(l, t, folga + alto)).multiply(mover((lado * (larg - 0.0022)) / 2, 0, 0))));
  }
  return juntar(pontos);
}

/** Uma corrente em volta do laço: elos deitados, compridos na direção da volta, um inclinado para cada lado. */
function elos(l: Laco, folga: number, r: number, grosso: number, desvio = 0): THREE.BufferGeometry {
  const n = Math.max(10, 2 * Math.round(volta(l, folga + r * 0.7) / (r * 3)));
  const todos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const m = eixosEm(l, t, sobre(l, t, folga + r * 0.72)).multiply(mover(desvio, 0, 0));
    todos.push(posta(new THREE.TorusGeometry(r, grosso, 6, 14), m.multiply(new THREE.Matrix4().makeRotationZ(i % 2 ? 0.42 : -0.42)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)).multiply(escala(0.72, 1, 1))));
  }
  return juntar(todos);
}

/** Uma conta (uma esfera) no ponto dado. */
const contaEm = (p: THREE.Vector3, r: number, gomos = 10, aneis = 7) => posta(new THREE.SphereGeometry(r, gomos, aneis), mover(p.x, p.y, p.z));
/** Uma argolinha no ponto `p`, deitada no plano dos rumos `x` e `y`. */
function argolinha(p: THREE.Vector3, x: THREE.Vector3, y: THREE.Vector3, r: number, grosso: number, gomos = 10): THREE.BufferGeometry {
  const ex = x.clone().normalize();
  const ey = y.clone().addScaledVector(ex, -ex.dot(y)).normalize();
  return posta(new THREE.TorusGeometry(r, grosso, 5, gomos), new THREE.Matrix4().makeBasis(ex, ey, new THREE.Vector3().crossVectors(ex, ey)).setPosition(p));
}
/** Uma correntinha ao longo de uma fila de pontos: elos miúdos, um deitado e um de pé, alternados. `fora`: para onde é "para cima". */
function correntinha(pontos: THREE.Vector3[], fora: THREE.Vector3, passo = 0.00105): THREE.BufferGeometry[] {
  const elos: THREE.BufferGeometry[] = [];
  let resto = passo / 2;
  let k = 0;
  for (let i = 0; i + 1 < pontos.length; i++) {
    const a = pontos[i];
    const b = pontos[i + 1];
    const comp = a.distanceTo(b);
    const rumo = b.clone().sub(a).normalize();
    const cima = fora.clone().addScaledVector(rumo, -rumo.dot(fora)).normalize();
    const lado = new THREE.Vector3().crossVectors(rumo, cima);
    for (; resto <= comp; resto += passo, k++) elos.push(argolinha(a.clone().addScaledVector(rumo, resto), rumo, k % 2 ? cima : lado, 0.00056, 0.00017, 8));
    resto -= comp;
  }
  return elos;
}

/**
 * Um terço enrolado três vezes no pulso, com tudo o que um terço tem:
 *  - o fio de contas, em hélice: as **dezenas** de contas miúdas (as ave-marias), cada conta ligada à
 *    seguinte por um elo, e entre uma dezena e outra a conta maior (o pai-nosso), com uma tampinha de
 *    metal de cada lado;
 *  - a **medalha** do centro, oval, de borda polida e granulada, com uma cruz em relevo — é nela que as
 *    duas pontas do fio se prendem, cada uma por uma correntinha;
 *  - o **pendente**, que sai da medalha e corre no vão entre duas voltas: uma conta maior, três
 *    miúdas, outra maior;
 *  - e o **crucifixo**, deitado sobre as voltas no dorso do pulso: a cruz de pontas em trevo, debruada,
 *    com a figura e a plaquinha em relevo, presa ao pendente por uma argola.
 * A peça é rígida, como as outras: por isso o crucifixo fica deitado no pulso, e não pendurado.
 */
function terco(a: Pulseira, l: Laco, folga: number): Pedaco[] {
  const R = 0.00205;
  const RG = 0.00275;
  const PASSO = 0.0049;
  const VOLTAS = 3;
  /** A altura do que vai por cima das voltas: logo acima das contas maiores. */
  const POR_CIMA = 2 * R + 0.001;
  const contas: THREE.BufferGeometry[] = [];
  const maiores: THREE.BufferGeometry[] = [];
  const metais: THREE.BufferGeometry[] = [];
  const polidos: THREE.BufferGeometry[] = [];

  /** O comprimento ao longo de uma fila de pontos, e o ponto que fica a uma distância do começo dela. */
  const medida = (pts: THREE.Vector3[]) => {
    const acum = [0];
    for (let i = 1; i < pts.length; i++) acum.push(acum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const em = (d: number) => {
      let i = 1;
      while (i < pts.length - 1 && acum[i] < d) i++;
      const k = Math.min(1, Math.max(0, (d - acum[i - 1]) / (acum[i] - acum[i - 1] || 1)));
      return { ponto: pts[i - 1].clone().lerp(pts[i], k), rumo: pts[i].clone().sub(pts[i - 1]).normalize(), u: (i - 1 + k) / (pts.length - 1) };
    };
    return { total: acum[acum.length - 1], em };
  };

  // o crucifixo fica no dorso (t = 0), com o alto dele para o lado da medalha; o pendente tem de caber
  // entre os dois: anda-se do alto do crucifixo, em volta do pulso, o comprimento do pendente
  const ALTO_DA_CRUZ = 0.0118;
  const PENDENTE = 0.0265;
  let tAlto = 0;
  for (let d = 0; d < ALTO_DA_CRUZ + 0.0012; tAlto += 0.004) d += sobre(l, tAlto, folga + POR_CIMA).distanceTo(sobre(l, tAlto + 0.004, folga + POR_CIMA));
  let tMedalha = tAlto;
  for (let d = 0; d < PENDENTE + 0.0052; tMedalha += 0.004) d += sobre(l, tMedalha, folga + POR_CIMA).distanceTo(sobre(l, tMedalha + 0.004, folga + POR_CIMA));
  /** Onde a hélice começa e acaba: logo depois da medalha. */
  const T0 = tMedalha + 0.3;
  /** O vão entre a primeira volta e a segunda, em cada ângulo (é por ele que o pendente corre). */
  const vao = (t: number) => {
    const f = (((t - T0) / (Math.PI * 2)) % 1 + 1) % 1;
    return (f - 1) * PASSO;
  };

  // ── o fio de contas ──
  const K = VOLTAS * 120;
  const helice = (u: number, alto: number) => sobre(l, T0 + u * VOLTAS * Math.PI * 2, folga + alto).addScaledVector(l.eixo, (u - 0.5) * VOLTAS * PASSO);
  const doFio = Array.from({ length: K + 1 }, (_, i) => helice(i / K, R));
  const F = medida(doFio);
  metais.push(tubo(doFio, () => 0.00026, false, l.centro, 5));
  const PONTA = 0.0052;
  for (let d = PONTA, k = 0; ; k++) {
    const maior = k % 11 === 5;
    const r = maior ? RG : R;
    if (d + r > F.total - PONTA) break;
    const { ponto, rumo, u } = F.em(d);
    const fora = helice(u, R + 0.001).sub(helice(u, R)).normalize();
    // (a conta maior fica um nada mais alta, para não encostar na pele)
    const centro = maior ? ponto.clone().addScaledVector(fora, 0.0002) : ponto;
    (maior ? maiores : contas).push(contaEm(centro, r, maior ? 14 : 10, maior ? 10 : 7));
    if (maior) {
      for (const s of [-1, 1]) {
        const giro = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), rumo.clone().multiplyScalar(s));
        polidos.push(posta(new THREE.CylinderGeometry(r * 0.42, r * 0.8, r * 0.4, 10), new THREE.Matrix4().compose(centro.clone().addScaledVector(rumo, s * r * 0.84), giro, new THREE.Vector3(1, 1, 1))));
      }
    }
    const seguinteMaior = (k + 1) % 11 === 5;
    const folgaEntre = maior || seguinteMaior ? 0.0017 : 0.00095;
    // o elo entre esta conta e a seguinte (dois, ao lado de uma conta maior)
    const elos = maior || seguinteMaior ? [0.3, 0.7] : [0.5];
    elos.forEach((q, i) => {
      const e = F.em(d + r + folgaEntre * q);
      metais.push(argolinha(e.ponto, e.rumo, i ? fora : new THREE.Vector3().crossVectors(e.rumo, fora), 0.00058, 0.00018, 8));
    });
    d += r + folgaEntre + (seguinteMaior ? RG : R);
  }

  // ── a medalha ──
  const M = eixosEm(l, tMedalha, sobre(l, tMedalha, folga + POR_CIMA).addScaledVector(l.eixo, vao(tMedalha) * 0.5));
  const oval = superelipse(0.0033, 0.0041, 2.3, 30);
  const medalha = new Joia(M);
  medalha.copo(oval, 0, 0.0011).virola(vezes(oval, 0.98), 0.0011, 0.00027).granulado(vezes(oval, 0.82), 0.00112, 0.00017, 22);
  // a cruz em relevo no meio dela
  medalha.bordas.push(posta(new THREE.BoxGeometry(0.00062, 0.0005, 0.0036), M.clone().multiply(mover(0, 0.0012, 0))), posta(new THREE.BoxGeometry(0.0023, 0.0005, 0.00062), M.clone().multiply(mover(0, 0.0012, 0.0007))));
  const naMedalha = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(M);
  const eixoX = new THREE.Vector3().setFromMatrixColumn(M, 0);
  const eixoY = new THREE.Vector3().setFromMatrixColumn(M, 1);
  const eixoZ = new THREE.Vector3().setFromMatrixColumn(M, 2);
  // as três argolas dela: duas no alto, uma para cada ponta do fio, e a de baixo, para o pendente
  const orelhas = [naMedalha(-0.0019, 0.0005, 0.0047), naMedalha(0.0019, 0.0005, 0.0047), naMedalha(0, 0.0005, -0.0049)];
  for (const o of orelhas) polidos.push(argolinha(o, eixoX, eixoZ, 0.00095, 0.00026, 12));
  // as duas pontas do fio sobem até a medalha, cada uma por uma correntinha
  metais.push(...correntinha([orelhas[0], F.em(PONTA - R - 0.0006).ponto], eixoY), ...correntinha([orelhas[1], naMedalha(0.0052, -0.0012, 0.006), F.em(F.total - PONTA + R + 0.0006).ponto], eixoY));

  // ── o pendente: corre no vão entre duas voltas, da medalha ao crucifixo ──
  const RP = 0.0017;
  const RPG = 0.0021;
  /** A que altura uma conta de raio `r` assenta no vão entre duas voltas. */
  const noVao = (r: number) => R + Math.sqrt(Math.max(0, (R + r) ** 2 - (PASSO / 2) ** 2));
  /** O ângulo, em volta do pulso, de um ponto do pendente (u = 0 na medalha, 1 no crucifixo). */
  const tDoPendente = (u: number) => tMedalha - 0.17 + (tAlto + 0.04 - (tMedalha - 0.17)) * u;
  const caminho = (alto: number) =>
    Array.from({ length: 61 }, (_, i) => {
      const t = tDoPendente(i / 60);
      // (perto da medalha e do crucifixo o pendente sobe do vão para a altura deles)
      const sobe = Math.max(0, 1 - i / 8, 1 - (60 - i) / 8);
      return sobre(l, t, folga + alto + (POR_CIMA + 0.0005 - alto) * sobe * sobe).addScaledVector(l.eixo, vao(t) * (1 - 0.5 * Math.max(0, 1 - i / 8)));
    });
  const P = medida(caminho(noVao(RP)));
  const doPendente: [number, number][] = [
    [0.0045, RPG],
    [0.0093, RP],
    [0.0135, RP],
    [0.0177, RP],
    [0.0225, RPG],
  ];
  for (const [d, r] of doPendente) {
    const e = P.em(d);
    const fora = rumoEm(l, tDoPendente(e.u));
    (r === RPG ? maiores : contas).push(contaEm(e.ponto.clone().addScaledVector(fora, r === RPG ? 0.0004 : 0), r, 12, 8));
  }
  // (a correntinha só nos trechos sem conta: da medalha à primeira, e da última ao crucifixo)
  const trecho = (de: number, ate: number) => Array.from({ length: 9 }, (_, i) => P.em(de + ((ate - de) * i) / 8).ponto);
  metais.push(...correntinha(trecho(0, 0.0045 - RPG), eixoY), ...correntinha(trecho(0.0225 + RPG, P.total), eixoY));
  metais.push(tubo(trecho(0.0045, 0.0225), () => 0.00024, false, l.centro, 5));

  // ── o crucifixo, deitado no dorso ──
  const C = eixosEm(l, 0, sobre(l, 0, folga + POR_CIMA).addScaledVector(l.eixo, vao(0)));
  const W = 0.00165;
  const BRACO = 0.0066;
  const [Z0, Z1, Z2, Z3] = [-0.0112, 0.0026, 0.0059, ALTO_DA_CRUZ - 0.0012];
  const cruz: Contorno = [
    [W, Z0],
    [W, Z1],
    [BRACO, Z1],
    [BRACO, Z2],
    [W, Z2],
    [W, Z3],
    [-W, Z3],
    [-W, Z2],
    [-BRACO, Z2],
    [-BRACO, Z1],
    [-W, Z1],
    [-W, Z0],
  ];
  const GROSSA = 0.0011;
  const crucifixo = new Joia(C);
  crucifixo.metais.push(posta(chapa(cruz, GROSSA, { alto: 0.00025, dentro: 0.0002 }), C.clone()));
  crucifixo.virola(cruz, GROSSA, 0.0002);
  // as pontas em trevo: três bolinhas em cada uma das quatro pontas
  const pontas: [number, number, number, number][] = [
    [0, Z0, 0, -1],
    [0, Z3, 0, 1],
    [BRACO, (Z1 + Z2) / 2, 1, 0],
    [-BRACO, (Z1 + Z2) / 2, -1, 0],
  ];
  for (const [x, z, dx, dz] of pontas) {
    for (const [ao, deLado] of [
      [0.0009, 0],
      [-0.0001, 0.00135],
      [-0.0001, -0.00135],
    ]) {
      crucifixo.metais.push(posta(new THREE.SphereGeometry(0.00105, 10, 7), C.clone().multiply(mover(x + dx * ao + dz * deLado, GROSSA * 0.5, z + dz * ao + dx * deLado)).multiply(escala(1, 0.62, 1))));
    }
  }
  // a figura, em relevo: a cabeça, o tronco, os braços abertos e as pernas; e a plaquinha no alto
  const meioDoBraco = (Z1 + Z2) / 2;
  crucifixo.bordas.push(
    posta(new THREE.SphereGeometry(0.00072, 10, 7), C.clone().multiply(mover(0, GROSSA + 0.0004, meioDoBraco + 0.0012))),
    posta(new THREE.SphereGeometry(1, 10, 7), C.clone().multiply(mover(0, GROSSA + 0.0002, meioDoBraco - 0.0019)).multiply(escala(0.00078, 0.00055, 0.0023))),
    posta(new THREE.BoxGeometry(0.0021, 0.0004, 0.001), C.clone().multiply(mover(0, GROSSA + 0.0002, Z3 - 0.0013))),
  );
  crucifixo
    .garra([0.0006, GROSSA + 0.0002, meioDoBraco - 0.0002], [BRACO - 0.0012, GROSSA + 0.0002, meioDoBraco + 0.0006], 0.0003)
    .garra([-0.0006, GROSSA + 0.0002, meioDoBraco - 0.0002], [-BRACO + 0.0012, GROSSA + 0.0002, meioDoBraco + 0.0006], 0.0003)
    .garra([0, GROSSA + 0.0002, meioDoBraco - 0.004], [0, GROSSA + 0.0001, Z0 + 0.0022], 0.00042);
  // a argola que o prende ao pendente
  crucifixo.bordas.push(argolinha(new THREE.Vector3(0, GROSSA * 0.5, Z3 + 0.0011).applyMatrix4(C), new THREE.Vector3().setFromMatrixColumn(C, 0), new THREE.Vector3().setFromMatrixColumn(C, 2), 0.0011, 0.00028, 12));

  const conta = (cor: string) => material('conta:' + cor, () => new THREE.MeshStandardMaterial({ color: cor, roughness: 0.2, metalness: 0.12, emissive: shade(cor, -0.6), emissiveIntensity: 0.35 }));
  return [
    { geo: juntar(contas), mat: conta(a.cor) },
    { geo: juntar(maiores), mat: conta(shade(a.cor, -0.18)) },
    { geo: juntar([...metais, ...medalha.metais, ...crucifixo.metais]), mat: metal(a.cor2) },
    { geo: juntar([...polidos, ...medalha.bordas, ...crucifixo.bordas]), mat: polido(a.cor2) },
  ];
}

/**
 * Uma pulseira no laço do pulso. Cada feitio tem os detalhes dele: os separadores e o fecho de um fio
 * de contas, a argola do fecho de uma corrente, as beiradas debruadas, os pespontos e a fivela de uma
 * tira de couro, o engaste de cada pedra de uma riviera.
 */
function pulseira(a: Pulseira, l: Laco, folga: number): Pedaco[] {
  switch (a.feitio) {
    case 'terco':
      return terco(a, l, folga);
    case 'contas': {
      // o fio de contas: uma arruela de metal entre uma conta e a outra, e o fecho — uma conta maior entre duas tampas
      const r = a.id === 'pulseira-perolas' ? 0.0027 : 0.0031;
      const n = Math.max(8, Math.round(volta(l, folga + r) / (2 * r * 1.06)));
      const contas: THREE.BufferGeometry[] = [];
      const metais: THREE.BufferGeometry[] = [];
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2 + Math.PI;
        const fecho = i === 0;
        const m = eixosEm(l, t, sobre(l, t, folga + r));
        (fecho ? metais : contas).push(posta(new THREE.SphereGeometry(fecho ? r * 1.08 : r, 16, 12), m.clone()));
        // (a arruela fica entre esta conta e a seguinte, de pé, atravessada no fio)
        const tm = t + Math.PI / n;
        metais.push(posta(new THREE.TorusGeometry(r * 0.5, r * 0.17, 5, 12), eixosEm(l, tm, sobre(l, tm, folga + r)).multiply(new THREE.Matrix4().makeRotationY(0))));
        if (fecho) for (const s of [-1, 1]) metais.push(posta(new THREE.CylinderGeometry(r * 0.8, r * 0.55, r * 0.5, 12), m.clone().multiply(mover(0, 0, s * r * 0.95)).multiply(new THREE.Matrix4().makeRotationX((s * Math.PI) / 2))));
      }
      return [
        { geo: juntar(contas), mat: fosco(a.cor, 0.3) },
        { geo: juntar(metais), mat: metal(a.cor2) },
      ];
    }
    case 'corrente': {
      // a corrente de elos grossos, com o fecho de argola e barra, e uma plaquinha lisa de identidade no dorso
      const m = eixosEm(l, 0, sobre(l, 0, folga + 0.0024));
      const placa = posta(chapa(superelipse(0.0042, 0.0085, 5), 0.0011, { alto: 0.0003, dentro: 0.0003 }), m.clone().multiply(mover(0, -0.0006, 0)));
      const borda = tubo(
        superelipse(0.0037, 0.008, 5, 40).map(([x, z]) => new THREE.Vector3(x, 0.00055, z).applyMatrix4(m)),
        () => 0.00022,
        true,
        new THREE.Vector3(0, 0.00055, 0).applyMatrix4(m),
        5,
      );
      const f = eixosEm(l, 2.2, sobre(l, 2.2, folga + 0.0026));
      const fecho = [posta(new THREE.TorusGeometry(0.0034, 0.0007, 6, 16), f.clone().multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))), posta(new THREE.CylinderGeometry(0.0007, 0.0007, 0.0082, 8), f.clone().multiply(mover(0, 0.0009, 0)).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2)))];
      return [
        { geo: juntar([elos(l, folga, 0.0029, 0.00085), placa, ...fecho]), mat: metal(a.cor) },
        { geo: borda, mat: polido(a.cor) },
      ];
    }
    case 'argolas': {
      // três aros rígidos, soltos, cada um de um feitio: um chato de quinas vivas, um torcido em corda e um redondo
      const chato = faixa(l, { larg: 0.0026, gross: 0.0016, folga: folga + 0.0009, desvio: -0.0046, quina: 5 });
      const redondo = faixa(l, { larg: 0.0021, gross: 0.0021, folga: folga + 0.0013, desvio: 0.0046 });
      const K = 220;
      const corda = [0, Math.PI].map((fase) => {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < K; i++) {
          const t = (i / K) * Math.PI * 2;
          const f = t * 22 + fase;
          pts.push(sobre(l, t, folga + 0.0032 + 0.00075 * Math.cos(f)).addScaledVector(l.eixo, 0.00075 * Math.sin(f)));
        }
        return tubo(pts, () => 0.00078, true, l.centro, 6);
      });
      return [
        { geo: juntar([chato, redondo]), mat: metal(a.cor) },
        { geo: juntar([fio(l, folga + 0.0009, 0.0016, -0.0046 - 0.0011, 0.00024), fio(l, folga + 0.0009, 0.0016, -0.0046 + 0.0011, 0.00024)]), mat: polido(a.cor) },
        { geo: juntar(corda), mat: metal(a.cor2) },
      ];
    }
    case 'trancada': {
      // dois fios torcidos um no outro, dando a volta no pulso; o nó que os fecha, e as duas pontas soltas com uma conta de metal cada
      const K = 260;
      const TORCE = 15;
      const fioTorcido = (fase: number) => {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < K; i++) {
          const t = (i / K) * Math.PI * 2;
          const f = t * TORCE + fase;
          pts.push(sobre(l, t, folga + 0.0019 + 0.0011 * Math.cos(f)).addScaledVector(l.eixo, 0.0011 * Math.sin(f)));
        }
        return tubo(pts, () => 0.00108, true, l.centro, 6);
      };
      const m = eixosEm(l, 1.15, sobre(l, 1.15, folga + 0.0024));
      const no = posta(new THREE.SphereGeometry(0.0026, 12, 8), m.clone().multiply(escala(0.8, 0.85, 1.15)));
      const pontas = [-1, 1].map((s) => posta(new THREE.CylinderGeometry(0.0008, 0.0008, 0.007, 6), m.clone().multiply(mover(0.0042, 0.0006, s * 0.0012)).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2 - s * 0.16))));
      const contas = [-1, 1].map((s) => posta(new THREE.SphereGeometry(0.0013, 10, 8), m.clone().multiply(mover(0.0079, 0.0006 + s * 0.0005, s * 0.0012))));
      return [
        { geo: juntar([fioTorcido(0), no, pontas[0]]), mat: fosco(a.cor, 0.85) },
        { geo: juntar([fioTorcido(Math.PI), pontas[1]]), mat: fosco(a.cor2, 0.85) },
        { geo: juntar(contas), mat: metal('#e0ad3e') },
      ];
    }
    case 'riviera': {
      // uma fila de brilhantes quadrados, cada um na caixinha dele (a moldura polida em volta) com quatro garras
      const lado = 0.0029;
      const n = Math.max(12, Math.round(volta(l, folga + 0.0012) / (lado * 1.12)));
      const caixas: THREE.BufferGeometry[] = [];
      const molduras: THREE.BufferGeometry[] = [];
      const pedras: THREE.BufferGeometry[] = [];
      const c = superelipse(lado * 0.5, lado * 0.5, 9, 16);
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        const j = new Joia(eixosEm(l, t, sobre(l, t, folga)));
        j.copo(c, 0, 0.0013).virola(vezes(c, 0.97), 0.0013, 0.00021).garras(c, [0.125, 0.375, 0.625, 0.875], 0.0009, 0.0019, 0.00018);
        j.pedras.push(posta(new THREE.CylinderGeometry(lado * 0.2, lado * 0.42, 0.0008, 4), j.m.clone().multiply(mover(0, 0.0016, 0)).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 4))));
        caixas.push(...j.metais);
        molduras.push(...j.bordas);
        pedras.push(...j.pedras);
      }
      return [
        { geo: juntar(caixas), mat: metal(a.cor) },
        { geo: juntar(molduras), mat: polido(a.cor) },
        { geo: juntar(pedras), mat: pedra(a.cor2, true) },
      ];
    }
    case 'espinhos':
    case 'couro': {
      // a tira de couro: reta, de beiradas debruadas e pespontadas; as tachas (ou os cones), cada uma na arruela dela; e a fivela no dorso
      const larg = a.feitio === 'couro' ? 0.017 : 0.0145;
      const metais: THREE.BufferGeometry[] = [];
      const arruelas: THREE.BufferGeometry[] = [];
      const quantos = a.feitio === 'couro' ? 9 : 10;
      for (let i = 1; i <= quantos; i++) {
        // (a fivela ocupa o dorso: as tachas dão a volta pelo resto)
        const t = (i / (quantos + 1)) * Math.PI * 2;
        const m = eixosEm(l, t, sobre(l, t, folga + 0.0018));
        arruelas.push(posta(new THREE.CylinderGeometry(0.0026, 0.0028, 0.0005, 14), m.clone().multiply(mover(0, 0.00025, 0))));
        metais.push(a.feitio === 'couro' ? posta(new THREE.SphereGeometry(0.0018, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.clone().multiply(mover(0, 0.0004, 0))) : posta(new THREE.ConeGeometry(0.0021, 0.0048, 12), m.clone().multiply(mover(0, 0.0028, 0))));
      }
      // a fivela: a moldura de metal, o pino e a ponta da tira que passa por ela
      const f = eixosEm(l, 0, sobre(l, 0, folga + 0.0018));
      const moldura = superelipse(larg * 0.56, 0.0052, 6, 32);
      metais.push(
        tubo(
          moldura.map(([x, z]) => new THREE.Vector3(x, 0.0011, z).applyMatrix4(f)),
          () => 0.00075,
          true,
          new THREE.Vector3(0, 0.0011, 0).applyMatrix4(f),
          6,
        ),
        posta(new THREE.CylinderGeometry(0.00045, 0.00045, 0.0092, 6), f.clone().multiply(mover(0, 0.0015, 0.0006)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))),
      );
      const ponta = posta(chapa(superelipse(larg * 0.42, 0.0078, 4), 0.0011), f.clone().multiply(mover(0, 0.0003, 0.0088)));
      return [
        { geo: juntar([faixa(l, { larg, gross: 0.0018, folga, quina: 6 }), ponta]), mat: fosco(a.cor, 0.78) },
        { geo: juntar([fio(l, folga, 0.0019, -larg / 2 + 0.0006, 0.00045), fio(l, folga, 0.0019, larg / 2 - 0.0006, 0.00045)]), mat: fosco(shade(a.cor, a.feitio === 'couro' ? 0.16 : 0.2), 0.7) },
        { geo: pespontos(l, larg - 0.0016, folga, 0.00185), mat: fosco(a.feitio === 'couro' ? '#d9c9a8' : '#8e8e99', 0.8) },
        { geo: juntar(metais), mat: metal(a.cor2) },
        { geo: juntar(arruelas), mat: polido(a.cor2) },
      ];
    }
    default:
      return [{ geo: faixa(l, { larg: 0.0046, gross: 0.0022, folga }), mat: metal(a.cor) }];
  }
}

/** Um mostrador com a forma do contorno, deitado, com a textura dele inteira por cima (as doze horas para −z). */
function tampo(c: Contorno): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(new THREE.Shape(c.map(([x, z]) => new THREE.Vector2(x, -z))), 4);
  const a = Math.max(...c.map(([x]) => Math.abs(x)));
  const b = Math.max(...c.map(([, z]) => Math.abs(z)));
  const pos = g.getAttribute('position');
  const uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 + pos.getX(i) / (2 * a), 0.5 + pos.getY(i) / (2 * b));
  return g;
}

/**
 * Um relógio no laço do pulso: a correia (de couro pespontado, de lona listrada, de elos de metal —
 * de um metal só ou de dois —, de borracha, ou uma corrente fina), a caixa com as quatro alças que a
 * prendem à correia, o **aro** polido em volta do vidro, a coroa serrilhada às três horas, o
 * mostrador e o vidro por cima dele.
 */
function relogio(a: Relogio, l: Laco, folga: number, mao: Mao): Pedaco[] {
  const out: Pedaco[] = [];
  const correia = {
    couro: { larg: 0.0125, gross: 0.0017 },
    metal: { larg: 0.0135, gross: 0.002 },
    bicolor: { larg: 0.0135, gross: 0.002 },
    borracha: { larg: 0.0168, gross: 0.0025 },
    corrente: { larg: 0.0042, gross: 0.0014 },
    lona: { larg: 0.0128, gross: 0.0014 },
  }[a.correia];
  const alto = a.caixa === 'oval' ? 0.004 : a.caixa === 'digital' ? 0.0062 : a.caixa === 'oitavada' ? 0.0049 : 0.0054;
  /** O metal da caixa e o das bordas dela: polidos, ou jateados (o aço fosco do relógio de campo). */
  const daCaixa = a.fosca ? jateado(a.metal) : metal(a.metal);
  const dasBordas = a.fosca ? jateado(shade(a.metal, 0.16)) : polido(a.metal);
  const m = eixosEm(l, 0, sobre(l, 0, folga + correia.gross));
  const no = (x: number, y: number, z: number) => m.clone().multiply(mover(x, y, z));

  // ── a correia ──
  if (a.correia === 'couro') {
    out.push({ geo: faixa(l, { larg: correia.larg, gross: correia.gross, folga, quina: 6 }), mat: fosco(a.corDaCorreia, 0.75) });
    out.push({ geo: pespontos(l, correia.larg, folga, 0.00175), mat: fosco(shade(a.corDaCorreia, 0.45), 0.8) });
  } else if (a.correia === 'borracha') {
    // a de borracha: larga e fosca, com dois frisos ao comprido
    out.push({ geo: juntar([faixa(l, { larg: correia.larg, gross: correia.gross, folga, quina: 7 }), fio(l, folga, 0.0027, -0.0045, 0.0006), fio(l, folga, 0.0027, 0.0045, 0.0006)]), mat: fosco(a.corDaCorreia, 0.92) });
  } else if (a.correia === 'corrente') {
    // duas correntes finas, lado a lado
    out.push({ geo: juntar([elos(l, folga, 0.0015, 0.00045, -0.0013), elos(l, folga, 0.0015, 0.00045, 0.0013)]), mat: metal(a.corDaCorreia) });
  } else if (a.correia === 'lona') {
    // a de lona: uma tira de tecido grosso, sem brilho, com a listra do meio (um nada mais alta, para as
    // duas faces não brigarem), os pespontos das beiradas e os dois passadores de metal, do lado das seis
    out.push({ geo: faixa(l, { larg: correia.larg, gross: correia.gross, folga, quina: 6 }), mat: fosco(a.corDaCorreia, 0.95) });
    out.push({ geo: faixa(l, { larg: 0.0044, gross: correia.gross + 0.0002, folga, quina: 6 }), mat: fosco(shade(a.corDaCorreia, -0.3), 0.95) });
    out.push({ geo: pespontos(l, correia.larg, folga, correia.gross + 0.00005), mat: fosco(shade(a.corDaCorreia, 0.35), 0.85) });
    const passadores = [1.0, 1.36].map((t) => posta(new THREE.BoxGeometry(correia.larg + 0.0012, 0.0009, 0.0014), eixosEm(l, t, sobre(l, t, folga + correia.gross + 0.0002))));
    out.push({ geo: juntar(passadores), mat: daCaixa });
  } else {
    // a pulseira de elos: fileiras de três chapas — as de fora e a do meio, desencontradas e mais polida
    // (na bicolor, a do meio é do segundo metal: a prata entre o bronze)
    const n = Math.max(24, Math.round(volta(l, folga + 0.002) / 0.0043));
    const fora: THREE.BufferGeometry[] = [];
    const meio: THREE.BufferGeometry[] = [];
    const passo = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      const t = i * passo;
      const comp = volta(l, folga + 0.001) / n;
      const elo = (dx: number, larg: number, tt: number) => posta(chapa(superelipse(larg / 2, comp * 0.46, 5, 16), correia.gross, { alto: 0.0004, dentro: 0.0004 }), eixosEm(l, tt, sobre(l, tt, folga)).multiply(mover(dx, 0, 0)));
      fora.push(elo(-0.0048, 0.0036, t), elo(0.0048, 0.0036, t));
      meio.push(elo(0, 0.0052, t + passo / 2));
    }
    out.push({ geo: juntar(fora), mat: metal(a.corDaCorreia) }, { geo: juntar(meio), mat: polido(a.correia === 'bicolor' ? (a.metal2 ?? a.corDaCorreia) : a.corDaCorreia) });
  }

  // ── a caixa ──
  const caixa: THREE.BufferGeometry[] = [];
  const bordas: THREE.BufferGeometry[] = [];
  /** O que é do segundo metal (num relógio bicolor): o aro e os botões. */
  const doOutroMetal: THREE.BufferGeometry[] = [];
  /** As cabeças dos parafusos: um tom mais escuro que a caixa. */
  const parafusos: THREE.BufferGeometry[] = [];
  const aro = (c: Contorno, y: number, r: number, onde = bordas) =>
    onde.push(
      tubo(
        c.map(([x, z]) => new THREE.Vector3(x, y, z).applyMatrix4(m)),
        () => r,
        true,
        new THREE.Vector3(0, y, 0).applyMatrix4(m),
        8,
      ),
    );
  let face: Contorno;
  let noMostrador = alto + 0.0001;
  if (a.caixa === 'redonda') {
    const c = superelipse(0.0143, 0.0143, 2, 40);
    caixa.push(posta(chapa(c, alto, { alto: 0.0007, dentro: 0.0007 }), no(0, 0, 0)));
    if (a.aro) {
      // o aro giratório: o anel com os minutos, entre a beirada serrilhada e o aro de dentro
      face = superelipse(0.0098, 0.0098, 2, 36);
      const anel = new THREE.RingGeometry(0.0102, 0.0136, 48).applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
      if (mao === 'D') anel.applyMatrix4(escala(-1, 1, 1));
      anel.applyMatrix4(no(0, alto + 0.0007, 0));
      out.push({ geo: anel, mat: aroDeMergulho(a, a.aro) });
      caixa.push(posta(new THREE.CylinderGeometry(0.0141, 0.0141, 0.0011, 40, 1, true), no(0, alto + 0.0002, 0)));
      for (let k = 0; k < 40; k++) bordas.push(posta(new THREE.BoxGeometry(0.0007, 0.0012, 0.0009), no(0, alto + 0.0002, 0).multiply(new THREE.Matrix4().makeRotationY((k / 40) * Math.PI * 2)).multiply(mover(0.0143, 0, 0))));
      aro(vezes(face, 1.03), alto + 0.0008, 0.0004);
    } else if (a.visor === 'cronografo') {
      // o aro do cronógrafo: uma coroa larga e chata no segundo metal, com a escala gravada, no degrau
      // dela; e o aro fino, do mesmo metal, em volta do vidro
      const outro = a.metal2 ?? a.metal;
      face = superelipse(0.0101, 0.0101, 2, 36);
      const anel = new THREE.RingGeometry(0.0104, 0.0139, 48).applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
      if (mao === 'D') anel.applyMatrix4(escala(-1, 1, 1));
      anel.applyMatrix4(no(0, alto + 0.0008, 0));
      out.push({ geo: anel, mat: aroGravado(a, outro) });
      doOutroMetal.push(posta(new THREE.CylinderGeometry(0.0139, 0.0142, 0.0011, 40, 1, true), no(0, alto + 0.00025, 0)));
      aro(vezes(face, 1.03), alto + 0.0009, 0.00042, doOutroMetal);
    } else {
      face = superelipse(0.0116, 0.0116, 2, 36);
      // o aro: um degrau polido em volta do vidro
      aro(superelipse(0.0126, 0.0126, 2, 40), alto + 0.0003, 0.0011);
    }
  } else if (a.caixa === 'oval') {
    // a caixa pequena de um relógio-joia: oval, comprida no rumo da correia, com uma volta de brilhantes miúdos no aro
    const c = superelipse(0.0079, 0.0102, 2, 32);
    caixa.push(posta(chapa(c, alto, { alto: 0.0006, dentro: 0.0006 }), no(0, 0, 0)));
    face = superelipse(0.0058, 0.0081, 2, 30);
    aro(vezes(c, 0.82), alto + 0.0002, 0.0005);
    const brilhantes: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 22; k++) {
      const [x, z] = vezes(c, 0.9)[Math.floor((k * 32) / 22)];
      brilhantes.push(posta(new THREE.OctahedronGeometry(0.00052, 0), no(x, alto + 0.00045, z)));
    }
    out.push({ geo: juntar(brilhantes), mat: pedra('#eaf6ff', true) });
  } else if (a.caixa === 'oitavada') {
    // a caixa de oito lados de um relógio moderno: baixa, com o aro oitavado por cima, preso por oito
    // parafusos (um em cada canto), e o vidro redondo no meio
    caixa.push(posta(chapa(oitavado(0.0144), alto, { alto: 0.0007, dentro: 0.0007 }), no(0, 0, 0)));
    bordas.push(posta(chapa(oitavado(0.0131), 0.001, { alto: 0.0003, dentro: 0.0003 }), no(0, alto - 0.0001, 0)));
    for (let k = 0; k < 8; k++) {
      const t = ((k + 0.5) / 8) * Math.PI * 2;
      parafusos.push(posta(new THREE.CylinderGeometry(0.00078, 0.00078, 0.0004, 6), no(Math.cos(t) * 0.0123, alto + 0.00095, Math.sin(t) * 0.0123)));
    }
    face = superelipse(0.0103, 0.0103, 2, 36);
    noMostrador = alto + 0.00096;
    aro(vezes(face, 1.03), alto + 0.001, 0.00036);
  } else if (a.caixa === 'digital') {
    // a caixa de resina de um relógio de visor: retangular de cantos cortados, com a moldura do visor, quatro parafusos e os botões
    const c = superelipse(0.0147, 0.0134, 5, 36);
    caixa.push(posta(chapa(c, alto, { alto: 0.0011, dentro: 0.0011 }), no(0, 0, 0)));
    caixa.push(posta(chapa(superelipse(0.0118, 0.0108, 7, 32), 0.0009), no(0, alto - 0.0001, 0)));
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      bordas.push(posta(new THREE.CylinderGeometry(0.0009, 0.0009, 0.0005, 8), no(sx * 0.0107, alto + 0.0001, sz * 0.0097)));
      caixa.push(posta(new THREE.BoxGeometry(0.0024, 0.0028, 0.0048), no(sx * 0.0153, alto * 0.5, sz * 0.0068)));
    }
    face = superelipse(0.0093, 0.0083, 9, 24);
    noMostrador = alto + 0.00085;
    aro(vezes(face, 1.04), alto + 0.0009, 0.00035);
  } else {
    // a caixa quadrada, de cantos redondos, com o aro em moldura
    const c = superelipse(0.0128, 0.0118, 5, 36);
    caixa.push(posta(chapa(c, alto, { alto: 0.0008, dentro: 0.0008 }), no(0, 0, 0)));
    face = superelipse(0.0102, 0.0092, 6, 32);
    aro(superelipse(0.0111, 0.0101, 5.5, 40), alto + 0.0003, 0.0009);
  }
  // as alças: os quatro chifres que prendem a caixa à correia (para o lado das doze e o das seis)
  if (a.caixa !== 'oval') {
    const meia = a.caixa === 'redonda' ? 0.0143 : a.caixa === 'oitavada' ? 0.0144 : a.caixa === 'digital' ? 0.0134 : 0.0118;
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      caixa.push(posta(new THREE.BoxGeometry(0.0028, 0.0032, 0.0052), no(sx * (correia.larg / 2 + 0.0008), alto * 0.36, sz * (meia + 0.0012)).multiply(new THREE.Matrix4().makeRotationX(sz * 0.42))));
    }
  }
  // a coroa, às três horas (do lado da mão): serrilhada, na haste dela — e os dois botões do cronógrafo
  if (a.caixa !== 'digital') {
    const fora = a.caixa === 'oval' ? 0.0086 : a.caixa === 'redonda' || a.caixa === 'oitavada' ? 0.0152 : 0.0138;
    const k = a.caixa === 'oval' ? 0.65 : 1;
    const deitada = new THREE.Matrix4().makeRotationZ(Math.PI / 2);
    caixa.push(posta(new THREE.CylinderGeometry(0.0009 * k, 0.0009 * k, 0.0016, 8), no(fora - 0.0004, alto / 2, 0).multiply(deitada)));
    const coroa = new THREE.CylinderGeometry(0.0019 * k, 0.0019 * k, 0.0022 * k, 14).toNonIndexed();
    coroa.computeVertexNormals();
    bordas.push(posta(coroa, no(fora + 0.0012 * k, alto / 2, 0).multiply(deitada)));
    // (os botões do cronógrafo bicolor são do segundo metal, como o aro)
    if (a.id === 'relogio-esportivo' || a.visor === 'cronografo') for (const s of [-1, 1]) (a.metal2 ? doOutroMetal : caixa).push(posta(new THREE.CylinderGeometry(0.0011, 0.0011, 0.0024, 8), no(0.0136, alto / 2, s * 0.0072).multiply(new THREE.Matrix4().makeRotationY(-s * 0.5)).multiply(deitada)));
  }
  out.push({ geo: juntar(caixa), mat: a.caixa === 'digital' ? fosco(a.metal, 0.6) : daCaixa });
  if (bordas.length) out.push({ geo: juntar(bordas), mat: a.caixa === 'digital' ? metal('#8a8f99') : dasBordas });
  if (doOutroMetal.length) out.push({ geo: juntar(doOutroMetal), mat: polido(a.metal2 ?? a.metal) });
  if (parafusos.length) out.push({ geo: juntar(parafusos), mat: metal(shade(a.metal, -0.4)) });

  // ── o mostrador e o vidro ──
  // O mostrador fica deitado no alto da caixa, com as doze horas no rumo da correia, do lado do
  // mínimo — é como o dono o lê, com o braço atravessado na frente do corpo. (A peça da mão direita é
  // o espelho da esquerda: o mostrador dela é desenhado já espelhado, para os algarismos saírem direitos.)
  const mostra = tampo(face);
  mostra.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  if (mao === 'D') mostra.applyMatrix4(escala(-1, 1, 1));
  mostra.applyMatrix4(no(0, noMostrador, 0));
  out.push({ geo: mostra, mat: mostrador(a) });
  // (o vidro: uma lente baixa por cima do mostrador, que só se vê pelo reflexo)
  const lente = new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const [fa, fb] = [Math.max(...face.map(([x]) => x)), Math.max(...face.map(([, z]) => z))];
  out.push({ geo: posta(lente, no(0, noMostrador + 0.0001, 0).multiply(escala(fa, a.caixa === 'digital' ? 0.0003 : 0.0011, fb))), mat: vidro(), semSombra: true });
  return out;
}

/** Uma peça montada: os pedaços dela, o osso que a leva (sem o lado) e a mão em que vai. */
export interface PecaDeAcessorio {
  id: string;
  osso: string;
  mao: Mao;
  pedacos: Pedaco[];
}

/**
 * As peças dos acessórios de um jogador (os anéis, e o que ele tem em cada pulso). `luva` é o que
 * cobre as mãos — a peça vai por cima do pano, com a folga dele.
 */
export function pecasDosAcessorios(a: Acessorios, luva: Luva['feitio']): PecaDeAcessorio[] {
  const L = osLacos();
  const folgas = folgasCom(luva);
  const out: PecaDeAcessorio[] = [];
  for (const posto of a.aneis) {
    const def = findAcessorio(posto.id);
    if (!def || def.tipo !== 'anel') continue;
    // (a serpente e o aro largo cobrem um trecho do dedo: vão pelo corte mais gordo dele)
    const l = (def.pedra === 'serpente' || def.pedra === 'incrustada' ? L.dedosLargos : L.dedos)[posto.dedo];
    if (!l) continue;
    out.push({ id: def.id, osso: l.osso, mao: posto.mao, pedacos: anel(def, l, folgas.anel) });
  }
  for (const mao of ['E', 'D'] as const) {
    const def = a.pulsos[mao] ? findAcessorio(a.pulsos[mao]!) : undefined;
    if (!def) continue;
    const folga = folgas.pulso;
    if (def.tipo === 'pulseira') out.push({ id: def.id, osso: L.pulso.osso, mao, pedacos: pulseira(def, L.pulso, folga) });
    else if (def.tipo === 'relogio') out.push({ id: def.id, osso: L.pulso.osso, mao, pedacos: relogio(def, L.pulso, folga, mao) });
  }
  return out;
}

/** O espelho do lado direito (a peça é desenhada do lado esquerdo). */
export const ESPELHO = new THREE.Matrix4().makeScale(-1, 1, 1);

/** As medidas dos laços, para conferir de fora (os testes): o raio médio de cada dedo e do pulso. */
export function medidasDosLacos(): { dedos: number[]; pulso: number; centros: V3[] } {
  const L = osLacos();
  const media = (l: Laco) => l.raios.reduce((s, r) => s + r, 0) / N;
  return { dedos: L.dedos.map(media), pulso: media(L.pulso), centros: [...L.dedos, L.pulso].map((l) => l.centro.toArray() as V3) };
}
