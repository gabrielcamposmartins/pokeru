import type { Card } from './cards';
import type { HandEvent, LegalActions, PlayerAction, Street, ActionType, GameVariant } from './engine';
import type { AuraId, AvatarInfo, CardBackStyle, CardFaceStyle, CharacterStyle, FrameId, PlayerCosmetics } from './styles';
import type { AccountCreds, AccountInfo } from './accounts';
import type { Currency } from './catalog';
import type { FriendInfo, PartyInfo, PartyKind, PerfilPublico } from './friends';

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
   * O degrau da mesa. Manda no prêmio em padocoin do fim da partida, e é o que os bots jogam.
   *
   * Uma mesa sem degrau declarado vale como normal: é o caso das Custom antigas.
   */
  difficulty?: BotDifficulty;
  /**
   * A mesa do recomeço: quem não tem o buy-in senta de graça.
   *
   * É a torneira de fichas do jogo, e só o degrau fácil contra bots a tem. Sem ela, quebrar era
   * um beco sem saída — nenhuma mesa aceita quem não pode pagar, e o jogo acabava ali. **Nunca**
   * em padocoin: padocoin é dinheiro de verdade da economia do bot, e dar de graça seria imprimir.
   */
  recomeco?: boolean;
  /**
   * A mesa foi montada em Custom (o jogador escolheu tudo).
   *
   * Serve para uma regra só, mas importante: na partida **normal** que não é Custom, sair no meio
   * perde as fichas da mesa — elas saem do saldo ao sentar e só voltam se a partida terminar. Numa
   * Custom, que é mesa de amigo, levantar devolve o que sobrou.
   */
  custom?: boolean;
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
  difficulty: 'normal',
  custom: true,
};

/**
 * A escada de blinds que as mesas usam.
 *
 * São degraus, não um número livre: blind é a escala da mesa, e uma mesa de 37/74 não diz nada a
 * ninguém. O formulário anda por esta lista (veja o seletor de blinds em src/ui/controls.tsx), e
 * ela cresce como as mesas de verdade crescem — dobrando e depois multiplicando por cinco.
 */
export const BLIND_STEPS: { sb: number; bb: number }[] = [
  { sb: 5, bb: 10 },
  { sb: 10, bb: 20 },
  { sb: 25, bb: 50 },
  { sb: 50, bb: 100 },
  // 100/200 fecha o maior buraco da escada: de 50/100 para 250/500 era um salto de cinco vezes
  { sb: 100, bb: 200 },
  { sb: 250, bb: 500 },
  { sb: 500, bb: 1000 },
  { sb: 1000, bb: 2000 },
  { sb: 5000, bb: 10_000 },
];

/** O degrau de um big blind (o mais próximo, para um valor que não esteja na escada). */
export function blindStep(bb: number): { sb: number; bb: number } {
  return BLIND_STEPS.reduce((melhor, d) => (Math.abs(d.bb - bb) < Math.abs(melhor.bb - bb) ? d : melhor), BLIND_STEPS[0]);
}

/**
 * A mesa de **partida normal**: fichas e blinds fixos.
 *
 * Normal é o formato padrão do jogo — começo, meio e fim, mesma banca para todos. Por isso não se
 * escolhe pilha nem blind: mil fichas e 50/100 para todo mundo, e a partida se decide jogando.
 */
export const NORMAL_STACK = 1000;

/** O menor buy-in de uma mesa Custom em padocoin. */
export const CUSTOM_PADO_MIN = 500;

/**
 * A mesa Custom do recomeço: em fichas, com buy-in de exatamente este valor.
 *
 * Quem não tem fichas para pagar senta nela **de graça**, com esta pilha — quebrar não pode ser o
 * fim do jogo. A pilha é um adiantamento da casa: ao levantar (ou no fim da partida), a pessoa leva
 * só o que passou dele. Sem essa conta, bastaria sentar de graça e levantar na hora para ganhar mil
 * fichas, quantas vezes quisesse.
 */
export const RECOMECO_CUSTOM = 1000;
export const NORMAL_BLINDS = { sb: 50, bb: 100 };

/**
 * A partida contra bots: tudo o que **não** se escolhe.
 *
 * O botão do menu leva a uma partida só, sempre a mesma: três oponentes, Hold'em, dez rodadas,
 * vinte e cinco segundos por jogada e ritmo normal. Quem quiser outra coisa vai em Custom — ter
 * doze campos na porta de entrada do jogo fazia a pessoa escolher antes de saber o que estava
 * escolhendo.
 */
export const BOT_MATCH = { bots: 3, mode: 'normal', variant: 'holdem', rounds: 10, turnTime: 25, pace: 1 } as const;

/**
 * Fichas de consolação para quem é eliminado numa partida contra bots.
 *
 * Só para quem **pagou** o buy-in daquela partida. A mesa do recomeço (o fácil de graça, para quem
 * quebrou) não paga consolação: sem custo para sentar, bastaria ir de all-in na primeira mão, cair
 * e sentar de novo — duzentas fichas por minuto, de graça.
 */
export const CONSOLACAO_BOTS = 200;

/**
 * O que um jogador levou de uma partida: a experiência, parcela por parcela, e a consolação.
 *
 * Vai no `gameOver`, calculado pelo servidor — é ele que conta as mãos e credita as fichas. O
 * cliente só mostra. Só existe para quem tem conta: sem conta não há experiência para somar.
 */
export interface GanhoDaPartida {
  seat: number;
  xp: {
    /** Mãos jogadas nesta partida, e o xp delas. */
    maos: number;
    /** Mãos ganhas nesta partida, e o xp delas. */
    vitorias: number;
    /** O xp de terminar a partida (todo mundo que estava na mesa até o fim, eliminado ou não). */
    partida: number;
    /** O xp de ganhar a partida (0 para quem não foi o primeiro). */
    campeao: number;
    total: number;
  };
  /** Quantas mãos jogou e quantas ganhou — para o placar dizer "12 mãos", e não só o xp. */
  jogadas: number;
  ganhas: number;
  /** Experiência da conta antes e depois da partida (o placar desenha a barra de nível com isto). */
  xpAntes: number;
  xpDepois: number;
  /** Fichas de consolação por ter sido eliminado contra bots (0 = nenhuma). */
  consolacao: number;
  /** Fichas de prêmio por terminar a partida — o mesmo valor do prêmio mínimo em padocoin. */
  bonusFichas?: number;
}

/** A mesa de um degrau, numa moeda. */
export interface BotTable {
  stack: number;
  smallBlind: number;
  bigBlind: number;
}

/**
 * Os três degraus da partida contra bots.
 *
 * Dificuldade não é só o bot pensar melhor: é a mesa inteira subindo. A pilha cresce e os blinds
 * crescem com ela, mantendo **dez big blinds de pilha** nos três degraus: o que muda é quanto cada
 * mão custa, não quantas mãos a pilha aguenta. O prêmio em padocoin acompanha.
 *
 * **Os degraus se liberam por nível.** O fácil vem com o jogo; o normal pede nível 5 e o difícil,
 * 20. Quem confere é o servidor (veja `botMatch` em shared/lobby.ts) — aqui é só a tabela.
 *
 * **A mesa é a mesma nas duas moedas.** O pote de uma partida em padocoin tem os mesmos números do
 * de uma em fichas: uma mesa é uma mesa, e dividir os valores por dez fazia a partida em padocoin
 * parecer de brinquedo ao lado da de fichas. O que muda é de onde sai o buy-in — e, sendo padocoin
 * dinheiro de verdade da economia do bot, a mesma mesa já custa muito mais lá.
 */
export interface BotTier {
  id: BotDifficulty;
  label: string;
  /** Nível do jogador que libera o degrau (1 = vem com o jogo). */
  level: number;
  mesa: BotTable;
  /** Padocoins ao terminar a partida, e ao terminar em primeiro. */
  bonus: { fim: number; vitoria: number };
}

const degrau = (id: BotDifficulty, label: string, level: number, stack: number, sb: number, bb: number, i: number): BotTier => ({
  id,
  label,
  level,
  mesa: { stack, smallBlind: sb, bigBlind: bb },
  // 200 por terminar e 400 por vencer, mais cem a cada degrau
  bonus: { fim: 200 + i * 100, vitoria: 400 + i * 100 },
});

/** As três dificuldades, na ordem da escada. */
export const DIFFICULTIES: readonly BotDifficulty[] = ['easy', 'normal', 'hard'];

export const BOT_TIERS: readonly BotTier[] = [
  degrau('easy', 'Fácil', 1, 1000, 50, 100, 0),
  degrau('normal', 'Normal', 5, 2000, 100, 200, 1),
  degrau('hard', 'Difícil', 20, 10_000, 500, 1000, 2),
];

export const botTier = (d: BotDifficulty): BotTier => BOT_TIERS.find((t) => t.id === d) ?? BOT_TIERS[0];

/** O degrau está liberado para quem está neste nível? */
export const tierUnlocked = (d: BotDifficulty, level: number): boolean => level >= botTier(d).level;

/**
 * O prêmio em padocoin de uma partida terminada.
 *
 * Vale para **qualquer** partida, não só contra bots: a fila e as mesas Custom também pagam, pelo
 * degrau da mesa. Só recebe quem tem Discord vinculado — padocoin mora lá.
 */
export const bonusPado = (d: BotDifficulty, venceu: boolean): number =>
  venceu ? botTier(d).bonus.vitoria : botTier(d).bonus.fim;

/** A mesa de uma partida contra bots. `paga` liga o buy-in (servidor com contas). */
export function botMatchSettings(difficulty: BotDifficulty, currency: Currency, paga: boolean): RoomSettings {
  const t = botTier(difficulty);
  const m = t.mesa;
  return {
    ...DEFAULT_SETTINGS,
    name: `Contra bots · ${t.label}`,
    maxPlayers: BOT_MATCH.bots + 1,
    mode: BOT_MATCH.mode,
    variant: BOT_MATCH.variant,
    rounds: BOT_MATCH.rounds,
    turnTime: BOT_MATCH.turnTime,
    pace: BOT_MATCH.pace,
    startingStack: m.stack,
    smallBlind: m.smallBlind,
    bigBlind: m.bigBlind,
    buyIn: paga ? m.stack : 0,
    currency,
    difficulty,
    // o fácil em fichas é o recomeço: quem quebrou senta de graça e joga para voltar
    recomeco: difficulty === 'easy' && currency === 'chips',
    // a partida contra bots não entra na lista de mesas: ela é de um jogador só
    listed: false,
    custom: false,
  };
}

/**
 * As mesas da fila rápida: cash (com rebuy), seis lugares, e o jogador joga com o que é dele até
 * zerar. Os valores são fixos de propósito — fila é para entrar sem escolher nada.
 *
 * **A mesa é a mesma nas duas moedas**, como na partida contra bots: o pote em padocoin tem os
 * mesmos números do pote em fichas. Antes o padocoin dividia tudo por dez, e a mesa dele parecia de
 * brinquedo ao lado da de fichas — só que padocoin é dinheiro de verdade, então a mesma mesa lá já
 * é uma aposta muito maior sem precisar de número maior.
 */
export const QUEUE_STAKES: Record<Currency, { buyIn: number; smallBlind: number; bigBlind: number }> = {
  chips: { buyIn: 2000, smallBlind: 10, bigBlind: 20 },
  pado: { buyIn: 2000, smallBlind: 10, bigBlind: 20 },
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
    // a fila senta três bots normais: é o degrau dela, e é dele que sai o prêmio em padocoin
    difficulty: 'normal',
    custom: false,
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
  /*
   * O resto do card da abertura, para a sala de espera mostrar cada um do mesmo jeito. Opcionais:
   * um servidor de antes dos cards não manda, e aí a sala desenha o que tiver.
   */
  level?: number;
  auras?: AuraId[];
  frame?: FrameId;
  face?: CardFaceStyle;
  back?: CardBackStyle;
  /** Conta dele no servidor (ausente em bot e sem conta): é o que o botão de pedir amizade usa. */
  conta?: string;
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
  | { t: 'gameOver'; ranking: { name: string; place: number; seat: number }[]; ganhos?: GanhoDaPartida[] };

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
  /** As auras dele, que abrem em volta do personagem no card (veja AURA_SLOT). */
  auras: AuraId[];
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
  /**
   * Partida contra bots: o servidor monta a mesa e senta todos.
   *
   * Só estas duas escolhas são do jogador; o resto da mesa é fixo (BOT_MATCH) e a trava por nível
   * é conferida no servidor.
   */
  | { type: 'botMatch'; difficulty: BotDifficulty; currency: Currency }
  // ---------------------------------------------------------------- amizades e grupo
  /** Pede a lista de amigos de novo (o cliente pede ao abrir a tela). */
  | { type: 'friends' }
  /** Pede amizade por código — nunca por nome, que se troca. */
  | { type: 'friendAdd'; code: string }
  | { type: 'friendAccept'; id: string }
  /** Recusa um pedido recebido, ou cancela um enviado. */
  | { type: 'friendDecline'; id: string }
  | { type: 'friendRemove'; id: string }
  /** Chama um amigo para o grupo (cria o grupo, se ainda não houver). */
  | { type: 'partyInvite'; id: string }
  | { type: 'partyAccept'; party: string }
  | { type: 'partyDecline'; party: string }
  | { type: 'partyLeave' }
  /** O líder manda o grupo jogar: fila, bots ou a próxima mesa Custom que ele criar. */
  | { type: 'partyStart'; kind: PartyKind; difficulty?: BotDifficulty; currency?: Currency }
  /** Chama um amigo para a sala em que estou (ele entra mesmo que a sala tenha senha). */
  | { type: 'roomInvite'; id: string }
  /** Pede amizade a quem está na mesma sala comigo (pelo id de jogador, não pelo código). */
  | { type: 'friendAddPlayer'; playerId: string }
  /** Abre o perfil de um amigo. */
  | { type: 'profileOf'; id: string }
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
  | { type: 'giveGift'; character: string; gift: string }
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
  /**
   * Quantas pessoas estão jogando nas mesas da fila rápida agora (as duas moedas; bot não conta).
   *
   * Não existe fila de espera: quem entra na fila senta na hora numa mesa dela. O número é o que
   * responde "tem gente jogando?", e vai para o card do PvP Queue no menu.
   */
  | { type: 'fila'; jogadores: number }
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
  /** O presente foi entregue: quantos pontos de vínculo ele rendeu. */
  | { type: 'gifted'; character: string; gift: string; points: number }
  /** A lista de amigos e os pedidos, com quem está online agora. */
  | { type: 'friends'; friends: FriendInfo[]; incoming: FriendInfo[]; outgoing: FriendInfo[] }
  /** Um amigo acabou de entrar no jogo. */
  | { type: 'friendOnline'; id: string; name: string }
  /** O grupo mudou (null = você não está em grupo nenhum). */
  | { type: 'party'; party: PartyInfo | null }
  /** Alguém te chamou para o grupo dele. */
  | { type: 'partyAsk'; party: string; from: string; name: string }
  /** Um amigo chamou para a sala dele. */
  | { type: 'roomAsk'; room: string; from: string; name: string; sala: string }
  /** O perfil de um amigo, pedido com `profileOf`. */
  | { type: 'perfil'; perfil: PerfilPublico }
  | { type: 'error'; message: string }
  | { type: 'pong' };

export const EMOTES = ['👍', '😂', '😱', '😎', '🤔', '😭', '🔥', '💤', 'GG', 'Blefe?', 'Boa mão!', 'All-in!'];
