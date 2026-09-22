import { describe, expect, it } from 'vitest';
import { CATALOG, isFree } from './catalog';
import { DUP_FRACAO, RARIDADES, ROULETTES, dropsOf, draw, findRoulette, giftOfKey, isCountable, rarityOf, rarityRank, refundOf, ticketPrice } from './roulette';
import { findCharacter } from './styles';

/**
 * As roletas são a tabela que o servidor sorteia e a loja anuncia. Estes testes cuidam da parte
 * que não pode divergir: as chances somam um, todo prêmio é alcançável e o repetido vale algo.
 */

describe('tabela de prêmios', () => {
  it('as chances somam 100% em cada roleta', () => {
    for (const r of ROULETTES) {
      const soma = dropsOf(r).reduce((t, d) => t + d.chance, 0);
      expect(soma, r.id).toBeCloseTo(1, 9);
    }
  });

  it('o que já vem com o jogo nunca cai', () => {
    for (const r of ROULETTES) {
      for (const d of dropsOf(r)) expect(isFree(d.key), `${r.id}/${d.key}`).toBe(false);
    }
  });

  it('cada roleta só sorteia personagens do gênero dela', () => {
    for (const r of ROULETTES) {
      for (const d of dropsOf(r).filter((x) => x.kind === 'character')) {
        expect(findCharacter(d.key.slice('character:'.length)).gender, d.key).toBe(r.gender);
      }
    }
  });

  it('as duas juntas cobrem todo cosmético que saiu da venda', () => {
    const naRoleta = new Set(ROULETTES.flatMap((r) => dropsOf(r).map((d) => d.key)));
    const deveria = CATALOG.filter((i) => !isFree(i.key) && i.kind !== 'ui');
    for (const item of deveria) expect(naRoleta.has(item.key), item.key).toBe(true);
  });

  it('o ticket custa o dobro em padocoin, como todo preço do jogo', () => {
    for (const r of ROULETTES) expect(ticketPrice(r, 'pado')).toBe(ticketPrice(r, 'chips') * 2);
  });
});

describe('raridade', () => {
  it('é declarada por peça: personagem lendário, efeito com cena épico, vitoriano raro', () => {
    expect(rarityOf('character:yukina')).toBe('lendario');
    expect(rarityOf('winfx:fire')).toBe('epico');
    expect(rarityOf('back:back-victorian')).toBe('raro');
    expect(rarityOf('winfx:azure')).toBe('incomum');
    expect(rarityOf('gift:flor')).toBe('comum');
    // chave que não existe não quebra a lista: cai no chão da escada
    expect(rarityOf('nada:disso')).toBe('comum');
  });

  it('as fatias ficam em ordem: comum mais que incomum, incomum mais que raro', () => {
    for (const r of ROULETTES) {
      const drops = dropsOf(r);
      const fatia = (id: string) => drops.filter((d) => d.raridade === id).reduce((t, d) => t + d.chance, 0);
      const fatias = RARIDADES.map((x) => fatia(x.id));
      // da melhor para a mais comum, cada fatia é maior que a anterior
      for (let i = 1; i < fatias.length; i++) expect(fatias[i], `${r.id}: ${RARIDADES[i].label}`).toBeGreaterThan(fatias[i - 1]);
    }
  });

  it('a tabela vem ordenada: os melhores primeiro, e o mais improvável na frente dentro do degrau', () => {
    for (const r of ROULETTES) {
      const drops = dropsOf(r);
      for (let i = 1; i < drops.length; i++) {
        const a = drops[i - 1];
        const b = drops[i];
        expect(rarityRank(a.raridade), `${r.id}: ${a.key} antes de ${b.key}`).toBeLessThanOrEqual(rarityRank(b.raridade));
        if (a.raridade === b.raridade) expect(a.chance, `${r.id}: ${a.key} antes de ${b.key}`).toBeLessThanOrEqual(b.chance);
      }
    }
  });

  it('os degraus somam a roleta inteira', () => {
    for (const r of ROULETTES) {
      const drops = dropsOf(r);
      const soma = RARIDADES.reduce((t, x) => t + drops.filter((d) => d.raridade === x.id).reduce((u, d) => u + d.chance, 0), 0);
      expect(soma, r.id).toBeCloseTo(1, 9);
    }
  });
});

describe('sorteio', () => {
  const r = findRoulette('flores')!;

  it('cada prêmio é alcançável, e nas bordas do intervalo o sorteio não escapa da tabela', () => {
    const drops = dropsOf(r);
    expect(draw(r, 0).key).toBe(drops[0].key);
    expect(draw(r, 0.9999999).key).toBe(drops[drops.length - 1].key);
    // percorrendo a tabela pelo meio de cada fatia, sai exatamente aquele prêmio
    const total = drops.reduce((t, d) => t + d.weight, 0);
    let antes = 0;
    for (const d of drops) {
      expect(draw(r, (antes + d.weight / 2) / total).key, d.key).toBe(d.key);
      antes += d.weight;
    }
  });

  it('número fora do intervalo não quebra o sorteio', () => {
    expect(draw(r, -5).key).toBeTruthy();
    expect(draw(r, 12).key).toBeTruthy();
  });
});

describe('repetido e presentes', () => {
  it('cosmético repetido vira uma fração do preço antigo, e nunca zero', () => {
    for (const item of CATALOG.filter((i) => i.chips > 0 && i.kind !== 'gift')) {
      expect(refundOf(item.key), item.key).toBe(Math.max(1, Math.round(item.chips * DUP_FRACAO)));
      expect(refundOf(item.key), item.key).toBeGreaterThan(0);
      expect(refundOf(item.key), item.key).toBeLessThan(item.chips);
    }
  });

  it('presente é contável; o resto é posse', () => {
    expect(isCountable('gift:flor')).toBe(true);
    expect(giftOfKey('gift:flor')?.name).toBe('Ramo de sakura');
    expect(isCountable('character:yukina')).toBe(false);
    expect(giftOfKey('character:yukina')).toBeUndefined();
  });

  it('prêmio que não existe no catálogo não vale fichas', () => {
    expect(refundOf('character:inventado')).toBe(0);
  });
});
