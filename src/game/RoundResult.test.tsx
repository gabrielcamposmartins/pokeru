import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CHARACTER_PRESETS } from '../../shared/styles';
import { useTable, type RoundResult } from '../store/table';
import { RoundResultPanel, RoundResultScreen } from './RoundResult';

const hole = [
  { r: 14, s: 's' as const },
  { r: 14, s: 'c' as const },
];
const board = [
  { r: 14, s: 'd' as const },
  { r: 9, s: 'c' as const },
  { r: 9, s: 'h' as const },
];

const result: RoundResult = {
  id: 1,
  seat: 0,
  name: 'Jogador',
  character: CHARACTER_PRESETS[0],
  hole,
  board,
  best: [...hole, ...board],
  handName: 'Full House, Áses com Noves',
  pots: [
    { label: 'Pote principal', amount: 1240 },
    { label: 'Pote 2', amount: 320 },
  ],
  payers: [
    { name: 'Ren', character: CHARACTER_PRESETS[1], amount: 620 },
    { name: 'Tobi', character: CHARACTER_PRESETS[2], amount: 380 },
  ],
  won: 1560,
  stack: 3540,
  split: ['Ren'],
  winFx: 'fire',
};

describe('tela de fim de round', () => {
  beforeEach(() => useTable.getState().setResult(null));

  it('sem resultado, não desenha nada', () => {
    expect(renderToStaticMarkup(<RoundResultScreen />)).toBe('');
  });

  it('mostra personagem, mão, potes e fichas', () => {
    const html = renderToStaticMarkup(<RoundResultPanel r={result} />);
    expect(html).toContain('Full House, Áses com Noves');
    expect(html).toContain('Jogador');
    expect(html).toContain(CHARACTER_PRESETS[0].title);
    expect(html).toContain(CHARACTER_PRESETS[0].full); // ilustração de corpo inteiro
    expect(html).toContain('Pote principal');
    expect(html).toContain('Pote 2');
    // quem pagou o vencedor nesta mão
    expect(html).toContain('Quem pagou');
    expect(html).toContain('Ren');
    expect(html).toContain('620');
    expect(html).toContain('Tobi');
    expect(html).toContain('380');
    expect(html).toContain('+1.560'); // ganho do round
    expect(html).toContain('3.540'); // fichas depois de receber
    expect(html).toContain('Pote dividido com Ren');
    expect(html).toContain('Continuar');
    // as 5 cartas da mão feita, cada uma com o efeito do vencedor
    expect(html.match(/class="cardv/g)).toHaveLength(5);
    expect(html.match(/card-fx fx-fire/g)).toHaveLength(5);
  });

  it('cartas do jogador fora da mão feita saem apagadas e sem efeito', () => {
    const html = renderToStaticMarkup(<RoundResultPanel r={{ ...result, best: board, board }} />);
    expect(html.match(/card-dim/g)).toHaveLength(2);
    expect(html.match(/card-fx fx-fire/g)).toHaveLength(3);
  });
});
