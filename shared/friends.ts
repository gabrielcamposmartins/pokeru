import { randomInt } from './cards';
import type { PlayerStats } from './achievements';
import type { ResumoDaPartida } from './personality';
import type { AuraId, CardBackStyle, CardFaceStyle, CharacterStyle, FrameId } from './styles';

/**
 * Amizades e grupo — as regras.
 *
 * **A amizade não é por nome.** Nome se troca em Configurações, e uma lista de amigos que guarda
 * nome apontaria para a pessoa errada no dia seguinte. Cada conta tem um **código de amigo**: seis
 * caracteres, estáveis, que a pessoa passa para quem quiser. É ele que se digita para pedir
 * amizade; guardado fica o id da conta, que nunca muda.
 *
 * O **estado online** não mora aqui nem em disco: quem sabe é o lobby, que tem as conexões abertas
 * (veja `friendsOf` em shared/lobby.ts). A lista de amigos é persistente; a bolinha verde é do
 * momento.
 *
 * O **grupo** também é do momento: ele existe enquanto há gente conectada nele, e não sobrevive a
 * um reinício do servidor. É um ajuntamento para jogar junto, não um clã.
 */

/**
 * O alfabeto do código: sem 0/O, 1/I/L e sem acento.
 *
 * O código é feito para ser **ditado** — no Discord, na chamada, em voz alta. Zero e O na mesma
 * lista transformariam metade dos pedidos numa conversa sobre qual dos dois era.
 */
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Tamanho do código de amigo. Seis dá 887 milhões de combinações — não vai faltar. */
export const FRIEND_CODE_LEN = 6;

export function makeFriendCode(): string {
  let s = '';
  for (let i = 0; i < FRIEND_CODE_LEN; i++) s += ALFABETO[randomInt(ALFABETO.length)];
  return s;
}

/**
 * Arruma o que a pessoa digitou: maiúsculas, sem espaço nem hífen.
 *
 * O código é **mostrado** com um hífen no meio (`ABC-234`), porque assim se lê e se dita melhor;
 * então ele volta com hífen, com espaço, em minúsculas ou colado. Tudo isso é o mesmo código.
 */
export function normalizeFriendCode(raw: unknown): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, FRIEND_CODE_LEN);
}

export const isFriendCode = (raw: unknown): boolean => normalizeFriendCode(raw).length === FRIEND_CODE_LEN;

/** O código como se mostra: `ABC-234`. */
export const prettyFriendCode = (code: string): string => {
  const c = normalizeFriendCode(code);
  return c.length === FRIEND_CODE_LEN ? `${c.slice(0, 3)}-${c.slice(3)}` : c;
};

/** Teto de amigos por conta. Alto o bastante para ninguém sentir, baixo o bastante para não virar lista de spam. */
export const MAX_FRIENDS = 100;

/** Teto de pedidos guardados, para um engraçadinho não encher a caixa de alguém. */
export const MAX_REQUESTS = 50;

/**
 * Teto do grupo: quatro, contando o líder.
 *
 * É o tamanho da mesa contra bots (três oponentes), e é o que faz os três jeitos de jogar juntos
 * caberem no mesmo grupo — um grupo de seis não teria como jogar contra bots.
 */
export const MAX_PARTY = 4;

/** Um amigo, como o cliente o vê. */
export interface FriendInfo {
  /** Id da conta — é por ele que tudo se guarda. */
  id: string;
  /** Código de amigo (o que se dita). */
  code: string;
  /** Nome de agora. Pode ser outro amanhã, e por isso não é chave de nada. */
  name: string;
  level: number;
  title: string | null;
  /** Personagem que ele está usando (para a lista mostrar a cara). */
  character: string;
  /** Conectado agora. */
  online: boolean;
  /** Em partida agora (o convite ainda vale; ele só não vai entrar na hora). */
  playing: boolean;
}

/**
 * O card de um jogador: o mesmo da tela de abertura da partida.
 *
 * Personagem com as auras, nível, título e o par de cartas com a frente e o verso que ele usa. É
 * como a pessoa se mostra — na abertura, no grupo, na sala Custom e no perfil —, e por isso é um
 * tipo só: montado no servidor, com o que a conta tem de verdade.
 */
export interface CartaoJogador {
  name: string;
  /** Nível do jogador (0 = sem conta). */
  level: number;
  title: string | null;
  character: CharacterStyle;
  auras: AuraId[];
  frame: FrameId;
  face: CardFaceStyle;
  back: CardBackStyle;
}

/**
 * O perfil de um amigo, como ele aparece para quem abre.
 *
 * É o que o próprio perfil mostra — o card, o histórico e as conquistas —, sem nada que seja só do
 * dono: saldo, itens e presentes ficam de fora.
 */
export interface PerfilPublico {
  id: string;
  code: string;
  online: boolean;
  playing: boolean;
  cartao: CartaoJogador;
  /** Contadores das conquistas (é deles que saem o nível e os títulos). */
  stats: PlayerStats;
  /** As últimas partidas, as mesmas do histórico do perfil. */
  play: ResumoDaPartida[];
}

/** Os três jeitos de o grupo jogar junto. */
export type PartyKind = 'bots' | 'queue' | 'custom';

export interface PartyMember {
  id: string;
  name: string;
  character: string;
  level: number;
  /** É quem manda no grupo (convida e começa a partida). */
  leader: boolean;
  online: boolean;
  /** O card dele (ausente num servidor de antes dos cards). */
  cartao?: CartaoJogador;
}

export interface PartyInfo {
  id: string;
  leader: string;
  members: PartyMember[];
}

/** Dá para entrar em mais um grupo/amizade? As duas contas são conferidas no servidor. */
export const podeMaisAmigos = (n: number): boolean => n < MAX_FRIENDS;
export const podeMaisNoGrupo = (n: number): boolean => n < MAX_PARTY;
