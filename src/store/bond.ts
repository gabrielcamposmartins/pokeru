import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { migrateStorageKey } from '../util/storage';
import { findCharacter } from '../../shared/styles';
import type { FalaSlot } from '../audio/voice';
import {
  BOND_POINTS,
  EMPTY_BOND,
  addBond,
  bondLevel,
  heartsOf,
  rewardAt,
  voiceUnlockedAt,
  type BondEvent,
  type BondLevel,
  type BondReward,
  type BondStats,
} from '../game/bond';

export { EMPTY_BOND, type BondStats };

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
  /** Aplica o vínculo guardado no servidor (jogo online). */
  applyServer(chars: Record<string, BondStats>): void;
  /** Tira o primeiro aviso da fila (o jogador viu a recompensa). */
  ack(): void;
  /** Zera o ganho da partida (começo de uma partida nova). */
  clearGain(): void;
  reset(): void;
}

/** Avisos guardados na fila (o resto é descartado: ninguém completa cinco corações de uma vez). */
const MAX_PENDING = 5;

let unlockId = 1;

// o nome mudou (PokerSoul → Pokeru): traz o vínculo que já estava salvo
migrateStorageKey('pokersoul-bond', 'pokeru-bond');

export const useBond = create<BondState>()(
  persist(
    (set) => ({
      chars: {},
      pending: [],
      gain: {},
      award: (charId, ev) =>
        set((s) => {
          const cur = s.chars[charId] ?? EMPTY_BOND;
          const next = addBond(cur, ev);
          const points = next.points;
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
      /**
       * Vínculo que veio do servidor hospedado (ele é o dono do progresso quando você joga online).
       * Substitui as fichas dos personagens que chegaram, anuncia os corações que fecharam e soma
       * o ganho da sessão — o mesmo que `award` faz, mas com as contas já feitas do outro lado.
       */
      applyServer: (chars) =>
        set((s) => {
          const unlocked: BondUnlock[] = [];
          const gain = { ...s.gain };
          for (const [char, next] of Object.entries(chars)) {
            const cur = s.chars[char];
            if (cur && next.points > cur.points) gain[char] = (gain[char] ?? 0) + (next.points - cur.points);
            const from = cur ? heartsOf(cur.points) : 0;
            // sem ficha anterior é a primeira foto da conta: mostra o progresso sem anunciar nada
            if (cur) for (let heart = from + 1; heart <= heartsOf(next.points); heart++) unlocked.push({ id: unlockId++, char, heart });
          }
          return {
            chars: { ...s.chars, ...chars },
            gain,
            pending: unlocked.length ? [...s.pending, ...unlocked].slice(-MAX_PENDING) : s.pending,
          };
        }),
      clearGain: () => set({ gain: {} }),
      reset: () => set({ chars: {}, pending: [], gain: {} }),
    }),
    {
      name: 'pokeru-bond',
      version: 1,
      // a fila de avisos e o ganho da partida são do momento: não voltam ao abrir o jogo
      partialize: (s) => ({ chars: s.chars }),
    },
  ),
);

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
