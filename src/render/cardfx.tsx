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
  /**
   * Camadas desenhadas **atrás** da carta.
   *
   * O que cai aqui só aparece onde a carta não cobre: em volta dela e acima. É o que faz o fogo
   * parecer que a carta está dentro dele, e não que ele foi pintado por cima dela.
   */
  back?: (ctx: FxCtx) => ReactNode;
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

/**
 * Uma labareda: sobe de `y0` até `h`, com meia-largura `w` na base e a ponta pendendo para `tilt`.
 *
 * A assimetria é o ponto. Chama simétrica parece folha, e uma labareda grande e lisa parece balão;
 * o que faz o olho ler "fogo" é a silhueta ondulada — infla, estrangula, volta a inflar — e a
 * ponta caindo para um lado. Os dois lados usam controles diferentes de propósito.
 */
function labareda(cx: number, y0: number, h: number, w: number, tilt: number): string {
  const n = (v: number) => v.toFixed(1);
  const x = (f: number) => n(cx + w * f);
  const xt = (f: number, t: number) => n(cx + w * f + tilt * t);
  const y = (f: number) => n(y0 - h * f);
  /*
   * A barriga fica na **altura do meio**, não na base.
   *
   * Uma chama mais larga embaixo some atrás da carta: o que aparece é só um rodapé aceso. Com o
   * ponto mais largo lá em cima — e passando da carta nos dois lados —, a labareda abraça a carta
   * na altura em que o olho está olhando.
   */
  return (
    `M${x(-0.72)} ${n(y0)}` +
    // sobe pela esquerda: infla até a barriga e estrangula no ombro
    ` C${x(-1.02)} ${y(0.2)} ${x(-1.06)} ${y(0.42)} ${xt(-0.55, 0.3)} ${y(0.62)}` +
    // o segundo inchaço e a ponta
    ` C${xt(-0.62, 0.6)} ${y(0.78)} ${xt(-0.14, 1)} ${y(0.9)} ${xt(0, 1)} ${y(1)}` +
    // desce pela direita, com outra onda
    ` C${xt(0.3, 1)} ${y(0.88)} ${xt(0.7, 0.5)} ${y(0.72)} ${x(0.5)} ${y(0.56)}` +
    ` C${x(1.05)} ${y(0.4)} ${x(1)} ${y(0.2)} ${x(0.72)} ${n(y0)}` +
    /*
     * E o fundo fecha numa barriga, não numa reta.
     *
     * A base reta dava à labareda um corte de tesoura embaixo — lia como recorte de papel colado
     * na carta. Arredondada, ela vira um corpo: a chama assenta no rodapé em vez de terminar nele.
     */
    ` C${x(0.5)} ${y(-0.05)} ${x(-0.5)} ${y(-0.05)} ${x(-0.72)} ${n(y0)} Z`
  );
}

/**
 * A labareda: **uma só**, grande e larga, queimando atrás da carta.
 *
 * Fogo de verdade não é uma cor, é uma pilha de temperaturas — então a labareda é feita de três
 * corpos encaixados: o vermelho, que é o mais largo, mais alto e mais lento; o laranja no meio; e
 * o núcleo quase branco, estreito e rápido. Três **corpos**, uma chama.
 *
 * Ela é mais larga e mais alta que a carta, e é isso que faz a coisa funcionar de trás: o que se
 * vê é a chama saindo em volta da silhueta e lambendo por cima da borda de cima. Antes eram sete
 * línguas em fila, o que lia como fogueira de acampamento; uma labareda só lê como a carta
 * **queimando**.
 */
function FlamesBack({ seed, colors }: { seed: number; colors: [string, string] }) {
  const r = rnd(seed);
  const uid = cleanId(useId());
  /** As três temperaturas, da mais fria (fora) para a mais quente (dentro). */
  const camadas = [
    { cor: '#b81c06', op: 0.5, blur: 4.5, alt: 294, larg: 132, dur: 2.6 },
    { cor: colors[0], op: 0.78, blur: 2.6, alt: 237, larg: 96, dur: 2.1 },
    { cor: colors[1], op: 0.9, blur: 1.3, alt: 168, larg: 57, dur: 1.6 },
  ];
  /*
   * A dança é de cada carta.
   *
   * A semente vem da carta (veja o `seed` em CardArt.tsx), então este sorteio dá a cada uma o seu
   * compasso e o seu ponto de partida. Sem isto, uma mão de cinco cartas queimava em coro — cinco
   * chamas inflando e murchando no mesmo instante, que é coisa de luz de natal, não de fogo.
   */
  const compasso = 0.78 + r() * 0.5;
  const partida = r() * 4;
  return (
      <g className="fx-hot">
        <defs>
          <radialGradient id={`brasa${uid}`} cx="50%" cy="100%" r="70%">
            <stop offset="0" stopColor={colors[1]} stopOpacity="0.6" />
            <stop offset="0.4" stopColor={colors[0]} stopOpacity="0.28" />
            <stop offset="1" stopColor={colors[0]} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/*
          * A carta iluminada de baixo: sem isto as chamas parecem coladas na frente dela.
          *
          * Fica rente ao rodapé e discreta. Grande e opaca, virava uma nuvem acesa debaixo da
          * carta — mais parecido com uma lanterna do que com fogo.
          */}
        <ellipse className="fx-brasa" cx={50} cy={140} rx={48} ry={22} fill={`url(#brasa${uid})`} />

        {camadas.map((c, i) => (
          <path
            key={c.cor}
            className="fx-labareda"
            style={{
              filter: `blur(${c.blur}px)`,
              opacity: c.op,
              // cada corpo no seu tempo, e o tempo de cada carta é o dela: juntos, eles pulsariam
              // como uma coisa só, que é o que faz uma chama grande parecer um balão inflando
              animationDuration: `${(c.dur * compasso).toFixed(2)}s`,
              animationDelay: `-${(partida + i * 0.7 + r() * 0.6).toFixed(2)}s`,
            }}
            fill={c.cor}
            d={labareda(50 + (r() - 0.5) * 6, 152, c.alt, c.larg, (r() - 0.5) * 18)}
          />
        ))}
      </g>
  );
}

/**
 * O que fica **na frente** da carta: brasas e fumaça.
 *
 * Só o que precisa passar por cima. A fogueira em si está atrás (veja `FlamesBack`) — se as brasas
 * também fossem para lá, elas sumiriam justamente no trecho em que sobem pela carta, que é onde o
 * olho as segue.
 */
function FlamesFront({ seed, colors }: { seed: number; colors: [string, string] }) {
  const r = rnd(seed);
  return (
    <>
      {/* a fumaça é escura: fora do grupo que clareia, senão ela não apareceria */}
      <g className="fx-fumaca">
        {Array.from({ length: 3 }, (_, i) => {
          const x = 24 + i * 26 + r() * 8;
          return (
            <ellipse
              key={i}
              cx={x.toFixed(1)}
              cy={-6}
              rx={(7 + r() * 5).toFixed(1)}
              ry={(9 + r() * 6).toFixed(1)}
              fill="#2b1608"
              style={{ animationDelay: `${(i * 0.9 + r()).toFixed(2)}s`, ['--dx' as string]: `${(r() * 14 - 7).toFixed(1)}px` }}
            />
          );
        })}
      </g>
      <g className="fx-hot">
        {/* brasas: cada uma com a sua deriva, para não subirem em coluna */}
        {Array.from({ length: 14 }, (_, i) => (
          <circle
            key={i}
            className="fx-ember"
            style={{
              animationDelay: `${(r() * 2.2).toFixed(2)}s`,
              animationDuration: `${(1.7 + r() * 1.3).toFixed(2)}s`,
              ['--dx' as string]: `${(r() * 26 - 13).toFixed(1)}px`,
            }}
            cx={(-6 + r() * 112).toFixed(1)}
            cy={(120 + r() * 30).toFixed(1)}
            r={(0.6 + r() * 1.6).toFixed(2)}
            fill={r() > 0.4 ? colors[1] : colors[0]}
          />
        ))}
      </g>
    </>
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
    description: 'A carta arde dentro da fogueira: três camadas de chama saem por trás dela, com brasas e fumaça subindo.',
    colors: ['#ff8a3d', '#ffd166'],
    frame: 'pulse',
    sound: 'flame',
    layers: ({ seed }) => <FlamesFront seed={seed} colors={['#ff6a1f', '#ffd166']} />,
    back: ({ seed }) => <FlamesBack seed={seed} colors={['#ff6a1f', '#ffd166']} />,
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
  const caixa = {
    left: -pad,
    top: -pad,
    width: width + pad * 2,
    height: width * 1.4 + pad * 2,
    '--fx-1': fx.colors[0],
    '--fx-2': fx.colors[1],
  } as React.CSSProperties;
  const viewBox = `${-pad / k} ${-pad / k} ${100 + (pad * 2) / k} ${140 + (pad * 2) / k}`;
  return (
    <>
      {/*
        * A camada de trás, quando o efeito tem uma.
        *
        * É um SVG separado porque não dá para ficar dos dois lados da carta com um só: a frente da
        * carta é conteúdo em fluxo, e só um `z-index` negativo passa por baixo dela.
        */}
      {fx.back && (
        <svg className={`card-fx card-fx-back fx-${fx.id}`} style={caixa} viewBox={viewBox} aria-hidden>
          {fx.back({ seed, radius: r })}
        </svg>
      )}
      <svg className={`card-fx fx-${fx.id}`} style={caixa} viewBox={viewBox} aria-hidden>
        {fx.layers?.({ seed, radius: r })}
        <rect className={`fx-frame fx-frame-${fx.frame}`} x={1.2} y={1.2} width={97.6} height={137.6} rx={r} fill="none" />
      </svg>
    </>
  );
});
