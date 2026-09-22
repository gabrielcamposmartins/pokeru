import type { Card } from './cards';
import type { HandEvent, LegalActions, PlayerAction, Street, ActionType, GameVariant } from './engine';
import type { AvatarInfo, CardBackStyle, CardFaceStyle, CharacterStyle, PlayerCosmetics } from './styles';
import type { AccountCreds, AccountInfo } from './accounts';
import type { Currency } from './catalog';

export type { AccountCreds, AccountInfo, Currency };

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
  /**
   * Em que moeda o buy-in é cobrado.
   *
   * `chips` são as fichas do Pokeru; `pado` são os padocoins do bot do Discord, que na mesa
   * aparecem como fichas normais — 1 padocoin é 1 ficha na frente do jogador. Numa mesa de
   * padocoin **não há rebuy automático**: mexer na economia do bot é ida à rede, e não se faz isso
   * no meio de uma mão. Quem zera sai da partida e entra de novo se quiser recomprar.
   */
  currency: Currency;
  /**
   * Sala da **fila rápida**: é entre estas que a fila procura antes de abrir uma nova, e é nelas
   * que um bot sai para dar lugar a quem chega. Uma mesa criada à mão não entra na fila.
   */
  queue: boolean;
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
  currency: 'chips',
  queue: false,
};

/**
 * As mesas da fila rápida: cash (com rebuy), seis lugares, e o jogador joga com o que é dele até
 * zerar. Os valores são fixos de propósito — fila é para entrar sem escolher nada.
 *
 * O padocoin vale muito mais que a ficha, então as apostas acompanham: em fichas são 100 big
 * blinds de mesa; em padocoin, 50.
 */
export const QUEUE_STAKES: Record<Currency, { buyIn: number; smallBlind: number; bigBlind: number }> = {
  chips: { buyIn: 2000, smallBlind: 10, bigBlind: 20 },
  pado: { buyIn: 200, smallBlind: 2, bigBlind: 4 },
};

/** Configuração automática de uma mesa da fila. */
export function queueSettings(currency: Currency): RoomSettings {
  const { buyIn, smallBlind, bigBlind } = QUEUE_STAKES[currency];
  return {
    ...DEFAULT_SETTINGS,
    name: currency === 'pado' ? 'Fila · Padocoins' : 'Fila Rápida',
    maxPlayers: 6,
    mode: 'cash',
    variant: 'holdem',
    buyIn,
    startingStack: buyIn,
    smallBlind,
    bigBlind,
    turnTime: 25,
    currency,
    queue: true,
    listed: true,
  };
}

export interface MemberInfo {
  id: string;
  seat: number;
  name: string;
  isBot: boolean;
  avatar: AvatarInfo;
  character: CharacterStyle;
  /** Titulo de conquista que o jogador escolheu mostrar (null = nenhum). */
  title: string | null;
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
  /** Em que moeda o buy-in é cobrado. */
  currency: Currency;
  /** Quantos dos jogadores sentados são bots (a fila troca bot por gente). */
  bots: number;
  hasPassword: boolean;
}

export interface SeatView {
  seat: number;
  id: string;
  name: string;
  isBot: boolean;
  avatar: AvatarInfo;
  cosmetics: PlayerCosmetics;
  /** Titulo de conquista que aparece junto do nome (null = nenhum). */
  title: string | null;
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

/**
 * Um jogador na **abertura** da partida — a tela que o jogo mostra como "preparando a mesa" antes
 * da primeira mão.
 *
 * Ela é de verdade: a mesa só reparte cartas depois que cada jogador confirmou (ou depois do
 * tempo limite, para ninguém ficar preso esperando quem travou). E é onde cada um aparece com o
 * que escolheu — personagem, título, frente e verso das cartas.
 */
export interface OpeningPlayer {
  seat: number;
  name: string;
  isBot: boolean;
  /** Título de conquista (null = nenhum). */
  title: string | null;
  /** Nível do jogador; 0 nos bots, que não têm conta. */
  level: number;
  character: CharacterStyle;
  /** Frente e verso das cartas dele, para o par mostrado no card. */
  face: CardFaceStyle;
  back: CardBackStyle;
  /** Confirmou que está pronto. Bot entra pronto. */
  ready: boolean;
}

export interface Opening {
  players: OpeningPlayer[];
  /** Quanto a mesa espera, no máximo, antes de começar de todo jeito. */
  waitMs: number;
  /** Quanto a tela fica no ar no mínimo, mesmo com todos prontos na hora. */
  minMs: number;
}

export type ClientMsg =
  /**
   * Apresentação. `jwt` é o token do serviço de contas — é ele que diz **quem** o jogador é, e o
   * servidor o valida por conta própria. `account` é a identidade sem login (só deste aparelho),
   * usada por quem escolheu jogar sem conta.
   */
  | { type: 'hello'; name: string; avatar: AvatarInfo; cosmetics: PlayerCosmetics; account?: AccountCreds; jwt?: string }
  | { type: 'updateProfile'; name: string; avatar: AvatarInfo; cosmetics: PlayerCosmetics }
  /** Equipa um titulo de conquista (null = nenhum). O servidor recusa o que a conta nao liberou. */
  | { type: 'setTitle'; title: string | null }
  | { type: 'listRooms' }
  | { type: 'createRoom'; settings: RoomSettings }
  | { type: 'joinRoom'; roomId: string; password?: string }
  | { type: 'leaveRoom' }
  | { type: 'addBot'; difficulty: BotDifficulty }
  | { type: 'removeBot'; seat: number }
  | { type: 'startGame' }
  /** "Terminei de carregar": a mesa espera isso de cada jogador antes da primeira mão. */
  | { type: 'ready' }
  | { type: 'action'; action: PlayerAction }
  /** Poker de 5 cartas: troca as cartas nas posições indicadas (vazio = manter todas). */
  | { type: 'draw'; discards: number[] }
  | { type: 'skipHand' }
  | { type: 'chat'; text: string }
  | { type: 'emote'; emote: string }
  /** Compra um item do catálogo (shared/catalog.ts). Quem cobra e valida é o servidor. */
  | { type: 'buy'; item: string; currency: Currency }
  /**
   * Gira uma roleta. O cliente diz qual e em que moeda; **o prêmio vem do servidor** (`spun`).
   * Não há campo de prêmio aqui de propósito: o que o cliente manda não escolhe o que ele ganha.
   */
  | { type: 'spin'; roulette: string; currency: Currency }
  /** Oferece os presentes que destrancam o próximo coração do vínculo com o personagem. */
  | { type: 'offerGifts'; character: string }
  /**
   * Fila rápida: entra numa mesa da fila que já exista, ou abre uma com três bots.
   * O servidor escolhe — o jogador não configura nada.
   */
  | { type: 'quickMatch'; currency?: Currency }
  /** Pede uma foto nova da conta (relê o saldo de padocoins, que vive no bot do Discord). */
  | { type: 'refreshAccount' }
  | { type: 'ping' };

export type ServerMsg =
  | { type: 'welcome'; playerId: string; serverName: string }
  /** Servidor hospedado: a conta do jogador (saldo, vínculo e números). */
  | { type: 'account'; account: AccountInfo }
  | { type: 'rooms'; rooms: RoomSummary[] }
  | { type: 'room'; room: RoomInfo }
  | { type: 'left' }
  /** A mesa está montada e conferindo os jogadores (veja `Opening`). */
  | { type: 'opening'; opening: Opening }
  | { type: 'sync'; view: TableView }
  | { type: 'event'; ev: TableEvent; view: TableView }
  | { type: 'chat'; from: string; seat: number | null; text: string; system?: boolean }
  | { type: 'emote'; seat: number; emote: string }
  /** Compra concluída (a foto nova da conta chega em seguida, num `account`). */
  | { type: 'bought'; item: string; currency: Currency }
  /** O resultado do giro: a chave do prêmio, e se ele repetiu (aí virou fichas). */
  | { type: 'spun'; roulette: string; prize: string; dup: boolean; refund: number }
  /** Um coração de vínculo foi destrancado com presentes. */
  | { type: 'bondUp'; character: string; heart: number }
  | { type: 'error'; message: string }
  | { type: 'pong' };

export const EMOTES = ['👍', '😂', '😱', '😎', '🤔', '😭', '🔥', '💤', 'GG', 'Blefe?', 'Boa mão!', 'All-in!'];
