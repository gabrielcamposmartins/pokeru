/**
 * Efeitos sonoros sintetizados com WebAudio — sem arquivos de áudio.
 *
 * O som é seco, de propósito: uma mesa de poker é uma sala pequena, cheia de pano e feltro. Uma
 * reverb aqui (já houve) fazia tudo soar como num salão vazio. No fim só há um limitador, que
 * segura os picos quando muitos sons tocam juntos e não mexe no resto.
 *
 * As fichas são o som que mais se ouve no jogo, e por isso têm síntese própria. Uma ficha de argila
 * não "toca" uma nota: o choque é um "tec" seco e ruidoso, com a energia entre 2 e 6 kHz, que some
 * em uns 20 ms. Então cada batida é um estouro de ruído passado por ressonâncias largas (a cor da
 * ficha), com um pouco de corpo grave, e quase sempre dois toques colados — as duas fichas que se
 * chocam, uma na outra, a poucos milissegundos. As variações são geradas uma vez, em buffers, e
 * tocadas com altura e volume um pouco diferentes a cada vez. Por cima disso ficam os sons de cada momento: a aposta caindo no feltro, as fichas
 * arrastadas para o pote, o pote indo para quem ganhou e o empurrão do all-in.
 */

let ctx: AudioContext | null = null;
/** O volume geral (o controle de som da interface mexe aqui). */
let master: GainNode | null = null;
/** Onde todos os sons entram (e seguem para o volume). */
let bus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let volume = 0.7;
let muted = false;
/** Conjunto de sons do tema da interface (src/ui/themes.ts). */
export type SoundSet = 'default' | 'victorian';
let soundSet: SoundSet = 'default';

export function setSoundSet(set: SoundSet): void {
  soundSet = set;
}

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      ctx = new AudioContext();
      // só um limitador: pega os picos (muitas fichas de uma vez) sem amassar o ataque de cada som
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -4;
      comp.knee.value = 2;
      comp.ratio.value = 8;
      comp.attack.value = 0.001;
      comp.release.value = 0.08;
      comp.connect(ctx.destination);
      master = ctx.createGain();
      master.gain.value = muted ? 0 : volume;
      master.connect(comp);
      bus = ctx.createGain();
      bus.connect(master);
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

/** Liga uma fonte ao barramento, com um pouco de posição estéreo quando pedido. */
function saida(c: AudioContext, node: AudioNode, pan = 0): void {
  if (pan && c.createStereoPanner) {
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(p).connect(bus!);
  } else node.connect(bus!);
}

interface NoiseOpts {
  dur: number;
  type?: BiquadFilterType;
  freq: number;
  freqEnd?: number;
  q?: number;
  gain: number;
  at?: number;
  attack?: number;
  pan?: number;
}

function playNoise(o: NoiseOpts): void {
  const c = ac();
  if (!c || !bus || muted) return;
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
  g.gain.exponentialRampToValueAtTime(o.gain, t0 + (o.attack ?? 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
  src.connect(f).connect(g);
  saida(c, g, o.pan);
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
  pan?: number;
}

function playTone(o: ToneOpts): void {
  const c = ac();
  if (!c || !bus || muted) return;
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
  osc.connect(g);
  saida(c, g, o.pan);
  osc.start(t0);
  osc.stop(t0 + o.dur + 0.02);
}

/** Nota "pinçada" (cravo): dente-de-serra com ataque instantâneo e decaimento rápido, mais a oitava. */
function pluck(freq: number, at: number, dur: number, gain = 0.05): void {
  playTone({ freq, dur, type: 'sawtooth', gain: gain * 0.6, at, attack: 0.002 });
  playTone({ freq: freq * 2, dur: dur * 0.6, type: 'triangle', gain: gain * 0.5, at, attack: 0.002 });
}

/** Sino de vidro: a fundamental, a oitava levemente desafinada e a parcial de sino por cima. */
function sino(freq: number, at: number, dur: number, gain = 0.06, pan = 0): void {
  playTone({ freq, dur, gain, at, attack: 0.003, pan });
  playTone({ freq: freq * 2.005, dur: dur * 0.7, gain: gain * 0.45, at, attack: 0.003, pan });
  playTone({ freq: freq * 2.76, dur: dur * 0.35, gain: gain * 0.2, at, attack: 0.002, pan });
}

// ------------------------------------------------------------------ fichas

/**
 * Um buffer montado amostra a amostra.
 * `fill` recebe o tempo (s) e devolve a amostra; o resultado é normalizado para o pico `pico`.
 */
function montar(c: AudioContext, dur: number, fill: (t: number) => number, pico = 0.9): AudioBuffer {
  const n = Math.floor(c.sampleRate * dur);
  const b = c.createBuffer(1, n, c.sampleRate);
  const d = b.getChannelData(0);
  let max = 0;
  for (let i = 0; i < n; i++) {
    d[i] = fill(i / c.sampleRate);
    max = Math.max(max, Math.abs(d[i]));
  }
  // as pontas somem suavemente (sem estalo digital no fim)
  const cauda = Math.min(n, Math.floor(c.sampleRate * 0.004));
  for (let i = 0; i < cauda; i++) d[n - 1 - i] *= i / cauda;
  if (max > 0) for (let i = 0; i < n; i++) d[i] *= pico / max;
  return b;
}

/**
 * Um ressonador de dois polos (o filtro passa-faixa mais simples que existe), aplicado amostra a
 * amostra. `q` baixo é uma cor larga, de ruído; `q` alto começa a soar como nota — e ficha não é nota.
 */
function ressonador(freq: number, q: number, sr: number) {
  const w = (2 * Math.PI * freq) / sr;
  const r = Math.exp((-Math.PI * (freq / q)) / sr);
  const a1 = 2 * r * Math.cos(w);
  const a2 = -r * r;
  const ganho = 1 - r;
  let y1 = 0;
  let y2 = 0;
  return (x: number) => {
    const y = ganho * x + a1 * y1 + a2 * y2;
    y2 = y1;
    y1 = y;
    return y;
  };
}

let clacks: AudioBuffer[] = [];
let feltro: AudioBuffer | null = null;

/**
 * As variações do "tec" de ficha em ficha.
 *
 * O estouro de ruído passa por três ressonâncias — a principal entre 3 e 4,2 kHz, uma mais aguda
 * que dá o brilho de argila e uma mais grave que dá o corpo. Quase sempre há um segundo toque, mais
 * fraco, 2 a 6 ms depois: é a outra ficha. Medido fora do jogo, o centro do espectro fica perto de
 * 3,5 kHz e o som some em 10 a 17 ms — é a faixa de uma ficha de argila.
 */
function clacksDe(c: AudioContext): AudioBuffer[] {
  if (clacks.length) return clacks;
  const sr = c.sampleRate;
  for (let v = 0; v < 10; v++) {
    const f = 3000 + Math.random() * 1200;
    const principal = ressonador(f, 26 + Math.random() * 10, sr);
    const brilho = ressonador(f * (1.6 + Math.random() * 0.25), 18, sr);
    const corpo = ressonador(1100 + Math.random() * 400, 6, sr);
    const segundo = Math.random() < 0.8 ? 0.002 + Math.random() * 0.004 : -1;
    const forcaDoSegundo = 0.35 + Math.random() * 0.35;
    clacks.push(
      montar(c, 0.045, (t) => {
        // a excitação: dois estouros curtos de ruído (as duas fichas)
        let x = (Math.random() * 2 - 1) * Math.exp(-t / 0.0011);
        if (segundo > 0 && t >= segundo) x += (Math.random() * 2 - 1) * Math.exp(-(t - segundo) / 0.0009) * forcaDoSegundo;
        // sem ruído direto: ele sozinho puxava o som para 9 kHz (chiado, não ficha)
        return principal(x) + brilho(x) * 0.4 + corpo(x) * 0.45;
      }),
    );
  }
  return clacks;
}

/** A ficha caindo no feltro: um baque curto e abafado, sem brilho nenhum. */
function feltroDe(c: AudioContext): AudioBuffer {
  if (feltro) return feltro;
  const sr = c.sampleRate;
  const grave = ressonador(260, 1.5, sr);
  const meio = ressonador(700, 2, sr);
  feltro = montar(c, 0.05, (t) => {
    const x = (Math.random() * 2 - 1) * Math.exp(-t / 0.004);
    return grave(x) + meio(x) * 0.5;
  });
  return feltro;
}

function tocar(buf: AudioBuffer, at: number, gain: number, rate = 1, pan = 0): void {
  const c = ac();
  if (!c || !bus || muted) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(g);
  saida(c, g, pan);
  src.start(c.currentTime + at);
}

/** Uma batida de ficha em ficha. `forca` de 0 a 1 (a mais fraca é mais aguda e mais curta). */
function clack(at = 0, forca = 1, pan = (Math.random() - 0.5) * 0.5): void {
  const c = ac();
  if (!c) return;
  const lista = clacksDe(c);
  const buf = lista[Math.floor(Math.random() * lista.length)];
  tocar(buf, at, 0.05 + 0.09 * forca, 0.95 + Math.random() * 0.1 + (1 - forca) * 0.04, pan);
}

/** O baque no feltro. */
function baque(at = 0, forca = 1, pan = 0): void {
  const c = ac();
  if (!c) return;
  tocar(feltroDe(c), at, 0.06 + 0.08 * forca, 0.9 + Math.random() * 0.2, pan);
}

/** Fichas escorregando no feltro (o "chhh" de empurrar uma pilha). */
function arrastar(at: number, dur: number, gain = 0.035): void {
  playNoise({ dur, type: 'lowpass', freq: 900, freqEnd: 400, q: 0.5, gain: gain * 0.7, at, attack: dur * 0.3 });
}

/**
 * Uma pilha assentando: a primeira batida forte e as seguintes cada vez mais fracas e mais juntas,
 * como fichas quicando umas nas outras até parar.
 */
function assentar(at: number, n: number, pan = 0): number {
  let t = at;
  for (let i = 0; i < n; i++) {
    const forca = Math.max(0.15, 1 - i / (n + 1));
    clack(t, forca, pan + (Math.random() - 0.5) * 0.3);
    // de vez em quando duas batem quase juntas (o "tlec-tlec" de uma pilha)
    if (Math.random() < 0.25) clack(t + 0.006 + Math.random() * 0.006, forca * 0.6, pan);
    t += (0.022 + Math.random() * 0.03) * (1 - i / (n * 2.2));
  }
  return t;
}

// ------------------------------------------------------------------ efeitos das cartas vencedoras

/** Sons dos efeitos das cartas vencedoras (src/render/cardfx.tsx). */
export type FxSound = 'chime' | 'zap' | 'flame' | 'freeze' | 'choir' | 'whoosh';

/** Cada som é uma função; acrescentar um efeito com som novo é acrescentar uma entrada aqui. */
const FX_SOUNDS: Record<FxSound, () => void> = {
  chime: () => {
    [1318.5, 1760, 2637].forEach((f, i) => sino(f, i * 0.07, 0.8 - i * 0.15, 0.06));
  },
  zap: () => {
    playNoise({ dur: 0.18, type: 'highpass', freq: 5200, freqEnd: 1800, gain: 0.3 });
    playTone({ freq: 1900, freqEnd: 180, dur: 0.22, type: 'square', gain: 0.06 });
    playNoise({ dur: 0.12, type: 'bandpass', freq: 2600, q: 3, gain: 0.18, at: 0.16 });
  },
  flame: () => {
    playNoise({ dur: 0.8, type: 'lowpass', freq: 500, freqEnd: 1600, q: 0.7, gain: 0.22 });
    playNoise({ dur: 0.5, type: 'bandpass', freq: 900, q: 1.2, gain: 0.12, at: 0.1 });
    for (let i = 0; i < 6; i++) playNoise({ dur: 0.03, type: 'highpass', freq: 3000, gain: 0.06, at: 0.1 + Math.random() * 0.6 });
  },
  freeze: () => {
    playNoise({ dur: 0.35, type: 'highpass', freq: 6000, gain: 0.16 });
    playTone({ freq: 2800, freqEnd: 1400, dur: 0.6, type: 'sine', gain: 0.05 });
    [3700, 4400, 5200].forEach((f, i) => sino(f, 0.1 + i * 0.06, 0.4, 0.02));
  },
  choir: () => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      playTone({ freq: f, dur: 1.4, type: 'sine', gain: 0.045, at: i * 0.05, attack: 0.25 });
      playTone({ freq: f * 1.004, dur: 1.4, type: 'triangle', gain: 0.02, at: i * 0.05, attack: 0.3 });
    });
  },
  whoosh: () => {
    playNoise({ dur: 0.7, type: 'lowpass', freq: 2200, freqEnd: 260, q: 0.8, gain: 0.26 });
    playTone({ freq: 220, freqEnd: 70, dur: 0.6, type: 'triangle', gain: 0.08 });
  },
};

// ------------------------------------------------------------------ os sons

/** A escala dos cristais das Joias (pentatônica): cada combo sobe um degrau. */
const PENTA = [1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093, 2349.32, 2637.02, 3135.96];

export const sfx = {
  unlock(): void {
    const c = ac();
    // prepara as fichas antes da primeira aposta (montar os buffers custa alguns milissegundos)
    if (c) {
      clacksDe(c);
      feltroDe(c);
    }
  },
  /**
   * O suspense do giro do ticket.
   *
   * Nada de tambor: é um sopro que sobe de grave a agudo com o filtro abrindo, uma nota que sobe
   * junto, e um relógio que acelera por cima — as três coisas terminando ao mesmo tempo. A pressa
   * do tique é o que faz o peito apertar; o sopro só sustenta.
   */
  girar(): void {
    playNoise({ dur: 2.1, type: 'bandpass', freq: 280, freqEnd: 4200, q: 1.3, gain: 0.13 });
    playTone({ freq: 196, freqEnd: 784, dur: 2.1, type: 'triangle', gain: 0.05, attack: 0.6 });
    let t = 0;
    let passo = 0.22;
    for (let i = 0; i < 12 && t < 2; i++) {
      playTone({ freq: 1200 + i * 70, dur: 0.05, type: 'triangle', gain: 0.045, at: t });
      t += passo;
      passo *= 0.87;
    }
  },
  /** A revelação: o acorde claro e o estalo de luz em cima dele. */
  revelar(): void {
    [783.99, 1174.66, 1567.98].forEach((f, i) => sino(f, i * 0.045, 1.3 - i * 0.2, 0.07));
    playNoise({ dur: 0.5, type: 'highpass', freq: 6200, gain: 0.13 });
    playTone({ freq: 2349, dur: 0.6, type: 'sine', gain: 0.035, at: 0.12 });
  },
  /** Som do efeito das cartas vencedoras. */
  fx(kind: FxSound | undefined): void {
    if (kind) FX_SOUNDS[kind]?.();
  },
  /** A carta deslizando do baralho e pousando no feltro. */
  deal(): void {
    const pan = (Math.random() - 0.5) * 0.6;
    playNoise({ dur: 0.08, type: 'bandpass', freq: 2200, freqEnd: 4800, q: 0.9, gain: 0.16, pan, attack: 0.02 });
    playNoise({ dur: 0.05, type: 'lowpass', freq: 700, gain: 0.14, at: 0.06, pan });
  },
  /** A carta virando: o estalo do papel e o sopro da virada. */
  flip(): void {
    playNoise({ dur: 0.035, type: 'highpass', freq: 3200, gain: 0.2 });
    playNoise({ dur: 0.07, type: 'bandpass', freq: 1500, freqEnd: 900, q: 0.8, gain: 0.09, at: 0.012 });
    playNoise({ dur: 0.03, type: 'lowpass', freq: 600, gain: 0.1, at: 0.05 });
  },
  /** Uma ficha só. */
  chip(at = 0): void {
    clack(at, 0.8);
  },
  /** Um punhado de fichas assentando (o som genérico de fichas). */
  chips(n = 4): void {
    assentar(0, Math.max(1, n));
  },
  /** A aposta: as fichas caem no feltro na frente do jogador e assentam umas sobre as outras. */
  aposta(n = 3, pan = 0): void {
    baque(0, 0.7, pan);
    assentar(0.004, Math.max(1, n), pan);
  },
  /** As apostas da rodada sendo puxadas para o pote: o arrasto no feltro e as fichas se juntando. */
  recolher(): void {
    arrastar(0, 0.34, 0.03);
    for (let i = 0; i < 4; i++) clack(0.08 + i * 0.035 + Math.random() * 0.02, 0.35 + Math.random() * 0.3, (Math.random() - 0.5) * 0.8);
    assentar(0.36, 2);
  },
  /** O pote indo para quem ganhou: a pilha grande deslizando e assentando na frente dele. */
  pote(): void {
    arrastar(0, 0.5, 0.04);
    let t = 0.05;
    for (let i = 0; i < 8; i++) {
      clack(t, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.9);
      t += 0.022 + Math.random() * 0.02;
    }
    baque(0.4, 0.7);
    assentar(0.4, 3);
  },
  knock(): void {
    for (const at of [0, 0.16]) {
      playTone({ freq: 150, freqEnd: 70, dur: 0.12, gain: 0.55, at });
      playNoise({ dur: 0.04, type: 'lowpass', freq: 900, gain: 0.25, at });
    }
  },
  fold(): void {
    playNoise({ dur: 0.22, type: 'bandpass', freq: 1800, freqEnd: 600, q: 0.7, gain: 0.16, attack: 0.03 });
    playNoise({ dur: 0.05, type: 'lowpass', freq: 600, gain: 0.12, at: 0.17 });
  },
  turn(): void {
    if (soundSet === 'default') {
      sino(1318.5, 0, 0.3, 0.08);
      sino(1975.5, 0.1, 0.45, 0.07);
      return;
    }
    // sineta de balcão: parciais inarmônicas com decaimento longo
    playTone({ freq: 1568, dur: 0.9, gain: 0.1 });
    playTone({ freq: 1568 * 2.76, dur: 0.45, gain: 0.035 });
    playTone({ freq: 1568 * 5.4, dur: 0.2, gain: 0.015 });
    playNoise({ dur: 0.02, type: 'highpass', freq: 5000, gain: 0.05 });
  },
  /** All-in: o baque grave da decisão e a pilha inteira empurrada para o meio. */
  allin(): void {
    playTone({ freq: 95, freqEnd: 42, dur: 0.55, gain: 0.45 });
    playNoise({ dur: 0.3, type: 'lowpass', freq: 500, gain: 0.22 });
    arrastar(0.02, 0.4, 0.05);
    let t = 0.08;
    for (let i = 0; i < 7; i++) {
      clack(t, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.7);
      t += 0.018 + Math.random() * 0.018;
    }
    baque(t, 0.8);
    assentar(t, 3);
  },
  win(): void {
    if (soundSet === 'default') {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
        playTone({ freq: f, dur: 0.4, type: 'triangle', gain: 0.1, at: i * 0.075 });
        playTone({ freq: f * 2, dur: 0.25, gain: 0.03, at: i * 0.075 });
      });
      // o acorde final, aberto, e o brilho por cima
      for (const f of [523.25, 783.99, 1046.5, 1318.5]) playTone({ freq: f, dur: 1.1, type: 'triangle', gain: 0.045, at: 0.4, attack: 0.02 });
      for (let i = 0; i < 7; i++) sino(2400 + Math.random() * 2200, 0.42 + i * 0.05, 0.25, 0.018, (Math.random() - 0.5) * 1.2);
      return;
    }
    // arpejo de cravo (Ré maior) terminando num acorde
    [587.33, 739.99, 880, 1174.66, 880, 1174.66].forEach((f, i) => pluck(f, i * 0.075, 0.32));
    for (const f of [587.33, 739.99, 880, 1174.66]) pluck(f, 0.5, 1.1, 0.03);
    playTone({ freq: 2349.3, dur: 0.8, gain: 0.03, at: 0.5 });
  },
  lose(): void {
    if (soundSet === 'default') {
      playTone({ freq: 392, dur: 0.3, type: 'triangle', gain: 0.09 });
      playTone({ freq: 329.63, dur: 0.3, type: 'triangle', gain: 0.08, at: 0.16 });
      playTone({ freq: 261.63, dur: 0.6, type: 'triangle', gain: 0.08, at: 0.32 });
      playTone({ freq: 196, dur: 0.7, gain: 0.05, at: 0.32 });
      return;
    }
    [440, 349.23, 293.66].forEach((f, i) => pluck(f, i * 0.16, 0.5, 0.045));
  },
  click(): void {
    if (soundSet === 'default') {
      // um toque de vidro, curto e macio
      playTone({ freq: 1320, freqEnd: 990, dur: 0.05, gain: 0.05 });
      playNoise({ dur: 0.012, type: 'highpass', freq: 5000, gain: 0.03 });
      return;
    }
    // toque seco de madeira
    playTone({ freq: 520, freqEnd: 380, dur: 0.06, type: 'triangle', gain: 0.1 });
    playNoise({ dur: 0.02, type: 'bandpass', freq: 1800, q: 2, gain: 0.08 });
  },
  hover(): void {
    if (soundSet === 'default') return playTone({ freq: 1760, dur: 0.025, gain: 0.014 });
    playTone({ freq: 1046.5, dur: 0.04, gain: 0.015 });
  },
  tick(): void {
    if (soundSet === 'default') {
      playTone({ freq: 1760, dur: 0.05, type: 'triangle', gain: 0.06 });
      playNoise({ dur: 0.02, type: 'highpass', freq: 4000, gain: 0.06 });
      return;
    }
    // tique-taque de relógio de pêndulo
    playNoise({ dur: 0.035, type: 'bandpass', freq: 2600, q: 4, gain: 0.22 });
    playTone({ freq: 1200, dur: 0.04, type: 'triangle', gain: 0.05 });
  },
  /** Um "plop" (bolha, confirmação pequena). */
  pop(): void {
    if (soundSet === 'default') {
      playTone({ freq: 420, freqEnd: 1300, dur: 0.07, gain: 0.12 });
      playNoise({ dur: 0.01, type: 'highpass', freq: 3000, gain: 0.04 });
      return;
    }
    pluck(783.99, 0, 0.25, 0.05);
    pluck(1174.66, 0.06, 0.3, 0.04);
  },

  // ---------------------------------------------------------------- minijogos

  /** Joias: duas peças trocando de lugar. */
  troca(): void {
    playNoise({ dur: 0.13, type: 'bandpass', freq: 700, freqEnd: 2400, q: 1.2, gain: 0.07, attack: 0.04 });
    playTone({ freq: 520, freqEnd: 780, dur: 0.1, gain: 0.03 });
  },
  /** Joias: a troca não valeu (as peças voltam). */
  invalida(): void {
    playTone({ freq: 240, freqEnd: 200, dur: 0.09, type: 'triangle', gain: 0.1 });
    playTone({ freq: 200, freqEnd: 160, dur: 0.12, type: 'triangle', gain: 0.09, at: 0.09 });
  },
  /**
   * Joias: um alinhamento some. Os cristais sobem um degrau a cada combo; muitas peças de uma vez
   * (uma listrada ou uma estrela detonando) ganham a varredura brilhante por cima.
   */
  joias(combo = 1, quantas = 3): void {
    const i = Math.min(PENTA.length - 1, combo - 1);
    sino(PENTA[i], 0, 0.5, 0.07, -0.2);
    sino(PENTA[Math.min(PENTA.length - 1, i + 2)], 0.05, 0.45, 0.05, 0.2);
    playNoise({ dur: 0.18, type: 'highpass', freq: 5500, gain: 0.05, attack: 0.01 });
    if (quantas >= 6) {
      playNoise({ dur: 0.45, type: 'bandpass', freq: 900, freqEnd: 6000, q: 1.4, gain: 0.1, attack: 0.05 });
      [0, 2, 4, 5].forEach((k, j) => sino(PENTA[Math.min(PENTA.length - 1, i + k)] * 2, 0.08 + j * 0.05, 0.35, 0.025, (j - 1.5) * 0.4));
    }
  },
  /** Joias: sem jogadas, as peças se misturam. */
  embaralhar(): void {
    for (let i = 0; i < 10; i++) playNoise({ dur: 0.04, type: 'bandpass', freq: 2200 + Math.random() * 1500, q: 1.2, gain: 0.08, at: i * 0.035, pan: (Math.random() - 0.5) * 1.2 });
  },
  /** Bolhas: o tiro. */
  tiro(): void {
    playTone({ freq: 260, freqEnd: 900, dur: 0.1, gain: 0.08 });
    playNoise({ dur: 0.12, type: 'bandpass', freq: 900, freqEnd: 2500, q: 1, gain: 0.07, attack: 0.02 });
  },
  /** Bolhas: a bolha gruda na grade sem estourar nada. */
  gruda(): void {
    playTone({ freq: 360, freqEnd: 250, dur: 0.07, gain: 0.12 });
    playNoise({ dur: 0.025, type: 'lowpass', freq: 900, gain: 0.1 });
  },
  /** Bolhas: `n` bolhas estourando uma atrás da outra. */
  estourar(n = 3): void {
    for (let i = 0; i < Math.min(n, 12); i++) {
      const f = 500 + Math.random() * 300 + i * 40;
      const pan = (Math.random() - 0.5) * 1;
      playTone({ freq: f, freqEnd: f * 2.6, dur: 0.05, gain: 0.1, at: i * 0.035, pan });
      playNoise({ dur: 0.015, type: 'highpass', freq: 3500, gain: 0.05, at: i * 0.035, pan });
    }
  },
  /** Bolhas: as que ficaram penduradas caem (notas descendo, como bolinhas quicando). */
  cair(n = 3): void {
    const q = Math.min(n, 10);
    for (let i = 0; i < q; i++) sino(PENTA[Math.max(0, PENTA.length - 1 - i)], 0.12 + i * 0.045, 0.25, 0.035, (Math.random() - 0.5) * 1.2);
  },
  /** Bolhas: a grade desce uma linha. */
  descer(): void {
    playTone({ freq: 110, freqEnd: 70, dur: 0.35, gain: 0.25 });
    playNoise({ dur: 0.3, type: 'lowpass', freq: 400, gain: 0.15, attack: 0.05 });
  },
};
