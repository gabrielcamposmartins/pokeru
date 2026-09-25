/**
 * Títulos do jogador, do lado do cliente.
 *
 * Quem manda é o servidor: os contadores e o título equipado chegam na conta
 * (`AccountInfo`), e é dela que tudo aqui é derivado. O cliente só pede a troca;
 * se pedir um título que as conquistas não sustentam, o servidor devolve o que
 * valia antes.
 */

import {
  ACHIEVEMENTS,
  EMPTY_STATS,
  availableTitles,
  isUnlocked,
  progressOf,
  type Achievement,
  type PlayerStats,
} from '../../shared/achievements';
import { useSession } from './session';

/** Contadores da conta; zerados quando não há conta (offline). */
export function useMyStats(): PlayerStats {
  return useSession((s) => s.account?.stats ?? EMPTY_STATS);
}

/** Título equipado, ou null. */
export function useMyTitle(): string | null {
  return useSession((s) => s.account?.title ?? null);
}

/** Títulos que a conta já liberou. */
export function useMyTitles(): string[] {
  const stats = useMyStats();
  return availableTitles(stats);
}

export interface AchievementRow {
  a: Achievement;
  done: boolean;
  /** 0 a 1. */
  progress: number;
  /** Contador atual, para mostrar "37 / 100". */
  have: number;
}

/** A lista inteira com o progresso de cada uma — conquistadas primeiro. */
export function useAchievements(): AchievementRow[] {
  return achievementRows(useMyStats());
}

/** As conquistas de quaisquer contadores (as minhas, ou as de um amigo no perfil dele). */
export function achievementRows(stats: PlayerStats): AchievementRow[] {
  const rows = ACHIEVEMENTS.map((a) => ({
    a,
    done: isUnlocked(a, stats),
    progress: progressOf(a, stats),
    have: stats[a.of] ?? 0,
  }));
  return [...rows].sort((x, y) => (x.done === y.done ? y.progress - x.progress : x.done ? -1 : 1));
}

/** Pede a troca do título. `null` tira o título. */
export function equipTitle(title: string | null): void {
  useSession.getState().send({ type: 'setTitle', title });
}
