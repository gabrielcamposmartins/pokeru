import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  EMPTY_STATS,
  availableTitles,
  findAchievement,
  isUnlocked,
  playerLevel,
  progressOf,
  sanitizeStats,
  sanitizeTitle,
  unlockedIds,
  xpOf,
  type PlayerStats,
} from './achievements';

const stats = (over: Partial<PlayerStats> = {}): PlayerStats => ({ ...EMPTY_STATS, ...over });

describe('catálogo', () => {
  it('não tem id nem título repetido', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    expect(new Set(ACHIEVEMENTS.map((a) => a.title)).size).toBe(ACHIEVEMENTS.length);
  });

  it('toda conquista pede um número positivo', () => {
    for (const a of ACHIEVEMENTS) expect(a.need).toBeGreaterThan(0);
  });

  it('acha por id', () => {
    expect(findAchievement('first-hand')?.title).toBe('Novato da Mesa');
    expect(findAchievement('nao-existe')).toBeUndefined();
  });
});

describe('desbloqueio', () => {
  it('conta zerada não libera nada', () => {
    expect(unlockedIds(EMPTY_STATS)).toEqual([]);
    expect(availableTitles(EMPTY_STATS)).toEqual([]);
  });

  it('uma mão joga o primeiro título', () => {
    expect(availableTitles(stats({ hands: 1 }))).toEqual(['Novato da Mesa']);
  });

  it('as trilhas acumulam em vez de substituir', () => {
    const t = availableTitles(stats({ hands: 1000 }));
    expect(t).toContain('Novato da Mesa');
    expect(t).toContain('Frequentador');
    expect(t).toContain('Veterano do Feltro');
  });

  it('o contador certo é o que conta', () => {
    // mãos não liberam título de vitória
    expect(availableTitles(stats({ hands: 999 }))).not.toContain('Primeiro Pote');
    expect(availableTitles(stats({ wins: 1 }))).toContain('Primeiro Pote');
  });

  it('exatamente na meta já vale', () => {
    const a = findAchievement('regular')!;
    expect(isUnlocked(a, stats({ hands: 99 }))).toBe(false);
    expect(isUnlocked(a, stats({ hands: 100 }))).toBe(true);
  });
});

describe('progresso', () => {
  it('vai de 0 a 1 e não passa disso', () => {
    const a = findAchievement('regular')!;
    expect(progressOf(a, EMPTY_STATS)).toBe(0);
    expect(progressOf(a, stats({ hands: 50 }))).toBeCloseTo(0.5);
    expect(progressOf(a, stats({ hands: 500 }))).toBe(1);
  });
});

describe('título equipado', () => {
  it('só aceita título que a conta liberou', () => {
    const s = stats({ hands: 1 });
    expect(sanitizeTitle('Novato da Mesa', s)).toBe('Novato da Mesa');
    expect(sanitizeTitle('Tubarão', s)).toBeNull();
  });

  it('recusa lixo', () => {
    const s = stats({ hands: 1000, wins: 1000 });
    expect(sanitizeTitle('', s)).toBeNull();
    expect(sanitizeTitle(null, s)).toBeNull();
    expect(sanitizeTitle(42, s)).toBeNull();
    expect(sanitizeTitle('Título Inventado', s)).toBeNull();
  });

  it('título que deixou de valer cai para null', () => {
    // a conta tinha o título, mas os contadores não sustentam mais (lista mudou)
    expect(sanitizeTitle('Imbatível', stats({ matchWins: 1 }))).toBeNull();
  });
});

describe('sanitizeStats', () => {
  it('preenche o que falta e limpa o que não é número', () => {
    expect(sanitizeStats({ hands: 5, wins: '3', folds: -2, allIns: null, lixo: 9 })).toEqual({
      ...EMPTY_STATS,
      hands: 5,
      wins: 3,
    });
  });

  it('aceita entrada inútil sem quebrar', () => {
    expect(sanitizeStats(undefined)).toEqual(EMPTY_STATS);
    expect(sanitizeStats('nao e objeto')).toEqual(EMPTY_STATS);
  });

  it('corta fracionário', () => {
    expect(sanitizeStats({ hands: 7.9 }).hands).toBe(7);
  });
});

describe('nível do jogador', () => {
  it('começa no 1 e sobe com o que a pessoa jogou', () => {
    expect(playerLevel(EMPTY_STATS)).toBe(1);
    // 40 de xp é o nível 2: 40 mãos, ou 4 partidas terminadas
    expect(playerLevel({ ...EMPTY_STATS, hands: 39 })).toBe(1);
    expect(playerLevel({ ...EMPTY_STATS, hands: 40 })).toBe(2);
    expect(playerLevel({ ...EMPTY_STATS, matches: 4 })).toBe(2);
    // a curva é de raiz: cada nível pede mais que o anterior
    expect(playerLevel({ ...EMPTY_STATS, hands: 160 })).toBe(3);
    expect(playerLevel({ ...EMPTY_STATS, hands: 360 })).toBe(4);
  });

  it('ganhar vale mais que só jogar', () => {
    const jogou = xpOf({ ...EMPTY_STATS, hands: 10 });
    const ganhou = xpOf({ ...EMPTY_STATS, hands: 10, wins: 10 });
    expect(ganhou).toBeGreaterThan(jogou);
    // contador que não dá xp (fold) não mexe no nível
    expect(xpOf({ ...EMPTY_STATS, folds: 500 })).toBe(0);
  });
});
