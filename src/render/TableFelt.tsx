import { memo, useId, type ReactNode } from 'react';
import type { TablePattern, TableStyle } from '../../shared/styles';
import { cleanId, shade } from '../util/color';
import { Damask, Flower, SuitGlyph } from './suits';
import { CARD_H, CARD_W, CENTER, FELT, PLANE_H, PLANE_W, RAIL, boardSlot } from '../game/layout';
import { useUiTheme } from '../ui/themes';

/** Um sorteio com semente: as tábuas saem sempre iguais (o ladrilho não muda de um desenho para o outro). */
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

/**
 * O ladrilho das tábuas: seis tábuas deitadas ao comprido da mesa, cada uma de um tom (mais clara
 * ou mais escura que a madeira que há embaixo — é desenhado em preto e branco transparentes, por
 * cima da cor do estilo), com as emendas de topo desencontradas, dois pregos de cada lado de cada
 * emenda, o veio correndo ao longo de cada tábua e uns nós.
 */
export const TABUAS = { larg: 840, tabua: 88, quantas: 6 };
const TOM_DA_TABUA = [0.07, -0.07, 0.02, -0.12, 0.05, -0.03];
const EMENDA_DA_TABUA = [150, 560, 330, 720, 60, 470];

function Tabuas() {
  const { larg, tabua, quantas } = TABUAS;
  const r = sorteio(41);
  const pecas: ReactNode[] = [];
  for (let i = 0; i < quantas; i++) {
    const y = i * tabua;
    const tom = TOM_DA_TABUA[i];
    pecas.push(<rect key={`t${i}`} x={0} y={y} width={larg} height={tabua} fill={tom > 0 ? '#fff' : '#000'} opacity={Math.abs(tom)} />);
    // o veio: riscos compridos, ondulados, que emendam de um ladrilho no outro (acabam na altura em que começam)
    for (let k = 0; k < 6; k++) {
      const yy = y + 8 + ((tabua - 16) * (k + 0.5)) / 6 + (r() - 0.5) * 5;
      const a = (r() - 0.5) * 9;
      const b = (r() - 0.5) * 9;
      pecas.push(
        <path
          key={`v${i}-${k}`}
          d={`M0 ${yy.toFixed(1)} C${larg * 0.2} ${(yy + a).toFixed(1)} ${larg * 0.35} ${(yy + a).toFixed(1)} ${larg * 0.5} ${(yy + (a + b) / 2).toFixed(1)} S${larg * 0.8} ${(yy + b).toFixed(1)} ${larg} ${yy.toFixed(1)}`}
          fill="none"
          stroke="#000"
          strokeWidth={0.9 + r() * 1.1}
          opacity={0.07 + r() * 0.09}
        />,
      );
    }
    // um nó, em algumas: o miolo escuro e os anéis do veio em volta dele
    if (i % 2 === 0) {
      const nx = (EMENDA_DA_TABUA[i] + 260 + r() * 180) % larg;
      const ny = y + 22 + r() * (tabua - 44);
      pecas.push(
        <g key={`n${i}`} fill="none" stroke="#000">
          <ellipse cx={nx} cy={ny} rx={7} ry={4.2} fill="#000" stroke="none" opacity={0.34} />
          <ellipse cx={nx} cy={ny} rx={12} ry={7} strokeWidth={1.2} opacity={0.2} />
          <ellipse cx={nx} cy={ny} rx={18} ry={10} strokeWidth={1} opacity={0.12} />
        </g>,
      );
    }
    // a emenda de topo (onde uma tábua acaba e a outra começa), com a aresta que pega luz, e os pregos
    const x = EMENDA_DA_TABUA[i];
    pecas.push(
      <g key={`e${i}`}>
        <rect x={x - 1.4} y={y} width={2.8} height={tabua} fill="#000" opacity={0.5} />
        <rect x={x + 1.4} y={y} width={1.2} height={tabua} fill="#fff" opacity={0.1} />
        {[-13, 13].map((dx) =>
          [0.24, 0.76].map((f) => (
            <g key={`${dx}-${f}`}>
              <circle cx={x + dx} cy={y + tabua * f} r={3.1} fill="#000" opacity={0.52} />
              <circle cx={x + dx - 0.9} cy={y + tabua * f - 0.9} r={1} fill="#fff" opacity={0.3} />
            </g>
          )),
        )}
      </g>,
    );
    // a fresta entre esta tábua e a de cima: escura, com um fio de luz na quina de baixo
    pecas.push(<rect key={`f${i}`} x={0} y={y - 1.6} width={larg} height={3.2} fill="#000" opacity={0.58} />);
    pecas.push(<rect key={`l${i}`} x={0} y={y + 1.6} width={larg} height={1.2} fill="#fff" opacity={0.1} />);
  }
  return <>{pecas}</>;
}

/** A estampa cobre o tampo inteiro, e com a força dela? (As tábuas são o próprio tampo, não um bordado no feltro.) */
export const estampaInteira = (pattern: TablePattern): boolean => pattern === 'tabuas';

/** O padrão do feltro (um `<pattern>` de SVG). A mesa 3D também o usa, para estampar o feltro dela. */
export function FeltPattern({ id, pattern, color }: { id: string; pattern: TablePattern; color: string }) {
  const common = { id, patternUnits: 'userSpaceOnUse' as const };
  switch (pattern) {
    case 'tabuas':
      // (o meio da mesa cai no meio de uma tábua, e não numa fresta)
      return (
        <pattern {...common} width={TABUAS.larg} height={TABUAS.tabua * TABUAS.quantas} patternTransform={`translate(0 ${-TABUAS.tabua / 2 + 6})`}>
          <Tabuas />
        </pattern>
      );
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

/**
 * Onde a estampa do feltro aparece. Ela não cobre mais a mesa inteira — um feltro todo estampado
 * disputava a atenção com as cartas e as fichas —, e sim dois pontos-chave, com o resto liso:
 *  - uma **faixa** rente à beirada (`faixa` de largura, no plano da mesa);
 *  - um **medalhão** no centro, atrás do pote e das cartas da mesa.
 *
 * E ela é **da cor do próprio feltro, um pouco mais escura** — tom sobre tom, como um feltro
 * gravado, e não uma tinta de outra cor por cima: é desenhada em preto, bem transparente (`forca`),
 * o que escurece o feltro que há embaixo, seja qual for a cor dele e o ponto do degradê. (A cor da
 * estampa do estilo, `patternColor`, fica para a linha tracejada das apostas.) A mesa 3D usa as
 * mesmas medidas e a mesma cor (src/mesa3d/aparencia.ts).
 */
export const ESTAMPA_DO_FELTRO = { faixa: 62, medalhao: { x: 800, y: 525, rx: 332, ry: 172 }, cor: '#000000', forca: 0.15, forcaDoDamasco: 0.17, filete: 0.2 };

/** Tachas de latão ao longo da borda de couro (temas com mesa ornamentada). */
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
  const ornate = useUiTheme().table.ornate;
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
        <FeltPattern id={`pat${uid}`} pattern={st.pattern} color={ESTAMPA_DO_FELTRO.cor} />
        {/* onde a estampa aparece: a faixa rente à beirada e o medalhão do centro */}
        <mask id={`onde${uid}`} maskUnits="userSpaceOnUse" x={0} y={0} width={PLANE_W} height={PLANE_H}>
          <ellipse cx={cx} cy={cy} rx={FELT.rx} ry={FELT.ry} fill="#fff" />
          <ellipse cx={cx} cy={cy} rx={FELT.rx - ESTAMPA_DO_FELTRO.faixa} ry={FELT.ry - ESTAMPA_DO_FELTRO.faixa} fill="#000" />
          <ellipse cx={ESTAMPA_DO_FELTRO.medalhao.x} cy={ESTAMPA_DO_FELTRO.medalhao.y} rx={ESTAMPA_DO_FELTRO.medalhao.rx} ry={ESTAMPA_DO_FELTRO.medalhao.ry} fill="#fff" />
        </mask>
      </defs>
      {/* sombra no chão e espessura (saia) */}
      <ellipse cx={cx} cy={cy + 90} rx={RAIL.rx + 40} ry={RAIL.ry + 30} fill="#000" opacity={0.55} filter={`url(#sh${uid})`} />
      <ellipse cx={cx} cy={cy + 46} rx={RAIL.rx - 6} ry={RAIL.ry - 4} fill={`url(#apron${uid})`} />
      <ellipse cx={cx} cy={cy + 46} rx={RAIL.rx - 6} ry={RAIL.ry - 4} fill="none" stroke={st.railAccent} strokeOpacity={0.35} strokeWidth={3} />
      {/* borda acolchoada */}
      <ellipse cx={cx} cy={cy} rx={RAIL.rx} ry={RAIL.ry} fill={`url(#rail${uid})`} stroke={shade(st.rail, -0.6)} strokeWidth={4} />
      <ellipse cx={cx} cy={cy - 6} rx={RAIL.rx - 14} ry={RAIL.ry - 14} fill="none" stroke="#fff" strokeOpacity={0.1} strokeWidth={10} />
      {ornate && (
        <>
          {STUDS.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y + 1.5} r={4.6} fill="#000" opacity={0.45} />
              <circle cx={p.x} cy={p.y} r={4.2} fill={st.railAccent} />
              <circle cx={p.x - 1.3} cy={p.y - 1.3} r={1.6} fill="#fff" opacity={0.55} />
            </g>
          ))}
          <ellipse cx={cx} cy={cy} rx={FELT.rx + 16} ry={FELT.ry + 16} fill="none" stroke={st.railAccent} strokeOpacity={0.55} strokeWidth={1.5} />
        </>
      )}
      <ellipse cx={cx} cy={cy} rx={FELT.rx + 10} ry={FELT.ry + 10} fill="none" stroke={st.railAccent} strokeWidth={7} />
      {ornate && (
        <ellipse cx={cx} cy={cy} rx={FELT.rx + 10} ry={FELT.ry + 10} fill="none" stroke="#fff" strokeOpacity={0.25} strokeWidth={1.2} strokeDasharray="1 7" />
      )}
      <ellipse cx={cx} cy={cy} rx={FELT.rx + 10} ry={FELT.ry + 10} fill="none" stroke="#000" strokeOpacity={0.3} strokeWidth={1.5} />
      {/* feltro */}
      <ellipse cx={cx} cy={cy} rx={FELT.rx} ry={FELT.ry} fill={`url(#felt${uid})`} />
      {/* as tábuas são o tampo inteiro; as outras estampas, um bordado na faixa e no medalhão */}
      {estampaInteira(st.pattern) && <ellipse cx={cx} cy={cy} rx={FELT.rx} ry={FELT.ry} fill={`url(#pat${uid})`} />}
      {st.pattern !== 'none' && !estampaInteira(st.pattern) && (
        <>
          <ellipse cx={cx} cy={cy} rx={FELT.rx} ry={FELT.ry} fill={`url(#pat${uid})`} opacity={st.pattern === 'damask' ? ESTAMPA_DO_FELTRO.forcaDoDamasco : ESTAMPA_DO_FELTRO.forca} mask={`url(#onde${uid})`} />
          {/* um filete fecha a faixa por dentro, e dois cercam o medalhão: a estampa fica emoldurada, não solta no feltro */}
          <ellipse cx={cx} cy={cy} rx={FELT.rx - ESTAMPA_DO_FELTRO.faixa} ry={FELT.ry - ESTAMPA_DO_FELTRO.faixa} fill="none" stroke={ESTAMPA_DO_FELTRO.cor} strokeOpacity={ESTAMPA_DO_FELTRO.filete} strokeWidth={2} />
          <ellipse cx={ESTAMPA_DO_FELTRO.medalhao.x} cy={ESTAMPA_DO_FELTRO.medalhao.y} rx={ESTAMPA_DO_FELTRO.medalhao.rx} ry={ESTAMPA_DO_FELTRO.medalhao.ry} fill="none" stroke={ESTAMPA_DO_FELTRO.cor} strokeOpacity={ESTAMPA_DO_FELTRO.filete} strokeWidth={2.2} />
          <ellipse cx={ESTAMPA_DO_FELTRO.medalhao.x} cy={ESTAMPA_DO_FELTRO.medalhao.y} rx={ESTAMPA_DO_FELTRO.medalhao.rx + 11} ry={ESTAMPA_DO_FELTRO.medalhao.ry + 11} fill="none" stroke={ESTAMPA_DO_FELTRO.cor} strokeOpacity={ESTAMPA_DO_FELTRO.filete * 0.55} strokeWidth={1.2} />
        </>
      )}
      <ellipse cx={cx} cy={cy} rx={FELT.rx} ry={FELT.ry} fill="none" stroke="#000" strokeOpacity={0.35} strokeWidth={16} />
      <ellipse
        cx={cx}
        cy={cy}
        rx={FELT.rx - 150}
        ry={FELT.ry - 120}
        fill="none"
        stroke={st.patternColor}
        strokeOpacity={0.16}
        strokeWidth={3}
        strokeDasharray="2 12"
        strokeLinecap="round"
      />
      <text className="felt-logo" x={cx} y={cy + 205} textAnchor="middle" fontFamily="Cinzel, serif" fontWeight={700} fontSize={40} letterSpacing={12} fill={st.logoColor} opacity={0.22}>
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
              rx={9}
              fill="#000"
              fillOpacity={0.12}
              stroke="#fff"
              strokeOpacity={0.13}
              strokeWidth={2}
            />
          );
        })}
    </svg>
  );
});
