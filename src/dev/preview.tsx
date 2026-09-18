/**
 * Página de apoio para desenvolvimento (não entra no app): abre /preview.html?cena=…
 * e desenha uma cena do palco parada, para conferir o layout sem jogar uma mão.
 *
 *   /preview.html?cena=result          fim de round (showdown)
 *   /preview.html?cena=match           fim de partida (4 jogadores)
 *   /preview.html?cena=match-6         fim de partida com 6 (duas páginas)
 *   /preview.html?cena=match-me6       você em 6º (1º, 2º, 3º e você no 4º lugar da lista)
 *   /preview.html?cena=result-board    mão feita só com o bordo (5 cartas na mesa)
 *   /preview.html?cena=result-long     nome de mão comprido e pote dividido
 *   /preview.html?cena=result-pays     mesa cheia: cinco jogadores pagaram o vencedor
 *   /preview.html?cena=solids          cartas e fichas de perto (volume)
 *   /preview.html?cena=mesa            a mesa parada (cartas deitadas no plano e fichas em pe)
 *   /preview.html?cena=voo&motion=1    voo das fichas (arco, giro e quicada)
 *   /preview.html?cena=bond            a página de vínculo (missões e recompensas com as falas)
 *   /preview.html?cena=bond-aviso      o cartão do coração completo e a barra curta
 *   /preview.html?cena=personagens     a tela de personagens inteira (ocupa a janela, sem palco)
 *   &motion=1                          liga as animacoes; &ui=victorian usa o tema vitoriano
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import '@fontsource/m-plus-rounded-1c/400.css';
import '@fontsource/m-plus-rounded-1c/500.css';
import '@fontsource/m-plus-rounded-1c/700.css';
import '@fontsource/m-plus-rounded-1c/800.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';
import '@fontsource/cinzel-decorative/700.css';
import '@fontsource/cinzel-decorative/900.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/600-italic.css';
import '@fontsource/cormorant-garamond/700.css';
import '@fontsource/cormorant-garamond/700-italic.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/playfair-display/800.css';
import '@fontsource/playfair-display/900.css';
import '@fontsource/playfair-display/900-italic.css';
import '../styles/global.css';
import '../styles/cardfx.css';
import '../styles/victorian.css';
import { CHARACTER_PRESETS, TABLE_PRESETS } from '../../shared/styles';
import { CARD_W, STAGE_H, STAGE_W, betSpot, boardSlot, holeCardPos, planeStyle, project, seatLayout } from '../game/layout';
import { CardView } from '../render/CardArt';
import { ChipStack } from '../render/Chip';
import { TableFelt } from '../render/TableFelt';
import { FlyersLayer } from '../game/Flyers';
import { BondBarView, BondUnlockCard } from '../game/BondBar';
import { BondPageView } from '../game/BondPage';
import { HEART_COST, bondLevel } from '../game/bond';
import { EMPTY_BOND, useBond } from '../store/bond';
import { MatchEndPanel, type MatchRow } from '../game/MatchEnd';
import { CharactersScreen } from '../screens/Characters';
import { RoundResultPanel } from '../game/RoundResult';
import { nextId, useTable, type RoundResult } from '../store/table';

const q = new URLSearchParams(location.search);
document.documentElement.dataset.ui = q.get('ui') ?? 'default';

const hole = [
  { r: 14, s: 's' as const },
  { r: 14, s: 'c' as const },
];
const board = [
  { r: 14, s: 'd' as const },
  { r: 9, s: 'c' as const },
  { r: 9, s: 'h' as const },
];
const fullBoard = [
  { r: 10, s: 'h' as const },
  { r: 11, s: 'h' as const },
  { r: 12, s: 'h' as const },
  { r: 13, s: 'h' as const },
  { r: 14, s: 'h' as const },
];

const base: RoundResult = {
  id: 1,
  seat: 0,
  name: 'Jogador',
  character: CHARACTER_PRESETS[0],
  hole,
  board,
  best: [...hole, ...board],
  handName: 'Full House, Áses com Noves',
  pots: [{ label: 'Pote principal', amount: 1240 }],
  payers: [
    { name: 'Ren', character: CHARACTER_PRESETS[1], amount: 620 },
    { name: 'Tobi', character: CHARACTER_PRESETS[2], amount: 380 },
    { name: 'Yukina', character: CHARACTER_PRESETS[3], amount: 240 },
  ],
  won: 1240,
  stack: 3240,
  split: [],
  winFx: 'fire',
};

const SCENES: Record<string, RoundResult> = {
  result: base,
  'result-pays': {
    ...base,
    winFx: 'lightning',
    payers: ['Ren', 'Tobi', 'Yukina', 'Marina 2', 'Ren 2'].map((name, i) => ({
      name,
      character: CHARACTER_PRESETS[(i + 1) % CHARACTER_PRESETS.length],
      amount: 620 - i * 110,
    })),
    won: 2100,
    stack: 5100,
  },
  'result-board': { ...base, hole, board: fullBoard, best: fullBoard, handName: 'Royal Straight Flush', winFx: 'holy', character: CHARACTER_PRESETS[3] },
  'result-long': {
    ...base,
    handName: 'Dois Pares, Reis e Noves',
    pots: [
      { label: 'Pote principal', amount: 1240 },
      { label: 'Pote 2', amount: 320 },
      { label: 'Pote 3', amount: 80 },
    ],
    won: 1640,
    stack: 12480,
    payers: [
      { name: 'Tobi', character: CHARACTER_PRESETS[2], amount: 820 },
      { name: 'Yukina', character: CHARACTER_PRESETS[3], amount: 500 },
      { name: 'Marina 2', character: CHARACTER_PRESETS[0], amount: 320 },
    ],
    split: ['Ren', 'Yukina 2'],
    winFx: 'ice',
    character: CHARACTER_PRESETS[1],
  },
};

const NAMES = ['Jogador', 'Ren', 'Yukina', 'Tobi', 'Marina 2', 'Ren 2'];

/** Placar de exemplo: `n` jogadores, você em `mePlace`. */
function rows(n: number, mePlace: number): MatchRow[] {
  return Array.from({ length: n }, (_, i) => {
    const p = i + 1;
    const stack = 6400 - i * 1100;
    return {
      place: p,
      name: p === mePlace ? 'Jogador' : NAMES[(i + 1) % NAMES.length],
      character: CHARACTER_PRESETS[i % CHARACTER_PRESETS.length],
      stack: Math.max(0, stack),
      delta: Math.max(0, stack) - 2000,
      isMe: p === mePlace,
      isBot: p !== mePlace,
    };
  });
}

const MATCHES: Record<string, MatchRow[]> = {
  match: rows(4, 1),
  'match-6': rows(6, 2),
  'match-me6': rows(6, 6),
};

/**
 * Voo das fichas (com ?motion=1): o arremesso de verdade, para conferir que os quadros-chave
 * do framer rodam. Com &rects=1 a página imprime onde cada pilha parou.
 */
function Voo() {
  const t = useTable.getState();
  if (t.flyers.length === 0) {
    t.addFlyer({ id: nextId(), kind: 'chips', space: 'screen', from: { x: 300, y: 700 }, to: { x: 700, y: 420 }, dur: 900, amount: 480, arc: 26, spin: 12, bounce: 8 });
    t.addFlyer({ id: nextId(), kind: 'chips', space: 'screen', from: { x: 1300, y: 700 }, to: { x: 900, y: 420 }, dur: 900, amount: 120 });
    // uma carta, para comparar com o voo das cartas (que não tem quicada)
    t.addFlyer({ id: nextId(), kind: 'card', space: 'screen', from: { x: 800, y: 760 }, to: { x: 800, y: 300 }, dur: 900, width: 80, card: { r: 14, s: 's' }, faceUp: true });
  }
  return <FlyersLayer space="screen" />;
}

/** A mesa parada: cartas deitadas no plano inclinado, fichas em pé e a minha mão. */
function Mesa() {
  const table = TABLE_PRESETS[0];
  const geo = seatLayout(6, 0, true);
  const bets = [1, 2, 4].map((seat) => ({ seat, amount: 120 * seat }));
  return (
    <div className="table-stage">
      <div className="floor-plane" style={planeStyle(3200, 2200, 1600, 1100)} />
      <div className="table-plane" style={planeStyle()}>
        <TableFelt st={table} showSlots={false} />
        {fullBoard.map((c, i) => {
          const p = boardSlot(i);
          return (
            <div key={i} className="board-card" style={{ left: p.x - CARD_W / 2, top: p.y - (CARD_W * 1.4) / 2 }}>
              <CardView card={c} width={CARD_W} />
            </div>
          );
        })}
        {[1, 4].map((seat) => {
          const g = geo[seat];
          const hp = holeCardPos(g, 0);
          return (
            <div key={seat} className="hole-card" style={{ left: hp.p.x - g.cardW / 2, top: hp.p.y - (g.cardW * 1.4) / 2, transform: `rotate(${hp.rot}deg)` }}>
              <CardView card={null} faceUp={false} width={g.cardW} />
            </div>
          );
        })}
      </div>
      {bets.map(({ seat, amount }) => {
        const p = project(betSpot(geo[seat].bet, seat, 'flop'));
        return (
          <div key={seat} className="seat-bet" style={{ left: p.x, top: p.y, transform: `scale(${p.s})` }}>
            <div className="seat-bet-inner">
              <ChipStack amount={amount} size={32} maxCols={3} seed={seat * 13 + 1} />
            </div>
          </div>
        );
      })}
      <div className="my-hand">
        {hole.map((c, i) => (
          <div key={i} className="my-card" style={{ left: (i === 0 ? -1 : 1) * 80 - 68, transform: `rotate(${i === 0 ? -6 : 6}deg)` }}>
            <CardView card={c} width={136} />
          </div>
        ))}
      </div>
    </div>
  );
}

const bondStats = { ...EMPTY_BOND, points: HEART_COST[0] + HEART_COST[1] * 0.45, wins: 23, losses: 31, folds: 62, hands: 116, matches: 7 };

/** A página de vínculo, com as missões e as recompensas abertas. */
function Vinculo() {
  return <BondPageView char={CHARACTER_PRESETS[0]} st={bondStats} onClose={() => {}} />;
}

/** O aviso do coração completo e a barra curta da placa do personagem. */
function VinculoAviso() {
  const char = CHARACTER_PRESETS[0];
  return (
    <div className="preview-bond">
      <div className="char-nameplate" style={{ position: 'relative', left: 0, bottom: 0 }}>
        <small>{char.title}</small>
        <b>{char.name}</b>
        <BondBarView lv={bondLevel(bondStats.points)} size={16} compact />
      </div>
      <BondUnlockCard u={{ id: 1, char: char.id, heart: 2 }} onDone={() => {}} />
    </div>
  );
}

/** Cartas e fichas de perto, para conferir o volume. */
function Solids() {
  return (
    <div className="preview-solids">
      <div className="row gap" style={{ gap: 34, alignItems: 'flex-end' }}>
        <CardView card={{ r: 14, s: 's' }} width={230} />
        <CardView card={{ r: 12, s: 'h' }} width={230} />
        <CardView card={null} faceUp={false} width={230} />
        <CardView card={{ r: 7, s: 'd' }} width={140} />
        <CardView card={{ r: 3, s: 'c' }} width={88} />
      </div>
      <div className="row gap" style={{ alignItems: 'flex-end', gap: 56 }}>
        <ChipStack amount={25} size={110} />
        <ChipStack amount={180} size={110} />
        <ChipStack amount={1250} size={78} />
        <ChipStack amount={26_600} size={48} />
        <ChipStack amount={640} size={32} />
      </div>
    </div>
  );
}

const cena = q.get('cena') ?? 'result';
// a tela de personagens lê o vínculo salvo: semeia um progresso para os corações aparecerem
if (cena === 'personagens') {
  for (const [char, wins] of [['marina', 9], ['ren', 3], ['tobi', 24]] as const) {
    for (let i = 0; i < wins; i++) useBond.getState().award(char, 'win');
  }
}
const matchRows = MATCHES[cena];
const scene = SCENES[cena] ?? base;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion={q.has('motion') ? 'never' : 'always'}>
      {cena === 'personagens' ? (
        <CharactersScreen onBack={() => {}} />
      ) : (
      <div className="game-screen">
        <div className="stage-wrap">
          <div className="stage" style={{ width: STAGE_W, height: STAGE_H, background: 'radial-gradient(ellipse at 50% 40%, #3a1418 0%, #0e0506 75%)' }}>
            {cena === 'voo' ? (
              <Voo />
            ) : cena === 'mesa' ? (
              <Mesa />
            ) : cena === 'bond' ? (
              <Vinculo />
            ) : cena === 'bond-aviso' ? (
              <VinculoAviso />
            ) : cena === 'solids' ? (
              <Solids />
            ) : matchRows ? (
              <MatchEndPanel m={{ id: 1, kind: 'over' }} rows={matchRows} info="Treino Offline · Sit & Go · 18 mãos" />
            ) : (
              <RoundResultPanel r={scene} />
            )}
          </div>
        </div>
      </div>
      )}
    </MotionConfig>
  </StrictMode>,
);

// medição das caixas (para depurar o layout): /preview.html?cena=…&rects=1
// &rects=<seletores separados por vírgula> mede outras caixas (todas as que casarem)
if (q.has('rects')) {
  setTimeout(() => {
    const asked = (q.get('rects') ?? '').split(',').filter((s) => s && s !== '1');
    const pick = asked.length ? asked : ['.stage', '.round-result', '.rr-info', '.rr-cards', '.rr-hand', '.rr-bottom', '.rr-char', '.rr-total', '.flyer', '.flyer + .flyer', '.flyer + .flyer + .flyer'];
    const out = pick.flatMap((sel) => {
      const els = [...document.querySelectorAll(sel)];
      if (!els.length) return [`${sel}: —`];
      return els.map((el, i) => {
        const r = el.getBoundingClientRect();
        return `${sel}${els.length > 1 ? `[${i}]` : ''}: x=${Math.round(r.x)} y=${Math.round(r.y)} w=${Math.round(r.width)} h=${Math.round(r.height)}`;
      });
    });
    const pre = document.createElement('pre');
    pre.id = 'rects';
    pre.textContent = out.join('\n');
    document.body.appendChild(pre);
  }, 800);
}
