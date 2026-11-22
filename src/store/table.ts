import { create } from 'zustand';
import type { Card } from '../../shared/cards';
import type { GanhoDaPartida, Opening, SeatView, TableView } from '../../shared/protocol';
import type { AuraId, CardBackStyle, CardFaceStyle, CharacterStyle, WinFxId } from '../../shared/styles';
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
  /** O baralho da carta que voa (o do dealer): o verso e, se ela voa aberta, a frente. */
  back?: CardBackStyle;
  face?: CardFaceStyle;
  amount?: number;
  width?: number;
  fade?: boolean;
  arc?: number;
  /** Giro leve no ar (graus) — fichas jogadas na mesa. */
  spin?: number;
  /** Quicada ao pousar (px). */
  bounce?: number;
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

/** Tela de resultado do round (showdown): quem ganhou, com que mão e quanto. */
export interface RoundResult {
  id: number;
  seat: number;
  name: string;
  /** Titulo de conquista do jogador (null = nenhum). */
  title: string | null;
  character: CharacterStyle;
  /** As cartas do jogador e as da mesa que entraram na mão feita (`best`). */
  hole: Card[];
  board: Card[];
  /** As cinco cartas da mão feita. */
  best: Card[];
  /** Só as cartas que fazem o jogo: são as que ganham moldura e efeito. */
  core: Card[];
  handName: string;
  /** Um item por pote ganho (pote principal, secundários…). */
  pots: { label: string; amount: number }[];
  /** Quem pagou o vencedor nesta mão: as fichas que saíram de cada um para ele. */
  payers: { name: string; character: CharacterStyle; amount: number }[];
  won: number;
  /** Fichas depois de receber. */
  stack: number;
  /** Nomes dos outros vencedores, quando o pote é dividido. */
  split: string[];
  /** Efeito das cartas do vencedor. */
  winFx: WinFxId;
  /** A frente das cartas da rodada (a do baralho do dealer); sem ela, vale a de quem está olhando. */
  face?: CardFaceStyle;
  /** Auras do vencedor: são elas que abrem atrás dele no cut-in. */
  auras: AuraId[];
}

/**
 * Tela de fim de partida (placar): mostrada quando o jogo acaba ('over') ou quando você
 * sai da mesa ('leave'). O placar em si é montado na tela, a partir do estado da mesa.
 */
export interface MatchEnd {
  id: number;
  kind: 'over' | 'leave';
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
  /** Momento local (ms) em que vence a pergunta "apostar um acessório para continuar?" (null = não há pergunta). */
  ofertaAte: number | null;
  flyers: Flyer[];
  splash: Splash | null;
  result: RoundResult | null;
  match: MatchEnd | null;
  emotes: EmoteBubble[];
  callouts: Callout[];
  log: LogLine[];
  gameOver: Ranking[] | null;
  /** O que cada um levou da partida (xp e consolação), vindo com o fim dela. */
  ganhos: GanhoDaPartida[] | null;
  winners: number[];
  /**
   * A abertura da partida: a tela de "preparando a mesa" com o card de cada jogador.
   * null = não há abertura em curso (a partida já está rolando, ou é offline).
   */
  opening: Opening | null;
  /** Poker de 5 cartas: posições da minha mão marcadas para trocar. */
  discards: number[];
  setDisplay(v: TableView | null, receivedAt?: number): void;
  patchSeat(seat: number, patch: Partial<SeatView>): void;
  patchDisplay(patch: Partial<TableView>): void;
  addFlyer(f: Flyer): void;
  removeFlyers(ids: number[]): void;
  setSplash(s: Splash | null): void;
  setResult(r: RoundResult | null): void;
  setMatch(m: MatchEnd | null): void;
  addEmote(seat: number, emote: string): void;
  addCallout(seat: number, text: string, kind: CalloutKind): void;
  addLog(text: string, kind?: LogLine['kind']): void;
  /** O fim da partida, e o que cada um levou dela. Limpar o fim limpa os ganhos junto. */
  setGameOver(r: Ranking[] | null, ganhos?: GanhoDaPartida[] | null): void;
  setWinners(w: number[]): void;
  setOpening(opening: Opening | null): void;
  toggleDiscard(i: number): void;
  clearDiscards(): void;
  reset(): void;
}

let uid = 1;
export const nextId = () => uid++;

export const useTable = create<TableState>()((set, get) => ({
  display: null,
  deadline: null,
  ofertaAte: null,
  flyers: [],
  splash: null,
  result: null,
  match: null,
  emotes: [],
  callouts: [],
  log: [],
  gameOver: null,
  ganhos: null,
  winners: [],
  opening: null,
  discards: [],
  setDisplay: (v, receivedAt) =>
    set({
      display: v,
      deadline: v && v.toAct !== null && v.timeLeftMs !== null ? (receivedAt ?? Date.now()) + v.timeLeftMs : null,
      ofertaAte: v?.oferta ? (receivedAt ?? Date.now()) + v.oferta.timeLeftMs : null,
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
  setResult: (result) => set({ result }),
  setMatch: (match) => set({ match }),
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
  setGameOver: (gameOver, ganhos = null) => set({ gameOver, ganhos: gameOver ? ganhos : null }),
  setWinners: (winners) => set({ winners }),
  setOpening: (opening) => set({ opening }),
  toggleDiscard: (i) => set((s) => ({ discards: s.discards.includes(i) ? s.discards.filter((x) => x !== i) : [...s.discards, i].sort((a, b) => a - b) })),
  clearDiscards: () => set({ discards: [] }),
  reset: () =>
    set({
      display: null,
      deadline: null,
      flyers: [],
      splash: null,
      result: null,
      match: null,
      emotes: [],
      callouts: [],
      log: [],
      gameOver: null,
      ganhos: null,
      winners: [],
      opening: null,
      discards: [],
    }),
}));
