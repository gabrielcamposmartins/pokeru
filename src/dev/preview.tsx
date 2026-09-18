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
 *   &ui=victorian                      com o tema vitoriano
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
import { CHARACTER_PRESETS } from '../../shared/styles';
import { STAGE_H, STAGE_W } from '../game/layout';
import { MatchEndPanel, type MatchRow } from '../game/MatchEnd';
import { RoundResultPanel } from '../game/RoundResult';
import type { RoundResult } from '../store/table';

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
  won: 1240,
  stack: 3240,
  split: [],
  winFx: 'fire',
};

const SCENES: Record<string, RoundResult> = {
  result: base,
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

const cena = q.get('cena') ?? 'result';
const matchRows = MATCHES[cena];
const scene = SCENES[cena] ?? base;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="always">
      <div className="game-screen">
        <div className="stage-wrap">
          <div className="stage" style={{ width: STAGE_W, height: STAGE_H, background: 'radial-gradient(ellipse at 50% 40%, #3a1418 0%, #0e0506 75%)' }}>
            {matchRows ? <MatchEndPanel m={{ id: 1, kind: 'over' }} rows={matchRows} info="Treino Offline · Sit & Go · 18 mãos" /> : <RoundResultPanel r={scene} />}
          </div>
        </div>
      </div>
    </MotionConfig>
  </StrictMode>,
);

// medição das caixas (para depurar o layout): /preview.html?cena=…&rects=1
if (q.has('rects')) {
  setTimeout(() => {
    const pick = ['.stage', '.round-result', '.rr-info', '.rr-cards', '.rr-hand', '.rr-bottom', '.rr-char', '.rr-total'];
    const out = pick.map((sel) => {
      const el = document.querySelector(sel);
      if (!el) return `${sel}: —`;
      const r = el.getBoundingClientRect();
      return `${sel}: x=${Math.round(r.x)} y=${Math.round(r.y)} w=${Math.round(r.width)} h=${Math.round(r.height)}`;
    });
    const pre = document.createElement('pre');
    pre.id = 'rects';
    pre.textContent = out.join('\n');
    document.body.appendChild(pre);
  }, 800);
}
