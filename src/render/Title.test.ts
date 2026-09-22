import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, titleTier } from '../../shared/achievements';
import { titleColor } from './Title';

/**
 * O título é pintado pelo grau da conquista que o liberou — é o que separa um "Novato da Mesa" de
 * um "Tubarão" na tela. Duas coisas não podem escapar: conquista sem grau, e grau sem cor.
 */
describe('cor do título', () => {
  it('toda conquista tem grau, e todo grau tem cor', () => {
    for (const a of ACHIEVEMENTS) {
      expect(a.tier, a.id).toBeGreaterThanOrEqual(1);
      expect(a.tier, a.id).toBeLessThanOrEqual(5);
      expect(titleColor(a.title), a.title).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('quanto mais difícil, outra cor — o comum e o lendário não se confundem', () => {
    expect(titleColor('Novato da Mesa')).not.toBe(titleColor('Tubarão'));
    expect(titleTier('Novato da Mesa')).toBe(1);
    expect(titleTier('Tubarão')).toBe(5);
    // mesmo grau, mesma cor
    expect(titleColor('Tubarão')).toBe(titleColor('Imbatível'));
  });

  it('título que saiu da lista não quebra a tela: vale como comum', () => {
    expect(titleTier('Título Que Não Existe')).toBe(1);
    expect(titleColor(null)).toBe(titleColor('Novato da Mesa'));
  });
});
