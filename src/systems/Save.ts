import type { ItemStack } from './Inventory';

export const SAVE_KEY = 'preychrov.save';
export const SAVE_VERSION = 2;
export const CAN_LOAD_SAVES = true;

export type SaveStatus =
  | { kind: 'none' }
  | { kind: 'valid'; version: number; savedAt: number; day: number }
  | { kind: 'corrupt'; reason: string }
  | { kind: 'newer'; version: number }
  | { kind: 'unavailable' };

/** Minimal storage surface so tests can inject a fake. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem?(key: string, value: string): void;
}

export interface SavedStructure {
  type: string;
  x: number;
  y: number;
}

/** Only nodes that differ from their fresh state are stored (compact diff). */
export interface SavedNode {
  /** Stable world node key "cx,cy:index". */
  key: string;
  hp: number;
  depleted: boolean;
  /** Game-time ms until respawn (relative, so the world clock can restart at 0). */
  respawnInMs: number;
  harvests: number;
}

export interface SavedPickup {
  item: string;
  qty: number;
  x: number;
  y: number;
  durability?: number;
}

export interface SaveData {
  version: number;
  savedAt: number;
  /** World generation seed (same seed → same world). */
  seed: number;
  /** Game clock total seconds since day 1 00:00. */
  clockSeconds: number;
  player: { x: number; y: number; health: number; hunger: number; thirst: number; stamina: number };
  inventory: (ItemStack | null)[];
  selected: number;
  structures: SavedStructure[];
  nodes: SavedNode[];
  pickups: SavedPickup[];
  /** Completed objective ids. */
  objectives: string[];
  /**
   * Structure types whose positions are no longer valid (e.g. from a pre-procedural-world save);
   * they are returned to the player as kits on load.
   */
  refundStructures: string[];
}

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/**
 * Migrations from version N to N+1. Add an entry whenever SAVE_VERSION increases;
 * each receives the raw object of version N and returns a raw object of version N+1.
 */
const MIGRATIONS: Record<number, (old: Rec) => Rec> = {
  // v1 saves came from the fixed M1–M3 test grove. The world is procedural from v2, so
  // positions no longer mean anything: keep stats/inventory/clock/objectives, refund placed
  // structures as kits, and start the player at the new world's spawn on a fresh seed.
  1: (old) => ({
    ...old,
    version: 2,
    seed: (typeof old['savedAt'] === 'number' ? old['savedAt'] : 1) >>> 0,
    refundStructures: (Array.isArray(old['structures']) ? old['structures'] : []).flatMap((s: unknown) =>
      isRec(s) && typeof s['type'] === 'string' ? [s['type']] : [],
    ),
    structures: [],
    nodes: [],
    pickups: [],
    player: { ...(isRec(old['player']) ? old['player'] : {}), x: null, y: null },
  }),
};

function readRaw(storage: KeyValueStorage | null): { raw: string | null } | { error: SaveStatus } {
  if (!storage) return { error: { kind: 'unavailable' } };
  try {
    return { raw: storage.getItem(SAVE_KEY) };
  } catch {
    return { error: { kind: 'unavailable' } };
  }
}

/**
 * Parses and sanitizes a save. Never throws. Missing or malformed fields fall back to
 * safe defaults (partial saves still load); structurally broken saves return an error.
 */
export function parseSave(raw: string | null): { data: SaveData } | { error: SaveStatus } {
  if (raw === null || raw === '') return { error: { kind: 'none' } };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: { kind: 'corrupt', reason: 'not valid JSON' } };
  }
  if (!isRec(parsed)) return { error: { kind: 'corrupt', reason: 'not an object' } };
  let rec: Rec = parsed;
  let version = rec['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { error: { kind: 'corrupt', reason: 'missing version' } };
  }
  if (version > SAVE_VERSION) return { error: { kind: 'newer', version } };
  while (version < SAVE_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) return { error: { kind: 'corrupt', reason: `no migration from v${version}` } };
    rec = migrate(rec);
    version++;
  }
  const savedAt = rec['savedAt'];
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) {
    return { error: { kind: 'corrupt', reason: 'missing timestamp' } };
  }

  const p = isRec(rec['player']) ? rec['player'] : {};
  const inventory = Array.isArray(rec['inventory']) ? rec['inventory'] : [];
  const seed = rec['seed'];
  const data: SaveData = {
    version: SAVE_VERSION,
    savedAt,
    seed: typeof seed === 'number' && Number.isFinite(seed) ? seed >>> 0 : savedAt >>> 0,
    // NaN = missing: the game keeps its configured start hour instead of loading at midnight.
    clockSeconds: Number.isFinite(rec['clockSeconds']) ? Math.max(0, rec['clockSeconds'] as number) : NaN,
    player: {
      x: finite(p['x'], NaN),
      y: finite(p['y'], NaN),
      health: finite(p['health'], NaN),
      hunger: finite(p['hunger'], NaN),
      thirst: finite(p['thirst'], NaN),
      stamina: finite(p['stamina'], NaN),
    },
    inventory: inventory.map((s: unknown) => {
      if (!isRec(s)) return null;
      const item = str(s['item']);
      const qty = Math.floor(finite(s['qty'], 0));
      if (!item || qty < 1) return null;
      const d = s['durability'];
      return typeof d === 'number' && Number.isFinite(d) && d > 0 ? { item, qty, durability: d } : { item, qty };
    }),
    selected: Math.floor(finite(rec['selected'], 0)),
    structures: (Array.isArray(rec['structures']) ? rec['structures'] : []).flatMap((s: unknown) => {
      if (!isRec(s)) return [];
      const type = str(s['type']);
      const x = finite(s['x'], NaN);
      const y = finite(s['y'], NaN);
      return type && Number.isFinite(x) && Number.isFinite(y) ? [{ type, x, y }] : [];
    }),
    nodes: (Array.isArray(rec['nodes']) ? rec['nodes'] : []).flatMap((n: unknown) => {
      if (!isRec(n)) return [];
      const key = n['key'];
      if (typeof key !== 'string' || !/^-?\d+,-?\d+:\d+$/.test(key)) return [];
      return [
        {
          key,
          hp: Math.max(0, finite(n['hp'], 0)),
          depleted: n['depleted'] === true,
          respawnInMs: Math.max(0, finite(n['respawnInMs'], 0)),
          harvests: Math.max(0, Math.floor(finite(n['harvests'], 0))),
        },
      ];
    }),
    pickups: (Array.isArray(rec['pickups']) ? rec['pickups'] : []).flatMap((s: unknown) => {
      if (!isRec(s)) return [];
      const item = str(s['item']);
      const qty = Math.floor(finite(s['qty'], 0));
      const x = finite(s['x'], NaN);
      const y = finite(s['y'], NaN);
      if (!item || qty < 1 || !Number.isFinite(x) || !Number.isFinite(y)) return [];
      const d = s['durability'];
      return [typeof d === 'number' && d > 0 ? { item, qty, x, y, durability: d } : { item, qty, x, y }];
    }),
    objectives: (Array.isArray(rec['objectives']) ? rec['objectives'] : []).filter((o): o is string => typeof o === 'string'),
    refundStructures: (Array.isArray(rec['refundStructures']) ? rec['refundStructures'] : []).filter(
      (o): o is string => typeof o === 'string',
    ),
  };
  return { data };
}

export function readSave(storage: KeyValueStorage | null = defaultStorage()): { data: SaveData } | { error: SaveStatus } {
  const r = readRaw(storage);
  if ('error' in r) return r;
  return parseSave(r.raw);
}

/** Writes the save. Returns false (never throws) if storage is unavailable or full. */
export function writeSave(data: SaveData, storage: KeyValueStorage | null = defaultStorage()): boolean {
  if (!storage?.setItem) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Inspects the save slot without trusting its contents. Never throws. */
export function inspectSave(storage: KeyValueStorage | null = defaultStorage(), daySeconds = 480): SaveStatus {
  const r = readSave(storage);
  if ('error' in r) return r.error;
  const clock = Number.isFinite(r.data.clockSeconds) ? r.data.clockSeconds : 0;
  return { kind: 'valid', version: r.data.version, savedAt: r.data.savedAt, day: Math.floor(clock / daySeconds) + 1 };
}

/** Player-facing explanation of the save slot state. */
export function describeSaveStatus(status: SaveStatus): string {
  switch (status.kind) {
    case 'none':
      return 'No saved journey yet — sleep in a shelter to save.';
    case 'corrupt':
      return 'The saved journey is damaged and cannot be loaded.';
    case 'newer':
      return 'This save was made by a newer version of the game.';
    case 'unavailable':
      return 'Browser storage is unavailable, so saves cannot be read.';
    case 'valid':
      return `Day ${status.day} · saved ${new Date(status.savedAt).toLocaleString()}`;
  }
}
