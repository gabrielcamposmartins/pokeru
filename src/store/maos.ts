import { create } from 'zustand';
import type { MaoDaPartida } from '../../shared/historico';

/**
 * O histórico das mãos, do lado do cliente (shared/historico.ts).
 *
 * Duas fontes: a mesa em andamento, que manda o histórico inteiro a cada mão que acaba, e as
 * partidas do perfil, pedidas ao servidor quando alguém abre uma delas (`maosDaPartida`).
 */

/** A chave de uma partida do perfil: de quem e quando. */
export const chaveDaPartida = (conta: string, at: string) => `${conta}|${at}`;

interface MaosState {
  /** As mãos da partida em andamento. */
  daMesa: MaoDaPartida[];
  /** As partidas do perfil já pedidas: undefined = não pedida, 'carregando', null = sem registro. */
  daPartida: Record<string, MaoDaPartida[] | null | 'carregando'>;
  setDaMesa(maos: MaoDaPartida[]): void;
  limparMesa(): void;
  pedindo(conta: string, at: string): void;
  chegou(conta: string, at: string, maos: MaoDaPartida[] | null): void;
}

export const useMaos = create<MaosState>((set) => ({
  daMesa: [],
  daPartida: {},
  setDaMesa: (maos) => set({ daMesa: maos }),
  limparMesa: () => set({ daMesa: [] }),
  pedindo: (conta, at) => set((s) => ({ daPartida: { ...s.daPartida, [chaveDaPartida(conta, at)]: 'carregando' } })),
  chegou: (conta, at, maos) => set((s) => ({ daPartida: { ...s.daPartida, [chaveDaPartida(conta, at)]: maos } })),
}));
