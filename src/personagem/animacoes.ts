/**
 * As animações de braços e dedos do personagem à mesa.
 *
 * Cada animação é uma trilha de chaves por mão. Uma chave diz como estão os dedos, para onde a mão
 * olha e *onde um ponto dela deve cair* — a pinça em cima da pilha de fichas, a ponta do dedo
 * batendo na mesa, a mão inteira descansando no tampo. O boneco acha onde pôr o punho para isso
 * (src/personagem/boneco.ts), e entre as chaves a mão segue uma curva contínua. Depois, a cada
 * quadro, o braço é resolvido para o punho chegar lá, e se algum dedo entrar na mesa a mão sobe.
 *
 * As animações: colocar fichas, virar cartas, olhar as cartas, entregar cartas (para qualquer ponto
 * da mesa), abrir as cartas da mesa como dealer, desistir da mão, brincar com uma ficha, três jeitos
 * de dar check e quatro de descansar as mãos.
 *
 * As fichas e as cartas não têm física: cada animação diz onde elas estão a cada instante (na
 * mesa, presas à pinça de uma mão, ou voando numa curva escrita à mão).
 *
 * "D" é a mão direita do personagem (x < 0) e "E" a esquerda. O personagem olha para +z; a mesa
 * fica à frente dele, com o tampo na altura MESA.
 */
import * as THREE from 'three';
import { COTOVELO_PARA, MESA, type Ancora, type Boneco, type Dedos } from './boneco';
import { LADOS, NOMES_DOS_DEDOS, type Lado } from './esqueleto';

export interface Objeto {
  tipo: 'ficha' | 'carta' | 'baralho';
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  cor?: number;
  /** Numa entrega: qual das cartas pedidas é esta (a primeira é a 0), se já parou na mesa, e se parou de frente para cima. */
  n?: number;
  pousada?: boolean;
  aberta?: boolean;
}
export interface EstadoDaMao {
  punho: THREE.Vector3;
  dedos: THREE.Vector3;
  palma: THREE.Vector3;
  f: Dedos;
}
type Trilha = (t: number) => EstadoDaMao;
export interface Clipe {
  id: string;
  nome: string;
  /** A duração, em segundos; a animação recomeça do início. */
  dur: number;
  E: Trilha;
  D: Trilha;
  /** Para onde o cotovelo de cada braço prefere apontar nesta animação (dito como para o braço esquerdo). */
  cotovelo?: Partial<Record<Lado, THREE.Vector3>>;
  /** Mexidas por cima da trilha (um dedo que batuca, a respiração). */
  ajuste?: (t: number, maos: Record<Lado, EstadoDaMao>) => void;
  /** As fichas e cartas neste instante (com o boneco já posado). */
  objetos?: (t: number, b: Boneco) => Objeto[];
}

// ─────────────────────────────── medidas ───────────────────────────────

export const FICHA = { raio: 0.0195, alto: 0.0033 };
export const CARTA = { larg: 0.063, comp: 0.088, alto: 0.0006 };
export const BARALHO = { alto: 0.014 };

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** Um ponto em cima da mesa, `alto` metros acima do tampo. */
const naMesa = (x: number, z: number, alto = 0) => V(x, MESA + alto, z);
const EIXO_X = V(1, 0, 0);
const EIXO_Y = V(0, 1, 0);
const girar = (eixo: THREE.Vector3, ang: number) => new THREE.Quaternion().setFromAxisAngle(eixo, ang);
const macio = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const entre = (de: number, ate: number, t: number) => Math.min(1, Math.max(0, (t - de) / (ate - de)));
/** Um vai-e-volta: 0 fora de [0, 1], 1 no meio. */
const pulso = (x: number) => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x) ** 2);

// ─────────────────────────── os jeitos da mão ───────────────────────────

/** Monta os 21 números dos dedos: os quatro dedos (três juntas cada), o quanto abrem, e o polegar. */
function mao(i: number[], m: number[], a: number[], n: number[], abre: number[], polegar: number[]): Dedos {
  return [...i, ...m, ...a, ...n, ...abre, ...polegar];
}
/** Espalmada na mesa (o polegar deitado nela, na altura da palma). */
const ABERTA = mao([3, 5, 4], [3, 5, 4], [3, 6, 4], [4, 6, 4], [1, 0, -1, -3], [-10, 4, 0, 0, 0]);
/** Quase espalmada, relaxada (em cima da outra mão). */
const POUSADA = mao([8, 12, 8], [9, 13, 8], [10, 14, 9], [12, 15, 9], [3, 0, -2, -6], [-10, 8, 0, 4, 4]);
/** Fechada, com o polegar reto, encostado ao lado do indicador. */
const PUNHO = mao([78, 96, 60], [82, 98, 62], [84, 98, 62], [86, 98, 62], [0, 0, 0, 0], [3, 13, 0, 2, 2]);
/**
 * Em garra, para pegar por cima uma pilha de fichas: os dedos descem pela frente dela e o polegar
 * por trás, quase deitado, as polpas à mesma altura e a um diâmetro de ficha umas das outras.
 * (Ângulos achados procurando essa distância.) E a mesma antes de fechar.
 */
const GARRA = mao([20, 40, 10], [22, 42, 10], [24, 44, 12], [26, 46, 14], [4, 0, -3, -6], [20, -10, 10, 30, 0]);
const GARRA_ABERTA = mao([12, 34, 8], [14, 36, 8], [16, 38, 10], [18, 40, 12], [6, 0, -4, -8], [20, -20, 0, 14, 0]);
/**
 * Os quatro dedos da mão que dá as cartas: recolhidos, como quem segura uma chave — a carta deita no
 * lado do indicador e o polegar a prende por cima. (O polegar é achado na hora: a polpa em cima do
 * lado do indicador, com a carta no meio.) E a mão que acabou de soltar a carta: o polegar levanta
 * e os dedos só afrouxam — se abrissem de vez, as pontas alcançariam a carta que vai saindo.
 */
const DEDOS_DE_CHAVE = [60, 85, 35, 65, 88, 36, 72, 90, 38, 76, 92, 40, 0, 0, 0, 0];
const SOLTOU = mao([40, 46, 20], [44, 50, 20], [50, 54, 22], [54, 58, 24], [2, 0, -2, -4], [20, -12, 0, 5, 5]);
/**
 * Espalmada e relaxada, com o polegar aberto para o lado, rente à mesa: ele entra por baixo da
 * beirada de uma carta e serve de apoio, enquanto a mão inteira a vira. E a mesma com os quatro
 * dedos um pouco fechados, de quem agarrou a carta.
 */
const APOIO = mao([14, 18, 10], [14, 18, 10], [16, 20, 10], [18, 22, 12], [2, 0, -2, -5], [-10, 0, 0, 0, 0]);
const AGARRA = mao([34, 44, 24], [36, 46, 24], [38, 48, 26], [40, 50, 28], [-9, -5, -4, -5], [-10, 0, 0, 0, 0]);
/** Os dedos juntos e um pouco curvos, o polegar encostado: a mão que cobre as cartas, como um telhado. */
const COBRE = mao([12, 18, 12], [14, 20, 12], [16, 22, 14], [20, 24, 14], [0, 0, 0, 0], [4, 12, 0, 6, 6]);
/**
 * Indicador e médio estendidos, o resto fechado; e os dois levantados. O polegar dobra só da metade
 * para a ponta: a base dele fica onde está.
 */
const DOIS = mao([14, 8, 5], [14, 8, 5], [80, 95, 58], [84, 95, 60], [3, -3, 0, 0], [6, 6, 0, 22, 32]);
const DOIS_NO_ALTO = mao([-10, 6, 4], [-10, 6, 4], [80, 95, 58], [84, 95, 60], [3, -3, 0, 0], [6, 6, 0, 22, 32]);
/**
 * De palma para cima, meio aberta, segurando o baralho: o polegar fica reto ao longo de um lado
 * comprido dele; o indicador fica estendido por baixo, de apoio, e os outros três passam por baixo
 * e dobram só o bastante para as pontas subirem pelo lado comprido oposto — na metade de trás
 * dele, para o canto da frente ficar livre para a mão que tira a carta. (Os ângulos, e o lugar do baralho na mão, foram achados
 * procurando a pose mais aberta em que cada ponta chega perto do lado dela, nenhuma junta entra no
 * baralho e nenhuma ponta passa do topo dele — a carta de cima sai por cima delas sem as atravessar.)
 */
const SEGURA = mao([0, 8, 5], [0, 30, 20], [0, 30, 20], [0, 30, 20], [-10, -17, -3, 6], [20, 10, 0, 0, 0]);
/** Em arco, com as pontas dos dedos na mesa (para batucar). */
const ARCO = mao([28, 38, 22], [30, 40, 22], [30, 42, 24], [30, 42, 24], [4, 0, -3, -8], [25, 0, 5, 10, 10]);
/** Meio fechada, descansando de lado. */
const CONCHA = mao([32, 40, 20], [38, 45, 22], [44, 50, 25], [50, 55, 28], [0, 0, 0, 0], [18, 8, 8, 14, 14]);
/** Dedos meio dobrados, de palma para baixo no ar (a ficha rola por cima deles). */
const PALCO = mao([20, 26, 12], [22, 28, 14], [24, 30, 14], [26, 32, 16], [5, 0, -4, -8], [20, 0, 5, 10, 10]);

// ─────────────────────────────── trilhas ───────────────────────────────

/** Como o trecho que termina na chave anda: macio nas duas pontas, reto, acelerando (uma batida) ou freando. */
type Passo = 'macio' | 'reto' | 'bate' | 'freia';
const PASSOS: Record<Passo, (x: number) => number> = {
  macio,
  reto: (x) => x,
  bate: (x) => x * x,
  freia: (x) => 1 - (1 - x) * (1 - x),
};

interface Chave {
  t: number;
  f: Dedos;
  /** Para onde os dedos apontam e para onde a palma olha (sem nada: para a frente, e para baixo). */
  dedos?: THREE.Vector3;
  palma?: THREE.Vector3;
  /** O ponto da mão que tem de cair em `em`… */
  ponto?: Ancora;
  em?: THREE.Vector3;
  /** …ou a mão descansando na mesa, com o punho em cima de (x, z). */
  apoio?: [number, number];
  /**
   * Os dedos com que se acha o lugar do punho, quando não são os da chave. Serve para a mão que
   * chega aberta e fecha no lugar (ou abre no lugar): o punho fica onde ficaria com ela fechada, e
   * só os dedos se mexem.
   */
  como?: Dedos;
  passo?: Passo;
}

/**
 * A trilha de uma mão. Entre as chaves a mão segue uma curva contínua: ela *atravessa* uma chave de
 * passagem sem parar (é o que deixa o gesto fluido), e só chega sem velocidade nas paradas — a
 * primeira e a última chave, duas chaves seguidas no mesmo lugar (pegar, pousar), e os trechos com
 * um `passo` dito (uma batida).
 */
function trilha(b: Boneco, lado: Lado, chaves: Chave[]): Trilha {
  const q = new THREE.Quaternion();
  const prontas = chaves.map((c) => {
    const dedos = (c.dedos ?? V(lado === 'E' ? -0.3 : 0.3, 0, 1)).clone().normalize();
    const palma = (c.palma ?? V(0, -1, 0)).clone().normalize();
    b.orientar(lado, dedos, palma, q);
    const punho = c.apoio ? b.apoiar(lado, c.apoio[0], c.apoio[1], q, c.como ?? c.f) : b.resolver(lado, c.ponto ?? 'punho', c.em!, q, c.como ?? c.f);
    const lugar = c.apoio ? 'apoio:' + c.apoio.join() : (c.ponto ?? 'punho') + ':' + c.em!.toArray().join();
    return { t: c.t, passo: c.passo ? PASSOS[c.passo] : undefined, lugar, numeros: [...punho.toArray(), ...dedos.toArray(), ...palma.toArray(), ...c.f] };
  });
  const n = prontas.length;
  const parada = (i: number) =>
    i === 0 || i === n - 1 || !!prontas[i].passo || !!prontas[i + 1].passo || prontas[i].lugar === prontas[i - 1].lugar || prontas[i].lugar === prontas[i + 1].lugar;
  /** A velocidade de cada número ao passar por cada chave: a da reta entre as vizinhas, ou zero numa parada. */
  const veloc = prontas.map((c, i) => (parada(i) ? c.numeros.map(() => 0) : c.numeros.map((_, k) => (prontas[i + 1].numeros[k] - prontas[i - 1].numeros[k]) / (prontas[i + 1].t - prontas[i - 1].t))));
  return (t) => {
    let i = 0;
    while (i < n - 2 && t > prontas[i + 1].t) i++;
    const a = prontas[i];
    const z = prontas[Math.min(i + 1, n - 1)];
    const h = z.t - a.t;
    const u = h > 0 ? entre(a.t, z.t, t) : 0;
    let x: number[];
    if (z.passo) {
      const w = z.passo(u);
      x = a.numeros.map((v, k) => v + (z.numeros[k] - v) * w);
    } else {
      const u2 = u * u;
      const u3 = u2 * u;
      const va = veloc[i];
      const vz = veloc[Math.min(i + 1, n - 1)];
      x = a.numeros.map((v, k) => (2 * u3 - 3 * u2 + 1) * v + (u3 - 2 * u2 + u) * h * va[k] + (3 * u2 - 2 * u3) * z.numeros[k] + (u3 - u2) * h * vz[k]);
    }
    return { punho: V(x[0], x[1], x[2]), dedos: V(x[3], x[4], x[5]).normalize(), palma: V(x[6], x[7], x[8]).normalize(), f: x.slice(9) };
  };
}

/** Posa uma mão do boneco (os dedos e o braço) num estado. O corpo já tem de estar posado. */
function posar(b: Boneco, lado: Lado, m: EstadoDaMao, cotovelo?: THREE.Vector3) {
  b.dedos(lado, m.f);
  const q = b.orientar(lado, m.dedos, m.palma);
  b.braco(lado, m.punho, q, cotovelo);
  return q;
}

/**
 * Uma chave com o punho reto e a palma para baixo, inclinada: os dedos apontam exatamente para onde
 * o antebraço aponta, e a mão gira em volta deles de `inclina` radianos, subindo o lado do polegar.
 * (Como em `dePunhoReto`, a conta é repetida até assentar.)
 */
function deCimaDePunhoReto(b: Boneco, lado: Lado, chave: Chave, inclina: number, cotovelo?: THREE.Vector3): Chave {
  const s = lado === 'E' ? 1 : -1;
  let rumo = V(-0.6 * s, 0, 0.8);
  let pronta = chave;
  for (let i = 0; i < 6; i++) {
    rumo.normalize();
    pronta = { ...chave, dedos: rumo.clone(), palma: V(0, -1, 0).applyAxisAngle(rumo, -s * inclina) };
    b.zerar();
    b.raiz.updateMatrixWorld(true);
    posar(b, lado, trilha(b, lado, [pronta, { ...pronta, t: pronta.t + 1 }])(pronta.t), cotovelo);
    rumo = b.ancora(lado, 'punho').sub(new THREE.Vector3().setFromMatrixPosition(b.osso('antebraco.' + lado).matrixWorld));
  }
  return pronta;
}

/** Posa uma mão e, se ela entrar na mesa, sobe-a até encostar. */
function posarNaMesa(b: Boneco, lado: Lado, m: EstadoDaMao, cotovelo?: THREE.Vector3) {
  const q = posar(b, lado, m, cotovelo);
  const folga = b.folga(lado);
  if (folga < 0) {
    m.punho.y -= folga;
    b.braco(lado, m.punho, q, cotovelo);
  }
}

/** Onde uma carta fica dentro de uma mão: a posição e a rotação dela vistas do osso da mão. */
interface NaMao {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
}

/** Até onde vai cada um dos cinco ângulos do polegar (opõe, fecha e as três dobras). */
const LIMITES_DO_POLEGAR: [number, number][] = [
  [-30, 70],
  [-40, 45],
  [-30, 25],
  [0, 70],
  [0, 60],
];

/**
 * Acha os cinco ângulos do polegar que põem a polpa dele em `alvo` (um ponto visto do osso da mão),
 * com os outros dedos em `f`. Devolve os ângulos e o quanto faltou. (Procura numa grade grossa e
 * depois afina; entre duas soluções parecidas, fica a de ângulos mais calmos.) `pena`, se dada, é
 * chamada com o polegar já posado e soma ao custo — serve para ele não entrar em alguma coisa. E
 * `ponto`, se dado, diz que ponto do polegar (no mundo) deve ir ao alvo, em vez da polpa; e
 * `partida`, de que ângulos começar a procura (os do instante anterior, numa sequência).
 */
function polegarEm(b: Boneco, lado: Lado, f: Dedos, alvo: THREE.Vector3, pena?: () => number, ponto?: () => THREE.Vector3, partida?: number[]): { ang: number[]; falta: number } {
  const osso = b.osso('mao.' + lado);
  osso.updateWorldMatrix(true, false);
  const falta = (a: number[]) => {
    b.dedos(lado, [...f.slice(0, 16), ...a]);
    osso.updateWorldMatrix(false, true);
    return osso.worldToLocal(ponto ? ponto() : b.ancora(lado, 'ponta_p')).distanceTo(alvo);
  };
  const custo = (a: number[]) => falta(a) + (pena ? pena() : 0) + 0.00002 * (Math.abs(a[0]) + Math.abs(a[1]) + 2 * Math.abs(a[2]) + a[3] + a[4]);
  let melhor = partida ?? [20, 0, 0, 10, 10];
  let nota = custo(melhor);
  const tenta = (a: number[]) => {
    const n = custo(a);
    if (n < nota) {
      nota = n;
      melhor = a;
    }
  };
  // (com um ponto de partida — o jeito do quadro anterior — só se afina a partir dele: o polegar não pula de um jeito para outro)
  if (!partida) for (const o of [-20, 0, 20, 40, 60]) for (const fe of [-30, -15, 0, 15, 30, 45]) for (const c1 of [-20, 0, 20]) for (const c2 of [0, 20, 40, 60]) for (const c3 of [0, 20, 40]) tenta([o, fe, c1, c2, c3]);
  for (const passo of [8, 4, 2, 1]) {
    for (let volta = 0; volta < 3; volta++) {
      for (let k = 0; k < 5; k++) {
        for (const sinal of [-1, 1]) {
          const a = [...melhor];
          a[k] = Math.min(LIMITES_DO_POLEGAR[k][1], Math.max(LIMITES_DO_POLEGAR[k][0], a[k] + sinal * passo));
          tenta(a);
        }
      }
    }
  }
  return { ang: melhor, falta: falta(melhor) };
}

/**
 * Uma chave com o punho reto e a mão de lado: os dedos apontam para onde o antebraço aponta, e o
 * polegar fica para o lado de `normal` (para cima, em geral). `desvio` dobra o punho, em radianos:
 * positivo para dentro (para o meio do corpo), negativo para fora. Como a direção do antebraço
 * depende de onde a mão fica, e esta de para onde a mão aponta, a conta é repetida até assentar.
 */
function dePunhoReto(b: Boneco, lado: Lado, chave: Chave, normal: THREE.Vector3, desvio = 0, cotovelo?: THREE.Vector3): Chave {
  const s = lado === 'E' ? 1 : -1;
  let rumo = V(-0.6 * s, 0, 0.8);
  let pronta = chave;
  for (let i = 0; i < 6; i++) {
    rumo.addScaledVector(normal, -normal.dot(rumo)).normalize();
    const dedos = rumo.clone().applyAxisAngle(normal, -s * desvio);
    pronta = { ...chave, dedos, palma: normal.clone().cross(dedos).multiplyScalar(-s) };
    b.zerar();
    b.raiz.updateMatrixWorld(true);
    posar(b, lado, trilha(b, lado, [pronta, { ...pronta, t: pronta.t + 1 }])(pronta.t), cotovelo);
    rumo = b.ancora(lado, 'punho').sub(new THREE.Vector3().setFromMatrixPosition(b.osso('antebraco.' + lado).matrixWorld));
  }
  return pronta;
}

/** A carta no mundo, dada a mão (já posada) e onde ela fica dentro da mão. */
function cartaNoMundo(b: Boneco, lado: Lado, naMao: NaMao): { pos: THREE.Vector3; quat: THREE.Quaternion } {
  const osso = b.osso('mao.' + lado);
  return { pos: osso.localToWorld(naMao.pos.clone()), quat: osso.getWorldQuaternion(new THREE.Quaternion()).multiply(naMao.quat) };
}

/** A mão descansando espalmada na mesa, no lugar de sempre. */
const descanso = (lado: Lado, t: number): Chave => ({ t, apoio: [lado === 'E' ? 0.17 : -0.17, 0.31], f: ABERTA });
const parada = (b: Boneco, lado: Lado, dur: number) => trilha(b, lado, [descanso(lado, 0), descanso(lado, dur)]);

/** Um retângulo no tampo, visto do lugar do jogador (metros): de x0 a x1, de z0 a z1. */
export interface Retangulo {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** O tamanho com que uma carta aberta aparece no jogo (a 2D que toma o lugar da de verdade é um pouco maior). */
export const CARTA_ABERTA = { larg: 0.072, comp: 0.1008 };
/** Onde as duas cartas ficam abertas ao fim de "virar as duas cartas": o meio de cada uma, visto do lugar. */
export const ABERTAS_AO_VIRAR: [number, number][] = [
  [-0.0395, 0.473],
  [0.0455, 0.476],
];

/** O retângulo que cartas abertas com o meio em `centros` ocupam. */
export function retanguloDasCartas(centros: [number, number][] = ABERTAS_AO_VIRAR): Retangulo {
  const xs = centros.map((c) => c[0]);
  const zs = centros.map((c) => c[1]);
  return { x0: Math.min(...xs) - CARTA_ABERTA.larg / 2, x1: Math.max(...xs) + CARTA_ABERTA.larg / 2, z0: Math.min(...zs) - CARTA_ABERTA.comp / 2, z1: Math.max(...zs) + CARTA_ABERTA.comp / 2 };
}

/**
 * O quanto uma mão do boneco (posado) está em cima de um retângulo do tampo, olhando de cima: a
 * maior distância que alguma parte dela — os dedos, a palma, o punho e o antebraço — entra nele
 * (negativo: o quanto falta para chegar). As cartas abertas do jogo são 2D, desenhadas por cima de
 * tudo o que é 3D: uma mão em cima delas aparece *debaixo* delas.
 */
export function sobreORetangulo(b: Boneco, lado: Lado, r: Retangulo): number {
  let maior = -Infinity;
  const ve = (x: number, z: number, raio: number) => {
    maior = Math.max(maior, Math.min(x + raio - r.x0, r.x1 - (x - raio), z + raio - r.z0, r.z1 - (z - raio)));
  };
  for (const e of b.esferasNoMundo(lado)) ve(e.p.x, e.p.z, e.r);
  // o antebraço: do punho ao cotovelo
  const punho = b.ancora(lado, 'punho');
  const cotovelo = new THREE.Vector3().setFromMatrixPosition(b.osso('antebraco.' + lado).matrixWorld);
  for (let k = 1; k <= 6; k++) ve(punho.x + ((cotovelo.x - punho.x) * k) / 6, punho.z + ((cotovelo.z - punho.z) * k) / 6, 0.026 + 0.012 * (k / 6));
  return maior;
}

/** A folga que as mãos guardam das cartas abertas (m). */
const FOLGA_DAS_ABERTAS = 0.012;
const foras = new WeakMap<Boneco, Map<string, Record<Lado, Chave>>>();

/**
 * O descanso de quem tem cartas abertas na frente: as mãos espalmadas na mesa, cada uma do seu lado,
 * fora do retângulo `fora` (com uma folga). Procura-se o lugar mais perto do descanso de sempre em
 * que nem a mão nem o antebraço ficam em cima dele — primeiro só abrindo as mãos para os lados,
 * depois também trazendo-as para perto do corpo —, com os dedos apontando para onde o punho dobra menos.
 */
function maosFora(b: Boneco, fora: Retangulo): Record<Lado, Chave> {
  const chave = [fora.x0, fora.x1, fora.z0, fora.z1].map((v) => v.toFixed(3)).join();
  let guardadas = foras.get(b);
  if (!guardadas) foras.set(b, (guardadas = new Map()));
  const ja = guardadas.get(chave);
  if (ja) return ja;
  const de = (lado: Lado): Chave => {
    const s = lado === 'E' ? 1 : -1;
    let melhor: { chave: Chave; custo: number } | null = null;
    for (const z of [0.31, 0.28, 0.25, 0.22]) {
      for (let x = 0.17; x <= 0.321; x += 0.01) {
        for (const paraDentro of [0.3, 0.15, 0, -0.15]) {
          const c: Chave = { t: 0, apoio: [s * x, z], f: ABERTA, dedos: V(-paraDentro * s, 0, 1) };
          b.zerar();
          b.raiz.updateMatrixWorld(true);
          const m = trilha(b, lado, [c, { ...c, t: 1 }])(0);
          posar(b, lado, m);
          const em = sobreORetangulo(b, lado, fora) + FOLGA_DAS_ABERTAS;
          // (o punho: o quanto os dedos saem da linha do antebraço)
          const antebraco = b.ancora(lado, 'punho').sub(new THREE.Vector3().setFromMatrixPosition(b.osso('antebraco.' + lado).matrixWorld)).normalize();
          const dobra = antebraco.angleTo(m.dedos);
          const alcanca = b.ancora(lado, 'punho').distanceTo(m.punho) < 0.001;
          // perto do descanso de sempre, de punho reto; em cima das cartas ou fora de alcance custa caro
          const custo = Math.hypot(x - 0.17, (z - 0.31) * 1.6) + dobra * 0.06 + Math.max(0, em) * 40 + (alcanca ? 0 : 10);
          if (!melhor || custo < melhor.custo) melhor = { chave: c, custo };
        }
      }
    }
    return melhor!.chave;
  };
  const r = { E: de('E'), D: de('D') };
  guardadas.set(chave, r);
  return r;
}

/** O descanso de uma mão num gesto: o de sempre, ou — com `fora` — o de quem tem cartas abertas na frente. */
const repousoDe = (b: Boneco, fora?: Retangulo) => {
  const f = fora ? maosFora(b, fora) : null;
  return (lado: Lado, t: number): Chave => (f ? { ...f[lado], t } : descanso(lado, t));
};

/** A respiração: as mãos sobem e descem um nada, cada uma no seu tempo. */
function respirar(t: number, maos: Record<Lado, EstadoDaMao>, dur: number) {
  maos.E.punho.y += 0.0011 * Math.sin((2 * Math.PI * t) / dur);
  maos.D.punho.y += 0.0011 * Math.sin((2 * Math.PI * t) / dur + 1.1);
}

// ─────────────────────────────── as animações ───────────────────────────────

/**
 * Colocar fichas na mesa: a mão vai até a pilha, fecha num punhado de cima dela, leva-o à frente
 * num arco só e pousa. Só para onde pega e onde pousa; o resto é um movimento contínuo.
 */
function fichas(b: Boneco): Clipe {
  const dur = 3.8;
  const pilha = naMesa(-0.3, 0.36);
  const aposta = naMesa(-0.07, 0.53);
  const NA_PILHA = 8;
  const LEVA = 5;
  const meio = (LEVA * FICHA.alto) / 2;
  /** A pinça segura o punhado um pouco acima do meio dele. */
  const pega = pilha.clone().setY(MESA + NA_PILHA * FICHA.alto + meio + 0.004);
  const larga = aposta.clone().setY(MESA + meio + 0.004);
  const frente = V(0, 0, 1);
  const quase = V(0.15, 0, 1);
  const PEGOU = 1.05;
  const LARGOU = 2.12;
  const D = trilha(b, 'D', [
    descanso('D', 0),
    { t: 0.58, ponto: 'pinca3', em: pega.clone().add(V(0.012, 0.035, -0.012)), f: GARRA_ABERTA, como: GARRA, dedos: frente },
    { t: 0.88, ponto: 'pinca3', em: pega, f: GARRA_ABERTA, como: GARRA, dedos: frente },
    { t: PEGOU, ponto: 'pinca3', em: pega, f: GARRA, dedos: frente },
    { t: 2.05, ponto: 'pinca3', em: larga, f: GARRA, dedos: quase },
    { t: 2.24, ponto: 'pinca3', em: larga, f: GARRA_ABERTA, como: GARRA, dedos: quase },
    descanso('D', 3.3),
    descanso('D', dur),
  ]);
  return {
    id: 'fichas',
    nome: 'Colocar fichas',
    dur,
    E: parada(b, 'E', dur),
    D,
    // a ida e a volta são um movimento só cada uma; o arco (a mão sobe e desce no caminho) entra por cima
    ajuste: (t, maos) => {
      maos.D.punho.y += 0.075 * Math.sin(Math.PI * entre(PEGOU, 2.05, t)) ** 2 + 0.035 * Math.sin(Math.PI * entre(2.24, 3.3, t)) ** 2;
    },
    objetos: (t, bo) => {
      const objs: Objeto[] = [];
      const ficha = (base: THREE.Vector3, i: number, cor: number) => objs.push({ tipo: 'ficha', pos: base.clone().add(V(0, (i + 0.5) * FICHA.alto, 0)), quat: new THREE.Quaternion(), cor });
      for (let i = 0; i < NA_PILHA; i++) ficha(pilha, i, i % 2 ? 0xc8324a : 0xd94a5e);
      // o punhado: em cima da pilha, depois preso à pinça, depois pousado
      let base: THREE.Vector3;
      if (t < PEGOU) base = pilha.clone().add(V(0, NA_PILHA * FICHA.alto, 0));
      else if (t < LARGOU) base = bo.ancora('D', 'pinca3').add(V(0, -meio - 0.004, 0));
      else base = aposta;
      for (let i = 0; i < LEVA; i++) ficha(base, i, i % 2 ? 0xc8324a : 0xd94a5e);
      return objs;
    },
  };
}

/**
 * Virar cartas: cada mão põe o polegar por baixo da beirada de baixo da carta dela (a do lado do
 * jogador) — é só o apoio, ele não se mexe —, os outros dedos fecham um pouco, de quem agarra, e a
 * mão inteira faz a virada: sobe, avança
 * e gira o punho (o lado do polegar sobe), levando a beirada por cima até passar do alto. Aí a
 * carta tomba sozinha para a frente, de frente para cima. A esquerda vai um nada atrasada.
 */
function virar(b: Boneco): Clipe {
  const dur = 4;
  const VIRADA = 0.85;
  /** Até que ponto da virada a mão leva a carta (uns 100°); dali em diante ela tomba sozinha. */
  const LEVA = 0.54;
  /** O quanto o punho gira (radianos) e o quanto os dedos descem, no fim da levada. */
  const ROLA = 0.75;
  const DESCE = 0.08;
  /** A que distância do meio da carta (para o lado de fora) o polegar a apoia: perto do canto, para os outros dedos passarem por fora dela. */
  const NA_BEIRADA = 0.023;
  /** Para onde os dedos apontam, de lado: um nada para fora, para as pontas não ficarem no caminho da carta que tomba. */
  const PARA_FORA = 0.05;
  const lados = LADOS.map((lado) => {
    const s = lado === 'E' ? 1 : -1;
    const t0 = 1.0 + (lado === 'E' ? 0.08 : 0);
    const centro = naMesa(0.04 * s, 0.47);
    const deCima = centro.z + CARTA.comp / 2;
    /** Onde o polegar apoia a carta a meio da virada `u`: por baixo dela, um pouco para dentro da beirada de baixo, que sobe girando em volta da de cima. */
    const apoio = (u: number) => {
      const ang = Math.PI * macio(u);
      const raio = CARTA.comp - 0.006;
      return V(centro.x + NA_BEIRADA * s, MESA + raio * Math.sin(ang) - 0.003 * Math.cos(ang), deCima - raio * Math.cos(ang) - 0.003 * Math.sin(ang));
    };
    /** A mão a meio da virada: o lado do polegar sobe e os dedos descem um pouco. */
    const jeito = (u: number) => {
      const k = macio(Math.min(1, u / LEVA));
      return { dedos: V(PARA_FORA * s, -DESCE * k, 1), palma: V(-s * Math.sin(ROLA * k), -Math.cos(ROLA * k), 0) };
    };
    const chaves: Chave[] = [
      descanso(lado, 0),
      { t: t0 - 0.45, ponto: 'ponta_p', em: apoio(0).add(V(0, 0.012, -0.03)), f: APOIO, ...jeito(0) },
      // o polegar chega por baixo da beirada com a mão aberta, e os outros dedos fecham um pouco, agarrando
      { t: t0 - 0.22, ponto: 'ponta_p', em: apoio(0), f: APOIO, ...jeito(0) },
      { t: t0, ponto: 'ponta_p', em: apoio(0), f: AGARRA, como: APOIO, ...jeito(0) },
    ];
    for (let i = 1; i <= 6; i++) chaves.push({ t: t0 + (VIRADA * LEVA * i) / 6, ponto: 'ponta_p', em: apoio((LEVA * i) / 6), f: AGARRA, como: APOIO, ...jeito((LEVA * i) / 6) });
    // largou: a mão sai para trás levantando os dedos (a carta tomba para a frente), e depois desce desvirando o punho
    const largou = t0 + VIRADA * LEVA;
    chaves.push({ t: largou + 0.14, ponto: 'ponta_p', em: apoio(LEVA).add(V(0, 0.012, -0.055)), f: APOIO, dedos: V(PARA_FORA * s, 0.32, 1), palma: V(-s * Math.sin(ROLA * 0.6), -Math.cos(ROLA * 0.6), 0) });
    chaves.push({ t: largou + 0.45, ponto: 'ponta_p', em: apoio(LEVA).add(V(0, -0.045, -0.095)), f: APOIO, ...jeito(0) });
    chaves.push(descanso(lado, 3.1), descanso(lado, dur));
    return { t0, centro, deCima, trilha: trilha(b, lado, chaves) };
  });
  return {
    id: 'virar',
    nome: 'Virar cartas',
    dur,
    E: lados[0].trilha,
    D: lados[1].trilha,
    objetos: (t) =>
      lados.map((l): Objeto => {
        const ang = Math.PI * macio(entre(l.t0, l.t0 + VIRADA, t));
        return { tipo: 'carta', pos: V(l.centro.x, MESA + CARTA.alto + (CARTA.comp / 2) * Math.sin(ang), l.deCima - (CARTA.comp / 2) * Math.cos(ang)), quat: girar(EIXO_X, ang) };
      }),
  };
}

/** Como as duas cartas se abrem ao virar a pilha. */
export interface ViradaDaPilha {
  /** O quanto a carta de cima escorrega para o lado enquanto as duas tombam (m): cai meio de lado, com uma tira dela para fora da outra. */
  cai: number;
  /** Onde as duas ficam no fim, abertas lado a lado: o quanto cada uma é arrastada para o seu lado (m). */
  abre: [number, number];
  /** O quanto cada uma torce ao ser arrastada (radianos). */
  torce: number;
}

export const VIRADA_DA_PILHA: ViradaDaPilha = { cai: 0.03, abre: [-0.0095, 0.0365], torce: 0.07 };

/** Em que instante de "virar as duas cartas" elas ficam abertas, lado a lado (as mãos acabaram de afastá-las). */
export const VIRAR_ABERTAS = 2.24;

/**
 * Virar as duas cartas de uma vez, de onde elas ficam paradas na frente do jogador — empilhadas, a
 * de cima um pouco torta: as de "olhar as cartas". As mãos não largam as cartas de longe:
 *  - a direita põe o polegar por baixo da beirada de cá da pilha, os outros dedos fecham um pouco, e
 *    a mão leva a beirada por cima até passar do alto (é a virada de `virar`, com uma mão só);
 *  - as duas tombam para a frente, de frente para cima, e a mão vai junto, por cima delas: quando
 *    pousam, as pontas dos dedos pousam em cima da que ficou por cima;
 *  - a esquerda chega ao mesmo tempo e pousa as pontas dos dedos na tira da outra carta que sobrou
 *    para fora; e as duas mãos as afastam, cada uma arrastando a sua, até ficarem lado a lado.
 *
 * As cartas só contam como abertas (`aberta`) quando as mãos já saíram de cima delas: no jogo é aí
 * que as cartas 2D tomam o lugar das de verdade, e as 2D ficam por cima de qualquer mão. Com `fora`
 * (o retângulo das cartas abertas), as mãos não voltam ao descanso de sempre — que fica em cima
 * delas —, e sim ao de `idleAbertas`, cada uma do seu lado.
 */
export function virarAPilha(b: Boneco, { cai, abre, torce }: ViradaDaPilha = VIRADA_DA_PILHA, id = 'virar-pilha', nome = 'Virar as duas cartas', fora?: Retangulo): Clipe {
  const dur = 3.3;
  const repouso = repousoDe(b, fora);
  const VIRADA = 0.85;
  /** Até que ponto da virada a mão leva as cartas (uns 100°); dali em diante elas tombam, e a mão vai por cima. */
  const LEVA = 0.54;
  const ROLA = 0.75;
  const DESCE = 0.04;
  /** A que distância do meio da pilha (para o lado de fora) o polegar a apoia: por baixo das duas cartas. */
  const NA_BEIRADA = 0.026;
  /** Para onde os dedos apontam, de lado: para dentro, que é para onde o antebraço aponta aqui, perto do corpo (o punho fica reto). */
  const PARA_DENTRO = 0.25;
  const t0 = 1.0;
  const T = { pousam: t0 + VIRADA, toca: 1.92, parte: 1.99, abertas: VIRAR_ABERTAS, larga: 2.34 };
  // as duas cartas, como em `olhar`: uma em cima da outra, a de cima um pouco torta
  const centro = naMesa(-0.03, 0.385);
  const bases = [
    { pos: V(centro.x, MESA + CARTA.alto / 2, centro.z), giro: 0, cai: 0 },
    { pos: V(centro.x + 0.009, MESA + CARTA.alto * 1.5, centro.z - 0.003), giro: 0.12, cai },
  ];
  const deCima = centro.z + CARTA.comp / 2;
  /** As duas giram juntas em volta da beirada de lá da de baixo (a meia altura da pilha: viradas, a de cima fica por baixo). */
  const PIVO = V(centro.x, MESA + CARTA.alto, deCima);
  /** Uma carta a meio da virada `ang`, e escorregada de `lado` para a esquerda. */
  const virada = (c: (typeof bases)[number], ang: number, lado: number) => {
    const pos = PIVO.clone().add(c.pos.clone().sub(PIVO).applyAxisAngle(EIXO_X, ang));
    pos.x += lado;
    return pos;
  };
  /** Onde cada uma pousa (aberta, ainda meio em cima da outra) e onde fica depois de arrastada. */
  const pousada = bases.map((c) => virada(c, Math.PI, c.cai));
  const aberta = pousada.map((p, i) => p.clone().add(V(abre[i], 0, 0)));

  const apoio = (u: number) => {
    const ang = Math.PI * macio(u);
    const raio = CARTA.comp - 0.006;
    return V(centro.x - NA_BEIRADA, MESA + raio * Math.sin(ang) - 0.003 * Math.cos(ang), deCima - raio * Math.cos(ang) - 0.003 * Math.sin(ang));
  };
  const jeito = (u: number) => {
    const k = macio(Math.min(1, u / LEVA));
    return { dedos: V(PARA_DENTRO, -DESCE * k, 1), palma: V(Math.sin(ROLA * k), -Math.cos(ROLA * k), 0) };
  };
  /** As pontas dos dedos de uma mão em cima de uma carta aberta (de palma para baixo, punho reto, em arco), `fora` metros para o lado de fora do meio dela. */
  const sobre = (lado: Lado, t: number, carta: THREE.Vector3, fora: number, sobe = 0, f: Dedos = ARCO) =>
    deCimaDePunhoReto(b, lado, { t, ponto: 'dedos', em: V(carta.x + (lado === 'E' ? fora : -fora), MESA + CARTA.alto * 2 + 0.0012 + sobe, carta.z - 0.004), f }, 0);
  const largou = t0 + VIRADA * LEVA;
  const chavesD: Chave[] = [
    descanso('D', 0),
    { t: t0 - 0.45, ponto: 'ponta_p', em: apoio(0).add(V(0, 0.012, -0.03)), f: APOIO, ...jeito(0) },
    { t: t0 - 0.22, ponto: 'ponta_p', em: apoio(0), f: APOIO, ...jeito(0) },
    { t: t0, ponto: 'ponta_p', em: apoio(0), f: AGARRA, como: APOIO, ...jeito(0) },
  ];
  for (let i = 1; i <= 6; i++) chavesD.push({ t: t0 + (VIRADA * LEVA * i) / 6, ponto: 'ponta_p', em: apoio((LEVA * i) / 6), f: AGARRA, como: APOIO, ...jeito((LEVA * i) / 6) });
  // largou: a mão levanta os dedos e sai um nada para trás (as cartas tombam para a frente, por onde
  // eles estavam); e, em vez de voltar ao descanso, desvira o punho e vai por cima delas, descendo com elas
  chavesD.push(
    { t: largou + 0.13, ponto: 'ponta_p', em: apoio(LEVA).add(V(0, 0.03, -0.045)), f: APOIO, dedos: V(PARA_DENTRO, 0.32, 1), palma: V(Math.sin(ROLA * 0.6), -Math.cos(ROLA * 0.6), 0) },
    sobre('D', T.pousam - 0.09, pousada[0], 0.03, 0.06, POUSADA),
    sobre('D', T.toca, pousada[0], 0.03),
    sobre('D', T.parte, pousada[0], 0.03),
    sobre('D', T.abertas, aberta[0], 0.03),
    sobre('D', T.larga, aberta[0], 0.03),
    sobre('D', T.larga + 0.16, aberta[0], 0.03, 0.04, POUSADA),
    repouso('D', 2.95),
    repouso('D', dur),
  );
  // a esquerda: espera, vem por cima e pousa na tira da outra carta que ficou para fora
  const chavesE: Chave[] = [
    descanso('E', 0),
    descanso('E', 1.32),
    sobre('E', T.pousam - 0.14, pousada[1], 0.03, 0.07, POUSADA),
    sobre('E', T.toca + 0.02, pousada[1], 0.03),
    sobre('E', T.parte, pousada[1], 0.03),
    sobre('E', T.abertas, aberta[1], 0.03),
    sobre('E', T.larga, aberta[1], 0.03),
    sobre('E', T.larga + 0.16, aberta[1], 0.03, 0.04, POUSADA),
    repouso('E', 2.95),
    repouso('E', dur),
  ];
  const E = trilha(b, 'E', chavesE);
  const D = trilha(b, 'D', chavesD);
  // quando as mãos acabam de sair de cima das cartas abertas (é quando elas passam a contar como abertas)
  const ondeFicam = retanguloDasCartas(aberta.map((a) => [a.x, a.z] as [number, number]));
  let livres = T.larga + 0.45;
  for (let t = dur; t >= T.larga; t -= 0.02) {
    b.zerar();
    b.raiz.updateMatrixWorld(true);
    posar(b, 'E', E(t));
    posar(b, 'D', D(t));
    if (Math.max(sobreORetangulo(b, 'E', ondeFicam), sobreORetangulo(b, 'D', ondeFicam)) > 0.002) break;
    livres = t;
  }
  return {
    id,
    nome,
    dur,
    E,
    D,
    objetos: (t) => {
      const u = entre(t0, T.pousam, t);
      const ang = Math.PI * macio(u);
      // (largadas, a de cima escorrega um pouco de lado; pousadas, cada mão arrasta a sua — no passo das mãos, que saem e chegam paradas)
      const solta = macio(entre(LEVA, 1, u));
      const arrasta = macio(entre(T.parte, T.abertas, t));
      return bases.map((c, i): Objeto => {
        const pos = virada(c, ang, c.cai * solta).add(V(abre[i] * arrasta, 0, 0));
        const lado = i === 0 ? -1 : 1;
        return { tipo: 'carta', n: i, aberta: t >= livres, pos, quat: girar(EIXO_Y, lado * torce * arrasta).multiply(girar(EIXO_X, ang)).multiply(girar(EIXO_Y, c.giro)) };
      });
    },
  };
}

/** O que se pode acertar na espiada das cartas. */
export interface Espiada {
  /** O quanto a beirada de cá das cartas sobe (graus). */
  levanta: number;
  /** O quanto a mão que levanta fica arqueada: o quanto os dedos apontam para baixo. */
  arco: number;
  /** O quanto a mão que esconde fica inclinada (graus): 0 = de palma para baixo, 90 = de lado. */
  inclina: number;
  /** O quanto o punho da mão que levanta fica reto: 0 = a mão aponta para a frente (o punho dobra), 1 = a mão na linha do antebraço. */
  reto: number;
}
export const ESPIADA: Espiada = { levanta: 20, arco: 0.22, inclina: 32, reto: 0.7 };

/**
 * Olhar as cartas, por baixo, como no poker. As duas cartas ficam de costas na mesa, à frente do
 * jogador. A direita se arqueia por cima delas: as pontas dos dedos seguram o lado de lá contra a
 * mesa e o polegar entra por baixo da beirada de cá e a puxa para cima — as cartas giram em volta
 * da beirada de lá, só o bastante para se ver o canto. A esquerda vem pelo lado e por cima, de
 * punho reto e um pouco inclinada, e cobre as cartas e a outra mão: é ela que esconde. Depois o
 * polegar solta, as cartas deitam e as mãos voltam.
 */
export function olhar(b: Boneco, { levanta, arco, inclina, reto }: Espiada = ESPIADA): Clipe {
  const dur = 4.8;
  const T = { chega: 1.0, alto: 1.55, espia: 2.2, baixa: 2.75, deita: 3.2 };
  /** Quanto tempo o polegar leva para entrar por baixo da beirada (e para sair). */
  const ENTRA = 0.24;
  const TETO = (levanta * Math.PI) / 180;
  /** O raio da ponta do polegar, e o quanto ela entra por baixo das cartas, a contar da beirada. */
  const RAIO = 0.0052;
  const POR_BAIXO = 0.006;
  /** A altura do meio da ponta do polegar enquanto ele entra por baixo da beirada: o mais baixo a que ele chega com a mão arqueada. */
  const BAIXO = 0.0078;
  /** De quanto antes de encostar na beirada o polegar já a vai levantando (ela sobe por cima dele). */
  const ENCOSTA = 0.004;
  /**
   * As cartas descansam em cima do polegar: com a ponta dele a `s` metros para dentro da beirada
   * (negativo = ainda fora), este é o ângulo em que elas ficam. Fora, deitadas; ao chegar, a
   * beirada sobe por cima da ponta; por baixo, a carta encosta por cima dela.
   */
  const apoiada = (s: number) => {
    if (s <= -RAIO - ENCOSTA) return 0;
    if (s <= -RAIO) return (BAIXO / CARTA.comp) * macio((s + RAIO + ENCOSTA) / ENCOSTA);
    if (s <= 0) return Math.asin((BAIXO + Math.sqrt(RAIO * RAIO - s * s)) / CARTA.comp);
    const d = CARTA.comp - s;
    return Math.atan(BAIXO / d) + Math.asin(RAIO / Math.hypot(d, BAIXO));
  };
  /** O quanto o polegar está para dentro da beirada no instante t (enquanto entra ou sai, com a ponta na mesa). */
  const dentro = (t: number) => {
    const u = t < T.chega ? macio(entre(T.chega - ENTRA, T.chega, t)) : 1 - macio(entre(T.deita, T.deita + ENTRA, t));
    return -(RAIO + 0.008) + (POR_BAIXO + RAIO + 0.008) * u;
  };
  /** O ângulo das cartas no instante t: o polegar entra, levanta, dá uma segunda espiada um pouco mais alta, baixa e sai. */
  const angulo = (t: number) => {
    const base = apoiada(POR_BAIXO);
    const alto = TETO * 0.88;
    if (t <= T.chega || t >= T.deita) return apoiada(dentro(t));
    if (t <= T.alto) return base + (alto - base) * macio(entre(T.chega, T.alto, t));
    if (t <= T.espia) return alto + TETO * 0.12 * Math.sin(Math.PI * entre(T.alto, T.espia, t)) ** 2;
    if (t <= T.baixa) return alto;
    return alto + (base - alto) * macio(entre(T.baixa, T.deita, t));
  };

  // as duas cartas, uma em cima da outra, a de cima um pouco torta; giram juntas em volta da beirada de lá da de baixo
  const centro = naMesa(-0.03, 0.385);
  const PIVO = V(centro.x, MESA, centro.z + CARTA.comp / 2);
  const bases = [
    { pos: V(centro.x, MESA + CARTA.alto / 2, centro.z), giro: 0 },
    { pos: V(centro.x + 0.009, MESA + CARTA.alto * 1.5, centro.z - 0.003), giro: 0.12 },
  ];
  /** Um ponto que anda com as cartas (dito com elas deitadas), quando estão levantadas de `ang`. */
  const levado = (p: THREE.Vector3, ang: number) => p.clone().sub(PIVO).applyAxisAngle(EIXO_X, ang).add(PIVO);

  // a direita: arqueada, com a ponta do dedo médio em cima das cartas, perto da beirada de lá
  const DEDOS_DA_ESPIADA = [4, 34, 24, 4, 34, 24, 6, 36, 26, 8, 38, 26, 5, 0, -5, -9];
  const noCartao = V(centro.x + 0.004, MESA + CARTA.alto * 2 + 0.0005, PIVO.z - 0.014);
  // para onde a mão aponta: entre "para a frente" e a linha do antebraço (que depende de onde a mão
  // fica, e por isso a conta é repetida até assentar) — assim o punho fica mais reto
  const paraFrente = V(0.14, 0, 1).normalize();
  let dedosD = V(paraFrente.x, -arco, paraFrente.z).normalize();
  for (let i = 0; i < 6; i++) {
    const chave: Chave = { t: 0, ponto: 'ponta_m', em: noCartao, f: [...DEDOS_DA_ESPIADA, 0, 0, 0, 0, 0], dedos: dedosD };
    b.zerar();
    b.raiz.updateMatrixWorld(true);
    posar(b, 'D', trilha(b, 'D', [chave, { ...chave, t: 1 }])(0));
    const antebraco = b.ancora('D', 'punho').sub(new THREE.Vector3().setFromMatrixPosition(b.osso('antebraco.D').matrixWorld)).setY(0).normalize();
    const rumo = paraFrente.clone().lerp(antebraco, reto).normalize();
    dedosD = V(rumo.x, -arco, rumo.z).normalize();
  }
  /** A ponta do polegar (o meio dela) e onde ela fica no instante t: na mesa enquanto entra ou sai, e encostada por baixo das cartas enquanto as levanta. */
  const pontaDoPolegar = () => b.esferasNoMundo('D')[16].p;
  const beirada = centro.z - CARTA.comp / 2;
  /** Em que ponto da beirada (x) o polegar a pega: escolhido abaixo, onde ele alcança melhor com a mão neste rumo. */
  let pegaEm = centro.x + 0.018;
  const doPolegar = (t: number) => {
    const x = pegaEm;
    if (t <= T.chega || t >= T.deita) return V(x, MESA + BAIXO, beirada + dentro(t));
    return levado(V(x, MESA - RAIO - 0.0003, beirada + POR_BAIXO), angulo(t));
  };
  /** O jeito do polegar na chave anterior (a procura da seguinte parte dele), e o quanto faltou para ele chegar. */
  let jeito: number[] | undefined;
  let faltou = 0;
  let melhorX = pegaEm;
  /**
   * A dobra da raiz de um dedo (fora o médio, que é quem prende a mão à carta) para a ponta dele
   * pousar em cima das cartas — ou na mesa, se ele cai fora delas —, sem entrar: quando as cartas
   * sobem, os dedos sobem com elas. `punho` e `q` são onde a mão está nesta chave.
   */
  const maoDireita = b.osso('mao.D');
  const pousado = (dedo: number, ang: number, punho: THREE.Vector3, q: THREE.Quaternion): number => {
    const folga = (dobra: number) => {
      const f = [...DEDOS_DA_ESPIADA, 0, 0, 0, 0, 0];
      f[dedo * 3] = dobra;
      b.dedos('D', f);
      maoDireita.updateWorldMatrix(true, true);
      const ponta = b.esferasNoMundo('D')[dedo * 4];
      const noMundo = maoDireita.worldToLocal(ponta.p.clone()).applyQuaternion(q).add(punho);
      // a ponta, vista com as cartas deitadas: está em cima delas?
      const deitada = noMundo.clone().sub(PIVO).applyAxisAngle(EIXO_X, -ang).add(PIVO);
      const sobre = deitada.x > centro.x - CARTA.larg / 2 - 0.004 && deitada.x < centro.x + CARTA.larg / 2 + 0.012 && deitada.z > centro.z - CARTA.comp / 2 - 0.006 && deitada.z < PIVO.z + 0.002;
      return (sobre ? deitada.y - (MESA + CARTA.alto * 2) : noMundo.y - MESA) - ponta.r;
    };
    // mais dobra = ponta mais baixa: procura a dobra em que ela encosta
    let alto = -25;
    let baixo = DEDOS_DA_ESPIADA[dedo * 3] + 30;
    if (folga(alto) < 0) return alto;
    if (folga(baixo) > 0) return DEDOS_DA_ESPIADA[dedo * 3];
    for (let i = 0; i < 14; i++) {
      const meio = (alto + baixo) / 2;
      if (folga(meio) > 0.0003) alto = meio;
      else baixo = meio;
    }
    return alto;
  };
  const chaveD = (t: number): Chave => {
    const ang = angulo(t);
    const em = levado(noCartao, ang);
    const q = b.orientar('D', dedosD, V(0, -1, 0));
    const punho = b.resolver('D', 'ponta_m', em, q, [...DEDOS_DA_ESPIADA, 0, 0, 0, 0, 0]);
    const dedos = [...DEDOS_DA_ESPIADA];
    for (const dedo of [0, 2, 3]) dedos[dedo * 3] = pousado(dedo, ang, punho, q);
    const alvo = doPolegar(t).sub(punho).applyQuaternion(q.clone().invert());
    const achado = polegarEm(b, 'D', dedos, alvo, undefined, pontaDoPolegar, jeito);
    jeito = achado.ang;
    faltou = achado.falta;
    return { t, ponto: 'ponta_m', em, f: [...dedos, ...jeito], como: [...DEDOS_DA_ESPIADA, 0, 0, 0, 0, 0], dedos: dedosD };
  };
  // o ponto da beirada em que o polegar chega melhor, com as cartas deitadas e levantadas
  let menor = Infinity;
  for (const x of [-0.004, 0.004, 0.012, 0.02, 0.027]) {
    pegaEm = centro.x + x;
    jeito = undefined;
    let erro = 0;
    for (const t of [T.chega - ENTRA, T.chega, T.alto]) {
      chaveD(t);
      erro += faltou;
    }
    if (erro < menor) {
      menor = erro;
      melhorX = pegaEm;
    }
  }
  pegaEm = melhorX;
  jeito = undefined;
  const antes = chaveD(T.chega - ENTRA);
  const chavesD: Chave[] = [descanso('D', 0), { ...antes, t: T.chega - ENTRA - 0.32, em: noCartao.clone().add(V(0, 0.03, -0.02)) }];
  // enquanto o polegar e as cartas se mexem, uma chave a cada vinte avos de segundo: o polegar vai com a beirada
  for (let t = T.chega - ENTRA; t < T.deita + ENTRA; t += 0.05) chavesD.push(chaveD(t));
  const depois = chaveD(T.deita + ENTRA);
  chavesD.push(depois, { ...depois, t: T.deita + ENTRA + 0.3, em: noCartao.clone().add(V(0, 0.03, -0.03)) }, descanso('D', 4.35), descanso('D', dur));

  // a esquerda: vem pelo lado e por cima, de punho reto (a mão na linha do antebraço) e um pouco
  // inclinada — o lado do polegar mais alto —, com a palma para baixo e para as cartas: um telhado
  // que as cobre pela esquerda e pela frente
  const INCLINA = (inclina * Math.PI) / 180;
  const cobre = deCimaDePunhoReto(b, 'E', { t: T.chega - ENTRA - 0.1, ponto: 'palma', em: naMesa(centro.x + 0.085, centro.z - 0.01, 0.085), f: COBRE }, INCLINA);
  const chavesE: Chave[] = [descanso('E', 0), cobre, { ...cobre, t: T.deita + ENTRA + 0.1 }, descanso('E', 4.35), descanso('E', dur)];

  return {
    id: 'olhar',
    nome: 'Olhar as cartas',
    dur,
    E: trilha(b, 'E', chavesE),
    D: trilha(b, 'D', chavesD),
    objetos: (t) => {
      const ang = angulo(t);
      return bases.map((c): Objeto => ({ tipo: 'carta', pos: levado(c.pos, ang), quat: girar(EIXO_X, ang).multiply(girar(EIXO_Y, c.giro)) }));
    },
  };
}

/** O que se pode acertar na entrega das cartas (as medidas em metros). */
export interface Entrega {
  /**
   * O impulso do polegar da esquerda na carta de cima: ela gira (graus) em volta do canto de trás à
   * direita — é o canto da frente à direita que sai para fora — e avança (metros).
   */
  gira: number;
  avanca: number;
  /** A que distância das duas beiradas do canto a direita prende a carta. */
  canto: [number, number];
  /** A que distância do corpo (z) a esquerda segura o baralho. */
  perto: number;
  /** Para onde o cotovelo direito prefere apontar (dito como para o braço esquerdo): mais para fora deixa o antebraço mais atravessado. */
  cotovelo: [number, number, number];
  /** O quanto o punho da direita dobra para dentro ao pegar a carta (radianos; 0 = reto). */
  dobra: number;
  /** De quanto em quanto tempo sai uma carta, em segundos (1,6 é o ritmo calmo; menos é mais ligeiro, até `RITMO_MAIS_LIGEIRO`: todos os tempos encolhem juntos). */
  cada?: number;
}
export const ENTREGA: Entrega = { gira: 18, avanca: 0.024, canto: [0.012, 0.014], perto: 0.3, cotovelo: [0.75, -0.55, -0.35], dobra: 0 };

/** O ritmo mais ligeiro de uma entrega, em segundos por carta. */
export const RITMO_MAIS_LIGEIRO = 0.9;

/** Uma carta a entregar: para onde ela vai e como chega. */
export interface CartaEntregue {
  /**
   * Onde a carta vai parar na mesa (x, z), vistos de quem entrega: z é a distância à frente dele e x
   * é para a esquerda dele (negativo: para a direita). Pode ser qualquer ponto da mesa — diante de
   * qualquer assento, ou o meio dela.
   */
  alvo: [number, number];
  /** Como ela fica deitada: o ângulo do comprimento dela em volta de y (radianos; 0 = ao longo de z). Sem isto, fica como cair. */
  giro?: number;
  /** A carta é aberta: vira de frente para cima no ar (as da mesa: flop, turn e river). */
  aberta?: boolean;
}

/**
 * De onde a direita solta uma carta, e com que estalo do punho, conforme para onde ela vai. O braço
 * não aponta para o alvo: quem entrega fica com a mão à frente do baralho, do lado dela, e a carta
 * sai num estalo — a mão só se desloca um pouco no rumo do alvo, e o punho faz o resto.
 *  - o rumo do braço fica à direita do rumo do alvo (a mão direita não cruza para o lado esquerdo), e
 *    acompanha só metade da mudança dele;
 *  - para os alvos à direita o braço estende mais; para os da esquerda fica curto, à frente do
 *    baralho (por cima da mão que o segura ele não passa), e o punho, que nos outros dobra para fora,
 *    dobra para dentro, apontando a carta para lá;
 *  - um alvo logo ali (as cartas do próprio dealer, ou qualquer ponto ao alcance das mãos) não leva
 *    lance: a mão vai para um palmo antes dele (ver `aUmPalmo`), solta a carta no rumo dele, sem
 *    estalo, e sai de perto em vez de acompanhá-la.
 * Os números saíram dos dois lances que a entrega já tinha, e foram conferidos para alvos em volta
 * da mesa toda (ver a animação "entregar-mesa").
 */
function lanceDaEntrega(pegada: THREE.Vector3, alvo: THREE.Vector3) {
  const dx = alvo.x - pegada.x;
  const dz = alvo.z - pegada.z;
  const dist = Math.hypot(dx, dz);
  /** O rumo do alvo, em graus: 0 = em frente, positivo = para a esquerda de quem entrega. */
  const rumoDoAlvo = (Math.atan2(dx, dz) * 180) / Math.PI;
  const rumo = (Math.min(20, Math.max(-78, 0.53 * rumoDoAlvo - 31)) * Math.PI) / 180;
  const braco = Math.max(0.075, 0.11 - 0.00115 * rumoDoAlvo);
  const paraDentro = macio(entre(30, 85, rumoDoAlvo));
  const lance = V(pegada.x + braco * Math.sin(rumo), MESA + 0.09, pegada.z + braco * Math.cos(rumo));
  // um alvo logo ali — as cartas do próprio dealer, ou qualquer ponto ao alcance das mãos dele — não
  // leva lance: a carta sai da mão no plano em que está e só desce depois de se afastar um palmo (senão
  // cairia por entre os dedos). Então a mão vai para um palmo antes do alvo, um pouco mais baixa, e de
  // lá solta a carta no rumo dele, sem estalo.
  const perto = macio(entre(0.36, 0.2, dist));
  const dePerto = perto > 0 ? aUmPalmo(alvo) : lance;
  const de = lance.clone().lerp(dePerto, perto);
  return {
    de,
    /** O punho ao soltar (radianos; negativo = para fora) e o quanto ele ainda dobra no estalo. */
    punho: (-0.28 + 0.52 * paraDentro) * (1 - perto),
    estalo: (paraDentro > 0.5 ? 0.08 : -0.1) * (1 - perto),
    /** O rumo em que a carta sai, no chão. */
    para: V(alvo.x - de.x, 0, alvo.z - de.z).normalize(),
    dist,
    /** O quanto o alvo fica para a direita de quem entrega (0 a 1): para lá a carta aberta sai com o punho quase sem virar (o polegar, virado, ficaria no caminho dela). */
    paraADireita: macio(entre(5, -25, rumoDoAlvo)),
    /**
     * O quanto o voo é curto (0 a 1; 1 = um palmo ou dois): num voo curto a mão não acompanha a carta
     * (recua), e a carta quase não gira e só desce e deita no fim — girando ou descendo junto da mão,
     * ela varreria os dedos.
     */
    curto: macio(entre(0.6, 0.25, Math.hypot(alvo.x - de.x, alvo.z - de.z))),
  };
}

/**
 * De onde soltar uma carta para um alvo logo ali: um palmo antes dele, vindo de algum lado. A carta
 * só pode sair para a frente e para a esquerda da mão direita (para o outro lado ficam a palma e o
 * punho), então o rumo preferido é esse; mas a mão não pode ficar em cima do baralho nem da mão que
 * o segura, nem cruzar para o lado esquerdo, nem ir além do alcance do braço — procura-se, em leque,
 * o rumo que melhor atende a tudo.
 */
function aUmPalmo(alvo: THREE.Vector3): THREE.Vector3 {
  const PALMO = 0.13;
  let melhor = alvo;
  let nota = Infinity;
  for (let graus = -40; graus <= 110; graus += 10) {
    const a = (graus * Math.PI) / 180;
    const x = alvo.x - PALMO * Math.sin(a);
    const z = alvo.z - PALMO * Math.cos(a);
    const custo =
      Math.abs(graus - 30) / 60 +
      // longe do baralho (que fica em cima de (0,05; 0,36)) e do lado esquerdo
      25 * Math.max(0, 0.15 - Math.hypot(x - 0.05, z - 0.36)) +
      20 * Math.max(0, x + 0.02) +
      // nem colada ao corpo, nem além do alcance, nem longe demais para a direita
      20 * Math.max(0, 0.27 - z) +
      25 * Math.max(0, z - 0.5) +
      20 * Math.max(0, -0.36 - x);
    if (custo < nota) {
      nota = custo;
      melhor = V(x, MESA + 0.065, z);
    }
  }
  return melhor;
}

/** O que a entrega acha por procura e não muda com os alvos (as poses dos polegares), por boneco. */
const procuradas = new WeakMap<Boneco, Map<string, Record<string, number[]>>>();

/**
 * Entregar cartas: a esquerda segura o baralho, a direita tira a carta de cima e a lança, uma vez
 * para cada carta pedida — para qualquer ponto da mesa (ver `CartaEntregue` e `lanceDaEntrega`).
 *  - O baralho fica na diagonal da mão meio aberta: o polegar ao longo de um lado comprido, os
 *    outros dedos por baixo, com as pontas subindo pelo lado oposto sem passar do topo.
 *  - O polegar da esquerda dá o impulso: sobe por fora, pousa em cima do baralho junto do lado dele
 *    (é até onde chega sem entrar no baralho) e empurra para a frente. A carta de cima avança e
 *    gira em volta do canto de trás, e o canto da frente à direita sai para fora.
 *  - A direita vem de punho reto (a mão na linha do antebraço), de lado, com os dedos recolhidos, e
 *    prende esse canto — já fora do baralho — entre o polegar, por cima, e o lado do indicador.
 *    Tira a carta para a frente, lança levando o braço, com um giro pequeno do punho, e a solta em
 *    movimento.
 *  - A carta voa girando até o alvo: quanto mais longe, mais tempo e mais voltas. Uma carta aberta
 *    sai com o punho já virando (a palma para cima) e vira de frente para cima no ar.
 */
export function entregarCartas(b: Boneco, cartas: CartaEntregue[], opcoes: Partial<Entrega> = {}, id = 'entregar', nome = 'Entregar cartas'): Clipe {
  const { gira, avanca, canto, perto, cotovelo, dobra, cada: pedida = 1.6 } = { ...ENTREGA, ...opcoes };
  // (mais ligeiro do que isto os dedos da direita, que abrem e fecham a cada carta, dariam pulos)
  const cada = Math.max(RITMO_MAIS_LIGEIRO, pedida);
  /** O ritmo: 1 no passo calmo; todos os tempos de um lance encolhem ou esticam com ele. */
  const e = cada / 1.6;
  /** Quanto tempo a carta leva no ar: mais longe, mais tempo. */
  const voo = (c: CartaEntregue) => 0.35 + 0.3 * Math.hypot(c.alvo[0], c.alvo[1] - 0.42);
  /**
   * O polegar da esquerda não encolhe os tempos dele abaixo dos do ritmo calmo (os dedos não dão
   * pulos): num ritmo ligeiro ele começa a empurrar mais cedo, e a primeira carta sai um pouco depois.
   */
  const m = Math.max(e, 0.95);
  const EMPURRA = { de: -0.25 * e - 0.3 * m, ate: -0.25 * e };
  const atraso = Math.max(0, 0.37 * m - EMPURRA.de + 0.02 - 0.95 * e);
  const tempos = cartas.map((_, i) => ({ pega: atraso + i * cada + 0.95 * e, solta: atraso + i * cada + 1.45 * e }));
  const dur = Math.max(atraso + cartas.length * cada + e, ...cartas.map((c, i) => tempos[i].solta + voo(c) + 0.4));
  const doCotovelo = V(...cotovelo).normalize();
  const poseE: Chave = { t: 0, ponto: 'palma', em: naMesa(0.085, perto, 0.07), f: SEGURA, dedos: V(-0.6, 0.05, 0.8), palma: V(-0.2, 0.95, 0.2) };
  // a esquerda segura o baralho parada — menos quando a carta vai cair debaixo dela (as cartas do
  // próprio dealer, um pouco para a esquerda): aí, depois de a direita tirar a carta, ela sai de cima,
  // para a esquerda, e volta a tempo da carta seguinte
  const chavesE: Chave[] = [poseE];
  cartas.forEach((c, i) => {
    if (Math.hypot(c.alvo[0] - 0.06, c.alvo[1] - 0.39) > 0.15) return;
    const l = tempos[i];
    const volta = l.pega + Math.min(0.5 * e + voo(c), e);
    const deLado: Chave = { ...poseE, em: poseE.em!.clone().add(V(0.1, 0.025, -0.03)) };
    chavesE.push({ ...poseE, t: l.pega + 0.08 * e }, { ...deLado, t: l.solta }, { ...deLado, t: volta }, { ...poseE, t: volta + 0.35 * e });
  });
  chavesE.push({ ...poseE, t: dur });
  const E = trilha(b, 'E', chavesE);

  // o baralho dentro da mão esquerda (o osso da mão tem x ao longo dos dedos, y para o dorso, z para
  // o polegar): o comprimento dele vai na diagonal, mais ou menos na direção do polegar
  const GIRO = (46 * Math.PI) / 180;
  const naEsquerda = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(-Math.sin(GIRO), 0, Math.cos(GIRO)), V(0, -1, 0), V(Math.cos(GIRO), 0, Math.sin(GIRO))));
  const daEsquerda = naEsquerda.clone().invert();
  /** A altura da face de baixo do baralho, acima da palma. */
  const fundo = -0.0215;
  // (o baralho fica 2 cm para a frente ao longo do comprimento: os dedos pegam a metade de trás)
  const centro = V(0.115 + 0.02 * Math.cos(GIRO), fundo - BARALHO.alto / 2, -0.005 + 0.02 * Math.sin(GIRO));
  /** Um ponto do baralho (x para o lado do polegar, y para fora da palma, z ao comprido) visto do osso da mão esquerda, e o contrário. */
  const noBaralho = (p: THREE.Vector3) => p.clone().applyQuaternion(naEsquerda).add(centro);
  const doBaralho = (p: THREE.Vector3) => p.clone().sub(centro).applyQuaternion(daEsquerda);
  /** A altura do meio da carta de cima, a contar do meio do baralho. */
  const TOPO = BARALHO.alto / 2 + CARTA.alto;
  const baralho = (bo: Boneco) => {
    const m = bo.osso('mao.E');
    return { centro: m.localToWorld(centro.clone()), topo: m.localToWorld(noBaralho(V(0, TOPO, 0))), quat: m.getWorldQuaternion(new THREE.Quaternion()).multiply(naEsquerda) };
  };

  // o impulso do polegar da esquerda: a polpa pousa em cima da carta, perto do lado dele, e a leva
  // para a direita e para a frente. O polegar inteiro tem de ficar fora do baralho: a pena abaixo
  // mede o quanto as juntas dele (e o meio de cada osso) entram na caixa do baralho.
  const maoE = b.osso('mao.E');
  /** Onde fica, a meio do impulso `u`, um ponto que anda com a carta de cima (nos eixos do baralho): ela gira em volta do canto de trás à direita e avança. */
  const PIVO = V(-CARTA.larg / 2, 0, -CARTA.comp / 2);
  const levada = (p: THREE.Vector3, u: number) => {
    const q = p.clone().sub(PIVO).applyAxisAngle(EIXO_Y, (-gira * u * Math.PI) / 180).add(PIVO);
    q.y = p.y;
    q.z += avanca * u;
    return q;
  };
  /** A ponta do polegar da esquerda (o meio dela) e o raio. */
  const RAIO_DA_PONTA = 0.0048;
  const pontaDoPolegar = () => b.esferasNoMundo('E')[16].p;
  const entraNoBaralho = () => {
    const base = b.junta('E', 4, 2);
    const meio = b.junta('E', 4, 3);
    const ponta = pontaDoPolegar();
    const partes: [THREE.Vector3, number][] = [
      [base.clone(), 0.0078],
      [base.clone().lerp(meio, 0.5), 0.0072],
      [meio.clone(), 0.0066],
      [meio.clone().lerp(ponta, 0.5), 0.0056],
      [ponta, RAIO_DA_PONTA],
    ];
    let pena = 0;
    for (const [p, r] of partes) {
      const q = doBaralho(maoE.worldToLocal(p));
      const d = [Math.abs(q.x) - CARTA.larg / 2, Math.abs(q.y) - BARALHO.alto / 2 - CARTA.alto, Math.abs(q.z) - CARTA.comp / 2];
      const folga = Math.hypot(Math.max(d[0], 0), Math.max(d[1], 0), Math.max(d[2], 0)) + Math.min(Math.max(d[0], d[1], d[2]), 0) - r;
      if (folga < 0) pena -= folga * 4;
    }
    return pena;
  };
  /** O polegar com a ponta encostada num ponto da superfície do baralho (o meio da ponta fica um raio para fora, no rumo `paraFora`). */
  const polegarNo = (ponto: THREE.Vector3, paraFora = V(0, 1, 0)) => polegarEm(b, 'E', SEGURA, noBaralho(ponto.clone().addScaledVector(paraFora, RAIO_DA_PONTA + 0.0003)), entraNoBaralho, pontaDoPolegar);
  // As poses do polegar que empurra são achadas por procura (um terço de segundo de conta) e não
  // dependem de para onde as cartas vão: ficam guardadas, por boneco e por jeito de empurrar.
  const guardadas = procuradas.get(b) ?? procuradas.set(b, new Map()).get(b)!;
  const doEmpurrao = `empurra:${gira}:${avanca}`;
  if (!guardadas.has(doEmpurrao)) {
    // em repouso, a polpa encosta no lado comprido do baralho (onde já estava, mas do lado de fora)
    b.dedos('E', SEGURA);
    maoE.updateWorldMatrix(true, true);
    const encosta = doBaralho(maoE.worldToLocal(pontaDoPolegar()));
    const REPOUSO = polegarNo(V(CARTA.larg / 2, Math.min(0.003, Math.max(-0.003, encosta.y)), Math.min(CARTA.comp / 2 - 0.008, encosta.z)), V(1, 0, 0)).ang;
    // a polpa pousa em cima da carta, junto do lado do polegar e bem atrás, e vai com ela
    let impulso = { erro: Infinity, fora: REPOUSO, sobe: REPOUSO, pousa: REPOUSO, meio: REPOUSO, levou: REPOUSO, sai: REPOUSO };
    for (const x of [0.027, 0.024]) {
      for (const z of [-0.042, -0.037, -0.032]) {
        const em = V(x, TOPO + CARTA.alto / 2, z);
        const pousa = polegarNo(em);
        const meio = polegarNo(levada(em, 0.5));
        const levou = polegarNo(levada(em, 1));
        const erro = pousa.falta + meio.falta + levou.falta;
        if (erro >= impulso.erro) continue;
        // (vai e volta pelo alto, e chega e sai por fora do lado do baralho, para não raspar nele)
        const fora = polegarNo(V(CARTA.larg / 2 + 0.012, TOPO + 0.014, z));
        const sobe = polegarNo(em.clone().add(V(0.003, 0.012, 0)));
        const sai = polegarNo(levada(em, 1).add(V(0.002, 0.012, 0)));
        impulso = { erro, fora: fora.ang, sobe: sobe.ang, pousa: pousa.ang, meio: meio.ang, levou: levou.ang, sai: sai.ang };
      }
    }
    guardadas.set(doEmpurrao, { REPOUSO, fora: impulso.fora, sobe: impulso.sobe, pousa: impulso.pousa, meio: impulso.meio, levou: impulso.levou, sai: impulso.sai });
  }
  const impulso = guardadas.get(doEmpurrao) as { REPOUSO: number[]; fora: number[]; sobe: number[]; pousa: number[]; meio: number[]; levou: number[]; sai: number[] };
  const REPOUSO = impulso.REPOUSO;
  /** O quanto do impulso já foi dado no instante `t` do lance `l` (0 a 1). */
  const dado = (l: { pega: number }, t: number) => macio(entre(l.pega + EMPURRA.de, l.pega + EMPURRA.ate, t));
  const mistura = (a: number[], z: number[], u: number) => a.map((x, k) => x + (z[k] - x) * u);
  // o caminho do polegar da esquerda, de marco em marco: antes da primeira carta ele sai do repouso
  // por fora do baralho e sobe; entre uma carta e a seguinte fica no alto, por cima do baralho; e só
  // depois da última volta ao repouso
  const marcos: [number, number[]][] = [];
  tempos.forEach((l, i) => {
    const de = l.pega + EMPURRA.de;
    if (i === 0) marcos.push([de - 0.37 * m, REPOUSO], [de - 0.23 * m, impulso.fora], [de - 0.11 * m, impulso.sobe]);
    else marcos.push([(marcos[marcos.length - 1][0] + de) / 2, impulso.sobe]);
    marcos.push([de, impulso.pousa], [l.pega + 0.03 * e, impulso.levou], [l.pega + 0.03 * e + 0.12 * m, impulso.sai]);
    if (i === tempos.length - 1) marcos.push([l.pega + 0.03 * e + 0.26 * m, impulso.fora], [l.pega + 0.03 * e + 0.41 * m, REPOUSO]);
  });
  const polegarDaEsquerda = (t: number): number[] => {
    if (t <= marcos[0][0] || t >= marcos[marcos.length - 1][0]) return REPOUSO;
    for (const l of tempos) {
      // enquanto empurra, o polegar vai com a carta
      if (t >= l.pega + EMPURRA.de && t <= l.pega + 0.03 * e) {
        const u = dado(l, t);
        return u < 0.5 ? mistura(impulso.pousa, impulso.meio, u * 2) : mistura(impulso.meio, impulso.levou, u * 2 - 1);
      }
    }
    let i = 0;
    while (t > marcos[i + 1][0]) i++;
    return mistura(marcos[i][1], marcos[i + 1][1], macio(entre(marcos[i][0], marcos[i + 1][0], t)));
  };
  /** A carta de cima a meio do impulso `u`, no mundo. */
  const cartaDeCima = (bo: Boneco, u: number) => {
    const m = bo.osso('mao.E');
    return { pos: m.localToWorld(noBaralho(levada(V(0, TOPO, 0), u))), quat: m.getWorldQuaternion(new THREE.Quaternion()).multiply(naEsquerda).multiply(girar(EIXO_Y, (-gira * u * Math.PI) / 180)) };
  };

  // posa a esquerda uma vez, para saber onde o baralho e a carta empurrada ficam no mundo
  b.zerar();
  b.raiz.updateMatrixWorld(true);
  posar(b, 'E', E(0));
  const parado = baralho(b);
  const cima = V(0, 1, 0).applyQuaternion(parado.quat);
  const empurrada = cartaDeCima(b, 1);
  /** Onde o polegar da direita prende a carta empurrada: perto do canto de cima à direita dela. */
  const pegada = empurrada.pos.clone().add(V(-(CARTA.larg / 2 - canto[0]), CARTA.alto / 2 + 0.0005, CARTA.comp / 2 - canto[1]).applyQuaternion(empurrada.quat));

  // os lances: de onde cada carta é solta e onde ela cai (as que caem no mesmo lugar empilham)
  const lances = cartas.map((c, i) => {
    const empilha = cartas.slice(0, i).filter((o) => Math.hypot(o.alvo[0] - c.alvo[0], o.alvo[1] - c.alvo[1]) < 0.05).length;
    const cai = naMesa(c.alvo[0], c.alvo[1], CARTA.alto * (1 + empilha));
    return { ...tempos[i], ...lanceDaEntrega(pegada, cai), cai, voo: voo(c), giro: c.giro, aberta: !!c.aberta };
  });

  // a mão direita: os dedos recolhidos, o polegar em cima do lado do indicador (no osso do meio),
  // com a carta entre os dois; e a mesma com o polegar levantado
  const maoD = b.osso('mao.D');
  b.dedos('D', [...DEDOS_DE_CHAVE, 0, 0, 0, 0, 0]);
  maoD.updateWorldMatrix(true, true);
  const noIndicador = maoD.worldToLocal(b.junta('D', 0, 2).lerp(b.junta('D', 0, 3), 0.5));
  noIndicador.z = Math.max(maoD.worldToLocal(b.junta('D', 0, 2)).z, maoD.worldToLocal(b.junta('D', 0, 3)).z) + 0.0064;
  // (o polegar da direita, fechado sobre a carta e levantado: também achados por procura, e guardados)
  if (!guardadas.has('chave')) guardadas.set('chave', { fechada: polegarEm(b, 'D', DEDOS_DE_CHAVE, noIndicador.clone().add(V(0, 0, 0.0016))).ang, aberta: polegarEm(b, 'D', DEDOS_DE_CHAVE, noIndicador.clone().add(V(0, 0, 0.016))).ang });
  const daChave = guardadas.get('chave') as { fechada: number[]; aberta: number[] };
  const CHAVE = [...DEDOS_DE_CHAVE, ...daChave.fechada];
  const CHAVE_ABERTA = [...DEDOS_DE_CHAVE, ...daChave.aberta];

  const PARA_CIMA = V(0, 1, 0);
  const noChao = (v: THREE.Vector3) => v.clone().setY(0).normalize();
  /**
   * O polegar para cima ou, para abrir a carta, já virando para fora (a palma indo para cima) de
   * `vira` radianos — em volta do rumo do antebraço direito, que vem de fora para dentro: virando
   * em volta dele, o punho não dobra a mais.
   */
  const polegarPara = (vira: number) => V(-0.8 * Math.sin(vira), Math.cos(vira), 0.6 * Math.sin(vira));
  const reta = (chave: Chave, normal: THREE.Vector3, desvio = 0) => dePunhoReto(b, 'D', chave, normal, desvio, doCotovelo);
  // a mão espera ao lado do baralho, na altura da carta: é de lado que ela chega (a carta entra
  // entre o polegar, levantado, e o indicador). Vindo por cima, o indicador atravessaria a carta.
  const espera = reta({ t: 0, ponto: 'ponta_p', em: pegada.clone().add(V(-0.065, 0.003, -0.018)), f: CHAVE_ABERTA, como: CHAVE }, cima, dobra);
  const chaves: Chave[] = [espera];
  lances.forEach((l, i) => {
    // (a mão espera parada ao lado do baralho: sem isto ela chegaria embalada do lance anterior)
    if (i === 0) chaves.push({ ...espera, t: l.pega - 0.5 * e });
    chaves.push(reta({ t: l.pega - 0.2 * e, ponto: 'ponta_p', em: pegada, f: CHAVE_ABERTA, como: CHAVE }, cima, dobra));
    chaves.push(reta({ t: l.pega, ponto: 'ponta_p', em: pegada, f: CHAVE }, cima, dobra));
    // tira a carta: sobe e sai para a frente e para fora, para longe do baralho e da mão que o segura
    chaves.push(reta({ t: l.pega + 0.2 * e, ponto: 'ponta_p', em: pegada.clone().add(V(-0.02, 0.03, 0.03)), f: CHAVE }, PARA_CIMA, dobra));
    // a carta é solta de passagem (a mão não para aqui), com o punho no rumo dela. (Para abrir a carta
    // o punho já chega virado, e não vira mais enquanto ela sai: o polegar, que a aperta, entraria nela.)
    chaves.push(reta({ t: l.solta, ponto: 'ponta_p', em: l.de, f: CHAVE }, polegarPara(l.aberta ? 0.45 * (1 - Math.min(1, 2 * l.paraADireita)) : 0), l.punho));
    chaves.push(reta({ t: l.solta + 0.16 * e, ponto: 'ponta_p', em: l.de.clone().addScaledVector(l.para, 0.035 * (1 - l.curto) - 0.03 * l.curto), f: SOLTOU, como: CHAVE }, polegarPara(l.aberta ? 0.45 * (1 - Math.min(1, 2 * l.paraADireita)) : 0), l.punho + l.estalo));
    chaves.push({ ...espera, t: l.solta + 0.6 * e });
  });
  chaves.push({ ...espera, t: dur });
  const D = trilha(b, 'D', chaves);

  // onde a carta fica dentro da mão direita (a mão a prende onde ela está, sem tranco), e onde ela
  // está no instante em que é solta (voa a partir dali)
  const naHora = (t: number) => {
    b.zerar();
    b.raiz.updateMatrixWorld(true);
    posarNaMesa(b, 'D', D(t), doCotovelo);
  };
  naHora(lances[0].pega);
  const naDireita: NaMao = { pos: maoD.worldToLocal(empurrada.pos.clone()), quat: maoD.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(empurrada.quat) };
  const voos = lances.map((l) => {
    naHora(l.solta);
    const solta = cartaNoMundo(b, 'D', naDireita);
    // a carta deitada, no rumo em que estava ao sair, e o que falta para ela deitar (a inclinação com que sai da mão)
    const ao = noChao(V(0, 0, 1).applyQuaternion(solta.quat));
    const rumo = Math.atan2(ao.x, ao.z);
    const inclinada = girar(EIXO_Y, -rumo).multiply(solta.quat);
    // as voltas no ar: mais longe, mais voltas; para a direita num sentido, para a esquerda no outro.
    // Com o jeito de deitar dito (`giro`), ela dá voltas inteiras e para nele; aberta, quase não gira
    // (o que se vê é a virada).
    const sentido = l.cai.x < pegada.x ? 1 : -1;
    // (num lance curto a carta quase não gira: girando junto da mão, o canto dela varreria os dedos)
    const voltas = l.aberta ? 0 : (0.9 + 0.5 * l.dist) * (1 - 0.9 * l.curto);
    // (a aberta que vai bem para a direita dá uma volta inteira, como as fechadas: é girando que ela sai de baixo do polegar)
    const daVolta = l.aberta && l.paraADireita > 0.5;
    const inteiras = l.aberta ? (daVolta ? 1 : 0) : Math.round(voltas);
    const gira = l.giro === undefined ? (l.aberta ? sentido * (0.5 + inteiras * 2 * Math.PI) : sentido * voltas * 2 * Math.PI) : Math.atan2(Math.sin(l.giro - rumo), Math.cos(l.giro - rumo)) + sentido * inteiras * 2 * Math.PI;
    // aberta, vira em volta do próprio comprimento, no sentido em que o punho já vinha virando
    const vira = l.aberta ? Math.PI * (ao.dot(noChao(D(l.solta).dedos)) >= 0 ? 1 : -1) : 0;
    return { ...solta, rumo, inclinada, gira, vira, daVolta };
  });
  /** A carta `i` no ar, `u` (0 a 1) do caminho andado: sai no plano em que estava (por cima dos dedos, que ficam para baixo), girando, e só depois de se afastar da mão é que desce e deita na mesa. */
  const noAr = (i: number, u: number) => {
    const l = lances[i];
    const v = voos[i];
    const pos = v.pos.clone().lerp(l.cai, u);
    pos.y = v.pos.y + (l.cai.y - v.pos.y) * Math.pow(u, 2.4 + 3 * l.curto);
    // (a que vira não pode raspar na mesa enquanto está de lado: sobe um pouco no meio, já longe da mão)
    if (l.aberta) pos.y += 0.035 * pulso(entre(0.3, 1, u));
    // (e a de um lance curto sobe um nada ao sair, para passar por cima do indicador em que estava deitada)
    pos.y += 0.007 * l.curto * pulso(u);
    // (a aberta que não dá a volta só acerta o rumo depois de sair de perto da mão)
    const quat = girar(EIXO_Y, v.rumo + v.gira * (l.aberta && !v.daVolta ? macio(entre(0.25, 1, u)) : u))
      .multiply(girar(V(0, 0, 1), v.vira * macio(entre(0.35, 0.92, u))))
      .multiply(v.inclinada.clone().slerp(new THREE.Quaternion(), macio(entre(0.45 * l.curto, 1, u))));
    return { pos, quat };
  };
  return {
    id,
    nome,
    dur,
    E,
    D,
    cotovelo: { D: doCotovelo },
    ajuste: (t, maos) => {
      const p = polegarDaEsquerda(t);
      for (let k = 0; k < 5; k++) maos.E.f[16 + k] = p[k];
    },
    objetos: (t, bo) => {
      const agora = baralho(bo);
      const objs: Objeto[] = [{ tipo: 'baralho', pos: agora.centro, quat: agora.quat }];
      lances.forEach((l, i) => {
        if (t < l.pega + EMPURRA.de) return; // ainda é a de cima do baralho
        if (t < l.pega) {
          // empurrada pelo polegar da esquerda
          objs.push({ tipo: 'carta', n: i, ...cartaDeCima(bo, dado(l, t)) });
        } else if (t < l.solta) {
          objs.push({ tipo: 'carta', n: i, ...cartaNoMundo(bo, 'D', naDireita) });
        } else {
          const u = PASSOS.freia(entre(l.solta, l.solta + l.voo, t));
          objs.push({ tipo: 'carta', n: i, pousada: u >= 1, aberta: l.aberta && u >= 1, ...noAr(i, u) });
        }
      });
      return objs;
    },
  };
}

/** A entrega de sempre, para ver na página: duas cartas, uma para cada lado, à frente. */
export function entregar(b: Boneco, opcoes: Partial<Entrega> = {}): Clipe {
  return entregarCartas(b, [{ alvo: [-0.28, 0.84] }, { alvo: [0.22, 0.84] }], opcoes);
}

/**
 * Onde ficam, vistos de um lugar da mesa, os pontos da mesa do jogo (para dizer os alvos de uma
 * entrega). A mesa é um estádio com o meio na origem; `lugar` é onde a pessoa está (x, z) e para
 * onde ela olha (`giro`, em volta de y: 0 = para +z). Devolve o ponto (x, z) nas coordenadas dela.
 */
export function vistoDoLugar(lugar: { x: number; z: number; giro: number }, ponto: [number, number]): [number, number] {
  const dx = ponto[0] - lugar.x;
  const dz = ponto[1] - lugar.z;
  const c = Math.cos(lugar.giro);
  const s = Math.sin(lugar.giro);
  // (o personagem olha para +z dele, que no mundo é (sen giro, cos giro); o x dele é (cos giro, −sen giro))
  return [dx * c - dz * s, dx * s + dz * c];
}

/** Onde o baralho fica parado na mesa, à frente e à esquerda de quem dá as cartas: (x, z) e como ele está deitado (o giro em volta de y). */
export interface BaralhoNaMesa {
  em: [number, number];
  giro: number;
}

export const BARALHO_NA_MESA: BaralhoNaMesa = { em: [0.36, 0.42], giro: 0.35 };

/** O que a pegada do baralho achou por procura (para conferir de fora). */
export const medidasDaPegada = { falta: 0, folga: 0, jeito: '', lista: [] as string[] };

/**
 * Pegar o baralho da mesa para dar as cartas. Ele fica parado à esquerda de quem as dá, aonde só a
 * esquerda chega, e tem de acabar deitado na palma dela, virada para cima — uma mão só não faz isso
 * (por cima, ela o pegaria de palma para baixo). Então:
 *  - a esquerda, de palma para baixo e punho reto, pousa as pontas dos dedos em cima dele e o
 *    arrasta pelo feltro até a frente do corpo — debaixo de onde vai segurá-lo —, já virado como na mão;
 *  - ela sai de cima, e a direita desce e o pega pelas duas pontas: o dedo médio na de lá, o polegar
 *    na de cá, a mão em arco por cima (os lados compridos ficam livres para a esquerda);
 *  - a direita o levanta; a esquerda, que virou a palma para cima, entra por baixo, aberta; a
 *    direita o deita na palma e solta, e a esquerda fecha em volta dele.
 * Acaba na pose de espera de `entregarCartas` (a esquerda com o baralho, a direita ao lado dele), que
 * é onde a entrega começa.
 */
export function pegarBaralho(b: Boneco, onde: BaralhoNaMesa = BARALHO_NA_MESA, id = 'pegar-baralho', nome = 'Pegar o baralho'): Clipe {
  // (a pegada é achada por procura — meio segundo de conta —: fica guardada, por boneco e por lugar do baralho)
  const guardados = pegadas.get(b) ?? pegadas.set(b, new Map()).get(b)!;
  const chave = `${onde.em.join()}:${onde.giro}`;
  const feito = guardados.get(chave) ?? montarAPegada(b, onde);
  guardados.set(chave, feito);
  return { ...feito, id, nome };
}

const pegadas = new WeakMap<Boneco, Map<string, Clipe>>();

function montarAPegada(b: Boneco, { em, giro }: BaralhoNaMesa): Clipe {
  const id = 'pegar-baralho';
  const nome = 'Pegar o baralho';
  const dur = 2.7;
  const T = { toca: 0.45, parte: 0.52, chega: 0.92, larga: 0.98, pega: 1.36, sobe: 1.44, alto: 1.68, pousa: 1.94, solta: 2.02, fecha: 2.16 };
  // onde acaba: a espera da entrega
  const entrega = entregarCartas(b, [{ alvo: [-0.28, 0.84] }]);
  const fim = poseDe(entrega, 0);
  posarPose(b, fim);
  b.raiz.updateMatrixWorld(true);
  const naMao = entrega.objetos!(0, b).find((o) => o.tipo === 'baralho')!;
  const ossoE = b.osso('mao.E');
  const ossoD = b.osso('mao.D');
  const dentroDe = (osso: THREE.Object3D, pos: THREE.Vector3, quat: THREE.Quaternion): NaMao => {
    osso.updateWorldMatrix(true, false);
    return { pos: osso.worldToLocal(pos.clone()), quat: osso.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(quat) };
  };
  const presoE = dentroDe(ossoE, naMao.pos, naMao.quat);

  // deitado na mesa: no lugar dele (M) e, depois de arrastado, debaixo de onde a mão o segura (C), virado como na mão
  const comprido = V(0, 0, 1).applyQuaternion(naMao.quat).setY(0).normalize();
  if (comprido.z < 0) comprido.negate();
  const giroNaMao = Math.atan2(comprido.x, comprido.z);
  // (o baralho é igual de ponta-cabeça: do giro da mesa ao da mão pelo caminho mais curto)
  const giroDaMesa = giroNaMao + Math.atan2(Math.sin(2 * (giro - giroNaMao)), Math.cos(2 * (giro - giroNaMao))) / 2;
  const M = naMesa(em[0], em[1], BARALHO.alto / 2);
  const C = naMesa(naMao.pos.x, naMao.pos.z, BARALHO.alto / 2);
  const deitado = girar(EIXO_Y, giroNaMao);

  // ── a esquerda: arrasta, sai de cima, vira a palma e entra por baixo ──
  // (as pontas dos dedos em cima dele: o ponto de apoio fica um nada acima, que os dedos, um pouco dobrados, descem dali)
  const topo = (p: THREE.Vector3, sobe = 0) => p.clone().add(V(0, BARALHO.alto / 2 + 0.005 + sobe, 0));
  // (de mão quase espalmada: em arco, as pontas dos dedos desceriam pela frente do baralho, para dentro dele)
  const arrasta = (t: number, onde: THREE.Vector3) => deCimaDePunhoReto(b, 'E', { t, ponto: 'dedos', em: onde, f: POUSADA }, 0);
  const eFim = fim.maos.E;
  /** A mão que segura, aberta: os dedos e o polegar fora dos lados do baralho. */
  const ABRE = eFim.f.map((v, k) => v + (ABERTA[k] - v) * 0.6);
  const segura = (t: number, f: Dedos, fora = V(0, 0, 0)): Chave => ({ t, ponto: 'punho', em: eFim.punho.clone().add(fora), dedos: eFim.dedos.clone(), palma: eFim.palma.clone(), f });
  const saiDeCima = arrasta(T.larga + 0.2, topo(C, 0.06).add(V(0.11, 0, -0.04)));
  const chavesE: Chave[] = [
    descanso('E', 0),
    arrasta(T.toca - 0.17, topo(M, 0.03).add(V(0, 0, -0.012))),
    arrasta(T.toca, topo(M)),
    arrasta(T.parte, topo(M)),
    arrasta(T.chega, topo(C)),
    arrasta(T.larga, topo(C)),
    saiDeCima,
    // vira a palma para cima ao lado de onde vai segurar (o polegar sobe por fora), e entra por baixo do baralho
    { t: T.alto - 0.16, ponto: 'punho', em: eFim.punho.clone().add(V(0.105, 0.0, -0.045)), dedos: saiDeCima.dedos!.clone().lerp(eFim.dedos, 0.5).normalize(), palma: V(-0.95, 0.1, 0.25), f: ABRE },
    segura(T.alto + 0.04, ABRE, V(0.075, -0.02, -0.03)),
    segura(T.pousa - 0.05, ABRE),
    segura(T.solta, ABRE),
    segura(T.fecha, eFim.f),
    segura(dur, eFim.f),
  ];
  const E = trilha(b, 'E', chavesE);

  // ── a direita: pega pelas duas pontas, por cima ──
  const cotoveloD = entrega.cotovelo?.D;
  const RAIO_DA_PONTA = 0.0045;
  const deLa = C.clone().addScaledVector(comprido, CARTA.comp / 2 + RAIO_DA_PONTA - 0.001);
  const deCa = C.clone().addScaledVector(comprido, -(CARTA.comp / 2 + RAIO_DA_PONTA - 0.001));
  const lado = V(comprido.z, 0, -comprido.x); // para a direita de quem olha ao comprido
  /** A folga de cada esfera da mão direita com o baralho deitado em C (negativa = entrou). */
  const folgaComOBaralho = () => {
    let pior = Infinity;
    for (const e of b.esferasNoMundo('D')) {
      const q = e.p.clone().sub(C).applyQuaternion(deitado.clone().invert());
      const d = [Math.abs(q.x) - CARTA.larg / 2, Math.abs(q.y) - BARALHO.alto / 2, Math.abs(q.z) - CARTA.comp / 2];
      pior = Math.min(pior, Math.hypot(Math.max(d[0], 0), Math.max(d[1], 0), Math.max(d[2], 0)) + Math.min(Math.max(d[0], d[1], d[2]), 0) - e.r);
    }
    return pior;
  };
  // a mão em arco por cima do baralho, os dedos apontando ao comprido e para baixo: procura-se o
  // quanto ela inclina e o quanto os dedos dobram para o médio pousar na ponta de lá e o polegar alcançar a de cá
  let melhor: { nota: number; chave: Chave; polegar: number[]; falta: number; folga: number; jeito: string } | undefined;
  const JEITOS: [string, Dedos][] = [
    ['palco', PALCO],
    ['arco', ARCO],
    ['garra', GARRA],
  ];
  /** A dobra do punho da direita (radianos) na pose em que o boneco está: o ângulo entre o antebraço e os dedos. */
  const dobraDoPunho = (dedos: THREE.Vector3) => {
    const rumo = b.ancora('D', 'punho').sub(new THREE.Vector3().setFromMatrixPosition(b.osso('antebraco.D').matrixWorld)).normalize();
    return Math.acos(Math.min(1, rumo.dot(dedos)));
  };
  /** A mesma pegada com o baralho já na mão esquerda (inclinado e mais alto): a chave, levada com ele. */
  const levada = (chave: Chave, pos: THREE.Vector3, quat: THREE.Quaternion): Chave => {
    const rot = quat.clone().multiply(deitado.clone().invert());
    return { ...chave, em: pos.clone().add(chave.em!.clone().sub(C).applyQuaternion(rot)), dedos: chave.dedos!.clone().applyQuaternion(rot), palma: chave.palma!.clone().applyQuaternion(rot) };
  };
  const posarD = (chave: Chave) => {
    b.zerar();
    b.raiz.updateMatrixWorld(true);
    posar(b, 'D', trilha(b, 'D', [chave, { ...chave, t: chave.t + 1 }])(chave.t), cotoveloD);
    ossoD.updateWorldMatrix(true, true);
  };
  medidasDaPegada.lista = [];
  for (const [nomeDoJeito, f] of JEITOS) {
    for (const desce of [0, 0.1, 0.2, 0.3, 0.5]) {
      for (const torce of [0.25, 0.4, 0.5, 0.6, 0.75]) {
        const dedos = comprido.clone().applyAxisAngle(EIXO_Y, torce).multiplyScalar(Math.cos(desce)).add(V(0, -Math.sin(desce), 0));
        const paraOLado = V(dedos.z, 0, -dedos.x).normalize();
        const palma = dedos.clone().cross(paraOLado).normalize();
        if (palma.y > 0) palma.negate();
        const chave: Chave = { t: T.pega, ponto: 'ponta_m', em: deLa.clone(), f, dedos, palma };
        posarD(chave);
        const achado = polegarEm(b, 'D', f, ossoD.worldToLocal(deCa.clone()));
        b.dedos('D', [...f.slice(0, 16), ...achado.ang]);
        ossoD.updateWorldMatrix(true, true);
        const folga = folgaComOBaralho();
        const naMesa0 = dobraDoPunho(dedos);
        const naPalma = levada(chave, naMao.pos, naMao.quat);
        posarD(naPalma);
        const dobra = Math.max(naMesa0, dobraDoPunho(naPalma.dedos!));
        const nota = achado.falta + 3 * Math.max(0, -0.0035 - folga) + 0.012 * Math.max(0, dobra - 0.3);
        const jeito = `${nomeDoJeito} desce ${desce} torce ${torce}: falta ${(achado.falta * 1000).toFixed(1)} mm, folga ${(folga * 1000).toFixed(1)} mm, punho ${(naMesa0 * 57.3).toFixed(0)}° na mesa e ${(dobra * 57.3).toFixed(0)}° no pior`;
        medidasDaPegada.lista.push(`${nota.toFixed(4)}  ${jeito}`);
        if (!melhor || nota < melhor.nota) melhor = { nota, chave, polegar: achado.ang, falta: achado.falta, folga, jeito };
      }
    }
  }
  const pegada = melhor!;
  medidasDaPegada.falta = pegada.falta;
  medidasDaPegada.folga = pegada.folga;
  medidasDaPegada.jeito = pegada.jeito;
  const fD = pegada.chave.f;
  const PEGA: Dedos = [...fD.slice(0, 16), ...pegada.polegar];
  /** A mesma, aberta (antes de fechar nas pontas, e ao soltar): os dedos mais esticados e o polegar dois centímetros para cá da ponta do baralho. */
  posarD(pegada.chave);
  const PEGA_ABERTA: Dedos = [...fD.slice(0, 12).map((v) => v * 0.7), ...fD.slice(12, 16), ...polegarEm(b, 'D', fD, ossoD.worldToLocal(deCa.clone().addScaledVector(comprido, -0.02).add(V(0, 0.006, 0))), undefined, undefined, pegada.polegar).ang];
  // o baralho preso à direita, do jeito que ela o pega em C
  b.zerar();
  b.raiz.updateMatrixWorld(true);
  posar(b, 'D', trilha(b, 'D', [{ ...pegada.chave, f: PEGA }, { ...pegada.chave, f: PEGA, t: T.pega + 1 }])(T.pega), cotoveloD);
  const presoD = dentroDe(ossoD, C, deitado);
  /** A direita com o baralho levado, por inteiro, de deitado em C para `pos`/`quat`. */
  const levando = (t: number, pos: THREE.Vector3, quat: THREE.Quaternion, f: Dedos = PEGA): Chave => {
    const rot = quat.clone().multiply(deitado.clone().invert());
    return { t, ponto: 'ponta_m', em: pos.clone().add(deLa.clone().sub(C).applyQuaternion(rot)), f, como: PEGA, dedos: pegada.chave.dedos!.clone().applyQuaternion(rot), palma: pegada.chave.palma!.clone().applyQuaternion(rot) };
  };
  const dFim = fim.maos.D;
  const acima = naMao.pos.clone().add(V(0, 0.03, 0));
  const chavesD: Chave[] = [
    descanso('D', 0),
    // espera por cima, um pouco atrás, até a esquerda sair
    levando(T.larga, C.clone().add(V(0, 0.12, 0)).addScaledVector(comprido, -0.03).addScaledVector(lado, 0.05), deitado, PEGA_ABERTA),
    levando(T.pega - 0.12, C.clone().add(V(0, 0.035, 0)), deitado, PEGA_ABERTA),
    levando(T.pega, C, deitado),
    levando(T.sobe, C, deitado),
    levando(T.alto, acima, naMao.quat),
    levando(T.pousa, naMao.pos, naMao.quat),
    levando(T.solta, naMao.pos, naMao.quat),
    // solta: abre os dedos e sobe, e vai para o lado do baralho, de onde tira a primeira carta
    levando(T.fecha, naMao.pos.clone().add(V(0, 0.04, 0)).addScaledVector(comprido, -0.015), naMao.quat, PEGA_ABERTA),
    // (por cima e pelo lado de fora: direto, a mão atravessaria o baralho)
    { t: T.fecha + 0.22, ponto: 'punho', em: dFim.punho.clone().add(V(-0.035, 0.075, -0.03)), dedos: dFim.dedos.clone(), palma: dFim.palma.clone(), f: dFim.f },
    { t: dur, ponto: 'punho', em: dFim.punho.clone(), dedos: dFim.dedos.clone(), palma: dFim.palma.clone(), f: dFim.f },
  ];
  const D = trilha(b, 'D', chavesD);

  return {
    id,
    nome,
    dur,
    E,
    D,
    cotovelo: entrega.cotovelo,
    objetos: (t, bo) => {
      const baralho = (pos: THREE.Vector3, quat: THREE.Quaternion): Objeto[] => [{ tipo: 'baralho', pos, quat }];
      if (t >= T.solta) return baralho(...paraFora(cartaNoMundo(bo, 'E', presoE)));
      if (t >= T.sobe) return baralho(...paraFora(cartaNoMundo(bo, 'D', presoD)));
      if (t >= T.chega) return baralho(C.clone(), deitado.clone());
      if (t < T.parte) return baralho(M.clone(), girar(EIXO_Y, giroDaMesa));
      // arrastado: vai com as pontas dos dedos da esquerda, e vira aos poucos
      const dedos = bo.ancora('E', 'dedos');
      const u = macio(entre(T.parte, T.chega, t));
      return baralho(V(dedos.x, M.y, dedos.z), girar(EIXO_Y, giroDaMesa + (giroNaMao - giroDaMesa) * u));
    },
  };
}

const paraFora = (o: { pos: THREE.Vector3; quat: THREE.Quaternion }): [THREE.Vector3, THREE.Quaternion] => [o.pos, o.quat];

/** A mesma animação de trás para a frente (pousar o que se pegou: as mãos fazem o caminho inverso). */
function aoContrario(c: Clipe, id: string, nome: string): Clipe {
  return { ...c, id, nome, E: (t) => c.E(c.dur - t), D: (t) => c.D(c.dur - t), ajuste: c.ajuste && ((t, maos) => c.ajuste!(c.dur - t, maos)), objetos: c.objetos && ((t, bo) => c.objetos!(c.dur - t, bo)) };
}

/**
 * Pousar o baralho de volta no lugar dele, depois de dar as cartas: `pegarBaralho` de trás para a
 * frente — a direita o tira da palma pelas pontas e o deita na mesa, e a esquerda o arrasta até lá.
 */
export function pousarBaralho(b: Boneco, onde: BaralhoNaMesa = BARALHO_NA_MESA, id = 'pousar-baralho', nome = 'Pousar o baralho'): Clipe {
  return aoContrario(pegarBaralho(b, onde), id, nome);
}

/**
 * A mão esquerda com o baralho, como fica ao fim de `pegarBaralho` (e durante a entrega): o estado
 * dela e onde o baralho fica dentro dela. É com isto que quem dá as cartas continua segurando o
 * baralho enquanto faz outra coisa com a direita.
 */
export function maoComOBaralho(b: Boneco, onde: BaralhoNaMesa = BARALHO_NA_MESA, pousada = false): { mao: EstadoDaMao; baralho: (bo: Boneco) => Objeto } {
  const pega = pegarBaralho(b, onde);
  const mao = poseDe(pega, pega.dur).maos.E;
  const baralho = (bo: Boneco) => pega.objetos!(pega.dur, bo)[0];
  if (pousada) {
    // (para esperar com ele: a mão desce até as costas dela — ou o baralho — encostarem na mesa, em vez de ficar no ar)
    b.zerar();
    b.raiz.updateMatrixWorld(true);
    posar(b, 'E', mao);
    const o = baralho(b);
    let fundo = b.folga('E');
    for (const [x, y, z] of [[1, 1, 1], [1, 1, -1], [-1, 1, 1], [-1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, -1, 1], [-1, -1, -1]]) {
      fundo = Math.min(fundo, V((x * CARTA.larg) / 2, (y * BARALHO.alto) / 2, (z * CARTA.comp) / 2).applyQuaternion(o.quat).add(o.pos).y - MESA);
    }
    mao.punho.y -= Math.max(0, fundo - 0.001);
  }
  return { mao, baralho };
}

/** Pegar o baralho, esperar um instante com ele na mão e pousá-lo: para ver e conferir na página (começa e acaba no descanso). */
export function pegarEPousarBaralho(b: Boneco, onde: BaralhoNaMesa = BARALHO_NA_MESA): Clipe {
  const pega = pegarBaralho(b, onde);
  const pousa = aoContrario(pega, 'pousar-baralho', 'Pousar o baralho');
  const PAUSA = 0.6;
  const de = (t: number) => (t < pega.dur + PAUSA ? { c: pega, t: Math.min(t, pega.dur) } : { c: pousa, t: t - pega.dur - PAUSA });
  return {
    id: 'baralho',
    nome: 'Pegar e pousar o baralho',
    dur: pega.dur + PAUSA + pousa.dur,
    E: (t) => de(t).c.E(de(t).t),
    D: (t) => de(t).c.D(de(t).t),
    cotovelo: pega.cotovelo,
    objetos: (t, bo) => de(t).c.objetos!(de(t).t, bo),
  };
}

/**
 * Entregar à mesa toda, para ver e conferir na página: o dealer no meio de um lado comprido de uma
 * mesa de seis lugares, uma carta para cada um (o primeiro à esquerda dele, em volta, até ele mesmo),
 * em ritmo de jogo. Cobre os alvos difíceis: os dois vizinhos, quase ao lado, e as próprias cartas.
 */
export function entregarAMesa(b: Boneco): Clipe {
  return entregarCartas(b, ALVOS_DA_MESA.map((alvo) => ({ alvo })), { cada: 1.1 }, 'entregar-mesa', 'Entregar à mesa');
}
/** Diante de cada um dos seis lugares de uma mesa de 2,34 × 1,24 m, vistos do dealer (no meio do lado de baixo). */
const ALVOS_DA_MESA: [number, number][] = [
  [0.93, 0.5],
  [0.62, 1.02],
  [0, 1.04],
  [-0.62, 1.02],
  [-0.93, 0.5],
  [-0.04, 0.56],
];

/**
 * Abrir as cartas da mesa, como dealer: o flop (três cartas, uma atrás da outra), o turn e o river.
 * É a entrega de sempre — o polegar da esquerda empurra a carta de cima, a direita a tira do baralho —,
 * mas a carta sai com o punho virando a palma para cima e vira de frente para cima no ar, pousando
 * aberta no lugar dela. `onde` são os lugares das cartas (x, z, vistos do dealer), uma animação para
 * quantas forem (três no flop, uma no turn, uma no river), e `giro`, como elas ficam deitadas.
 */
export function abrirCartas(b: Boneco, onde: [number, number][] = MESA_ABERTA, giro = 0, opcoes: Partial<Entrega> = {}, id = 'abrir', nome = 'Abrir cartas (dealer)'): Clipe {
  return entregarCartas(b, onde.map((alvo) => ({ alvo, giro, aberta: true })), { cada: 1.3, ...opcoes }, id, nome);
}
/** As cinco cartas da mesa, lado a lado, à frente do dealer (no meio de uma mesa de 1,24 m de largura). */
const MESA_ABERTA: [number, number][] = [-2, -1, 0, 1, 2].map((k) => [-k * 0.075, 0.74]);

/** O que se pode acertar na desistência (as medidas em metros, vistas de quem desiste). */
export interface Desistencia {
  /** Onde estão as duas cartas dele na mesa (x, z). */
  cartas: [[number, number], [number, number]];
  /** Para onde elas vão: o monte das cartas mortas, no meio da mesa. */
  alvo: [number, number];
}
export const DESISTENCIA: Desistencia = {
  cartas: [
    [0.04, 0.47],
    [-0.04, 0.47],
  ],
  alvo: [0, 0.95],
};

/**
 * Desistir da mão: a direita junta as duas cartas e as joga para o meio da mesa; a esquerda
 * continua em descanso, de palma para baixo.
 *  - A direita vem por cima, arqueada, e pousa as pontas dos dedos na carta mais longe dela.
 *  - Arrasta essa carta para cima da outra, a do lado dela: as duas ficam juntas, a de cima um pouco torta.
 *  - Com as pontas dos dedos ainda em cima delas, recua um nada (o embalo) e as lança para a frente,
 *    rente ao feltro, num movimento só, soltando-as de passagem: a mão segue um pouco, levanta e
 *    abre, e as cartas deslizam girando até o monte, uma se afastando da outra.
 * Do lance da entrega ela tem o desenho: a mão solta as cartas em movimento, e elas seguem sozinhas,
 * girando e freando.
 */
export function desistir(b: Boneco, { cartas, alvo }: Desistencia = DESISTENCIA): Clipe {
  const dur = 3.4;
  const T = { toca: 0.62, junta: 1.05, firma: 1.17, recua: 1.42, solta: DESISTIR_SOLTA, segue: 1.74, volta: 2.7 };
  // a mão busca a carta mais longe dela (a de x maior) e a traz para cima da que está do lado dela:
  // é dali, mais perto do ombro direito, que o braço alcança para lançar
  const [fica, vem] = [...cartas].sort((p, q) => p[0] - q[0]).map(([x, z]) => naMesa(x, z, CARTA.alto / 2));
  /** Onde a carta arrastada fica em cima da outra (um pouco torta), e como cada uma está virada. */
  const emCima = fica.clone().add(V(0.007, CARTA.alto, -0.004));
  const GIROS = { fica: -0.06, vem: 0.22, vemEmCima: -0.14 };
  /** O rumo do lance, e de onde a onde a mão leva as cartas: recua um nada e lança. */
  const rumo = V(alvo[0] - fica.x, 0, alvo[1] - fica.z).normalize();
  const RECUA = 0.025;
  const LANCA = 0.11;
  /** As pontas dos dedos em cima de uma carta (o ponto de apoio fica um nada acima dela: os dedos a apertam de leve). */
  const sobre = (carta: THREE.Vector3, anda = 0, sobe = 0) => carta.clone().addScaledVector(rumo, anda).add(V(0, CARTA.alto / 2 + 0.0012 + sobe, 0));
  // a mão de palma para baixo, arqueada, de punho reto (os dedos na linha do antebraço)
  const chave = (t: number, em: THREE.Vector3, f: Dedos = ARCO) => deCimaDePunhoReto(b, 'D', { t, ponto: 'dedos', em, f }, 0);
  const D = trilha(b, 'D', [
    descanso('D', 0),
    chave(T.toca - 0.2, sobre(vem, 0, 0.03).add(V(0, 0, -0.012))),
    // pousa na carta de lá e para um instante
    chave(T.toca, sobre(vem)),
    chave(T.toca + 0.07, sobre(vem)),
    // arrasta-a para cima da outra
    chave(T.junta, sobre(emCima)),
    chave(T.firma, sobre(emCima)),
    // o embalo e o lance, num movimento só: as cartas são soltas de passagem
    chave(T.recua, sobre(emCima, -RECUA)),
    chave(T.solta, sobre(emCima, LANCA)),
    chave(T.segue, sobre(emCima, LANCA + 0.045, 0.04), POUSADA),
    descanso('D', T.volta),
    descanso('D', dur),
  ]);
  // onde as pontas dos dedos estão (no chão) ao soltar: é de lá que as cartas partem
  b.zerar();
  b.raiz.updateMatrixWorld(true);
  posarNaMesa(b, 'D', D(T.solta));
  const largada = b.ancora('D', 'dedos').setY(0);
  const levado = largada.clone().sub(emCima.clone().setY(0));
  /** Cada carta depois de solta: de onde parte, onde para (as duas se afastam), quanto gira e quanto tempo desliza. */
  const fim = naMesa(alvo[0], alvo[1], CARTA.alto / 2);
  const voo = 0.45 + 0.35 * fim.distanceTo(fica);
  const soltas = [
    { de: fica.clone().add(levado), ate: fim.clone().add(V(0.035, 0, 0.02)), giro0: GIROS.fica, gira: 0.4 * 2 * Math.PI },
    { de: emCima.clone().add(levado), ate: fim.clone().add(V(-0.04, 0, -0.03)), giro0: GIROS.vemEmCima, gira: -0.6 * 2 * Math.PI },
  ];
  return {
    id: 'desistir',
    nome: 'Desistir da mão',
    dur,
    E: parada(b, 'E', dur),
    D,
    ajuste: (t, maos) => {
      // (só a esquerda respira: a direita está ocupada)
      maos.E.punho.y += 0.0011 * Math.sin((2 * Math.PI * t) / dur);
    },
    objetos: (t, bo) => {
      const carta = (pos: THREE.Vector3, giro: number, n: number, pousada = false): Objeto => ({ tipo: 'carta', pos, quat: girar(EIXO_Y, giro), n, pousada });
      if (t >= T.solta) {
        // soltas: deslizam rente ao feltro, girando e freando; a de cima desce para a mesa ao se afastar da outra
        const u = PASSOS.freia(entre(T.solta, T.solta + voo, t));
        return soltas.map((c, i) => {
          const pos = c.de.clone().lerp(c.ate, u);
          pos.y = i === 0 ? fica.y : emCima.y + (fica.y - emCima.y) * macio(entre(0.1, 0.5, u));
          return carta(pos, c.giro0 + c.gira * u, i, u >= 1);
        });
      }
      // presas debaixo das pontas dos dedos: a de lá desde que a mão pousa nela, a outra desde que as duas se juntam
      const dedos = bo.ancora('D', 'dedos');
      const anda = (de: THREE.Vector3, desde: THREE.Vector3) => de.clone().add(V(dedos.x - desde.x, 0, dedos.z - desde.z));
      const u = macio(entre(T.toca + 0.07, T.junta, t));
      const aQueVem = t < T.toca ? vem.clone() : anda(t < T.junta ? vem : emCima, t < T.junta ? vem : emCima);
      // (enquanto é arrastada, sobe para cima da outra e vai se endireitando)
      if (t >= T.toca && t < T.junta) aQueVem.y = vem.y + (emCima.y - vem.y) * macio(entre(0.55, 0.85, u));
      return [carta(t < T.firma ? fica.clone() : anda(fica, emCima), GIROS.fica, 0), carta(aQueVem, GIROS.vem + (GIROS.vemEmCima - GIROS.vem) * u, 1)];
    },
  };
}

/**
 * Empurra uma ficha no rumo `fora` até ela não entrar em nenhuma das esferas da mão (as do polegar
 * não contam: é ele quem a carrega). A ficha descansa na mão; não passa por dentro dela.
 */
function livrarFicha(esferas: { p: THREE.Vector3; r: number }[], pos: THREE.Vector3, quat: THREE.Quaternion, fora: THREE.Vector3) {
  const inv = quat.clone().invert();
  const q = new THREE.Vector3();
  const MARGEM = 0.0004;
  for (let volta = 0; volta < 8; volta++) {
    let pior = Infinity;
    for (let i = 0; i < esferas.length; i++) {
      if (i >= 16 && i < 19) continue;
      q.copy(esferas[i].p).sub(pos).applyQuaternion(inv);
      const d0 = Math.hypot(q.x, q.z) - FICHA.raio;
      const d1 = Math.abs(q.y) - FICHA.alto / 2;
      pior = Math.min(pior, Math.hypot(Math.max(d0, 0), Math.max(d1, 0)) + Math.min(Math.max(d0, d1), 0) - esferas[i].r);
    }
    if (pior >= MARGEM) break;
    pos.addScaledVector(fora, MARGEM - pior + 0.0002);
  }
}

/**
 * Brincar com uma ficha: ela rola por cima dos dedos, do indicador ao mínimo; dá a volta pelo lado
 * do mínimo, encostada nele; volta por baixo dos dedos, em cima do polegar, que a vai buscar; e sobe
 * pelo lado do indicador, de novo para cima. Em todo o caminho ela fica encostada na mão, por fora.
 */
function girarFicha(b: Boneco): Clipe {
  const dur = 2.8;
  const IDA = 1.6;
  /** A que distância do meio do osso do dedo fica o meio da ficha deitada nele (antes de ser empurrada para fora do que estiver no caminho). */
  const ENCOSTADA = 0.0092;
  /** As fatias da volta: a ficha dá a volta no mínimo, passa por baixo e dá a volta no indicador. */
  const VOLTA = { minimo: 0.28, indicador: 0.72 };
  const pose: Chave = { t: 0, ponto: 'punho', em: naMesa(-0.13, 0.33, 0.1), f: PALCO, dedos: V(0.62, 0, 0.78) };
  const D = trilha(b, 'D', [pose, { ...pose, t: dur }]);
  /** Em que dedo a ficha está (0 = indicador … 3 = mínimo), andando aos trancos: deita num dedo, fica de pé no vão, deita no seguinte. */
  const onde = (t: number) => {
    const p = entre(0, IDA, t) * 3;
    const k = Math.min(2, Math.floor(p));
    return k + macio(p - k);
  };
  const calombo = (x: number) => Math.exp(-(x * x) / 0.12);
  /** Os quatro dedos no instante t: o que está debaixo da ficha sobe, o que vai recebê-la desce. */
  const mexerOsDedos = (t: number, f: Dedos) => {
    const volta = entre(IDA, dur, t);
    const s = onde(t);
    for (let k = 0; k < 4; k++) {
      let sobe = calombo(s - k);
      let desce = k > 0 ? calombo(s - k + 0.55) : 0;
      if (t > IDA) {
        sobe = k === 3 ? 1 - macio(volta * 2) : k === 0 ? macio(volta * 2 - 1) : 0;
        desce = k > 0 ? calombo(0.55 - k) * macio(volta * 2 - 1) : 0;
      }
      f[k * 3] += 9 * desce - 9 * sobe;
    }
  };
  /** A ficha no instante t, com a mão direita já posada: o lugar, a rotação, e para que lado fica "fora da mão". */
  const fichaEm = (bo: Boneco, t: number) => {
    const meio = (k: number) => bo.junta('D', k, 1).add(bo.junta('D', k, 2)).multiplyScalar(0.5);
    const cima = (k: number) => V(0, 1, 0).applyQuaternion(bo.osso(NOMES_DOS_DEDOS[k] + '1.D').getWorldQuaternion(new THREE.Quaternion()));
    const aoLongo = bo.junta('D', 1, 2).sub(bo.junta('D', 1, 1)).normalize();
    const deLado = meio(3).sub(meio(0));
    deLado.addScaledVector(aoLongo, -aoLongo.dot(deLado)).normalize();
    let centro: THREE.Vector3;
    let normal: THREE.Vector3;
    let fora: THREE.Vector3;
    if (t <= IDA) {
      // por cima: deitada num dedo, de pé no vão, deitada no seguinte
      const s = onde(t);
      const k = Math.min(2, Math.floor(s));
      const ang = Math.PI * s;
      fora = cima(k).lerp(cima(k + 1), s - k).normalize();
      normal = fora.clone().multiplyScalar(Math.cos(ang)).addScaledVector(deLado, Math.sin(ang));
      centro = meio(k).lerp(meio(k + 1), s - k).addScaledVector(fora, ENCOSTADA + 0.0046 * Math.abs(Math.sin(ang)));
    } else {
      const u = macio(entre(IDA, dur, t));
      if (u < VOLTA.minimo || u > VOLTA.indicador) {
        // em volta de um dedo, encostada nele: do dorso, pelo lado de fora, até embaixo (ou o contrário)
        const k = u < VOLTA.minimo ? 3 : 0;
        const ang = u < VOLTA.minimo ? (Math.PI * u) / VOLTA.minimo : Math.PI * (1 + (u - VOLTA.indicador) / (1 - VOLTA.indicador));
        fora = cima(k).multiplyScalar(Math.cos(ang)).addScaledVector(deLado, Math.sin(ang)).normalize();
        normal = fora.clone();
        centro = meio(k).addScaledVector(fora, ENCOSTADA);
      } else {
        // por baixo dos dedos, do mínimo ao indicador
        const w = (u - VOLTA.minimo) / (VOLTA.indicador - VOLTA.minimo);
        fora = cima(3).lerp(cima(0), w).normalize().negate();
        normal = fora.clone();
        centro = meio(3).lerp(meio(0), w).addScaledVector(fora, ENCOSTADA);
      }
    }
    normal.addScaledVector(aoLongo, -aoLongo.dot(normal)).normalize();
    const quat = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(aoLongo, normal, aoLongo.clone().cross(normal)));
    livrarFicha(bo.esferasNoMundo('D'), centro, quat, fora);
    return { centro, quat, fora, deLado };
  };

  // o polegar na volta: vai por baixo dos dedos e fica encostado por baixo da ficha enquanto ela
  // passa. O jeito dele é achado em cinco pontos da passagem, com a mão como ela está em cada um.
  const maoD = b.osso('mao.D');
  const RAIO_DA_PONTA = 0.0052;
  const pontaDoPolegar = () => b.esferasNoMundo('D')[16].p;
  const REPOUSO = PALCO.slice(16);
  const passos: [number, number[]][] = [[0.14, REPOUSO]];
  let jeito: number[] | undefined;
  for (const fatia of [0.36, 0.43, 0.5, 0.57, 0.64]) {
    const t = IDA + (dur - IDA) * fatia;
    const estado = D(t);
    mexerOsDedos(t, estado.f);
    b.zerar();
    b.raiz.updateMatrixWorld(true);
    posar(b, 'D', estado);
    const ficha = fichaEm(b, t);
    // por baixo da ficha, do lado dela que fica para o polegar
    const alvo = maoD.worldToLocal(ficha.centro.clone().addScaledVector(ficha.fora, FICHA.alto / 2 + RAIO_DA_PONTA + 0.0004).addScaledVector(ficha.deLado, -0.008));
    jeito = polegarEm(b, 'D', estado.f, alvo, undefined, pontaDoPolegar, jeito).ang;
    passos.push([fatia, jeito]);
  }
  passos.push([0.88, REPOUSO]);
  const polegarNaVolta = (fatia: number): number[] => {
    if (fatia <= passos[0][0] || fatia >= passos[passos.length - 1][0]) return REPOUSO;
    let i = 0;
    while (fatia > passos[i + 1][0]) i++;
    const u = macio(entre(passos[i][0], passos[i + 1][0], fatia));
    return passos[i][1].map((x, k) => x + (passos[i + 1][1][k] - x) * u);
  };

  return {
    id: 'girar',
    nome: 'Brincar com a ficha',
    dur,
    E: parada(b, 'E', dur),
    D,
    ajuste: (t, maos) => {
      mexerOsDedos(t, maos.D.f);
      const p = polegarNaVolta(entre(IDA, dur, t));
      for (let k = 0; k < 5; k++) maos.D.f[16 + k] = p[k];
      maos.D.punho.y += 0.003 * Math.sin((2 * Math.PI * t) / dur);
    },
    objetos: (t, bo) => {
      const ficha = fichaEm(bo, t);
      return [{ tipo: 'ficha', pos: ficha.centro, quat: ficha.quat, cor: 0xe9b84a }];
    },
  };
}

/**
 * Os instantes de "ganhar o pote" e os lugares do monte, nas coordenadas de quem ganha: onde o pote
 * pousa (`chega`), até onde ele o puxa (`fica`: à frente da pilha dele, fora de onde a mão descansa), quando as pontas dos dedos
 * pousam atrás do monte (`toca`), quando começam a puxar (`puxa`), quando chegam (`junta`) e quando
 * largam (`solta`). `alem` é o quanto as pontas dos dedos ficam além do meio do monte.
 */
export const GANHAR = { chega: [-0.19, 0.525] as [number, number], fica: [-0.31, 0.47] as [number, number], toca: 0.75, puxa: 0.82, junta: 1.35, solta: 1.5, alem: 0.05 };

/**
 * Ganhar o round: a direita puxa o pote e a esquerda comemora.
 *  - O pote chega pela mesa e para à frente e à direita de quem ganhou (fora das cartas dele).
 *  - A direita, de palma para baixo e punho reto, em garra, pousa as pontas dos dedos na mesa do lado
 *    de lá do monte e o traz para junto da pilha de fichas dele; larga e volta ao descanso.
 *  - A esquerda fecha o punho, sobe (o lado do polegar para cima, a mão na linha do antebraço) e dá
 *    duas sacudidas curtas — o "isso!" —, e volta a pousar aberta.
 */
export function ganhar(b: Boneco, fora?: Retangulo, id = 'ganhar'): Clipe {
  const dur = 2.6;
  const T = GANHAR;
  // (com as cartas abertas na frente, o descanso é o de fora delas — veja `idleAbertas`)
  const descanso = repousoDe(b, fora);
  const H0 = naMesa(T.chega[0], T.chega[1]);
  const H1 = naMesa(T.fica[0], T.fica[1]);
  // (as pontas dos dedos na mesa, além do monte; a mão em arco por cima dele)
  const garra = (t: number, monte: THREE.Vector3, sobe = 0, f: Dedos = ARCO) => deCimaDePunhoReto(b, 'D', { t, ponto: 'dedos', em: monte.clone().add(V(0, 0.004 + sobe, T.alem)), f }, 0);
  const D = trilha(b, 'D', [
    descanso('D', 0),
    garra(T.toca - 0.22, H0, 0.055),
    garra(T.toca, H0),
    garra(T.puxa, H0),
    garra(T.junta, H1),
    garra(T.solta, H1),
    garra(T.solta + 0.17, H1, 0.05, POUSADA),
    descanso('D', 2.2),
    descanso('D', dur),
  ]);
  // a esquerda: o punho fechado, de lado (o polegar para cima), sobe e sacode duas vezes
  const punho = (t: number, alto: number, passo?: Passo): Chave => ({ ...dePunhoReto(b, 'E', { t, ponto: 'punho', em: naMesa(0.2, 0.27, alto), f: PUNHO }, V(0, 1, 0)), passo });
  const E = trilha(b, 'E', [
    descanso('E', 0),
    descanso('E', 0.8),
    punho(1.14, 0.17),
    punho(1.3, 0.115, 'bate'),
    punho(1.5, 0.165),
    punho(1.66, 0.115, 'bate'),
    punho(1.86, 0.14),
    descanso('E', 2.3),
    descanso('E', dur),
  ]);
  // o monte, para ver na página: três colunas de cinco fichas, juntas (no jogo, é o pote de verdade)
  const COLUNAS: [number, number][] = [
    [-0.021, 0.012],
    [0.021, 0.012],
    [0, -0.026],
  ];
  const DE_LONGE = H0.clone().add(V(0.1, 0, 0.42));
  return {
    id,
    nome: 'Ganhar o pote',
    dur,
    E,
    D,
    objetos: (t, bo) => {
      // chega deslizando do meio da mesa; depois vai com as pontas dos dedos; largado, fica
      let centro: THREE.Vector3;
      if (t < T.puxa) centro = DE_LONGE.clone().lerp(H0, PASSOS.freia(entre(0.15, T.toca - 0.08, t)));
      else if (t < T.solta) {
        const dedos = bo.ancora('D', 'dedos');
        centro = V(dedos.x, MESA, dedos.z - T.alem);
      } else centro = H1.clone();
      const objs: Objeto[] = [];
      COLUNAS.forEach(([x, z], c) => {
        for (let i = 0; i < 5; i++) objs.push({ tipo: 'ficha', pos: V(centro.x + x, MESA + (i + 0.5) * FICHA.alto, centro.z + z), quat: new THREE.Quaternion(), cor: (i + c) % 2 ? 0xe0b040 : 0xc99a2e });
      });
      return objs;
    },
  };
}

/** O meio do monte de "ganhar o pote", dadas as fichas que o clipe mostra (a primeira é a de baixo da primeira coluna). */
export function meioDoMonteGanho(objs: Objeto[]): THREE.Vector3 | undefined {
  const primeira = objs.find((o) => o.tipo === 'ficha');
  return primeira && V(primeira.pos.x + 0.021, MESA, primeira.pos.z - 0.012);
}

/** Em que instantes de cada "check" a mão bate na mesa (para o som cair junto). */
export const BATIDAS: Record<string, number[]> = { 'check-nos': [0.56, 0.84], 'check-dedos': [0.55, 0.82], 'check-palma': [0.6, 0.92] };

/** Em que instante de "desistir" as cartas são lançadas (para o som cair junto). */
export const DESISTIR_SOLTA = 1.6;

/** Check batendo os nós dos dedos na mesa, duas vezes. */
function checkNos(b: Boneco): Clipe {
  const dur = 2.2;
  const dedos = V(0.25, 0, 0.97);
  const em = (alto: number) => naMesa(-0.11, 0.44, alto);
  return {
    id: 'check-nos',
    nome: 'Check: nós dos dedos',
    dur,
    E: parada(b, 'E', dur),
    D: trilha(b, 'D', [
      descanso('D', 0),
      { t: 0.42, ponto: 'nos', em: em(0.07), f: PUNHO, dedos },
      { t: 0.56, ponto: 'nos', em: em(0.0085), f: PUNHO, dedos, passo: 'bate' },
      { t: 0.7, ponto: 'nos', em: em(0.04), f: PUNHO, dedos, passo: 'freia' },
      { t: 0.84, ponto: 'nos', em: em(0.0085), f: PUNHO, dedos, passo: 'bate' },
      { t: 1.05, ponto: 'nos', em: em(0.055), f: PUNHO, dedos, passo: 'freia' },
      descanso('D', 1.75),
      descanso('D', dur),
    ]),
  };
}

/** Check com dois toques das pontas do indicador e do médio. */
function checkDedos(b: Boneco): Clipe {
  const dur = 2.2;
  const dedos = V(0.2, 0, 0.98);
  const em = (alto: number) => naMesa(-0.1, 0.47, alto);
  return {
    id: 'check-dedos',
    nome: 'Check: dois dedos',
    dur,
    E: parada(b, 'E', dur),
    D: trilha(b, 'D', [
      descanso('D', 0),
      { t: 0.42, ponto: 'ponta_m', em: em(0.055), f: DOIS_NO_ALTO, dedos },
      { t: 0.55, ponto: 'ponta_m', em: em(0.003), f: DOIS, dedos, passo: 'bate' },
      { t: 0.69, ponto: 'ponta_m', em: em(0.04), f: DOIS_NO_ALTO, dedos, passo: 'freia' },
      { t: 0.82, ponto: 'ponta_m', em: em(0.003), f: DOIS, dedos, passo: 'bate' },
      { t: 1.02, ponto: 'ponta_m', em: em(0.05), f: DOIS_NO_ALTO, dedos, passo: 'freia' },
      descanso('D', 1.75),
      descanso('D', dur),
    ]),
  };
}

/** Check com a mão espalmada: dois tapinhas na mesa. */
function checkPalma(b: Boneco): Clipe {
  const dur = 2.4;
  const noAlto = (t: number, alto: number, inclina: number, passo?: Passo): Chave => ({ t, ponto: 'palma', em: naMesa(-0.14, 0.4, alto), f: ABERTA, dedos: V(0.3, inclina, 1), passo });
  const tapa = (t: number): Chave => ({ t, apoio: [-0.165, 0.345], f: ABERTA, passo: 'bate' });
  return {
    id: 'check-palma',
    nome: 'Check: tapinha',
    dur,
    E: parada(b, 'E', dur),
    D: trilha(b, 'D', [descanso('D', 0), noAlto(0.45, 0.06, 0.24), tapa(0.6), noAlto(0.78, 0.035, 0.14, 'freia'), tapa(0.92), { ...tapa(1.25), passo: 'macio' }, descanso('D', 1.85), descanso('D', dur)]),
  };
}

/** Idle 1: as duas mãos espalmadas na mesa; de vez em quando o indicador da direita dá dois toques. */
function idlePlana(b: Boneco): Clipe {
  const dur = 5;
  return {
    id: 'idle-plana',
    nome: 'Idle: espalmadas',
    dur,
    E: parada(b, 'E', dur),
    D: parada(b, 'D', dur),
    ajuste: (t, maos) => {
      respirar(t, maos, dur);
      const toque = pulso((t - 2) / 0.34) + pulso((t - 2.38) / 0.34);
      maos.D.f[0] -= 20 * toque;
      maos.D.f[1] -= 4 * toque;
      // a esquerda abre e fecha os dedos um nada
      for (let k = 0; k < 4; k++) maos.E.f[12 + k] *= 1 + 0.25 * Math.sin((2 * Math.PI * t) / dur);
    },
  };
}

/**
 * Idle 2: uma mão pousada em cima da outra, as duas soltas.
 *  - A de baixo descansa na mesa, com os dedos caídos nela.
 *  - A de cima assenta a palma no dorso da de baixo: com os dedos levantados (para não a segurarem
 *    no alto), experimentam-se a mão mais ou menos inclinada e a palma um pouco para cada lado, e
 *    fica o jeito em que a palma e o punho chegam mais baixo sem uma mão entrar na outra.
 *  - Depois os dedos dela caem, um por um (`deixarCair`): cada um dobra no nó até encostar na mão de
 *    baixo ou na mesa, e o que sobrar para fora do apoio continua dobrando nas juntas seguintes — é
 *    o peso que os leva, não a mão que os estica.
 */
function idleSobrepostas(b: Boneco): Clipe {
  const dur = 5;
  /** O quanto as duas mãos podem se apertar (a pele cede um pouco). */
  const APERTO = 0.002;
  const zera = () => {
    b.zerar();
    b.raiz.updateMatrixWorld(true);
  };
  // a de baixo: o punho onde a mão espalmada o põe, e os dedos caídos na mesa
  const lugarDeBaixo: Chave = { t: 0, apoio: [0.06, 0.33], f: ABERTA, dedos: V(-0.85, 0, 0.53) };
  zera();
  posar(b, 'E', trilha(b, 'E', [lugarDeBaixo, { ...lugarDeBaixo, t: dur }])(0));
  const soltos = [...ABERTA];
  for (let k = 0; k < 4; k++) {
    soltos[k * 3 + 1] = 11 + 2 * k;
    soltos[k * 3 + 2] = 7 + k;
  }
  const deBaixo: Chave = { ...lugarDeBaixo, f: deixarCair(b, 'E', soltos), como: ABERTA };
  const E = trilha(b, 'E', [deBaixo, { ...deBaixo, t: dur }]);
  zera();
  posar(b, 'E', E(0));
  const baixo = b.esferasNoMundo('E');
  const dorso = b.ancora('E', 'costas');
  // para onde apontam os dedos da mão de baixo, e o lado dela, no plano da mesa
  const aoLongo = b.junta('E', 1, 1).sub(b.ancora('E', 'punho')).setY(0).normalize();
  const deLado = V(aoLongo.z, 0, -aoLongo.x);
  // a de cima, com os dedos levantados: a palma desce até encostar
  const levantados = [...POUSADA];
  for (let k = 0; k < 4; k++) levantados[k * 3] = -14;
  levantados[16] = -22;
  let deCima: Chave = { t: 0, ponto: 'palma', em: dorso.clone().add(V(0, 0.02, 0)), f: levantados, dedos: V(0.85, 0, 0.53) };
  let maisBaixa = Infinity;
  for (const inclina of [-0.16, -0.08, 0, 0.08, 0.16]) {
    for (const frente of [-0.01, 0.005, 0.02]) {
      for (const lado of [-0.012, 0, 0.012]) {
        const onde = dorso.clone().addScaledVector(aoLongo, frente).addScaledVector(deLado, lado);
        for (let alto = -0.006; alto < 0.03; alto += 0.0005) {
          const chave: Chave = { t: 0, ponto: 'palma', em: onde.clone().add(V(0, alto, 0)), f: levantados, dedos: V(0.85, inclina, 0.53) };
          const m = trilha(b, 'D', [chave, { ...chave, t: dur }])(0);
          posar(b, 'D', m);
          const entra = Math.max(...b.esferasNoMundo('D').flatMap((c) => baixo.map((d) => c.r + d.r - APERTO - c.p.distanceTo(d.p))));
          if (entra > 0 || b.folga('D') < 0) continue;
          // (baixa a palma e baixo o punho: uma mão largada assenta inteira, não só a palma)
          const nota = alto + 0.6 * (m.punho.y - MESA);
          if (nota < maisBaixa) {
            maisBaixa = nota;
            deCima = chave;
          }
          break;
        }
      }
    }
  }
  // e os dedos dela caem sobre a de baixo (e, o que passar dela, até a mesa)
  zera();
  posar(b, 'E', E(0));
  posar(b, 'D', trilha(b, 'D', [deCima, { ...deCima, t: dur }])(0));
  const largados = [...levantados];
  for (let k = 0; k < 4; k++) {
    largados[k * 3 + 1] = 14 + 2 * k;
    largados[k * 3 + 2] = 9 + k;
  }
  deCima = { ...deCima, f: deixarCair(b, 'D', largados, baixo, 0.0008, 1.5), como: levantados };
  return {
    id: 'idle-sobrepostas',
    nome: 'Idle: uma sobre a outra',
    dur,
    E,
    D: trilha(b, 'D', [deCima, { ...deCima, t: dur }]),
    ajuste: (t, maos) => {
      // as duas respiram juntas, para a de cima não entrar na de baixo
      const sobe = 0.0011 * Math.sin((2 * Math.PI * t) / dur);
      maos.E.punho.y += sobe;
      maos.D.punho.y += sobe;
      // os dedos de cima se mexem um nada de vez em quando (para cima, que para baixo está a outra mão)
      for (let k = 0; k < 4; k++) maos.D.f[k * 3] -= 6 * pulso((t - 2.2 - k * 0.07) / 0.6);
    },
  };
}

/**
 * Idle 3: a direita batuca os dedos na mesa, do mínimo ao indicador. O punho fica apoiado na mesa
 * (onde a mão espalmada o põe) e a mão inclina, com os nós para cima, até as pontas dos dedos em
 * arco encostarem — é como se batuca de verdade; de pé nas pontas dos dedos, o punho ficava um palmo no ar.
 */
function idleBatucando(b: Boneco): Clipe {
  const dur = 5;
  const CICLO = 1.25;
  const lugar: Chave = { t: 0, apoio: [-0.16, 0.33], f: ABERTA };
  b.zerar();
  b.raiz.updateMatrixWorld(true);
  const espalmada = trilha(b, 'D', [lugar, { ...lugar, t: dur }])(0);
  // a menor inclinação com que os dedos em arco não entram na mesa
  let de = 0;
  let ate = 0.9;
  for (let i = 0; i < 14; i++) {
    const meio = (de + ate) / 2;
    posar(b, 'D', inclinada(espalmada, ARCO, meio));
    if (b.folga('D') < 0) de = meio;
    else ate = meio;
  }
  const m = inclinada(espalmada, ARCO, ate);
  posar(b, 'D', m);
  // (e cada dedo desce até a mesa: o que definiu a inclinação já encosta, os outros chegam)
  const arco: Chave = { t: 0, ponto: 'punho', em: m.punho, f: deixarCair(b, 'D', ARCO), dedos: m.dedos, palma: m.palma };
  return {
    id: 'idle-batucando',
    nome: 'Idle: batucando',
    dur,
    E: parada(b, 'E', dur),
    D: trilha(b, 'D', [arco, { ...arco, t: dur }]),
    ajuste: (t, maos) => {
      respirar(t, maos, dur);
      for (let k = 0; k < 4; k++) {
        const fase = (((t / CICLO - (3 - k) * 0.11) % 1) + 1) % 1;
        maos.D.f[k * 3] -= 22 * pulso(fase / 0.42);
      }
    },
  };
}

/** Idle 4: as duas mãos meio fechadas, descansando de lado, com os polegares brincando. */
function idleConcha(b: Boneco): Clipe {
  const dur = 5;
  const de = (lado: Lado): Chave => {
    const s = lado === 'E' ? 1 : -1;
    return { t: 0, apoio: [0.12 * s, 0.35], f: CONCHA, dedos: V(-0.3 * s, 0, 0.95), palma: V(-s, 0, 0) };
  };
  return {
    id: 'idle-concha',
    nome: 'Idle: de lado',
    dur,
    E: trilha(b, 'E', [de('E'), { ...de('E'), t: dur }]),
    D: trilha(b, 'D', [de('D'), { ...de('D'), t: dur }]),
    ajuste: (t, maos) => {
      respirar(t, maos, dur);
      const vai = Math.sin((2 * Math.PI * t) / 2.5);
      maos.E.f[18] += 9 * vai;
      maos.E.f[16] += 6 * vai;
      maos.D.f[18] -= 9 * vai;
      maos.D.f[16] -= 6 * vai;
    },
  };
}

/**
 * Idle 5: o descanso de quem tem cartas abertas na frente (o fim do round). As mãos ficam espalmadas
 * na mesa, cada uma do seu lado, fora do retângulo `fora` — o das cartas: no jogo elas são 2D, por
 * cima de tudo, e uma mão em cima delas apareceria debaixo delas.
 */
export function idleAbertas(b: Boneco, fora: Retangulo = retanguloDasCartas(), id = 'idle-abertas'): Clipe {
  const dur = 5;
  const de = repousoDe(b, fora);
  return {
    id,
    nome: 'Idle: cartas abertas',
    dur,
    E: trilha(b, 'E', [de('E', 0), de('E', dur)]),
    D: trilha(b, 'D', [de('D', 0), de('D', dur)]),
    ajuste: (t, maos) => respirar(t, maos, dur),
  };
}

/** Todas as animações, na ordem do preview. */
export function criarClipes(b: Boneco): Clipe[] {
  return [fichas(b), virar(b), virarAPilha(b), olhar(b), pegarEPousarBaralho(b), entregar(b), entregarAMesa(b), abrirCartas(b), desistir(b), ganhar(b), girarFicha(b), checkNos(b), checkDedos(b), checkPalma(b), idlePlana(b), idleSobrepostas(b), idleBatucando(b), idleConcha(b), idleAbertas(b)];
}

/**
 * Uma pose: o estado das duas mãos, o quanto a cabeça olha para elas (0 = reta, 1 = olhando para a
 * mesa) e para onde cada cotovelo prefere apontar.
 */
// ─────────────────────────────── o relaxo dos dedos no descanso ───────────────────────────────

/**
 * Um jeito de a mão descansar: os dedos um pouco dobrados (cada um a seu modo) e o quanto a mão
 * inclina para isso — os nós sobem e o punho continua na mesa, com as pontas dos dedos só encostando
 * nela. Uma mão de verdade não descansa espalmada, de dedos esticados.
 */
export interface Relaxo {
  f: Dedos;
  /** O quanto os dedos apontam para cima, a contar do punho (radianos). */
  sobe: number;
}

/** A mão no descanso de sempre (espalmada na mesa, no lugar dela): de onde o relaxo parte. */
export function descansoDe(b: Boneco, lado: Lado): EstadoDaMao {
  return parada(b, lado, 1)(0);
}

/** O quanto cada dedo dobra, no máximo, num descanso relaxado (o nó e as duas juntas): os de fora dobram mais. */
const DOBRA_DO_RELAXO = [
  [22, 32, 17],
  [24, 36, 19],
  [28, 40, 21],
  [32, 44, 23],
];

const inclinada = (m: EstadoDaMao, f: Dedos, sobe: number): EstadoDaMao => ({
  punho: m.punho.clone(),
  dedos: m.dedos.clone().multiplyScalar(Math.cos(sobe)).addScaledVector(m.palma, -Math.sin(sobe)).normalize(),
  palma: m.palma.clone().multiplyScalar(Math.cos(sobe)).addScaledVector(m.dedos, Math.sin(sobe)).normalize(),
  f,
});

/** Até onde cada junta de um dedo cede sozinha, largada (graus): o nó (de… a…), a junta do meio e a da ponta. */
const CEDE = { no: [-16, 50], meio: 55, ponta: 35, polegar: [-30, 70] };

/**
 * Deixa os dedos de uma mão caírem com o peso. A mão tem de estar posada no boneco (o punho e a
 * rotação dela não mudam); `f` são os dedos de partida — o jeito de uma mão largada, que nunca fica
 * de dedos esticados. Cada dedo, um por um:
 *  - dobra no nó até alguma parte dele encostar no que há embaixo — a mesa, ou `embaixo` (as esferas
 *    de outra mão) —, ou sobe, se de partida já estava dentro;
 *  - se quem encostou foi o começo do dedo e a ponta ficou no ar (o dedo passa da beirada do
 *    apoio), a junta do meio continua dobrando até a ponta encostar, e depois a da ponta;
 *  - sem nada embaixo, cada junta para onde cede sozinha (`CEDE`).
 * O polegar cai do mesmo jeito, girando em volta do comprimento da mão. `aperto` é o quanto a pele
 * cede no contato com a outra mão; `passo` (graus), de quanto em quanto se procura o contato — sem
 * ele, por bisseção, que serve quando embaixo só há a mesa.
 */
export function deixarCair(b: Boneco, lado: Lado, f: Dedos, embaixo: { p: THREE.Vector3; r: number }[] = [], aperto = 0.0015, passo = 0): Dedos {
  const g = [...f];
  const mao = b.osso('mao.' + lado);
  /** A folga das esferas `quais` até a mesa e até o que há embaixo, com os dedos em `g`. */
  const folga = (quais: number[]) => {
    b.dedos(lado, g);
    mao.updateWorldMatrix(false, true);
    const es = b.esferasNoMundo(lado);
    let menor = Infinity;
    for (const i of quais) {
      const e = es[i];
      menor = Math.min(menor, e.p.y - e.r - MESA);
      for (const o of embaixo) menor = Math.min(menor, e.p.distanceTo(o.p) - e.r - o.r + aperto);
    }
    return menor;
  };
  /** Leva o número `k` do valor que tem até `ate` (o lado para onde o peso puxa), parando no contato; se já parte em contato, volta até `volta` até soltar. */
  const cair = (k: number, ate: number, volta: number, quais: number[]) => {
    const parte = g[k];
    const livre = folga(quais) > 0;
    const alvo = livre ? ate : volta;
    // o primeiro valor, a caminho do alvo, em que o estado muda (encosta, ou solta)
    let a = parte;
    let z = alvo;
    if (passo > 0) {
      const n = Math.max(1, Math.ceil(Math.abs(alvo - parte) / passo));
      let achou = false;
      for (let i = 1; i <= n; i++) {
        g[k] = parte + ((alvo - parte) * i) / n;
        if (folga(quais) > 0 !== livre) {
          a = parte + ((alvo - parte) * (i - 1)) / n;
          z = g[k];
          achou = true;
          break;
        }
      }
      if (!achou) {
        g[k] = alvo;
        return;
      }
    } else {
      g[k] = alvo;
      if (folga(quais) > 0 === livre) return;
    }
    for (let i = 0; i < 10; i++) {
      const meio = (a + z) / 2;
      g[k] = meio;
      if (folga(quais) > 0 === livre) a = meio;
      else z = meio;
    }
    // (fica do lado livre do contato: encostado, sem entrar)
    g[k] = livre ? a : z;
  };
  for (let k = 0; k < 4; k++) {
    const [ponta, junta3, junta2] = [k * 4, k * 4 + 1, k * 4 + 2];
    cair(k * 3, CEDE.no[1], CEDE.no[0], [ponta, junta3, junta2]);
    cair(k * 3 + 1, CEDE.meio, 0, [ponta, junta3]);
    cair(k * 3 + 2, CEDE.ponta, 0, [ponta]);
  }
  // o polegar: para que lado ele desce?
  const es = () => {
    b.dedos(lado, g);
    mao.updateWorldMatrix(false, true);
    return b.esferasNoMundo(lado)[16].p.y;
  };
  const antes = g[16];
  const y0 = es();
  g[16] = antes + 4;
  const desce = es() < y0 ? 1 : -1;
  g[16] = antes;
  cair(16, desce > 0 ? CEDE.polegar[1] : CEDE.polegar[0], desce > 0 ? CEDE.polegar[0] : CEDE.polegar[1], [16, 17, 18]);
  b.dedos(lado, g);
  mao.updateWorldMatrix(false, true);
  return g;
}

/**
 * Um descanso tirado ao acaso: a mão toda mais ou menos dobrada, os dedos de fora um pouco mais ou
 * um pouco menos que os de dentro, cada um com o seu tanto, os dedos mais juntos ou mais abertos e o
 * polegar mais ou menos recolhido. A inclinação da mão é achada posando-a (no boneco dado, que fica
 * posado): a menor com que nenhum dedo entra na mesa. E então cada dedo cai até encostar nela
 * (`deixarCair`): numa mão largada, todas as pontas dos dedos pousam — nenhuma fica no ar.
 */
export function relaxoAoAcaso(b: Boneco, lado: Lado, acaso: () => number = Math.random): Relaxo {
  const geral = 0.12 + 0.63 * acaso();
  const paraFora = 0.75 + 0.6 * acaso();
  const f = [...ABERTA];
  for (let k = 0; k < 4; k++) {
    const fator = Math.min(1, Math.max(0.05, geral * (1 + ((paraFora - 1) * k) / 3) + (acaso() - 0.5) * 0.22));
    for (let j = 0; j < 3; j++) f[k * 3 + j] = ABERTA[k * 3 + j] + (DOBRA_DO_RELAXO[k][j] - ABERTA[k * 3 + j]) * fator * (0.85 + 0.3 * acaso());
  }
  const abre = 0.4 + 1.2 * acaso();
  for (let k = 0; k < 4; k++) f[12 + k] = ABERTA[12 + k] * abre;
  f[16] = -10 + 14 * acaso();
  f[17] = 4 + 9 * acaso();
  f[19] = 9 * acaso();
  f[20] = 9 * acaso();
  const base = descansoDe(b, lado);
  b.zerar();
  b.raiz.updateMatrixWorld(true);
  let sobe = 0;
  for (; sobe < 0.75; sobe += 0.02) {
    posar(b, lado, inclinada(base, f, sobe));
    if (b.folga(lado) >= -0.0004) break;
  }
  return { f: deixarCair(b, lado, f), sobe };
}

/** A meio caminho entre dois relaxos. */
export function entreRelaxos(a: Relaxo, z: Relaxo, u: number): Relaxo {
  const k = macio(u);
  return { f: a.f.map((v, i) => v + (z.f[i] - v) * k), sobe: a.sobe + (z.sobe - a.sobe) * k };
}

/**
 * Põe o relaxo numa mão (muda o estado dado): inteiro quando ela está no descanso — os dedos
 * espalmados e o punho no lugar de descansar, `repouso` —, e sumindo à medida que os dedos ou o
 * punho saem dali (num gesto, a mão é a do gesto).
 */
export function relaxar(m: EstadoDaMao, r: Relaxo, repouso: EstadoDaMao): void {
  let longe = 0;
  for (let k = 0; k < ABERTA.length; k++) longe = Math.max(longe, Math.abs(m.f[k] - ABERTA[k]));
  const peso = (1 - macio(longe / 20)) * (1 - macio(m.punho.distanceTo(repouso.punho) / 0.04));
  if (peso <= 0.001) return;
  const inclina = inclinada(m, m.f.map((v, k) => v + (r.f[k] - ABERTA[k]) * peso), r.sobe * peso);
  m.f = inclina.f;
  m.dedos.copy(inclina.dedos);
  m.palma.copy(inclina.palma);
}

export interface Pose {
  maos: Record<Lado, EstadoDaMao>;
  olha: number;
  cotovelo: Record<Lado, THREE.Vector3>;
}

/** A pose do instante `t` de uma animação (as trilhas e as mexidas por cima delas). */
export function poseDe(c: Clipe, t: number): Pose {
  const maos: Record<Lado, EstadoDaMao> = { E: c.E(t), D: c.D(t) };
  c.ajuste?.(t, maos);
  return { maos, olha: 1, cotovelo: { E: c.cotovelo?.E ?? COTOVELO_PARA, D: c.cotovelo?.D ?? COTOVELO_PARA } };
}

/** A T-pose, dita como pose: os braços abertos, as mãos espalmadas, a cabeça reta. */
export function poseT(b: Boneco): Pose {
  const de = (lado: Lado): EstadoDaMao => {
    const p = b.esq.ossos[b.esq.indice['mao.' + lado]].pos;
    return { punho: V(p[0], p[1], p[2]), dedos: V(lado === 'E' ? 1 : -1, 0, 0), palma: V(0, -1, 0), f: new Array(21).fill(0) };
  };
  return { maos: { E: de('E'), D: de('D') }, olha: 0, cotovelo: { E: COTOVELO_PARA, D: COTOVELO_PARA } };
}

/** O quanto as mãos sobem, no meio de uma passagem comprida, para não se arrastarem pela mesa. */
const ARCO_DA_PASSAGEM = 0.045;

/**
 * A pose a meio caminho (`u` de 0 a 1) entre duas poses: é a passagem de uma animação para outra.
 * As mãos vão de um lugar ao outro num arco (sobem no meio), e os dedos, o rumo da mão, a cabeça e
 * os cotovelos mudam aos poucos.
 */
export function entrePoses(a: Pose, z: Pose, u: number): Pose {
  const k = macio(u);
  const rumo = (de: THREE.Vector3, ate: THREE.Vector3) => {
    const m = de.clone().lerp(ate, k);
    return m.lengthSq() < 1e-6 ? de.clone() : m.normalize();
  };
  const mao = (lado: Lado): EstadoDaMao => {
    const de = a.maos[lado];
    const ate = z.maos[lado];
    const punho = de.punho.clone().lerp(ate.punho, k);
    punho.y += ARCO_DA_PASSAGEM * Math.min(1, de.punho.distanceTo(ate.punho) / 0.15) * Math.sin(Math.PI * k) ** 2;
    return { punho, dedos: rumo(de.dedos, ate.dedos), palma: rumo(de.palma, ate.palma), f: de.f.map((x, i) => x + (ate.f[i] - x) * k) };
  };
  return { maos: { E: mao('E'), D: mao('D') }, olha: a.olha + (z.olha - a.olha) * k, cotovelo: { E: rumo(a.cotovelo.E, z.cotovelo.E), D: rumo(a.cotovelo.D, z.cotovelo.D) } };
}

/** Posa o boneco: a cabeça e as duas mãos (que sobem até encostar, se fossem entrar na mesa). */
export function posarPose(b: Boneco, p: Pose) {
  b.zerar();
  // o personagem olha para as mãos
  b.osso('pescoco').quaternion.setFromAxisAngle(EIXO_X, 0.14 * p.olha);
  b.osso('cabeca').quaternion.setFromAxisAngle(EIXO_X, 0.2 * p.olha);
  b.raiz.updateMatrixWorld(true);
  for (const lado of LADOS) posarNaMesa(b, lado, p.maos[lado], p.cotovelo[lado]);
}

/** Posa o boneco no instante `t` da animação e devolve as fichas e cartas desse instante. */
export function aplicar(b: Boneco, c: Clipe, t: number): Objeto[] {
  posarPose(b, poseDe(c, t));
  return c.objetos?.(t, b) ?? [];
}
