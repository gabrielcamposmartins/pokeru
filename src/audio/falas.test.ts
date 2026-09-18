import { describe, expect, it } from 'vitest';
import { CHARACTER_PRESETS } from '../../shared/styles';
import { COMUM_SLOTS, FALA_SLOTS } from './voice';
import { FALA_MOMENTO, comumText, falaText } from './falas';

describe('texto das falas', () => {
  it('cada personagem tem o texto e a tradução de todos os momentos', () => {
    for (const c of CHARACTER_PRESETS) {
      for (const slot of FALA_SLOTS) {
        const fala = falaText(c.id, slot);
        expect(fala, `${c.id} ${slot}`).toBeTruthy();
        expect(fala!.text, `${c.id} ${slot}`).toBeTruthy();
        expect(fala!.pt, `${c.id} ${slot}`).toBeTruthy();
      }
    }
  });

  it('a fala sai com a tradução do comentário da linha', () => {
    expect(falaText('marina', 'allin')).toEqual({ text: '一か八か！フェニックスは退かないよ！', pt: 'Tudo ou nada! A fênix não recua!' });
  });

  it('as chamadas comuns também têm texto', () => {
    for (const slot of COMUM_SLOTS) expect(comumText(slot)?.pt, slot).toBeTruthy();
    expect(comumText('flush')?.pt).toBe('Flush!');
  });

  it('as linhas de chave do .jsonc não entram como fala', () => {
    // "personagem": "Marina" não é uma fala: o nome não pode aparecer em nenhum slot
    for (const c of CHARACTER_PRESETS) {
      for (const slot of FALA_SLOTS) expect(falaText(c.id, slot)!.text, `${c.id} ${slot}`).not.toBe(c.name);
    }
  });

  it('todo momento tem rótulo em português', () => {
    for (const slot of FALA_SLOTS) expect(FALA_MOMENTO[slot], slot).toBeTruthy();
  });
});
