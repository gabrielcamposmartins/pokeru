import { describe, expect, it } from 'vitest';
import { TEMPO_DE_ABRIR, tempoDeRepartir } from './ritmo';

describe('o ritmo das cartas', () => {
  it('repartir leva 0,3 s por carta, com um teto para as mesas de muitas cartas', () => {
    expect(tempoDeRepartir(4)).toBe(1200);
    expect(tempoDeRepartir(12)).toBe(3600);
    // (o poker de 5 cartas com seis na mesa: trinta cartas não levam nove segundos)
    expect(tempoDeRepartir(30)).toBe(4500);
  });

  it('abrir o flop leva mais do que abrir uma carta', () => {
    expect(TEMPO_DE_ABRIR.flop).toBeGreaterThan(TEMPO_DE_ABRIR.uma);
  });
});
