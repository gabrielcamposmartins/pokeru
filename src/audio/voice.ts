/**
 * Vozes dos personagens: toca os .wav de assets/characters/falas.
 *
 *   <personagem>/<NNN>_<fala>.wav          falas próprias (NNN = posição em <personagem>.jsonc)
 *   <personagem>/comum/<NNN>_<fala>.wav    falas comuns na voz do personagem (posição em comum.jsonc)
 *
 * O arquivo é escolhido pelo número; áudios que ainda não existem são simplesmente pulados.
 * Uma voz toca de cada vez; falas que esperam demais na fila são descartadas.
 */

/** Momentos das falas próprias — mesma ordem de assets/characters/falas/<personagem>.jsonc. */
export const FALA_SLOTS = ['join', 'turn', 'check', 'call', 'bet', 'raise', 'allin', 'fold', 'showdown', 'win', 'big_win', 'lose', 'bust', 'rebuy', 'blinds_up', 'idle'] as const;

/** Momentos das falas comuns — mesma ordem de assets/characters/falas/comum.jsonc. */
export const COMUM_SLOTS = [
  'check',
  'bet',
  'call',
  'raise',
  'reraise',
  'allin',
  'fold',
  'show',
  'muck',
  'high_card',
  'pair',
  'two_pair',
  'trips',
  'straight',
  'flush',
  'full_house',
  'quads',
  'straight_flush',
  'royal_flush',
] as const;

export type FalaSlot = (typeof FALA_SLOTS)[number];
export type ComumSlot = (typeof COMUM_SLOTS)[number];

/** Nome da mão falado no showdown, pela categoria do avaliador (0 = carta alta … 8 = straight flush). */
const HAND_SLOTS: ComumSlot[] = ['high_card', 'pair', 'two_pair', 'trips', 'straight', 'flush', 'full_house', 'quads', 'straight_flush'];

export function handSlot(category: number, royal: boolean): ComumSlot {
  return royal ? 'royal_flush' : (HAND_SLOTS[category] ?? 'high_card');
}

// ------------------------------------------------------------------ banco de áudios

interface VoiceBank {
  fala: Map<number, string>;
  comum: Map<number, string>;
}

const FILES = import.meta.glob('../../assets/characters/falas/**/*.wav', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const BANK = new Map<string, VoiceBank>();
for (const [path, url] of Object.entries(FILES)) {
  const parts = path.split('/');
  const file = parts.pop()!;
  const rel = parts.slice(parts.lastIndexOf('falas') + 1); // ['marina'] ou ['marina', 'comum']
  const num = parseInt(file, 10);
  if (!rel.length || !(num > 0)) continue; // soltos na raiz: rode npm run audios:organizar
  let bank = BANK.get(rel[0]);
  if (!bank) BANK.set(rel[0], (bank = { fala: new Map(), comum: new Map() }));
  if (rel.length === 1) bank.fala.set(num - 1, url);
  else if (rel.length === 2 && rel[1] === 'comum') bank.comum.set(num - 1, url);
}

export function voiceUrl(charId: string, kind: 'fala', slot: FalaSlot): string | undefined;
export function voiceUrl(charId: string, kind: 'comum', slot: ComumSlot): string | undefined;
export function voiceUrl(charId: string, kind: 'fala' | 'comum', slot: string): string | undefined {
  const bank = BANK.get(charId);
  if (!bank) return undefined;
  return kind === 'fala' ? bank.fala.get(FALA_SLOTS.indexOf(slot as FalaSlot)) : bank.comum.get(COMUM_SLOTS.indexOf(slot as ComumSlot));
}

// ------------------------------------------------------------------ reprodução

/** Tempo máximo que uma fala espera na fila antes de ser descartada. */
const MAX_WAIT = 2500;
const MAX_QUEUE = 3;

let gain = 0.8;
let enabled = true;

export interface SayOptions {
  /** Quem fala (um jogador na mesa). */
  speaker?: string;
  /**
   * Fala própria do personagem na vez dele: enquanto ela toca (ou espera na fila),
   * as vozes dos outros jogadores são descartadas.
   */
  exclusive?: boolean;
  /** Anúncio (showdown, vitória, eliminação…): não é descartado pela exclusividade, só espera a vez. */
  important?: boolean;
}

/** Cada item é uma sequência de áudios tocados em seguida (ex.: nome da mão + fala de vitória). */
interface Pending extends SayOptions {
  urls: string[];
  at: number;
}

let playing: HTMLAudioElement | null = null;
/** Item do áudio que está tocando. */
let current: Pending | null = null;
let queue: Pending[] = [];

/** Jogador com uma fala exclusiva tocando ou esperando na fila (null = ninguém). */
function exclusiveSpeaker(): string | null {
  if (playing && current?.exclusive) return current.speaker ?? '';
  const now = Date.now();
  const q = queue.find((p) => p.exclusive && now - p.at <= MAX_WAIT);
  return q ? (q.speaker ?? '') : null;
}

export function setVoiceVolume(v: number, on: boolean): void {
  gain = Math.max(0, Math.min(1, v));
  enabled = on;
  if (playing) playing.volume = gain;
  if (!on) stopVoices();
}

function playNext(): void {
  if (playing) return;
  const now = Date.now();
  queue = queue.filter((q) => now - q.at <= MAX_WAIT);
  const item = queue[0];
  if (!item) return;
  const url = item.urls.shift()!;
  if (!item.urls.length) queue.shift();
  else item.at = Date.now(); // o resto da sequência continua valendo
  let a: HTMLAudioElement;
  try {
    a = new Audio(url);
  } catch {
    return;
  }
  a.volume = gain;
  playing = a;
  current = item;
  let finished = false;
  let started = false;
  const done = () => {
    if (finished) return;
    finished = true;
    if (!started) a.pause();
    if (playing === a) {
      playing = null;
      current = null;
    }
    playNext();
  };
  a.onplaying = () => {
    started = true;
    if (finished) a.pause(); // começou tarde demais (a fila já seguiu): não fala fora de hora
  };
  a.onended = done;
  a.onerror = done;
  // garante que a fila anda mesmo se o navegador não disparar "ended"
  a.onloadedmetadata = () => setTimeout(done, (Number.isFinite(a.duration) ? a.duration : 4) * 1000 + 400);
  // se o navegador adiar o carregamento (ex.: aba em segundo plano), desiste em vez de travar a fila
  setTimeout(() => {
    if (!started) done();
  }, 1500);
  setTimeout(done, 8000);
  a.play().catch(done);
}

/** Enfileira uma sequência de falas (as que não existem são puladas). Devolve se foi aceita. */
function enqueue(urls: (string | undefined)[], opts: SayOptions): boolean {
  const list = urls.filter((u): u is string => !!u);
  if (!enabled || gain <= 0 || !list.length || typeof Audio === 'undefined') return false;
  // alguém está na vez dele dizendo uma fala própria: os outros não falam junto nem logo depois
  const ex = exclusiveSpeaker();
  if (ex !== null && !opts.important && opts.speaker !== ex) return false;
  queue.push({ ...opts, urls: list, at: Date.now() });
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  playNext();
  return true;
}

export function say(...urls: (string | undefined)[]): boolean {
  return enqueue(urls, {});
}

export function sayWith(opts: SayOptions, ...urls: (string | undefined)[]): boolean {
  return enqueue(urls, opts);
}

export function sayLine(charId: string | null | undefined, slot: FalaSlot, opts: SayOptions = {}): boolean {
  return !!charId && enqueue([voiceUrl(charId, 'fala', slot)], opts);
}

export function sayCommon(charId: string | null | undefined, slot: ComumSlot, opts: SayOptions = {}): boolean {
  return !!charId && enqueue([voiceUrl(charId, 'comum', slot)], opts);
}

export function stopVoices(): void {
  queue = [];
  current = null;
  if (playing) {
    playing.pause();
    playing = null;
  }
}

// ------------------------------------------------------------------ jogadas

/**
 * Falas próprias que o jogo usa: no all-in e na vitória, sempre; no showdown, na derrota e na sua
 * vez, quando o vínculo com o personagem libera (as recompensas estão em src/game/bond.ts).
 * Nos outros momentos é sempre a fala comum.
 */
export const FALAS_USADAS: FalaSlot[] = ['allin', 'win', 'big_win', 'showdown', 'lose', 'turn'];

/**
 * Fala da jogada de `player`: a chamada comum (チェック, ベット, コール, レイズ/リレイズ, フォールド).
 * No all-in, a fala própria do personagem — exclusiva: enquanto toca, os outros jogadores não falam.
 * Se a fala própria ainda não foi gerada, diz a chamada comum (オールイン).
 */
export function sayAction(player: string, charId: string | null | undefined, slot: ComumSlot): boolean {
  if (!charId) return false;
  const own = slot === 'allin' ? voiceUrl(charId, 'fala', 'allin') : undefined;
  if (own) return enqueue([own], { speaker: player, exclusive: true });
  return enqueue([voiceUrl(charId, 'comum', slot)], { speaker: player });
}

/** Nova partida: para as vozes. */
export function resetVoices(): void {
  stopVoices();
}
