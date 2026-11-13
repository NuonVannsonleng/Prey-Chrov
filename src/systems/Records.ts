/**
 * M17: local records — achievements and completion tracked in this browser only (no accounts,
 * nothing sent anywhere). Counters are cumulative across journeys. Pure core + a thin storage
 * wrapper so it is unit tested with a fake store.
 */
import type { DifficultyId } from './Rules';
import type { KeyValueStorage } from './Save';

export const RECORD_EVENTS = [
  'night_survived',
  'tablet_read',
  'landmark_found',
  'shortcut_found',
  'puzzle_solved',
  'cache_found',
  'side_story_completed',
  'fish_caught',
  'meal_cooked',
  'structure_built',
  'outpost_marked',
  'tusker_defeated',
  'storm_weathered',
  'blight_cleared',
  'ending_reached',
  'skill_level',
  'shrine_restored',
  'creature_defeated',
] as const;
export type RecordEvent = (typeof RECORD_EVENTS)[number];

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  hidden?: boolean;
  event: RecordEvent;
  count?: number;
  difficulty?: DifficultyId;
  permadeath?: boolean;
}

export interface RecordsState {
  counters: Partial<Record<RecordEvent, number>>;
  /** achievement id → time earned (ms since epoch) */
  earned: Record<string, number>;
  /** endings reached per difficulty (and how many with permadeath) */
  endings: Partial<Record<DifficultyId | 'permadeath', number>>;
  journeys: number;
}

export const RECORDS_KEY = 'preychrov.records';

export function emptyRecords(): RecordsState {
  return { counters: {}, earned: {}, endings: {}, journeys: 0 };
}

const nonNeg = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);

export function parseRecords(raw: string | null): RecordsState {
  const out = emptyRecords();
  if (!raw) return out;
  let rec: unknown;
  try {
    rec = JSON.parse(raw);
  } catch {
    return out;
  }
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return out;
  const r = rec as Record<string, unknown>;
  const c = r['counters'];
  if (c && typeof c === 'object' && !Array.isArray(c)) {
    for (const ev of RECORD_EVENTS) {
      const n = nonNeg((c as Record<string, unknown>)[ev]);
      if (n !== null) out.counters[ev] = n;
    }
  }
  const e = r['earned'];
  if (e && typeof e === 'object' && !Array.isArray(e)) {
    for (const [id, t] of Object.entries(e as Record<string, unknown>)) {
      const n = nonNeg(t);
      if (n !== null && /^[a-z0-9_]{1,48}$/.test(id)) out.earned[id] = n;
    }
  }
  const en = r['endings'];
  if (en && typeof en === 'object' && !Array.isArray(en)) {
    for (const k of ['story', 'survival', 'hard', 'permadeath'] as const) {
      const n = nonNeg((en as Record<string, unknown>)[k]);
      if (n !== null) out.endings[k] = n;
    }
  }
  out.journeys = nonNeg(r['journeys']) ?? 0;
  return out;
}

export interface RecordContext {
  difficulty: DifficultyId;
  permadeath: boolean;
}

/**
 * Applies an event and returns the achievements it newly earns. `value` is the amount to add
 * (default 1) — except for skill_level, where it is the level reached (the counter keeps the best).
 */
export function recordEvent(state: RecordsState, defs: readonly AchievementDef[], event: RecordEvent, ctx: RecordContext, value = 1, now = Date.now()): AchievementDef[] {
  const prev = state.counters[event] ?? 0;
  state.counters[event] = event === 'skill_level' ? Math.max(prev, value) : prev + Math.max(0, value);
  if (event === 'ending_reached') {
    state.endings[ctx.difficulty] = (state.endings[ctx.difficulty] ?? 0) + 1;
    if (ctx.permadeath) state.endings.permadeath = (state.endings.permadeath ?? 0) + 1;
  }
  const earned: AchievementDef[] = [];
  for (const a of defs) {
    if (a.event !== event || state.earned[a.id] !== undefined) continue;
    if (a.difficulty && a.difficulty !== ctx.difficulty) continue;
    if (a.permadeath && !ctx.permadeath) continue;
    // Ending achievements tied to a difficulty count that difficulty's endings only.
    const have = event === 'ending_reached' && (a.difficulty || a.permadeath) ? 1 : (state.counters[event] ?? 0);
    if (have >= (a.count ?? 1)) {
      state.earned[a.id] = now;
      earned.push(a);
    }
  }
  return earned;
}

/** Completion: share of achievements earned (0..1). */
export function completion(state: RecordsState, defs: readonly AchievementDef[]): number {
  if (defs.length === 0) return 0;
  return defs.filter((a) => state.earned[a.id] !== undefined).length / defs.length;
}

function storage(): KeyValueStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadRecords(store: KeyValueStorage | null = storage()): RecordsState {
  try {
    return parseRecords(store?.getItem(RECORDS_KEY) ?? null);
  } catch {
    return emptyRecords();
  }
}

export function saveRecords(state: RecordsState, store: KeyValueStorage | null = storage()): boolean {
  try {
    if (!store?.setItem) return false;
    store.setItem(RECORDS_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
