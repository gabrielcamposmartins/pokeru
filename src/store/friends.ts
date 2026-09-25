import { create } from 'zustand';
import type { FriendInfo, PartyInfo, PerfilPublico } from '../../shared/friends';
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

/** Um amigo chamou para a sala dele. */
export interface ConviteSala {
  room: string;
  from: string;
  name: string;
  /** Nome da sala, para o convite dizer para onde. */
  sala: string;
}

interface FriendsState {
  friends: FriendInfo[];
  /** Pedidos recebidos. */
  incoming: FriendInfo[];
  /** Pedidos enviados, ainda sem resposta. */
  outgoing: FriendInfo[];
  party: PartyInfo | null;
  convite: Convite | null;
  conviteSala: ConviteSala | null;
  /** Perfil de amigo aberto: o id pedido, e o perfil quando ele chega. */
  perfilDe: string | null;
  perfil: PerfilPublico | null;
  aplicar(l: { friends: FriendInfo[]; incoming: FriendInfo[]; outgoing: FriendInfo[] }): void;
  setParty(p: PartyInfo | null): void;
  setConvite(c: Convite | null): void;
  setConviteSala(c: ConviteSala | null): void;
  /** Chegou o perfil pedido (o que chega de um pedido já fechado é ignorado). */
  chegouPerfil(p: PerfilPublico): void;
  fecharPerfil(): void;
  limpar(): void;
}

export const useFriends = create<FriendsState>((set) => ({
  friends: [],
  incoming: [],
  outgoing: [],
  party: null,
  convite: null,
  conviteSala: null,
  perfilDe: null,
  perfil: null,
  aplicar: (l) => set({ friends: l.friends, incoming: l.incoming, outgoing: l.outgoing }),
  setParty: (party) => set({ party, ...(party ? { convite: null } : {}) }),
  setConvite: (convite) => set({ convite }),
  setConviteSala: (conviteSala) => set({ conviteSala }),
  chegouPerfil: (perfil) => set((s) => (s.perfilDe === perfil.id ? { perfil } : {})),
  fecharPerfil: () => set({ perfilDe: null, perfil: null }),
  limpar: () => set({ friends: [], incoming: [], outgoing: [], party: null, convite: null, conviteSala: null, perfilDe: null, perfil: null }),
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

/** Chama um amigo para a sala em que estou. */
export const chamarParaSala = (id: string): void => send({ type: 'roomInvite', id });

/** Pede amizade a alguém da mesma sala (na espera ou em plena partida). */
export const pedirAmizadeNaMesa = (playerId: string): void => send({ type: 'friendAddPlayer', playerId });

/** Abre o perfil de um amigo: a janela abre na hora e se preenche quando o servidor responder. */
export function abrirPerfil(id: string): void {
  useFriends.setState({ perfilDe: id, perfil: null });
  send({ type: 'profileOf', id });
}

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

/**
 * O que eu sou de uma conta: eu mesmo, amigo, pedido pendente (de qualquer lado) ou ninguém.
 * `null` quando não dá para saber — sem conta minha, ou o outro sem conta (bot, jogo sem login).
 */
export function useRelacao(conta: string | undefined): 'eu' | 'amigo' | 'pedido' | 'livre' | null {
  const eu = useSession((s) => s.account?.id);
  return useFriends((s) => {
    if (!eu || !conta) return null;
    if (conta === eu) return 'eu';
    if (s.friends.some((f) => f.id === conta)) return 'amigo';
    if (s.outgoing.some((f) => f.id === conta) || s.incoming.some((f) => f.id === conta)) return 'pedido';
    return 'livre';
  });
}

/** Sou o líder do grupo? (sem grupo, não há liderança) */
export function useSouLider(): boolean {
  const party = useFriends((s) => s.party);
  const eu = useSession((s) => s.account?.id);
  return !!party && !!eu && party.leader === eu;
}
