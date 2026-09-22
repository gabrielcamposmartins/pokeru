import { create } from 'zustand';
import type { Currency } from '../../shared/catalog';
import { useSession } from './session';

/**
 * O giro da roleta, do lado do cliente.
 *
 * O prêmio **não é decidido aqui**: o cliente pede `spin` e espera o `spun` do servidor, que já
 * cobrou o ticket e já entregou o item. Esta loja guarda só o estado da cena — girando, revelado —
 * para a tela poder se esconder e animar.
 *
 * A animação tem piso de tempo (`GIRO_MIN_MS`). A resposta do servidor costuma voltar em poucas
 * centenas de milissegundos, e revelar nesse tempo mataria a graça: o piso garante que o ticket
 * gire por um instante que se sinta, sem nunca **adiar** o que já chegou além do necessário.
 */

/** Quanto tempo o ticket gira, no mínimo, antes de virar prêmio. */
export const GIRO_MIN_MS = 2200;

export type GiroStatus = 'idle' | 'girando' | 'revelado';

interface Premio {
  /** Chave do prêmio no catálogo. */
  key: string;
  /** Já era dele: virou fichas. */
  dup: boolean;
  refund: number;
}

interface RoletaState {
  status: GiroStatus;
  /** Qual roleta está girando (ou revelou). */
  roulette: string | null;
  premio: Premio | null;
  /** Manda o giro ao servidor e entra na cena. */
  girar(roulette: string, currency: Currency): void;
  /** O servidor respondeu: revela, respeitando o piso da animação. */
  chegou(p: Premio): void;
  /** Sai da cena (fechar, ou erro do servidor). */
  fechar(): void;
}

let inicio = 0;
let revelar: ReturnType<typeof setTimeout> | null = null;

export const useRoleta = create<RoletaState>((set, get) => ({
  status: 'idle',
  roulette: null,
  premio: null,

  girar(roulette, currency) {
    if (get().status === 'girando') return;
    if (revelar) clearTimeout(revelar);
    inicio = Date.now();
    set({ status: 'girando', roulette, premio: null });
    useSession.getState().send({ type: 'spin', roulette, currency });
  },

  chegou(premio) {
    if (get().status !== 'girando') return;
    const falta = Math.max(0, GIRO_MIN_MS - (Date.now() - inicio));
    if (revelar) clearTimeout(revelar);
    revelar = setTimeout(() => {
      revelar = null;
      if (useRoleta.getState().status === 'girando') set({ status: 'revelado', premio });
    }, falta);
  },

  fechar() {
    if (revelar) clearTimeout(revelar);
    revelar = null;
    set({ status: 'idle', roulette: null, premio: null });
  },
}));
