import { memo, useId } from 'react';
import { CHIP_VALUES, type ChipStyle } from '../../shared/styles';
import { cleanId, shade } from '../util/color';
import { fmt } from '../util/format';
import { useEquipped } from '../store/profile';

export function chipLabel(v: number): string {
  return v >= 1000 ? `${v / 1000}k` : String(v);
}

/** Face de uma ficha num quadrado de 100x100 centrado em (0,0). */
export const ChipFace = memo(function ChipFace({ ti, st }: { ti: number; st: ChipStyle }) {
  const tier = st.tiers[ti] ?? st.tiers[0];
  const n = st.edgeCount;
  const C = 2 * Math.PI * 43.5;
  const seg = C / n;
  const value = CHIP_VALUES[ti];
  return (
    <g>
      <circle r={50} fill={tier.base} />
      {st.edgePattern === 'blocks' && (
        <circle r={43.5} fill="none" stroke={tier.edge} strokeWidth={13} strokeDasharray={`${seg * 0.42} ${seg * 0.58}`} />
      )}
      {st.edgePattern === 'stripes' && (
        <>
          <circle r={43.5} fill="none" stroke={tier.edge} strokeWidth={13} strokeDasharray={`${seg * 0.14} ${seg * 0.86}`} />
          <circle
            r={43.5}
            fill="none"
            stroke={tier.edge}
            strokeWidth={13}
            strokeDasharray={`${seg * 0.14} ${seg * 0.86}`}
            strokeDashoffset={seg * 0.3}
          />
        </>
      )}
      {st.edgePattern === 'dots' &&
        Array.from({ length: n }, (_, i) => {
          const a = (i / n) * Math.PI * 2;
          return <circle key={i} cx={Math.cos(a) * 43} cy={Math.sin(a) * 43} r={5.5} fill={tier.edge} />;
        })}
      {st.inlay === 'ring' && <circle r={32} fill="none" stroke={tier.edge} strokeWidth={3} />}
      {st.inlay === 'dashed' && <circle r={32} fill="none" stroke={tier.edge} strokeWidth={3} strokeDasharray="6 5" />}
      {st.inlay === 'solid' && <circle r={31} fill={shade(tier.base, 0.14)} stroke={tier.edge} strokeWidth={2} />}
      {st.showValue && (
        <text
          y={value >= 1000 ? 9 : 10}
          className="chip-value"
          textAnchor="middle"
          fontFamily='"M PLUS Rounded 1c", sans-serif'
          fontWeight={800}
          fontSize={value >= 10000 ? 22 : value >= 100 ? 26 : 30}
          fill={tier.text}
        >
          {chipLabel(value)}
        </text>
      )}
      {st.shine && <ellipse cx={-15} cy={-20} rx={22} ry={11} transform="rotate(-32 -15 -20)" fill="#fff" opacity={0.22} />}
      <circle r={49} fill="none" stroke={shade(tier.base, -0.4)} strokeWidth={2} />
    </g>
  );
});

export function ChipSvg({ value, size, style }: { value: number; size: number; style?: ChipStyle }) {
  const eq = useEquipped('chip');
  const st = style ?? eq;
  const ti = Math.max(0, CHIP_VALUES.indexOf(value as (typeof CHIP_VALUES)[number]));
  return (
    <svg viewBox="-52 -52 104 104" width={size} height={size}>
      <ChipFace ti={ti} st={st} />
    </svg>
  );
}

export interface ChipColumn {
  ti: number;
  count: number;
}

/** Decompõe um valor em colunas de fichas (maiores primeiro). */
export function breakdown(amount: number, maxCols = 4, maxH = 9): ChipColumn[] {
  let a = Math.max(0, Math.floor(amount));
  const cols: ChipColumn[] = [];
  for (let i = CHIP_VALUES.length - 1; i >= 0 && a > 0; i--) {
    const v = CHIP_VALUES[i];
    const c = Math.floor(a / v);
    if (c > 0) {
      cols.push({ ti: i, count: c });
      a -= c * v;
    }
  }
  return cols.slice(0, maxCols).map((c) => ({ ...c, count: Math.min(maxH, c.count) }));
}

const STRIPES = [0.12, 0.36, 0.64, 0.88];

/**
 * Uma coluna de fichas empilhadas, vista em 3/4: topo elíptico e a lateral como um cilindro —
 * degradê que escurece nas quinas, listras mais apagadas nas beiradas, friso de luz no topo
 * de cada ficha e uma sombra de contato embaixo, para a pilha assentar na mesa.
 */
export const ChipColumnSvg = memo(function ChipColumnSvg({ ti, count, size, st }: { ti: number; count: number; size: number; st: ChipStyle }) {
  const uid = cleanId(useId());
  const r = size / 2;
  const ry = r * 0.58;
  const th = size * 0.13;
  const h = ry * 2 + count * th;
  const k = size / 100;
  const tier = st.tiers[ti];
  const lineC = shade(tier.base, -0.6);
  /** Borda inferior da elipse do topo em x (onde começa a lateral). */
  const yb = (x: number, cy: number) => cy + ry * Math.sqrt(Math.max(0, 1 - ((x - r) / r) ** 2));
  return (
    <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`} style={{ overflow: 'visible' }}>
      <defs>
        {/* lateral do cilindro: escura nas quinas, clara no meio */}
        <linearGradient id={`wall${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={shade(tier.base, -0.62)} />
          <stop offset="0.16" stopColor={shade(tier.base, -0.36)} />
          <stop offset="0.42" stopColor={shade(tier.base, -0.04)} />
          <stop offset="0.66" stopColor={shade(tier.base, -0.24)} />
          <stop offset="1" stopColor={shade(tier.base, -0.66)} />
        </linearGradient>
        <radialGradient id={`drop${uid}`}>
          <stop offset="0.4" stopColor="#000" stopOpacity={0.45} />
          <stop offset="1" stopColor="#000" stopOpacity={0} />
        </radialGradient>
      </defs>
      <ellipse cx={r} cy={h - th * 0.15} rx={r * 1.2} ry={ry * 0.75} fill={`url(#drop${uid})`} />
      {Array.from({ length: count }, (_, i) => {
        const cy = h - th - ry - i * th;
        return (
          <g key={i}>
            <path
              d={`M0 ${cy} A${r} ${ry} 0 0 0 ${size} ${cy} L${size} ${cy + th} A${r} ${ry} 0 0 1 0 ${cy + th} Z`}
              fill={`url(#wall${uid})`}
              stroke={lineC}
              strokeWidth={0.7}
            />
            {STRIPES.map((f) => {
              const x = size * f;
              return (
                <rect
                  key={f}
                  x={x - size * 0.035}
                  y={yb(x, cy)}
                  width={size * 0.07}
                  height={th * 0.92}
                  fill={tier.edge}
                  opacity={0.95 - 1.1 * Math.abs(f - 0.5)}
                />
              );
            })}
            {/* friso de luz na quina de cima da ficha */}
            <path d={`M0 ${cy} A${r} ${ry} 0 0 0 ${size} ${cy}`} fill="none" stroke="#fff" strokeOpacity={0.16} strokeWidth={size * 0.022} />
            {i === count - 1 ? (
              <g transform={`translate(${r} ${cy}) scale(${k} ${k * 0.58})`}>
                <ChipFace ti={ti} st={st} />
              </g>
            ) : (
              <ellipse cx={r} cy={cy} rx={r} ry={ry} fill={shade(tier.base, -0.12)} />
            )}
          </g>
        );
      })}
    </svg>
  );
});

export function ChipStack({
  amount,
  size = 34,
  label = true,
  style,
  maxCols = 4,
  className,
}: {
  amount: number;
  size?: number;
  label?: boolean;
  style?: ChipStyle;
  maxCols?: number;
  className?: string;
}) {
  const eq = useEquipped('chip');
  const st = style ?? eq;
  if (amount <= 0) return null;
  const cols = breakdown(amount, maxCols);
  return (
    <div className={`chip-stack ${className ?? ''}`}>
      <div className="chip-cols" style={{ gap: size * 0.06 }}>
        {cols.map((c, i) => (
          <ChipColumnSvg key={i} ti={c.ti} count={c.count} size={size} st={st} />
        ))}
      </div>
      {label && <div className="chip-label">{fmt(amount)}</div>}
    </div>
  );
}
