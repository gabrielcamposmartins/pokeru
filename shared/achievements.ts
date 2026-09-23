/**
 * Conquistas e títulos do **jogador**.
 *
 * Título não se compra: cada um vem de uma conquista, e conquista é um contador que
 * chegou na meta. Guardar só os contadores (e não a lista de conquistas) faz o
 * desbloqueio ser sempre recalculável — nada de migração quando a lista mudar, e
 * uma conquista nova já vale para quem tem o número.
 *
 * Os contadores sobem no servidor (shared/room.ts chama `bank.note`); o cliente só
 * mostra o que recebe.
 */

/** Contadores de uma conta. Tudo por jogador, não por personagem. */
export interface PlayerStats {
  /** Mãos jogadas até o fim (sem contar as que a pessoa nem recebeu carta). */
  hands: number;
  /** Mãos ganhas. */
  wins: number;
  /** Partidas terminadas. */
  matches: number;
  /** Mãos em que desistiu. */
  folds: number;
  /** Vezes que foi de all-in. */
  allIns: number;
  /** Vitórias com mão grande (trinca para cima). */
  bigWins: number;
  /** Mãos que chegaram ao showdown. */
  showdowns: number;
  /** Partidas ganhas (1º lugar). */
  matchWins: number;
}

export const EMPTY_STATS: PlayerStats = {
  hands: 0,
  wins: 0,
  matches: 0,
  folds: 0,
  allIns: 0,
  bigWins: 0,
  showdowns: 0,
  matchWins: 0,
};

/** Momento que faz um contador subir. */
export type StatEvent = keyof PlayerStats;

export const STAT_EVENTS: readonly StatEvent[] = [
  'hands',
  'wins',
  'matches',
  'folds',
  'allIns',
  'bigWins',
  'showdowns',
  'matchWins',
];

export interface Achievement {
  id: string;
  /** Nome da conquista. */
  name: string;
  /** Como se consegue, em uma linha. */
  hint: string;
  /** Título que ela libera. */
  title: string;
  /** Contador que conta. */
  of: StatEvent;
  /** Meta. */
  need: number;
  /**
   * Quão difícil é de conseguir, de 1 (comum) a 5 (lendário).
   *
   * É juízo, não conta: 100 mãos jogadas e 100 desistências pedem o mesmo número, mas não o mesmo
   * tanto de jogo. Por isso o grau está escrito aqui, item por item, em vez de sair de uma fórmula
   * sobre `need` — que acertaria numas trilhas e erraria em outras. É o grau que pinta o título.
   */
  tier: 1 | 2 | 3 | 4 | 5;
}

/**
 * A lista. Ordem = ordem de exibição, do mais fácil ao mais difícil dentro de cada trilha.
 * Mexer em `need` ou acrescentar linhas é seguro: o desbloqueio é recalculado do contador.
 */
export const ACHIEVEMENTS: readonly Achievement[] = [
  // presença
  { id: 'first-hand', name: 'Primeira mão', hint: 'Jogue uma mão até o fim.', title: 'Novato da Mesa', of: 'hands', need: 1, tier: 1 },
  { id: 'regular', name: 'Presença', hint: 'Jogue 100 mãos.', title: 'Frequentador', of: 'hands', need: 100, tier: 2 },
  { id: 'veteran', name: 'Veterania', hint: 'Jogue 1.000 mãos.', title: 'Veterano do Feltro', of: 'hands', need: 1000, tier: 4 },

  // potes
  { id: 'first-pot', name: 'Primeiro pote', hint: 'Ganhe uma mão.', title: 'Primeiro Pote', of: 'wins', need: 1, tier: 1 },
  { id: 'pot-collector', name: 'Colecionador', hint: 'Ganhe 50 mãos.', title: 'Colecionador de Potes', of: 'wins', need: 50, tier: 3 },
  { id: 'shark', name: 'Tubarão', hint: 'Ganhe 500 mãos.', title: 'Tubarão', of: 'wins', need: 500, tier: 5 },

  // mãos grandes
  { id: 'golden-hand', name: 'Mão de ouro', hint: 'Ganhe com trinca ou melhor.', title: 'Mão de Ouro', of: 'bigWins', need: 1, tier: 2 },
  { id: 'showdown-legend', name: 'Lenda', hint: 'Ganhe 25 vezes com mão grande.', title: 'Lenda do Showdown', of: 'bigWins', need: 25, tier: 4 },

  // coragem
  { id: 'fearless', name: 'Sem medo', hint: 'Vá de all-in uma vez.', title: 'Sem Medo', of: 'allIns', need: 1, tier: 1 },
  { id: 'all-or-nothing', name: 'Tudo ou nada', hint: 'Vá de all-in 50 vezes.', title: 'Tudo ou Nada', of: 'allIns', need: 50, tier: 3 },

  // leitura
  { id: 'stone-patience', name: 'Paciência', hint: 'Desista de 100 mãos — saber sair também é jogar.', title: 'Paciência de Pedra', of: 'folds', need: 100, tier: 3 },
  { id: 'face-to-face', name: 'Cara a cara', hint: 'Chegue ao showdown 50 vezes.', title: 'Cara a Cara', of: 'showdowns', need: 50, tier: 3 },

  // partidas
  { id: 'marathon', name: 'Maratona', hint: 'Termine 10 partidas.', title: 'Maratonista', of: 'matches', need: 10, tier: 2 },
  { id: 'champion', name: 'Campeão', hint: 'Ganhe uma partida.', title: 'Campeão', of: 'matchWins', need: 1, tier: 2 },
  { id: 'unbeaten', name: 'Invicto', hint: 'Ganhe 25 partidas.', title: 'Imbatível', of: 'matchWins', need: 25, tier: 5 },
];

/**
 * Quanto cada coisa vale de experiência. Mão jogada é o chão; partida terminada vale mais porque
 * custa tempo, e ganhar a partida vale mais ainda.
 */
export const XP = { hands: 1, wins: 3, matches: 10, matchWins: 25 } as const satisfies Partial<Record<StatEvent, number>>;

/** Experiência acumulada da conta. */
export function xpOf(stats: PlayerStats): number {
  let xp = 0;
  for (const [k, peso] of Object.entries(XP)) xp += (stats[k as StatEvent] ?? 0) * peso;
  return xp;
}

/** O nível de uma quantidade de experiência (a mesma curva de `playerLevel`). */
export function levelOfXp(xp: number): number {
  return 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 40));
}

/**
 * Nível do jogador, dos mesmos contadores das conquistas — nada de guardar nível à parte, que
 * poderia discordar do resto.
 *
 * A curva é de raiz: cada nível pede mais que o anterior (nível 2 com 40 de xp, 3 com 160, 4 com
 * 360…), então o número cresce rápido no começo e devagar depois. Começa em 1.
 */
export function playerLevel(stats: PlayerStats): number {
  return levelOfXp(xpOf(stats));
}

/**
 * Experiência que um nível exige — o inverso da curva de `playerLevel`.
 *
 * Nível 1 começa em 0, o 2 pede 40, o 3 pede 160, o 4 pede 360. É esta conta que transforma o
 * nível num **progresso**: sem ela a barra do menu não saberia onde o nível começa nem acaba.
 */
export function xpForLevel(level: number): number {
  const n = Math.max(1, Math.floor(level));
  return 40 * (n - 1) ** 2;
}

/** Onde o nível está: o total, o que já andou dentro do nível e o que ele pede. */
export interface LevelInfo {
  level: number;
  /** Experiência acumulada da conta. */
  xp: number;
  /** Experiência dentro do nível atual. */
  into: number;
  /** Experiência que o nível atual pede por inteiro. */
  need: number;
  /** Quanto do nível já andou, de 0 a 1. */
  progress: number;
}

export function levelInfo(stats: PlayerStats): LevelInfo {
  return levelInfoOfXp(xpOf(stats));
}

/** Onde uma quantidade de experiência está na escada — é o que o placar usa para o antes e o depois. */
export function levelInfoOfXp(xp: number): LevelInfo {
  const level = levelOfXp(xp);
  const base = xpForLevel(level);
  const need = xpForLevel(level + 1) - base;
  const into = xp - base;
  return { level, xp, into, need, progress: need > 0 ? into / need : 1 };
}

export function findAchievement(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/** A conquista que dá aquele título (os títulos são únicos na lista). */
export function achievementOfTitle(title: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.title === title);
}

/** Grau de dificuldade do título, de 1 a 5. Título que não existe mais na lista vale 1. */
export function titleTier(title: string | null | undefined): 1 | 2 | 3 | 4 | 5 {
  return title ? (achievementOfTitle(title)?.tier ?? 1) : 1;
}

/** Quanto do caminho já andou, de 0 a 1. */
export function progressOf(a: Achievement, stats: PlayerStats): number {
  if (a.need <= 0) return 1;
  return Math.min(1, (stats[a.of] ?? 0) / a.need);
}

export function isUnlocked(a: Achievement, stats: PlayerStats): boolean {
  return (stats[a.of] ?? 0) >= a.need;
}

export function unlockedIds(stats: PlayerStats): string[] {
  return ACHIEVEMENTS.filter((a) => isUnlocked(a, stats)).map((a) => a.id);
}

/** Títulos que o jogador pode usar, na ordem da lista. */
export function availableTitles(stats: PlayerStats): string[] {
  return ACHIEVEMENTS.filter((a) => isUnlocked(a, stats)).map((a) => a.title);
}

/**
 * O título equipado, se ainda valer. Um título que o jogador não desbloqueou (ou que saiu
 * da lista) vira `null` em vez de aparecer na mesa — a checagem é a mesma no cliente e no
 * servidor, então não há como forjar um pelo `hello`.
 */
export function sanitizeTitle(v: unknown, stats: PlayerStats): string | null {
  if (typeof v !== 'string' || !v) return null;
  return availableTitles(stats).includes(v) ? v : null;
}

/** Contadores vindos de fora (disco, rede): o que não for número vira 0. */
export function sanitizeStats(v: unknown): PlayerStats {
  const o = (typeof v === 'object' && v ? v : {}) as Record<string, unknown>;
  const num = (x: unknown): number => {
    const n = typeof x === 'number' ? x : Number(x);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  };
  const out = { ...EMPTY_STATS };
  for (const k of STAT_EVENTS) out[k] = num(o[k]);
  return out;
}
