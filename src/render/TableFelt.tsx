import { memo, useId } from 'react';
import type { TablePattern, TableStyle } from '../../shared/styles';
import { cleanId, shade } from '../util/color';
import { Damask, Flower, SuitGlyph } from './suits';
import { CARD_H, CARD_W, CENTER, FELT, PLANE_H, PLANE_W, RAIL, boardSlot } from '../game/layout';

function FeltPattern({ id, pattern, color }: { id: string; pattern: TablePattern; color: string }) {
  const common = { id, patternUnits: 'userSpaceOnUse' as const };
  switch (pattern) {
    case 'lines':
      return (
        <pattern {...common} width={26} height={26} patternTransform="rotate(35)">
          <rect width={2} height={26} fill={color} />
        </pattern>
      );
    case 'hex':
      return (
        <pattern {...common} width={52} height={90}>
          <path d="M26 0 L52 15 L52 45 L26 60 L0 45 L0 15 Z M26 60 L26 90" fill="none" stroke={color} strokeWidth={1.6} />
        </pattern>
      );
    case 'sakura':
      return (
        <pattern {...common} width={120} height={120}>
          <g transform="translate(30 34)">
            <Flower r={14} color={color} />
          </g>
          <g transform="translate(90 92) rotate(25)">
            <Flower r={9} color={color} />
          </g>
        </pattern>
      );
    case 'suits':
      return (
        <pattern {...common} width={110} height={110}>
          <SuitGlyph suit="s" x={25} y={25} size={20} color={color} />
          <SuitGlyph suit="h" x={80} y={25} size={20} color={color} />
          <SuitGlyph suit="d" x={25} y={80} size={20} color={color} />
          <SuitGlyph suit="c" x={80} y={80} size={20} color={color} />
        </pattern>
      );
    case 'damask':
      return (
        <pattern {...common} width={96} height={132}>
          <Damask w={96} h={132} color={color} stroke={2.2} />
        </pattern>
      );
    default:
      return null;
  }
}

/** Tachas de latão ao longo da borda de couro. */
const STUDS = Array.from({ length: 72 }, (_, i) => {
  const a = (i / 72) * Math.PI * 2;
  return { x: CENTER.x + Math.cos(a) * (RAIL.rx - 11), y: CENTER.y + Math.sin(a) * (RAIL.ry - 11) };
});

/**
 * A mesa desenhada no plano (vista de cima). A câmera inclinada dá a perspectiva;
 * a "saia" deslocada abaixo da borda cria a ilusão de espessura do móvel.
 */
export const TableFelt = memo(function TableFelt({ st, showSlots = true }: { st: TableStyle; showSlots?: boolean }) {
  const uid = cleanId(useId());
  const { x: cx, y: cy } = CENTER;
  return (
    <svg className="table-svg" viewBox={`0 0 ${PLANE_W} ${PLANE_H}`} width={PLANE_W} height={PLANE_H}>
      <defs>
        <radialGradient id={`felt${uid}`} cx="50%" cy="48%" r="58%">
          <stop offset="0" stopColor={st.feltLight} />
          <stop offset="0.62" stopColor={st.felt} />
          <stop offset="1" stopColor={shade(st.felt, -0.38)} />
        </radialGradient>
        <linearGradient id={`rail${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(st.rail, 0.3)} />
          <stop offset="0.5" stopColor={st.rail} />
          <stop offset="1" stopColor={shade(st.rail, -0.3)} />
        </linearGradient>
        <linearGradient id={`apron${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={shade(st.rail, -0.35)} />
          <stop offset="1" stopColor={shade(st.rail, -0.7)} />
        </linearGradient>
        <filter id={`sh${uid}`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="26" />
        </filter>
        <FeltPattern id={`pat${uid}`} pattern={st.pattern} color={st.patternColor} />
      </defs>
      {/* sombra no chão e espessura (saia) */}
      <ellipse cx={cx} cy={cy + 90} rx={RAIL.rx + 40} ry={RAIL.ry + 30} fill="#000" opacity={0.55} filter={`url(#sh${uid})`} />
      <ellipse cx={cx} cy={cy + 46} rx={RAIL.rx - 6} ry={RAIL.ry - 4} fill={`url(#apron${uid})`} />
      <ellipse cx={cx} cy={cy + 46} rx={RAIL.rx - 6} ry={RAIL.ry - 4} fill="none" stroke={st.railAccent} strokeOpacity={0.35} strokeWidth={3} />
      {/* borda acolchoada */}
      <ellipse cx={cx} cy={cy} rx={RAIL.rx} ry={RAIL.ry} fill={`url(#rail${uid})`} stroke={shade(st.rail, -0.6)} strokeWidth={4} />
      <ellipse cx={cx} cy={cy - 6} rx={RAIL.rx - 14} ry={RAIL.ry - 14} fill="none" stroke="#fff" strokeOpacity={0.1} strokeWidth={10} />
      {STUDS.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y + 1.5} r={4.6} fill="#000" opacity={0.45} />
          <circle cx={p.x} cy={p.y} r={4.2} fill={st.railAccent} />
          <circle cx={p.x - 1.3} cy={p.y - 1.3} r={1.6} fill="#fff" opacity={0.55} />
        </g>
      ))}
      <ellipse cx={cx} cy={cy} rx={FELT.rx + 16} ry={FELT.ry + 16} fill="none" stroke={st.railAccent} strokeOpacity={0.55} strokeWidth={1.5} />
      <ellipse cx={cx} cy={cy} rx={FELT.rx + 10} ry={FELT.ry + 10} fill="none" stroke={st.railAccent} strokeWidth={7} />
      <ellipse cx={cx} cy={cy} rx={FELT.rx + 10} ry={FELT.ry + 10} fill="none" stroke="#fff" strokeOpacity={0.25} strokeWidth={1.2} strokeDasharray="1 7" />
      <ellipse cx={cx} cy={cy} rx={FELT.rx + 10} ry={FELT.ry + 10} fill="none" stroke="#000" strokeOpacity={0.3} strokeWidth={1.5} />
      {/* feltro */}
      <ellipse cx={cx} cy={cy} rx={FELT.rx} ry={FELT.ry} fill={`url(#felt${uid})`} />
      {st.pattern !== 'none' && <ellipse cx={cx} cy={cy} rx={FELT.rx} ry={FELT.ry} fill={`url(#pat${uid})`} opacity={st.pattern === 'damask' ? 0.13 : 0.1} />}
      <ellipse cx={cx} cy={cy} rx={FELT.rx} ry={FELT.ry} fill="none" stroke="#000" strokeOpacity={0.35} strokeWidth={16} />
      <ellipse
        cx={cx}
        cy={cy}
        rx={FELT.rx - 150}
        ry={FELT.ry - 120}
        fill="none"
        stroke={st.patternColor}
        strokeOpacity={0.2}
        strokeWidth={2}
      />
      <ellipse cx={cx} cy={cy} rx={FELT.rx - 160} ry={FELT.ry - 130} fill="none" stroke={st.patternColor} strokeOpacity={0.12} strokeWidth={1} />
      <text x={cx} y={cy + 205} textAnchor="middle" fontFamily="'Cinzel Decorative', Cinzel, serif" fontWeight={700} fontSize={40} letterSpacing={12} fill={st.logoColor} opacity={0.22}>
        {st.logoText}
      </text>
      {showSlots &&
        [0, 1, 2, 3, 4].map((i) => {
          const p = boardSlot(i);
          return (
            <rect
              key={i}
              x={p.x - CARD_W / 2}
              y={p.y - CARD_H / 2}
              width={CARD_W}
              height={CARD_H}
              rx={6}
              fill="#000"
              fillOpacity={0.14}
              stroke={st.railAccent}
              strokeOpacity={0.3}
              strokeWidth={1.5}
            />
          );
        })}
    </svg>
  );
});
