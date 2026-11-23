import { describe, expect, it } from 'vitest';
import { BACK_PRESETS, CHIP_PRESETS, FACE_PRESETS, TABLE_PRESETS, sanitizeCosmetics, type CardBackStyle } from './styles';
import { CONTRASTE_MINIMO, cabeNoQueTem, componentesDe, contraste, corMaisProxima, encaixar, frenteLegivel, liberado, seLe } from './componentes';
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

describe('o naipe se lê no papel', () => {
  it('o contraste é o do WCAG: preto no branco é 21, a mesma cor é 1', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contraste('#d0243b', '#d0243b')).toBeCloseTo(1, 5);
    expect(seLe('#ffffff', ['#fbfaf6'])).toBe(false);
    expect(seLe('#1b1b24', ['#ffffff', '#f2eee6'])).toBe(true);
  });

  it('toda frente de série é legível: os naipes e a letra da figura, nos dois tons do fundo', () => {
    for (const f of FACE_PRESETS) {
      if (f.special === 'rainbow') continue;
      for (const c of [...Object.values(f.suitColors), f.courtColor]) {
        expect(Math.min(contraste(c, f.bg), contraste(c, f.bgGradient)), `${f.id} ${c}`).toBeGreaterThanOrEqual(CONTRASTE_MINIMO);
      }
      expect(frenteLegivel(f)).toBe(f);
    }
  });

  it('branco no branco e preto no preto viram a cor mais parecida que se lê', () => {
    const f = FACE_PRESETS[0];
    const branca = { ...f, bg: '#ffffff', bgGradient: '#f4f1ea', suitColors: { s: '#ffffff', h: '#d0243b', d: '#fdfdfd', c: '#1b1b24' }, courtColor: '#ffffff' };
    const lida = frenteLegivel(branca, ['#ffffff', '#1b1b24', '#d0243b', '#2a2a40']);
    for (const c of [...Object.values(lida.suitColors), lida.courtColor]) expect(seLe(c, [lida.bg, lida.bgGradient]), c).toBe(true);
    // a que já se lia fica como estava
    expect(lida.suitColors.h).toBe('#d0243b');
    expect(lida.suitColors.c).toBe('#1b1b24');
    // sem nenhuma da paleta que se leia, vai a de reserva que contrasta mais
    const preta = { ...f, bg: '#101014', bgGradient: '#000000', suitColors: { s: '#000000', h: '#000000', d: '#000000', c: '#000000' }, courtColor: '#000000' };
    expect(frenteLegivel(preta, ['#000000']).suitColors.s).toBe('#fbf7ee');
  });

  it('o servidor não põe na mesa a frente do Estúdio com o naipe sumido', () => {
    const c = sanitizeCosmetics({});
    const f = FACE_PRESETS.find((p) => p.id === freeIdOf('face'))!;
    const sumida = { ...f, id: 'custom-branca', bg: '#ffffff', bgGradient: '#ffffff', suitColors: { s: '#ffffff', h: '#ffffff', d: '#ffffff', c: '#ffffff' }, courtColor: '#ffffff' };
    const mesa = clampCosmetics({ ...c, face: sumida }, []);
    for (const cor of [...Object.values(mesa.face.suitColors), mesa.face.courtColor]) expect(seLe(cor, [mesa.face.bg, mesa.face.bgGradient]), cor).toBe(true);
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

  it('a frente, as fichas e a mesa feitas no Estúdio também vão para a mesa (encaixadas), e não viram as gratuitas', () => {
    const c = sanitizeCosmetics({});
    const de = <T extends { id: string }>(kind: string, presets: readonly T[]) => presets.find((p) => p.id === freeIdOf(kind as never))!;
    const face = { ...de('face', FACE_PRESETS), id: 'custom-f', name: 'Minha frente', from: freeIdOf('face') };
    const chip = { ...de('chip', CHIP_PRESETS), id: 'custom-c', name: 'Minhas fichas' };
    const table = { ...de('table', TABLE_PRESETS), id: 'custom-t', name: 'Minha mesa', logoText: 'OLÁ' };
    const mesa = clampCosmetics({ ...c, face, chip, table }, []);
    expect([mesa.face.id, mesa.chip.id, mesa.table.id]).toEqual(['custom-f', 'custom-c', 'custom-t']);
    expect(mesa.table.logoText).toBe('OLÁ');
    // a frente de vidro feita no Estúdio, sem ter a de vidro: vai de papel
    const vidro = clampCosmetics({ ...c, face: { ...face, special: 'glass' } }, []);
    expect(vidro.face.special).toBeUndefined();
    // e um preset que a conta não tem continua virando o gratuito
    const outra = TABLE_PRESETS.find((t) => t.id !== freeIdOf('table'))!;
    expect(clampCosmetics({ ...c, table: outra }, []).table.id).toBe(freeIdOf('table'));
  });
});
