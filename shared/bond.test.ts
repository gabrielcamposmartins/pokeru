import { describe, expect, it } from 'vitest';
import { GIFTS, findGift } from './catalog';
import {
  BOND_MAX,
  BOND_RECIPES,
  EMPTY_BOND,
  HEARTS,
  HEART_COST,
  addBond,
  bondBlocked,
  bondCap,
  hasGifts,
  nextRecipe,
  payGifts,
  recipeFor,
} from './bond';
import { CHARACTER_PRESETS } from './styles';

/**
 * A tranca do vínculo: jogar enche o coração, presente abre.
 *
 * O que estes testes protegem é a promessa feita ao jogador — que nada do que ele jogou se perde
 * enquanto o coração espera — e a integridade das receitas, que o servidor cobra.
 */

describe('teto dos pontos', () => {
  it('sem coração aberto, a barra enche só o primeiro', () => {
    expect(bondCap(0)).toBe(HEART_COST[0]);
    expect(bondCap(1)).toBe(HEART_COST[0] + HEART_COST[1]);
    expect(bondCap(HEARTS)).toBe(BOND_MAX);
    // acima do último coração não há mais teto que o total
    expect(bondCap(99)).toBe(BOND_MAX);
  });

  it('os pontos param no teto, mas os contadores continuam subindo', () => {
    let st = EMPTY_BOND;
    for (let i = 0; i < 20; i++) st = addBond(st, 'matchWin', bondCap(0));
    expect(st.points).toBe(bondCap(0));
    expect(st.matches).toBe(20);
  });

  it('o coração trancado é o que está cheio esperando presente', () => {
    expect(bondBlocked(bondCap(0) - 1, 0)).toBe(false);
    expect(bondBlocked(bondCap(0), 0)).toBe(true);
    // com o primeiro aberto, o mesmo ponto deixa de travar
    expect(bondBlocked(bondCap(0), 1)).toBe(false);
    // vínculo completo não tranca nada
    expect(bondBlocked(BOND_MAX, HEARTS)).toBe(false);
  });
});

describe('receitas de presente', () => {
  it('todo personagem tem uma receita por coração, e todas pedem presentes que existem', () => {
    for (const c of CHARACTER_PRESETS) {
      const receitas = BOND_RECIPES[c.id];
      expect(receitas, c.id).toBeTruthy();
      expect(receitas, c.id).toHaveLength(HEARTS);
      for (let h = 1; h <= HEARTS; h++) {
        const r = recipeFor(c.id, h)!;
        expect(Object.keys(r).length, `${c.id}/${h}`).toBeGreaterThan(0);
        for (const [id, qty] of Object.entries(r)) {
          expect(findGift(id), `${c.id}/${h}/${id}`).toBeTruthy();
          expect(qty, `${c.id}/${h}/${id}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('a conta sobe de coração em coração: o quinto pede mais que o primeiro', () => {
    const soma = (r: Readonly<Record<string, number>>) => Object.values(r).reduce((t, n) => t + n, 0);
    for (const c of CHARACTER_PRESETS) {
      expect(soma(recipeFor(c.id, 5)!), c.id).toBeGreaterThan(soma(recipeFor(c.id, 1)!));
    }
  });

  it('cada presente do catálogo é pedido por alguém, senão não existiria motivo para comprá-lo', () => {
    const pedidos = new Set(Object.values(BOND_RECIPES).flatMap((rs) => rs.flatMap((r) => Object.keys(r))));
    for (const g of GIFTS) expect(pedidos.has(g.id), g.id).toBe(true);
  });

  it('coração fora da escada não tem receita', () => {
    expect(recipeFor('yukina', 0)).toBeNull();
    expect(recipeFor('yukina', HEARTS + 1)).toBeNull();
    expect(recipeFor('inventado', 1)).toBeNull();
    expect(nextRecipe('yukina', HEARTS)).toBeNull();
  });
});

describe('estoque de presentes', () => {
  const need = { flor: 2, cha: 1 };

  it('só destranca com a receita inteira', () => {
    expect(hasGifts({ flor: 2, cha: 1 }, need)).toBe(true);
    expect(hasGifts({ flor: 5, cha: 5 }, need)).toBe(true);
    expect(hasGifts({ flor: 1, cha: 1 }, need)).toBe(false);
    expect(hasGifts({ flor: 2 }, need)).toBe(false);
    expect(hasGifts(undefined, need)).toBe(false);
  });

  it('pagar desconta o exato e limpa o que zerou', () => {
    const antes = { flor: 3, cha: 1, joia: 1 };
    const depois = payGifts(antes, need);
    expect(depois).toEqual({ flor: 1, joia: 1 });
    // e não mexe no estoque antigo
    expect(antes).toEqual({ flor: 3, cha: 1, joia: 1 });
  });
});
