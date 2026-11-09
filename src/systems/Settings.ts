export interface Settings {
  /** 0..1 */
  masterVolume: number;
  sfxVolume: number;
  ambienceVolume: number;
  /** No screen shake, fewer rain streaks, gentler tweens. */
  reducedMotion: boolean;
  /** No lightning flashes; softer hurt flash. */
  reducedFlash: boolean;
  /** Show the controls panel and first-day checklist on start. */
  showHints: boolean;
}

export const SETTINGS_KEY = 'preychrov.settings';

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  masterVolume: 0.8,
  sfxVolume: 0.9,
  ambienceVolume: 0.6,
  reducedMotion: false,
  reducedFlash: false,
  showHints: true,
};

type Listener = (s: Readonly<Settings>) => void;

const clamp01 = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);

/** Parses stored settings; anything missing or malformed falls back to defaults. Never throws. */
export function parseSettings(raw: string | null): Settings {
  let rec: Record<string, unknown> = {};
  try {
    const p: unknown = raw ? JSON.parse(raw) : {};
    if (p && typeof p === 'object' && !Array.isArray(p)) rec = p as Record<string, unknown>;
  } catch {
    rec = {};
  }
  const d = DEFAULT_SETTINGS;
  return {
    masterVolume: clamp01(rec['masterVolume'], d.masterVolume),
    sfxVolume: clamp01(rec['sfxVolume'], d.sfxVolume),
    ambienceVolume: clamp01(rec['ambienceVolume'], d.ambienceVolume),
    reducedMotion: bool(rec['reducedMotion'], d.reducedMotion),
    reducedFlash: bool(rec['reducedFlash'], d.reducedFlash),
    showHints: bool(rec['showHints'], d.showHints),
  };
}

function load(): Settings {
  try {
    return parseSettings(typeof window !== 'undefined' ? window.localStorage.getItem(SETTINGS_KEY) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

let current: Settings = load();
const listeners = new Set<Listener>();

export function getSettings(): Readonly<Settings> {
  return current;
}

/** Applies a change, persists it (best effort) and notifies listeners. */
export function updateSettings(patch: Partial<Settings>): Readonly<Settings> {
  current = parseSettings(JSON.stringify({ ...current, ...patch }));
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(current));
  } catch {
    // Storage unavailable: settings still apply for this session.
  }
  for (const l of listeners) l(current);
  return current;
}

/** Subscribe; returns an unsubscribe function (call it on scene shutdown). */
export function onSettings(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
