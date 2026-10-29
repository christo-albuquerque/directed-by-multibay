/** Tiny WebAudio synth. No audio files, so nothing to license. Silent until the first user gesture. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let rain: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
const KEY = 'multibay-muted';

function readMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

let muted = readMuted();

function ensure(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.8;
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 2;
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 4));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function burst(dur: number, vol: number, lowpass: number, delay = 0, attack = 0.005): void {
  const c = ensure();
  if (!c || !master || !noise) return;
  const t = c.currentTime + delay;
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(lowpass, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(60, lowpass / 5), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.05);
}

export const sfx = {
  get muted(): boolean {
    return muted;
  },

  /** Arms audio: browsers only allow sound after a gesture, so resume on the first one. */
  init(): void {
    const arm = (): void => void ensure();
    window.addEventListener('pointerdown', arm, { once: true });
    window.addEventListener('keydown', arm, { once: true });
  },

  setMuted(m: boolean): void {
    muted = m;
    try {
      localStorage.setItem(KEY, m ? '1' : '0');
    } catch {
      // Preference just won't persist.
    }
    if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.02);
    if (m) this.rainOn(false);
  },

  squeak(pitch = 1): void {
    tone('sine', 800 * pitch, 1700 * pitch, 0.09, 0.12);
    tone('sine', 1700 * pitch, 1100 * pitch, 0.08, 0.1, 0.09);
  },

  beep(freq = 880, dur = 0.12): void {
    tone('square', freq, freq, dur, 0.05);
  },

  /** Two-tone wailing alarm. */
  siren(seconds = 3.2): void {
    const cycles = Math.floor(seconds / 0.8);
    for (let i = 0; i < cycles; i++) {
      tone('sawtooth', 520, 880, 0.4, 0.05, i * 0.8);
      tone('sawtooth', 880, 520, 0.4, 0.05, i * 0.8 + 0.4);
    }
  },

  boom(): void {
    burst(0.35, 0.5, 900);
    tone('sine', 140, 40, 0.3, 0.4);
  },

  crash(): void {
    burst(0.7, 0.6, 2500);
    burst(0.35, 0.4, 5000, 0.12);
    tone('sine', 110, 35, 0.5, 0.45);
  },

  thud(): void {
    tone('sine', 110, 45, 0.18, 0.5);
    burst(0.08, 0.15, 1200);
  },

  stamp(): void {
    tone('sine', 140, 55, 0.16, 0.55);
    burst(0.06, 0.2, 3000);
  },

  rumble(seconds = 4.5): void {
    burst(seconds, 0.45, 700, 0, 0.8);
    tone('sine', 60, 38, seconds, 0.3);
  },

  rainOn(on: boolean): void {
    if (on && !muted) {
      const c = ensure();
      if (!c || !master || !noise || rain) return;
      const src = c.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 3200;
      const gain = c.createGain();
      gain.gain.value = 0.0001;
      gain.gain.setTargetAtTime(0.05, c.currentTime, 0.5);
      src.connect(f).connect(gain).connect(master);
      src.start();
      rain = { src, gain };
    } else if (!on && rain && ctx) {
      const r = rain;
      rain = null;
      r.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
      r.src.stop(ctx.currentTime + 1.5);
    }
  },
};
