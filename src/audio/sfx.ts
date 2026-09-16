/** Efeitos sonoros sintetizados com WebAudio — sem arquivos de áudio. */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let volume = 0.7;
let muted = false;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : volume;
      master.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function setVolume(v: number, m: boolean): void {
  volume = v;
  muted = m;
  if (master) master.gain.value = m ? 0 : v;
}

function noise(c: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

interface NoiseOpts {
  dur: number;
  type?: BiquadFilterType;
  freq: number;
  freqEnd?: number;
  q?: number;
  gain: number;
  at?: number;
}

function playNoise(o: NoiseOpts): void {
  const c = ac();
  if (!c || !master || muted) return;
  const t0 = c.currentTime + (o.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.frequency.setValueAtTime(o.freq, t0);
  if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t0 + o.dur);
  f.Q.value = o.q ?? 1;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.gain, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + o.dur + 0.02);
}

interface ToneOpts {
  freq: number;
  dur: number;
  type?: OscillatorType;
  gain: number;
  freqEnd?: number;
  at?: number;
  attack?: number;
}

function playTone(o: ToneOpts): void {
  const c = ac();
  if (!c || !master || muted) return;
  const t0 = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t0);
  if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t0 + o.dur);
  const g = c.createGain();
  const a = o.attack ?? 0.004;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.gain, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.02);
}

/** Nota "pinçada" (cravo): dente-de-serra com ataque instantâneo e decaimento rápido, mais a oitava. */
function pluck(freq: number, at: number, dur: number, gain = 0.05): void {
  playTone({ freq, dur, type: 'sawtooth', gain: gain * 0.6, at, attack: 0.002 });
  playTone({ freq: freq * 2, dur: dur * 0.6, type: 'triangle', gain: gain * 0.5, at, attack: 0.002 });
}

export const sfx = {
  unlock(): void {
    ac();
  },
  deal(): void {
    playNoise({ dur: 0.09, freq: 3200, freqEnd: 1400, q: 1.1, gain: 0.3 });
  },
  flip(): void {
    playNoise({ dur: 0.05, type: 'highpass', freq: 2600, gain: 0.25 });
    playTone({ freq: 700, dur: 0.05, type: 'triangle', gain: 0.05 });
  },
  chip(at = 0): void {
    const f = 2400 + Math.random() * 500;
    playTone({ freq: f, dur: 0.05, gain: 0.1, at });
    playTone({ freq: f * 1.52, dur: 0.035, gain: 0.06, at: at + 0.008 });
    playNoise({ dur: 0.025, type: 'highpass', freq: 4000, gain: 0.08, at });
  },
  chips(n = 4): void {
    let t = 0;
    for (let i = 0; i < n; i++) {
      sfx.chip(t);
      t += 0.035 + Math.random() * 0.04;
    }
  },
  knock(): void {
    for (const at of [0, 0.16]) {
      playTone({ freq: 150, freqEnd: 70, dur: 0.12, gain: 0.55, at });
      playNoise({ dur: 0.04, type: 'lowpass', freq: 900, gain: 0.25, at });
    }
  },
  fold(): void {
    playNoise({ dur: 0.2, freq: 1400, freqEnd: 500, q: 0.8, gain: 0.22 });
  },
  /** Sineta de balcão: parciais inarmônicas com decaimento longo. */
  turn(): void {
    playTone({ freq: 1568, dur: 0.9, gain: 0.1 });
    playTone({ freq: 1568 * 2.76, dur: 0.45, gain: 0.035 });
    playTone({ freq: 1568 * 5.4, dur: 0.2, gain: 0.015 });
    playNoise({ dur: 0.02, type: 'highpass', freq: 5000, gain: 0.05 });
  },
  allin(): void {
    playTone({ freq: 90, freqEnd: 45, dur: 0.5, gain: 0.5 });
    playNoise({ dur: 0.35, type: 'lowpass', freq: 700, gain: 0.3 });
    sfx.chips(8);
  },
  /** Arpejo de cravo (Ré maior) terminando num acorde. */
  win(): void {
    [587.33, 739.99, 880, 1174.66, 880, 1174.66].forEach((f, i) => pluck(f, i * 0.075, 0.32));
    for (const f of [587.33, 739.99, 880, 1174.66]) pluck(f, 0.5, 1.1, 0.03);
    playTone({ freq: 2349.3, dur: 0.8, gain: 0.03, at: 0.5 });
  },
  lose(): void {
    [440, 349.23, 293.66].forEach((f, i) => pluck(f, i * 0.16, 0.5, 0.045));
  },
  /** Toque seco de madeira. */
  click(): void {
    playTone({ freq: 520, freqEnd: 380, dur: 0.06, type: 'triangle', gain: 0.1 });
    playNoise({ dur: 0.02, type: 'bandpass', freq: 1800, q: 2, gain: 0.08 });
  },
  hover(): void {
    playTone({ freq: 1046.5, dur: 0.04, gain: 0.015 });
  },
  /** Tique-taque de relógio de pêndulo. */
  tick(): void {
    playNoise({ dur: 0.035, type: 'bandpass', freq: 2600, q: 4, gain: 0.22 });
    playTone({ freq: 1200, dur: 0.04, type: 'triangle', gain: 0.05 });
  },
  pop(): void {
    pluck(783.99, 0, 0.25, 0.05);
    pluck(1174.66, 0.06, 0.3, 0.04);
  },
};
