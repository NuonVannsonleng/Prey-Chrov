/** M16: rebindable actions (stored as KeyboardEvent.code values). */
export const ACTIONS = ['up', 'down', 'left', 'right', 'sprint', 'interact', 'use', 'attack', 'crouch', 'rotate', 'dismantle', 'inventory', 'crafting', 'journal', 'character', 'map', 'drop', 'help'] as const;
export type Action = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<Action, string> = {
  up: 'Move up',
  down: 'Move down',
  left: 'Move left',
  right: 'Move right',
  sprint: 'Sprint',
  interact: 'Gather · drink · use',
  use: 'Eat / place held item',
  attack: 'Attack',
  crouch: 'Crouch (hold)',
  rotate: 'Rotate / repair',
  dismantle: 'Dismantle',
  inventory: 'Inventory',
  crafting: 'Crafting',
  journal: 'Journal',
  character: 'Character',
  map: 'Map',
  drop: 'Drop one',
  help: 'Show / hide help',
};

export const DEFAULT_KEYS: Readonly<Record<Action, string>> = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  sprint: 'ShiftLeft',
  interact: 'KeyE',
  use: 'KeyF',
  attack: 'Space',
  crouch: 'KeyZ',
  rotate: 'KeyR',
  dismantle: 'KeyX',
  inventory: 'KeyI',
  crafting: 'KeyC',
  journal: 'KeyJ',
  character: 'KeyK',
  map: 'KeyM',
  drop: 'KeyQ',
  help: 'KeyH',
};

/**
 * Keys a player may bind. Escape (pause/back), F3 (debug), Tab and digits 1–6 (hotbar, tabs) and
 * Ctrl/Alt/Meta (browser shortcuts such as Ctrl+W) are reserved.
 */
export function isBindable(code: string): boolean {
  return /^Key[A-Z]$/.test(code) || /^Digit[7-90]$/.test(code) || ['Space', 'ShiftLeft', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backquote', 'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash', 'Backslash'].includes(code);
}

/** Short on-screen name of a key code ("KeyW" → "W"). */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const names: Record<string, string> = { Space: 'Space', ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\' };
  return names[code] ?? code;
}

/** Binding for an action (current settings). */
export function keyFor(action: Action): string {
  return current.keys[action];
}

/**
 * Player-facing text is written with the default keys ("press E", "(M)", "Hold E", "F to eat").
 * For every action the player has rebound, this swaps that default letter for the new key, so
 * hints always match the controls. Text is unchanged while the defaults are in use.
 */
export function keyText(text: string): string {
  let out = text;
  for (const a of ACTIONS) {
    const def = DEFAULT_KEYS[a];
    const now = current.keys[a];
    if (def === now || !/^Key[A-Z]$/.test(def)) continue;
    const d = def.slice(3);
    const label = keyLabel(now);
    out = out
      .replace(new RegExp(String.raw`\(${d}\)`, 'g'), `(${label})`)
      .replace(new RegExp(String.raw`\b([Pp]ress|[Hh]old|[Uu]se) ${d}\b`, 'g'), `$1 ${label}`)
      .replace(new RegExp(String.raw`\b${d} (to|rotates|\(hold\)|/ Esc)`, 'g'), `${label} $1`)
      .replace(new RegExp(String.raw`(^|[^A-Za-z])${d} / `, 'g'), `$1${label} / `);
  }
  return out;
}

/** Font size scaled for the "Large text" setting. */
export function fontPx(px: number): string {
  return `${Math.round(px * (current.largeText ? 1.2 : 1))}px`;
}

export interface Settings {
  /** 0..1 */
  masterVolume: number;
  sfxVolume: number;
  ambienceVolume: number;
  /** M16: short original music stingers (discoveries, level-ups, dawn, set pieces). */
  musicVolume: number;
  /** M16: stronger text and outlines, lighter nights. */
  highContrast: boolean;
  /** M16: larger text for toasts, prompts, tooltips, story and journal. */
  largeText: boolean;
  /** M16: key bindings. */
  keys: Record<Action, string>;
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
  musicVolume: 0.5,
  highContrast: false,
  largeText: false,
  keys: { ...DEFAULT_KEYS },
  reducedMotion: false,
  reducedFlash: false,
  showHints: true,
};

type Listener = (s: Readonly<Settings>) => void;

const clamp01 = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);

/** Bindings: each action keeps a bindable, unique key; anything invalid falls back to its default. */
function parseKeys(raw: unknown): Record<Action, string> {
  const out = { ...DEFAULT_KEYS } as Record<Action, string>;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const r = raw as Record<string, unknown>;
  for (const a of ACTIONS) {
    const v = r[a];
    if (typeof v === 'string' && isBindable(v)) out[a] = v;
  }
  // Duplicates are not allowed: a clash puts every clashing action back on its default.
  const seen = new Map<string, Action>();
  for (const a of ACTIONS) {
    const prev = seen.get(out[a]);
    if (prev) {
      out[a] = DEFAULT_KEYS[a];
      out[prev] = DEFAULT_KEYS[prev];
    }
    seen.set(out[a], a);
  }
  return new Set(Object.values(out)).size === ACTIONS.length ? out : { ...DEFAULT_KEYS };
}

/**
 * Rebinds an action. If another action used that key, the two swap so every key stays unique.
 * Returns false for a reserved key.
 */
export function bindKey(action: Action, code: string): boolean {
  if (!isBindable(code)) return false;
  const keys = { ...current.keys };
  const other = ACTIONS.find((a) => a !== action && keys[a] === code);
  if (other) keys[other] = keys[action];
  keys[action] = code;
  updateSettings({ keys });
  return true;
}

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
    musicVolume: clamp01(rec['musicVolume'], d.musicVolume),
    highContrast: bool(rec['highContrast'], d.highContrast),
    largeText: bool(rec['largeText'], d.largeText),
    keys: parseKeys(rec['keys']),
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
