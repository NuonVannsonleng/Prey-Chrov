import type { FishingConfig } from '../data/schema';

export type FishPhase = 'idle' | 'waiting' | 'bite';
export type FishPress = 'none' | 'caught' | 'missed' | 'early';

/**
 * Fishing minigame (pure logic, game-time ms). Cast → wait a random beat → a bite opens a
 * window in which a marker sweeps back and forth across a bar; pressing while the marker is
 * inside the green zone catches the fish. Fair by construction: the zone is wide, the sweep
 * slow and the window long enough for at least one full sweep (validated in fishing.json).
 */
export class FishingSession {
  phase: FishPhase = 'idle';
  biteAt = 0;
  biteStart = 0;
  /** Centre of the green zone along the bar (0..1). */
  zoneCenter = 0.5;

  constructor(private readonly cfg: FishingConfig) {}

  cast(now: number, rng: () => number): void {
    const d = this.cfg.biteDelaySeconds;
    this.phase = 'waiting';
    this.biteAt = now + (d.min + rng() * (d.max - d.min)) * 1000;
    const half = this.cfg.zoneWidth / 2;
    this.zoneCenter = half + rng() * (1 - this.cfg.zoneWidth);
  }

  /** Advances the session; returns 'bite' once when a fish bites and 'escaped' when the window closes. */
  update(now: number): 'none' | 'bite' | 'escaped' {
    if (this.phase === 'waiting' && now >= this.biteAt) {
      this.phase = 'bite';
      this.biteStart = now;
      return 'bite';
    }
    if (this.phase === 'bite' && now - this.biteStart > this.cfg.windowSeconds * 1000) {
      this.phase = 'idle';
      return 'escaped';
    }
    return 'none';
  }

  /** Marker position 0..1: a triangle wave starting at the left edge. */
  marker(now: number): number {
    const t = Math.max(0, now - this.biteStart) / 1000;
    const f = (t * this.cfg.markerCyclesPerSecond) % 1;
    return f < 0.5 ? f * 2 : 2 - f * 2;
  }

  inZone(now: number): boolean {
    return Math.abs(this.marker(now) - this.zoneCenter) <= this.cfg.zoneWidth / 2;
  }

  /** The player pulls the line. */
  press(now: number): FishPress {
    if (this.phase === 'waiting') {
      this.phase = 'idle';
      return 'early';
    }
    if (this.phase !== 'bite') return 'none';
    this.phase = 'idle';
    return this.inZone(now) ? 'caught' : 'missed';
  }

  cancel(): void {
    this.phase = 'idle';
  }
}
