import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { COMUM_SLOTS, FALA_SLOTS, FALAS_USADAS, handSlot, resetVoices, sayAction, sayCommon, sayWith, setVoiceVolume, voiceUrl } from './voice';
import { CHARACTER_PRESETS } from '../../shared/styles';

const FALAS = new URL('../../assets/characters/falas/', import.meta.url);

/** Slots escritos nos comentários ("// slot: tradução") de um .jsonc de falas. */
function slotsOf(file: string): string[] {
  const text = readFileSync(new URL(file, FALAS), 'utf8');
  return text
    .split(String.fromCharCode(10))
    .filter((l) => l.trim().startsWith('"') && l.includes('//'))
    .map((l) => l.slice(l.lastIndexOf('//') + 2).trim().split(':')[0]);
}

describe('vozes', () => {
  it('a ordem dos slots bate com os comentários dos .jsonc', () => {
    for (const c of CHARACTER_PRESETS) expect(slotsOf(`${c.id}.jsonc`)).toEqual([...FALA_SLOTS]);
    expect(slotsOf('comum.jsonc')).toEqual([...COMUM_SLOTS]);
  });

  it('todo personagem tem as falas próprias usadas e as chamadas comuns', () => {
    for (const c of CHARACTER_PRESETS) {
      for (const slot of FALAS_USADAS) expect(voiceUrl(c.id, 'fala', slot), `${c.id} ${slot}`).toBeTruthy();
      for (const slot of ['check', 'bet', 'call', 'raise', 'reraise', 'allin', 'fold', 'show'] as const) {
        expect(voiceUrl(c.id, 'comum', slot), `${c.id} comum ${slot}`).toBeTruthy();
      }
    }
    expect(voiceUrl('marina', 'fala', 'join')).toMatch(/marina\/001_/);
    expect(voiceUrl('ren', 'comum', 'check')).toMatch(/ren\/comum\/001_/);
  });

  it('nome da mão pela categoria', () => {
    expect(handSlot(0, false)).toBe('high_card');
    expect(handSlot(5, false)).toBe('flush');
    expect(handSlot(8, false)).toBe('straight_flush');
    expect(handSlot(8, true)).toBe('royal_flush');
  });
});

describe('fila de vozes', () => {
  const played: string[] = [];
  const audios: FakeAudio[] = [];
  class FakeAudio {
    volume = 1;
    duration = NaN;
    onplaying: (() => void) | null = null;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onloadedmetadata: (() => void) | null = null;
    constructor(public src: string) {
      audios.push(this);
    }
    play() {
      played.push(this.src);
      this.onplaying?.();
      return Promise.resolve();
    }
    pause() {}
  }
  /** O áudio que está tocando termina. */
  const finish = () => audios[audios.length - 1].onended?.();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('Audio', FakeAudio);
    played.length = 0;
    audios.length = 0;
    resetVoices();
    setVoiceVolume(1, true);
  });
  afterEach(() => {
    resetVoices();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('jogadas: sempre a chamada comum; no all-in, a fala própria', () => {
    const plays: [string, string, 'check' | 'bet' | 'call' | 'raise' | 'reraise' | 'fold' | 'allin'][] = [
      ['1:ren', 'ren', 'check'],
      ['2:tobi', 'tobi', 'bet'],
      ['3:marina', 'marina', 'raise'],
      ['1:ren', 'ren', 'reraise'],
      ['2:tobi', 'tobi', 'fold'],
      ['3:marina', 'marina', 'allin'],
      ['1:ren', 'ren', 'call'],
    ];
    for (const [p, c, slot] of plays) {
      expect(sayAction(p, c, slot)).toBe(true);
      finish();
    }
    expect(played).toEqual([
      voiceUrl('ren', 'comum', 'check'),
      voiceUrl('tobi', 'comum', 'bet'),
      voiceUrl('marina', 'comum', 'raise'),
      voiceUrl('ren', 'comum', 'reraise'),
      voiceUrl('tobi', 'comum', 'fold'),
      voiceUrl('marina', 'fala', 'allin'),
      voiceUrl('ren', 'comum', 'call'),
    ]);
  });

  it('fala própria do all-in: os outros não falam enquanto ela toca', () => {
    expect(sayAction('1:ren', 'ren', 'allin')).toBe(true);
    expect(sayAction('2:tobi', 'tobi', 'fold')).toBe(false); // Tobi fica quieto
    finish(); // Ren terminou
    expect(sayAction('2:tobi', 'tobi', 'call')).toBe(true);
    expect(played).toEqual([voiceUrl('ren', 'fala', 'allin'), voiceUrl('tobi', 'comum', 'call')]);
  });

  it('chamada comum não cala os outros (eles falam em seguida)', () => {
    sayAction('1:ren', 'ren', 'check');
    expect(sayAction('2:tobi', 'tobi', 'call')).toBe(true); // espera e fala depois
    finish();
    expect(played).toEqual([voiceUrl('ren', 'comum', 'check'), voiceUrl('tobi', 'comum', 'call')]);
  });

  it('anúncios e o próprio jogador não são calados pela fala do all-in', () => {
    sayAction('1:ren', 'ren', 'allin');
    expect(sayCommon('ren', 'show', { speaker: '1:ren' })).toBe(true);
    expect(sayWith({ important: true }, voiceUrl('marina', 'fala', 'win'))).toBe(true);
    finish();
    finish();
    expect(played).toEqual([voiceUrl('ren', 'fala', 'allin'), voiceUrl('ren', 'comum', 'show'), voiceUrl('marina', 'fala', 'win')]);
  });
});
