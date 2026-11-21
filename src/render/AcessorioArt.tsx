/**
 * O desenho de um acessório das mãos (shared/acessorios.ts), para a prateleira da Galeria e a lista
 * de prêmios: o anel com a pedra dele, a pulseira, o relógio, o vidro de esmalte, a luva. É só a
 * figurinha — como a peça fica na mão de verdade é a mesa 3D que mostra (src/mesa3d/acessorios3d.ts).
 */
import type { Acessorio, Anel, Esmalte, Luva, Pulseira, Relogio } from '../../shared/acessorios';
import { shade } from '../util/color';

const PELE = '#f4cdbb';

function Pedra({ a }: { a: Anel }) {
  const luz = shade(a.cor, 0.45);
  const fundo = shade(a.cor, -0.3);
  const borda = { stroke: fundo, strokeWidth: 1.5, strokeLinejoin: 'round' as const };
  switch (a.pedra) {
    case 'nenhuma':
      return null;
    case 'redonda':
      return (
        <g>
          <polygon points="50,14 62,19 67,31 62,43 50,48 38,43 33,31 38,19" fill={a.cor} {...borda} />
          <polygon points="50,21 57,24 60,31 57,38 50,41 43,38 40,31 43,24" fill={luz} opacity={0.85} />
        </g>
      );
    case 'esmeralda':
      return (
        <g>
          <polygon points="36,16 64,16 70,22 70,40 64,46 36,46 30,40 30,22" fill={a.cor} {...borda} />
          <polygon points="40,22 60,22 63,25 63,37 60,40 40,40 37,37 37,25" fill={luz} opacity={0.6} />
        </g>
      );
    case 'oval':
      return (
        <g>
          <ellipse cx={50} cy={31} rx={19} ry={15} fill={a.cor} {...borda} />
          <ellipse cx={44} cy={25} rx={7} ry={4} fill="#fff" opacity={0.55} />
        </g>
      );
    case 'marquise':
      return (
        <g>
          <path d="M24 31 Q50 8 76 31 Q50 54 24 31 Z" fill={a.cor} {...borda} />
          <path d="M36 31 Q50 19 64 31 Q50 43 36 31 Z" fill={luz} opacity={0.6} />
        </g>
      );
    case 'coracao':
      return (
        <g>
          <path d="M50 50 C22 32 30 10 50 22 C70 10 78 32 50 50 Z" fill={a.cor} {...borda} />
          <path d="M40 22 C34 22 33 30 38 33" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" opacity={0.7} />
        </g>
      );
    case 'perola':
      return (
        <g>
          <circle cx={50} cy={30} r={17} fill={a.cor} stroke={shade(a.cor, -0.22)} strokeWidth={1.5} />
          <ellipse cx={44} cy={23} rx={6} ry={4} fill="#fff" opacity={0.8} />
        </g>
      );
    case 'sinete':
      return (
        <g>
          <ellipse cx={50} cy={32} rx={22} ry={16} fill={a.metal} stroke={shade(a.metal, -0.35)} strokeWidth={1.5} />
          <ellipse cx={50} cy={32} rx={16} ry={11} fill={a.cor} stroke={shade(a.metal, -0.35)} strokeWidth={1} />
        </g>
      );
    case 'trinca':
      return (
        <g>
          {[
            [28, 36, 8],
            [72, 36, 8],
            [50, 30, 12],
          ].map(([x, y, r], i) => (
            <g key={i}>
              <polygon points={[0, 1, 2, 3, 4, 5, 6, 7].map((k) => `${x + Math.cos((k * Math.PI) / 4 + Math.PI / 8) * r},${y + Math.sin((k * Math.PI) / 4 + Math.PI / 8) * r}`).join(' ')} fill={a.cor} {...borda} />
              <circle cx={x - r * 0.25} cy={y - r * 0.25} r={r * 0.35} fill="#fff" opacity={0.7} />
            </g>
          ))}
        </g>
      );
    case 'gota':
      return (
        <g>
          <path d="M50 8 C40 22 32 28 32 37 A18 18 0 0 0 68 37 C68 28 60 22 50 8 Z" fill={a.cor} {...borda} />
          <path d="M50 18 C44 27 40 31 40 37 A10 10 0 0 0 50 47" fill="none" stroke={luz} strokeWidth={3} strokeLinecap="round" opacity={0.75} />
        </g>
      );
    case 'serpente':
    case 'incrustada':
      return null;
    case 'quadrada':
      return (
        <g>
          <rect x={32} y={14} width={36} height={34} rx={3} fill={a.cor} stroke={shade(a.metal, -0.3)} strokeWidth={1.5} />
          <path d="M36 18 L48 18 L36 30 Z" fill="#fff" opacity={0.18} />
          {[
            [32, 14],
            [68, 14],
            [32, 48],
            [68, 48],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={4} fill={a.metal} stroke={shade(a.metal, -0.35)} strokeWidth={1} />
          ))}
        </g>
      );
  }
}

function AnelArt({ a }: { a: Anel }) {
  const larga = a.pedra === 'nenhuma';
  if (a.pedra === 'serpente') {
    // a cobra enrolada: duas voltas do corpo, a cauda fina embaixo e a cabeça no alto, com o olho de pedra
    const escuro = shade(a.metal, -0.4);
    return (
      <g fill="none" strokeLinecap="round">
        <path d="M30 78 Q20 62 34 50 Q52 38 68 50 Q80 62 66 72 Q50 82 34 70 Q22 58 38 46 Q52 36 64 40" stroke={escuro} strokeWidth={9} />
        <path d="M30 78 Q20 62 34 50 Q52 38 68 50 Q80 62 66 72 Q50 82 34 70 Q22 58 38 46 Q52 36 64 40" stroke={a.metal} strokeWidth={6} />
        <ellipse cx={70} cy={36} rx={11} ry={7} transform="rotate(-24 70 36)" fill={a.metal} stroke={escuro} strokeWidth={1.5} />
        <circle cx={73} cy={33} r={2.4} fill={a.cor} />
        <path d="M80 30 L88 26 M80 31 L88 32" stroke={a.cor} strokeWidth={1.4} />
      </g>
    );
  }
  if (a.pedra === 'incrustada') {
    // o aro largo de outro material, com um friso de metal em cada beirada
    return (
      <g fill="none">
        <ellipse cx={50} cy={52} rx={28} ry={24} stroke={shade(a.metal, -0.35)} strokeWidth={22} />
        <ellipse cx={50} cy={52} rx={28} ry={24} stroke={a.metal} strokeWidth={19} />
        <ellipse cx={50} cy={52} rx={28} ry={24} stroke={a.cor} strokeWidth={12} />
        <path d="M27 40 Q34 30 46 28" stroke="#fff" strokeWidth={2} strokeLinecap="round" opacity={0.35} />
      </g>
    );
  }
  return (
    <g>
      {/* o aro, visto um pouco de cima: a parte de trás mais escura, a da frente por cima */}
      <ellipse cx={50} cy={64} rx={25} ry={21} fill="none" stroke={shade(a.metal, -0.35)} strokeWidth={larga ? 12 : 8} />
      <ellipse cx={50} cy={66} rx={25} ry={21} fill="none" stroke={a.metal} strokeWidth={larga ? 9 : 6} />
      <path d="M30 56 Q36 46 46 45" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" opacity={0.6} />
      <Pedra a={a} />
    </g>
  );
}

function PulseiraArt({ a }: { a: Pulseira }) {
  const em = (i: number, n: number) => {
    const t = (i / n) * Math.PI * 2;
    return { x: 50 + Math.cos(t) * 33, y: 52 + Math.sin(t) * 26 };
  };
  if (a.feitio === 'contas') {
    return (
      <g>
        {Array.from({ length: 16 }, (_, i) => {
          const p = em(i, 16);
          const fecho = i === 4;
          return <circle key={i} cx={p.x} cy={p.y} r={fecho ? 7.5 : 6.5} fill={fecho ? a.cor2 : a.cor} stroke={shade(fecho ? a.cor2 : a.cor, -0.3)} strokeWidth={1.2} />;
        })}
      </g>
    );
  }
  if (a.feitio === 'corrente') {
    return (
      <g>
        {Array.from({ length: 14 }, (_, i) => {
          const p = em(i, 14);
          const ang = ((i / 14) * 360 + 90) % 360;
          return <ellipse key={i} cx={p.x} cy={p.y} rx={8.5} ry={i % 2 ? 3.2 : 5} transform={`rotate(${ang} ${p.x} ${p.y})`} fill="none" stroke={i % 2 ? a.cor2 : a.cor} strokeWidth={3} />;
        })}
      </g>
    );
  }
  if (a.feitio === 'argolas') {
    return (
      <g fill="none">
        {[
          [44, 46, a.cor],
          [56, 56, a.cor2],
          [48, 60, a.cor],
        ].map(([cx, cy, cor], i) => (
          <g key={i}>
            <ellipse cx={cx as number} cy={cy as number} rx={30} ry={22} stroke={shade(cor as string, -0.35)} strokeWidth={6} />
            <ellipse cx={cx as number} cy={cy as number} rx={30} ry={22} stroke={cor as string} strokeWidth={4} />
          </g>
        ))}
      </g>
    );
  }
  if (a.feitio === 'trancada') {
    return (
      <g>
        {Array.from({ length: 22 }, (_, i) => {
          const p = em(i, 22);
          const ang = ((i / 22) * 360 + 90 + 38) % 360;
          return <ellipse key={i} cx={p.x} cy={p.y} rx={7} ry={3.6} transform={`rotate(${ang} ${p.x} ${p.y})`} fill={i % 2 ? a.cor2 : a.cor} stroke={shade(i % 2 ? a.cor2 : a.cor, -0.35)} strokeWidth={0.8} />;
        })}
        <ellipse cx={em(5, 22).x} cy={em(5, 22).y + 4} rx={6} ry={7} fill={a.cor} stroke={shade(a.cor, -0.4)} strokeWidth={1} />
      </g>
    );
  }
  if (a.feitio === 'riviera') {
    return (
      <g>
        <ellipse cx={50} cy={52} rx={33} ry={26} fill="none" stroke={a.cor} strokeWidth={9} />
        {Array.from({ length: 16 }, (_, i) => {
          const p = em(i, 16);
          const ang = (i / 16) * 360 + 90;
          return (
            <g key={i} transform={`rotate(${ang} ${p.x} ${p.y})`}>
              <rect x={p.x - 4.4} y={p.y - 4.4} width={8.8} height={8.8} rx={1} fill={a.cor2} stroke={shade(a.cor, -0.4)} strokeWidth={0.9} />
              <rect x={p.x - 2.2} y={p.y - 2.2} width={4.4} height={4.4} fill="#fff" opacity={0.75} />
            </g>
          );
        })}
      </g>
    );
  }
  if (a.feitio === 'espinhos') {
    return (
      <g>
        <ellipse cx={50} cy={52} rx={30} ry={23} fill="none" stroke={shade(a.cor, 0.25)} strokeWidth={15} />
        <ellipse cx={50} cy={52} rx={30} ry={23} fill="none" stroke={a.cor} strokeWidth={12} />
        {Array.from({ length: 11 }, (_, i) => {
          const t = (i / 11) * Math.PI * 2;
          const [c, sn] = [Math.cos(t), Math.sin(t)];
          const base = { x: 50 + c * 36, y: 52 + sn * 28 };
          return <polygon key={i} points={`${base.x - sn * 4},${base.y + c * 4} ${base.x + sn * 4},${base.y - c * 4} ${50 + c * 49},${52 + sn * 40}`} fill={a.cor2} stroke={shade(a.cor2, -0.45)} strokeWidth={0.9} strokeLinejoin="round" />;
        })}
      </g>
    );
  }
  if (a.feitio === 'couro') {
    return (
      <g>
        <ellipse cx={50} cy={52} rx={33} ry={26} fill="none" stroke={shade(a.cor, -0.3)} strokeWidth={17} />
        <ellipse cx={50} cy={52} rx={33} ry={26} fill="none" stroke={a.cor} strokeWidth={14} />
        {Array.from({ length: 10 }, (_, i) => {
          const p = em(i, 10);
          return <circle key={i} cx={p.x} cy={p.y} r={3} fill={a.cor2} stroke={shade(a.cor2, -0.4)} strokeWidth={0.8} />;
        })}
      </g>
    );
  }
  return <ellipse cx={50} cy={52} rx={33} ry={26} fill="none" stroke={a.cor} strokeWidth={8} />;
}

function RelogioArt({ a }: { a: Relogio }) {
  const elos = a.correia === 'metal';
  const risco = shade(a.corDaCorreia, -0.35);
  const correia =
    a.correia === 'corrente' ? (
      // a corrente fina: elos pequenos, um atrás do outro
      <g fill="none" stroke={a.corDaCorreia} strokeWidth={2.4}>
        {[6, 15, 24, 76, 85, 94].map((y, i) => (
          <ellipse key={y} cx={50} cy={y} rx={i % 2 ? 3 : 4.5} ry={5.5} />
        ))}
      </g>
    ) : (
      <>
        <rect x={a.correia === 'borracha' ? 32 : 36} y={4} width={a.correia === 'borracha' ? 36 : 28} height={92} rx={elos ? 4 : 9} fill={a.corDaCorreia} stroke={risco} strokeWidth={1.5} />
        {elos && [14, 22, 78, 86].map((y) => <line key={y} x1={36} x2={64} y1={y} y2={y} stroke={shade(a.corDaCorreia, -0.3)} strokeWidth={1.5} />)}
        {a.correia === 'borracha' && [12, 19, 81, 88].map((y) => <rect key={y} x={44} y={y - 2} width={12} height={4} rx={2} fill={shade(a.corDaCorreia, 0.3)} />)}
      </>
    );
  if (a.caixa === 'digital') {
    return (
      <g>
        {correia}
        <rect x={20} y={24} width={60} height={52} rx={9} fill={a.metal} stroke={shade(a.metal, 0.35)} strokeWidth={1.5} />
        <rect x={28} y={33} width={44} height={34} rx={3} fill={a.mostrador} stroke={shade(a.metal, 0.5)} strokeWidth={1.2} />
        <text x={50} y={58} textAnchor="middle" fontFamily='Consolas, "Courier New", monospace' fontWeight={900} fontSize={17} fill={a.ponteiros}>
          10:08
        </text>
        <line x1={32} x2={68} y1={43} y2={43} stroke={a.ponteiros} strokeWidth={1.2} />
        {[
          [14, 36],
          [14, 56],
          [80, 36],
          [80, 56],
        ].map(([x, y], i) => (
          <rect key={i} x={x} y={y} width={6} height={9} rx={2} fill={shade(a.metal, 0.3)} />
        ))}
      </g>
    );
  }
  if (a.caixa === 'oval') {
    return (
      <g>
        {correia}
        <ellipse cx={50} cy={50} rx={17} ry={22} fill={a.metal} stroke={shade(a.metal, -0.4)} strokeWidth={1.5} />
        <ellipse cx={50} cy={50} rx={12} ry={17} fill={a.mostrador} />
        <line x1={50} y1={50} x2={45} y2={43} stroke={a.ponteiros} strokeWidth={2.2} strokeLinecap="round" />
        <line x1={50} y1={50} x2={56} y2={41} stroke={a.ponteiros} strokeWidth={1.7} strokeLinecap="round" />
        <circle cx={50} cy={50} r={1.8} fill={a.ponteiros} />
      </g>
    );
  }
  return (
    <g>
      {correia}
      {a.caixa === 'redonda' ? (
        <>
          <circle cx={50} cy={50} r={27} fill={a.metal} stroke={shade(a.metal, -0.4)} strokeWidth={1.5} />
          {a.aro && (
            <>
              <path d="M26 50 A24 24 0 0 1 74 50" fill="none" stroke={a.aro[0]} strokeWidth={6} />
              <path d="M74 50 A24 24 0 0 1 26 50" fill="none" stroke={a.aro[1]} strokeWidth={6} />
            </>
          )}
          <circle cx={50} cy={50} r={a.aro ? 20 : 21} fill={a.mostrador} />
          {a.visor === 'lua' && (
            <>
              {[
                [40, 58, 1.1],
                [61, 61, 1.4],
                [57, 47, 0.9],
                [38, 46, 1.3],
                [48, 64, 0.9],
                [64, 52, 1],
              ].map(([x, y, r], i) => (
                <circle key={i} cx={x} cy={y} r={r} fill={a.ponteiros} opacity={0.85} />
              ))}
              <path d="M54 34 A7 7 0 1 0 54 46 A5.2 5.2 0 1 1 54 34 Z" fill={a.ponteiros} />
            </>
          )}
        </>
      ) : (
        <>
          <rect x={24} y={26} width={52} height={48} rx={7} fill={a.metal} stroke={shade(a.metal, -0.4)} strokeWidth={1.5} />
          <rect x={30} y={32} width={40} height={36} rx={3} fill={a.mostrador} />
        </>
      )}
      <rect x={a.caixa === 'redonda' ? 76 : 75} y={46} width={6} height={8} rx={2} fill={a.metal} stroke={shade(a.metal, -0.4)} strokeWidth={1} />
      {[0, 3, 6, 9].map((h) => {
        const t = (h * Math.PI) / 6;
        return <line key={h} x1={50 + Math.sin(t) * 14} y1={50 - Math.cos(t) * 14} x2={50 + Math.sin(t) * 17.5} y2={50 - Math.cos(t) * 17.5} stroke={a.ponteiros} strokeWidth={2} strokeLinecap="round" />;
      })}
      <line x1={50} y1={50} x2={41} y2={44} stroke={a.ponteiros} strokeWidth={3} strokeLinecap="round" />
      <line x1={50} y1={50} x2={62} y2={42} stroke={a.ponteiros} strokeWidth={2.2} strokeLinecap="round" />
      <circle cx={50} cy={50} r={2.2} fill={a.ponteiros} />
    </g>
  );
}

/** O vidro de esmalte e, ao lado, uma unha pintada com ele (é nela que o acabamento aparece: a francesinha, o degradê, o glitter, o cromado). */
function EsmalteArt({ a }: { a: Esmalte }) {
  const { cor, metalico, efeito } = a;
  const tinta = cor ?? '#f6d8d2';
  const cor2 = a.cor2 ?? tinta;
  const natural = '#f7dcd4';
  const id = `esm-${a.id}`;
  const VIDRO = 'M12 56 Q12 46 22 46 L36 46 Q46 46 46 56 L46 84 Q46 94 38 94 L20 94 Q12 94 12 84 Z';
  const UNHA = 'M58 78 L58 44 Q58 22 73 22 Q88 22 88 44 L88 78 Q73 86 58 78 Z';
  const cheio = efeito === 'degrade' || efeito === 'cromado' ? `url(#${id})` : efeito === 'francesinha' ? natural : tinta;
  return (
    <g>
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2={efeito === 'cromado' ? '1' : '0'} y2="0">
          {efeito === 'cromado' ? (
            <>
              <stop offset="0" stopColor={cor2} />
              <stop offset="0.45" stopColor={tinta} />
              <stop offset="0.55" stopColor="#ffffff" />
              <stop offset="1" stopColor={cor2} />
            </>
          ) : (
            <>
              <stop offset="0.1" stopColor={tinta} />
              <stop offset="0.9" stopColor={cor2} />
            </>
          )}
        </linearGradient>
        <clipPath id={`${id}-u`}>
          <path d={UNHA} />
        </clipPath>
      </defs>
      {/* o vidro, com a tampa preta e o gargalo */}
      <rect x={21} y={10} width={16} height={32} rx={4} fill="#1d1b22" />
      <rect x={24} y={40} width={10} height={8} fill="#cfcfd6" />
      <path d={VIDRO} fill={efeito === 'francesinha' ? tinta : cheio} stroke={shade(tinta, -0.3)} strokeWidth={1.5} opacity={cor ? 1 : 0.75} />
      <path d="M18 58 L18 82" stroke="#fff" strokeWidth={3.5} strokeLinecap="round" opacity={metalico ? 0.85 : 0.45} />
      {/* a unha */}
      <path d={UNHA} fill={cheio} stroke={shade(efeito === 'francesinha' ? natural : tinta, -0.3)} strokeWidth={1.5} opacity={cor ? 1 : 0.8} />
      <g clipPath={`url(#${id}-u)`}>
        {efeito === 'francesinha' && <path d="M56 40 Q73 30 90 40 L90 18 L56 18 Z" fill={tinta} />}
        {efeito === 'glitter' &&
          Array.from({ length: 16 }, (_, i) => {
            const x = 60 + ((i * 37) % 27);
            const y = 26 + ((i * 53) % 54);
            return <path key={i} d={`M${x} ${y - 2.6} L${x + 0.9} ${y - 0.9} L${x + 2.6} ${y} L${x + 0.9} ${y + 0.9} L${x} ${y + 2.6} L${x - 0.9} ${y + 0.9} L${x - 2.6} ${y} L${x - 0.9} ${y - 0.9} Z`} fill={cor2} opacity={0.55 + (i % 3) * 0.2} />;
          })}
        <path d="M64 30 L64 66" stroke="#fff" strokeWidth={3} strokeLinecap="round" opacity={metalico ? 0.7 : 0.35} />
      </g>
    </g>
  );
}

/** A mão (ou a luva) de frente: a palma, os quatro dedos e o polegar. `ate` diz até onde o pano vai em cada dedo (1 = inteiro). */
function LuvaArt({ a }: { a: Luva }) {
  const dedos: [number, number, number][] = [
    [29, 30, 9],
    [40, 22, 10],
    [52, 25, 10],
    [63, 34, 9],
  ];
  const nua = a.feitio === 'nenhuma';
  const doTraje = a.feitio === 'traje';
  const pano = nua ? PELE : doTraje ? '#4a4658' : a.cor;
  const risco = shade(pano, nua ? -0.25 : -0.4);
  const semDedos = a.feitio === 'sem-dedos' || a.feitio === 'tatica';
  const corte = 44;
  const metal = a.cor3 ?? '#e0ad3e';
  if (a.feitio === 'renda' || a.feitio === 'opera' || a.feitio === 'manopla') {
    // as inteiras de feitio próprio: a de renda (a pele aparece pelos furos), a comprida e a de placas
    const comprida = a.feitio === 'opera';
    const m = comprida ? 0.82 : 1;
    const y0 = comprida ? 2 : 0;
    const mao = (
      <g>
        <path d="M30 62 Q14 56 12 42 Q13 34 21 38 Q24 50 34 54 Z" />
        {dedos.map(([x, y, w], i) => (
          <rect key={i} x={x} y={y} width={w} height={64 - y} rx={w / 2} />
        ))}
        <path d="M27 56 L74 56 Q76 78 68 86 L34 86 Q26 78 27 56 Z" />
      </g>
    );
    return (
      <g transform={`translate(${comprida ? 9 : 0} ${y0}) scale(${m})`} strokeLinejoin="round">
        <defs>
          <pattern id={`renda-${a.id}`} width={7} height={7} patternUnits="userSpaceOnUse">
            <rect width={7} height={7} fill={a.cor} />
            <circle cx={3.5} cy={3.5} r={2.1} fill={PELE} />
            <circle cx={0} cy={0} r={1} fill={PELE} />
            <circle cx={7} cy={7} r={1} fill={PELE} />
          </pattern>
        </defs>
        <g fill={a.feitio === 'renda' ? `url(#renda-${a.id})` : a.feitio === 'manopla' ? a.cor2 : a.cor} stroke={risco} strokeWidth={1.4}>
          {mao}
        </g>
        {comprida && (
          <>
            <path d="M34 86 L68 86 L72 118 L30 118 Z" fill={a.cor} stroke={risco} strokeWidth={1.4} />
            <rect x={29} y={114} width={44} height={6} rx={2} fill={a.cor2} stroke={risco} strokeWidth={1} />
            {[90, 95, 100].map((y) => (
              <path key={y} d={`M35 ${y} Q51 ${y + 3} 67 ${y}`} fill="none" stroke={a.cor2} strokeWidth={1.2} />
            ))}
            <path d="M44 30 L44 80" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" opacity={0.3} />
          </>
        )}
        {a.feitio === 'renda' && <rect x={32} y={84} width={38} height={9} rx={3} fill={a.cor} stroke={a.cor2} strokeWidth={1.4} />}
        {a.feitio === 'manopla' && (
          <g stroke={shade(a.cor, -0.45)} strokeWidth={1.1}>
            {/* as placas: três em cada dedo, a das costas da mão e o punho em sino */}
            {dedos.map(([x, y, w], i) =>
              [0, 1, 2].map((k) => {
                const h = (60 - y) / 3;
                return <rect key={`${i}-${k}`} x={x - 0.6} y={y + k * h + 1} width={w + 1.2} height={h - 2} rx={3} fill={a.cor} />;
              }),
            )}
            <path d="M31 62 Q17 56 15 44 Q17 39 21 41 Q25 51 34 56 Z" fill={a.cor} />
            <path d="M30 64 L72 64 Q72 78 66 83 L36 83 Q29 78 30 64 Z" fill={a.cor} />
            <rect x={28} y={59} width={46} height={5.5} rx={2.5} fill={metal} />
            <path d="M35 84 L67 84 L76 98 L26 98 Z" fill={a.cor} />
            <rect x={25} y={95} width={52} height={4.5} rx={2} fill={metal} />
          </g>
        )}
      </g>
    );
  }
  return (
    <g stroke={risco} strokeWidth={1.4} strokeLinejoin="round" strokeDasharray={doTraje ? '4 3' : undefined}>
      {/* o polegar */}
      <path d="M30 62 Q14 56 12 42 Q13 34 21 38 Q24 50 34 54 Z" fill={pano} />
      {semDedos && <path d="M12 42 Q13 34 21 38 Q20 42 16 46 Z" fill={PELE} stroke={shade(PELE, -0.25)} />}
      {dedos.map(([x, y, w], i) => (
        <g key={i}>
          <rect x={x} y={y} width={w} height={64 - y} rx={w / 2} fill={pano} />
          {semDedos && <path d={`M${x} ${corte} L${x} ${y + w / 2} Q${x} ${y} ${x + w / 2} ${y} Q${x + w} ${y} ${x + w} ${y + w / 2} L${x + w} ${corte} Z`} fill={PELE} stroke={shade(PELE, -0.25)} />}
        </g>
      ))}
      {/* a palma e o punho */}
      <path d="M27 56 L74 56 Q76 78 68 86 L34 86 Q26 78 27 56 Z" fill={pano} />
      {!nua && <rect x={32} y={84} width={38} height={10} rx={3} fill={doTraje ? '#5a566a' : a.cor2} />}
      {!nua && !doTraje && a.feitio === 'inteira' && [40, 51, 62].map((x) => <line key={x} x1={x} y1={60} x2={x - (51 - x) * 0.25 + 0} y2={80} stroke={a.cor2} strokeWidth={1.6} strokeLinecap="round" />)}
      {/* a de meio dedo: os reforços dos nós, a abertura nas costas da mão e a tira com o botão */}
      {a.feitio === 'sem-dedos' && dedos.map(([x, , w], i) => <rect key={i} x={x + w / 2 - 2.6} y={52} width={5.2} height={9} rx={2.6} fill={a.cor2} stroke="none" />)}
      {a.feitio === 'sem-dedos' && <ellipse cx={51} cy={70} rx={10} ry={6.5} fill={PELE} stroke={a.cor2} strokeWidth={1.8} strokeDasharray="none" />}
      {/* a tática: a placa dos nós, de um lado ao outro, e as talas dos dedos */}
      {a.feitio === 'tatica' && <rect x={27} y={53} width={47} height={9} rx={4.5} fill={a.cor2} stroke="none" />}
      {a.feitio === 'tatica' && [40, 51, 62].map((x) => <circle key={x} cx={x} cy={72} r={2.2} fill={metal} stroke="none" />)}
      {semDedos && <rect x={31} y={80} width={40} height={5.5} rx={2} fill={a.cor2} stroke="none" />}
      {semDedos && <circle cx={60} cy={82.7} r={2.6} fill={metal} stroke="none" />}
    </g>
  );
}

export function AcessorioArt({ a, size }: { a: Acessorio; size: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={a.nome}>
      {a.tipo === 'anel' && <AnelArt a={a} />}
      {a.tipo === 'pulseira' && <PulseiraArt a={a} />}
      {a.tipo === 'relogio' && <RelogioArt a={a} />}
      {a.tipo === 'esmalte' && <EsmalteArt a={a} />}
      {a.tipo === 'luva' && <LuvaArt a={a} />}
    </svg>
  );
}
