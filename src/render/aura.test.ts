import { describe, expect, it } from 'vitest';
import {
  AURA_IDS,
  AURA_SLOT,
  AURA_SLOTS,
  DEFAULT_AURA,
  DEFAULT_AURAS,
  DEFAULT_FRAME,
  FRAME_IDS,
  sanitizeAuras,
  sanitizeCosmetics,
  sanitizeFrame,
  tirarAura,
  vestirAura,
} from '../../shared/styles';
import { AURAS, MISSING_AURAS, SLOT_LABEL, findAura } from './aura';
import { FRAMES, MISSING_FRAMES, findFrame } from './PortraitFrame';
import { clampCosmetics, findItem, isFree, itemKey, rarityOf } from '../../shared/catalog';

/**
 * Aura e moldura são as duas peças em que o **id** viaja pela rede e o **desenho** mora no cliente.
 * O que não pode divergir é a lista: um id sem entrada no catálogo do desenho viraria uma aura
 * invisível na mesa, e uma entrada sem id nunca chegaria a ninguém.
 */

describe('auras', () => {
  it('todo id da rede tem entrada no catálogo (e vice-versa)', () => {
    expect(MISSING_AURAS).toEqual([]);
    expect(AURAS.map((a) => a.id).sort()).toEqual([...AURA_IDS].sort());
  });

  it('cada aura tem nome, descrição e duas cores', () => {
    for (const a of AURAS) {
      expect(a.name, a.id).toBeTruthy();
      expect(a.description, a.id).toBeTruthy();
      expect(a.colors, a.id).toHaveLength(2);
      for (const c of a.colors) expect(c, `${a.id} ${c}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('cada forma traz os parâmetros de que precisa', () => {
    for (const a of AURAS) {
      if (a.shape === 'circulo') {
        expect(a.texto?.linha, a.id).toBeTruthy();
        // o anel do meio tem oito casas: oito sinais, nem mais nem menos
        expect(a.texto?.glifos, a.id).toHaveLength(8);
      }
      if (a.shape === 'aureola') expect(a.aureola, a.id).toBeTruthy();
      if (a.shape === 'orbita') expect(a.figura, a.id).toBeTruthy();
      if (a.shape === 'asas') expect(a.asa, a.id).toBeTruthy();
    }
  });

  it('cada uma tem um recorte de vitrine quadrado e o lugar que a regra diz', () => {
    for (const a of AURAS) {
      const [, , lado] = a.vitrine;
      expect(lado, a.id).toBeGreaterThan(0);
      expect(a.slot, a.id).toBe(AURA_SLOT[a.id]);
      expect(SLOT_LABEL[a.slot], a.id).toBeTruthy();
    }
  });

  it('os quatro círculos escrevem em quatro escritas diferentes', () => {
    const circulos = AURAS.filter((a) => a.shape === 'circulo');
    expect(circulos).toHaveLength(4);
    // latim, grego, japonês e cirílico: cada um com a sua faixa de caracteres
    const escritas = [/[A-Z]/, /[Ͱ-Ͽ]/, /[　-鿿]/, /[Ѐ-ӿ]/];
    for (const re of escritas) expect(circulos.filter((a) => re.test(a.texto!.linha)), String(re)).toHaveLength(1);
  });

  it('id desconhecido cai na aura padrão, que é a que vem com o jogo', () => {
    expect(DEFAULT_AURAS).toEqual([DEFAULT_AURA]);
    expect(findAura('nao-existe').id).toBe(DEFAULT_AURA);
    expect(findAura(undefined).id).toBe(DEFAULT_AURA);
    expect(findAura('asas-dragao').id).toBe('asas-dragao');
    expect(isFree(itemKey('aura', DEFAULT_AURA))).toBe(true);
  });

  it('o que vem da rede é sanitizado: só ids que existem, e a lista toda fica em ordem de fundo', () => {
    expect(sanitizeAuras(['aureola', '<script>', 42, 'brilho'])).toEqual(['brilho', 'aureola']);
    expect(sanitizeCosmetics({ auras: ['labaredas'] }).auras).toEqual(['labaredas']);
    // cliente antigo, que nem manda o campo: fica o padrão
    expect(sanitizeCosmetics({}).auras).toEqual([...DEFAULT_AURAS]);
    expect(sanitizeAuras('asas-anjo')).toEqual([...DEFAULT_AURAS]);
    // lista vazia é escolha: sem aura nenhuma
    expect(sanitizeAuras([])).toEqual([]);
  });
});

describe('várias auras ao mesmo tempo', () => {
  it('todo id tem lugar, e todo lugar existe na pilha', () => {
    for (const id of AURA_IDS) expect(AURA_SLOTS, id).toContain(AURA_SLOT[id]);
  });

  it('dá para usar uma de cada lugar ao mesmo tempo', () => {
    const uma = AURA_SLOTS.map((slot) => AURA_IDS.find((id) => AURA_SLOT[id] === slot)!);
    expect(sanitizeAuras(uma)).toHaveLength(AURA_SLOTS.length);
  });

  it('duas do mesmo lugar não: fica a primeira', () => {
    expect(sanitizeAuras(['asas-anjo', 'asas-dragao', 'aureola'])).toEqual(['asas-anjo', 'aureola']);
    expect(sanitizeAuras(['circulo-boreal', 'circulo-arcano'])).toEqual(['circulo-boreal']);
  });

  it('vestir num lugar ocupado troca a que estava lá, e o resto fica', () => {
    const antes = vestirAura(vestirAura(['brilho'], 'asas-morcego'), 'aureola');
    expect(antes).toEqual(['brilho', 'asas-morcego', 'aureola']);
    expect(vestirAura(antes, 'asas-dragao')).toEqual(['brilho', 'asas-dragao', 'aureola']);
    // vestir de novo a mesma não duplica
    expect(vestirAura(antes, 'aureola')).toEqual(antes);
  });

  it('tirar tira só aquela, e dá para ficar sem nenhuma', () => {
    expect(tirarAura(['brilho', 'aureola'], 'brilho')).toEqual(['aureola']);
    expect(tirarAura(['aureola'], 'aureola')).toEqual([]);
  });

  it('as auras se empilham da mais funda para a mais rasa, seja qual for a ordem de vestir', () => {
    const vestidas = ['naipes', 'brilho', 'asas-anjo', 'circulo-arcano'].reduce((l, id) => vestirAura(l, id as never), [] as ReturnType<typeof vestirAura>);
    expect(vestidas).toEqual(['brilho', 'circulo-arcano', 'asas-anjo', 'naipes']);
  });

  it('a trava do servidor tira só as auras que a conta não tem, sem pôr o brilho no lugar', () => {
    const pedido = sanitizeCosmetics({ auras: ['asas-dragao', 'aureola'] });
    expect(clampCosmetics(pedido, ['aura:aureola']).auras).toEqual(['aureola']);
    expect(clampCosmetics(pedido, []).auras).toEqual([]);
    // o brilho vem com o jogo: esse passa sempre
    expect(clampCosmetics(sanitizeCosmetics({ auras: ['brilho'] }), []).auras).toEqual(['brilho']);
  });
});

describe('molduras do retrato', () => {
  it('todo id da rede tem entrada no catálogo (e vice-versa)', () => {
    expect(MISSING_FRAMES).toEqual([]);
    expect(FRAMES.map((f) => f.id).sort()).toEqual([...FRAME_IDS].sort());
  });

  it('cada moldura tem nome, descrição e duas cores', () => {
    for (const f of FRAMES) {
      expect(f.name, f.id).toBeTruthy();
      expect(f.description, f.id).toBeTruthy();
      expect(f.colors, f.id).toHaveLength(2);
      for (const c of f.colors) expect(c, `${f.id} ${c}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('id desconhecido cai na moldura padrão, que é a dourada de sempre', () => {
    expect(findFrame('nao-existe').id).toBe(DEFAULT_FRAME);
    expect(findFrame(undefined).id).toBe(DEFAULT_FRAME);
    expect(findFrame('dragao').id).toBe('dragao');
    expect(isFree(itemKey('frame', DEFAULT_FRAME))).toBe(true);
  });

  it('o que vem da rede é sanitizado', () => {
    expect(sanitizeFrame('neon')).toBe('neon');
    expect(sanitizeFrame(42)).toBe(DEFAULT_FRAME);
    expect(sanitizeCosmetics({ frame: 'gelo' }).frame).toBe('gelo');
    expect(sanitizeCosmetics({}).frame).toBe(DEFAULT_FRAME);
  });
});

describe('as duas famílias na escada de raridade', () => {
  it('a peça que vem com o jogo é comum e as de dragão são lendárias', () => {
    expect(rarityOf('aura:brilho')).toBe('comum');
    // o brilho vivo não vem com o jogo: sai da roleta, no degrau de baixo
    expect(rarityOf('aura:poeira-de-luz')).toBe('comum');
    expect(isFree(itemKey('aura', 'poeira-de-luz'))).toBe(false);
    expect(rarityOf('frame:anjinho')).toBe('epico');
    expect(rarityOf('frame:ouro')).toBe('comum');
    expect(rarityOf('aura:asas-dragao')).toBe('lendario');
    expect(rarityOf('frame:dragao')).toBe('lendario');
  });

  it('as asas custam mais que as outras auras, e a moldura que se mexe mais que a parada', () => {
    const preco = (kind: 'aura' | 'frame', id: string) => findItem(itemKey(kind, id))!.chips;
    // as asas são a única peça que muda o tamanho que a pessoa ocupa na tela (veja PRICES.auraWings)
    expect(preco('aura', 'asas-dragao')).toBeGreaterThan(preco('aura', 'aureola'));
    expect(preco('frame', 'chama')).toBeGreaterThan(preco('frame', 'prata'));
  });
});
