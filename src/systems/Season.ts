import type { SeasonConfig } from '../data/schema';

export interface Forecast {
  /** True while a monsoon is in progress. */
  monsoon: boolean;
  /** 1-based day within the current monsoon (0 if none). */
  monsoonDay: number;
  /** Days until the next monsoon starts (0 while in one). */
  daysUntil: number;
  /** 0..1 flood level: rises across the monsoon, recedes after (deterministic). */
  flood: number;
  /** Short HUD line. */
  label: string;
}

/**
 * Monsoon schedule (pure): starts on `firstDay` and repeats every `cycleDays`, lasting
 * `lengthDays`. Default data: days 5–6, 10–11, 15–16…
 */
export function isMonsoonDay(day: number, cfg: SeasonConfig): boolean {
  if (day < cfg.firstDay) return false;
  return (day - cfg.firstDay) % cfg.cycleDays < cfg.lengthDays;
}

export function forecast(day: number, hour: number, cfg: SeasonConfig): Forecast {
  const monsoon = isMonsoonDay(day, cfg);
  if (monsoon) {
    const monsoonDay = ((day - cfg.firstDay) % cfg.cycleDays) + 1;
    // Flood rises through the monsoon: 0 → 1 across its days.
    const progress = (monsoonDay - 1 + hour / 24) / cfg.lengthDays;
    const flood = Math.min(1, 0.35 + progress * 0.65);
    return {
      monsoon,
      monsoonDay,
      daysUntil: 0,
      flood,
      label: `Monsoon — day ${monsoonDay} of ${cfg.lengthDays} · stay warm, mind the floods`,
    };
  }
  let next = day + 1;
  while (!isMonsoonDay(next, cfg) && next < day + cfg.cycleDays + cfg.firstDay + 1) next++;
  const daysUntil = next - day;
  // Floodwater recedes over the first half-day after a monsoon.
  const after = day > cfg.firstDay && isMonsoonDay(day - 1, cfg) ? Math.max(0, 1 - hour / 12) * 0.6 : 0;
  const label =
    daysUntil === 1 ? 'Monsoon tomorrow — prepare shelter, fire and food' : `Monsoon in ${daysUntil} days`;
  return { monsoon, monsoonDay: 0, daysUntil, flood: after, label };
}

/** Survival modifiers while it rains. */
export function weatherModifiers(fc: Forecast, cfg: SeasonConfig): { thirst: number; hunger: number } {
  return fc.monsoon ? { thirst: cfg.thirstMultiplier, hunger: cfg.hungerMultiplier } : { thirst: 1, hunger: 1 };
}
