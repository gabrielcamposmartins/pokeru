import { describe, expect, it } from 'vitest';
import { BOT_MATCH, BOT_TIERS, DIFFICULTIES, QUEUE_STAKES, botMatchSettings, botTier, bonusPado, tierUnlocked } from './protocol';
import { sanitizeSettings } from './room';
import { xpForLevel } from './achievements';

/**
 * A partida contra bots: a mesa que o botão do menu abre.
 *
 * O que estes testes protegem são promessas feitas ao jogador em número: que o degrau que ele
 * escolheu é a mesa que ele recebe, que o difícil não abre antes do nível 20, e que o prêmio em
 * padocoin é o combinado. São valores que uma refatoração distraída muda sem quebrar nada — e
 * ninguém percebe, porque a mesa continua funcionando.
 */

describe('os degraus', () => {
  it('são três, na ordem da escada, e a escada só sobe', () => {
    expect(BOT_TIERS.map((t) => t.id)).toEqual([...DIFFICULTIES]);
    for (let i = 1; i < BOT_TIERS.length; i++) {
      expect(BOT_TIERS[i].level, BOT_TIERS[i].id).toBeGreaterThan(BOT_TIERS[i - 1].level);
      expect(BOT_TIERS[i].mesa.stack, BOT_TIERS[i].id).toBeGreaterThan(BOT_TIERS[i - 1].mesa.stack);
      expect(BOT_TIERS[i].mesa.bigBlind, BOT_TIERS[i].id).toBeGreaterThan(BOT_TIERS[i - 1].mesa.bigBlind);
      expect(BOT_TIERS[i].bonus.fim, BOT_TIERS[i].id).toBeGreaterThan(BOT_TIERS[i - 1].bonus.fim);
    }
  });

  it('as mesas são as combinadas: 1.000 com 50/100, 2.000 com 100/200, 10.000 com 500/1.000', () => {
    expect(botTier('easy').mesa).toEqual({ stack: 1000, smallBlind: 50, bigBlind: 100 });
    expect(botTier('normal').mesa).toEqual({ stack: 2000, smallBlind: 100, bigBlind: 200 });
    expect(botTier('hard').mesa).toEqual({ stack: 10_000, smallBlind: 500, bigBlind: 1000 });
  });

  it('a mesa é a mesma nas duas moedas: o pote em padocoin tem os números do pote em fichas', () => {
    for (const t of DIFFICULTIES) {
      const fichas = botMatchSettings(t, 'chips', true);
      const pado = botMatchSettings(t, 'pado', true);
      expect(pado.startingStack, t).toBe(fichas.startingStack);
      expect(pado.smallBlind, t).toBe(fichas.smallBlind);
      expect(pado.bigBlind, t).toBe(fichas.bigBlind);
      expect(pado.buyIn, t).toBe(fichas.buyIn);
    }
    // e a fila segue a mesma regra
    expect(QUEUE_STAKES.pado).toEqual(QUEUE_STAKES.chips);
  });

  it('todo degrau dá dez big blinds de pilha: a mesa aperta pelo valor, não pelo número de mãos', () => {
    for (const t of BOT_TIERS) expect(t.mesa.stack / t.mesa.bigBlind, t.id).toBe(10);
  });
});

describe('a trava por nível', () => {
  it('o fácil vem com o jogo; normal abre no 5 e difícil no 20', () => {
    expect(botTier('easy').level).toBe(1);
    expect(botTier('normal').level).toBe(5);
    expect(botTier('hard').level).toBe(20);

    expect(tierUnlocked('easy', 1)).toBe(true);
    expect(tierUnlocked('normal', 4)).toBe(false);
    expect(tierUnlocked('normal', 5)).toBe(true);
    expect(tierUnlocked('hard', 19)).toBe(false);
    expect(tierUnlocked('hard', 20)).toBe(true);
  });

  it('os níveis exigidos ficam a uma distância que se alcança jogando', () => {
    // o difícil não pode ser um muro: umas poucas dezenas de partidas têm de bastar
    expect(xpForLevel(20)).toBeLessThan(20_000);
    expect(xpForLevel(5)).toBeLessThan(1000);
  });
});

describe('o prêmio em padocoin', () => {
  it('é 200 por terminar e 400 por vencer, mais cem por degrau', () => {
    expect(bonusPado('easy', false)).toBe(200);
    expect(bonusPado('easy', true)).toBe(400);
    expect(bonusPado('normal', false)).toBe(300);
    expect(bonusPado('normal', true)).toBe(500);
    expect(bonusPado('hard', false)).toBe(400);
    expect(bonusPado('hard', true)).toBe(600);
  });

  it('vencer sempre paga mais que terminar, em qualquer degrau', () => {
    for (const t of DIFFICULTIES) expect(bonusPado(t, true)).toBeGreaterThan(bonusPado(t, false));
  });
});

describe('a mesa que o servidor monta', () => {
  it('é sempre a mesma partida: normal, Hold’em, dez rodadas, 25s e três bots', () => {
    const s = botMatchSettings('normal', 'chips', true);
    expect(s.mode).toBe('normal');
    expect(s.variant).toBe('holdem');
    expect(s.rounds).toBe(10);
    expect(s.turnTime).toBe(25);
    expect(s.pace).toBe(1);
    expect(s.maxPlayers).toBe(BOT_MATCH.bots + 1);
    // não entra na lista de mesas: é partida de um jogador só
    expect(s.listed).toBe(false);
  });

  it('o buy-in é a pilha do degrau, e sem conta não se cobra nada', () => {
    expect(botMatchSettings('hard', 'chips', true).buyIn).toBe(10_000);
    expect(botMatchSettings('hard', 'chips', false).buyIn).toBe(0);
    // em padocoin é o mesmo número — e é por isso que a mesma mesa custa muito mais lá
    expect(botMatchSettings('hard', 'pado', true).buyIn).toBe(10_000);
  });

  it('não é Custom: sair no meio custa as fichas', () => {
    for (const t of DIFFICULTIES) expect(botMatchSettings(t, 'chips', true).custom, t).toBe(false);
  });

  it('só o fácil em fichas é o recomeço', () => {
    expect(botMatchSettings('easy', 'chips', true).recomeco).toBe(true);
    expect(botMatchSettings('normal', 'chips', true).recomeco).toBe(false);
    // nunca em padocoin: seria imprimir dinheiro de verdade
    expect(botMatchSettings('easy', 'pado', true).recomeco).toBe(false);
  });

  it('a mesa passa inteira pela peneira das configurações', () => {
    for (const t of DIFFICULTIES) {
      const pedido = botMatchSettings(t, 'chips', true);
      const limpo = sanitizeSettings(pedido);
      expect(limpo.startingStack, t).toBe(pedido.startingStack);
      expect(limpo.bigBlind, t).toBe(pedido.bigBlind);
      expect(limpo.smallBlind, t).toBe(pedido.smallBlind);
      expect(limpo.rounds, t).toBe(pedido.rounds);
      expect(limpo.turnTime, t).toBe(pedido.turnTime);
      expect(limpo.custom, t).toBe(false);
      expect(limpo.difficulty, t).toBe(t);
      expect(limpo.recomeco, t).toBe(pedido.recomeco);
    }
  });

  it('recomeço e "custom: false" não entram por uma mesa pedida de fora', () => {
    // um cliente esperto mandando o pedido na mão não ganha mesa de graça nem regra de outra mesa
    const limpo = sanitizeSettings({ recomeco: true, currency: 'pado' } as never);
    expect(limpo.recomeco).toBe(false);
    // e o que chega sem dizer nada é Custom: quem perde fichas ao sair é só quem pediu a regra
    expect(sanitizeSettings({} as never).custom).toBe(true);
  });
});
