import { hash2, mulberry32 } from '../utils/random';

/** M13: one of three ruin layouts, each with one puzzle and optional traps / secret cache. Pure. */
export type RuinLayout = 'open' | 'ring' | 'colonnade';
export type RuinPuzzle = 'lamps' | 'plates';
export type LampSymbol = 'sun' | 'moon' | 'water';

export interface RuinFeature {
  kind: 'lamp' | 'plate' | 'trap' | 'reliquary' | 'glyph' | 'secret' | 'pillar' | 'inner_wall';
  /** Lamp symbol for lamps; index for plates/traps. */
  id: string;
  ox: number;
  oy: number;
  solid: boolean;
}

export interface RuinPlanData {
  layout: RuinLayout;
  puzzle: RuinPuzzle;
  /** Lamps: the order to light them (symbols). */
  order: LampSymbol[];
  traps: boolean;
  features: RuinFeature[];
}

export const LAMP_SYMBOLS: readonly LampSymbol[] = ['sun', 'moon', 'water'];
/** Plate puzzle: all plates must be pressed within this many seconds. */
export const PLATE_WINDOW_SECONDS = 9;

/** Stable key of a ruin site (puzzle state is saved under it). */
export function ruinKey(site: { tx: number; ty: number }): string {
  return `${site.tx},${site.ty}`;
}

/**
 * Deterministic plan for a ruin site. Offsets are tiles from the site centre and avoid the four
 * gateway cones and the outer wall band, so every feature stays reachable from a gateway.
 */
export function ruinPlan(site: { tx: number; ty: number }, seed: number): RuinPlanData {
  const h = hash2(site.tx, site.ty, seed ^ 0x13a1);
  const rng = mulberry32(h);
  const layout: RuinLayout = (['open', 'ring', 'colonnade'] as const)[h % 3] ?? 'open';
  const puzzle: RuinPuzzle = (h >>> 3) % 2 === 0 ? 'lamps' : 'plates';
  const traps = (h >>> 5) % 3 === 0;
  const order = [...LAMP_SYMBOLS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = order[i] as LampSymbol;
    order[i] = order[j] as LampSymbol;
    order[j] = t;
  }
  const f: RuinFeature[] = [];
  // Layout architecture.
  // The four inner pillars every ruin has always had (placed by WorldGen.placeRuins).
  for (const [ox, oy] of [
    [-3, -3],
    [3, -3],
    [-3, 3],
    [3, 3],
  ] as const)
    f.push({ kind: 'pillar', id: 'inner', ox, oy, solid: true });
  if (layout === 'ring') {
    // An inner ring wall (radius 4) joining the pillars, with east and west openings.
    for (let oy = -5; oy <= 5; oy++) {
      for (let ox = -5; ox <= 5; ox++) {
        const d = Math.hypot(ox, oy);
        if (Math.abs(d - 4) > 0.5) continue;
        if (Math.abs(oy) <= 1) continue; // E/W openings
        if (Math.abs(ox) === 3 && Math.abs(oy) === 3) continue; // a pillar stands here
        f.push({ kind: 'inner_wall', id: 'ring', ox, oy, solid: true });
      }
    }
  } else {
    if (layout === 'colonnade') {
      for (const [ox, oy] of [
        [-5, -5],
        [5, -5],
        [-5, 5],
        [5, 5],
      ] as const)
        f.push({ kind: 'pillar', id: 'colonnade', ox, oy, solid: true });
    }
  }
  // Sealed reliquary: opens when the puzzle is solved.
  f.push({ kind: 'reliquary', id: 'reliquary', ox: 0, oy: layout === 'ring' ? -2 : -4, solid: true });
  if (puzzle === 'lamps') {
    // Three lamps along the north wall, in a shuffled arrangement; the glyph stone gives the order.
    const spots: Array<[number, number]> = [
      [-4, -6],
      [0, -6],
      [4, -6],
    ];
    const symbols = [...LAMP_SYMBOLS];
    for (let i = symbols.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = symbols[i] as LampSymbol;
      symbols[i] = symbols[j] as LampSymbol;
      symbols[j] = t;
    }
    spots.forEach(([ox, oy], i) => f.push({ kind: 'lamp', id: symbols[i] ?? 'sun', ox, oy, solid: true }));
    f.push({ kind: 'glyph', id: order.join('-'), ox: 0, oy: 6, solid: true });
  } else {
    (
      [
        [-6, -3],
        [6, -3],
        [-3, 6],
        [3, 6],
      ] as const
    ).forEach(([ox, oy], i) => f.push({ kind: 'plate', id: String(i), ox, oy, solid: false }));
  }
  if (traps) {
    // Spike traps across the inside of the south gateway; the other three gates stay clear.
    for (const ox of [-1, 0, 1]) f.push({ kind: 'trap', id: String(ox + 1), ox, oy: 7, solid: false });
  }
  // A hidden cache in a loose wall stone on one side.
  if ((h >>> 7) % 2 === 0) f.push({ kind: 'secret', id: 'cache', ox: (h >>> 9) % 2 === 0 ? -6 : 6, oy: 4, solid: true });
  return { layout, puzzle, order, traps, features: f };
}

/** Spike trap phase for a time (ms): 'down' (safe), 'warn' (glint, about to rise), 'up' (hurts). */
export const TRAP_CYCLE = { down: 1800, warn: 650, up: 1000 } as const;
export function trapPhase(nowMs: number, index: number): 'down' | 'warn' | 'up' {
  const total = TRAP_CYCLE.down + TRAP_CYCLE.warn + TRAP_CYCLE.up;
  const t = (nowMs + index * 400) % total;
  if (t < TRAP_CYCLE.down) return 'down';
  if (t < TRAP_CYCLE.down + TRAP_CYCLE.warn) return 'warn';
  return 'up';
}

// ---------- Landmarks ----------

export type LandmarkId = 'great_fig' | 'termite_mound' | 'split_boulder';
export const LANDMARK_IDS: readonly LandmarkId[] = ['great_fig', 'termite_mound', 'split_boulder'];
export const LANDMARK_NAMES: Record<LandmarkId, string> = {
  great_fig: 'Great Strangler Fig',
  termite_mound: 'Towering Termite Mound',
  split_boulder: 'Lightning-Split Boulder',
};
/** Landmark cells are this many tiles square; about half hold one landmark. */
export const LANDMARK_CELL = 128;

/** Candidate landmark in a cell (validated against terrain by WorldGen). Pure. */
export function landmarkCandidate(cellX: number, cellY: number, seed: number): { tx: number; ty: number; id: LandmarkId } | null {
  const h = hash2(cellX, cellY, seed ^ 0x1a4d);
  if (h % 100 >= 50) return null;
  const rng = mulberry32(h);
  const tx = cellX * LANDMARK_CELL + 20 + Math.floor(rng() * (LANDMARK_CELL - 40));
  const ty = cellY * LANDMARK_CELL + 20 + Math.floor(rng() * (LANDMARK_CELL - 40));
  return { tx, ty, id: LANDMARK_IDS[(h >>> 4) % LANDMARK_IDS.length] ?? 'great_fig' };
}

// ---------- Shortcuts: hidden stepping stones across rivers ----------

/**
 * Stepping-stone lines: one continuous north–south line per 40-tile column band and one
 * east–west line per 40-tile row band, so they cross rivers flowing either way end to end. Pure.
 */
export const STEPPING_CELL = 40;
export function steppingColumn(cellX: number, seed: number): number {
  return cellX * STEPPING_CELL + 6 + (hash2(cellX, 0, seed ^ 0x5733) % (STEPPING_CELL - 12));
}
export function steppingRow(cellY: number, seed: number): number {
  return cellY * STEPPING_CELL + 6 + (hash2(0, cellY, seed ^ 0x7a11) % (STEPPING_CELL - 12));
}
export function isSteppingTile(tx: number, ty: number, seed: number): boolean {
  return tx === steppingColumn(Math.floor(tx / STEPPING_CELL), seed) || ty === steppingRow(Math.floor(ty / STEPPING_CELL), seed);
}
