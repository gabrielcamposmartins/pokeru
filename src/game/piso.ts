import type { CSSProperties } from 'react';
import type { TableStyle } from '../../shared/styles';

/**
 * O chão da sala, por mesa.
 *
 * Cada estampa de mesa tem o seu piso: o feltro clássico fica num assoalho de madeira, o sakura num
 * gramado de parque com pétalas caídas, o azul real num carpete com losangos dourados, o vinho num
 * taco em espinha, o neon num chão escuro riscado de luz e os vitorianos num mármore xadrez. A
 * escolha vai pela estampa (e não pelo id da mesa) para as mesas feitas no Estúdio ganharem o piso
 * da estampa que usam — e as cores saem da própria mesa (a borda, o friso, o feltro), para o chão
 * combinar com ela.
 *
 * O chão é um plano inclinado em perspectiva (veja `planeStyle`), então basta pintar um padrão reto
 * e a perspectiva faz o resto. A profundidade vem em camadas por cima de qualquer piso (`LUZ`): a
 * sombra que a mesa faz no chão, a luz que cai do alto, o fundo escurecendo com a distância — e,
 * em cada piso, textura de verdade (veio da madeira, fibra do carpete, veio do mármore) feita com
 * ruído de SVG, e as emendas com um fio claro ao lado do escuro, como aresta que pega luz.
 */

const mix = (a: string, b: string, pct: number): string => `color-mix(in srgb, ${a} ${pct}%, ${b})`;

const svg = (conteudo: string, w: number, h = w): string =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${conteudo}</svg>`)}")`;

/**
 * Ruído (grão, veio, fibra) num ladrilho que emenda sem costura.
 *
 * `freq` é a frequência do ruído — dois números fazem veio (fino num eixo, comprido no outro).
 * `cor` é a cor do grão em RGB de 0 a 1, e `forca`/`corte` levam o ruído a um véu: alfa =
 * forca × ruído − corte.
 */
function ruido(tam: number, freq: string, oitavas: number, cor: [number, number, number], forca: number, corte: number, semente = 3): string {
  const [r, g, b] = cor;
  return svg(
    `<filter id='n' x='0' y='0' width='100%' height='100%'>` +
      `<feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='${oitavas}' seed='${semente}' stitchTiles='stitch'/>` +
      `<feColorMatrix values='0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  ${forca} 0 0 0 ${-corte}'/>` +
      `</filter><rect width='100%' height='100%' filter='url(#n)'/>`,
    tam,
  );
}

// ------------------------------------------------------------------ as pétalas

/** Um sorteio com semente: as pétalas caem sempre no mesmo lugar (e o ladrilho não pisca). */
function sorteio(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uma pétala de cerejeira: gota com o chanfro na ponta larga, como a de verdade. */
const PETALA = 'M0 -7 C1.6 -8.6 3.9 -7.4 4.6 -4.6 C5.4 -1 3 3.6 0 8 C-3 3.6 -5.4 -1 -4.6 -4.6 C-3.9 -7.4 -1.6 -8.6 0 -7 Z';
const ROSAS = ['#ffd6e4', '#f9b8cf', '#f4a3c0', '#ffe8f0', '#eb8fb0'];

/**
 * Um ladrilho de pétalas caídas.
 *
 * Cada pétala tem uma sombrinha deslocada embaixo — é o que a descola do chão —, e umas poucas
 * caem juntas, em montinhos, como o vento deixa. Dois ladrilhos de tamanhos diferentes, um por
 * cima do outro, escondem a repetição.
 */
function petalas(tam: number, quantas: number, semente: number): string {
  const r = sorteio(semente);
  let corpo = '';
  const uma = (x: number, y: number) => {
    const giro = Math.round(r() * 360);
    const esc = (0.9 + r() * 1.3).toFixed(2);
    const cor = ROSAS[Math.floor(r() * ROSAS.length)];
    const op = (0.78 + r() * 0.22).toFixed(2);
    const t = `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${giro}) scale(${esc})`;
    const sombra = `translate(${(x + 1.6).toFixed(1)} ${(y + 2.2).toFixed(1)}) rotate(${giro}) scale(${esc})`;
    corpo += `<path d='${PETALA}' transform='${sombra}' fill='rgba(40,10,20,.28)'/>`;
    corpo += `<path d='${PETALA}' transform='${t}' fill='${cor}' opacity='${op}'/>`;
    // o veio do meio, um fio mais escuro, só nas maiores
    if (Number(esc) > 1.6) corpo += `<path d='M0 -5 L0 6' transform='${t}' stroke='rgba(190,70,110,.35)' stroke-width='.6'/>`;
  };
  for (let i = 0; i < quantas; i++) {
    const x = r() * tam;
    const y = r() * tam;
    uma(x, y);
    // de vez em quando, um montinho
    if (r() < 0.18) for (let k = 0; k < 3; k++) uma(x + (r() - 0.5) * 22, y + (r() - 0.5) * 22);
  }
  return svg(corpo, tam);
}

const PETALAS_A = petalas(420, 26, 11);
const PETALAS_B = petalas(610, 30, 29);

// ------------------------------------------------------------------ texturas

/** Grão fino, para qualquer superfície não parecer plástico. */
const GRAO = ruido(256, '0.85', 2, [0, 0, 0], 1.3, 0.45, 7);
/** Veio de madeira: fino na largura da tábua, comprido no sentido dela. */
const VEIO = ruido(340, '0.28 0.012', 3, [0.08, 0.04, 0.02], 1.6, 0.62, 5);
/** Fibra de carpete: miúda, dos dois lados. */
const FIBRA = ruido(200, '1.4', 2, [0, 0, 0], 1.5, 0.55, 9);
/** Veio de mármore: largo, enroscado e claro. */
const VEIO_MARMORE = ruido(720, '0.006 0.018', 5, [1, 1, 1], 3.4, 1.62, 13);
/** O gramado: folhas finas em pé (ruído esticado na vertical) e manchas maiores de sol e sombra. */
const FOLHAS = ruido(240, '0.9 0.22', 3, [0.02, 0.07, 0.02], 1.9, 0.72, 17);
const MANCHAS = ruido(900, '0.004', 3, [0.62, 0.78, 0.4], 1.4, 0.62, 21);

/**
 * A profundidade, por cima de qualquer piso.
 *
 * De cima para baixo nas camadas: o escuro das bordas (o chão some em direção às paredes), o fundo
 * da sala escurecendo com a distância (o alto do plano é o longe), a sombra que a mesa faz no chão
 * logo em volta dela, e a luz que cai do lustre no meio.
 */
const LUZ = [
  'radial-gradient(ellipse at 50% 50%, transparent 0%, transparent 30%, rgba(4, 2, 12, 0.55) 72%)',
  'linear-gradient(180deg, rgba(4, 2, 12, 0.45), transparent 42%)',
  'radial-gradient(ellipse 40% 40% at 50% 50%, rgba(0, 0, 0, 0.42) 62%, transparent 100%)',
  'radial-gradient(ellipse 62% 58% at 50% 48%, rgba(255, 238, 210, 0.13), transparent 70%)',
].join(', ');

function desenho(t: TableStyle): string {
  switch (t.pattern) {
    /*
     * Parque de cerejeiras: gramado com pétalas caídas.
     *
     * O verde é da noite (a sala é escura) e as pétalas são o que acende — cor-de-rosa sobre o
     * gramado, com mais delas perto da mesa, onde a luz bate.
     */
    case 'sakura':
      return [
        `${PETALAS_A} 0 0 / 420px 420px`,
        `${PETALAS_B} 130px 70px / 610px 610px`,
        `${FOLHAS} 0 0 / 240px 240px`,
        `${MANCHAS} 0 0 / 900px 900px`,
        `${GRAO} 0 0 / 256px 256px`,
        `linear-gradient(180deg, ${mix(t.felt, '#2e4a2a', 12)}, #1f3320)`,
      ].join(', ');
    // carpete real: losangos em fio dourado (com a sombra do fio), fibra miúda e o azul da mesa
    case 'suits': {
      const fio = mix(t.railAccent, 'transparent', 34);
      return [
        `repeating-linear-gradient(45deg, ${fio} 0 2px, rgba(0, 0, 0, 0.3) 2px 4px, transparent 4px 90px)`,
        `repeating-linear-gradient(-45deg, ${fio} 0 2px, rgba(0, 0, 0, 0.3) 2px 4px, transparent 4px 90px)`,
        'radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.07) 0 3px, transparent 4px) 0 0 / 63.6px 63.6px',
        `${FIBRA} 0 0 / 200px 200px`,
        `linear-gradient(180deg, ${mix(t.felt, '#0a1430', 45)}, ${mix(t.rail, '#050914', 60)})`,
      ].join(', ');
    }
    // taco em espinha: emendas com aresta, tacos de tons alternados e o veio por cima
    case 'lines': {
      const madeira = mix(t.rail, '#4a2a1c', 55);
      return [
        'repeating-linear-gradient(45deg, rgba(0, 0, 0, 0.42) 0 3px, rgba(255, 255, 255, 0.06) 3px 4px, transparent 4px 70px)',
        'repeating-linear-gradient(-45deg, rgba(0, 0, 0, 0.28) 0 3px, rgba(255, 255, 255, 0.05) 3px 4px, transparent 4px 280px)',
        'repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.04) 0 70px, rgba(0, 0, 0, 0.07) 70px 140px, transparent 140px 210px)',
        `${VEIO} 0 0 / 340px 340px`,
        `${GRAO} 0 0 / 256px 256px`,
        `linear-gradient(180deg, ${mix(madeira, '#fff', 88)}, ${madeira})`,
      ].join(', ');
    }
    // neon: chão quase preto riscado de luz, com o brilho do friso refletido no meio
    case 'hex': {
      const luz = mix(t.railAccent, 'transparent', 45);
      const brilho = mix(t.railAccent, 'transparent', 12);
      return [
        `radial-gradient(ellipse 55% 50% at 50% 50%, ${mix(t.railAccent, 'transparent', 14)}, transparent 70%)`,
        `repeating-linear-gradient(0deg, ${luz} 0 2px, transparent 2px 200px)`,
        `repeating-linear-gradient(90deg, ${luz} 0 2px, transparent 2px 200px)`,
        `repeating-linear-gradient(0deg, ${brilho} 0 10px, transparent 10px 200px) 0 -4px`,
        `repeating-linear-gradient(90deg, ${brilho} 0 10px, transparent 10px 200px) -4px 0`,
        `${GRAO} 0 0 / 256px 256px`,
        'linear-gradient(180deg, #0a0e1c, #04060d)',
      ].join(', ');
    }
    // mármore xadrez: veios claros atravessando as pedras, a junta entre elas e o todo apagado
    case 'damask': {
      const claro = mix(t.railAccent, '#e8e0cc', 25);
      const escuro = mix(t.rail, '#140c0a', 50);
      return [
        'linear-gradient(rgba(10, 4, 2, 0.46), rgba(10, 4, 2, 0.46))',
        'linear-gradient(90deg, rgba(0, 0, 0, 0.45) 0 2px, rgba(255, 255, 255, 0.08) 2px 3px, transparent 3px) 0 0 / 120px 120px',
        'linear-gradient(0deg, rgba(0, 0, 0, 0.45) 0 2px, rgba(255, 255, 255, 0.08) 2px 3px, transparent 3px) 0 0 / 120px 120px',
        `${VEIO_MARMORE} 0 0 / 720px 720px`,
        `conic-gradient(${claro} 25%, ${escuro} 0 50%, ${claro} 0 75%, ${escuro} 0) 0 0 / 240px 240px`,
      ].join(', ');
    }
    // assoalho: tábuas de tons diferentes, emendas com aresta, o veio correndo ao longo de cada uma
    default: {
      const madeira = mix(t.rail, '#6b4526', 45);
      return [
        'repeating-linear-gradient(90deg, rgba(0, 0, 0, 0.45) 0 3px, rgba(255, 255, 255, 0.07) 3px 4px, transparent 4px 170px)',
        'linear-gradient(0deg, rgba(0, 0, 0, 0.35) 0 3px, rgba(255, 255, 255, 0.05) 3px 4px, transparent 4px) 0 0 / 170px 680px',
        'linear-gradient(0deg, rgba(0, 0, 0, 0.35) 0 3px, rgba(255, 255, 255, 0.05) 3px 4px, transparent 4px) 85px 340px / 170px 680px',
        'repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.05) 0 170px, rgba(0, 0, 0, 0.08) 170px 340px, transparent 340px 510px, rgba(0, 0, 0, 0.04) 510px 680px)',
        `${VEIO} 0 0 / 340px 340px`,
        `${GRAO} 0 0 / 256px 256px`,
        `linear-gradient(180deg, ${mix(madeira, '#fff', 90)}, ${madeira})`,
      ].join(', ');
    }
  }
}

/** O fundo do plano do chão para uma mesa: a luz e a sombra por cima do piso. */
export function pisoDaMesa(t: TableStyle): CSSProperties {
  return { background: `${LUZ}, ${desenho(t)}` };
}
