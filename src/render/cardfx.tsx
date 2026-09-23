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

/** Quantos pontos desenham cada lado da labareda. Mais que isto não se vê; menos, vira serrote. */
const PONTOS = 26;

/**
 * Onde o pé da labareda assenta (a carta vai de 0 a 140).
 *
 * Rente à borda de baixo da carta. Mais embaixo — e estava — a chama parecia sair do pano da mesa
 * e passar por trás da carta de carona; daqui, ela sai da carta.
 */
const PE = 142;

/** A altura em que a labareda é mais larga. */
const BARRIGA = 0.36;

/**
 * A meia-largura da labareda na altura `t` (0 no pé, 1 na ponta).
 *
 * Do pé até a barriga o contorno é um **arco**: a largura abre depressa em cima do pé e chega à
 * barriga já plana, que é o que dá o lado redondo. Reta — e era —, a barriga lia como um triângulo
 * com o canto lixado.
 *
 * Da barriga para cima ela cai com expoente maior que 1: segura a largura pelo meio do corpo e
 * afina de vez só perto do fim. É de propósito que a ponta **não** acompanhe a barriga: fosse ela
 * redonda também, a labareda viraria uma gota, e o que faz o olho ler fogo é o bico.
 */
function meiaLargura(t: number, w: number): number {
  if (t <= BARRIGA) {
    const u = (BARRIGA - t) / BARRIGA;
    return (0.76 + 0.3 * Math.sqrt(1 - u * u)) * w;
  }
  return 1.06 * Math.pow(1 - (t - BARRIGA) / (1 - BARRIGA), 1.35) * w;
}

/**
 * Uma labareda ondulada — a cobrinha.
 *
 * O contorno não é uma forma rígida que balança: ele é **construído altura por altura**, e em cada
 * altura o eixo do corpo anda para o lado segundo uma senoide. Uma onda inteira ao longo do corpo
 * é o que desenha o S; e a amplitude cresce com a altura (`t^1.7`), então o pé fica plantado no
 * chão e quem viaja é a ponta.
 *
 * `fase` é o instante da onda. Rodando a fase, a mesma crista percorre o corpo e a ponta é jogada
 * para a direita, para a esquerda e de volta — que é o movimento de uma chama parada queimando, e
 * não o de uma chama sendo entortada por inteiro. Quem escolhe o sentido é `ondaDe`.
 */
function labareda(cx: number, y0: number, h: number, w: number, amp: number, fase: number): string {
  const n = (v: number) => v.toFixed(1);
  const eixo = (t: number) => cx + amp * Math.pow(t, 1.7) * Math.sin(Math.PI * 2 * (t * 1.15) + fase);
  const alt = (t: number) => y0 - h * t;
  const meia = (t: number) => meiaLargura(t, w);

  let d = `M${n(eixo(0) - meia(0))} ${n(y0)}`;
  // sobe pela esquerda até o bico (em t = 1 a largura é zero: o bico é um ponto só)
  for (let i = 1; i <= PONTOS; i++) {
    const t = i / PONTOS;
    d += ` L${n(eixo(t) - meia(t))} ${n(alt(t))}`;
  }
  // e desce pela direita
  for (let i = PONTOS - 1; i >= 0; i--) {
    const t = i / PONTOS;
    d += ` L${n(eixo(t) + meia(t))} ${n(alt(t))}`;
  }
  // o pé fecha numa barriga, não numa reta
  d += ` C${n(eixo(0) + meia(0) * 0.5)} ${n(y0 + h * 0.05)} ${n(eixo(0) - meia(0) * 0.5)} ${n(y0 + h * 0.05)} ${n(eixo(0) - meia(0))} ${n(y0)} Z`;
  return d;
}

/** Quantos instantes da onda entram na volta. Oito já interpola liso, e a volta fecha no primeiro. */
const QUADROS = 8;

/**
 * Os desenhos de uma volta inteira da onda, para o `<animate>` percorrer.
 *
 * A fase anda **para trás**, e é isso que faz a crista subir do pé para a ponta. Descendo, a chama
 * parecia escorrer; subindo, ela parece ser empurrada pelo calor, que é para onde o fogo vai.
 */
function ondaDe(cx: number, y0: number, h: number, w: number, amp: number, faseInicial: number): string {
  return Array.from({ length: QUADROS + 1 }, (_, i) => labareda(cx, y0, h, w, amp, faseInicial - (i / QUADROS) * Math.PI * 2)).join(';');
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
  /**
   * As três temperaturas, da mais fria (fora) para a mais quente (dentro).
   *
   * `amp` é o quanto a ponta daquele corpo viaja para os lados, e ele é proporcional à altura: os
   * três descrevem a **mesma** onda, cada um no seu tamanho, e por isso ficam encaixados o tempo
   * todo em vez de se descolarem no meio do caminho.
   */
  const camadas = [
    { cor: '#b81c06', op: 0.5, blur: 4.5, alt: 235, larg: 106, amp: 36 },
    { cor: colors[0], op: 0.78, blur: 2.6, alt: 190, larg: 77, amp: 29 },
    { cor: colors[1], op: 0.9, blur: 1.3, alt: 134, larg: 46, amp: 21 },
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
  /*
   * A labareda é **uma só**: um eixo, um instante da onda e um tempo para os três corpos.
   *
   * Cada camada tinha o seu eixo, a sua fase e a sua duração, e o resultado era que eles andavam
   * separados — o núcleo pendendo para um lado enquanto a casca pendia para o outro, três chamas
   * brigando dentro da mesma silhueta. Compartilhados, os três sobem e voltam juntos e lêem como
   * as temperaturas de uma chama só.
   */
  const eixo = 50 + (r() - 0.5) * 6;
  const fase = r() * Math.PI * 2;
  const tempo = (2 * compasso).toFixed(2);
  return (
      <g className="fx-hot">
        <defs>
          {/*
            * A distorção: ruído deslocando o contorno, e o ruído desce.
            *
            * `feTurbulence` faz a mancha de ruído e `feDisplacementMap` empurra cada ponto da chama
            * segundo ela — é isso que enruga a silhueta em vez de só entortá-la. O `feOffset` faz o
            * ruído **subir** com o tempo, no mesmo sentido da onda do contorno: a mesma ruga nasce
            * no pé e vai subindo até a ponta.
            *
            * Ela é discreta de propósito: quem faz a onda é o contorno, redesenhado quadro a quadro
            * (veja `labareda`). O ruído aqui só tira o acabamento liso demais das bordas — forte, ele
            * embaralhava o S em vez de enfeitá-lo.
            *
            * A frequência é **mais curta na vertical** (0,04 contra 0,02): assim há várias ondas ao
            * longo da altura, em vez de uma única curva mansa, e dá para ver a ruga descer. O ruído
            * é costurado e o deslocamento percorre exatamente um ladrilho (25 = 1/0,04), então a
            * volta fecha sem emenda — e a frequência fica **fixa** por isso: se ela respirasse, o
            * ladrilho mudaria de tamanho e a emenda apareceria. A variedade entre cartas vem da
            * semente.
            */}
          <filter id={`onda${uid}`} x="-60%" y="-25%" width="220%" height="160%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.02 0.04" numOctaves={2} seed={seed} stitchTiles="stitch" result="ruido" />
            <feOffset in="ruido" result="descendo">
              <animate attributeName="dy" from="0" to="-25" dur={`${(1.7 * compasso).toFixed(2)}s`} repeatCount="indefinite" />
            </feOffset>
            <feDisplacementMap in="SourceGraphic" in2="descendo" scale={6} xChannelSelector="R" yChannelSelector="G" />
          </filter>
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
        <ellipse className="fx-brasa" cx={50} cy={131} rx={48} ry={20} fill={`url(#brasa${uid})`} />

        <g filter={`url(#onda${uid})`}>
        {camadas.map((c) => {
          const quadros = ondaDe(eixo, PE, c.alt, c.larg, c.amp, fase);
          return (
            <path
              key={c.cor}
              className="fx-labareda"
              style={{
                filter: `blur(${c.blur}px)`,
                opacity: c.op,
                // a respiração é da carta, não da camada: os três inflam no mesmo compasso
                animationDuration: `${(2 * compasso * 0.7).toFixed(2)}s`,
                animationDelay: `-${partida.toFixed(2)}s`,
              }}
              fill={c.cor}
              d={quadros.slice(0, quadros.indexOf(';'))}
            >
              {/*
                * A onda percorrendo o corpo.
                *
                * É o **contorno** que muda de desenho, quadro a quadro — não a forma inteira sendo
                * entortada por uma transformação. Cisalhar a chama dá um talho reto e igual em toda
                * a altura; aqui cada altura anda o seu tanto, e é isso que faz o S.
                */}
              <animate
                attributeName="d"
                values={quadros}
                dur={`${tempo}s`}
                calcMode="linear"
                repeatCount="indefinite"
              />
            </path>
          );
        })}
        </g>
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
