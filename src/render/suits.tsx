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
