import { motion } from 'framer-motion';
import type { TableView } from '../../shared/protocol';
import { useEquipped } from '../store/profile';
import { fmt } from '../util/format';
import { shade } from '../util/color';
import { CONSOLE, type SeatGeo } from './layout';
import { useUiTheme } from '../ui/themes';

const STREET: Record<string, string> = {
  preflop: 'Pré-flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Showdown',
};

/**
 * Console central no estilo Mahjong Soul: placa escura no plano da mesa com o pote,
 * a rua atual e luzes nas bordas apontando para cada jogador (a da vez pulsa).
 */
export function CenterConsole({ view, geo }: { view: TableView; geo: SeatGeo[] }) {
  const table = useEquipped('table');
  const { table: look } = useUiTheme();
  const [bgTop, bgBottom] = look.consoleBg === 'rail' ? [shade(table.rail, 0.12), shade(table.rail, -0.6)] : look.consoleBg;
  const r = look.consoleRadius;
  const { w, h } = CONSOLE;
  const total = view.pot + view.seats.reduce((s, x) => s + (x?.bet ?? 0), 0);
  const accent = table.railAccent;
  return (
    <div className="console" style={{ left: CONSOLE.x - w / 2, top: CONSOLE.y - h / 2, width: w, height: h }}>
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="console-svg">
        <defs>
          <linearGradient id="console-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={bgTop} />
            <stop offset="1" stopColor={bgBottom} />
          </linearGradient>
          <filter id="console-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
        <rect x={4} y={10} width={w - 8} height={h - 8} rx={r} fill="#000" opacity={0.45} />
        <rect x={4} y={4} width={w - 8} height={h - 8} rx={r} fill="url(#console-bg)" stroke={accent} strokeWidth={3} />
        {look.ornate ? (
          <>
            <rect x={13} y={13} width={w - 26} height={h - 26} rx={Math.max(4, r - 7)} fill="none" stroke={accent} strokeOpacity={0.55} strokeWidth={1.2} />
            {[
              [13, 13],
              [w - 13, 13],
              [13, h - 13],
              [w - 13, h - 13],
            ].map(([x, y], i) => (
              <path key={i} transform={`translate(${x} ${y}) rotate(45)`} d="M-6 0 L0 -6 L6 0 L0 6 Z" fill={accent} />
            ))}
          </>
        ) : (
          <rect x={12} y={12} width={w - 24} height={h - 24} rx={r - 7} fill="none" stroke="#fff" strokeOpacity={0.1} strokeWidth={1.5} />
        )}
        <path d={`M40 ${h * 0.34} Q${w / 2} ${h * 0.1} ${w - 40} ${h * 0.34}`} fill="none" stroke="#fff" strokeOpacity={0.06} strokeWidth={18} strokeLinecap="round" />
        {view.seats.map((s, seat) => {
          const g = geo[seat];
          if (!s || !g) return null;
          const ang = Math.atan2(g.edge.y - CONSOLE.y, g.edge.x - CONSOLE.x);
          const x = w / 2 + Math.cos(ang) * (w / 2 - 9);
          const y = h / 2 + Math.sin(ang) * (h / 2 - 9);
          const deg = (ang * 180) / Math.PI + 90;
          const acting = view.toAct === seat;
          const active = s.inHand && !s.folded;
          const color = acting ? look.turnLight : active ? accent : shade(accent, -0.6);
          return (
            <g key={seat} transform={`translate(${x} ${y}) rotate(${deg})`}>
              {acting && <rect x={-40} y={-7} width={80} height={14} rx={7} fill={color} filter="url(#console-glow)" className="turn-glow" />}
              <rect x={-32} y={-3.5} width={64} height={7} rx={3.5} fill={color} opacity={acting ? 1 : active ? 0.7 : 0.35} />
            </g>
          );
        })}
      </svg>
      <div className="console-text">
        <span className="console-label">POTE</span>
        <motion.span key={total} className="console-pot" initial={{ scale: 1.35, color: '#ffffff' }} animate={{ scale: 1, color: '#ffe7a0' }} transition={{ duration: 0.4 }}>
          {fmt(total)}
        </motion.span>
        <span className="console-sub">
          {view.street ? STREET[view.street] : 'Aguardando'} · Mão #{view.handNo}
        </span>
      </div>
    </div>
  );
}
