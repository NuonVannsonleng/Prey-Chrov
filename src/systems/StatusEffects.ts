export type EffectId = 'poison' | 'blessing' | 'ward';

export interface ActiveEffect {
  id: EffectId;
  /** Real seconds left. */
  remaining: number;
  /** Poison damage per second. */
  dps: number;
  /** Blessing regeneration per game hour. */
  regenPerHour: number;
}

export interface EffectTick {
  damage: number;
  heal: number;
}

/**
 * Timed status effects (pure logic). Poison refreshes rather than stacks so repeated bites
 * can't create unfair damage spikes; the blessing regenerates health; the ward keeps
 * spirits from attacking.
 */
export class StatusEffects {
  readonly list: ActiveEffect[] = [];
  private readonly tickOut: EffectTick = { damage: 0, heal: 0 };

  apply(id: EffectId, seconds: number, params: { dps?: number; regenPerHour?: number } = {}): void {
    if (!(seconds > 0)) return;
    const existing = this.list.find((e) => e.id === id);
    if (existing) {
      existing.remaining = Math.max(existing.remaining, seconds);
      existing.dps = Math.max(existing.dps, params.dps ?? 0);
      existing.regenPerHour = Math.max(existing.regenPerHour, params.regenPerHour ?? 0);
      return;
    }
    this.list.push({ id, remaining: seconds, dps: params.dps ?? 0, regenPerHour: params.regenPerHour ?? 0 });
  }

  has(id: EffectId): boolean {
    return this.list.some((e) => e.id === id);
  }

  remaining(id: EffectId): number {
    return this.list.find((e) => e.id === id)?.remaining ?? 0;
  }

  clear(id: EffectId): void {
    const i = this.list.findIndex((e) => e.id === id);
    if (i >= 0) this.list.splice(i, 1);
  }

  /** Advances timers; returns damage/heal for this step (reused object — read immediately). */
  update(dtSeconds: number, secondsPerHour: number): EffectTick {
    const out = this.tickOut;
    out.damage = 0;
    out.heal = 0;
    if (!(dtSeconds > 0)) return out;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      if (!e) continue;
      const step = Math.min(dtSeconds, e.remaining);
      if (e.id === 'poison') out.damage += e.dps * step;
      if (e.id === 'blessing') out.heal += (e.regenPerHour * step) / secondsPerHour;
      e.remaining -= dtSeconds;
      if (e.remaining <= 0) this.list.splice(i, 1);
    }
    return out;
  }

  serialize(): ActiveEffect[] {
    return this.list.map((e) => ({ ...e }));
  }

  restore(list: readonly ActiveEffect[]): void {
    this.list.length = 0;
    for (const e of list) {
      if ((e.id === 'poison' || e.id === 'blessing' || e.id === 'ward') && e.remaining > 0 && Number.isFinite(e.remaining)) {
        this.list.push({ id: e.id, remaining: e.remaining, dps: Math.max(0, e.dps || 0), regenPerHour: Math.max(0, e.regenPerHour || 0) });
      }
    }
  }
}

/** True if (tx, ty) lies inside a swing arc from (ox, oy) facing (fx, fy). */
export function inArc(ox: number, oy: number, fx: number, fy: number, tx: number, ty: number, reach: number, arcDegrees: number): boolean {
  const dx = tx - ox;
  const dy = ty - oy;
  const d = Math.hypot(dx, dy);
  if (d > reach) return false;
  if (d < 6) return true;
  const cos = (dx * fx + dy * fy) / d;
  return cos >= Math.cos(((arcDegrees / 2) * Math.PI) / 180);
}
