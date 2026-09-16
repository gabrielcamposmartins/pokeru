import type { Suit } from '../../shared/cards';

/** Paths dos naipes num quadrado de 100x100 centrado em (0,0). */
export const SUIT_PATHS: Record<Exclude<Suit, 'c'>, string> = {
  h: 'M0 40 C-30 18 -46 -2 -46 -20 C-46 -36 -34 -46 -21 -46 C-11 -46 -3 -40 0 -32 C3 -40 11 -46 21 -46 C34 -46 46 -36 46 -20 C46 -2 30 18 0 40 Z',
  d: 'M0 -46 Q17 -20 36 0 Q17 20 0 46 Q-17 20 -36 0 Q-17 -20 0 -46 Z',
  s: 'M0 -46 C10 -30 44 -12 44 10 C44 25 33 33 21 33 C13 33 7 30 3 24 C4 34 9 41 17 46 L-17 46 C-9 41 -4 34 -3 24 C-7 30 -13 33 -21 33 C-33 33 -44 25 -44 10 C-44 -12 -10 -30 0 -46 Z',
};

export function SuitGlyph({
  suit,
  x = 0,
  y = 0,
  size = 100,
  color,
  flip = false,
}: {
  suit: Suit;
  x?: number;
  y?: number;
  size?: number;
  color: string;
  flip?: boolean;
}) {
  const k = size / 100;
  const tr = `translate(${x} ${y}) scale(${k}) ${flip ? 'rotate(180)' : ''}`;
  if (suit === 'c') {
    return (
      <g transform={tr} fill={color}>
        <circle cx={0} cy={-22} r={20} />
        <circle cx={-22} cy={10} r={20} />
        <circle cx={22} cy={10} r={20} />
        <path d="M-9 0 L9 0 L6 16 Q8 36 18 46 L-18 46 Q-8 36 -6 16 Z" />
        <circle cx={0} cy={4} r={10} />
      </g>
    );
  }
  return <path transform={tr} d={SUIT_PATHS[suit]} fill={color} />;
}

export function starPath(r1: number, r2: number, n = 5): string {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? r1 : r2;
    const a = (Math.PI / n) * i - Math.PI / 2;
    d += `${i === 0 ? 'M' : 'L'}${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)} `;
  }
  return d + 'Z';
}

export const CROWN_PATH = 'M-32 16 L-36 -16 L-17 0 L0 -26 L17 0 L36 -16 L32 16 Z';
export const MOON_PATH = 'M8 -30 A30 30 0 1 0 8 30 A24 24 0 1 1 8 -30 Z';

export function Flower({ r, color, center }: { r: number; color: string; center?: string }) {
  return (
    <g>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} cx={0} cy={-r * 0.55} rx={r * 0.34} ry={r * 0.55} transform={`rotate(${a})`} fill={color} />
      ))}
      <circle r={r * 0.22} fill={center ?? color} opacity={center ? 1 : 0.6} />
    </g>
  );
}

/** Flor-de-lis num quadrado de 100x100 centrado em (0,0). */
export const FLEUR_PATH =
  'M0 -48 C14 -30 16 -12 6 6 L-6 6 C-16 -12 -14 -30 0 -48 Z ' +
  'M8 6 C12 -8 26 -24 40 -18 C52 -12 48 6 34 4 C40 -2 36 -10 29 -7 C21 -3 17 6 15 12 Z ' +
  'M-8 6 C-12 -8 -26 -24 -40 -18 C-52 -12 -48 6 -34 4 C-40 -2 -36 -10 -29 -7 C-21 -3 -17 6 -15 12 Z ' +
  'M-20 9 H20 V16 H-20 Z ' +
  'M-6 16 H6 C7 26 14 33 24 36 C13 40 5 36 0 30 C-5 36 -13 40 -24 36 C-14 33 -7 26 -6 16 Z';

/** Módulo de damasco (flor-de-lis numa treliça ogival) num ladrilho w x h. */
export function Damask({ w, h, color, stroke }: { w: number; h: number; color: string; stroke: number }) {
  const k = Math.min(w, h) / 100;
  const ogee =
    `M${w / 2} 0 C${w * 0.55} ${h * 0.28} ${w * 0.95} ${h * 0.3} ${w} ${h / 2} ` +
    `C${w * 0.95} ${h * 0.7} ${w * 0.55} ${h * 0.72} ${w / 2} ${h} ` +
    `C${w * 0.45} ${h * 0.72} ${w * 0.05} ${h * 0.7} 0 ${h / 2} ` +
    `C${w * 0.05} ${h * 0.3} ${w * 0.45} ${h * 0.28} ${w / 2} 0 Z`;
  return (
    <g fill={color}>
      <path d={ogee} fill="none" stroke={color} strokeWidth={stroke} />
      <path d={FLEUR_PATH} transform={`translate(${w / 2} ${h / 2}) scale(${k * 0.5})`} />
      {[
        [0, 0],
        [w, 0],
        [0, h],
        [w, h],
      ].map(([x, y], i) => (
        <path key={i} d={FLEUR_PATH} transform={`translate(${x} ${y}) scale(${k * 0.26})`} />
      ))}
      {[
        [w / 2, 0],
        [w, h / 2],
        [w / 2, h],
        [0, h / 2],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={stroke * 1.8} />
      ))}
    </g>
  );
}
