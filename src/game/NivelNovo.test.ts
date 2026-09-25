import { describe, expect, it } from 'vitest';
import { BOT_TIERS } from '../../shared/protocol';
import { desbloqueiosEntre } from './NivelNovo';
import { nivelSubiu, useNivelNovo } from '../store/nivel';

/**
 * A cena de subir de nível: o que ela diz que abriu, e quando ela tem o que mostrar.
 */
describe('subir de nível', () => {
  it('diz o que abriu no caminho: as dificuldades contra bots, cada uma no nível dela', () => {
    const normal = BOT_TIERS.find((t) => t.id === 'normal')!;
    const dificil = BOT_TIERS.find((t) => t.id === 'hard')!;
    expect(desbloqueiosEntre(normal.level - 1, normal.level).map((d) => d.titulo)).toEqual(['Contra Bots: Normal']);
    expect(desbloqueiosEntre(normal.level, normal.level + 1)).toEqual([]);
    // pular vários níveis de uma vez mostra tudo o que ficou para trás
    expect(desbloqueiosEntre(1, dificil.level)).toHaveLength(2);
  });

  it('duas subidas antes de a cena aparecer viram uma só, do primeiro ao último nível', () => {
    useNivelNovo.getState().fechar();
    nivelSubiu(3, 4);
    nivelSubiu(4, 5);
    expect(useNivelNovo.getState().pendente).toEqual({ de: 3, para: 5 });
    useNivelNovo.getState().fechar();
    // o mesmo nível (ou menos) não é subida
    nivelSubiu(7, 7);
    expect(useNivelNovo.getState().pendente).toBeNull();
  });
});
