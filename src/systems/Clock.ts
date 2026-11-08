import type { SurvivalConfig } from '../data/schema';

export type DayPhase = 'Dawn' | 'Day' | 'Dusk' | 'Night';

/**
 * Deterministic game clock. Advances only by explicit game time (never by render FPS),
 * so pausing the scene pauses the day. totalSeconds counts from day 1 at 00:00.
 */
export class GameClock {
  totalSeconds: number;

  constructor(
    private readonly day: SurvivalConfig['day'],
    totalSeconds?: number,
  ) {
    this.totalSeconds = totalSeconds ?? day.startHour * this.secondsPerHour;
  }

  get secondsPerHour(): number {
    return this.day.lengthSeconds / 24;
  }

  /** 1-based day number. */
  get dayNumber(): number {
    return Math.floor(this.totalSeconds / this.day.lengthSeconds) + 1;
  }

  /** Hour of day, 0 ≤ hour < 24 (fractional). */
  get hour(): number {
    const inDay = this.totalSeconds - (this.dayNumber - 1) * this.day.lengthSeconds;
    return inDay / this.secondsPerHour;
  }

  advance(seconds: number): void {
    if (Number.isFinite(seconds) && seconds > 0) this.totalSeconds += seconds;
  }

  /** Seconds until the clock next reads `hour` (always > 0, at most one day). */
  secondsUntil(hour: number): number {
    let diff = (hour - this.hour) * this.secondsPerHour;
    if (diff <= 0) diff += this.day.lengthSeconds;
    return diff;
  }

  label(): string {
    const h = Math.floor(this.hour);
    const m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}

/** True if `hour` lies in the wrap-around window [from, until) (e.g. 18 → 5). */
export function inHourWindow(hour: number, from: number, until: number): boolean {
  return from <= until ? hour >= from && hour < until : hour >= from || hour < until;
}

/** Linear interpolation over [hour, value] keyframes covering 0..24. */
export function darknessAt(hour: number, keys: ReadonlyArray<readonly [number, number]>): number {
  const first = keys[0];
  if (!first) return 0;
  if (hour <= first[0]) return first[1];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (!a || !b) continue;
    if (hour <= b[0]) {
      const span = b[0] - a[0];
      return span <= 0 ? b[1] : a[1] + ((hour - a[0]) / span) * (b[1] - a[1]);
    }
  }
  return keys[keys.length - 1]?.[1] ?? 0;
}

export function phaseOf(darkness: number, hour: number): DayPhase {
  if (darkness < 0.05) return 'Day';
  if (darkness > 0.6) return 'Night';
  return hour < 12 ? 'Dawn' : 'Dusk';
}
