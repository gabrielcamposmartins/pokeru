import { create } from 'zustand';
import {
  DEFAULT_SETTINGS,
  type BotDifficulty,
  type ClientMsg,
  type AccountInfo,
  type Currency,
  type GameMode,
  type GameVariant,
  type RoomInfo,
  type RoomSummary,
  type ServerMsg,
} from '../../shared/protocol';
import { connectLocal, connectWs, type Transport } from '../net/transport';
import { SERVER_URL, findStyle, myCosmetics, useProfile } from './profile';
import { useAuth } from './auth';
import { findItem } from '../../shared/catalog';
import { findCharacter } from '../../shared/styles';
import { useRoleta } from './roleta';
import { useBond } from './bond';
import { useTable } from './table';
import { director } from '../game/director';
import { sfx } from '../audio/sfx';

export interface ChatLine {
  id: number;
  from: string;
  text: string;
  seat: number | null;
  system?: boolean;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

export interface LocalOptions {
  bots: number;
  difficulty: BotDifficulty;
  startingStack: number;
  smallBlind: number;
  bigBlind: number;
  mode: GameMode;
  variant: GameVariant;
  /** Modo normal: quantas rodadas. */
  rounds: number;
  turnTime: number;
  pace: number;
}

interface SessionState {
  mode: 'none' | 'local' | 'online';
  status: 'idle' | 'connecting' | 'connected';
  serverName: string;
  /** Endereço do servidor conectado (chave das credenciais da conta). */
  serverUrl: string;
  /** Por que a última conexão caiu (a tela de salas mostra isso e oferece tentar de novo). */
  connError: string | null;
  /** A partida contra bots caiu para o computador do jogador (o servidor não respondeu). */
  offline: boolean;
  /** Uma partida contra bots está sendo montada (o menu fica na frente até a mesa começar). */
  botsPending: boolean;
  /** Conta no servidor hospedado: saldo, vínculo e números (null offline ou sem contas). */
  account: AccountInfo | null;
  playerId: string | null;
  rooms: RoomSummary[];
  room: RoomInfo | null;
  chat: ChatLine[];
  toasts: Toast[];
  /**
   * Liga no servidor oficial (o jogador não escolhe endereço: ele escolhe sala).
   *
   * É chamado assim que o jogador passa da tela de entrada, e a conexão fica de pé no menu: a
   * conta — fichas, padocoins, itens — só existe enquanto há conexão, e antes disso o jogo abria o
   * menu, a loja e as Configurações sem nada disso, mostrando "saldo indisponível" a quem tinha
   * saldo. Conectar não muda o `mode`: quem manda na tela é a navegação.
   */
  connectOnline(): void;
  /** Partida contra bots: no servidor, e no seu computador se ele não responder. */
  startBots(o: LocalOptions): void;
  /**
   * Fila rápida: pede ao servidor uma mesa da fila (ele entra numa que já exista ou abre uma com
   * bots). Não há nada para configurar — é o ponto da fila.
   */
  quickMatch(currency: Currency): void;
  /** Esperando o servidor achar/abrir a mesa da fila. */
  queueing: boolean;
  startLocal(o: LocalOptions): void;
  send(msg: ClientMsg): void;
  leaveRoom(): void;
  /** Para de encenar a mesa; numa partida offline, encerra a sala na hora. */
  stopPlaying(): void;
  disconnect(): void;
  toast(text: string, kind?: Toast['kind']): void;
  dismissToast(id: number): void;
}

let transport: Transport | null = null;
let seq = 1;

/**
 * Por onde a sessão fala com a rede. É uma costura: os testes trocam `ws` por um transporte de
 * mentira para exercitar a queda para local sem precisar de um servidor de verdade.
 */
export const net = { ws: connectWs, local: connectLocal };

/** Quanto tempo esperar o servidor antes de jogar contra bots aqui mesmo. */
export const BOT_CONNECT_MS = 6000;

/**
 * Partida contra bots pedida ao servidor, do `hello` até a mesa começar. Enquanto isso estiver
 * preenchido, qualquer tropeço (conexão caída, erro do servidor, demora) cai para o local.
 */
let botMatch: { o: LocalOptions; step: 'connect' | 'create' } | null = null;
let botTimer: ReturnType<typeof setTimeout> | null = null;

function clearBotMatch(): void {
  botMatch = null;
  if (botTimer) clearTimeout(botTimer);
  botTimer = null;
}

/** Quanto tempo esperar a fila achar (ou abrir) uma mesa. */
export const QUEUE_WAIT_MS = 15_000;

/** Fila pedida antes de haver conexão: o pedido sai quando o servidor cumprimentar. */
let queueAfterHello: Currency | null = null;
let queueTimer: ReturnType<typeof setTimeout> | null = null;

function clearQueue(): void {
  queueAfterHello = null;
  if (queueTimer) clearTimeout(queueTimer);
  queueTimer = null;
}

/** A sala de uma partida contra bots: do tamanho da mesa pedida. */
/**
 * A mesa contra bots.
 *
 * `paga` liga o buy-in: no servidor a partida vale **fichas de verdade** — o buy-in sai da conta e
 * o que sobra na mesa volta para ela ao sair. Na mesa local não há conta para cobrar (nem para
 * pagar), então lá ela vai sem buy-in; é a diferença entre treinar e jogar.
 */
function botRoomSettings(o: LocalOptions, name: string, paga = false) {
  return {
    ...DEFAULT_SETTINGS,
    name,
    maxPlayers: Math.min(6, o.bots + 1),
    buyIn: paga ? o.startingStack : 0,
    startingStack: o.startingStack,
    smallBlind: o.smallBlind,
    bigBlind: o.bigBlind,
    mode: o.mode,
    variant: o.variant,
    rounds: o.rounds,
    turnTime: o.turnTime,
    pace: o.pace,
  };
}

/** Senta os bots e começa a mão (serve para a sala do servidor e para a local). */
function seatBotsAndStart(t: Transport, o: LocalOptions): void {
  for (let i = 0; i < o.bots; i++) t.send({ type: 'addBot', difficulty: o.difficulty });
  t.send({ type: 'startGame' });
}

/** O servidor não deu conta: a mesma partida roda no computador do jogador. */
function fallbackToLocal(why: string): void {
  const m = botMatch;
  if (!m) return;
  clearBotMatch();
  const t = transport;
  transport = null;
  t?.close();
  useSession.getState().toast(`${why} — a partida contra bots seguiu no seu computador.`, 'error');
  useSession.getState().startLocal(m.o);
  useSession.setState({ offline: true });
}

/**
 * O `hello` leva o perfil e a identidade.
 *
 * Duas formas, na ordem: o **JWT** do serviço de contas, quando o jogador entrou (é o que faz a
 * conta ser a mesma em qualquer computador); e, sem login, as credenciais que o servidor sorteou
 * para este aparelho. O servidor valida o JWT por conta própria — mandar um forjado não leva a
 * nada além de entrar sem conta.
 */
function hello(server?: string): ClientMsg {
  const p = useProfile.getState();
  const account = server ? p.accounts[server] : undefined;
  const jwt = useAuth.getState().token ?? undefined;
  return { type: 'hello', name: p.name, avatar: p.avatar, cosmetics: myCosmetics(), account, jwt };
}

function handle(m: ServerMsg): void {
  const set = useSession.setState;
  switch (m.type) {
    case 'welcome':
      set({ playerId: m.playerId, serverName: m.serverName, status: 'connected', connError: null });
      // fila pedida antes da conexão existir: agora dá
      if (queueAfterHello) {
        transport?.send({ type: 'quickMatch', currency: queueAfterHello });
        queueAfterHello = null;
      }
      // partida contra bots: a sala é pedida assim que o servidor cumprimenta
      if (botMatch?.step === 'connect') {
        botMatch.step = 'create';
        transport?.send({ type: 'createRoom', settings: { ...botRoomSettings(botMatch.o, 'Contra bots', !!useSession.getState().account), listed: false } });
      }
      break;
    case 'account': {
      // o servidor é o dono do saldo, dos itens e do vínculo quando se joga online
      const server = useSession.getState().serverUrl;
      if (server) {
        const known = useProfile.getState().accounts[server];
        const token = m.account.token ?? known?.token;
        // saldo e itens ficam guardados junto: é o que as telas mostram antes de conectar
        if (token) {
          // o padocoin entra junto (inclusive como null, quando não há Discord vinculado): a barra
          // não deve perder a segunda moeda a cada reconexão, nem inventá-la para quem desvinculou
          useProfile.getState().setAccount(server, {
            id: m.account.id,
            token,
            money: m.account.money,
            owned: m.account.owned,
            pado: m.account.pado,
            until: m.account.tokenUntil ?? known?.until,
          });
        }
      }
      set({ account: { ...m.account, token: undefined } });
      useBond.getState().applyServer(m.account.bond);
      director.serverBond = true;
      break;
    }
    case 'rooms':
      set({ rooms: m.rooms });
      break;
    case 'room':
      // Entrar numa sala é o que põe o jogador "em jogo" — conectado, por si, é só estar no lobby.
      // A partida offline também recebe `room` (é o mesmo Lobby rodando no navegador), e ali o modo
      // tem de continuar 'local': é por ele que sair da partida fecha a sala e para os bots.
      set((s) => ({
        mode: s.mode === 'local' ? 'local' : 'online',
        room: m.room,
        ...(m.room.status === 'waiting' ? {} : { botsPending: false }),
      }));
      // a fila achou (ou abriu) a mesa: a espera terminou
      if (useSession.getState().queueing) {
        set({ queueing: false });
        clearQueue();
      }
      // a sala nasceu: senta os bots e começa. Daqui para frente, quem manda na mesa é o servidor.
      if (botMatch?.step === 'create' && m.room.status === 'waiting') {
        const o = botMatch.o;
        clearBotMatch();
        if (transport) seatBotsAndStart(transport, o);
      }
      break;
    case 'left':
      // saiu da sala, mas segue conectado: volta para o menu com a conta ainda viva
      set({ mode: 'none', room: null, chat: [] });
      director.reset();
      break;
    case 'opening':
      // a mesa está montada e conferindo os jogadores; lista vazia = a abertura acabou
      useTable.getState().setOpening(m.opening.players.length ? m.opening : null);
      break;
    case 'sync':
      director.sync(m.view);
      break;
    case 'event':
      director.enqueue(m.ev, m.view);
      break;
    case 'chat':
      set((s) => ({
        chat: [...s.chat.slice(-99), { id: seq++, from: m.from, text: m.text, seat: m.seat, system: m.system }],
      }));
      break;
    case 'emote':
      useTable.getState().addEmote(m.seat, m.emote);
      sfx.pop();
      break;
    case 'spun':
      // o servidor já cobrou e já entregou: aqui só a cena revela o que ele mandou
      useRoleta.getState().chegou({ key: m.prize, dup: m.dup, refund: m.refund });
      break;
    case 'bondUp': {
      const c = findCharacter(m.character);
      sfx.win();
      useSession.getState().toast(`${c.name} abriu o ${m.heart}º coração!`);
      break;
    }
    case 'bought': {
      // o item já é dele: o `account` com a lista nova chega logo atrás
      const item = findItem(m.item);
      sfx.win();
      useSession.getState().toast(item ? `${item.name} é seu!` : 'Compra concluída!');
      break;
    }
    case 'error':
      // um giro recusado (sem saldo, roleta inválida) não pode deixar a cena girando para sempre
      if (useRoleta.getState().status === 'girando') useRoleta.getState().fechar();
      // a fila recusou (sem saldo, mesa cheia): para de esperar e mostra o motivo
      if (useSession.getState().queueing) {
        set({ queueing: false });
        clearQueue();
      }
      // erro antes da mesa começar derruba a partida contra bots para o local
      if (botMatch) {
        fallbackToLocal(`O servidor recusou a mesa (${m.message})`);
        break;
      }
      useSession.getState().toast(m.message, 'error');
      break;
    default:
      break;
  }
}

export const useSession = create<SessionState>()((set, get) => ({
  mode: 'none',
  status: 'idle',
  serverName: '',
  serverUrl: '',
  connError: null,
  offline: false,
  botsPending: false,
  queueing: false,
  account: null,
  playerId: null,
  rooms: [],
  room: null,
  chat: [],
  toasts: [],

  connectOnline() {
    get().disconnect();
    // até o servidor mandar uma conta, o vínculo é do cliente (servidor sem contas continua assim)
    director.serverBond = false;
    useBond.getState().clearServer();
    set({ status: 'connecting', serverUrl: SERVER_URL, account: null, connError: null, offline: false });
    const t = net.ws(SERVER_URL, {
      onMessage: handle,
      onOpen: () => t.send(hello(SERVER_URL)),
      onClose: (reason) => {
        if (transport !== t) return;
        // a partida contra bots tem plano B; a lista de salas só tem o servidor
        if (botMatch) {
          fallbackToLocal(reason);
          return;
        }
        const emJogo = !!get().room;
        transport = null;
        director.reset();
        set({ mode: 'none', status: 'idle', room: null, playerId: null, rooms: [], connError: reason });
        // cair no meio de uma partida é notícia; não achar o servidor no menu, não — a tela de
        // Salas mostra o motivo e oferece tentar de novo, e a barra de moedas se marca como velha
        if (emJogo) get().toast(reason, 'error');
      },
    });
    transport = t;
  },

  quickMatch(currency) {
    if (get().queueing) return;
    set({ queueing: true });
    // sem conexão não há fila: conecta e pede quando o servidor cumprimentar
    if (get().status !== 'connected') {
      get().connectOnline();
      queueAfterHello = currency;
    } else {
      get().send({ type: 'quickMatch', currency });
    }
    // a fila não pode ficar girando para sempre se o servidor não responder
    queueTimer = setTimeout(() => {
      if (!useSession.getState().queueing) return;
      set({ queueing: false });
      get().toast('A fila não respondeu. Tente de novo.', 'error');
    }, QUEUE_WAIT_MS);
  },

  startBots(o) {
    // reaproveita a conexão do lobby quando já existe: reconectar perderia a conta por um instante
    if (get().status === 'connected' && transport) {
      set({ botsPending: true, offline: false });
      botMatch = { o, step: 'create' };
      // a mesa só cobra se houver conta para cobrar: servidor sem serviço de contas segue de graça
      transport.send({ type: 'createRoom', settings: { ...botRoomSettings(o, 'Contra bots', !!get().account), listed: false } });
    } else {
      get().connectOnline();
      set({ botsPending: true });
      botMatch = { o, step: 'connect' };
    }
    // se o servidor não abrir a mesa nesse tempo, a partida começa aqui mesmo
    botTimer = setTimeout(() => fallbackToLocal('O servidor não respondeu'), BOT_CONNECT_MS);
  },

  startLocal(o) {
    get().disconnect();
    // offline não tem conta: o vínculo volta a ser pontuado e salvo no cliente
    director.serverBond = false;
    useBond.getState().clearServer();
    set({ mode: 'local', status: 'connecting', chat: [], serverUrl: '', account: null, botsPending: false });
    const t = net.local({ onMessage: handle });
    transport = t;
    t.send(hello());
    t.send({ type: 'createRoom', settings: botRoomSettings(o, 'Treino Offline') });
    seatBotsAndStart(t, o);
  },

  send(msg) {
    transport?.send(msg);
  },

  stopPlaying() {
    director.freeze();
    // offline: fecha a sala local, então bots e temporizadores param de rodar
    if (get().mode === 'local') transport?.close();
  },

  leaveRoom() {
    if (get().mode === 'local') {
      get().disconnect();
      return;
    }
    transport?.send({ type: 'leaveRoom' });
    director.reset();
    set({ room: null, chat: [] });
  },

  disconnect() {
    clearBotMatch();
    clearQueue();
    set({ queueing: false });
    const t = transport;
    transport = null;
    t?.close();
    director.reset();
    director.serverBond = false;
    useBond.getState().clearServer();
    set({ mode: 'none', status: 'idle', room: null, playerId: null, rooms: [], chat: [], account: null, offline: false, botsPending: false });
  },

  toast(text, kind = 'info') {
    const id = seq++;
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
    setTimeout(() => get().dismissToast(id), 3800);
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

/** Reenvia o perfil quando nome/personagem/cosméticos mudam durante uma conexão. */
let lastSig = '';
useProfile.subscribe((p) => {
  const sig = JSON.stringify([
    p.name,
    p.avatar,
    p.character,
    findStyle(p, 'back', p.equipped.back).id,
  ]);
  if (sig === lastSig) return;
  lastSig = sig;
  if (transport && useSession.getState().status === 'connected') {
    transport.send({ type: 'updateProfile', name: p.name, avatar: p.avatar, cosmetics: myCosmetics() });
  }
});
