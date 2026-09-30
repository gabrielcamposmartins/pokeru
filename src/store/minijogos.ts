import { create } from 'zustand';
import type { Minijogo } from '../../shared/minijogos';
import type { PremioMinijogo } from '../../shared/accounts';
import { useSession } from './session';

/**
 * Os prêmios dos minijogos, do lado do cliente.
 *
 * **O prêmio não é decidido aqui.** O jogo avisa que passou de nível (`avisarNivel`) e o servidor
 * responde se aquilo rendeu fichas e padocoins (shared/minijogos.ts tem a regra). Esta loja guarda
 * a resposta — para o quadro de "nível concluído" mostrar o que entrou — e a soma da sessão.
 */

export interface Premio extends PremioMinijogo {
  jogo: Minijogo;
  nivel: number;
  /** Só para a tela saber que chegou um novo (dois prêmios iguais seguidos). */
  id: number;
}

interface MinijogosState {
  /** A última resposta do servidor (ou o aviso de que não há conta para premiar). */
  ultimo: Premio | null;
  /** O que entrou desde que a tela dos minijogos abriu. */
  sessao: { fichas: number; pado: number; niveis: number };
  /** Manda ao servidor o nível passado. Sem conta conectada, responde na hora que não há prêmio. */
  avisarNivel(jogo: Minijogo, nivel: number): void;
  /** O servidor respondeu. */
  chegou(p: Omit<Premio, 'id'>): void;
  zerarSessao(): void;
}

let seq = 0;

export const useMinijogos = create<MinijogosState>((set) => ({
  ultimo: null,
  sessao: { fichas: 0, pado: 0, niveis: 0 },
  avisarNivel(jogo, nivel) {
    const s = useSession.getState();
    if (s.status !== 'connected' || !s.account) {
      set({ ultimo: { jogo, nivel, fichas: 0, pado: 0, motivo: 'entre com uma conta para ganhar fichas e padocoins', id: ++seq } });
      return;
    }
    s.send({ type: 'minijogoNivel', jogo, nivel });
  },
  chegou(p) {
    set((st) => ({
      ultimo: { ...p, id: ++seq },
      sessao: p.fichas || p.pado ? { fichas: st.sessao.fichas + p.fichas, pado: st.sessao.pado + p.pado, niveis: st.sessao.niveis + 1 } : st.sessao,
    }));
  },
  zerarSessao: () => set({ sessao: { fichas: 0, pado: 0, niveis: 0 }, ultimo: null }),
}));

