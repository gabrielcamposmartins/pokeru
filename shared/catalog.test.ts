import { describe, expect, it } from 'vitest';
import {
  CATALOG,
  FREE_KEYS,
  PADO_POR_FICHA,
  findItem,
  freeIdOf,
  isFree,
  itemKey,
  itemsOfKind,
  owns,
  padoPrice,
  priceOf,
} from './catalog';
import { BACK_PRESETS, CHARACTER_PRESETS, CHIP_PRESETS, FACE_PRESETS, TABLE_PRESETS, WIN_FX_IDS } from './styles';

describe('catálogo da loja', () => {
  it('cobre tudo que existe no jogo, uma vez cada', () => {
    const esperado =
      CHARACTER_PRESETS.length + WIN_FX_IDS.length + FACE_PRESETS.length + BACK_PRESETS.length + CHIP_PRESETS.length + TABLE_PRESETS.length + 2;
    expect(CATALOG).toHaveLength(esperado);
    expect(new Set(CATALOG.map((i) => i.key)).size).toBe(CATALOG.length);
  });

  it('o jogador começa com Marina, Tobi e um jogo completo de mesa', () => {
    expect(owns([], 'character:marina')).toBe(true);
    expect(owns([], 'character:tobi')).toBe(true);
    expect(owns([], 'character:ren')).toBe(false);
    expect(owns([], 'character:yukina')).toBe(false);
    // e o suficiente para sentar: carta, verso, ficha, mesa, efeito e interface
    for (const kind of ['face', 'back', 'chip', 'table', 'winfx', 'ui'] as const) {
      expect(freeIdOf(kind), kind).toBeTruthy();
      expect(isFree(itemKey(kind, freeIdOf(kind))), kind).toBe(true);
    }
  });

  it('o que é grátis custa zero e o resto tem preço nas duas moedas', () => {
    for (const item of CATALOG) {
      if (isFree(item.key)) {
        expect(item.chips, item.key).toBe(0);
        expect(priceOf(item.key, 'chips'), item.key).toBe(0);
        expect(priceOf(item.key, 'pado'), item.key).toBe(0);
      } else {
        expect(item.chips, item.key).toBeGreaterThan(0);
        expect(priceOf(item.key, 'pado'), item.key).toBe(padoPrice(item.chips));
        expect(priceOf(item.key, 'pado')!, item.key).toBeGreaterThan(0);
      }
    }
  });

  it('padocoin custa o dobro da ficha: é dinheiro de verdade, não o caminho barato', () => {
    expect(padoPrice(15_000)).toBe(15_000 * PADO_POR_FICHA);
    expect(priceOf('character:ren', 'pado')).toBe(30_000);
    expect(priceOf('character:ren', 'chips')).toBe(15_000);
    // e sempre mais caro que em fichas, item a item
    for (const item of CATALOG.filter((i) => i.chips > 0)) {
      expect(priceOf(item.key, 'pado')!, item.key).toBeGreaterThan(priceOf(item.key, 'chips')!);
    }
  });

  it('efeito com cena própria custa mais que um brilho de cor', () => {
    expect(findItem('winfx:fire')!.chips).toBeGreaterThan(findItem('winfx:azure')!.chips);
  });

  it('o que já foi comprado conta como tendo; o resto, não', () => {
    const meus = ['character:ren', 'back-nao-existe'];
    expect(owns(meus, 'character:ren')).toBe(true);
    expect(owns(meus, 'character:yukina')).toBe(false);
    expect(owns(undefined, 'character:marina')).toBe(true);
  });

  it('item fora do catálogo não tem preço (nem dá para comprar)', () => {
    expect(findItem('character:inventado')).toBeUndefined();
    expect(priceOf('character:inventado', 'chips')).toBeNull();
  });

  it('cada tipo tem pelo menos um item à venda', () => {
    for (const kind of ['character', 'face', 'back', 'chip', 'table', 'winfx', 'ui'] as const) {
      const pagos = itemsOfKind(kind).filter((i) => i.chips > 0);
      expect(pagos.length, kind).toBeGreaterThan(0);
    }
  });

  it('todo item gratuito existe no catálogo', () => {
    for (const key of FREE_KEYS) expect(findItem(key), key).toBeTruthy();
  });
});
