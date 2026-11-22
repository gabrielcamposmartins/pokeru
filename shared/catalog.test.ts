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
import { DE_INICIO, GALERIA, GIFTS, PRECO_DO_ACESSORIO, VENDIDOS, clampAcessorios, eDeInicio, estaAVenda, isSold, marcaDePerdido, ownsItem, rarityOf } from './catalog';
import { ACESSORIOS, sanitizeAcessorios, type Acessorios } from './acessorios';
import { dropsOf, findRoulette, refundOf, roletaDe } from './roulette';
import { AURA_IDS, BACK_PRESETS, CHARACTER_PRESETS, CHIP_PRESETS, FACE_PRESETS, FRAME_IDS, TABLE_PRESETS, WIN_FX_IDS } from './styles';

describe('catálogo da loja', () => {
  it('cobre tudo que existe no jogo, uma vez cada', () => {
    const esperado =
      CHARACTER_PRESETS.length +
      WIN_FX_IDS.length +
      FACE_PRESETS.length +
      BACK_PRESETS.length +
      CHIP_PRESETS.length +
      TABLE_PRESETS.length +
      AURA_IDS.length +
      FRAME_IDS.length +
      ACESSORIOS.length +
      GIFTS.length +
      3; // as aparências: Sakura, Vitoriano e Retrofuturista
    expect(CATALOG).toHaveLength(esperado);
    expect(new Set(CATALOG.map((i) => i.key)).size).toBe(CATALOG.length);
  });

  it('só presentes e interface estão à venda por inteiro; o resto é galeria', () => {
    expect(VENDIDOS).toEqual(['gift', 'ui']);
    for (const kind of GALERIA) expect(isSold(kind), kind).toBe(false);
    for (const kind of VENDIDOS) expect(isSold(kind), kind).toBe(true);
    // e as duas listas não se cruzam nem deixam tipo de fora
    const todos = new Set(CATALOG.map((i) => i.kind));
    expect([...todos].sort()).toEqual([...VENDIDOS, ...GALERIA].sort());
  });

  /*
   * A venda é decidida por peça. Os tipos vendidos se vendem inteiros; da galeria, só uma parte dos
   * acessórios (a regra fina deles está em acessorios.test.ts) — personagem, carta, ficha, mesa,
   * efeito, aura e moldura não se compram de jeito nenhum.
   */
  it('por peça: tudo dos tipos vendidos, alguns acessórios, e mais nada da galeria', () => {
    for (const item of CATALOG) {
      if (isSold(item.kind)) expect(estaAVenda(item.key), item.key).toBe(true);
      else if (item.kind !== 'acessorio') expect(estaAVenda(item.key), item.key).toBe(false);
    }
    expect(estaAVenda('acessorio:anel-perola')).toBe(true);
    expect(estaAVenda('acessorio:anel-safira')).toBe(false);
    expect(estaAVenda('acessorio:esmalte-rosa')).toBe(false);
    // chave que não existe não se vende
    expect(estaAVenda('acessorio:inventado')).toBe(false);
    expect(estaAVenda('nada:disso')).toBe(false);
  });

  it('o jogador começa com Marina, Tobi e um jogo completo de mesa', () => {
    expect(owns([], 'character:marina')).toBe(true);
    expect(owns([], 'character:tobi')).toBe(true);
    expect(owns([], 'character:ren')).toBe(false);
    expect(owns([], 'character:yukina')).toBe(false);
    // e o suficiente para sentar: carta, verso, ficha, mesa, efeito, aura, moldura e interface
    for (const kind of ['face', 'back', 'chip', 'table', 'winfx', 'aura', 'frame', 'ui'] as const) {
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
    expect(priceOf('ui:victorian', 'pado')).toBe(24_000);
    expect(priceOf('ui:victorian', 'chips')).toBe(12_000);
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
    for (const kind of ['character', 'face', 'back', 'chip', 'table', 'winfx', 'aura', 'frame', 'ui'] as const) {
      const pagos = itemsOfKind(kind).filter((i) => i.chips > 0);
      expect(pagos.length, kind).toBeGreaterThan(0);
    }
  });

  it('todo item gratuito existe no catálogo', () => {
    for (const key of FREE_KEYS) expect(findItem(key), key).toBeTruthy();
  });
});

/**
 * A peça de início: a aliança lisa. Toda conta tem uma sem ela estar na lista do que foi ganho — e
 * deixa de ter quando a lista ganha a marca de que foi perdida numa aposta (shared/aposta.ts).
 */
describe('a peça de início (a aliança lisa)', () => {
  const ALIANCA = 'acessorio:anel-alianca';
  const MARCA = marcaDePerdido(ALIANCA);

  it('é uma só, existe no catálogo, e não é das que vêm de graça com o jogo', () => {
    expect(DE_INICIO).toEqual([ALIANCA]);
    for (const key of DE_INICIO) {
      expect(findItem(key), key).toBeTruthy();
      expect(eDeInicio(key), key).toBe(true);
      expect(isFree(key), key).toBe(false);
      expect(FREE_KEYS, key).not.toContain(key);
    }
    expect(eDeInicio('acessorio:anel-ebano')).toBe(false);
    expect(eDeInicio('character:marina')).toBe(false);
    expect(MARCA).toBe('perdeu:acessorio:anel-alianca');
  });

  it('toda conta a tem sem nada na lista — e quem joga sem conta também', () => {
    expect(owns([], ALIANCA)).toBe(true);
    expect(owns(undefined, ALIANCA)).toBe(true);
    expect(ownsItem(undefined, 'acessorio', 'anel-alianca')).toBe(true);
    // (uma conta antiga, com a lista do que já ganhou, também: ninguém precisa "receber" a aliança)
    expect(owns(['character:ren', 'acessorio:anel-ebano'], ALIANCA)).toBe(true);
  });

  it('com a marca de perdida na lista, a conta não a tem', () => {
    expect(owns([MARCA], ALIANCA)).toBe(false);
    expect(owns(['character:ren', MARCA], ALIANCA)).toBe(false);
    expect(ownsItem([MARCA], 'acessorio', 'anel-alianca')).toBe(false);
    // e a marca não tira mais nada
    expect(owns([MARCA], 'character:marina')).toBe(true);
    expect(owns(['character:ren', MARCA], 'character:ren')).toBe(true);
  });

  it('tem de novo se a chave estiver na lista (comprou ou ganhou outra), mesmo com a marca', () => {
    expect(owns([MARCA, ALIANCA], ALIANCA)).toBe(true);
    expect(owns([ALIANCA, MARCA], ALIANCA)).toBe(true);
    expect(owns([ALIANCA], ALIANCA)).toBe(true);
  });

  it('a marca só vale para a peça de início: o que é grátis ninguém perde, e o que não é da conta continua não sendo', () => {
    expect(owns([marcaDePerdido('character:marina')], 'character:marina')).toBe(true);
    expect(owns([marcaDePerdido('acessorio:luva-traje')], 'acessorio:luva-traje')).toBe(true);
    expect(owns([marcaDePerdido('acessorio:anel-ebano')], 'acessorio:anel-ebano')).toBe(false);
    expect(owns([marcaDePerdido('acessorio:anel-ebano'), 'acessorio:anel-ebano'], 'acessorio:anel-ebano')).toBe(true);
  });

  it('é peça de verdade: comum, com preço nas duas moedas (1.000 fichas), à venda, e sai da Roleta do Dragão', () => {
    expect(rarityOf(ALIANCA)).toBe('comum');
    expect(findItem(ALIANCA)!.chips).toBe(PRECO_DO_ACESSORIO.comum);
    expect(priceOf(ALIANCA, 'chips')).toBe(1000);
    expect(priceOf(ALIANCA, 'pado')).toBe(padoPrice(1000));
    expect(estaAVenda(ALIANCA)).toBe(true);
    expect(roletaDe(ALIANCA)?.id).toBe('dragao');
    expect(dropsOf(findRoulette('dragao')!).map((d) => d.key)).toContain(ALIANCA);
    expect(dropsOf(findRoulette('flores')!).map((d) => d.key)).not.toContain(ALIANCA);
    // repetida, vira o reembolso de qualquer comum
    expect(refundOf(ALIANCA)).toBe(refundOf('acessorio:relogio-campo'));
    expect(refundOf(ALIANCA)).toBeGreaterThan(0);
  });

  it('clampAcessorios tira a aliança das mãos de quem a perdeu, e só dela', () => {
    const maos: Acessorios = sanitizeAcessorios({
      aneis: [
        { id: 'anel-alianca', mao: 'E', dedo: 2 },
        { id: 'anel-ebano', mao: 'D', dedo: 2 },
      ],
      bracos: { E: ['relogio-campo'], D: [] },
    });
    const meus = ['acessorio:anel-ebano', 'acessorio:relogio-campo'];
    // quem ainda a tem (com ou sem conta) fica com ela no dedo
    expect(clampAcessorios(maos, meus)).toEqual(maos);
    expect(clampAcessorios(maos, undefined).aneis).toEqual([{ id: 'anel-alianca', mao: 'E', dedo: 2 }]);
    // quem a perdeu fica sem — o aro de ébano e o relógio, que são dela, continuam
    const semEla = clampAcessorios(maos, [...meus, MARCA]);
    expect(semEla.aneis).toEqual([{ id: 'anel-ebano', mao: 'D', dedo: 2 }]);
    expect(semEla.bracos).toEqual({ E: ['relogio-campo'], D: [] });
    // e quem comprou outra volta a poder usá-la
    expect(clampAcessorios(maos, [...meus, MARCA, ALIANCA])).toEqual(maos);
  });
});
