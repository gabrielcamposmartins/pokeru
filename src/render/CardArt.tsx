import { memo, useEffect, useId, useState } from 'react';
import { motion } from 'framer-motion';
import { rankLabel, type Card } from '../../shared/cards';
import type { BackPattern, CardBackStyle, CardFaceStyle, Emblem, FontKey } from '../../shared/styles';
import { CROWN_PATH, Damask, FLEUR_PATH, Flower, MOON_PATH, SuitGlyph, starPath } from './suits';
import { cleanId, shade } from '../util/color';
import { useEquipped } from '../store/profile';
import { CardWinFx, type WinFx } from './cardfx';

export const FONT_FAMILY: Record<FontKey, string> = {
  serif: 'Georgia, "Times New Roman", serif',
  sans: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
  rounded: '"M PLUS Rounded 1c", "Segoe UI", sans-serif',
  fancy: 'Cinzel, Georgia, serif',
  mono: 'Consolas, "Courier New", monospace',
  classic: '"Playfair Display", Georgia, serif',
};

export const FONT_LABEL: Record<FontKey, string> = {
  serif: 'Serifada',
  sans: 'Moderna',
  rounded: 'Arredondada',
  fancy: 'Real',
  mono: 'Digital',
  classic: 'Clássica',
};

type Pip = [number, number, boolean?];
const C1 = 78;
const C2 = 125;
const C3 = 172;
const PIPS: Record<number, Pip[]> = {
  2: [[C2, 82], [C2, 268, true]],
  3: [[C2, 82], [C2, 175], [C2, 268, true]],
  4: [[C1, 82], [C3, 82], [C1, 268, true], [C3, 268, true]],
  5: [[C1, 82], [C3, 82], [C2, 175], [C1, 268, true], [C3, 268, true]],
  6: [[C1, 82], [C3, 82], [C1, 175], [C3, 175], [C1, 268, true], [C3, 268, true]],
  7: [[C1, 82], [C3, 82], [C2, 128], [C1, 175], [C3, 175], [C1, 268, true], [C3, 268, true]],
  8: [[C1, 82], [C3, 82], [C2, 128], [C1, 175], [C3, 175], [C2, 222, true], [C1, 268, true], [C3, 268, true]],
  9: [[C1, 82], [C3, 82], [C1, 144], [C3, 144], [C2, 175], [C1, 206, true], [C3, 206, true], [C1, 268, true], [C3, 268, true]],
  10: [[C1, 82], [C3, 82], [C2, 113], [C1, 144], [C3, 144], [C1, 206, true], [C3, 206, true], [C2, 237, true], [C1, 268, true], [C3, 268, true]],
};

function CourtIcon({ rank, color, stroke }: { rank: number; color: string; stroke: string }) {
  if (rank === 13) return <path d={CROWN_PATH} fill={color} stroke={stroke} strokeWidth={3} strokeLinejoin="round" />;
  if (rank === 12)
    return (
      <g fill={color} stroke={stroke} strokeWidth={3}>
        <path d="M-30 12 Q0 -30 30 12 Z" strokeLinejoin="round" />
        <circle cx={0} cy={-14} r={7} />
        <circle cx={-18} cy={-2} r={4.5} />
        <circle cx={18} cy={-2} r={4.5} />
      </g>
    );
  return <path d={starPath(26, 11, 4)} fill={color} stroke={stroke} strokeWidth={3} strokeLinejoin="round" />;
}

export const CardFaceArt = memo(function CardFaceArt({ card, style: st }: { card: Card; style: CardFaceStyle }) {
  const uid = cleanId(useId());
  const color = st.suitColors[card.s];
  const bw = st.borderWidth;
  const font = FONT_FAMILY[st.font];
  const label = rankLabel(card.r);
  const k = st.indexScale;
  const court = card.r >= 11 && card.r <= 13;
  const idxSize = (label === '10' ? 40 : 48) * k;

  const index = (flip: boolean) => (
    <g transform={flip ? 'rotate(180 125 175)' : undefined}>
      <text
        x={31}
        y={18 + 42 * k}
        textAnchor="middle"
        fontFamily={font}
        fontWeight={700}
        fontSize={idxSize}
        letterSpacing={label === '10' ? -3 : 0}
        fill={color}
      >
        {label}
      </text>
      <SuitGlyph suit={card.s} x={31} y={18 + 42 * k + 22 * k} size={28 * k} color={color} />
    </g>
  );

  let center: React.ReactNode;
  if (st.center === 'minimal') {
    center = (
      <g>
        <text x={125} y={205} textAnchor="middle" fontFamily={font} fontWeight={800} fontSize={label === '10' ? 104 : 124} fill={court ? st.courtColor : color}>
          {label}
        </text>
        <SuitGlyph suit={card.s} x={125} y={252} size={46} color={color} />
      </g>
    );
  } else if (court) {
    if (st.court === 'letter') {
      center = (
        <g>
          <text
            x={125}
            y={222}
            textAnchor="middle"
            fontFamily={font}
            fontWeight={900}
            fontSize={150}
            fill={st.courtColor}
            stroke={st.courtAccent}
            strokeWidth={4}
            paintOrder="stroke"
          >
            {label}
          </text>
          <SuitGlyph suit={card.s} x={125} y={268} size={42} color={color} />
        </g>
      );
    } else {
      center = (
        <g>
          <rect x={60} y={66} width={130} height={218} rx={14} fill={st.courtAccent} opacity={0.14} />
          <rect x={60} y={66} width={130} height={218} rx={14} fill="none" stroke={st.courtAccent} strokeWidth={3} />
          <rect x={67} y={73} width={116} height={204} rx={10} fill="none" stroke={st.courtAccent} strokeWidth={1.2} opacity={0.7} />
          <g transform="translate(125 112)">
            <CourtIcon rank={card.r} color={st.courtAccent} stroke={st.courtColor} />
          </g>
          <text x={125} y={212} textAnchor="middle" fontFamily={FONT_FAMILY.fancy} fontWeight={900} fontSize={84} fill={st.courtColor}>
            {label}
          </text>
          <SuitGlyph suit={card.s} x={125} y={250} size={34} color={color} />
        </g>
      );
    }
  } else if (st.center === 'big' || card.r === 14) {
    center = <SuitGlyph suit={card.s} x={125} y={178} size={card.r === 14 ? 140 : 118} color={color} />;
  } else {
    const size = card.r >= 9 ? 38 : 42;
    center = (
      <g>
        {PIPS[card.r].map(([x, y, f], i) => (
          <SuitGlyph key={i} suit={card.s} x={x} y={y} size={size} color={color} flip={!!f} />
        ))}
      </g>
    );
  }

  const inset = bw + 9;
  const corpo = { x: bw / 2, y: bw / 2, width: 250 - bw, height: 350 - bw, rx: st.radius };
  return (
    <g>
      <defs>
        <linearGradient id={`fg${uid}`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor={st.bg} />
          <stop offset="1" stopColor={st.bgGradient} />
        </linearGradient>
        {st.special && (
          <clipPath id={`cp${uid}`}>
            <rect {...corpo} />
          </clipPath>
        )}
        {st.special === 'rainbow' && (
          <linearGradient id={`rb${uid}`} x1="0" y1="0" x2="1" y2="0">
            {/*
              * Seis matizes e a volta ao primeiro.
              *
              * A faixa é desenhada com o dobro da largura da carta e corre para o lado; repetir a
              * cor inicial no fim é o que faz a emenda passar sem costura visível.
              */}
            {['#ff5d5d', '#ffb547', '#ffe66d', '#6bff9e', '#5ad2ff', '#b07bff', '#ff5d5d'].map((c, i) => (
              <stop key={c + i} offset={i / 6} stopColor={c} />
            ))}
          </linearGradient>
        )}
      </defs>

      {/*
        * O corpo.
        *
        * No vidro ele é translúcido: quem estiver atrás da carta — o feltro, outra carta — aparece
        * por baixo. Nas outras é o degradê opaco de sempre.
        */}
      <rect
        {...corpo}
        fill={`url(#fg${uid})`}
        fillOpacity={st.special === 'glass' ? 0.3 : 1}
        stroke={st.border}
        strokeWidth={bw}
        strokeOpacity={st.special === 'glass' ? 0.8 : 1}
      />
      {st.special === 'rainbow' && (
        <g clipPath={`url(#cp${uid})`}>
          {/*
            * A faixa que corre: é o movimento que faz a cor parecer material, e não pintura.
            *
            * O atraso negativo começa a animação no meio, e cada valor de carta começa num ponto
            * diferente da volta — assim uma mão de cinco cartas mostra cinco cores, em vez de cinco
            * cópias do mesmo instante do arco-íris.
            */}
          <rect
            className="face-rainbow"
            style={{ animationDelay: `-${(((card.r * 3 + 'shdc'.indexOf(card.s)) % 7) * 1).toFixed(2)}s` }}
            x={-250}
            y={-40}
            width={500}
            height={430}
            fill={`url(#rb${uid})`}
          />
          {/* verniz por cima da cor, para a carta não virar um cartaz chapado */}
          <rect {...corpo} fill={`url(#fg${uid})`} opacity={0.1} />
          <path d="M0 0 L250 0 L250 60 L0 150 Z" fill="#ffffff" opacity={0.16} />
        </g>
      )}
      {st.special === 'glass' && (
        <g clipPath={`url(#cp${uid})`}>
          {/*
            * O vidro: dois brilhos especulares em diagonal e um bisel claro por dentro da borda.
            *
            * É o reflexo que faz o olho ler "vidro" em vez de "carta desbotada" — sem ele, uma
            * carta translúcida parece só um erro de opacidade.
            */}
          <path d="M-10 250 L120 -10 L190 -10 L20 330 Z" fill="#ffffff" opacity={0.3} />
          <path d="M150 360 L250 150 L250 250 L205 360 Z" fill="#ffffff" opacity={0.18} />
          <rect x={bw + 3} y={bw + 3} width={250 - (bw + 3) * 2} height={350 - (bw + 3) * 2} rx={Math.max(4, st.radius - 3)} fill="none" stroke="#ffffff" strokeWidth={2} opacity={0.55} />
          {/* a nuvem fosca no miolo: é o que sustenta a tinta sobre qualquer mesa */}
          <ellipse cx={125} cy={175} rx={92} ry={132} fill="#ffffff" opacity={0.1} />
        </g>
      )}
      {st.frame !== 'none' && (
        <rect
          x={inset}
          y={inset}
          width={250 - inset * 2}
          height={350 - inset * 2}
          rx={Math.max(4, st.radius - inset / 2)}
          fill="none"
          stroke={st.frameColor}
          strokeWidth={st.frame === 'ornate' ? 2.5 : 2}
        />
      )}
      {st.frame === 'double' && (
        <rect
          x={inset + 6}
          y={inset + 6}
          width={250 - (inset + 6) * 2}
          height={350 - (inset + 6) * 2}
          rx={Math.max(3, st.radius - inset / 2 - 4)}
          fill="none"
          stroke={st.frameColor}
          strokeWidth={1.2}
          opacity={0.8}
        />
      )}
      {st.frame === 'ornate' &&
        [
          [inset, inset],
          [250 - inset, inset],
          [inset, 350 - inset],
          [250 - inset, 350 - inset],
        ].map(([x, y], i) => (
          <path key={i} transform={`translate(${x} ${y}) rotate(45)`} d="M-7 0 L0 -7 L7 0 L0 7 Z" fill={st.frameColor} />
        ))}
      {center}
      {index(false)}
      {index(true)}
    </g>
  );
});

function PatternDef({ id, st }: { id: string; st: CardBackStyle }) {
  const s = 30 * st.patternScale;
  const c = st.patternColor;
  const common = { id, patternUnits: 'userSpaceOnUse' as const };
  const kinds: Record<BackPattern, React.ReactNode> = {
    solid: null,
    stripes: (
      <pattern {...common} width={s} height={s} patternTransform="rotate(45)">
        <rect width={s * 0.38} height={s} fill={c} />
      </pattern>
    ),
    diamonds: (
      <pattern {...common} width={s} height={s * 1.3}>
        <path d={`M${s / 2} ${s * 0.08} L${s * 0.92} ${s * 0.65} L${s / 2} ${s * 1.22} L${s * 0.08} ${s * 0.65} Z`} fill={c} />
      </pattern>
    ),
    dots: (
      <pattern {...common} width={s} height={s}>
        <circle cx={s / 2} cy={s / 2} r={s * 0.16} fill={c} />
        <circle cx={0} cy={0} r={s * 0.1} fill={c} />
        <circle cx={s} cy={0} r={s * 0.1} fill={c} />
        <circle cx={0} cy={s} r={s * 0.1} fill={c} />
        <circle cx={s} cy={s} r={s * 0.1} fill={c} />
      </pattern>
    ),
    checker: (
      <pattern {...common} width={s} height={s}>
        <rect width={s / 2} height={s / 2} fill={c} />
        <rect x={s / 2} y={s / 2} width={s / 2} height={s / 2} fill={c} />
      </pattern>
    ),
    waves: (
      <pattern {...common} width={s} height={s * 0.6}>
        <path
          d={`M0 ${s * 0.3} Q${s * 0.25} ${s * 0.05} ${s * 0.5} ${s * 0.3} T${s} ${s * 0.3}`}
          fill="none"
          stroke={c}
          strokeWidth={s * 0.09}
        />
      </pattern>
    ),
    lattice: (
      <pattern {...common} width={s} height={s} patternTransform="rotate(45)">
        <rect width={s} height={s * 0.09} fill={c} />
        <rect width={s * 0.09} height={s} fill={c} />
        <circle cx={s / 2} cy={s / 2} r={s * 0.08} fill={c} />
      </pattern>
    ),
    stars: (
      <pattern {...common} width={s * 1.6} height={s * 1.6}>
        <path transform={`translate(${s * 0.4} ${s * 0.45})`} d={starPath(s * 0.2, s * 0.08)} fill={c} />
        <path transform={`translate(${s * 1.2} ${s * 1.15})`} d={starPath(s * 0.12, s * 0.05)} fill={c} />
        <circle cx={s * 1.25} cy={s * 0.35} r={s * 0.04} fill={c} />
        <circle cx={s * 0.3} cy={s * 1.3} r={s * 0.05} fill={c} />
      </pattern>
    ),
    sakura: (
      <pattern {...common} width={s * 1.8} height={s * 1.8}>
        <g transform={`translate(${s * 0.5} ${s * 0.55})`}>
          <Flower r={s * 0.3} color={c} />
        </g>
        <g transform={`translate(${s * 1.35} ${s * 1.35}) rotate(30)`}>
          <Flower r={s * 0.2} color={c} />
        </g>
        <ellipse cx={s * 1.4} cy={s * 0.4} rx={s * 0.06} ry={s * 0.1} transform={`rotate(40 ${s * 1.4} ${s * 0.4})`} fill={c} />
      </pattern>
    ),
    scales: (
      <pattern {...common} width={s} height={s / 2}>
        <circle cx={s / 2} cy={s / 2} r={s / 2} fill="none" stroke={c} strokeWidth={s * 0.07} />
        <circle cx={0} cy={0} r={s / 2} fill="none" stroke={c} strokeWidth={s * 0.07} />
        <circle cx={s} cy={0} r={s / 2} fill="none" stroke={c} strokeWidth={s * 0.07} />
      </pattern>
    ),
    damask: (
      <pattern {...common} width={s * 1.6} height={s * 2.2}>
        <Damask w={s * 1.6} h={s * 2.2} color={c} stroke={s * 0.05} />
      </pattern>
    ),
  };
  return <>{kinds[st.pattern]}</>;
}

function EmblemArt({ emblem, st }: { emblem: Emblem; st: CardBackStyle }) {
  const c = st.emblemColor;
  switch (emblem) {
    case 'spade':
    case 'heart':
    case 'diamond':
    case 'club':
      return <SuitGlyph suit={emblem[0] as 's' | 'h' | 'd' | 'c'} size={52} color={c} />;
    case 'star':
      return <path d={starPath(30, 13)} fill={c} />;
    case 'moon':
      return <path d={MOON_PATH} fill={c} />;
    case 'crown':
      return <path d={CROWN_PATH} transform="scale(0.95)" fill={c} />;
    case 'flower':
      return <Flower r={30} color={c} center={st.emblemBg} />;
    case 'fleur':
      return <path d={FLEUR_PATH} transform="translate(0 -2) scale(0.66)" fill={c} />;
    case 'text':
      return (
        <text y={14} textAnchor="middle" fontFamily={FONT_FAMILY.fancy} fontWeight={900} fontSize={st.emblemText.length > 2 ? 28 : 38} fill={c}>
          {st.emblemText}
        </text>
      );
    default:
      return null;
  }
}

export const CardBackArt = memo(function CardBackArt({ style: st }: { style: CardBackStyle }) {
  const uid = cleanId(useId());
  const bw = st.borderWidth;
  const innerX = bw;
  const innerR = Math.max(2, st.radius - bw / 2);
  return (
    <g>
      <defs>
        <linearGradient id={`bg${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={st.base} />
          <stop offset="1" stopColor={st.base2} />
        </linearGradient>
        <PatternDef id={`bp${uid}`} st={st} />
        <clipPath id={`bc${uid}`}>
          <rect x={innerX} y={innerX} width={250 - innerX * 2} height={350 - innerX * 2} rx={innerR} />
        </clipPath>
      </defs>
      <rect x={0} y={0} width={250} height={350} rx={st.radius} fill={st.border} />
      <rect x={innerX} y={innerX} width={250 - innerX * 2} height={350 - innerX * 2} rx={innerR} fill={`url(#bg${uid})`} />
      {st.pattern !== 'solid' && (
        <rect
          x={innerX}
          y={innerX}
          width={250 - innerX * 2}
          height={350 - innerX * 2}
          rx={innerR}
          fill={`url(#bp${uid})`}
          opacity={st.patternOpacity}
        />
      )}
      {st.image && (
        <image
          href={st.image}
          x={innerX}
          y={innerX}
          width={250 - innerX * 2}
          height={350 - innerX * 2}
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#bc${uid})`}
          opacity={st.imageOpacity}
        />
      )}
      <rect
        x={innerX + 7}
        y={innerX + 7}
        width={250 - (innerX + 7) * 2}
        height={350 - (innerX + 7) * 2}
        rx={Math.max(2, innerR - 6)}
        fill="none"
        stroke={st.frame}
        strokeWidth={3}
      />
      {st.emblem !== 'none' && (
        <g transform="translate(125 175)">
          <circle r={46} fill={st.emblemBg} stroke={st.emblemColor} strokeWidth={4} />
          <circle r={38} fill="none" stroke={st.emblemColor} strokeWidth={1.2} opacity={0.6} />
          <EmblemArt emblem={st.emblem} st={st} />
        </g>
      )}
      <rect x={0.75} y={0.75} width={248.5} height={348.5} rx={st.radius} fill="none" stroke={shade(st.border, -0.35)} strokeWidth={1.5} />
    </g>
  );
});

export function CardFaceSvg({ card, style, width }: { card: Card; style: CardFaceStyle; width: number }) {
  return (
    <svg viewBox="0 0 250 350" width={width} height={width * 1.4} className="card-svg">
      <CardFaceArt card={card} style={style} />
    </svg>
  );
}

export function CardBackSvg({ style, width }: { style: CardBackStyle; width: number }) {
  return (
    <svg viewBox="0 0 250 350" width={width} height={width * 1.4} className="card-svg">
      <CardBackArt style={style} />
    </svg>
  );
}

export interface CardViewProps {
  card: Card | null;
  faceUp?: boolean;
  width: number;
  face?: CardFaceStyle;
  back?: CardBackStyle;
  /** Monta virada para baixo e vira ao aparecer. */
  flipIn?: boolean;
  flipDelay?: number;
  highlight?: boolean;
  dim?: boolean;
  /** Efeito de vitória desenhado sobre a carta (src/render/cardfx.tsx). */
  winFx?: WinFx | null;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Carta com frente e verso. A virada "achata" a carta no eixo X e troca a face no meio,
 * o que funciona inclusive dentro do plano 3D da mesa (sem depender de preserve-3d).
 */
export function CardView({ card, faceUp = true, width, face, back, flipIn, flipDelay = 0, highlight, dim, winFx, className, style }: CardViewProps) {
  const eqFace = useEquipped('face');
  const eqBack = useEquipped('back');
  const f = face ?? eqFace;
  const b = back ?? eqBack;
  const up = faceUp && !!card;
  const [shown, setShown] = useState(flipIn ? false : up);
  // espessura e brilho da carta (o resto está em .cardv, em global.css).
  // a lateral é o papel visto de lado: a cor do miolo (frente) ou da margem (verso).
  const paper = shown && card ? f : b;
  // a espessura só é de vidro com a frente para cima: de costas, a carta é o verso (papel)
  const vidro = shown && !!card && f.special === 'glass';
  const solid: React.CSSProperties = {
    ['--cr' as string]: `${(paper.radius * width) / 250}px`,
    ['--ct' as string]: `${Math.max(2, width * 0.03)}px`,
    ['--ce' as string]: shade(shown && card ? f.bg : b.border, -0.14),
  };
  const [phase, setPhase] = useState<'idle' | 'out' | 'in'>('idle');
  useEffect(() => {
    if (shown !== up && phase === 'idle') setPhase('out');
  }, [up, shown, phase]);
  return (
    <motion.div
      className={`cardv ${vidro ? 'card-glass' : ''} ${highlight ? 'card-hl' : ''} ${dim ? 'card-dim' : ''} ${className ?? ''}`}
      style={{ width, height: width * 1.4, ...solid, ...style }}
      initial={false}
      animate={phase === 'out' ? { scaleX: 0, y: -width * 0.1 } : { scaleX: 1, y: 0 }}
      transition={phase === 'out' ? { duration: 0.15, delay: flipDelay, ease: 'easeIn' } : { duration: 0.2, ease: 'easeOut' }}
      onAnimationComplete={() => {
        if (phase === 'out') {
          setShown(up);
          setPhase('in');
        } else if (phase === 'in') setPhase('idle');
      }}
    >
      {shown && card ? <CardFaceSvg card={card} style={f} width={width} /> : <CardBackSvg style={b} width={width} />}
      {winFx && <CardWinFx fx={winFx} width={width} radius={(paper.radius * width) / 250} seed={card ? card.r * 4 + 'shdc'.indexOf(card.s) : 7} />}
    </motion.div>
  );
}
