import type { ItemQty, TravelerDef, TravelersConfig } from '../data/schema';
import { hash2 } from '../utils/random';

/**
 * M20: travelers passing through. Who visits on which day is fixed by the world seed (same world,
 * same visitors), so nothing about the schedule needs saving — only what happened: whom you met,
 * how many trades you made with each (trust), and the current visit (where they stand, which of
 * their trades you used, whether they already shared their news).
 */

/** Visit days and visitors, deterministic per seed. Pure. */
export function visitorOn(seed: number, day: number, cfg: TravelersConfig): TravelerDef | null {
  if (day < cfg.firstVisitDay || cfg.travelers.length === 0) return null;
  const [min, max] = cfg.gapDays;
  let d = cfg.firstVisitDay;
  let prev = -1;
  // Walk the schedule from the first visit (cheap: a few hundred steps at most in a long journey).
  for (let guard = 0; guard < 10000 && d <= day; guard++) {
    const n = cfg.travelers.length;
    let pick = Math.floor(unit(seed, d, 1) * n) % n;
    if (n > 1 && pick === prev) pick = (pick + 1 + (Math.floor(unit(seed, d, 2) * (n - 1)) % (n - 1))) % n;
    if (d === day) return cfg.travelers[pick] ?? null;
    prev = pick;
    d += min + (Math.floor(unit(seed, d, 3) * (max - min + 1)) % (max - min + 1));
  }
  return null;
}

/** The next visit day on or after `day` (for "next visit" hints). */
export function nextVisitDay(seed: number, day: number, cfg: TravelersConfig): number {
  for (let d = Math.max(day, cfg.firstVisitDay); d < day + 64; d++) if (visitorOn(seed, d, cfg)) return d;
  return -1;
}

function unit(seed: number, a: number, b: number): number {
  return (hash2(a * 7919 + b, b * 104729 + 17, seed ^ 0x7a11) >>> 0) / 4294967296;
}

export interface TravelerVisit {
  day: number;
  traveler: string;
  x: number;
  y: number;
  /** Trade ids used this visit (each trade once per visit). */
  traded: string[];
  rumorTold: boolean;
}

export interface TravelerState {
  met: string[];
  /** Trades completed with each traveler (trust). */
  trust: Record<string, number>;
  visit: TravelerVisit | null;
  /** Set when passage is taken (runtime only — never restored from a save). */
  departed: boolean;
}

export function emptyTravelers(): TravelerState {
  return { met: [], trust: {}, visit: null, departed: false };
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const whole = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 1e6 ? v : null);
const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e8 ? v : null);

/** Defensive parse of saved traveler state: unknown travelers and junk are dropped, never thrown. */
export function parseTravelers(raw: unknown, cfg: TravelersConfig): TravelerState {
  const out = emptyTravelers();
  if (!isRec(raw)) return out;
  const known = new Map(cfg.travelers.map((t) => [t.id, t]));
  if (Array.isArray(raw['met'])) out.met = [...new Set(raw['met'].filter((m): m is string => typeof m === 'string' && known.has(m)))];
  if (isRec(raw['trust'])) for (const [k, v] of Object.entries(raw['trust'])) if (known.has(k) && whole(v) !== null) out.trust[k] = whole(v) as number;
  const v = raw['visit'];
  if (isRec(v) && typeof v['traveler'] === 'string' && known.has(v['traveler']) && whole(v['day']) !== null && finite(v['x']) !== null && finite(v['y']) !== null) {
    const t = known.get(v['traveler']) as TravelerDef;
    const tradeIds = new Set(t.trades.map((x) => x.id));
    out.visit = {
      day: whole(v['day']) as number,
      traveler: t.id,
      x: finite(v['x']) as number,
      y: finite(v['y']) as number,
      traded: Array.isArray(v['traded']) ? [...new Set(v['traded'].filter((id): id is string => typeof id === 'string' && tradeIds.has(id)))] : [],
      rumorTold: v['rumorTold'] === true,
    };
  }
  // `departed` is runtime-only: the River Road ends the scene and the save from before leaving is kept.
  return out;
}

/** What the player lacks for a list of items (empty = can afford). */
export function missingFor(need: readonly ItemQty[], count: (item: string) => number): ItemQty[] {
  return need.filter((n) => count(n.item) < n.qty).map((n) => ({ item: n.item, qty: n.qty - count(n.item) }));
}

/** Rough compass phrase for news, in the HUD's metres (one tile = 1 m): "about 120 m to the north-east". */
export function placePhrase(dx: number, dy: number): string {
  const metres = Math.max(10, Math.round(Math.hypot(dx, dy) / 32 / 10) * 10);
  const dirs = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  const i = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
  return `about ${metres} m to the ${dirs[i]}`;
}
