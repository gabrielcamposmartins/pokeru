import { describe, expect, it } from 'vitest';
import type { TableView } from '../../shared/protocol';
import { CHARACTER_PRESETS, DEFAULT_WIN_FX } from '../../shared/styles';
import { buildMatchRows, pagesOf, type MatchRow } from './MatchEnd';

/** Mesa de teste: `n` assentos, o meu é `mySeat`, com as fichas dadas. */
function view(stacks: number[], mySeat: number): TableView {
  return {
    mySeat,
    handNo: 9,
    seats: stacks.map((stack, seat) => ({
      seat,
      id: `p${seat}`,
      name: `P${seat + 1}`,
      isBot: seat !== mySeat,
      avatar: { color: '#fff', icon: '♠' },
      cosmetics: { back: {}, character: CHARACTER_PRESETS[seat % CHARACTER_PRESETS.length], winFx: DEFAULT_WIN_FX },
      stack,
      bet: 0,
      inHand: true,
      folded: false,
      allIn: false,
      cards: [],
      lastAction: null,
    })),
  } as unknown as TableView;
}

const row = (place: number, isMe = false): MatchRow => ({
  place,
  name: `P${place}`,
  character: CHARACTER_PRESETS[0],
  frame: 'ouro',
  stack: 1000 * place,
  delta: 0,
  isMe,
  isBot: !isMe,
});

describe('placar de fim de partida', () => {
  it('sem classificação, ordena pelas fichas', () => {
    const rows = buildMatchRows(view([1200, 5000, 800], 0), null, 2000);
    expect(rows.map((r) => [r.place, r.stack])).toEqual([
      [1, 5000],
      [2, 1200],
      [3, 800],
    ]);
    expect(rows.find((r) => r.isMe)?.place).toBe(2);
    expect(rows.find((r) => r.isMe)?.delta).toBe(-800); // 1200 − 2000 de fichas iniciais
  });

  it('com classificação do Sit & Go, usa as posições dela', () => {
    const rows = buildMatchRows(view([0, 6000, 1000], 2), [
      { name: 'P2', place: 1, seat: 1 },
      { name: 'P3', place: 2, seat: 2 },
      { name: 'P1', place: 3, seat: 0 },
    ], 2000);
    expect(rows.map((r) => [r.place, r.name])).toEqual([
      [1, 'P2'],
      [2, 'P3'],
      [3, 'P1'],
    ]);
    expect(rows[1].isMe).toBe(true);
  });

  it('até quatro jogadores, uma página só', () => {
    expect(pagesOf([row(1, true), row(2), row(3), row(4)])).toHaveLength(1);
  });

  it('mais de quatro: páginas de quatro quando você está no topo', () => {
    const rows = [row(1), row(2, true), row(3), row(4), row(5), row(6)];
    const pages = pagesOf(rows);
    expect(pages.map((p) => p.map((r) => r.place))).toEqual([
      [1, 2, 3, 4],
      [5, 6],
    ]);
  });

  it('fora do top 4: a primeira página mostra 1º, 2º, 3º e você, com a posição real', () => {
    const rows = [row(1), row(2), row(3), row(4), row(5), row(6, true)];
    const pages = pagesOf(rows);
    expect(pages[0].map((r) => r.place)).toEqual([1, 2, 3, 6]);
    expect(pages[0][3].isMe).toBe(true);
    // as páginas seguintes continuam a partir do 3º
    expect(pages[1].map((r) => r.place)).toEqual([3, 4, 5, 6]);
  });
});
