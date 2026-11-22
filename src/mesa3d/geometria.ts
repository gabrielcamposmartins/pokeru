/**
 * A geometria da mesa 3D, sem three.js: o estádio (a mesa longa, redonda nas pontas), onde cada
 * assento fica em volta dele, a câmera do jogo e a ponte entre o 3D e o que continua 2D.
 *
 * O que continua 2D (as cartas abertas, o console do pote, os voos de cartas abertas) mora no mesmo
 * "plano da mesa" de antes — coordenadas em pixels, 1600×1100, com o meio da mesa em (800, 550).
 * Só que agora esse plano é **o tampo da mesa 3D**: um pixel do plano é `METRO_POR_PX` metro no
 * tampo, e a camada 2D é deitada nele por uma homografia (`planoCss`) feita com a mesma câmera que
 * desenha o 3D. Uma carta aberta posta em (800, 600) cai exatamente em cima do feltro, no lugar em
 * que uma carta 3D cairia — e o diretor, que pensa em pontos do plano, segue funcionando.
 *
 * Tudo aqui é conta pura (é o que os testes conferem e o que o diretor importa sem puxar o
 * three.js para o pacote principal: o 3D em si é carregado só quando a mesa abre).
 *
 * Eixos: metros, o meio da mesa em x = z = 0, o tampo a `ALTURA_DA_MESA` do chão. O jogador fica no
 * lado de +z (embaixo na tela) e +x é a direita dele — os mesmos de src/dev/mesa.ts.
 */
import type { CSSProperties } from 'react';
import { CARD_W, STAGE_H, STAGE_W, type Pt, type SeatGeo } from '../game/layout';

/** A altura do tampo (a mesma de `MESA` em src/personagem/boneco.ts; o teste confere). */
export const ALTURA_DA_MESA = 1.14;

/**
 * O estádio: dois semicírculos de raio `RAIO` ligados por retas de comprimento 2 × `MEIO`; a beirada
 * de couro tem `TRILHO` de largura e cada personagem fica `RECUO` atrás dela. As medidas da página
 * de apoio (src/dev/mesa.ts), onde o dono escolheu a mesa e a câmera.
 */
export const MEIO = 0.55;
export const RAIO = 0.62;
export const TRILHO = 0.085;
export const RECUO = 0.12;
export const PERIMETRO = 4 * MEIO + 2 * Math.PI * RAIO;

/**
 * A câmera do jogo: a que o dono fixou na página da mesa (`CAMERA_DO_JOGO` de src/dev/mesa.ts) — de
 * cima e de trás do jogador, a 1,55 m do alvo, com 39,5° de campo de visão na altura do palco.
 *
 * O palco (1600×900) é o meio do quadro; a tela 3D ocupa a janela inteira e mostra o que a mesma
 * lente vê para além dele (veja `lenteDaTela`): numa janela mais larga que 16:9 aparecem as pontas
 * da mesa, que no palco sozinho ficam cortadas.
 */
export const CAMERA_DO_JOGO = { posicao: [0, 2.554, 0.638] as const, alvo: [0, 1.116, 0.059] as const, fov: 39.5 };

/**
 * A lente de uma tela `fx` vezes mais larga e `fy` vezes mais alta que o palco, com o palco no meio:
 * o campo de visão (vertical, em graus) e a proporção que fazem o pedaço do meio ser exatamente o
 * quadro do palco — a camada 2D, deitada no tampo pela câmera do palco, continua no lugar.
 */
export function lenteDaTela(fx: number, fy: number): { fov: number; aspecto: number } {
  const tan = Math.tan((CAMERA_DO_JOGO.fov * Math.PI) / 360);
  return { fov: (Math.atan(tan * fy) * 360) / Math.PI, aspecto: ((STAGE_W / STAGE_H) * fx) / fy };
}

/** Quantos metros do tampo cabem num pixel do plano da mesa. */
export const METRO_POR_PX = 0.001;
/** O meio da mesa, no plano (o mesmo `CENTER` do layout 2D). */
const MEIO_DO_PLANO: Pt = { x: 800, y: 550 };

export interface Beirada {
  x: number;
  z: number;
  /** O rumo para fora da mesa, na horizontal. */
  nx: number;
  nz: number;
}

/**
 * O ponto da beirada a `s` metros do meio do lado de baixo (+z), andando para +x; e o rumo para
 * fora. `s` negativo anda para -x.
 */
export function naBeirada(s: number): Beirada {
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

/** Um assento: onde o personagem fica (no chão), para onde ele gira e o ponto da beirada diante dele. */
export interface Lugar {
  x: number;
  z: number;
  /** O giro em volta do eixo vertical que leva o personagem (modelado olhando para +z) a olhar para a mesa. */
  giro: number;
  beirada: Beirada;
}

/**
 * Os `n` lugares (2 a 6) em volta do estádio, espaçados por igual ao longo da beirada.
 *
 * O 0 é o do jogador, no meio do lado de baixo. Os outros seguem no sentido do jogo — o horário,
 * visto de cima: o próximo a agir fica à esquerda do jogador na tela, como na mesa 2D de antes.
 */
export function lugares(n: number): Lugar[] {
  const quantos = Math.max(2, Math.min(6, Math.round(n)));
  return Array.from({ length: quantos }, (_, k) => {
    const b = naBeirada((-k * PERIMETRO) / quantos);
    // (o -0 vira 0: um assento no meio de um lado reto não precisa de sinal)
    const limpo = (v: number) => (Math.abs(v) < 1e-12 ? 0 : v);
    return { x: limpo(b.x + b.nx * RECUO), z: limpo(b.z + b.nz * RECUO), giro: Math.atan2(-b.nx, -b.nz), beirada: { x: limpo(b.x), z: limpo(b.z), nx: limpo(b.nx), nz: limpo(b.nz) } };
  });
}

/** Um ponto dado nas coordenadas do personagem do lugar (x para a esquerda dele, z para a frente), no mundo. */
export function noMundo(l: Lugar, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(l.giro);
  const s = Math.sin(l.giro);
  return { x: l.x + lx * c + lz * s, z: l.z - lx * s + lz * c };
}

/** Do plano da mesa (px) para o tampo (metros), e de volta. */
export function planoParaMundo(p: Pt): { x: number; z: number } {
  return { x: (p.x - MEIO_DO_PLANO.x) * METRO_POR_PX, z: (p.y - MEIO_DO_PLANO.y) * METRO_POR_PX };
}
export function mundoParaPlano(x: number, z: number): Pt {
  return { x: MEIO_DO_PLANO.x + x / METRO_POR_PX, y: MEIO_DO_PLANO.y + z / METRO_POR_PX };
}

/**
 * Os pontos de cada assento, nas coordenadas do personagem: tirados das animações
 * (src/personagem/animacoes.ts) para o que está parado na mesa cair onde as mãos o pegam.
 *  - `cartas`: o meio das duas cartas fechadas (onde "olhar as cartas" as levanta);
 *  - `pilha`: a pilha de fichas do jogador (de onde "colocar fichas" tira o punhado);
 *  - `aposta`: onde o punhado pousa;
 *  - `botao` e `baralho`: o botão do dealer e o baralho, do lado da mão esquerda;
 *  - `abertas`: onde as duas cartas pousam abertas quando a mão as vira (o fim de "virar as duas
 *    cartas"): é ali que ficam as cartas abertas 2D do showdown.
 */
export const MARCAS = {
  cartas: [-0.03, 0.385],
  pilha: [-0.3, 0.36],
  aposta: [-0.07, 0.53],
  botao: [0.27, 0.52],
  // (para fora de onde a esquerda descansa, aonde ela chega para pegá-lo — é de lá que "pegar o
  // baralho" o arrasta —, e de lado o bastante para não ficar debaixo das cartas abertas do meio da
  // mesa, que são 2D e passam por cima do que é 3D)
  baralho: [0.36, 0.42],
} as const satisfies Record<string, readonly [number, number]>;

/**
 * A pilha do descarte, no tampo (x, z em metros): uma só, para onde vão todas as cartas de quem
 * desiste e as trocadas — à direita das cartas abertas do meio da mesa, fora delas (que são 2D e
 * passam por cima do que é 3D) e fora do alcance das marcas de qualquer lugar.
 */
export const DESCARTE: readonly [number, number] = [0.42, 0.04];

/** Como o baralho parado fica deitado na mesa: o giro dele em volta de y, a contar do rumo de quem dá as cartas. */
export const GIRO_DO_BARALHO = 0.35;

/** Onde as duas cartas de um jogador pousam abertas (veja `MARCAS`): a primeira e a segunda. */
export const ABERTAS = [
  [-0.0395, 0.473],
  [0.0455, 0.476],
] as const;

/** Onde as fichas do pote ficam, no plano: entre o console (que sobe um pouco no 3D) e as cartas da mesa. */
export const POTE_3D: Pt = { x: 800, y: 498 };

// ─────────────────────────────── a câmera ───────────────────────────────

type V3 = [number, number, number];
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: readonly number[], b: readonly number[]): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: readonly number[]): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Os eixos da câmera do jogo (como os de `lookAt` do three.js, com o "para cima" em +y). */
function eixos() {
  const de = CAMERA_DO_JOGO.posicao;
  const frente = norm(sub(CAMERA_DO_JOGO.alvo, de));
  const direita = norm(cross(frente, [0, 1, 0]));
  const cima = cross(direita, frente);
  return { de, frente, direita, cima, tan: Math.tan((CAMERA_DO_JOGO.fov * Math.PI) / 360), aspecto: STAGE_W / STAGE_H };
}
const EIXOS = eixos();

/** Um ponto do mundo no palco (1600×900, o mesmo quadro do canvas 3D), e a que profundidade ele está. */
export function projetarMundo(x: number, y: number, z: number): { x: number; y: number; prof: number } {
  const { de, frente, direita, cima, tan, aspecto } = EIXOS;
  const d = sub([x, y, z], de);
  const prof = dot(d, frente);
  const nx = dot(d, direita) / (prof * tan * aspecto);
  const ny = dot(d, cima) / (prof * tan);
  return { x: ((nx + 1) / 2) * STAGE_W, y: ((1 - ny) / 2) * STAGE_H, prof };
}

/** A profundidade do meio da mesa: é a escala 1 dos objetos 2D postos em pé no palco. */
const PROF_DO_MEIO = projetarMundo(0, ALTURA_DA_MESA, 0).prof;

/**
 * Um ponto do plano da mesa no palco (o `project` do layout 2D, para a mesa 3D): `s` é o quanto
 * um objeto em pé ali parece maior (perto da câmera) ou menor (longe) que no meio da mesa.
 */
export function projetar(p: Pt): { x: number; y: number; s: number } {
  const w = planoParaMundo(p);
  const r = projetarMundo(w.x, ALTURA_DA_MESA, w.z);
  return { x: r.x, y: r.y, s: PROF_DO_MEIO / r.prof };
}

/**
 * A homografia que leva o plano da mesa (px) ao palco (px): a matriz 3×3, por linhas, que faz
 * (u, v, 1) ↦ (X·w, Y·w, w). As três linhas são afins em (u, v), porque o tampo é um plano.
 */
export function homografia(): number[] {
  return homografiaDe([-MEIO_DO_PLANO.x * METRO_POR_PX, ALTURA_DA_MESA, -MEIO_DO_PLANO.y * METRO_POR_PX], METRO_POR_PX);
}

/**
 * A mesma conta para qualquer plano deitado (o tampo, o chão): `canto` é onde fica, no mundo, o
 * ponto (0, 0) do plano, e `porPx`, quantos metros cabem num pixel dele.
 */
function homografiaDe(canto: V3, porPx: number): number[] {
  const { de, frente, direita, cima, tan, aspecto } = EIXOS;
  // o ponto do plano em (u, v) é o + u·eu + v·ev
  const o = sub(canto, de);
  const eu: V3 = [porPx, 0, 0];
  const ev: V3 = [0, 0, porPx];
  const linha = (eixo: readonly number[]) => [dot(eu, eixo), dot(ev, eixo), dot(o, eixo)];
  const xc = linha(direita);
  const yc = linha(cima);
  const zc = linha(frente);
  const W = STAGE_W / 2;
  const H = STAGE_H / 2;
  const h = [0, 1, 2].map((i) => W * (xc[i] / (tan * aspecto) + zc[i]));
  const k = [0, 1, 2].map((i) => H * (zc[i] - yc[i] / tan));
  return [...h, ...k, ...zc];
}

/** Aplica a homografia a um ponto do plano (o mesmo que `projetar`, pela matriz: o teste compara os dois). */
export function pelaHomografia(m: number[], p: Pt): Pt {
  const w = m[6] * p.x + m[7] * p.y + m[8];
  return { x: (m[0] * p.x + m[1] * p.y + m[2]) / w, y: (m[3] * p.x + m[4] * p.y + m[5]) / w };
}

/**
 * O estilo da camada 2D deitada no tampo: o plano da mesa (1600×1100, origem no canto) levado ao
 * palco pela homografia — o `matrix3d` do CSS faz a divisão pela profundidade como a câmera faz.
 */
export function planoCss(): CSSProperties {
  return deitado(homografia(), 1600, 1100);
}

/** O estilo de uma camada de `largura` × `altura` pixels levada ao palco pela homografia `m`. */
function deitado(m: number[], largura: number, altura: number): CSSProperties {
  const n = (v: number) => v / m[8];
  // matrix3d é por colunas: (x, y, z, w) de cada eixo; z passa direto
  const valores = [n(m[0]), n(m[3]), 0, n(m[6]), n(m[1]), n(m[4]), 0, n(m[7]), 0, 0, 1, 0, n(m[2]), n(m[5]), 0, 1];
  return { position: 'absolute', left: 0, top: 0, width: largura, height: altura, transformOrigin: '0 0', transform: `matrix3d(${valores.map((v) => +v.toPrecision(10)).join(',')})` };
}

/**
 * O chão da sala na mesa 3D: o plano do piso (src/game/piso.ts, o mesmo da mesa 2D) deitado no chão
 * de verdade — a altura zero, debaixo da mesa —, visto pela câmera do jogo. `largura` × `altura` é o
 * tamanho do plano em pixels, `porPx` quantos metros cabem num pixel dele (a tábua do assoalho, de
 * 170 px, fica com uns 30 cm) e `z` onde fica o meio dele (a câmera olha para o lado de lá da mesa:
 * o que se vê do chão fica mais para lá do que para cá).
 */
export const CHAO_3D = { largura: 3200, altura: 2200, porPx: 0.0018, z: -0.45 };

export function chaoCss(): CSSProperties {
  const { largura, altura, porPx, z } = CHAO_3D;
  return deitado(homografiaDe([(-largura / 2) * porPx, 0, z - (altura / 2) * porPx], porPx), largura, altura);
}

/** Onde a mesa fica no plano do chão, em frações dele: o meio e os meios-tamanhos (para a sombra que ela faz no piso). */
export function mesaNoChao(): { x: number; y: number; rx: number; ry: number } {
  const { largura, altura, porPx, z } = CHAO_3D;
  return { x: 0.5, y: 0.5 - z / (altura * porPx), rx: (MEIO + RAIO) / (largura * porPx), ry: RAIO / (altura * porPx) };
}

// ─────────────────────────────── os assentos ───────────────────────────────

export interface SeatGeo3D extends SeatGeo {
  /** O lugar do personagem em volta do estádio. */
  lugar: Lugar;
}

/** A minha placa fica no canto de baixo à esquerda, como na mesa 2D. */
const MINHA_PLACA: Pt = { x: 250, y: 846 };
/**
 * A placa mais baixa de quem não sou eu: acima da minha placa e do painel de ações — e acima das
 * cartas de quem senta nas curvas de baixo do estádio (a placa dele não as cobre).
 */
const PLACA_MAIS_BAIXA = 470;

/**
 * A geometria dos assentos na mesa 3D, no formato da 2D (`seatLayout` de src/game/layout.ts): os
 * pontos deitados ficam no plano da mesa, a placa fica no palco. O visual 0 é quem está no assento
 * `anchorSeat` (eu, quando estou sentado), embaixo; os outros seguem no sentido do jogo.
 */
export function seatLayout3d(maxPlayers: number, anchorSeat: number, hasMe: boolean, sobra = 0): SeatGeo3D[] {
  const n = Math.max(2, Math.min(6, maxPlayers));
  const ls = lugares(n);
  const out: SeatGeo3D[] = [];
  for (let seat = 0; seat < n; seat++) {
    const vis = (seat - anchorSeat + n) % n;
    const l = ls[vis];
    const isMe = hasMe && vis === 0;
    const edge = mundoParaPlano(l.beirada.x, l.beirada.z);
    const u = { x: -l.beirada.nx, y: -l.beirada.nz };
    const t = { x: -u.y, y: u.x };
    const marca = (m: readonly [number, number]) => {
      const w = noMundo(l, m[0], m[1]);
      return mundoParaPlano(w.x, w.z);
    };
    // a placa: a beirada projetada, empurrada para fora da mesa na tela e presa dentro do palco
    let plate = MINHA_PLACA;
    if (!isMe) {
      const p = projetarMundo(l.beirada.x, ALTURA_DA_MESA, l.beirada.z);
      const dx = p.x - STAGE_W / 2;
      const dy = p.y - STAGE_H / 2;
      const d = Math.hypot(dx, dy) || 1;
      // (embaixo, os cantos são da minha placa e do painel de ações: as placas dos outros param acima deles)
      plate = { x: Math.min(STAGE_W - 112 + sobra, Math.max(112 - sobra, p.x + (dx / d) * 70)), y: Math.min(PLACA_MAIS_BAIXA, Math.max(44, p.y + (dy / d) * 50)) };
      // quem senta nas pontas do estádio fica na beirada da tela, e a placa cairia em cima das
      // cartas e da aposta dele: ela sobe para acima delas
      const c = projetar(marca(MARCAS.cartas));
      if (Math.abs(plate.x - c.x) < 170 && Math.abs(plate.y - c.y) < 100) plate = { x: plate.x, y: Math.max(44, c.y - 140) };
    }
    out.push({
      seat,
      vis,
      isMe,
      lugar: l,
      edge,
      u,
      t,
      plate,
      cards: marca(MARCAS.cartas),
      cardsRot: (Math.atan2(u.y, u.x) * 180) / Math.PI + 90,
      cardW: isMe ? CARD_W : 72,
      bet: marca(MARCAS.aposta),
      dealer: marca(MARCAS.botao),
      deck: marca(MARCAS.baralho),
      abertas: ABERTAS.map(marca),
    });
  }
  return out;
}
