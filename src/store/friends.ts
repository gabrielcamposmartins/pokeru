import { create } from 'zustand';
import type { FriendInfo, PartyInfo } from '../../shared/friends';
import { useSession } from './session';

/**
 * Amigos e grupo, do lado do cliente.
 *
 * **Nada aqui é decidido aqui.** A lista, os pedidos e o grupo chegam do servidor (`friends`,
 * `party`), e esta loja só guarda a última foto que veio — quem é amigo de quem, e quem está
 * online, é resposta do servidor. As funções abaixo mandam pedidos; o que volta é o que vale.
 *
 * As amizades são por **código**, nunca por nome: nome se troca em Configurações, e uma lista
 * guardada por nome apontaria para a pessoa errada no dia seguinte (veja shared/friends.ts).
 */

/** Um convite de grupo esperando resposta. */
export interface Convite {
  party: string;
  from: string;
  name: string;
}

interface FriendsState {
  friends: FriendInfo[];
  /** Pedidos recebidos. */
  incoming: FriendInfo[];
  /** Pedidos enviados, ainda sem resposta. */
  outgoing: FriendInfo[];
  party: PartyInfo | null;
  convite: Convite | null;
  aplicar(l: { friends: FriendInfo[]; incoming: FriendInfo[]; outgoing: FriendInfo[] }): void;
  setParty(p: PartyInfo | null): void;
  setConvite(c: Convite | null): void;
  limpar(): void;
}

export const useFriends = create<FriendsState>((set) => ({
  friends: [],
  incoming: [],
  outgoing: [],
  party: null,
  convite: null,
  aplicar: (l) => set({ friends: l.friends, incoming: l.incoming, outgoing: l.outgoing }),
  setParty: (party) => set({ party, ...(party ? { convite: null } : {}) }),
  setConvite: (convite) => set({ convite }),
  limpar: () => set({ friends: [], incoming: [], outgoing: [], party: null, convite: null }),
}));

const send = (m: Parameters<ReturnType<typeof useSession.getState>['send']>[0]) => useSession.getState().send(m);

/** Pede a lista de novo (a tela pede ao abrir, para não depender de quando a conexão nasceu). */
export const pedirAmigos = (): void => send({ type: 'friends' });

/** Pede amizade por código. */
export const pedirAmizade = (code: string): void => send({ type: 'friendAdd', code });

export const aceitarAmizade = (id: string): void => send({ type: 'friendAccept', id });
/** Recusa um pedido recebido, ou cancela um enviado. */
export const recusarAmizade = (id: string): void => send({ type: 'friendDecline', id });
export const desfazerAmizade = (id: string): void => send({ type: 'friendRemove', id });

export const chamarParaGrupo = (id: string): void => send({ type: 'partyInvite', id });
export const aceitarGrupo = (party: string): void => send({ type: 'partyAccept', party });
export const recusarGrupo = (party: string): void => send({ type: 'partyDecline', party });
export const sairDoGrupo = (): void => send({ type: 'partyLeave' });

/** O líder manda o grupo jogar. Em `custom`, a mesa é a próxima que ele criar. */
export const jogarEmGrupo = (kind: 'bots' | 'queue', difficulty?: 'easy' | 'normal' | 'hard', currency?: 'chips' | 'pado'): void =>
  send({ type: 'partyStart', kind, difficulty, currency });

// ------------------------------------------------------------------ leituras

/** Quantos pedidos esperando resposta — é o número na bolinha do menu. */
export function usePedidos(): number {
  return useFriends((s) => s.incoming.length);
}

/** Estou num grupo? */
export function useNoGrupo(): boolean {
  return useFriends((s) => !!s.party);
}

/** Sou o líder do grupo? (sem grupo, não há liderança) */
export function useSouLider(): boolean {
  const party = useFriends((s) => s.party);
  const eu = useSession((s) => s.account?.id);
  return !!party && !!eu && party.leader === eu;
}
