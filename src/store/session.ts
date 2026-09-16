import { create } from 'zustand';
import {
  DEFAULT_SETTINGS,
  type BotDifficulty,
  type ClientMsg,
  type GameMode,
  type RoomInfo,
  type RoomSummary,
  type ServerMsg,
} from '../../shared/protocol';
import { connectLocal, connectWs, type Transport } from '../net/transport';
import { findStyle, myCosmetics, useProfile } from './profile';
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
  turnTime: number;
  pace: number;
}

interface SessionState {
  mode: 'none' | 'local' | 'online';
  status: 'idle' | 'connecting' | 'connected';
  serverName: string;
  playerId: string | null;
  rooms: RoomSummary[];
  room: RoomInfo | null;
  chat: ChatLine[];
  toasts: Toast[];
  connectOnline(url: string): void;
  startLocal(o: LocalOptions): void;
  send(msg: ClientMsg): void;
  leaveRoom(): void;
  disconnect(): void;
  toast(text: string, kind?: Toast['kind']): void;
  dismissToast(id: number): void;
}

let transport: Transport | null = null;
let seq = 1;

function hello(): ClientMsg {
  const p = useProfile.getState();
  return { type: 'hello', name: p.name, avatar: p.avatar, cosmetics: myCosmetics() };
}

function handle(m: ServerMsg): void {
  const set = useSession.setState;
  switch (m.type) {
    case 'welcome':
      set({ playerId: m.playerId, serverName: m.serverName, status: 'connected' });
      break;
    case 'rooms':
      set({ rooms: m.rooms });
      break;
    case 'room':
      set({ room: m.room });
      break;
    case 'left':
      set({ room: null, chat: [] });
      director.reset();
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
    case 'error':
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
  playerId: null,
  rooms: [],
  room: null,
  chat: [],
  toasts: [],

  connectOnline(url) {
    get().disconnect();
    set({ mode: 'online', status: 'connecting' });
    const t = connectWs(url, {
      onMessage: handle,
      onOpen: () => t.send(hello()),
      onClose: (reason) => {
        if (transport !== t) return;
        transport = null;
        director.reset();
        set({ mode: 'none', status: 'idle', room: null, playerId: null, rooms: [] });
        get().toast(reason, 'error');
      },
    });
    transport = t;
  },

  startLocal(o) {
    get().disconnect();
    set({ mode: 'local', status: 'connecting', chat: [] });
    const t = connectLocal({ onMessage: handle });
    transport = t;
    t.send(hello());
    t.send({
      type: 'createRoom',
      settings: {
        ...DEFAULT_SETTINGS,
        name: 'Treino Offline',
        maxPlayers: Math.min(6, o.bots + 1),
        startingStack: o.startingStack,
        smallBlind: o.smallBlind,
        bigBlind: o.bigBlind,
        mode: o.mode,
        turnTime: o.turnTime,
        pace: o.pace,
      },
    });
    for (let i = 0; i < o.bots; i++) t.send({ type: 'addBot', difficulty: o.difficulty });
    t.send({ type: 'startGame' });
  },

  send(msg) {
    transport?.send(msg);
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
    const t = transport;
    transport = null;
    t?.close();
    director.reset();
    set({ mode: 'none', status: 'idle', room: null, playerId: null, rooms: [], chat: [] });
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
