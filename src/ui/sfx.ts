/** Tiny WebAudio synth. No audio files, so nothing to license. Only sounds after a user gesture. */
let ctx: AudioContext | null = null;

export const sfx = {
  muted: false,

  squeak(pitch = 1): void {
    if (this.muted) return;
    try {
      ctx ??= new AudioContext();
      if (ctx.state === 'suspended') void ctx.resume();
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800 * pitch, t);
      osc.frequency.exponentialRampToValueAtTime(1700 * pitch, t + 0.09);
      osc.frequency.exponentialRampToValueAtTime(1100 * pitch, t + 0.16);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    } catch {
      // Audio unavailable; the factory works fine silent.
    }
  },
};
