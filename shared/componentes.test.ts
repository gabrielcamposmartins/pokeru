import { describe, expect, it } from 'vitest';
import { BACK_PRESETS, FACE_PRESETS, sanitizeCosmetics, type CardBackStyle } from './styles';
import { cabeNoQueTem, componentesDe, corMaisProxima, encaixar, liberado } from './componentes';
import { clampCosmetics, freeIdOf } from './catalog';

/**
 * As peças do Estúdio: só as dos estilos que a conta tem.
 *
 * O que se protege aqui é a roleta — se qualquer cor e qualquer padrão estivessem abertos no
 * editor, bastaria copiar o verso que se queria —, e a mesa: o servidor encaixa o verso
 * personalizado no que a conta tem antes de mostrá-lo aos outros.
 */
const gratis = BACK_PRESETS.find((b) => b.id === freeIdOf('back'))!;

describe('as peças liberadas', () => {
  it('saem dos estilos da conta: as cores deles, os padrões e os emblemas deles', () => {
    const comp = componentesDe('back', [gratis]);
    expect(comp.cores).toContain(gratis.base.toLowerCase());
    expect(liberado(comp, 'pattern', gratis.pattern)).toBe(true);
    expect(liberado(comp, 'emblem', gratis.emblem)).toBe(true);
    // um padrão que nenhum verso da conta tem não está aberto
    const outro = BACK_PRESETS.find((b) => b.pattern !== gratis.pattern && b.pattern !== 'solid')!;
    expect(liberado(comp, 'pattern', outro.pattern)).toBe(false);
  });

  it('tirar um elemento está sempre aberto: sem padrão, sem emblema, sem moldura', () => {
    const verso = componentesDe('back', []);
    expect(liberado(verso, 'pattern', 'solid')).toBe(true);
    expect(liberado(verso, 'emblem', 'none')).toBe(true);
    expect(liberado(componentesDe('face', []), 'frame', 'none')).toBe(true);
  });

  it('ganhar um estilo abre as peças dele', () => {
    const outro = BACK_PRESETS.find((b) => b.id !== gratis.id && b.emblem !== gratis.emblem)!;
    expect(liberado(componentesDe('back', [gratis]), 'emblem', outro.emblem)).toBe(false);
    expect(liberado(componentesDe('back', [gratis, outro]), 'emblem', outro.emblem)).toBe(true);
  });

  it('texto livre não é peça: o nome e as letras do emblema não entram na paleta', () => {
    const comp = componentesDe('back', [{ ...gratis, name: '#ffffff', emblemText: '#000' }]);
    expect(comp.cores).not.toContain('#000');
  });
});

describe('encaixar no que a conta tem', () => {
  it('cada cor vira a mais parecida da paleta', () => {
    expect(corMaisProxima('#fe0101', ['#00ff00', '#ff0000', '#0000ff'])).toBe('#ff0000');
    expect(corMaisProxima('#FF0000', ['#ff0000'])).toBe('#ff0000');
  });

  it('um verso com peças de fora chega o mais perto possível com as peças de dentro', () => {
    const comp = componentesDe('back', [gratis]);
    const inventado: CardBackStyle = { ...gratis, id: 'meu-1', base: '#13f7a2', pattern: 'damask', emblem: 'crown' };
    const pronto = encaixar('back', inventado, comp);
    expect(comp.cores).toContain(pronto.base);
    expect(liberado(comp, 'pattern', pronto.pattern)).toBe(true);
    expect(liberado(comp, 'emblem', pronto.emblem)).toBe(true);
    expect(cabeNoQueTem('back', pronto, comp)).toBe(true);
    expect(cabeNoQueTem('back', inventado, comp)).toBe(false);
    // o que não é peça continua como estava
    expect(pronto.id).toBe('meu-1');
    expect(pronto.patternScale).toBe(inventado.patternScale);
  });

  it('funciona com as cores aninhadas da frente (os naipes)', () => {
    const face = FACE_PRESETS[0];
    const comp = componentesDe('face', [face]);
    const pronto = encaixar('face', { ...face, suitColors: { ...face.suitColors, h: '#00ffee' } }, comp);
    expect(comp.cores).toContain(pronto.suitColors.h);
  });
});

describe('na mesa', () => {
  it('o servidor encaixa o verso personalizado nas peças da conta', () => {
    const c = sanitizeCosmetics({});
    const meu: CardBackStyle = { ...gratis, id: 'custom-1', from: gratis.id, base: '#13f7a2', emblem: 'crown' };
    const mesa = clampCosmetics({ ...c, back: meu }, []);
    expect(mesa.back.id).toBe('custom-1');
    expect(cabeNoQueTem('back', mesa.back, componentesDe('back', [gratis]))).toBe(true);
    expect(mesa.back.base).not.toBe('#13f7a2');
  });
});
