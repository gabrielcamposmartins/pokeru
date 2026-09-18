import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { findCharacter } from '../../shared/styles';
import { BOND_MAX, BOND_POINTS, HEARTS, HEART_COST, bondLevel, rewardAt } from './bond';
import { BondBarView, BondHearts, BondUnlockCard } from './BondBar';

const marina = findCharacter('marina');

/** Larguras dos retângulos de corte: uma por coração desenhado (0 = vazio, 24 = cheio). */
function clips(html: string): number[] {
  return [...html.matchAll(/<rect x="0" y="0" width="([\d.]+)"/g)].map((m) => Number(m[1]));
}

describe('corações do vínculo', () => {
  it('desenha cinco corações, com o atual preenchido em parte', () => {
    const html = renderToStaticMarkup(<BondHearts hearts={2} progress={0.5} />);
    expect(html.match(/class="bond-heart bond-(full|part|void)"/g)).toEqual([
      'class="bond-heart bond-full"',
      'class="bond-heart bond-full"',
      'class="bond-heart bond-part"',
      'class="bond-heart bond-void"',
      'class="bond-heart bond-void"',
    ]);
    expect(html.match(/class="bond-heart bond-/g)).toHaveLength(HEARTS);
    // dois cheios, o terceiro pela metade; os vazios não desenham corte
    expect(clips(html)).toEqual([24, 24, 12]);
  });

  it('a barra mostra o que falta para o próximo coração', () => {
    const html = renderToStaticMarkup(<BondBarView lv={bondLevel(BOND_POINTS.win)} />);
    expect(html).toContain(`${BOND_POINTS.win} / ${HEART_COST[0]} para o 1º coração`);
  });

  it('a barra avisa quando o vínculo está completo', () => {
    expect(renderToStaticMarkup(<BondBarView lv={bondLevel(BOND_MAX)} />)).toContain('Vínculo completo');
  });

  it('o anúncio diz de quem é o coração e o que ele deu', () => {
    const html = renderToStaticMarkup(<BondUnlockCard u={{ id: 1, char: 'marina', heart: 1 }} onDone={() => {}} />);
    expect(html).toContain('1º coração com Marina');
    expect(html).toContain(rewardAt(marina, 1)!.name);
  });
});
