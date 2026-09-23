import { memo } from 'react';
import { FRAME_IDS, DEFAULT_FRAME, type FrameId } from '../../shared/styles';
import { CROWN_PATH, Flower, starPath } from './suits';
import { ondaDe } from './flame';

/* =====================================================================
 * Molduras do retrato — a borda da foto de perfil.
 *
 * A mesa sempre teve uma moldura dourada de losangos em volta do retrato de cada assento. Ela
 * virou a moldura `ouro`, que vem com o jogo, e ganhou irmãs: prata, jade, sakura, neon,
 * vitoriana, gelo, chama, a de anjinho e a de dragão.
 *
 * Vale em toda parte onde o retrato é a **pessoa**: o assento na mesa, o placar do fim da partida
 * e o perfil. Nos retratos que são do **personagem** (o vínculo, a tela de personagens) não entra —
 * lá o retrato é dele, não seu.
 *
 * ## O espaço do desenho
 *
 * O `viewBox` é `-10 -10 120 120`: o retrato é o quadrado de 0 a 100, e a margem de dez unidades
 * em volta é onde os enfeites podem passar da borda (os losangos, as garras, as chamas). O CSS
 * (`.moldura`) estica o SVG para 120% do retrato, então essas coordenadas caem exatamente sobre
 * ele em qualquer tamanho.
 *
 * ## A cor e o estado do assento
 *
 * Toda linha é pintada com `var(--moldura-cor, <a cor da peça>)`. Assim a moldura tem a cor dela
 * por padrão, e o **estado do assento** pode trocá-la de fora sem tocar no desenho: é o que faz o
 * retrato de quem está pensando ficar verde-menta e o do vencedor ficar dourado (veja `.plate.acting
 * .moldura` em src/styles/global.css). Antes isso era um `border-color` num `<div>`; agora é uma
 * variável, e o lavor da moldura continua no lugar enquanto a cor muda.
 * ===================================================================== */

/** O corpo da borda. */
export type FrameBody =
  /** Um traço só. */
  | 'lisa'
  /** Traço grosso por fora e um fio por dentro. */
  | 'dupla'
  /** Fio duplo com volutas nos cantos. */
  | 'talhada'
  /** Escamas correndo pela borda. */
  | 'escamas'
  /** Lascas de cristal nos quatro cantos. */
  | 'gelo'
  /** Línguas de fogo lambendo a borda de cima. */
  | 'chama'
  /** Dois traços acesos, com halo. */
  | 'neon';

/** O enfeite que passa da borda. */
export type FrameTrim = 'nenhum' | 'losango' | 'cantos' | 'flor' | 'coroa' | 'garras' | 'espinhos' | 'anjo';

export interface PortraitFrameSpec {
  id: FrameId;
  name: string;
  /** Uma linha sobre ela, do jeito que o Estúdio e a Galeria mostram. */
  description: string;
  /** A cor do traço e a do enfeite. */
  colors: [string, string];
  body: FrameBody;
  trim: FrameTrim;
}

const n = (v: number) => v.toFixed(2);

/** Um retângulo de cantos redondos no quadrado do retrato, afastado `d` da borda. */
function caixa(d: number, r: number): { x: number; y: number; w: number; rx: number } {
  return { x: d, y: d, w: 100 - d * 2, rx: Math.max(0, r - d) };
}

// ------------------------------------------------------------------ o catálogo

export const FRAMES: PortraitFrameSpec[] = [
  {
    id: 'ouro',
    name: 'Ouro',
    description: 'A moldura dourada de sempre: fio duplo e um losango em cima e outro embaixo.',
    colors: ['#e9c96a', '#fff6d6'],
    body: 'dupla',
    trim: 'losango',
  },
  {
    id: 'prata',
    name: 'Prata',
    description: 'A mesma armação em prata fria, com um esquadro em cada canto.',
    colors: ['#cfd8e3', '#ffffff'],
    body: 'dupla',
    trim: 'cantos',
  },
  {
    id: 'jade',
    name: 'Jade',
    description: 'Um traço só, verde de pedra polida. Discreta de propósito.',
    colors: ['#6fae85', '#d7f0e0'],
    body: 'lisa',
    trim: 'cantos',
  },
  {
    id: 'obsidiana',
    name: 'Obsidiana',
    description: 'Vidro vulcânico com um fio de ouro por dentro: escura, e por isso o retrato salta.',
    colors: ['#1b1622', '#c9a13b'],
    body: 'dupla',
    trim: 'losango',
  },
  {
    id: 'sakura',
    name: 'Sakura',
    description: 'Rosa de pétala, com uma flor de cinco pétalas em cada canto.',
    colors: ['#f2a7bf', '#fff0f5'],
    body: 'lisa',
    trim: 'flor',
  },
  {
    id: 'neon',
    name: 'Neon',
    description: 'Dois tubos acesos, ciano e magenta, que respiram como letreiro de rua.',
    colors: ['#35f0ff', '#ff3df2'],
    body: 'neon',
    trim: 'nenhum',
  },
  {
    id: 'vitoriana',
    name: 'Vitoriana',
    description: 'Fio duplo com volutas nos cantos e uma coroa no alto — a moldura do salão.',
    colors: ['#c8a44a', '#f4e3b0'],
    body: 'talhada',
    trim: 'coroa',
  },
  {
    id: 'gelo',
    name: 'Gelo',
    description: 'Lascas de cristal crescendo dos cantos, com o brilho passando devagar por dentro.',
    colors: ['#9fd8ff', '#eaf7ff'],
    body: 'gelo',
    trim: 'espinhos',
  },
  {
    id: 'chama',
    name: 'Chama',
    description: 'Cinco línguas de fogo lambendo a borda de cima, com a mesma chama da carta em chamas.',
    colors: ['#ff7a2a', '#ffd257'],
    body: 'chama',
    trim: 'nenhum',
  },
  {
    id: 'anjinho',
    name: 'Anjinho',
    description: 'Asinhas brancas batendo dos dois lados do retrato e uma auréola dourada flutuando em cima, com cintilações.',
    colors: ['#ffffff', '#f5b83d'],
    body: 'dupla',
    trim: 'anjo',
  },
  {
    id: 'dragao',
    name: 'Dragão',
    description: 'Escamas correndo pela borda e uma garra fechando cada canto. A mais pesada de todas.',
    colors: ['#8d1f10', '#ffb347'],
    body: 'escamas',
    trim: 'garras',
  },
];

export function findFrame(id: string | null | undefined): PortraitFrameSpec {
  return FRAMES.find((f) => f.id === id) ?? FRAMES.find((f) => f.id === DEFAULT_FRAME)!;
}

/** Ids sem entrada no catálogo (deveria ser sempre vazio — veja aura.test.ts). */
export const MISSING_FRAMES = FRAME_IDS.filter((id) => !FRAMES.some((f) => f.id === id));

// ------------------------------------------------------------------ os corpos

function Corpo({ f, r, c1, c2 }: { f: PortraitFrameSpec; r: number; c1: string; c2: string }) {
  const fora = caixa(1.5, r);
  const dentro = caixa(5.5, r);
  const traco = (d: ReturnType<typeof caixa>, w: number, cor: string, op = 1) => (
    <rect x={d.x} y={d.y} width={d.w} height={d.w} rx={d.rx} fill="none" strokeWidth={w} opacity={op} style={{ stroke: cor }} />
  );
  switch (f.body) {
    case 'lisa':
      return traco(fora, 3, c1);
    case 'dupla':
      return (
        <>
          {traco(fora, 3, c1)}
          {traco(dentro, 0.9, c2, 0.85)}
        </>
      );
    case 'neon':
      /*
       * Neon é luz, não tinta: o traço vale pelo halo.
       *
       * São dois tubos de cores opostas com um desfoque grande por baixo de cada um — é o borrão
       * que faz o olho ler vidro aceso. Sem ele, ficavam duas linhas coloridas.
       */
      return (
        <g className="moldura-pisca">
          {traco(fora, 5, c1, 0.28)}
          {traco(fora, 2.2, c1)}
          {traco(dentro, 3.4, c2, 0.25)}
          {traco(dentro, 1.2, c2, 0.95)}
        </g>
      );
    case 'talhada': {
      // as volutas: uma espiral em cada canto, a mesma girada quatro vezes
      const voluta = 'M0 12 C0 4 4 0 12 0 C7 0 3.4 2 2.4 6.5 C5 3.4 9 3.6 9 6.6 C9 9 6.8 10.4 4.6 9.6 C6.6 9.2 7 7.2 5.4 6.8 C3 6.2 1.6 8.6 1.6 12 Z';
      return (
        <>
          {traco(fora, 2.2, c1)}
          {traco(dentro, 0.8, c2, 0.8)}
          {[
            [0, 0, 1, 1],
            [100, 0, -1, 1],
            [0, 100, 1, -1],
            [100, 100, -1, -1],
          ].map(([x, y, sx, sy]) => (
            <g key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(${sx} ${sy}) translate(1.5 1.5)`}>
              <path d={voluta} style={{ fill: c2 }} opacity={0.95} />
            </g>
          ))}
        </>
      );
    }
    case 'escamas': {
      /*
       * As escamas correm pela borda de dentro.
       *
       * Cada uma é meio círculo virado para fora, e elas dão a volta nos quatro lados em vez de
       * ficarem só em cima: escama que para na metade do bicho é remendo. Um lado é desenhado e
       * girado quatro vezes; os cantos ficam sem, de propósito — quem cuida deles é a garra.
       */
      const escama = (cx: number, cy: number) => `M${n(cx - 4.2)} ${n(cy)} a 4.2 4.2 0 0 1 8.4 0 Z`;
      return (
        <>
          {traco(fora, 3.4, c1)}
          {[0, 90, 180, 270].map((g) => (
            <g key={g} transform={`rotate(${g} 50 50)`}>
              {Array.from({ length: 7 }, (_, i) => (
                <path key={i} d={escama(17 + i * 11, 6.6)} style={{ fill: c2 }} opacity={0.72} />
              ))}
            </g>
          ))}
          {traco(dentro, 0.8, c2, 0.7)}
        </>
      );
    }
    case 'gelo': {
      // a geada por dentro, com o brilho passando devagar (o CSS cuida do passeio)
      return (
        <>
          {traco(fora, 3, c1)}
          {traco(dentro, 1.6, c2, 0.5)}
          <rect className="moldura-geada" x={5.5} y={5.5} width={89} height={89} rx={Math.max(0, r - 5.5)} fill="none" strokeWidth={2.2} opacity={0.5} style={{ stroke: c2 }} />
        </>
      );
    }
    case 'chama': {
      /*
       * Fogo na borda de cima, com a silhueta da carta em chamas (src/render/flame.ts).
       *
       * Só em cima: fogo nos quatro lados fecharia o retrato numa fogueira e a pessoa dentro dela
       * viraria detalhe. Em cima, ele lê como quem está pegando fogo — que é a ideia.
       */
      const linguas = [18, 34, 50, 66, 82];
      return (
        <>
          {traco(fora, 3, c1)}
          {linguas.map((x, i) => {
            const h = 13 + (i % 2 ? 4 : 0);
            const q = ondaDe(x, 3, h, 4.6, h * 0.16, i * 1.3);
            return (
              <path key={x} style={{ fill: i % 2 ? c2 : c1 }} opacity={0.9} d={q.slice(0, q.indexOf(';'))}>
                <animate attributeName="d" values={q} dur={`${1.5 + i * 0.12}s`} calcMode="linear" repeatCount="indefinite" />
              </path>
            );
          })}
        </>
      );
    }
  }
}

// ------------------------------------------------------------------ os enfeites

function Enfeite({ f, c1, c2 }: { f: PortraitFrameSpec; c1: string; c2: string }) {
  switch (f.trim) {
    case 'nenhum':
      return null;
    case 'losango':
      // os dois losangos do meio de cima e do meio de baixo: é o que a mesa sempre teve
      return (
        <>
          {[0, 100].map((y) => (
            <rect key={y} x={-4.6} y={-4.6} width={9.2} height={9.2} transform={`translate(50 ${y}) rotate(45)`} strokeWidth={1.2} style={{ fill: c2, stroke: c1 }} />
          ))}
        </>
      );
    case 'cantos':
      // um esquadro em cada canto, por fora do traço: acabamento, não enfeite
      return (
        <>
          {[
            [0, 0, 1, 1],
            [100, 0, -1, 1],
            [0, 100, 1, -1],
            [100, 100, -1, -1],
          ].map(([x, y, sx, sy]) => (
            <path
              key={`${x}-${y}`}
              d="M0 13 L0 0 L13 0"
              transform={`translate(${x} ${y}) scale(${sx} ${sy}) translate(-2.6 -2.6)`}
              fill="none"
              strokeWidth={2.6}
              strokeLinecap="square"
              style={{ stroke: c2 }}
            />
          ))}
        </>
      );
    case 'flor':
      return (
        <>
          {[
            [0, 0],
            [100, 0],
            [0, 100],
            [100, 100],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}>
              <Flower r={7.5} color={c2} center={c1} />
            </g>
          ))}
        </>
      );
    case 'coroa':
      // a coroa fica no meio do alto, e um pouco por fora: é ela que dá o ar de salão
      return (
        <g transform="translate(50 -3) scale(0.3)">
          <path d={CROWN_PATH} strokeWidth={4} style={{ fill: c2, stroke: c1 }} />
        </g>
      );
    case 'garras': {
      /*
       * Uma garra fechando cada canto.
       *
       * São três unhas saindo do vértice para dentro do retrato, como pata segurando um espelho —
       * a do meio mais longa, as das pontas mais curtas. Cada unha é curva: reta, ela lia como
       * espinho, e o que faz o olho reconhecer garra é o arco.
       *
       * O canto é o único lugar onde ela cabe sem cobrir a cara de ninguém.
       */
      const unha = (graus: number, comp: number): string => {
        const a = (graus * Math.PI) / 180;
        const [cx, cy] = [Math.cos(a), Math.sin(a)];
        const [nx, ny] = [-Math.sin(a), Math.cos(a)];
        const w = 3;
        return (
          `M0 0 Q${n(comp * 0.55 * cx + nx * w)} ${n(comp * 0.55 * cy + ny * w)} ${n(comp * cx)} ${n(comp * cy)}` +
          ` Q${n(comp * 0.48 * cx - nx * w * 0.55)} ${n(comp * 0.48 * cy - ny * w * 0.55)} 0 0 Z`
        );
      };
      const garra = [unha(16, 23), unha(45, 29), unha(74, 23)].join(' ');
      return (
        <>
          {[
            [0, 0, 1, 1],
            [100, 0, -1, 1],
            [0, 100, 1, -1],
            [100, 100, -1, -1],
          ].map(([x, y, sx, sy]) => (
            <g key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(${sx} ${sy}) translate(-3 -3)`}>
              <path d={garra} style={{ fill: c1, stroke: c2 }} strokeWidth={0.7} strokeLinejoin="round" opacity={0.95} />
            </g>
          ))}
        </>
      );
    }
    case 'anjo':
      return <Anjinho />;
    case 'espinhos':
      // lascas de cristal: quatro estrelas de quatro pontas, uma por canto
      return (
        <>
          {[
            [0, 0],
            [100, 0],
            [0, 100],
            [100, 100],
          ].map(([x, y], i) => (
            <g key={`${x}-${y}`} transform={`translate(${x} ${y}) rotate(${i * 90})`}>
              <path d={starPath(13, 3.6, 4)} style={{ fill: c2 }} opacity={0.9} />
              <path d={starPath(8, 2.2, 4)} transform="rotate(45)" style={{ fill: c1 }} opacity={0.85} />
            </g>
          ))}
        </>
      );
  }
}

/**
 * Uma asinha de desenho animado, presa na origem e abrindo para a direita.
 *
 * Erguida, com a ponta enrolando para cima e para fora, e a borda de baixo em quatro festões — as
 * penas. Por dentro, dois traços azulados repetem os festões: é a sombra que dá volume a uma asa
 * branca sobre fundo branco.
 */
const ASINHA =
  'M0 4 C1.5 -5 7 -11.5 14.5 -13.5 C15.8 -9 15.6 -4.5 13.6 -1.2' +
  ' Q16 1.2 13.4 3.6 Q14.8 6.4 11.2 7.8 Q12.2 10.8 8 10.9 Q7.6 13.4 3.6 11.8 Q1 10.4 0 7 Z';
const ASINHA_SOMBRA = 'M2.6 3.2 Q8 -1.6 12.6 -6.4 M2.8 7 Q8 4.6 11.8 2.4 M3.2 9.6 Q6.6 8.6 9 7.2';

/** Quantas vezes a asinha é maior que o desenho dela: a asa abre mais de um terço do retrato para fora. */
const TAMANHO_DA_ASINHA = 2.2;

/**
 * O enfeite da moldura de anjinho: as duas asinhas nos lados e a auréola no alto.
 *
 * As cores são **fixas** — asas brancas, auréola dourada — e não passam pela variável do estado do
 * assento. Quando a vez é da pessoa, o fio da moldura fica verde-menta como em todas; as asas
 * ficarem verdes seria trocar o anjinho por outra coisa.
 *
 * As asas são **grandes**, bem maiores que a margem do desenho (o SVG tem `overflow: visible`):
 * pequenas, elas liam como duas orelhinhas e não como asas. Do lado direito do assento fica o nome
 * do jogador, e a asa passa por trás dele — o texto é que fica por cima (veja `.seat-info` em
 * src/styles/persona.css).
 */
function Anjinho() {
  const branco = '#ffffff';
  const traco = '#c3d3ee';
  const sombra = '#d5e1f4';
  return (
    <g>
      {[1, -1].map((lado) => (
        <g key={lado} transform={`translate(${lado > 0 ? 96 : 4} 46) scale(${lado * TAMANHO_DA_ASINHA} ${TAMANHO_DA_ASINHA})`}>
          <g>
            <animateTransform attributeName="transform" type="rotate" values="-7;5;-7" dur="2.2s" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" repeatCount="indefinite" />
            {/* os traços são divididos pela escala: sem isso, a asa grande ganhava contorno de caneta grossa */}
            <path d={ASINHA} fill={branco} stroke={traco} strokeWidth={1.6 / TAMANHO_DA_ASINHA} strokeLinejoin="round" />
            <path d={ASINHA_SOMBRA} fill="none" stroke={sombra} strokeWidth={1.5 / TAMANHO_DA_ASINHA} strokeLinecap="round" />
          </g>
        </g>
      ))}
      {/* a auréola flutuando sobre o retrato, deitada, com o brilho por baixo e o fio claro por cima */}
      <g>
        <animateTransform attributeName="transform" type="translate" values="0 0;0 -1.4;0 0" dur="3s" calcMode="spline" keySplines="0.4 0 0.6 1;0.4 0 0.6 1" repeatCount="indefinite" />
        <ellipse cx={50} cy={-6} rx={15} ry={3.8} fill="none" stroke="#ffd36b" strokeWidth={3.4} opacity={0.3} style={{ filter: 'blur(1px)' }} />
        <ellipse cx={50} cy={-6} rx={15} ry={3.8} fill="none" stroke="#f5b83d" strokeWidth={2.2} />
        <ellipse cx={50} cy={-6.3} rx={14.6} ry={3.5} fill="none" stroke="#ffe9a8" strokeWidth={0.7} />
      </g>
      {[
        { x: 68, y: -11, r: 2.4, t: 0 },
        { x: 71, y: -4.5, r: 1.5, t: 0.9 },
        { x: 31, y: -10, r: 1.8, t: 1.6 },
      ].map((c) => (
        <g key={`${c.x}`} transform={`translate(${c.x} ${c.y})`}>
          <path d={starPath(c.r, c.r * 0.25, 4)} fill="#fff4c2">
            <animate attributeName="opacity" values="0.2;1;0.2" dur="2.2s" begin={`-${c.t}s`} repeatCount="indefinite" />
          </path>
        </g>
      ))}
    </g>
  );
}

/**
 * A moldura por cima do retrato.
 *
 * `size` é o lado do retrato em pixels, e serve para uma coisa só: acertar o raio dos cantos com o
 * da imagem, que o CSS arredonda em **pixels** (14px, em qualquer tamanho). Sem isto, a moldura de
 * um retrato pequeno ficava quadrada em cima de uma foto redonda.
 */
export const PortraitFrame = memo(function PortraitFrame({
  frame,
  size,
  className,
}: {
  frame: PortraitFrameSpec;
  size: number;
  className?: string;
}) {
  const r = Math.min(32, (14 / Math.max(size, 1)) * 100);
  const c1 = `var(--moldura-cor, ${frame.colors[0]})`;
  const c2 = `var(--moldura-cor2, ${frame.colors[1]})`;
  return (
    <svg className={`moldura ${className ?? ''}`} viewBox="-10 -10 120 120" aria-hidden focusable="false">
      <Corpo f={frame} r={r} c1={c1} c2={c2} />
      <Enfeite f={frame} c1={c1} c2={c2} />
    </svg>
  );
});
