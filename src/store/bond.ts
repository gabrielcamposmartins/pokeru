import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { migrateStorageKey } from '../util/storage';
import { findCharacter } from '../../shared/styles';
import type { FalaSlot } from '../audio/voice';
import {
  BOND_POINTS,
  EMPTY_BOND,
  addBondLocal,
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
  /**
   * Progresso **local**, do jogo offline (id do personagem → números). Fica salvo no navegador.
   * Quando há servidor, ele não manda em nada: quem vale é `server`.
   */
  chars: Record<string, BondStats>;
  /**
   * Progresso que **o servidor** guarda para a conta. É a verdade enquanto a sessão durar: chega
   * no `hello` e a cada mudança, não é salvo aqui e some ao desconectar. Mexer no armazenamento
   * do navegador não libera recompensa nenhuma numa partida online.
   */
  server: Record<string, BondStats> | null;
  /** Fila dos corações completados à espera do anúncio. */
  pending: BondUnlock[];
  /** Pontos ganhos na partida atual, por personagem (para o placar final). */
  gain: Record<string, number>;
  award(charId: string, ev: BondEvent): void;
  /** Aplica o vínculo guardado no servidor (jogo online) — ele passa a mandar. */
  applyServer(chars: Record<string, BondStats>): void;
  /** Sai da sessão do servidor: o vínculo mostrado volta a ser o local. */
  clearServer(): void;
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
      server: null,
      pending: [],
      gain: {},
      award: (charId, ev) =>
        set((s) => {
          // com servidor na linha, quem pontua é ele (o cliente nem tenta)
          if (s.server) return {};
          const cur = s.chars[charId] ?? EMPTY_BOND;
          const next = addBondLocal(cur, ev);
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
          // a comparação é sempre com a foto anterior *do servidor*: o progresso local não conta
          for (const [char, next] of Object.entries(chars)) {
            const cur = s.server?.[char];
            if (cur && next.points > cur.points) gain[char] = (gain[char] ?? 0) + (next.points - cur.points);
            // sem foto anterior é a primeira da sessão: mostra o progresso sem anunciar nada
            if (cur) {
              for (let heart = heartsOf(cur.points) + 1; heart <= heartsOf(next.points); heart++) {
                unlocked.push({ id: unlockId++, char, heart });
              }
            }
          }
          return {
            // substitui, não mistura: o que o servidor não conhece, a conta não tem
            server: chars,
            gain,
            pending: unlocked.length ? [...s.pending, ...unlocked].slice(-MAX_PENDING) : s.pending,
          };
        }),
      clearServer: () => set({ server: null, gain: {} }),
      clearGain: () => set({ gain: {} }),
      reset: () => set({ chars: {}, server: null, pending: [], gain: {} }),
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

/**
 * De onde vem o vínculo mostrado: do servidor quando há sessão com conta, senão do progresso
 * local (offline). É uma função só para ninguém ler a fonte errada por engano.
 */
function source(s: { chars: Record<string, BondStats>; server: Record<string, BondStats> | null }): Record<string, BondStats> {
  return s.server ?? s.chars;
}

export function bondOf(charId: string): BondStats {
  return source(useBond.getState())[charId] ?? EMPTY_BOND;
}

export function bondPoints(charId: string): number {
  return bondOf(charId).points;
}

/** Vínculo com um personagem (reage às mudanças). */
export function useBondStats(charId: string): BondStats {
  return useBond((s) => source(s)[charId] ?? EMPTY_BOND);
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
