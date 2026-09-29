import { create } from 'zustand';
import type { Ranking } from '../../shared/ranking';
import { useSession } from './session';

/**
 * O ranking, do lado do cliente: quem monta é o servidor (shared/ranking.ts); aqui fica a última
 * resposta, para a tela desenhar, e se há um pedido no caminho.
 */
interface RankingState {
  ranking: Ranking | null;
  carregando: boolean;
  /** Pede o ranking ao servidor (sem conexão, não há o que pedir). */
  pedir(): void;
  chegou(r: Ranking): void;
}

export const useRanking = create<RankingState>((set) => ({
  ranking: null,
  carregando: false,
  pedir() {
    const s = useSession.getState();
    if (s.status !== 'connected') return;
    set({ carregando: true });
    s.send({ type: 'ranking' });
    // se o servidor não responder (servidor antigo, sem a mensagem), a tela não fica girando para sempre
    setTimeout(() => set({ carregando: false }), 6000);
  },
  chegou: (ranking) => set({ ranking, carregando: false }),
}));
