import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { findCharacter } from '../../shared/styles';
import type { FalaSlot } from '../audio/voice';
import {
  BOND_POINTS,
  bondLevel,
  heartsOf,
  rewardAt,
  voiceUnlockedAt,
  type BondEvent,
  type BondLevel,
  type BondReward,
} from '../game/bond';

/** O que você acumulou jogando com um personagem. */
export interface BondStats {
  points: number;
  /** Mãos ganhas. */
  wins: number;
  /** Mãos disputadas e perdidas (chegou ao fim e não levou o pote). */
  losses: number;
  /** Mãos em que você desistiu. */
  folds: number;
  hands: number;
  matches: number;
}

export const EMPTY_BOND: BondStats = { points: 0, wins: 0, losses: 0, folds: 0, hands: 0, matches: 0 };

/** Coração completado que ainda não foi anunciado. */
export interface BondUnlock {
  id: number;
  char: string;
  heart: number;
}

interface BondState {
  /** Progresso por personagem (id do personagem → números). */
  chars: Record<string, BondStats>;
  /** Fila dos corações completados à espera do anúncio. */
  pending: BondUnlock[];
  /** Pontos ganhos na partida atual, por personagem (para o placar final). */
  gain: Record<string, number>;
  award(charId: string, ev: BondEvent): void;
  /** Tira o primeiro aviso da fila (o jogador viu a recompensa). */
  ack(): void;
  /** Zera o ganho da partida (começo de uma partida nova). */
  clearGain(): void;
  reset(): void;
}

/** Quanto cada momento mexe nos contadores, além dos pontos. */
const COUNTERS: Record<BondEvent, Partial<BondStats>> = {
  win: { wins: 1, hands: 1 },
  bigWin: { wins: 1, hands: 1 },
  loss: { losses: 1, hands: 1 },
  fold: { folds: 1, hands: 1 },
  match: { matches: 1 },
  matchWin: { matches: 1 },
};

/** Avisos guardados na fila (o resto é descartado: ninguém completa cinco corações de uma vez). */
const MAX_PENDING = 5;

let unlockId = 1;

export const useBond = create<BondState>()(
  persist(
    (set) => ({
      chars: {},
      pending: [],
      gain: {},
      award: (charId, ev) =>
        set((s) => {
          const cur = s.chars[charId] ?? EMPTY_BOND;
          const points = cur.points + BOND_POINTS[ev];
          const next: BondStats = { ...cur, ...sum(cur, COUNTERS[ev]), points };
          // corações que fecharam agora entram na fila do anúncio
          const unlocked: BondUnlock[] = [];
          for (let heart = heartsOf(cur.points) + 1; heart <= heartsOf(points); heart++) {
            unlocked.push({ id: unlockId++, char: charId, heart });
          }
          return {
            chars: { ...s.chars, [charId]: next },
            gain: { ...s.gain, [charId]: (s.gain[charId] ?? 0) + BOND_POINTS[ev] },
            pending: unlocked.length ? [...s.pending, ...unlocked].slice(-MAX_PENDING) : s.pending,
          };
        }),
      ack: () => set((s) => ({ pending: s.pending.slice(1) })),
      clearGain: () => set({ gain: {} }),
      reset: () => set({ chars: {}, pending: [], gain: {} }),
    }),
    {
      name: 'pokersoul-bond',
      version: 1,
      // a fila de avisos e o ganho da partida são do momento: não voltam ao abrir o jogo
      partialize: (s) => ({ chars: s.chars }),
    },
  ),
);

function sum(cur: BondStats, delta: Partial<BondStats>): Partial<BondStats> {
  const out: Partial<BondStats> = {};
  for (const [k, v] of Object.entries(delta) as [keyof BondStats, number][]) out[k] = cur[k] + v;
  return out;
}

// ------------------------------------------------------------------ leitura

export function bondOf(charId: string): BondStats {
  return useBond.getState().chars[charId] ?? EMPTY_BOND;
}

export function bondPoints(charId: string): number {
  return bondOf(charId).points;
}

/** Vínculo com um personagem (reage às mudanças). */
export function useBondStats(charId: string): BondStats {
  return useBond((s) => s.chars[charId] ?? EMPTY_BOND);
}

export function useBondLevel(charId: string): BondLevel {
  return bondLevel(useBondStats(charId).points);
}

/** A recompensa do coração que acabou de fechar. */
export function unlockReward(u: BondUnlock): BondReward | null {
  return rewardAt(findCharacter(u.char), u.heart);
}

/** A fala própria `slot` do personagem está liberada pelo vínculo? (só o personagem do jogador tem vínculo) */
export function voiceUnlocked(charId: string, slot: FalaSlot): boolean {
  return voiceUnlockedAt(findCharacter(charId), bondPoints(charId), slot);
}
