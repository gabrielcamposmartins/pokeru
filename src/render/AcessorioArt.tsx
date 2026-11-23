/**
 * O desenho de um acessório das mãos (shared/acessorios.ts), para a prateleira da Galeria e da loja e
 * a lista de prêmios: o anel com a pedra dele, a pulseira, o relógio, o vidro de esmalte, a amostra da luva. É só
 * a figurinha — como a peça fica na mão de verdade é a mesa 3D que mostra (src/mesa3d/acessorios3d.ts),
 * e o desenho daqui acompanha o modelo de lá: a mesma pedra no mesmo engaste, os mesmos elos, o mesmo
 * mostrador.
 *
 * Duas coisas valem para todas as peças:
 *
 *  - o **volume**: metal, pedra, couro e pano são pintados com um degradê (a luz vem de cima, da
 *    esquerda), e cada material tem o acabamento dele — as facetas de uma pedra lapidada, o reflexo de
 *    um cabochão, os elos de uma corrente, os pespontos de uma correia;
 *  - o **contorno**: um fio escuro em volta da silhueta inteira, que destaca a peça de qualquer fundo
 *    (veja `Contorno`). É um contorno de fora, não um traço em cada detalhe.
 */
import { useId, type ReactNode } from 'react';
import type { Acessorio, Anel, Esmalte, Luva, Pulseira, Relogio } from '../../shared/acessorios';
import { luminance, mix, rgbToHex, shade } from '../util/color';

const PELE = '#f4cdbb';
/** A tinta do contorno: quase preta, puxada para o roxo do fundo do jogo. */
const TINTA = '#0b0910';

type P = [number, number];
const n2 = (v: number) => Math.round(v * 100) / 100;
const pts = (ps: P[]) => ps.map(([x, y]) => `${n2(x)},${n2(y)}`).join(' ');
/** Um polígono regular (ou achatado) de `n` lados em volta de um ponto. */
const poligono = (cx: number, cy: number, rx: number, ry: number, n: number, giro = 0): P[] =>
  Array.from({ length: n }, (_, k) => {
    const t = giro + (k * Math.PI * 2) / n;
    return [cx + Math.cos(t) * rx, cy + Math.sin(t) * ry] as P;
  });
/** Um contorno aumentado (ou encolhido) em volta de um ponto. */
const vezes = (c: P[], k: number, [cx, cy]: P): P[] => c.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k] as P);
/** Um trecho de elipse, do ângulo `t0` ao `t1` (em graus, 0 = à direita, no sentido do relógio). */
function arco(cx: number, cy: number, rx: number, ry: number, t0: number, t1: number): string {
  const em = (t: number) => [cx + Math.cos((t * Math.PI) / 180) * rx, cy + Math.sin((t * Math.PI) / 180) * ry];
  const [a, b] = [em(t0), em(t1)];
  return `M${n2(a[0])} ${n2(a[1])} A${rx} ${ry} 0 ${Math.abs(t1 - t0) > 180 ? 1 : 0} ${t1 > t0 ? 1 : 0} ${n2(b[0])} ${n2(b[1])}`;
}

// ─────────────────────────────── os materiais ───────────────────────────────

/** O metal: claro onde a luz bate, a cor dele no meio, a sombra, e um reflexo de volta na beirada. */
function GradMetal({ id, cor, deitado }: { id: string; cor: string; deitado?: boolean }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2={deitado ? '1' : '0.9'} y2={deitado ? '0' : '1'}>
      <stop offset="0" stopColor={shade(cor, 0.6)} />
      <stop offset="0.34" stopColor={cor} />
      <stop offset="0.74" stopColor={shade(cor, -0.34)} />
      <stop offset="1" stopColor={shade(cor, 0.06)} />
    </linearGradient>
  );
}
/** Uma bola (uma conta, um cabochão, uma pérola): a luz num ponto no alto, a sombra na beirada de baixo. */
function GradBola({ id, cor, claro = 0.62, escuro = -0.5 }: { id: string; cor: string; claro?: number; escuro?: number }) {
  return (
    <radialGradient id={id} cx="0.36" cy="0.3" r="0.8">
      <stop offset="0" stopColor={shade(cor, claro)} />
      <stop offset="0.42" stopColor={cor} />
      <stop offset="1" stopColor={shade(cor, escuro)} />
    </radialGradient>
  );
}
/**
 * Um pano, um couro: mais claro do lado da luz, mais escuro do outro. `noDesenho`: o degradê é medido
 * no desenho inteiro (de `x1` a `x2`), e não em cada forma — para uma peça feita de várias formas (a
 * luva: os dedos, a palma, o polegar) ter o mesmo tom no mesmo lugar, sem emenda.
 */
function GradPano({ id, cor, forte = 1, noDesenho }: { id: string; cor: string; forte?: number; noDesenho?: [number, number] }) {
  const onde = noDesenho ? { gradientUnits: 'userSpaceOnUse' as const, x1: noDesenho[0], y1: 20, x2: noDesenho[1], y2: 36 } : { x1: '0', y1: '0', x2: '1', y2: '0.25' };
  return (
    <linearGradient id={id} {...onde}>
      <stop offset="0" stopColor={shade(cor, 0.2 * forte)} />
      <stop offset="0.45" stopColor={cor} />
      <stop offset="1" stopColor={shade(cor, -0.3 * forte)} />
    </linearGradient>
  );
}
/** O brilho de uma faceta: uma estrela de quatro pontas. */
function Faisca({ x, y, s, opacidade = 0.95 }: { x: number; y: number; s: number; opacidade?: number }) {
  const k = s * 0.2;
  return <path d={`M${x} ${y - s} L${x + k} ${y - k} L${x + s} ${y} L${x + k} ${y + k} L${x} ${y + s} L${x - k} ${y + k} L${x - s} ${y} L${x - k} ${y - k} Z`} fill="#fff" opacity={opacidade} />;
}

/**
 * Uma pedra lapidada, vista de cima: a cintura (o contorno), as facetas da coroa — cada uma no tom que
 * a luz lhe dá, as de cima e da esquerda claras, as de baixo e da direita escuras — e a mesa no meio,
 * com o reflexo dela. É o que faz a pedra parecer cortada, e não uma mancha de cor.
 */
function Lapidada({ c, cor, mesa = 0.5, centro }: { c: P[]; cor: string; mesa?: number; centro?: P }) {
  const [cx, cy] = centro ?? [c.reduce((s, p) => s + p[0], 0) / c.length, c.reduce((s, p) => s + p[1], 0) / c.length];
  const dentro = vezes(c, mesa, [cx, cy]);
  const n = c.length;
  // (um brilhante é quase branco: a sombra dele é azulada, senão a pedra vira cinza)
  const claraDemais = luminance(cor) > 0.82;
  const sombra = (k: number) => (claraDemais ? mix(cor, '#3f7fcc', Math.min(1, k * 1.7)) : shade(cor, -k));
  const largura = Math.max(...c.map((p) => p[0])) - Math.min(...c.map((p) => p[0]));
  return (
    <g strokeLinejoin="round">
      <polygon points={pts(c)} fill={cor} stroke={claraDemais ? '#5b7fa8' : shade(cor, -0.55)} strokeWidth={1.1} />
      {c.map((p, i) => {
        const q = c[(i + 1) % n];
        const [mx, my] = [(p[0] + q[0]) / 2 - cx, (p[1] + q[1]) / 2 - cy];
        const luz = (mx * -0.6 + my * -0.8) / (Math.hypot(mx, my) || 1);
        return <polygon key={i} points={pts([p, q, dentro[(i + 1) % n], dentro[i]])} fill={luz > 0 ? shade(cor, luz * 0.6) : sombra(-luz * 0.5)} stroke={shade(cor, 0.6)} strokeWidth={0.35} strokeOpacity={0.55} />;
      })}
      <polygon points={pts(dentro)} fill={claraDemais ? mix(cor, '#8fc0ee', 0.34) : shade(cor, 0.2)} stroke={shade(cor, 0.7)} strokeWidth={0.4} strokeOpacity={0.7} />
      <polygon points={pts(vezes(dentro, 0.55, [cx + largura * 0.07, cy + largura * 0.07]).map(([x, y]) => [x - largura * 0.14, y - largura * 0.14] as P))} fill="#fff" opacity={0.42} />
    </g>
  );
}

/** Uma garra do engaste: uma bolinha de metal dobrada sobre a pedra. */
function Garra({ x, y, r, u, risco }: { x: number; y: number; r: number; u: string; risco: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={`url(#${u}-m)`} stroke={risco} strokeWidth={0.7} />
      <circle cx={x - r * 0.3} cy={y - r * 0.32} r={r * 0.3} fill="#fff" opacity={0.75} />
    </g>
  );
}

// ─────────────────────────────── os anéis ───────────────────────────────

/** A navete (a lapidação marquise): comprida, de duas pontas. */
function navete(cx: number, cy: number, a: number, b: number, n = 6): P[] {
  const lado = (s: number) =>
    Array.from({ length: n }, (_, i) => {
      const k = -1 + (2 * i) / n;
      return [cx + a * k * s, cy - b * (1 - k * k) ** 0.85 * s] as P;
    });
  return [...lado(1), ...lado(-1)];
}

function Pedra({ a, u }: { a: Anel; u: string }) {
  const metal = `url(#${u}-m)`;
  const risco = shade(a.metal, -0.5);
  const virola = { fill: metal, stroke: risco, strokeWidth: 1, strokeLinejoin: 'round' as const };
  switch (a.pedra) {
    case 'nenhuma':
    case 'serpente':
    case 'incrustada':
      return null;
    case 'redonda': {
      // o solitário: a cesta, o brilhante oitavado no alto e as seis garras em volta
      const c = poligono(50, 29.5, 17, 17, 8, Math.PI / 8);
      return (
        <g>
          <polygon points="40,39 60,39 55.5,50 44.5,50" {...virola} />
          <Lapidada c={c} cor={a.cor} mesa={0.52} />
          {[0, 1, 2, 3, 4, 5].map((k) => {
            const t = ((k + 0.5) / 6) * Math.PI * 2;
            return <Garra key={k} x={50 + Math.cos(t) * 16.6} y={29.5 + Math.sin(t) * 16.6} r={2.5} u={u} risco={risco} />;
          })}
          <Faisca x={41} y={21} s={5.5} />
        </g>
      );
    }
    case 'trinca':
      // três brilhantes em fila: o do meio maior, cada um nas quatro garras dele
      return (
        <g>
          {(
            [
              [27, 37.5, 9],
              [73, 37.5, 9],
              [50, 30, 13],
            ] as const
          ).map(([x, y, r], i) => (
            <g key={i}>
              <polygon points={pts(poligono(x, y + r * 0.5, r * 0.7, r * 0.75, 4, Math.PI / 4))} {...virola} />
              <Lapidada c={poligono(x, y, r, r, 8, Math.PI / 8)} cor={a.cor} mesa={0.5} />
              {[0, 1, 2, 3].map((k) => {
                const t = ((k + 0.5) / 4) * Math.PI * 2;
                return <Garra key={k} x={x + Math.cos(t) * r * 0.98} y={y + Math.sin(t) * r * 0.98} r={r * 0.17} u={u} risco={risco} />;
              })}
            </g>
          ))}
          <Faisca x={43.5} y={23.5} s={4.6} />
          <Faisca x={76.5} y={33} s={2.8} opacidade={0.85} />
        </g>
      );
    case 'esmeralda': {
      // o corte esmeralda, em degraus, na moldura de cantos cortados, com duas garras em cada canto
      const c: P[] = [
        [36.5, 15.5],
        [63.5, 15.5],
        [70.5, 22.5],
        [70.5, 39.5],
        [63.5, 46.5],
        [36.5, 46.5],
        [29.5, 39.5],
        [29.5, 22.5],
      ];
      const meio: P = [50, 31];
      return (
        <g>
          <polygon points={pts(vezes(c, 1.13, meio))} {...virola} />
          <Lapidada c={c} cor={a.cor} mesa={0.66} centro={meio} />
          <polygon points={pts(vezes(c, 0.4, meio))} fill="none" stroke={shade(a.cor, 0.65)} strokeWidth={0.5} opacity={0.75} strokeLinejoin="round" />
          {c.map(([x, y], i) => (
            <Garra key={i} x={meio[0] + (x - meio[0]) * 1.03} y={meio[1] + (y - meio[1]) * 1.03} r={1.9} u={u} risco={risco} />
          ))}
          <Faisca x={40} y={23} s={4.6} />
        </g>
      );
    }
    case 'oval':
      // o cabochão: meia pedra polida, sem facetas, na virola dela, com uma volta de granulado
      return (
        <g>
          <ellipse cx={50} cy={31} rx={22} ry={17.6} {...virola} />
          {Array.from({ length: 22 }, (_, i) => {
            const t = (i / 22) * Math.PI * 2;
            return <circle key={i} cx={50 + Math.cos(t) * 21} cy={31 + Math.sin(t) * 16.6} r={1.55} fill={shade(a.metal, 0.3)} stroke={risco} strokeWidth={0.45} />;
          })}
          <ellipse cx={50} cy={31} rx={17.4} ry={13.4} fill={`url(#${u}-p)`} stroke={shade(a.cor, -0.6)} strokeWidth={0.9} />
          <ellipse cx={43.5} cy={25.4} rx={6.6} ry={3.5} transform="rotate(-22 43.5 25.4)" fill="#fff" opacity={0.72} />
          <path d={arco(50, 31, 14.2, 10.4, 20, 100)} fill="none" stroke={shade(a.cor, 0.55)} strokeWidth={1.5} strokeLinecap="round" opacity={0.5} />
        </g>
      );
    case 'marquise': {
      // a navete: comprida, de duas pontas, com uma garra em cada uma
      const c = navete(50, 31, 25, 15);
      return (
        <g>
          <polygon points={pts(vezes(c, 1.13, [50, 31]))} {...virola} />
          <Lapidada c={c} cor={a.cor} mesa={0.5} centro={[50, 31]} />
          <path d="M37.5 31 H62.5" stroke={shade(a.cor, 0.65)} strokeWidth={0.45} opacity={0.65} />
          <Garra x={24.5} y={31} r={2.6} u={u} risco={risco} />
          <Garra x={75.5} y={31} r={2.6} u={u} risco={risco} />
          <Garra x={50} y={15.6} r={1.9} u={u} risco={risco} />
          <Garra x={50} y={46.4} r={1.9} u={u} risco={risco} />
          <Faisca x={40.5} y={25} s={4.8} />
        </g>
      );
    }
    case 'gota': {
      // a lapidação em pera: redonda embaixo, em ponta em cima
      const c: P[] = [
        [50, 7.5],
        [58.5, 21],
        [65.5, 30],
        [68, 39.5],
        [62.5, 49.5],
        [50, 54],
        [37.5, 49.5],
        [32, 39.5],
        [34.5, 30],
        [41.5, 21],
      ];
      const meio: P = [50, 36.5];
      return (
        <g>
          <polygon points={pts(vezes(c, 1.12, meio))} {...virola} />
          <Lapidada c={c} cor={a.cor} mesa={0.5} centro={meio} />
          <Garra x={50} y={6.2} r={2.5} u={u} risco={risco} />
          <Garra x={33.4} y={47.4} r={2} u={u} risco={risco} />
          <Garra x={66.6} y={47.4} r={2} u={u} risco={risco} />
          <Garra x={50} y={55.4} r={2} u={u} risco={risco} />
          <Faisca x={42.5} y={30} s={4.8} />
        </g>
      );
    }
    case 'coracao': {
      // o coração polido, na virola dele, com a garra do bico
      const CORACAO = 'M50 51 C21 32.5 29.5 9 50 21.5 C70.5 9 79 32.5 50 51 Z';
      return (
        <g>
          <path d={CORACAO} fill="none" stroke={risco} strokeWidth={6.2} strokeLinejoin="round" />
          <path d={CORACAO} fill="none" stroke={metal} strokeWidth={4.4} strokeLinejoin="round" />
          <path d={CORACAO} fill={`url(#${u}-p)`} stroke={shade(a.cor, -0.5)} strokeWidth={0.9} strokeLinejoin="round" />
          <path d="M50 46.5 C28.5 32 34 15 50 25.5 C66 15 71.5 32 50 46.5 Z" fill="none" stroke={shade(a.cor, 0.6)} strokeWidth={0.8} opacity={0.55} />
          <path d="M40.5 20.5 C34.5 20.5 32.5 28 36.5 32.5" fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" opacity={0.8} />
          <circle cx={61.5} cy={21.5} r={1.9} fill="#fff" opacity={0.7} />
          <Garra x={50} y={52.4} r={2.3} u={u} risco={risco} />
          <Garra x={31.4} y={20} r={1.9} u={u} risco={risco} />
          <Garra x={68.6} y={20} r={1.9} u={u} risco={risco} />
        </g>
      );
    }
    case 'perola':
      // a pérola no cálice dela: o copinho e as pétalas de metal que a abraçam por baixo
      return (
        <g>
          <path d="M39 41 Q50 53 61 41 L57 49.5 Q50 53 43 49.5 Z" {...virola} />
          <circle cx={50} cy={29} r={17.4} fill={`url(#${u}-p)`} stroke={shade(a.cor, -0.4)} strokeWidth={1} />
          <circle cx={50} cy={29} r={17.4} fill={`url(#${u}-oriente)`} />
          <path d="M35.4 36.5 Q37.4 41.4 41.6 42.2 Q45 38.6 50 44 Q55 38.6 58.4 42.2 Q62.6 41.4 64.6 36.5 Q63.6 48 50 50.4 Q36.4 48 35.4 36.5 Z" fill={metal} stroke={risco} strokeWidth={0.8} strokeLinejoin="round" />
          <path d="M38.6 43.6 Q43 47.6 49 48.4" fill="none" stroke="#fff" strokeWidth={1} strokeLinecap="round" opacity={0.7} />
          <ellipse cx={43.6} cy={22} rx={6.4} ry={4} transform="rotate(-28 43.6 22)" fill="#fff" opacity={0.9} />
          <circle cx={57} cy={36.5} r={1.8} fill="#fff" opacity={0.55} />
        </g>
      );
    case 'sinete':
      // o anel de selo: a chapa oval em dois degraus e a espada do baralho gravada no campo
      return (
        <g>
          <ellipse cx={50} cy={32} rx={22.5} ry={16.5} {...virola} />
          <ellipse cx={50} cy={32} rx={17} ry={11.8} fill={a.cor} stroke={shade(a.metal, -0.45)} strokeWidth={0.9} />
          <path d={arco(50, 32, 17, 11.8, 185, 300)} fill="none" stroke={shade(a.metal, -0.6)} strokeWidth={1.2} opacity={0.45} />
          <path d="M50 24.4 C46 28.6 42.6 31 42.6 34.2 C42.6 37.2 46.3 38.4 49 36.3 L47.7 40 H52.3 L51 36.3 C53.7 38.4 57.4 37.2 57.4 34.2 C57.4 31 54 28.6 50 24.4 Z" fill={shade(a.metal, -0.5)} />
          <path d="M50.7 25.1 C46.7 29.3 43.3 31.7 43.3 34.9" fill="none" stroke={shade(a.metal, 0.6)} strokeWidth={0.7} opacity={0.8} strokeLinecap="round" />
          <path d={arco(50, 32, 20, 14.2, 195, 285)} fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" opacity={0.7} />
        </g>
      );
    case 'quadrada':
      // a placa quadrada de ônix, chanfrada, na moldura dela, com uma garra em cada canto
      return (
        <g>
          <rect x={30.5} y={12.5} width={39} height={37} rx={3.5} {...virola} />
          <rect x={34} y={16} width={32} height={30} rx={1.6} fill={`url(#${u}-placa)`} stroke={shade(a.cor, -0.5)} strokeWidth={0.8} />
          <rect x={38.5} y={20.5} width={23} height={21} rx={0.8} fill="none" stroke={shade(a.cor, 0.5)} strokeWidth={0.6} opacity={0.55} />
          <path d="M34.6 16.6 L38.5 20.5 M65.4 16.6 L61.5 20.5 M34.6 45.4 L38.5 41.5 M65.4 45.4 L61.5 41.5" stroke={shade(a.cor, 0.5)} strokeWidth={0.5} opacity={0.5} />
          <path d="M39.5 21.5 L53 21.5 L39.5 35 Z" fill="#fff" opacity={0.2} />
          <path d="M44 21.5 L47 21.5 L39.5 29 L39.5 26 Z" fill="#fff" opacity={0.3} />
          {(
            [
              [33, 15],
              [67, 15],
              [33, 47],
              [67, 47],
            ] as const
          ).map(([x, y], i) => (
            <Garra key={i} x={x} y={y} r={3.6} u={u} risco={risco} />
          ))}
        </g>
      );
  }
}

function AnelArt({ a, u }: { a: Anel; u: string }) {
  const escuro = shade(a.metal, -0.5);
  const defs = (
    <defs>
      <GradMetal id={`${u}-m`} cor={a.metal} />
      <GradMetal id={`${u}-aro`} cor={a.metal} />
      <GradBola id={`${u}-p`} cor={a.cor} claro={a.pedra === 'perola' ? 0.9 : 0.55} escuro={a.pedra === 'perola' ? -0.3 : -0.5} />
      <radialGradient id={`${u}-oriente`} cx="0.68" cy="0.74" r="0.5">
        <stop offset="0" stopColor="#f3b9cc" stopOpacity={0.6} />
        <stop offset="0.6" stopColor="#bcd4f2" stopOpacity={0.22} />
        <stop offset="1" stopColor="#ffffff" stopOpacity={0} />
      </radialGradient>
      <linearGradient id={`${u}-placa`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={shade(a.cor, 0.34)} />
        <stop offset="0.5" stopColor={a.cor} />
        <stop offset="1" stopColor={shade(a.cor, -0.35)} />
      </linearGradient>
      <GradPano id={`${u}-madeira`} cor={a.cor} forte={1.4} />
    </defs>
  );
  if (a.pedra === 'serpente') {
    // a cobra enrolada: duas voltas do corpo escamado, a cauda embaixo e a cabeça no alto, com os olhos de pedra e a língua
    const CORPO = 'M30 79 Q19 62 34 50 Q52 38 68 50 Q80 62 66 72 Q50 82 34 70 Q22 58 38 46 Q52 36 63 40';
    return (
      <g fill="none" strokeLinecap="round">
        {defs}
        <path d={CORPO} stroke={escuro} strokeWidth={9.6} />
        <path d={CORPO} stroke={`url(#${u}-m)`} strokeWidth={7} />
        <path d={CORPO} stroke={shade(a.metal, -0.4)} strokeWidth={6.6} strokeDasharray="0.9 2.5" strokeLinecap="butt" opacity={0.6} />
        <path d={CORPO} stroke="#fff" strokeWidth={1.5} strokeDasharray="1.6 1.8" strokeLinecap="butt" opacity={0.4} transform="translate(-1 -1.4)" />
        <path d="M81 29.5 L88.5 25.5 M81 30.5 L89 32" stroke={a.cor} strokeWidth={1.5} />
        <path d="M60 38 Q62 29 72 29 Q84 29.5 82 34 Q79 41.5 68 42.5 Q61 43 60 38 Z" fill={`url(#${u}-m)`} stroke={escuro} strokeWidth={1.3} strokeLinejoin="round" />
        <path d="M63.5 34.5 Q67 30.6 73.5 30.8" stroke="#fff" strokeWidth={1.3} opacity={0.6} />
        {(
          [
            [72.6, 33.2],
            [76.4, 37],
          ] as const
        ).map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={2.1} fill={a.cor} stroke={shade(a.cor, -0.55)} strokeWidth={0.6} />
            <circle cx={x - 0.6} cy={y - 0.7} r={0.7} fill="#fff" opacity={0.9} />
          </g>
        ))}
      </g>
    );
  }
  if (a.pedra === 'incrustada') {
    // o aro largo de outro material (a madeira, com os veios dela), preso entre dois frisos de metal
    return (
      <g fill="none">
        {defs}
        <ellipse cx={50} cy={52} rx={28} ry={24} stroke={escuro} strokeWidth={23} />
        <ellipse cx={50} cy={52} rx={28} ry={24} stroke={`url(#${u}-aro)`} strokeWidth={20.6} />
        <ellipse cx={50} cy={52} rx={28} ry={24} stroke={shade(a.cor, -0.4)} strokeWidth={14} />
        <ellipse cx={50} cy={52} rx={28} ry={24} stroke={`url(#${u}-madeira)`} strokeWidth={12.6} />
        {[-3.6, -1, 2.2, 4.4].map((d, i) => (
          <ellipse key={d} cx={50} cy={52} rx={28 + d} ry={24 + d} stroke={i % 2 ? shade(a.cor, 0.3) : shade(a.cor, -0.45)} strokeWidth={0.6} strokeDasharray={`${14 + i * 5} ${5 + i * 2}`} opacity={0.55} />
        ))}
        <path d={arco(50, 52, 37.4, 33.4, 205, 262)} stroke="#fff" strokeWidth={1.5} strokeLinecap="round" opacity={0.8} />
        <path d={arco(50, 52, 28, 24, 208, 258)} stroke="#fff" strokeWidth={2.4} strokeLinecap="round" opacity={0.22} />
        <path d={arco(50, 52, 18.6, 14.6, 30, 80)} stroke="#fff" strokeWidth={1.1} strokeLinecap="round" opacity={0.5} />
      </g>
    );
  }
  const larga = a.pedra === 'nenhuma';
  const w = larga ? 10.4 : 6.6;
  return (
    <g>
      {defs}
      {/* o aro, visto um pouco de cima: o lado de dentro, escuro, atrás; a frente por cima, com a luz dela */}
      <g fill="none">
        <ellipse cx={50} cy={63.4} rx={25} ry={21} stroke={escuro} strokeWidth={w + 1.6} />
        <ellipse cx={50} cy={66} rx={25} ry={21} stroke={`url(#${u}-aro)`} strokeWidth={w} />
        {larga && (
          <>
            {/* a aliança: um friso polido em cada beirada */}
            <ellipse cx={50} cy={66} rx={25 + w / 2 - 1.3} ry={21 + w / 2 - 1.3} stroke={shade(a.metal, 0.5)} strokeWidth={1.1} opacity={0.85} />
            <ellipse cx={50} cy={66} rx={25 - w / 2 + 1.3} ry={21 - w / 2 + 1.3} stroke={shade(a.metal, -0.36)} strokeWidth={1} opacity={0.8} />
          </>
        )}
        <path d={arco(50, 66, 25, 21, 196, 258)} stroke="#fff" strokeWidth={larga ? 2.8 : 2.1} strokeLinecap="round" opacity={0.8} />
        <path d={arco(50, 66, 25, 21, 28, 66)} stroke="#fff" strokeWidth={1.4} strokeLinecap="round" opacity={0.45} />
      </g>
      <Pedra a={a} u={u} />
    </g>
  );
}

// ─────────────────────────────── as pulseiras ───────────────────────────────

function PulseiraArt({ a, u }: { a: Pulseira; u: string }) {
  const em = (i: number, n: number) => {
    const t = (i / n) * Math.PI * 2;
    return { x: 50 + Math.cos(t) * 33, y: 52 + Math.sin(t) * 26 };
  };
  /** Do fundo para a frente: o que está embaixo no desenho está mais perto, e cobre o resto. */
  const emOrdem = <T extends { y: number }>(l: T[]) => [...l].sort((p, q) => p.y - q.y);
  const escuro = shade(a.cor, -0.5);
  const escuro2 = shade(a.cor2, -0.5);
  const defs = (
    <defs>
      <GradMetal id={`${u}-m`} cor={a.cor} />
      <GradMetal id={`${u}-m2`} cor={a.cor2} />
      <GradBola id={`${u}-b`} cor={a.cor} claro={luminance(a.cor) > 0.8 ? 0.9 : 0.6} escuro={luminance(a.cor) > 0.8 ? -0.3 : -0.5} />
      <GradBola id={`${u}-b2`} cor={a.cor2} />
      <GradBola id={`${u}-b3`} cor={shade(a.cor, -0.18)} />
      <GradPano id={`${u}-pano`} cor={a.cor} forte={1.3} />
    </defs>
  );
  const anelDeBase = (largura: number, cor: string, extra: Record<string, unknown> = {}) => <ellipse cx={50} cy={52} rx={33} ry={26} fill="none" stroke={cor} strokeWidth={largura} {...extra} />;

  if (a.feitio === 'contas') {
    // o fio de contas: cada uma com o brilho dela, e o fecho — a conta de metal, entre duas tampas — na frente
    return (
      <g>
        {defs}
        {anelDeBase(1.3, shade(a.cor2, -0.25))}
        {emOrdem(Array.from({ length: 16 }, (_, i) => ({ ...em(i, 16), fecho: i === 4 }))).map((c, i) => {
          const r = c.fecho ? 7.6 : 6.5;
          return (
            <g key={i}>
              {c.fecho && [-1, 1].map((s) => <ellipse key={s} cx={c.x + s * 7.6} cy={c.y - 0.2} rx={1.9} ry={4.4} fill={`url(#${u}-m2)`} stroke={escuro2} strokeWidth={0.6} />)}
              <circle cx={c.x} cy={c.y} r={r} fill={`url(#${u}-${c.fecho ? 'b2' : 'b'})`} stroke={c.fecho ? escuro2 : escuro} strokeWidth={0.9} />
              <ellipse cx={c.x - r * 0.32} cy={c.y - r * 0.38} rx={r * 0.34} ry={r * 0.2} transform={`rotate(-30 ${n2(c.x - r * 0.32)} ${n2(c.y - r * 0.38)})`} fill="#fff" opacity={0.8} />
            </g>
          );
        })}
      </g>
    );
  }
  if (a.feitio === 'corrente') {
    // a corrente de elos grossos — um deitado, um de pé — e a plaquinha lisa de identidade, na frente
    return (
      <g>
        {defs}
        {emOrdem(Array.from({ length: 14 }, (_, i) => ({ ...em(i, 14), i }))).map(({ x, y, i }) => {
          const ang = ((i / 14) * 360 + 90) % 360;
          const elo = { cx: x, cy: y, rx: 8.6, ry: i % 2 ? 3 : 5, transform: `rotate(${n2(ang)} ${n2(x)} ${n2(y)})`, fill: 'none' };
          return (
            <g key={i}>
              <ellipse {...elo} stroke={i % 2 ? shade(a.cor2, -0.55) : escuro} strokeWidth={4.4} />
              <ellipse {...elo} stroke={i % 2 ? a.cor2 : a.cor} strokeWidth={2.9} />
              <ellipse {...elo} stroke="#fff" strokeWidth={1} strokeDasharray="7 80" strokeDashoffset={-22} strokeLinecap="round" opacity={0.75} />
            </g>
          );
        })}
        <rect x={36.5} y={72.6} width={27} height={10.8} rx={3.4} fill={`url(#${u}-m)`} stroke={escuro} strokeWidth={1.1} />
        <rect x={38.6} y={74.5} width={22.8} height={7} rx={2.1} fill="none" stroke={shade(a.cor, 0.55)} strokeWidth={0.7} opacity={0.9} />
        <path d="M40.5 76.2 H52" stroke="#fff" strokeWidth={1.3} strokeLinecap="round" opacity={0.75} />
      </g>
    );
  }
  if (a.feitio === 'argolas') {
    // três aros soltos, cada um de um feitio: um chato, de frisos; um torcido em corda (o do outro ouro); um redondo
    const aros: [number, number, string, 'chato' | 'corda' | 'redondo'][] = [
      [44, 46, a.cor, 'chato'],
      [56, 55, a.cor2, 'corda'],
      [48, 61, a.cor, 'redondo'],
    ];
    return (
      <g fill="none">
        {defs}
        {aros.map(([cx, cy, cor, feitio], i) => (
          <g key={i}>
            <ellipse cx={cx} cy={cy} rx={30} ry={22} stroke={shade(cor, -0.55)} strokeWidth={feitio === 'chato' ? 7.2 : 6.4} />
            <ellipse cx={cx} cy={cy} rx={30} ry={22} stroke={`url(#${u}-${cor === a.cor ? 'm' : 'm2'})`} strokeWidth={feitio === 'chato' ? 5.4 : 4.6} />
            {feitio === 'chato' && <ellipse cx={cx} cy={cy} rx={30} ry={22} stroke={shade(cor, -0.3)} strokeWidth={2.2} opacity={0.5} />}
            {feitio === 'corda' && <ellipse cx={cx} cy={cy} rx={30} ry={22} stroke={shade(cor, -0.42)} strokeWidth={4.6} strokeDasharray="1.5 2.6" opacity={0.7} />}
            <path d={arco(cx, cy, 30, 22, 200, 255)} stroke="#fff" strokeWidth={1.6} strokeLinecap="round" opacity={0.8} />
            <path d={arco(cx, cy, 30, 22, 30, 62)} stroke="#fff" strokeWidth={1.1} strokeLinecap="round" opacity={0.45} />
          </g>
        ))}
      </g>
    );
  }
  if (a.feitio === 'trancada') {
    // dois fios torcidos um no outro; o nó que os fecha, e as duas pontas soltas, cada uma com a conta de metal dela
    const no = em(5, 22);
    return (
      <g>
        {defs}
        {anelDeBase(9.6, shade(mix(a.cor, a.cor2, 0.5), -0.6))}
        {emOrdem(Array.from({ length: 22 }, (_, i) => ({ ...em(i, 22), i }))).map(({ x, y, i }) => {
          const ang = ((i / 22) * 360 + 90 + 38) % 360;
          const cor = i % 2 ? a.cor2 : a.cor;
          return (
            <g key={i} transform={`rotate(${n2(ang)} ${n2(x)} ${n2(y)})`}>
              <ellipse cx={x} cy={y} rx={7.2} ry={3.7} fill={cor} stroke={shade(cor, -0.5)} strokeWidth={0.7} />
              <path d={`M${n2(x - 4.2)} ${n2(y - 1.5)} H${n2(x + 2.4)}`} stroke={shade(cor, 0.55)} strokeWidth={0.9} strokeLinecap="round" opacity={0.6} />
            </g>
          );
        })}
        {(
          [
            [61.5, 92, a.cor],
            [69, 87, a.cor2],
          ] as const
        ).map(([x, y, cor], i) => (
          <g key={i}>
            <path d={`M${n2(no.x)} ${n2(no.y + 3)} Q${n2((no.x + x) / 2 + 2)} ${n2((no.y + y) / 2 - 1)} ${x} ${y}`} fill="none" stroke={shade(cor, -0.5)} strokeWidth={3.6} strokeLinecap="round" />
            <path d={`M${n2(no.x)} ${n2(no.y + 3)} Q${n2((no.x + x) / 2 + 2)} ${n2((no.y + y) / 2 - 1)} ${x} ${y}`} fill="none" stroke={cor} strokeWidth={2.2} strokeLinecap="round" />
            <circle cx={x} cy={y} r={2.9} fill="#e0ad3e" stroke="#7a5a1a" strokeWidth={0.7} />
            <circle cx={x - 0.9} cy={y - 1} r={0.9} fill="#fff" opacity={0.85} />
          </g>
        ))}
        <ellipse cx={no.x} cy={no.y + 3.2} rx={6.4} ry={7.2} fill={`url(#${u}-b)`} stroke={escuro} strokeWidth={0.9} />
        <path d={`M${n2(no.x - 4.6)} ${n2(no.y + 1)} Q${n2(no.x)} ${n2(no.y + 4.4)} ${n2(no.x + 4.6)} ${n2(no.y + 1)} M${n2(no.x - 4.4)} ${n2(no.y + 5.4)} Q${n2(no.x)} ${n2(no.y + 8.6)} ${n2(no.x + 4.4)} ${n2(no.y + 5.4)}`} fill="none" stroke={escuro} strokeWidth={0.8} opacity={0.7} />
      </g>
    );
  }
  if (a.feitio === 'riviera') {
    // a fila de brilhantes quadrados, cada um na caixinha dele, lapidado em quatro águas
    return (
      <g>
        {defs}
        {anelDeBase(11.8, escuro)}
        {anelDeBase(9.8, `url(#${u}-m)`)}
        {emOrdem(Array.from({ length: 16 }, (_, i) => ({ ...em(i, 16), i }))).map(({ x, y, i }) => {
          const ang = (i / 16) * 360 + 90;
          const [h, d] = [4.7, 2.1];
          return (
            <g key={i} transform={`rotate(${n2(ang)} ${n2(x)} ${n2(y)})`} strokeLinejoin="round">
              <rect x={x - h} y={y - h} width={2 * h} height={2 * h} rx={0.9} fill={a.cor2} stroke={shade(a.cor, -0.6)} strokeWidth={0.9} />
              <polygon points={pts([[x - h, y - h], [x + h, y - h], [x + d, y - d], [x - d, y - d]])} fill="#ffffff" opacity={0.85} />
              <polygon points={pts([[x + h, y - h], [x + h, y + h], [x + d, y + d], [x + d, y - d]])} fill="#8fb8e6" opacity={0.6} />
              <polygon points={pts([[x - h, y + h], [x + h, y + h], [x + d, y + d], [x - d, y + d]])} fill="#5f8fca" opacity={0.6} />
              <rect x={x - d} y={y - d} width={2 * d} height={2 * d} fill="#fff" opacity={0.7} />
            </g>
          );
        })}
        <Faisca x={em(11, 16).x - 1} y={em(11, 16).y - 1.5} s={4.4} />
        <Faisca x={em(6, 16).x + 1} y={em(6, 16).y - 1} s={3.2} opacidade={0.9} />
      </g>
    );
  }
  if (a.feitio === 'espinhos') {
    // a tira de couro preto, debruada e pespontada, com a fila de cones de aço — cada um com a face de luz e a de sombra
    return (
      <g>
        {defs}
        <ellipse cx={50} cy={52} rx={30} ry={23} fill="none" stroke={shade(a.cor, 0.34)} strokeWidth={15.4} />
        <ellipse cx={50} cy={52} rx={30} ry={23} fill="none" stroke={`url(#${u}-pano)`} strokeWidth={12.6} />
        {[-4.4, 4.4].map((d) => (
          <ellipse key={d} cx={50} cy={52} rx={30 + d} ry={23 + d} fill="none" stroke="#9c9ca8" strokeWidth={0.7} strokeDasharray="1.5 1.7" opacity={0.75} />
        ))}
        <path d={arco(50, 52, 30, 23, 205, 255)} fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" opacity={0.2} />
        {emOrdem(
          Array.from({ length: 11 }, (_, i) => {
            const t = (i / 11) * Math.PI * 2;
            return { c: Math.cos(t), sn: Math.sin(t), y: 52 + Math.sin(t) * 28 };
          }),
        ).map(({ c, sn }, i) => {
          const base = { x: 50 + c * 35.5, y: 52 + sn * 27.5 };
          const ponta: P = [50 + c * 49.5, 52 + sn * 40.5];
          const [e, d]: [P, P] = [
            [base.x + sn * 4.3, base.y - c * 4.3],
            [base.x - sn * 4.3, base.y + c * 4.3],
          ];
          // (a luz vem de cima, da esquerda: das duas faces do cone, a clara é a que olha para lá)
          const clara: P = e[0] + e[1] < d[0] + d[1] ? e : d;
          const sombra: P = clara === e ? d : e;
          return (
            <g key={i} strokeLinejoin="round">
              <polygon points={pts([e, d, ponta])} fill={a.cor2} stroke={shade(a.cor2, -0.6)} strokeWidth={0.9} />
              <polygon points={pts([clara, [base.x, base.y], ponta])} fill={shade(a.cor2, 0.55)} />
              <polygon points={pts([sombra, [base.x, base.y], ponta])} fill={shade(a.cor2, -0.3)} />
              <ellipse cx={base.x} cy={base.y} rx={4.6} ry={1.5} transform={`rotate(${n2((Math.atan2(sn, c) * 180) / Math.PI + 90)} ${n2(base.x)} ${n2(base.y)})`} fill={shade(a.cor2, -0.15)} stroke={shade(a.cor2, -0.6)} strokeWidth={0.6} />
            </g>
          );
        })}
      </g>
    );
  }
  if (a.feitio === 'terco') {
    // o terço: as três voltas de contas (com a conta maior entre as dezenas), a medalha, o pendente e o crucifixo de pontas em trevo
    const metal = shade(a.cor2, -0.5);
    const volta = (cy: number, fase: number) =>
      Array.from({ length: 33 }, (_, i) => {
        const t = ((i + fase) / 33) * Math.PI * 2;
        const maior = i % 11 === 5;
        return <circle key={cy * 100 + i} cx={n2(50 + Math.cos(t) * 31)} cy={n2(cy + Math.sin(t) * 16)} r={maior ? 3.3 : 2.4} fill={`url(#${u}-${maior ? 'b3' : 'b'})`} stroke={escuro} strokeWidth={0.6} />;
      });
    return (
      <g>
        {defs}
        {[30, 36.5, 43].map((cy, k) => (
          <g key={cy}>
            <ellipse cx={50} cy={cy} rx={31} ry={16} fill="none" stroke={a.cor2} strokeWidth={0.9} />
            {volta(cy, k * 0.33)}
          </g>
        ))}
        <line x1={50} y1={60} x2={50} y2={79} stroke={a.cor2} strokeWidth={1.1} />
        <ellipse cx={50} cy={61.5} rx={4} ry={4.8} fill={`url(#${u}-m2)`} stroke={metal} strokeWidth={0.8} />
        <ellipse cx={50} cy={61.5} rx={2.8} ry={3.6} fill="none" stroke={shade(a.cor2, 0.5)} strokeWidth={0.4} opacity={0.8} />
        <path d="M50 59.2 v4.6 M48.4 60.8 h3.2" stroke={metal} strokeWidth={0.8} fill="none" />
        {[68.4, 71.9, 75.4].map((y, i) => (
          <circle key={y} cx={50} cy={y} r={i === 1 ? 1.7 : 2.1} fill={`url(#${u}-${i === 1 ? 'b' : 'b3'})`} stroke={escuro} strokeWidth={0.5} />
        ))}
        {/* as pontas em trevo: três bolinhas em cada uma das quatro pontas da cruz */}
        {(
          [
            [50, 79.4, 0, -1],
            [50, 96, 0, 1],
            [43.2, 85.1, -1, 0],
            [56.8, 85.1, 1, 0],
          ] as const
        ).map(([x, y, dx, dy], i) =>
          [
            [0.9, 0],
            [-0.3, 1.5],
            [-0.3, -1.5],
          ].map(([ao, lado], k) => <circle key={`${i}-${k}`} cx={x + dx * ao + dy * lado} cy={y + dy * ao + dx * lado} r={1.25} fill={a.cor2} stroke={metal} strokeWidth={0.5} />),
        )}
        <path d="M48.3 79 h3.4 v4.4 h5.2 v3.4 h-5.2 v9.6 h-3.4 v-9.6 h-5.2 v-3.4 h5.2 z" fill={`url(#${u}-m2)`} stroke={metal} strokeWidth={0.9} strokeLinejoin="round" />
        <path d="M49.4 80.4 v14.6 M44.6 84.5 h10.6" stroke="#fff" strokeWidth={0.7} opacity={0.6} fill="none" />
        <circle cx={50} cy={84.4} r={0.9} fill={metal} opacity={0.8} />
        <path d="M50 85.4 v4.2" stroke={metal} strokeWidth={0.9} opacity={0.75} />
      </g>
    );
  }
  if (a.feitio === 'couro') {
    // a tira larga de couro: as beiradas debruadas, os pespontos, as tachas de metal e a fivela na frente
    return (
      <g>
        {defs}
        {anelDeBase(17.6, shade(a.cor, -0.5))}
        {anelDeBase(14.6, `url(#${u}-pano)`)}
        {[-6.2, 6.2].map((d) => (
          <ellipse key={d} cx={50} cy={52} rx={33 + d} ry={26 + d} fill="none" stroke={shade(a.cor, 0.26)} strokeWidth={1} opacity={0.8} />
        ))}
        {[-4.5, 4.5].map((d) => (
          <ellipse key={d} cx={50} cy={52} rx={33 + d} ry={26 + d} fill="none" stroke="#e2d2ae" strokeWidth={0.7} strokeDasharray="1.7 1.7" opacity={0.85} />
        ))}
        <path d={arco(50, 52, 33, 26, 205, 250)} fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" opacity={0.16} />
        {emOrdem(
          Array.from({ length: 9 }, (_, i) => {
            // (a fivela ocupa a frente: as tachas dão a volta pelo resto)
            const t = Math.PI / 2 + ((i + 1) / 10) * Math.PI * 2;
            return { x: 50 + Math.cos(t) * 33, y: 52 + Math.sin(t) * 26 };
          }),
        ).map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3.5} fill={shade(a.cor2, -0.3)} stroke={escuro2} strokeWidth={0.6} />
            <circle cx={p.x} cy={p.y - 0.3} r={2.7} fill={`url(#${u}-b2)`} />
            <circle cx={p.x - 0.9} cy={p.y - 1.2} r={0.9} fill="#fff" opacity={0.9} />
          </g>
        ))}
        <rect x={39.6} y={70.2} width={20.8} height={15.6} rx={3} fill="none" stroke={escuro2} strokeWidth={3.6} />
        <rect x={39.6} y={70.2} width={20.8} height={15.6} rx={3} fill="none" stroke={`url(#${u}-m2)`} strokeWidth={2.2} />
        <path d="M50 70.4 V83" stroke={escuro2} strokeWidth={2.2} strokeLinecap="round" />
        <path d="M50 70.6 V82.6" stroke={shade(a.cor2, 0.3)} strokeWidth={1.1} strokeLinecap="round" />
      </g>
    );
  }
  return (
    <g>
      {defs}
      {anelDeBase(9.6, escuro)}
      {anelDeBase(7.8, `url(#${u}-m)`)}
      <path d={arco(50, 52, 33, 26, 200, 255)} fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" opacity={0.8} />
    </g>
  );
}

// ─────────────────────────────── os relógios ───────────────────────────────

/** A cor de um gomo do mostrador prismático — a mesma conta do material da mesa 3D (o cosseno de três fases), para a figurinha e o modelo darem o mesmo arco-íris. */
function corDoPrisma(tom: number): string {
  const canal = (fase: number) => 255 * (0.58 + 0.42 * Math.cos(Math.PI * 2 * (tom + fase)));
  return rgbToHex(canal(0), canal(0.33), canal(0.67));
}

/** A correia, de alto a baixo do desenho: a caixa vai por cima do meio dela. */
function Correia({ a, u }: { a: Relogio; u: string }) {
  const cor = a.corDaCorreia;
  const risco = shade(cor, -0.5);
  if (a.correia === 'corrente') {
    // duas correntes finas, lado a lado: elos miúdos, um deitado e um de pé
    return (
      <g fill="none">
        {[45.6, 54.4].map((x) =>
          Array.from({ length: 19 }, (_, i) => {
            const y = 4.5 + i * 5.05;
            const elo = { cx: x, cy: y, rx: i % 2 ? 1.2 : 2.6, ry: 3.5 };
            return (
              <g key={`${x}-${i}`}>
                <ellipse {...elo} stroke={risco} strokeWidth={2.4} />
                <ellipse {...elo} stroke={i % 2 ? shade(cor, 0.3) : cor} strokeWidth={1.3} />
              </g>
            );
          }),
        )}
      </g>
    );
  }
  if (a.correia === 'metal' || a.correia === 'bicolor') {
    // a pulseira de elos: fileiras de três chapas, as de fora e a do meio desencontradas — a do meio mais polida (ou do outro metal)
    const meio = a.correia === 'bicolor' ? `url(#${u}-m2)` : `url(#${u}-polido)`;
    const riscoDoMeio = a.correia === 'bicolor' ? shade(a.metal2 ?? cor, -0.5) : risco;
    return (
      <g>
        <rect x={35.4} y={3.4} width={29.2} height={93.2} rx={3.4} fill={risco} />
        <g clipPath={`url(#${u}-tira)`}>
          {Array.from({ length: 15 }, (_, i) => {
            const y = 3.4 + i * 6.4;
            return (
              <g key={i}>
                {[36, 55.6].map((x) => (
                  <g key={x}>
                    <rect x={x} y={y} width={8.4} height={5.8} rx={1.4} fill={`url(#${u}-c)`} stroke={risco} strokeWidth={0.6} />
                    <path d={`M${x + 1.2} ${y + 1.3} H${x + 7.2}`} stroke="#fff" strokeWidth={0.8} strokeLinecap="round" opacity={0.6} />
                  </g>
                ))}
                <rect x={45} y={y - 3.2} width={10} height={5.8} rx={1.4} fill={meio} stroke={riscoDoMeio} strokeWidth={0.6} />
                <path d={`M46.4 ${y - 1.9} H53.6`} stroke="#fff" strokeWidth={0.9} strokeLinecap="round" opacity={0.75} />
              </g>
            );
          })}
        </g>
      </g>
    );
  }
  if (a.correia === 'borracha') {
    // a de borracha: larga e fosca, com os dois frisos ao comprido e as travessas perto das pontas
    const friso = luminance(cor) > 0.5 ? shade(cor, -0.24) : shade(cor, 0.34);
    return (
      <g>
        <rect x={32} y={4} width={36} height={92} rx={9} fill={`url(#${u}-c)`} stroke={luminance(cor) > 0.5 ? shade(cor, -0.4) : risco} strokeWidth={1.2} />
        <path d="M40.6 7 V93 M59.4 7 V93" stroke={friso} strokeWidth={1.5} strokeLinecap="round" opacity={0.8} />
        {[10.5, 16.5, 83.5, 89.5].map((y) => (
          <rect key={y} x={44.5} y={y - 1.8} width={11} height={3.6} rx={1.8} fill={friso} opacity={0.85} />
        ))}
      </g>
    );
  }
  if (a.correia === 'lona') {
    // a de lona: a trama do tecido, a listra do meio, os pespontos das beiradas e os dois passadores de metal
    return (
      <g>
        <rect x={36} y={4} width={28} height={92} rx={5} fill={`url(#${u}-c)`} stroke={risco} strokeWidth={1.2} />
        <rect x={45.4} y={4.6} width={9.2} height={90.8} fill={shade(cor, -0.32)} />
        <rect x={36.6} y={4.6} width={26.8} height={90.8} rx={4.6} fill={`url(#${u}-trama)`} />
        <path d="M39.2 7 V93 M60.8 7 V93" stroke={shade(cor, 0.5)} strokeWidth={0.75} strokeDasharray="1.8 1.5" opacity={0.9} />
        {[80, 87].map((y) => (
          <g key={y}>
            <rect x={34.6} y={y - 1.7} width={30.8} height={3.4} rx={1.2} fill={`url(#${u}-m)`} stroke={shade(a.metal, -0.5)} strokeWidth={0.7} />
            <path d={`M36.4 ${y - 0.6} H55`} stroke="#fff" strokeWidth={0.7} strokeLinecap="round" opacity={0.6} />
          </g>
        ))}
      </g>
    );
  }
  // a de couro: abaulada, pespontada nas duas beiradas, com o passador e os furos da fivela
  return (
    <g>
      <rect x={36} y={4} width={28} height={92} rx={8} fill={`url(#${u}-c)`} stroke={risco} strokeWidth={1.2} />
      <path d="M39.4 9 V91 M60.6 9 V91" stroke={shade(cor, luminance(cor) > 0.6 ? -0.3 : 0.5)} strokeWidth={0.75} strokeDasharray="1.9 1.5" opacity={0.9} />
      <rect x={35} y={78.6} width={30} height={3.8} rx={1.7} fill={shade(cor, -0.16)} stroke={risco} strokeWidth={0.7} />
      {[86, 91].map((y) => (
        <circle key={y} cx={50} cy={y} r={1.2} fill={shade(cor, -0.6)} />
      ))}
      <path d="M41.6 8 V28" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" opacity={0.16} />
    </g>
  );
}

/** Os ponteiros, nas dez e dez, com a sombra deles no mostrador, o dos segundos e o eixo. */
function Ponteiros({ a, r, segundos }: { a: Relogio; r: number; segundos?: string }) {
  const k = r / 21;
  const linhas: [number, number, number][] = [
    [50 - 9 * k, 50 - 6 * k, 3 * k],
    [50 + 12 * k, 50 - 8.2 * k, 2.1 * k],
  ];
  return (
    <g strokeLinecap="round">
      {linhas.map(([x, y, w], i) => (
        <line key={i} x1={50.8} y1={51} x2={x + 0.8} y2={y + 1} stroke="#000" strokeWidth={w} opacity={0.22} />
      ))}
      {linhas.map(([x, y, w], i) => (
        <line key={i} x1={50} y1={50} x2={x} y2={y} stroke={a.ponteiros} strokeWidth={w} />
      ))}
      {segundos && <line x1={50 + 3.2 * k} y1={50 - 5.4 * k} x2={50 - 8.4 * k} y2={50 + 14.2 * k} stroke={segundos} strokeWidth={0.9 * k} />}
      <circle cx={50} cy={50} r={2.3 * k} fill={a.ponteiros} />
      <circle cx={50} cy={50} r={0.9 * k} fill={shade(a.metal, 0.4)} />
    </g>
  );
}

/** O reflexo do vidro: uma faixa clara em diagonal, e um fio de luz na beirada de baixo. */
function Vidro({ u, r = 21 }: { u: string; r?: number }) {
  return (
    <g clipPath={`url(#${u}-vidro)`}>
      <path d={`M${50 - r * 1.2} ${50 - r * 0.25} L${50 - r * 0.1} ${50 - r * 1.25} L${50 + r * 0.42} ${50 - r * 1.25} L${50 - r * 1.2} ${50 + r * 0.38} Z`} fill="#fff" opacity={0.2} />
      <path d={`M${50 - r * 1.2} ${50 + r * 0.62} L${50 + r * 0.66} ${50 - r * 1.25} L${50 + r * 0.8} ${50 - r * 1.25} L${50 - r * 1.2} ${50 + r * 0.78} Z`} fill="#fff" opacity={0.12} />
    </g>
  );
}

function RelogioArt({ a, u }: { a: Relogio; u: string }) {
  const escuro = shade(a.metal, -0.5);
  const cor = a.corDaCorreia;
  const metal = `url(#${u}-m)`;
  const cronografo = a.visor === 'cronografo' || a.id === 'relogio-esportivo';
  // (o segundo ponteiro é vermelho, menos onde o vermelho já é a cor dos outros ou brigaria com o mostrador)
  const segundos = a.id === 'relogio-noturno' || a.visor === 'lua' || a.visor === 'prisma' ? undefined : '#d8283a';
  /** O raio do mostrador redondo (o aro giratório e o do cronógrafo comem um pouco dele). */
  const R = a.caixa === 'oitavada' ? 18.6 : a.aro || a.visor === 'cronografo' ? 19.6 : 21;
  const defs = (
    <defs>
      <GradMetal id={`${u}-m`} cor={a.metal} />
      <GradMetal id={`${u}-m2`} cor={a.metal2 ?? a.metal} />
      <GradMetal id={`${u}-polido`} cor={shade(cor, 0.3)} />
      {a.correia === 'metal' || a.correia === 'bicolor' ? (
        <GradMetal id={`${u}-c`} cor={cor} />
      ) : (
        <linearGradient id={`${u}-c`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={shade(cor, -0.26)} />
          <stop offset="0.28" stopColor={shade(cor, luminance(cor) > 0.8 ? 0.4 : 0.14)} />
          <stop offset="0.6" stopColor={cor} />
          <stop offset="1" stopColor={shade(cor, -0.34)} />
        </linearGradient>
      )}
      <radialGradient id={`${u}-face`} cx="0.42" cy="0.36" r="0.75">
        <stop offset="0" stopColor={shade(a.mostrador, 0.22)} />
        <stop offset="0.7" stopColor={a.mostrador} />
        <stop offset="1" stopColor={shade(a.mostrador, -0.22)} />
      </radialGradient>
      <radialGradient id={`${u}-luz`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#fff" stopOpacity={0.85} />
        <stop offset="0.5" stopColor="#fff" stopOpacity={0.18} />
        <stop offset="1" stopColor="#fff" stopOpacity={0} />
      </radialGradient>
      <pattern id={`${u}-trama`} width={2.2} height={2.2} patternUnits="userSpaceOnUse">
        <path d="M0 0.55 H2.2 M0 1.65 H2.2" stroke="#000" strokeWidth={0.35} opacity={0.2} />
        <path d="M1.1 0 V2.2" stroke="#fff" strokeWidth={0.3} opacity={0.16} />
      </pattern>
      <clipPath id={`${u}-tira`}>
        <rect x={35.4} y={3.4} width={29.2} height={93.2} rx={3.4} />
      </clipPath>
      <clipPath id={`${u}-vidro`}>
        {a.caixa === 'digital' ? <rect x={28} y={33} width={44} height={34} rx={3} /> : a.caixa === 'oval' ? <ellipse cx={50} cy={50} rx={11.6} ry={16.6} /> : a.caixa === 'quadrada' ? <rect x={30} y={32} width={40} height={36} rx={3} /> : <circle cx={50} cy={50} r={R} />}
      </clipPath>
      <filter id={`${u}-suave`} x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation={1.1} />
      </filter>
    </defs>
  );
  /** As quatro alças que prendem a caixa à correia. */
  const alcas = (x: number, y: number) => (
    <g>
      {(
        [
          [50 - x, 50 - y],
          [50 + x, 50 - y],
          [50 - x, 50 + y],
          [50 + x, 50 + y],
        ] as const
      ).map(([cx, cy], i) => (
        <rect key={i} x={cx - 3.5} y={cy - 5.5} width={7} height={11} rx={2.2} fill={metal} stroke={escuro} strokeWidth={0.9} />
      ))}
    </g>
  );
  /** A coroa, às três horas: serrilhada. */
  const coroa = (x: number, k = 1) => (
    <g>
      <rect x={x} y={50 - 4.2 * k} width={5.8 * k} height={8.4 * k} rx={1.7 * k} fill={metal} stroke={escuro} strokeWidth={0.9} />
      {[-2, 0, 2].map((d) => (
        <path key={d} d={`M${x + 1} ${50 + d * k} H${x + 4.8 * k}`} stroke={escuro} strokeWidth={0.5} opacity={0.75} />
      ))}
    </g>
  );

  if (a.caixa === 'digital') {
    // a caixa de resina de um relógio de visor: os botões, a moldura do visor com os quatro parafusos e o cristal líquido
    return (
      <g>
        {defs}
        <Correia a={a} u={u} />
        {(
          [
            [14.5, 36],
            [14.5, 55],
            [79.5, 36],
            [79.5, 55],
          ] as const
        ).map(([x, y], i) => (
          <rect key={i} x={x} y={y} width={6} height={9} rx={2} fill={shade(a.metal, 0.34)} stroke={shade(a.metal, -0.5)} strokeWidth={0.8} />
        ))}
        <rect x={19.5} y={23.5} width={61} height={53} rx={10} fill={metal} stroke={shade(a.metal, -0.6)} strokeWidth={1.3} />
        <rect x={22} y={26} width={56} height={48} rx={8} fill="none" stroke={shade(a.metal, 0.4)} strokeWidth={1} opacity={0.7} />
        <rect x={25.6} y={30.6} width={48.8} height={38.8} rx={4.6} fill={shade(a.metal, -0.45)} stroke={shade(a.metal, 0.5)} strokeWidth={0.8} />
        {(
          [
            [24.4, 28.6],
            [75.6, 28.6],
            [24.4, 71.4],
            [75.6, 71.4],
          ] as const
        ).map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={1.7} fill="#9aa0aa" stroke="#3b3d44" strokeWidth={0.5} />
            <path d={`M${x - 1} ${y - 1} L${x + 1} ${y + 1}`} stroke="#3b3d44" strokeWidth={0.5} />
          </g>
        ))}
        <rect x={28} y={33} width={44} height={34} rx={3} fill={`url(#${u}-face)`} stroke={shade(a.mostrador, -0.5)} strokeWidth={0.9} />
        <text x={50} y={59.4} textAnchor="middle" fontFamily='Consolas, "Courier New", monospace' fontWeight={900} fontSize={17} fill={a.ponteiros}>
          10:08
        </text>
        <text x={31} y={41.6} fontFamily='Consolas, "Courier New", monospace' fontWeight={700} fontSize={5.6} fill={a.ponteiros}>
          SÁB 21
        </text>
        <rect x={58} y={36.8} width={11} height={5} rx={1} fill="none" stroke={a.ponteiros} strokeWidth={0.7} />
        <rect x={59} y={37.8} width={6} height={3} fill={a.ponteiros} />
        <line x1={31} x2={69} y1={44.4} y2={44.4} stroke={a.ponteiros} strokeWidth={1} />
        <line x1={31} x2={69} y1={63.2} y2={63.2} stroke={a.ponteiros} strokeWidth={0.7} opacity={0.7} />
        <Vidro u={u} r={24} />
        <path d="M27 26.8 H62" stroke="#fff" strokeWidth={1.2} strokeLinecap="round" opacity={0.3} />
      </g>
    );
  }
  if (a.caixa === 'oval') {
    // a caixa pequena de um relógio-joia: oval, com a volta de brilhantes miúdos no aro
    return (
      <g>
        {defs}
        <Correia a={a} u={u} />
        {coroa(66.4, 0.7)}
        <ellipse cx={50} cy={50} rx={17.6} ry={22.6} fill={metal} stroke={escuro} strokeWidth={1.3} />
        {Array.from({ length: 20 }, (_, i) => {
          const t = (i / 20) * Math.PI * 2;
          const [x, y] = [50 + Math.cos(t) * 14.6, 50 + Math.sin(t) * 19.6];
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={1.6} fill="#eaf6ff" stroke="#6f8fb4" strokeWidth={0.45} />
              <circle cx={x - 0.45} cy={y - 0.5} r={0.55} fill="#fff" />
            </g>
          );
        })}
        <ellipse cx={50} cy={50} rx={11.6} ry={16.6} fill={`url(#${u}-face)`} stroke={escuro} strokeWidth={0.8} />
        {[0, 3, 6, 9].map((h) => {
          const t = (h * Math.PI) / 6;
          return <circle key={h} cx={50 + Math.sin(t) * 8.6} cy={50 - Math.cos(t) * 13.2} r={0.9} fill={a.ponteiros} />;
        })}
        <Ponteiros a={a} r={13} />
        <Vidro u={u} r={16.6} />
        <Faisca x={41.2} y={33.4} s={2.6} />
      </g>
    );
  }
  if (a.caixa === 'quadrada') {
    // a caixa quadrada, de cantos redondos, com o aro em moldura
    return (
      <g>
        {defs}
        <Correia a={a} u={u} />
        {alcas(13, 26)}
        {coroa(75.4)}
        <rect x={23.6} y={25.6} width={52.8} height={48.8} rx={7.6} fill={metal} stroke={escuro} strokeWidth={1.3} />
        <rect x={26.6} y={28.6} width={46.8} height={42.8} rx={5.4} fill="none" stroke={shade(a.metal, 0.5)} strokeWidth={1.3} opacity={0.75} />
        <rect x={30} y={32} width={40} height={36} rx={3} fill={`url(#${u}-face)`} stroke={escuro} strokeWidth={0.9} />
        {Array.from({ length: 12 }, (_, h) => {
          const t = (h * Math.PI) / 6;
          const grande = h % 3 === 0;
          const [de, ate] = [grande ? 11.6 : 13.4, 15.6];
          return <line key={h} x1={50 + Math.sin(t) * de} y1={50 - Math.cos(t) * de * 0.9} x2={50 + Math.sin(t) * ate} y2={50 - Math.cos(t) * ate * 0.9} stroke={a.ponteiros} strokeWidth={grande ? 1.9 : 0.9} strokeLinecap="round" opacity={grande ? 1 : 0.75} />;
        })}
        <Ponteiros a={a} r={19} segundos={segundos} />
        <Vidro u={u} r={22} />
      </g>
    );
  }

  // ── as caixas de mostrador redondo: a redonda e a de oito lados ──
  const indices = (pular: (h: number) => boolean = () => false, fino = false) => (
    <g>
      {Array.from({ length: 60 }, (_, k) => {
        if (k % 5 === 0) return null;
        const t = (k * Math.PI) / 30;
        return <line key={k} x1={50 + Math.sin(t) * R * 0.9} y1={50 - Math.cos(t) * R * 0.9} x2={50 + Math.sin(t) * R * 0.96} y2={50 - Math.cos(t) * R * 0.96} stroke={a.ponteiros} strokeWidth={0.45} opacity={0.6} />;
      })}
      {Array.from({ length: 12 }, (_, h) => {
        if (pular(h)) return null;
        const t = (h * Math.PI) / 6;
        const grande = h % 3 === 0 && !fino;
        const [de, ate] = [R * (fino ? 0.72 : grande ? 0.66 : 0.76), R * 0.88];
        return <line key={h} x1={50 + Math.sin(t) * de} y1={50 - Math.cos(t) * de} x2={50 + Math.sin(t) * ate} y2={50 - Math.cos(t) * ate} stroke={a.ponteiros} strokeWidth={fino ? (h === 0 ? 1.7 : 1) : grande ? 2.1 : 1.1} strokeLinecap="round" />;
      })}
    </g>
  );
  const algarismo = (h: number, px: number, raio = 0.68) => {
    const t = (h * Math.PI) / 6;
    return (
      <text key={h} x={50 + Math.sin(t) * R * raio} y={50 - Math.cos(t) * R * raio + px * 0.36} textAnchor="middle" fontFamily='"M PLUS Rounded 1c", "Segoe UI", sans-serif' fontWeight={800} fontSize={px} fill={a.ponteiros}>
        {h === 0 ? 12 : h}
      </text>
    );
  };
  /** Os três mostradores pequenos de um cronógrafo (no bicolor, cheios do metal da caixa). */
  const pequenos = cronografo && (
    <g>
      {(
        [
          [-0.42, 0],
          [0.42, 0],
          [0, 0.42],
        ] as const
      ).map(([dx, dy], i) => {
        const [x, y] = [50 + dx * R, 50 + dy * R];
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={R * 0.22} fill={a.visor === 'cronografo' ? metal : a.ponteiros} fillOpacity={a.visor === 'cronografo' ? 1 : 0.26} stroke={a.ponteiros} strokeWidth={0.6} />
            <line x1={x} y1={y} x2={x + R * 0.08} y2={y - R * 0.15} stroke={a.ponteiros} strokeWidth={0.6} strokeLinecap="round" />
          </g>
        );
      })}
    </g>
  );
  /** Os dois botões do cronógrafo, um de cada lado da coroa. */
  const botoes = cronografo && (
    <g>
      {[-33, 33].map((g) => {
        const t = (g * Math.PI) / 180;
        const [x, y] = [50 + Math.cos(t) * 28.4, 50 + Math.sin(t) * 28.4];
        return <rect key={g} x={x - 2.8} y={y - 2.4} width={5.6} height={4.8} rx={1.2} transform={`rotate(${g} ${n2(x)} ${n2(y)})`} fill={a.metal2 ? `url(#${u}-m2)` : metal} stroke={shade(a.metal2 ?? a.metal, -0.5)} strokeWidth={0.8} />;
      })}
    </g>
  );

  if (a.caixa === 'oitavada') {
    // a caixa de oito lados de um relógio moderno: o aro oitavado, preso por oito parafusos, e o mostrador prismático no meio
    const fora = poligono(50, 50, 28.4, 28.4, 8, Math.PI / 8);
    const aro = poligono(50, 50, 25.2, 25.2, 8, Math.PI / 8);
    const GOMOS = 48;
    return (
      <g>
        {defs}
        <Correia a={a} u={u} />
        {alcas(13.5, 27)}
        {coroa(75.6)}
        <polygon points={pts(fora)} fill={metal} stroke={escuro} strokeWidth={1.3} strokeLinejoin="round" />
        <polygon points={pts(aro)} fill={shade(a.metal, 0.3)} stroke={shade(a.metal, -0.36)} strokeWidth={0.9} strokeLinejoin="round" />
        <polygon points={pts(aro.slice(4))} fill="#fff" opacity={0.4} />
        {aro.map(([x, y], i) => {
          const [px, py] = [50 + (x - 50) * 0.9, 50 + (y - 50) * 0.9];
          return (
            <g key={i}>
              <circle cx={px} cy={py} r={1.5} fill={shade(a.metal, -0.36)} stroke={shade(a.metal, -0.6)} strokeWidth={0.45} />
              <path d={`M${n2(px - 0.9)} ${n2(py - 0.5)} L${n2(px + 0.9)} ${n2(py + 0.5)}`} stroke={shade(a.metal, -0.7)} strokeWidth={0.5} />
            </g>
          );
        })}
        <circle cx={50} cy={50} r={R + 1} fill={shade(a.metal, -0.45)} />
        {a.visor === 'prisma' ? (
          <g clipPath={`url(#${u}-vidro)`}>
            <circle cx={50} cy={50} r={R} fill={a.mostrador} />
            {/* os gomos do prisma: a cor dá duas voltas em torno do meio, como os raios de um disco */}
            <g filter={`url(#${u}-suave)`}>
              {Array.from({ length: GOMOS }, (_, k) => {
                const [t0, t1] = [(k / GOMOS) * Math.PI * 2, ((k + 1) / GOMOS) * Math.PI * 2 + 0.02];
                return <polygon key={k} points={pts([[50, 50], [50 + Math.cos(t0) * 30, 50 + Math.sin(t0) * 30], [50 + Math.cos(t1) * 30, 50 + Math.sin(t1) * 30]])} fill={corDoPrisma((k / GOMOS) * 2 + 0.08)} />;
              })}
            </g>
            {Array.from({ length: 24 }, (_, k) => {
              const t = (k / 24) * Math.PI * 2 + 0.1;
              return <line key={k} x1={50} y1={50} x2={50 + Math.cos(t) * R} y2={50 + Math.sin(t) * R} stroke="#fff" strokeWidth={0.5} opacity={0.3} />;
            })}
            <circle cx={50} cy={50} r={R} fill={`url(#${u}-luz)`} />
          </g>
        ) : (
          <circle cx={50} cy={50} r={R} fill={`url(#${u}-face)`} />
        )}
        {indices(undefined, true)}
        <Ponteiros a={a} r={R} segundos={segundos} />
        <Vidro u={u} r={R} />
      </g>
    );
  }

  const deCampo = a.correia === 'lona';
  return (
    <g>
      {defs}
      <Correia a={a} u={u} />
      {alcas(13, 26.5)}
      {botoes}
      {coroa(76.2)}
      <circle cx={50} cy={50} r={27.2} fill={metal} stroke={escuro} strokeWidth={1.3} />
      {a.aro ? (
        <>
          {/* o aro giratório de um relógio de mergulho: a beirada serrilhada, as duas metades de cor, os pontos dos minutos e o triângulo do zero */}
          <circle cx={50} cy={50} r={26.4} fill="none" stroke={shade(a.metal, -0.4)} strokeWidth={1.4} strokeDasharray="1.1 1.1" />
          <path d={arco(50, 50, 23, 23, 180, 360)} fill="none" stroke={a.aro[0]} strokeWidth={5.6} />
          <path d={arco(50, 50, 23, 23, 0, 180)} fill="none" stroke={a.aro[1]} strokeWidth={5.6} />
          {Array.from({ length: 12 }, (_, h) => {
            const t = (h * Math.PI) / 6;
            const [x, y] = [50 + Math.sin(t) * 23, 50 - Math.cos(t) * 23];
            return h === 0 ? <polygon key={h} points={pts([[x - 2.2, y - 1.8], [x + 2.2, y - 1.8], [x, y + 2.2]])} fill="#f4f4f8" /> : <circle key={h} cx={x} cy={y} r={h % 3 === 0 ? 1.25 : 0.75} fill="#f4f4f8" />;
          })}
          <path d={arco(50, 50, 23, 23, 200, 262)} fill="none" stroke="#fff" strokeWidth={5.6} opacity={0.16} />
        </>
      ) : a.visor === 'cronografo' ? (
        <>
          {/* o aro do cronógrafo, no segundo metal, com a escala gravada */}
          <circle cx={50} cy={50} r={22.6} fill="none" stroke={shade(a.metal2 ?? a.metal, -0.5)} strokeWidth={6.2} />
          <circle cx={50} cy={50} r={22.6} fill="none" stroke={`url(#${u}-m2)`} strokeWidth={5.2} />
          {Array.from({ length: 60 }, (_, k) => {
            const t = (k * Math.PI) / 30;
            const ate = k % 5 === 0 ? 24.2 : 23;
            return <line key={k} x1={50 + Math.sin(t) * 21.2} y1={50 - Math.cos(t) * 21.2} x2={50 + Math.sin(t) * ate} y2={50 - Math.cos(t) * ate} stroke={shade(a.metal, -0.5)} strokeWidth={k % 5 === 0 ? 0.9 : 0.4} opacity={0.9} />;
          })}
        </>
      ) : (
        <>
          {/* o aro: um degrau polido em volta do vidro (no relógio de campo, jateado: sem o fio de luz) */}
          <circle cx={50} cy={50} r={24.2} fill="none" stroke={shade(a.metal, a.fosca ? 0.2 : 0.42)} strokeWidth={2.4} />
          {!a.fosca && <path d={arco(50, 50, 24.2, 24.2, 195, 265)} fill="none" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" opacity={0.85} />}
        </>
      )}
      <circle cx={50} cy={50} r={R + 0.7} fill={escuro} />
      <circle cx={50} cy={50} r={R} fill={`url(#${u}-face)`} />
      {a.visor === 'cronografo' && (
        <g clipPath={`url(#${u}-vidro)`} opacity={0.5}>
          {/* o mostrador raiado: o lustro da prata escovada */}
          {Array.from({ length: 36 }, (_, k) => {
            const t = (k / 36) * Math.PI * 2;
            return <line key={k} x1={50} y1={50} x2={50 + Math.cos(t) * R} y2={50 + Math.sin(t) * R} stroke={k % 2 ? '#fff' : shade(a.mostrador, -0.3)} strokeWidth={0.5} />;
          })}
        </g>
      )}
      {a.visor === 'lua' && (
        <>
          {(
            [
              [40, 58, 1.1],
              [61, 61, 1.4],
              [57, 47, 0.9],
              [38, 46, 1.3],
              [48, 64, 0.9],
              [64, 52, 1],
              [43, 39, 0.8],
              [56, 66, 0.8],
            ] as const
          ).map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill={a.ponteiros} opacity={0.9} />
          ))}
          <Faisca x={61} y={61} s={2.6} opacidade={0.9} />
          <path d="M54 33 A7.4 7.4 0 1 0 54 46.4 A5.6 5.6 0 1 1 54 33 Z" fill={a.ponteiros} stroke={shade(a.ponteiros, -0.3)} strokeWidth={0.4} />
        </>
      )}
      {deCampo ? (
        <>
          {indices(() => true)}
          {Array.from({ length: 12 }, (_, h) => algarismo(h, h % 3 === 0 ? 5.6 : 4.4, 0.7))}
        </>
      ) : a.id === 'relogio-classico' ? (
        <>
          {indices((h) => h % 3 === 0)}
          {[0, 3, 9].map((h) => algarismo(h, 6.4))}
          <rect x={46.3} y={59.2} width={7.4} height={5.6} rx={0.8} fill={a.ponteiros} />
          <text x={50} y={63.6} textAnchor="middle" fontFamily='"M PLUS Rounded 1c", "Segoe UI", sans-serif' fontWeight={800} fontSize={4.6} fill={a.mostrador}>
            21
          </text>
        </>
      ) : (
        indices(a.id === 'relogio-mergulho' ? (h) => h === 3 : undefined)
      )}
      {a.id === 'relogio-mergulho' && (
        <>
          <rect x={59.6} y={47.2} width={7} height={5.6} rx={0.8} fill="#f4f4f8" />
          <text x={63.1} y={51.6} textAnchor="middle" fontFamily='"M PLUS Rounded 1c", "Segoe UI", sans-serif' fontWeight={800} fontSize={4.6} fill="#101014">
            21
          </text>
        </>
      )}
      {pequenos}
      <Ponteiros a={a} r={R} segundos={segundos} />
      <Vidro u={u} r={R} />
    </g>
  );
}

// ─────────────────────────────── os esmaltes ───────────────────────────────

/**
 * O vidro de esmalte, sozinho e um pouco tombado. É no vidro que o acabamento aparece: a tinta da
 * cor, o degradê de uma cor à outra, o glitter brilhando no meio dela, o espelho do cromado — e a
 * francesinha, o rosado translúcido com a faixa da cor no alto, que é a ponta da unha.
 */
function EsmalteArt({ a, u }: { a: Esmalte; u: string }) {
  const { cor, metalico, efeito } = a;
  const tinta = cor ?? '#f6d8d2';
  const cor2 = a.cor2 ?? tinta;
  const natural = '#f7dcd4';
  const id = `${u}-e`;
  // o corpo de vidro: largo e baixo, de ombros redondos e fundo grosso
  const VIDRO = 'M27 61 Q27 48 40 48 L60 48 Q73 48 73 61 L73 85 Q73 95 63 95 L37 95 Q27 95 27 85 Z';
  /** Onde a tinta chega no vidro (acima fica o vidro vazio). */
  const NIVEL = 55.5;
  const cheio = efeito === 'degrade' || efeito === 'cromado' ? `url(#${id})` : efeito === 'francesinha' ? natural : tinta;
  const risco = shade(tinta, -0.42);
  return (
    // (tombado para a direita, a partir do meio do vidro; um nada menor, para caber inclinado)
    <g transform="translate(50 52) rotate(16) scale(0.9) translate(-50 -51)">
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2={efeito === 'cromado' ? '1' : '0'} y2="0">
          {efeito === 'cromado' ? (
            <>
              <stop offset="0" stopColor={cor2} />
              <stop offset="0.42" stopColor={tinta} />
              <stop offset="0.54" stopColor="#ffffff" />
              <stop offset="0.68" stopColor={tinta} />
              <stop offset="1" stopColor={cor2} />
            </>
          ) : (
            <>
              <stop offset="0.1" stopColor={tinta} />
              <stop offset="0.9" stopColor={cor2} />
            </>
          )}
        </linearGradient>
        <linearGradient id={`${id}-tampa`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#3a3744" />
          <stop offset="0.3" stopColor="#5a5668" />
          <stop offset="0.55" stopColor="#1d1b22" />
          <stop offset="1" stopColor="#0f0e13" />
        </linearGradient>
        <linearGradient id={`${id}-fundo`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity={0.05} />
          <stop offset="0.55" stopColor="#000" stopOpacity={0} />
          <stop offset="1" stopColor="#000" stopOpacity={0.32} />
        </linearGradient>
        <clipPath id={`${id}-v`}>
          <path d={VIDRO} />
        </clipPath>
      </defs>
      {/* a tampa comprida, com o fio de luz, e o gargalo de metal */}
      <rect x={41} y={5} width={18} height={39} rx={5} fill={`url(#${id}-tampa)`} stroke="#07060a" strokeWidth={1} />
      <path d="M44.6 9.5 V39.5" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" opacity={0.3} />
      <path d="M41.5 13 H58.5 M41.5 36 H58.5" stroke="#000" strokeWidth={0.7} opacity={0.35} />
      <rect x={43.4} y={42} width={13.2} height={8} fill="#cfcfd6" stroke="#7d7d88" strokeWidth={0.8} />
      <path d="M43.4 45.2 H56.6" stroke="#8b8b96" strokeWidth={0.6} />
      {/* o corpo: a tinta, e por cima o que o vidro faz com ela */}
      <path d={VIDRO} fill={cheio} stroke={risco} strokeWidth={1.4} opacity={cor ? 1 : 0.82} />
      <g clipPath={`url(#${id}-v)`}>
        {/* a francesinha: a faixa da cor no alto da tinta, com a curva do sorriso da unha */}
        {efeito === 'francesinha' && <path d={`M24 ${NIVEL - 1} H76 V64 Q50 72 24 64 Z`} fill={tinta} />}
        {efeito === 'glitter' &&
          Array.from({ length: 14 }, (_, i) => <Faisca key={i} x={32 + ((i * 37) % 36)} y={60 + ((i * 53) % 30)} s={1.7 + (i % 3) * 0.65} opacidade={0.55 + (i % 3) * 0.2} />)}
        {/* o vidro vazio acima da tinta, e a linha dela */}
        <rect x={24} y={44} width={52} height={NIVEL - 44} fill="#fff" opacity={0.42} />
        <path d={`M27 ${NIVEL} Q50 ${NIVEL + 2.2} 73 ${NIVEL}`} fill="none" stroke={shade(tinta, -0.3)} strokeWidth={0.9} opacity={0.7} />
        <rect x={24} y={44} width={52} height={54} fill={`url(#${id}-fundo)`} />
        {/* o fundo grosso do vidro */}
        <path d="M27 88 H73 V97 H27 Z" fill="#fff" opacity={0.26} />
        <path d="M27 88 H73" stroke="#fff" strokeWidth={0.8} opacity={0.5} />
      </g>
      {/* os reflexos: a faixa comprida do lado da luz e o ponto no ombro */}
      <path d="M33.6 60 V83" stroke="#fff" strokeWidth={3.6} strokeLinecap="round" opacity={metalico || efeito === 'cromado' ? 0.85 : 0.5} />
      <path d="M39.6 53 Q44 51.6 48 52" fill="none" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" opacity={0.55} />
      <path d="M68.6 64 V80" stroke="#fff" strokeWidth={1.2} strokeLinecap="round" opacity={0.22} />
    </g>
  );
}

// ─────────────────────────────── as luvas ───────────────────────────────

/**
 * Uma amostra do material da luva: um quadrado com o padrão dela — o pano ou o couro com as
 * nervuras, a renda vazada, o cetim, as placas da manopla, a abertura e a tira da de meio dedo. (A
 * forma de luva fica para a mesa 3D, que a mostra na mão; aqui o que distingue uma da outra é o
 * material.)
 */
function LuvaArt({ a, u }: { a: Luva; u: string }) {
  const nua = a.feitio === 'nenhuma';
  const doTraje = a.feitio === 'traje';
  const pano = nua ? PELE : doTraje ? '#4a4658' : a.feitio === 'manopla' ? a.cor2 : a.cor;
  const risco = shade(pano, nua ? -0.36 : -0.5);
  const escuro = luminance(pano) < 0.2;
  const metal = a.cor3 ?? '#e0ad3e';
  const Q = { x: 15, y: 15, l: 70, r: 7 };
  const quadro = <rect x={Q.x} y={Q.y} width={Q.l} height={Q.l} rx={Q.r} />;
  /** A tira do pulso, de lado a lado, com o botão de pressão. */
  const tira = (y: number, alto: number) => (
    <g>
      <rect x={10} y={y} width={80} height={alto} fill={a.cor2} />
      <path d={`M10 ${y + 1.4} H90`} stroke="#fff" strokeWidth={0.9} opacity={0.22} />
      <circle cx={66} cy={y + alto / 2} r={alto * 0.36} fill={`url(#${u}-m)`} stroke={shade(metal, -0.45)} strokeWidth={0.7} />
      <circle cx={66 - alto * 0.1} cy={y + alto / 2 - alto * 0.1} r={alto * 0.12} fill="#fff" opacity={0.85} />
    </g>
  );
  let padrao: ReactNode = null;
  if (nua) {
    // a pele: as dobrinhas dos nós e um brilho leve
    padrao = (
      <g fill="none" stroke={shade(PELE, -0.3)} strokeLinecap="round">
        {[30, 50, 70].map((x, i) => (
          <path key={x} d={`M${x - 6} ${40 + (i % 2) * 3} Q${x} ${36 + (i % 2) * 3} ${x + 6} ${40 + (i % 2) * 3}`} strokeWidth={0.9} opacity={0.55} />
        ))}
        <path d="M36 58 L38 76 M50 58 L50 78 M64 58 L62 76" strokeWidth={0.8} opacity={0.28} />
      </g>
    );
  } else if (doTraje) {
    // a do traje: depende do personagem — um pano neutro com a costura tracejada em volta
    padrao = <rect x={21} y={21} width={58} height={58} rx={4} fill="none" stroke="#8c879e" strokeWidth={1.4} strokeDasharray="4 3" />;
  } else if (a.feitio === 'inteira') {
    // a de passeio: as três nervuras e o punho pespontado
    padrao = (
      <g>
        {[34, 50, 66].map((x) => (
          <line key={x} x1={x} y1={20} x2={x - (50 - x) * 0.18} y2={62} stroke={a.cor2} strokeWidth={2.2} strokeLinecap="round" />
        ))}
        <rect x={10} y={68} width={80} height={20} fill={a.cor2} />
        <path d="M10 72.5 H90" stroke={shade(a.cor2, luminance(a.cor2) > 0.5 ? -0.3 : 0.4)} strokeWidth={0.9} strokeDasharray="2 1.7" />
      </g>
    );
  } else if (a.feitio === 'sem-dedos') {
    // a de meio dedo: os reforços dos nós, a abertura nas costas da mão (a pele aparece) e a tira
    padrao = (
      <g>
        {[26, 42, 58, 74].map((x) => (
          <rect key={x} x={x - 4} y={19} width={8} height={13} rx={4} fill={a.cor2} />
        ))}
        <ellipse cx={50} cy={48} rx={16} ry={9.5} fill={`url(#${u}-pele)`} stroke={a.cor2} strokeWidth={2.2} />
        {tira(66, 13)}
      </g>
    );
  } else if (a.feitio === 'tatica') {
    // a tática: a placa dura moldada em cima dos nós, os rebites e a tira
    padrao = (
      <g>
        <rect x={10} y={20} width={80} height={16} rx={6} fill={a.cor2} />
        <path d="M18 24 H80" stroke="#fff" strokeWidth={1.2} strokeLinecap="round" opacity={0.3} />
        {[30, 50, 70].map((x) => (
          <g key={x}>
            <circle cx={x} cy={50} r={3} fill={metal} stroke={shade(metal, -0.45)} strokeWidth={0.6} />
            <circle cx={x - 0.9} cy={49.1} r={1} fill="#fff" opacity={0.8} />
          </g>
        ))}
        {tira(64, 13)}
      </g>
    );
  } else if (a.feitio === 'renda') {
    // a renda: o desenho vazado (a pele por baixo) e a barra de bicos com o debrum
    padrao = (
      <g>
        <rect x={10} y={10} width={80} height={80} fill={`url(#${u}-renda)`} />
        <path d="M10 70 Q13.5 80 17 72 Q20.5 80 24 72 Q27.5 80 31 72 Q34.5 80 38 72 Q41.5 80 45 72 Q48.5 80 52 72 Q55.5 80 59 72 Q62.5 80 66 72 Q69.5 80 73 72 Q76.5 80 80 72 Q83.5 80 87 72 Q88.5 76 90 70 V90 H10 Z" fill={a.cor} stroke={a.cor2} strokeWidth={1.1} />
        <path d="M10 70 H90" stroke={a.cor2} strokeWidth={1.8} />
      </g>
    );
  } else if (a.feitio === 'curta') {
    // a de motorista: as três costuras curtas, e a boca dela — a pele do pulso embaixo, o entalhe em V e o botão de pressão
    padrao = (
      <g>
        {[34, 50, 66].map((x) => (
          <line key={x} x1={x} y1={19} x2={x - (50 - x) * 0.12} y2={38} stroke={a.cor2} strokeWidth={2.2} strokeLinecap="round" />
        ))}
        <path d="M10 66 H40 L50 44 L60 66 H90 V90 H10 Z" fill={`url(#${u}-pele)`} />
        <path d="M10 66 H40 L50 44 L60 66 H90" fill="none" stroke={a.cor2} strokeWidth={3.2} strokeLinejoin="round" />
        <circle cx={71} cy={57} r={4.2} fill={`url(#${u}-m)`} stroke={shade(metal, -0.45)} strokeWidth={0.7} />
        <circle cx={69.8} cy={55.8} r={1.4} fill="#fff" opacity={0.85} />
      </g>
    );
  } else if (a.feitio === 'opera') {
    // o cetim: o brilho comprido do tecido, as pregas e a bainha
    padrao = (
      <g fill="none">
        <path d="M30 14 Q24 50 34 90" stroke="#fff" strokeWidth={5} strokeLinecap="round" opacity={0.26} />
        <path d="M38 14 Q33 50 41 90" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" opacity={0.3} />
        <path d="M66 14 Q72 50 64 90" stroke={a.cor2} strokeWidth={3} strokeLinecap="round" opacity={0.5} />
        {[46, 53, 60].map((y) => (
          <path key={y} d={`M16 ${y} Q50 ${y + 5} 84 ${y}`} stroke={shade(a.cor, -0.4)} strokeWidth={1.3} opacity={0.75} />
        ))}
        <rect x={10} y={76} width={80} height={14} fill={a.cor2} stroke={risco} strokeWidth={1} />
      </g>
    );
  } else if (a.feitio === 'manopla') {
    // as placas de aço, sobrepostas em escama, com o friso de ouro e os rebites
    const linhas = [17, 34, 51, 68];
    padrao = (
      <g stroke={shade(a.cor, -0.55)} strokeWidth={1.1}>
        {linhas.map((y, l) =>
          [0, 1, 2, 3].map((k) => {
            const x = 9 + k * 21 - (l % 2) * 10.5;
            return (
              <g key={`${l}-${k}`}>
                <rect x={x} y={y} width={21} height={19} rx={3.2} fill={`url(#${u}-placa)`} />
                <path d={`M${x + 3} ${y + 3} H${x + 13}`} stroke="#fff" strokeWidth={1} strokeLinecap="round" opacity={0.7} />
              </g>
            );
          }),
        )}
        <rect x={10} y={48.4} width={80} height={4.4} fill={`url(#${u}-m)`} />
        {[24, 42, 60, 78].map((x) => (
          <circle key={x} cx={x} cy={50.6} r={1.2} fill={shade(metal, 0.5)} strokeWidth={0.4} />
        ))}
      </g>
    );
  }
  return (
    <g strokeLinejoin="round">
      <defs>
        <GradPano id={`${u}-pano`} cor={pano} forte={escuro ? 2.2 : 1} noDesenho={[Q.x, Q.x + Q.l]} />
        <GradPano id={`${u}-pele`} cor={PELE} forte={0.8} />
        <GradMetal id={`${u}-placa`} cor={a.cor} />
        <GradMetal id={`${u}-m`} cor={metal} />
        <pattern id={`${u}-renda`} width={7} height={7} patternUnits="userSpaceOnUse">
          <rect width={7} height={7} fill={a.cor} />
          <circle cx={3.5} cy={3.5} r={2.1} fill={PELE} />
          <circle cx={3.5} cy={3.5} r={0.7} fill={a.cor} />
          <circle cx={0} cy={0} r={1} fill={PELE} />
          <circle cx={7} cy={7} r={1} fill={PELE} />
          <circle cx={7} cy={0} r={1} fill={PELE} />
          <circle cx={0} cy={7} r={1} fill={PELE} />
        </pattern>
        <clipPath id={`${u}-q`}>{quadro}</clipPath>
      </defs>
      {/* o pano (ou a pele), o padrão dele por cima — recortado no quadrado —, o lustro e a beirada */}
      <g fill={`url(#${u}-pano)`}>{quadro}</g>
      <g clipPath={`url(#${u}-q)`}>
        {padrao}
        <path d="M22 22 Q36 18 50 20" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" opacity={nua ? 0.35 : escuro ? 0.22 : 0.3} />
        <rect x={Q.x} y={Q.y} width={Q.l} height={Q.l} fill="none" stroke="#000" strokeWidth={5} opacity={0.08} />
      </g>
      <g fill="none" stroke={risco} strokeWidth={1.4} strokeDasharray={doTraje ? '5 3.5' : undefined}>
        {quadro}
      </g>
    </g>
  );
}

// ─────────────────────────────── o contorno ───────────────────────────────

/**
 * O contorno da peça: um fio escuro em volta da **silhueta inteira**, para destacá-la do fundo (a
 * prateleira é roxa, o palco do prêmio é uma luz, e há peça preta e peça branca).
 *
 * É um filtro, e não um traço a mais em cada desenho: a silhueta de tudo o que foi pintado é
 * engordada (borrada e cortada de novo, que dá um contorno redondo, da mesma largura em toda a
 * volta), pintada de escuro e posta por baixo. Assim o contorno é sempre o de fora — um terço de cem
 * contas ganha uma borda só, e não cem — e peça nova nenhuma precisa se lembrar dele.
 *
 * A largura é dada em pontos da tela, e não do desenho: perto de um ponto nos tamanhos pequenos (de
 * 40 a 100), e crescendo devagar até uns dois nos grandes — fino sempre, e nunca sumido.
 */
function Contorno({ id, size }: { id: string; size: number }) {
  const naTela = Math.min(2.2, Math.max(1, size / 95));
  const largura = (naTela * 100) / Math.max(size, 1);
  return (
    // (a área do filtro é a caixa do desenho inteira, e não a da peça: a caixa de uma peça não conta a
    // grossura dos traços, e um aro largo sairia cortado)
    <filter id={id} filterUnits="userSpaceOnUse" x={-4} y={-4} width={108} height={108} colorInterpolationFilters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation={n2(largura * 0.72)} result="borrada" />
      <feComponentTransfer in="borrada" result="gorda">
        <feFuncA type="linear" slope={9} intercept={-0.8} />
      </feComponentTransfer>
      <feFlood floodColor={TINTA} result="tinta" />
      <feComposite in="tinta" in2="gorda" operator="in" result="contorno" />
      <feMerge>
        <feMergeNode in="contorno" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  );
}

export function AcessorioArt({ a, size }: { a: Acessorio; size: number }) {
  // (cada figurinha tem os degradês e o filtro dela: o mesmo acessório aparece várias vezes na mesma tela)
  const u = `ac${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  let peca: ReactNode = null;
  if (a.tipo === 'anel') peca = <AnelArt a={a} u={u} />;
  else if (a.tipo === 'pulseira') peca = <PulseiraArt a={a} u={u} />;
  else if (a.tipo === 'relogio') peca = <RelogioArt a={a} u={u} />;
  else if (a.tipo === 'esmalte') peca = <EsmalteArt a={a} u={u} />;
  else if (a.tipo === 'luva') peca = <LuvaArt a={a} u={u} />;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={a.nome}>
      <defs>
        <Contorno id={`${u}-contorno`} size={size} />
      </defs>
      {/* (um nada menor que a caixa, para o contorno caber em volta) */}
      <g filter={`url(#${u}-contorno)`}>
        <g transform="translate(50 50) scale(0.94) translate(-50 -50)">{peca}</g>
      </g>
    </svg>
  );
}
