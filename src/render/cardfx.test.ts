import { describe, expect, it } from 'vitest';
import { DEFAULT_WIN_FX, WIN_FX_IDS, sanitizeCosmetics, sanitizeWinFx } from '../../shared/styles';
import { MISSING_WIN_FX, WIN_FX, findWinFx } from './cardfx';

describe('efeitos das cartas vencedoras', () => {
  it('todo id da rede tem entrada no catálogo (e vice-versa)', () => {
    expect(MISSING_WIN_FX).toEqual([]);
    expect(WIN_FX.map((f) => f.id).sort()).toEqual([...WIN_FX_IDS].sort());
  });

  it('cada efeito tem nome, descrição e duas cores', () => {
    for (const f of WIN_FX) {
      expect(f.name, f.id).toBeTruthy();
      expect(f.description, f.id).toBeTruthy();
      expect(f.colors, f.id).toHaveLength(2);
      for (const c of f.colors) expect(c, `${f.id} ${c}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('id desconhecido cai no efeito padrão', () => {
    expect(findWinFx('nao-existe').id).toBe(DEFAULT_WIN_FX);
    expect(findWinFx(undefined).id).toBe(DEFAULT_WIN_FX);
    expect(findWinFx('fire').id).toBe('fire');
  });

  it('o que vem da rede é sanitizado', () => {
    expect(sanitizeWinFx('ice')).toBe('ice');
    expect(sanitizeWinFx('<script>')).toBe(DEFAULT_WIN_FX);
    expect(sanitizeWinFx(undefined)).toBe(DEFAULT_WIN_FX);
    expect(sanitizeCosmetics({ winFx: 'lightning' }).winFx).toBe('lightning');
    expect(sanitizeCosmetics({}).winFx).toBe(DEFAULT_WIN_FX);
  });
});
