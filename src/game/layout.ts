import type { CSSProperties } from 'react';
import { jitter } from '../util/rand';

/**
 * Geometria da mesa.
 *
 * A mesa vive num PLANO (coordenadas "do chão", 1600x1100) que a câmera vê inclinado
 * (perspectiva + rotateX), como no Mahjong Soul. Elementos "deitados" (feltro, cartas)
 * ficam dentro do plano; elementos "em pé" (fichas, placas, sua mão) ficam no
 * PALCO (1600x900) e são posicionados com `project()`.
 */

export interface Pt {
  x: number;
  y: number;
}

export const STAGE_W = 1600;
export const STAGE_H = 900;

export const PLANE_W = 1600;
export const PLANE_H = 1100;
export const CENTER: Pt = { x: 800, y: 550 };
export const RAIL = { rx: 720, ry: 470 };
export const FELT = { rx: 668, ry: 420 };

export const TILT_DEG = 36;
export const PERSPECTIVE = 1600;
/** Onde o centro da mesa aparece no palco. */
export const ANCHOR: Pt = { x: 800, y: 392 };

const SIN = Math.sin((TILT_DEG * Math.PI) / 180);
const COS = Math.cos((TILT_DEG * Math.PI) / 180);

/** Projeta um ponto do plano da mesa para o palco (mesma matemática do CSS). */
export function project(p: Pt): { x: number; y: number; s: number } {
  const X = p.x - CENTER.x;
  const Y = p.y - CENTER.y;
  const s = PERSPECTIVE / (PERSPECTIVE - Y * SIN);
  return { x: ANCHOR.x + X * s, y: ANCHOR.y + Y * COS * s, s };
}

/** Estilo CSS de uma camada no plano da mesa (opcionalmente maior, ex.: o chão). */
export function planeStyle(w = PLANE_W, h = PLANE_H, cx = CENTER.x, cy = CENTER.y): CSSProperties {
  return {
    position: 'absolute',
    left: ANCHOR.x - cx,
    top: ANCHOR.y - cy,
    width: w,
    height: h,
    transformOrigin: `${cx}px ${cy}px`,
    transform: `perspective(${PERSPECTIVE}px) rotateX(${TILT_DEG}deg)`,
  };
}

/** Ruas, para semear o desvio das fichas apostadas (as duas variantes). */
const STREETS = ['preflop', 'flop', 'turn', 'river', 'predraw', 'draw', 'postdraw', 'showdown'];

/**
 * Onde as fichas apostadas de um assento pousam: o ponto da aposta com um desvio pequeno,
 * para parecerem jogadas na mesa e não postas no mesmo lugar toda vez. O desvio é estável
 * (mesmo assento e rua ⇒ mesmo ponto), então a pilha parada fica onde as fichas caíram.
 */
export function betSpot(bet: Pt, seat: number, street: string | null): Pt {
  const k = STREETS.indexOf(street ?? 'preflop') + 1;
  return { x: bet.x + jitter(seat, k, 1) * 30, y: bet.y + jitter(seat, k, 2) * 16 };
}

export const CARD_W = 88;
export const CARD_H = CARD_W * 1.4;
export const BOARD_Y = 600;
/** Console central (placar do pote), no plano. */
export const CONSOLE = { x: 800, y: 440, w: 440, h: 130 };
export const POT_POS: Pt = { x: CONSOLE.x, y: CONSOLE.y };
export const MUCK_POS: Pt = { x: 800, y: 470 };

export function boardSlot(i: number): Pt {
  return { x: 800 + (i - 2) * 98, y: BOARD_Y };
}

/** Ângulos (graus, 90 = perto da câmera) de cada posição visual, por tamanho de mesa. */
const ANGLES: Record<number, number[]> = {
  2: [90, 270],
  3: [90, 210, 330],
  4: [90, 180, 270, 0],
  5: [90, 158, 232, 308, 22],
  6: [90, 150, 210, 270, 330, 30],
};

export interface SeatGeo {
  seat: number;
  vis: number;
  isMe: boolean;
  /** Ponto da borda da mesa diante do jogador (plano). */
  edge: Pt;
  /** Vetor unitário apontando para o centro da mesa (plano). */
  u: Pt;
  /** Vetor unitário para a direita do jogador (plano). */
  t: Pt;
  /** Placa do jogador (PALCO). */
  plate: Pt;
  /** Cartas do jogador (plano). */
  cards: Pt;
  cardsRot: number;
  cardW: number;
  /** Apostas (plano; desenhadas em pé via project). */
  bet: Pt;
  dealer: Pt;
  deck: Pt;
}

const add = (a: Pt, b: Pt, k = 1): Pt => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function railPoint(a: number): Pt {
  return { x: CENTER.x + RAIL.rx * Math.cos(a), y: CENTER.y + RAIL.ry * Math.sin(a) };
}

function inward(p: Pt): Pt {
  const dx = CENTER.x - p.x;
  const dy = CENTER.y - p.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}

export function seatLayout(maxPlayers: number, anchorSeat: number, hasMe: boolean): SeatGeo[] {
  const n = Math.max(2, Math.min(6, maxPlayers));
  const angles = ANGLES[n];
  const out: SeatGeo[] = [];
  for (let seat = 0; seat < n; seat++) {
    const vis = (seat - anchorSeat + n) % n;
    const a = (angles[vis] * Math.PI) / 180;
    const edge = railPoint(a);
    const u = inward(edge);
    const t = { x: -u.y, y: u.x };
    const isMe = hasMe && vis === 0;
    const cardsRot = (Math.atan2(u.y, u.x) * 180) / Math.PI + 90;

    if (isMe) {
      out.push({
        seat,
        vis,
        isMe,
        edge,
        u,
        t,
        plate: { x: 250, y: 846 },
        cards: add(edge, u, 110),
        cardsRot: 0,
        cardW: CARD_W,
        bet: add(edge, u, 235),
        dealer: add(add(edge, u, 230), t, -190),
        deck: add(add(edge, u, 160), t, 200),
      });
      continue;
    }

    // placa: projeta a borda e empurra para fora da mesa, na tela
    const ep = project(edge);
    const dx = ep.x - ANCHOR.x;
    const dy = ep.y - ANCHOR.y;
    const dl = Math.hypot(dx, dy) || 1;
    const plate = {
      x: clamp(ep.x + (dx / dl) * 70, 112, STAGE_W - 112),
      y: clamp(ep.y + (dy / dl) * 50, 44, STAGE_H - 60),
    };

    out.push({
      seat,
      vis,
      isMe,
      edge,
      u,
      t,
      plate,
      cards: add(edge, u, 125),
      cardsRot,
      cardW: 72,
      bet: add(edge, u, 215),
      dealer: add(add(edge, u, 165), t, -110),
      deck: add(add(edge, u, 150), t, 70),
    });
  }
  return out;
}

/**
 * Posição de cada carta na frente do jogador, no plano: um leque centrado, com `n` cartas
 * (2 no Hold'em, 5 no poker de 5 cartas — aí as cartas ficam mais juntas).
 */
export function holeCardPos(g: SeatGeo, i: number, n = 2): { p: Pt; rot: number } {
  // com mais cartas o passo diminui: o leque cresce pouco e não invade a mesa
  const step = (g.isMe ? 40 : 20) * (n > 2 ? 0.7 : 1);
  const k = i - (n - 1) / 2;
  return { p: add(g.cards, g.t, k * step), rot: g.cardsRot + k * (n > 2 ? 5 : 7) };
}

export function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export { add as addPt };
