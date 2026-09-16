import { create } from 'zustand';
import type { Card } from '../../shared/cards';
import type { SeatView, TableView } from '../../shared/protocol';
import type { CardBackStyle, CharacterStyle } from '../../shared/styles';
import type { Pt } from '../game/layout';

export interface Flyer {
  id: number;
  kind: 'card' | 'chips';
  /** 'plane' = coordenadas do plano da mesa; 'screen' = coordenadas do palco. */
  space?: 'plane' | 'screen';
  from: Pt;
  to: Pt;
  dur: number;
  rotFrom?: number;
  rotTo?: number;
  scaleFrom?: number;
  scaleTo?: number;
  card?: Card | null;
  faceUp?: boolean;
  back?: CardBackStyle;
  amount?: number;
  width?: number;
  fade?: boolean;
  arc?: number;
  onDone?: () => void;
}

export interface Splash {
  id: number;
  title: string;
  subtitle?: string;
  kind: 'win' | 'lose' | 'info' | 'big';
  /** Com personagem: vira um "cut-in" estilo Mahjong Soul. */
  character?: CharacterStyle;
}

export interface EmoteBubble {
  id: number;
  seat: number;
  emote: string;
}

export type CalloutKind = 'fold' | 'check' | 'call' | 'raise' | 'allin';

export interface Callout {
  id: number;
  seat: number;
  text: string;
  kind: CalloutKind;
}

export interface LogLine {
  id: number;
  text: string;
  kind?: 'hand' | 'win' | 'street';
}

export interface Ranking {
  name: string;
  place: number;
  seat: number;
}

interface TableState {
  display: TableView | null;
  /** Momento local (ms) em que a vez atual expira. */
  deadline: number | null;
  flyers: Flyer[];
  splash: Splash | null;
  emotes: EmoteBubble[];
  callouts: Callout[];
  log: LogLine[];
  gameOver: Ranking[] | null;
  winners: number[];
  setDisplay(v: TableView | null, receivedAt?: number): void;
  patchSeat(seat: number, patch: Partial<SeatView>): void;
  patchDisplay(patch: Partial<TableView>): void;
  addFlyer(f: Flyer): void;
  removeFlyers(ids: number[]): void;
  setSplash(s: Splash | null): void;
  addEmote(seat: number, emote: string): void;
  addCallout(seat: number, text: string, kind: CalloutKind): void;
  addLog(text: string, kind?: LogLine['kind']): void;
  setGameOver(r: Ranking[] | null): void;
  setWinners(w: number[]): void;
  reset(): void;
}

let uid = 1;
export const nextId = () => uid++;

export const useTable = create<TableState>()((set, get) => ({
  display: null,
  deadline: null,
  flyers: [],
  splash: null,
  emotes: [],
  callouts: [],
  log: [],
  gameOver: null,
  winners: [],
  setDisplay: (v, receivedAt) =>
    set({
      display: v,
      deadline: v && v.toAct !== null && v.timeLeftMs !== null ? (receivedAt ?? Date.now()) + v.timeLeftMs : null,
    }),
  patchSeat: (seat, patch) => {
    const d = get().display;
    if (!d || !d.seats[seat]) return;
    const seats = d.seats.slice();
    seats[seat] = { ...seats[seat]!, ...patch };
    set({ display: { ...d, seats } });
  },
  patchDisplay: (patch) => {
    const d = get().display;
    if (d) set({ display: { ...d, ...patch } });
  },
  addFlyer: (f) => set((s) => ({ flyers: [...s.flyers, f] })),
  removeFlyers: (ids) => set((s) => ({ flyers: s.flyers.filter((f) => !ids.includes(f.id)) })),
  setSplash: (splash) => set({ splash }),
  addEmote: (seat, emote) => {
    const id = nextId();
    set((s) => ({ emotes: [...s.emotes, { id, seat, emote }] }));
    setTimeout(() => set((s) => ({ emotes: s.emotes.filter((e) => e.id !== id) })), 2600);
  },
  addCallout: (seat, text, kind) => {
    const id = nextId();
    // um anúncio por jogador de cada vez
    set((s) => ({ callouts: [...s.callouts.filter((c) => c.seat !== seat), { id, seat, text, kind }] }));
    setTimeout(() => set((s) => ({ callouts: s.callouts.filter((c) => c.id !== id) })), 1300);
  },
  addLog: (text, kind) => set((s) => ({ log: [...s.log.slice(-120), { id: nextId(), text, kind }] })),
  setGameOver: (gameOver) => set({ gameOver }),
  setWinners: (winners) => set({ winners }),
  reset: () =>
    set({ display: null, deadline: null, flyers: [], splash: null, emotes: [], callouts: [], log: [], gameOver: null, winners: [] }),
}));
