import { getSettings, onSettings } from './Settings';

export type SfxId =
  | 'chop'
  | 'stone'
  | 'leaf'
  | 'pickup'
  | 'craft'
  | 'swing'
  | 'hurt'
  | 'enemy_hit'
  | 'drink'
  | 'eat'
  | 'build'
  | 'shrine'
  | 'tablet'
  | 'chest'
  | 'thunder'
  | 'spirit'
  | 'ui';

export interface AmbienceLevels {
  /** 0..1 day birds/wind */
  day: number;
  /** 0..1 night insects */
  night: number;
  rain: number;
  /** 0..1 near a campfire */
  fire: number;
}

/**
 * Original procedural audio (Web Audio): every sound is synthesised from oscillators and
 * noise, so there are no audio assets. The context is created only after the first user
 * gesture (autoplay policy), and all output goes through sfx/ambience/master gains that
 * follow the settings.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private amb: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly loops = new Map<keyof AmbienceLevels, GainNode>();
  private lastPlayed = new Map<SfxId, number>();
  private unlocked = false;

  /** Call once at boot: waits for the first click/key to create the AudioContext. */
  install(): void {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      this.unlock();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    onSettings(() => this.applyVolumes());
  }

  get enabled(): boolean {
    return this.unlocked && this.ctx !== null;
  }

  private unlock(): void {
    if (this.unlocked) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    try {
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.sfx = ctx.createGain();
      this.amb = ctx.createGain();
      this.sfx.connect(this.master);
      this.amb.connect(this.master);
      this.master.connect(ctx.destination);
      this.noise = this.makeNoise(ctx, 2);
      this.unlocked = true;
      this.applyVolumes();
      this.startLoops();
      void ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  private applyVolumes(): void {
    const s = getSettings();
    const t = this.ctx?.currentTime ?? 0;
    this.master?.gain.setTargetAtTime(s.masterVolume, t, 0.05);
    this.sfx?.gain.setTargetAtTime(s.sfxVolume, t, 0.05);
    this.amb?.gain.setTargetAtTime(s.ambienceVolume, t, 0.05);
  }

  private makeNoise(ctx: AudioContext, seconds: number): AudioBuffer {
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ---------- Ambience ----------

  private startLoops(): void {
    const ctx = this.ctx;
    if (!ctx || !this.amb || !this.noise) return;
    const loop = (key: keyof AmbienceLevels, type: BiquadFilterType, freq: number, q: number, lfo?: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter);
      filter.connect(gain);
      if (lfo) {
        // Amplitude tremolo (insects, crackle).
        const trem = ctx.createGain();
        trem.gain.value = 0.5;
        const osc = ctx.createOscillator();
        osc.frequency.value = lfo;
        const depth = ctx.createGain();
        depth.gain.value = 0.5;
        osc.connect(depth);
        depth.connect(trem.gain);
        gain.connect(trem);
        trem.connect(this.amb as GainNode);
        osc.start();
      } else gain.connect(this.amb as GainNode);
      src.start();
      this.loops.set(key, gain);
    };
    loop('day', 'lowpass', 500, 0.5);
    loop('night', 'bandpass', 4600, 18, 9);
    loop('rain', 'bandpass', 1400, 0.6);
    loop('fire', 'bandpass', 900, 2, 23);
  }

  /** Crossfades ambience layers (call a few times a second). */
  setAmbience(levels: AmbienceLevels): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const peak: AmbienceLevels = { day: 0.06, night: 0.05, rain: 0.22, fire: 0.08 };
    for (const k of Object.keys(peak) as Array<keyof AmbienceLevels>) {
      this.loops.get(k)?.gain.setTargetAtTime(Math.max(0, Math.min(1, levels[k])) * peak[k], ctx.currentTime, 0.6);
    }
  }

  // ---------- One-shots ----------

  play(id: SfxId): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx) return;
    // Rate-limit identical sounds (no machine-gun stacking).
    const now = ctx.currentTime;
    if (now - (this.lastPlayed.get(id) ?? -1) < 0.045) return;
    this.lastPlayed.set(id, now);
    const t = now + 0.005;
    switch (id) {
      case 'chop':
        this.noiseBurst(t, 'bandpass', 520, 3, 0.35, 0.09);
        this.tone(t, 'sine', 140, 70, 0.3, 0.12);
        break;
      case 'stone':
        this.noiseBurst(t, 'bandpass', 2100, 6, 0.3, 0.06);
        this.tone(t, 'triangle', 600, 320, 0.12, 0.05);
        break;
      case 'leaf':
        this.noiseBurst(t, 'highpass', 2500, 0.7, 0.18, 0.1);
        break;
      case 'pickup':
        this.tone(t, 'sine', 660, 660, 0.14, 0.06);
        this.tone(t + 0.06, 'sine', 990, 990, 0.12, 0.08);
        break;
      case 'craft':
        [523, 659, 784].forEach((f, i) => this.tone(t + i * 0.07, 'triangle', f, f, 0.13, 0.18));
        break;
      case 'build':
        this.noiseBurst(t, 'lowpass', 400, 1, 0.3, 0.18);
        this.tone(t, 'sine', 110, 90, 0.3, 0.2);
        break;
      case 'swing':
        this.noiseBurst(t, 'highpass', 1200, 0.8, 0.16, 0.12, true);
        break;
      case 'hurt':
        this.tone(t, 'square', 200, 90, 0.16, 0.2);
        this.noiseBurst(t, 'lowpass', 900, 1, 0.2, 0.12);
        break;
      case 'enemy_hit':
        this.tone(t, 'square', 320, 220, 0.1, 0.08);
        this.noiseBurst(t, 'bandpass', 1500, 2, 0.15, 0.05);
        break;
      case 'drink':
        for (let i = 0; i < 3; i++) this.tone(t + i * 0.07, 'sine', 380 + i * 90, 520 + i * 80, 0.1, 0.06);
        break;
      case 'eat':
        for (let i = 0; i < 3; i++) this.noiseBurst(t + i * 0.09, 'bandpass', 1800, 2, 0.18, 0.04);
        break;
      case 'shrine':
        this.tone(t, 'sine', 880, 880, 0.12, 1.4);
        this.tone(t, 'sine', 1320, 1320, 0.06, 1.1);
        break;
      case 'tablet':
        this.tone(t, 'sine', 110, 110, 0.18, 1.6);
        this.tone(t + 0.15, 'sine', 660, 660, 0.08, 1.2);
        break;
      case 'chest':
        this.noiseBurst(t, 'lowpass', 300, 1, 0.35, 0.45);
        break;
      case 'thunder':
        this.noiseBurst(t, 'lowpass', 160, 0.7, 0.5, 2.2);
        break;
      case 'spirit':
        this.tone(t, 'sine', 520, 330, 0.08, 0.9);
        this.tone(t, 'sine', 527, 334, 0.06, 0.9);
        break;
      case 'ui':
        this.tone(t, 'sine', 740, 740, 0.06, 0.04);
        break;
    }
  }

  private tone(t: number, type: OscillatorType, from: number, to: number, vol: number, dur: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.sfx);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noiseBurst(t: number, type: BiquadFilterType, freq: number, q: number, vol: number, dur: number, sweep = false): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * 3, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfx);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  }
}

export const audio = new AudioEngine();
