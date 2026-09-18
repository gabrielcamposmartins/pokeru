import { memo, useId } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_WIN_FX, WIN_FX_IDS, type WinFxId } from '../../shared/styles';
import { cleanId } from '../util/color';
import { starPath } from './suits';
import type { FxSound } from '../audio/sfx';

/* =====================================================================
 * Efeitos das cartas vencedoras.
 *
 * Cada efeito é uma entrada em WIN_FX: cores, o tipo de moldura que marca a
 * carta e, opcionalmente, camadas desenhadas por cima (chamas, raios, etc).
 *
 * Para criar um efeito novo:
 *   1. acrescente o id em WIN_FX_IDS (shared/styles.ts — é o que viaja na rede);
 *   2. acrescente a entrada aqui, com nome, cores, moldura e camadas;
 *   3. se a camada for nova, escreva as animações dela em src/styles/cardfx.css.
 * O teste em cardfx.test.ts garante que todo id tenha entrada.
 *
 * As camadas são desenhadas num SVG onde a carta ocupa 0..100 x 0..140
 * (o viewBox é maior, então dá para transbordar a carta).
 * ===================================================================== */

/** Moldura que aponta a carta vencedora. */
export type FxFrame =
  /** Pulsa, engrossando e brilhando. */
  | 'pulse'
  /** Tracejado que corre ao redor da carta. */
  | 'march'
  /** Pisca como uma descarga elétrica. */
  | 'flicker';

export interface FxCtx {
  /** Semente para as posições das partículas (estáveis entre desenhos). */
  seed: number;
  /** Raio dos cantos da carta, na escala 100x140. */
  radius: number;
}

export interface WinFx {
  id: WinFxId;
  name: string;
  description: string;
  /** [cor principal, cor do brilho] — usadas na moldura e nas camadas. */
  colors: [string, string];
  frame: FxFrame;
  /** Camadas desenhadas sobre a carta. */
  layers?: (ctx: FxCtx) => ReactNode;
  /** Som tocado quando o efeito aparece. */
  sound?: FxSound;
}

// ------------------------------------------------------------------ partículas e camadas

/** Números pseudoaleatórios estáveis a partir de uma semente. */
function rnd(seed: number): () => number {
  let s = (seed % 2147483646) + 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Estrelinhas piscando ao redor da carta. */
function Sparks({ seed, n = 7, color }: { seed: number; n?: number; color: string }) {
  const r = rnd(seed);
  const d = starPath(7, 1.8, 4);
  return (
    <g fill={color}>
      {Array.from({ length: n }, (_, i) => {
        const x = -8 + r() * 116;
        const y = -8 + r() * 156;
        const s = 0.5 + r() * 0.9;
        return (
          <g key={i} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${s.toFixed(2)})`}>
            <path className="fx-spark" style={{ animationDelay: `${(r() * 1.6).toFixed(2)}s` }} d={d} />
          </g>
        );
      })}
    </g>
  );
}

/** Chamas lambendo a carta de baixo para cima, com brasas subindo. */
function Flames({ seed, colors }: { seed: number; colors: [string, string] }) {
  const r = rnd(seed);
  return (
    <g className="fx-hot">
      {[10, 30, 50, 70, 90].map((x, i) => (
        <path
          key={x}
          className="fx-flame"
          style={{ animationDelay: `${(i * 0.13).toFixed(2)}s` }}
          fill={i % 2 ? colors[1] : colors[0]}
          d={`M${x} 148 C${x - 11} 128 ${x - 5} 116 ${x} 92 C${x + 6} 116 ${x + 11} 130 ${x} 148 Z`}
        />
      ))}
      {Array.from({ length: 7 }, (_, i) => (
        <circle
          key={i}
          className="fx-ember"
          style={{ animationDelay: `${(r() * 1.8).toFixed(2)}s` }}
          cx={(6 + r() * 88).toFixed(1)}
          cy={(110 + r() * 34).toFixed(1)}
          r={(0.8 + r() * 1.4).toFixed(2)}
          fill={colors[1]}
        />
      ))}
    </g>
  );
}

/** Raios saltando pelas bordas da carta, com clarões. */
function Bolts({ seed, colors, radius }: { seed: number; colors: [string, string]; radius: number }) {
  const r = rnd(seed);
  const bolt = (x0: number, y0: number, x1: number, y1: number) => {
    let d = `M${x0} ${y0}`;
    for (let i = 1; i <= 5; i++) {
      const t = i / 5;
      const jx = (r() - 0.5) * 18;
      const jy = (r() - 0.5) * 18;
      d += ` L${(x0 + (x1 - x0) * t + jx).toFixed(1)} ${(y0 + (y1 - y0) * t + jy).toFixed(1)}`;
    }
    return d;
  };
  const paths = [bolt(2, 8, 2, 132), bolt(98, 8, 98, 132), bolt(14, 0, 86, 0), bolt(14, 140, 86, 140)];
  return (
    <g className="fx-hot">
      <rect className="fx-flash" x={0} y={0} width={100} height={140} rx={radius} fill={colors[1]} />
      {paths.map((d, i) => (
        <path
          key={i}
          className="fx-bolt"
          style={{ animationDelay: `${(i * 0.09 + r() * 0.2).toFixed(2)}s` }}
          d={d}
          fill="none"
          stroke={i % 2 ? colors[1] : colors[0]}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  );
}

/** Cristais de gelo nos cantos e uma camada de geada nas bordas. */
function Frost({ seed, colors, radius, uid }: { seed: number; colors: [string, string]; radius: number; uid: string }) {
  const r = rnd(seed);
  const shard = (x: number, y: number, a: number, s: number) => (
    <g key={`${x}-${y}`} transform={`translate(${x} ${y}) rotate(${a}) scale(${s})`}>
      <path
        className="fx-shard"
        style={{ animationDelay: `${(r() * 1.2).toFixed(2)}s` }}
        d="M0 -14 L5 -3 L3 12 L0 16 L-3 12 L-5 -3 Z"
        fill={colors[1]}
        stroke={colors[0]}
        strokeWidth={0.8}
      />
    </g>
  );
  return (
    <g className="fx-cold">
      <defs>
        <radialGradient id={`frost${uid}`} cx="50%" cy="50%" r="52%">
          <stop offset="0.45" stopColor={colors[1]} stopOpacity={0} />
          <stop offset="1" stopColor={colors[1]} stopOpacity={0.5} />
        </radialGradient>
      </defs>
      <rect x={0} y={0} width={100} height={140} rx={radius} fill={`url(#frost${uid})`} />
      {shard(6, 12, -24, 1)}
      {shard(94, 128, 158, 1.1)}
      {shard(92, 20, 26, 0.8)}
      {shard(10, 124, 200, 0.85)}
    </g>
  );
}

/** Feixes de luz girando atrás da carta. */
function Rays({ colors }: { colors: [string, string] }) {
  return (
    <g className="fx-rays fx-hot" fill={colors[1]}>
      {Array.from({ length: 12 }, (_, i) => (
        <path key={i} transform={`rotate(${i * 30} 50 70)`} d="M50 70 L46 -12 L54 -12 Z" />
      ))}
      <ellipse cx={50} cy={70} rx={46} ry={62} fill={colors[0]} opacity={0.18} />
    </g>
  );
}

/** Fumaça escura subindo, como uma sombra. */
function Smoke({ seed, colors }: { seed: number; colors: [string, string] }) {
  const r = rnd(seed);
  return (
    <g className="fx-smoke-group">
      {Array.from({ length: 6 }, (_, i) => (
        <ellipse
          key={i}
          className="fx-smoke"
          style={{ animationDelay: `${(r() * 2.2).toFixed(2)}s` }}
          cx={(10 + r() * 80).toFixed(1)}
          cy={(100 + r() * 40).toFixed(1)}
          rx={(8 + r() * 12).toFixed(1)}
          ry={(6 + r() * 10).toFixed(1)}
          fill={i % 2 ? colors[0] : colors[1]}
        />
      ))}
    </g>
  );
}

// ------------------------------------------------------------------ catálogo

/** Brilho simples numa cor: a base dos efeitos "de cor". */
function glow(id: WinFxId, name: string, description: string, colors: [string, string]): WinFx {
  return { id, name, description, colors, frame: 'pulse', sound: 'chime', layers: ({ seed }) => <Sparks seed={seed} color={colors[1]} /> };
}

export const WIN_FX: WinFx[] = [
  glow('gold', 'Brilho Dourado', 'Moldura de ouro pulsando com faíscas — o efeito clássico.', ['#ffd166', '#fff3c4']),
  glow('azure', 'Brilho Azul', 'Luz azul-safira, fria e calma.', ['#4aa8ff', '#d8f0ff']),
  glow('rose', 'Brilho Rosé', 'Rosa-sakura com faíscas claras.', ['#ff6b9a', '#ffd9e6']),
  glow('emerald', 'Brilho Esmeralda', 'Verde-jade luminoso.', ['#35d39a', '#d8fff0']),
  glow('violet', 'Brilho Violeta', 'Ametista com faíscas lilás.', ['#a682ff', '#e8dcff']),
  {
    id: 'prism',
    name: 'Prisma',
    description: 'A moldura corre ao redor da carta trocando de cor.',
    colors: ['#ffd166', '#9ad8ff'],
    frame: 'march',
    sound: 'chime',
    layers: ({ seed }) => <Sparks seed={seed} color="#ffffff" />,
  },
  {
    id: 'lightning',
    name: 'Relâmpago',
    description: 'Descargas elétricas saltam pelas bordas e a carta pisca.',
    colors: ['#9ad8ff', '#ffffff'],
    frame: 'flicker',
    sound: 'zap',
    layers: ({ seed, radius }) => <Bolts seed={seed} colors={['#9ad8ff', '#ffffff']} radius={radius} />,
  },
  {
    id: 'fire',
    name: 'Fogo',
    description: 'Chamas lambem a carta e brasas sobem.',
    colors: ['#ff8a3d', '#ffd166'],
    frame: 'pulse',
    sound: 'flame',
    layers: ({ seed }) => <Flames seed={seed} colors={['#ff6a1f', '#ffd166']} />,
  },
  {
    id: 'ice',
    name: 'Gelo',
    description: 'A carta congela: geada nas bordas e cristais nos cantos.',
    colors: ['#8fe3ff', '#eafcff'],
    frame: 'march',
    sound: 'freeze',
    layers: ({ seed, radius }) => <FrostLayer seed={seed} radius={radius} />,
  },
  {
    id: 'holy',
    name: 'Luz Sagrada',
    description: 'Feixes de luz giram atrás da carta, com halo dourado.',
    colors: ['#ffe9a8', '#fffbe8'],
    frame: 'pulse',
    sound: 'choir',
    layers: ({ seed }) => (
      <>
        <Rays colors={['#ffe9a8', '#fffbe8']} />
        <Sparks seed={seed} n={5} color="#fffbe8" />
      </>
    ),
  },
  {
    id: 'void',
    name: 'Sombra',
    description: 'Fumaça arroxeada engole a carta.',
    colors: ['#a24bff', '#3a0a52'],
    frame: 'pulse',
    sound: 'whoosh',
    layers: ({ seed }) => <Smoke seed={seed} colors={['#6a1fa8', '#a24bff']} />,
  },
];

/** A camada de gelo precisa de um id único para o degradê da geada. */
function FrostLayer({ seed, radius }: { seed: number; radius: number }) {
  const uid = cleanId(useId());
  return <Frost seed={seed} colors={['#8fe3ff', '#eafcff']} radius={radius} uid={uid} />;
}

export function findWinFx(id: string | null | undefined): WinFx {
  return WIN_FX.find((f) => f.id === id) ?? WIN_FX.find((f) => f.id === DEFAULT_WIN_FX) ?? WIN_FX[0];
}

/** Ids sem entrada no catálogo (deveria ser sempre vazio — veja cardfx.test.ts). */
export const MISSING_WIN_FX = WIN_FX_IDS.filter((id) => !WIN_FX.some((f) => f.id === id));

// ------------------------------------------------------------------ desenho sobre a carta

/**
 * Camada do efeito sobre uma carta. Fica um pouco maior que a carta (o viewBox
 * sobra para os dois lados), então chamas e raios podem passar das bordas.
 */
export const CardWinFx = memo(function CardWinFx({
  fx,
  width,
  radius = 7,
  seed = 1,
}: {
  fx: WinFx;
  width: number;
  /** Raio dos cantos da carta, em px na largura dada. */
  radius?: number;
  seed?: number;
}) {
  const pad = width * 0.22;
  const k = width / 100;
  const r = radius / k;
  return (
    <svg
      className={`card-fx fx-${fx.id}`}
      style={
        {
          left: -pad,
          top: -pad,
          width: width + pad * 2,
          height: width * 1.4 + pad * 2,
          '--fx-1': fx.colors[0],
          '--fx-2': fx.colors[1],
        } as React.CSSProperties
      }
      viewBox={`${-pad / k} ${-pad / k} ${100 + (pad * 2) / k} ${140 + (pad * 2) / k}`}
      aria-hidden
    >
      {fx.layers?.({ seed, radius: r })}
      <rect className={`fx-frame fx-frame-${fx.frame}`} x={1.2} y={1.2} width={97.6} height={137.6} rx={r} fill="none" />
    </svg>
  );
});
