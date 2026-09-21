import { describe, expect, it } from 'vitest';
import { myStyles } from './shop';
import { PRESETS } from './profile';
import { freeIdOf, itemKey } from '../../shared/catalog';
import type { CardBackStyle } from '../../shared/styles';

/**
 * A lista de estilos do Estúdio.
 *
 * Esta função existe separada do hook por causa de um bug que chegou a ser publicado: a junção era
 * feita **dentro** do seletor do zustand, que devolvia um array novo a cada chamada. No zustand 5 o
 * resultado do seletor é o `getSnapshot` do `useSyncExternalStore` e é comparado por identidade, e
 * um valor sempre novo faz o React re-renderizar sem parar — o Estúdio abria com "Maximum update
 * depth exceeded" (#185 no build de produção). Agora o seletor devolve a referência que já está na
 * loja, o `useMemo` junta, e a regra de quem entra na lista mora aqui, testada sem React.
 */

const livreBack = freeIdOf('back');

describe('estilos que o jogador pode usar', () => {
  it('sem nada comprado, sobra o gratuito de cada tipo — a lista nunca fica vazia', () => {
    for (const kind of ['face', 'back', 'chip', 'table'] as const) {
      const list = myStyles(kind, []);
      expect(list.length, kind).toBe(1);
      expect(list[0].id, kind).toBe(freeIdOf(kind));
    }
  });

  it('o que foi comprado entra, na ordem do catálogo', () => {
    const outro = PRESETS.back.find((b) => b.id !== livreBack)!;
    const list = myStyles('back', [itemKey('back', outro.id)]);
    expect(list.map((b) => b.id)).toEqual(PRESETS.back.filter((b) => b.id === livreBack || b.id === outro.id).map((b) => b.id));
  });

  it('o que não foi comprado fica de fora', () => {
    const ids = myStyles('back', []).map((b) => b.id);
    for (const preset of PRESETS.back) {
      if (preset.id !== livreBack) expect(ids, preset.id).not.toContain(preset.id);
    }
  });

  it('as criações do Estúdio vêm depois dos presets', () => {
    const meu = { ...PRESETS.back[0], id: 'back-meu', name: 'Meu', from: livreBack } as CardBackStyle;
    const list = myStyles('back', [], [meu]);
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(livreBack);
    expect(list[1].id).toBe('back-meu');
  });

  it('sem criações, devolve a mesma lista dos presets (sem array novo à toa)', () => {
    const a = myStyles('chip', [], []);
    const b = myStyles('chip', [], undefined);
    expect(a).toEqual(b);
  });

  it('owned indefinido é tratado como nada comprado', () => {
    expect(myStyles('table', undefined).map((t) => t.id)).toEqual([freeIdOf('table')]);
  });
});
