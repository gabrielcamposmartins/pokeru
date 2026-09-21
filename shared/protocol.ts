import type { Card } from './cards';
import type { HandEvent, LegalActions, PlayerAction, Street, ActionType, GameVariant } from './engine';
import type { AvatarInfo, CharacterStyle, PlayerCosmetics } from './styles';
import type { AccountCreds, AccountInfo } from './accounts';

export type { AccountCreds, AccountInfo };

export type BotDifficulty = 'easy' | 'normal' | 'hard';

/**
 * Formato da partida:
 *   cash   — sem fim, com rebuy automático de quem quebra
 *   sitgo  — eliminação e blinds subindo, até sobrar um
 *   normal — um número fixo de rodadas (mãos) e o placar no fim
 */
export type GameMode = 'cash' | 'sitgo' | 'normal';

export type { GameVariant };

export interface RoomSettings {
  name: string;
  maxPlayers: number; // 2..6
  startingStack: number;
  smallBlind: number;
  bigBlind: number;
  mode: GameMode;
  /** Qual poker: Texas Hold'em ou poker de 5 cartas (draw). */
  variant: GameVariant;
  /** Modo normal: quantas rodadas (mãos) a partida tem. */
  rounds: number;
  /**
   * Fichas que custam para sentar, descontadas do saldo da conta (servidor hospedado).
   * 0 = mesa livre: as fichas são de brinquedo e ninguém paga nada.
   */
  buyIn: number;
  /** Segundos por decisão. */
  turnTime: number;
  /** Sit & Go: blinds dobram a cada N mãos. */
  blindLevelHands: number;
  password?: string;
  /** Multiplicador de ritmo das animações/pausas do servidor (1 = normal). */
  pace: number;
  /**
   * A sala aparece na lista pública do lobby?
   * As partidas contra bots ficam de fora: são suas, não têm por que poluir a lista.
   */
  listed: boolean;
}

export const DEFAULT_SETTINGS: RoomSettings = {
  name: 'Mesa Pokeru',
  maxPlayers: 6,
  startingStack: 2000,
  smallBlind: 10,
  bigBlind: 20,
  mode: 'cash',
  variant: 'holdem',
  rounds: 8,
  buyIn: 0,
  turnTime: 20,
  blindLevelHands: 8,
  pace: 1,
  listed: true,
};

export interface MemberInfo {
  id: string;
  seat: number;
  name: string;
  isBot: boolean;
  avatar: AvatarInfo;
  character: CharacterStyle;
  stack: number;
  connected: boolean;
}

export interface RoomInfo {
  id: string;
  settings: Omit<RoomSettings, 'password'> & { hasPassword: boolean };
  hostId: string;
  status: 'waiting' | 'playing' | 'finished';
  members: MemberInfo[];
}

export interface RoomSummary {
  id: string;
  name: string;
  players: number;
  maxPlayers: number;
  status: 'waiting' | 'playing' | 'finished';
  blinds: string;
  mode: GameMode;
  variant: GameVariant;
  /** Buy-in da mesa (0 = livre). */
  buyIn: number;
  hasPassword: boolean;
}

export interface SeatView {
  seat: number;
  id: string;
  name: string;
  isBot: boolean;
  avatar: AvatarInfo;
  cosmetics: PlayerCosmetics;
  stack: number;
  bet: number;
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  /** null = carta virada para baixo. Vazio = sem cartas. */
  cards: (Card | null)[];
  lastAction: ActionType | 'sb' | 'bb' | null;
  handName?: string;
  connected: boolean;
  busted: boolean;
  /** Poker de 5 cartas: quantas cartas o jogador trocou nesta mão (undefined = ainda não trocou). */
  drew?: number;
}

export interface TableView {
  roomId: string;
  handNo: number;
  /** Modo normal: total de rodadas da partida (null nos outros modos). */
  rounds: number | null;
  status: 'waiting' | 'playing' | 'finished';
  variant: GameVariant;
  maxPlayers: number;
  seats: (SeatView | null)[];
  board: Card[];
  pot: number;
  street: Street | null;
  dealerSeat: number | null;
  sbSeat: number | null;
  bbSeat: number | null;
  toAct: number | null;
  /** ms restantes para a decisão atual, no momento do envio. */
  timeLeftMs: number | null;
  turnTimeMs: number;
  currentBet: number;
  smallBlind: number;
  bigBlind: number;
  mySeat: number | null;
  legal: LegalActions | null;
  /** Cartas vencedoras em destaque (após o showdown). */
  highlight: Card[];
}

export type TableEvent =
  | HandEvent
  | { t: 'handStart'; handNo: number; dealerSeat: number }
  | { t: 'turn'; seat: number; timeMs: number }
  /** Poker de 5 cartas: a vez de trocar cartas (não é vez de apostar). */
  | { t: 'drawTurn'; seat: number; timeMs: number }
  | { t: 'handEnd' }
  | { t: 'seatJoin'; seat: number }
  | { t: 'seatLeave'; seat: number }
  | { t: 'rebuy'; seat: number; amount: number }
  | { t: 'bust'; seat: number; place: number }
  | { t: 'blindsUp'; smallBlind: number; bigBlind: number }
  | { t: 'gameOver'; ranking: { name: string; place: number; seat: number }[] };

export type ClientMsg =
  | { type: 'hello'; name: string; avatar: AvatarInfo; cosmetics: PlayerCosmetics; account?: AccountCreds }
  | { type: 'updateProfile'; name: string; avatar: AvatarInfo; cosmetics: PlayerCosmetics }
  | { type: 'listRooms' }
  | { type: 'createRoom'; settings: RoomSettings }
  | { type: 'joinRoom'; roomId: string; password?: string }
  | { type: 'leaveRoom' }
  | { type: 'addBot'; difficulty: BotDifficulty }
  | { type: 'removeBot'; seat: number }
  | { type: 'startGame' }
  | { type: 'action'; action: PlayerAction }
  /** Poker de 5 cartas: troca as cartas nas posições indicadas (vazio = manter todas). */
  | { type: 'draw'; discards: number[] }
  | { type: 'skipHand' }
  | { type: 'chat'; text: string }
  | { type: 'emote'; emote: string }
  | { type: 'ping' };

export type ServerMsg =
  | { type: 'welcome'; playerId: string; serverName: string }
  /** Servidor hospedado: a conta do jogador (saldo, vínculo e números). */
  | { type: 'account'; account: AccountInfo }
  | { type: 'rooms'; rooms: RoomSummary[] }
  | { type: 'room'; room: RoomInfo }
  | { type: 'left' }
  | { type: 'sync'; view: TableView }
  | { type: 'event'; ev: TableEvent; view: TableView }
  | { type: 'chat'; from: string; seat: number | null; text: string; system?: boolean }
  | { type: 'emote'; seat: number; emote: string }
  | { type: 'error'; message: string }
  | { type: 'pong' };

export const EMOTES = ['👍', '😂', '😱', '😎', '🤔', '😭', '🔥', '💤', 'GG', 'Blefe?', 'Boa mão!', 'All-in!'];
