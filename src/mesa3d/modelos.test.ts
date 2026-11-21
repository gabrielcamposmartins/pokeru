import { describe, expect, it } from 'vitest';
import { TRAJES } from '../personagem/roupa';
import { CHARACTER_PRESETS } from '../../shared/styles';
import { TRAJES_DO_JOGO, podeModelar, preparar, textoDoAndamento, trajeDe } from './modelos';

describe('mesa 3D: o traje de cada personagem', () => {
  it('a lista de trajes é a de src/personagem/roupa.ts (sem puxar a modelagem para a tela de carregamento)', () => {
    expect([...TRAJES_DO_JOGO].sort()).toEqual(TRAJES.map((t) => t.id).sort());
  });

  it('todo personagem do jogo tem o traje dele', () => {
    for (const c of CHARACTER_PRESETS) expect(trajeDe(c.id)).toBe(c.id);
  });

  it('um personagem sem traje (novo, ou um id estranho vindo da rede) veste o padrão em vez de sumir', () => {
    expect(trajeDe('quem')).toBe('tobi');
    expect(trajeDe('')).toBe('tobi');
  });
});

describe('mesa 3D: o andamento na tela de carregamento', () => {
  it('nada sendo feito: a tela não diz nada', () => {
    expect(textoDoAndamento({ corpo: 'nada', roupas: {}, clipes: 'nada' }, ['marina'])).toBeNull();
  });

  it('conta as roupas prontas dos personagens da mesa (repetidos contam uma vez)', () => {
    const a = { corpo: 'fazendo', roupas: { marina: 'pronta', ren: 'fazendo' }, clipes: 'nada' } as const;
    expect(textoDoAndamento(a, ['marina', 'ren', 'marina'])).toBe('Modelando os personagens… 1 de 2');
  });

  it('modelados, faltam os gestos; com tudo, prontos', () => {
    expect(textoDoAndamento({ corpo: 'pronto', roupas: { tobi: 'pronta' }, clipes: 'fazendo' }, ['tobi'])).toBe('Ensaiando os gestos…');
    expect(textoDoAndamento({ corpo: 'pronto', roupas: { tobi: 'pronta' }, clipes: 'prontos' }, ['tobi'])).toBe('Personagens prontos');
  });

  it('sem Web Worker (aqui, nos testes) não modela nada e não trava a tela', async () => {
    expect(podeModelar()).toBe(false);
    await expect(preparar(['marina'])).resolves.toBeUndefined();
  });
});
