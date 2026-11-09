import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import type { BiomeDef, BiomeId } from '../data/schema';
import { CHUNK_TILES, TILE_SIZE, WORLD_GEN } from '../config';
import { GROUND_TILE, TILE, type GroundTileKey } from '../textures';
import { hash2, mulberry32 } from '../utils/random';

const WATER_MINIMAP = { deep: '#1d4a52', shallow: '#2c6a6a' } as const;

export interface GenProp {
  /** Stable id: "cx,cy:index" — chunk diffs and saves key on it. */
  key: string;
  kind: 'resource' | 'scenery';
  /** resources.json id (resource) or a SCENERY_SPRITES key (scenery). */
  id: string;
  x: number;
  y: number;
  variant: number;
  canopyVariant: number;
}

export interface ChunkData {
  cx: number;
  cy: number;
  /** CHUNK_TILES × CHUNK_TILES tile indices, row-major. */
  tiles: number[][];
  props: GenProp[];
}

export interface RuinSite {
  tx: number;
  ty: number;
  radius: number;
}

const BIOME_ORDER: readonly BiomeId[] = ['clearing', 'deep_jungle', 'bamboo_grove', 'river_swamp', 'ancient_ruins'];

export function chunkOf(tile: number): number {
  return Math.floor(tile / CHUNK_TILES);
}

export function chunkKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

/**
 * Deterministic world generator. Every query is a pure function of (seed, tile coords), so
 * unloading and regenerating a chunk always yields the same terrain and props, and negative
 * coordinates work like positive ones.
 */
export class WorldGen {
  readonly seed: number;
  private readonly moisture: NoiseFunction2D;
  private readonly vegetation: NoiseFunction2D;
  private readonly river: NoiseFunction2D;
  private readonly ford: NoiseFunction2D;
  private readonly pond: NoiseFunction2D;
  private readonly detail: NoiseFunction2D;
  private readonly ruinCache = new Map<number, RuinSite | null>();

  constructor(
    seed: number,
    private readonly biomes: ReadonlyMap<BiomeId, BiomeDef>,
  ) {
    this.seed = seed >>> 0;
    const n = (salt: number) => createNoise2D(mulberry32(hash2(salt, 7919, this.seed)));
    this.moisture = n(1);
    this.vegetation = n(2);
    this.river = n(3);
    this.ford = n(4);
    this.pond = n(5);
    this.detail = n(6);
  }

  biome(id: BiomeId): BiomeDef {
    const b = this.biomes.get(id);
    if (!b) throw new Error(`Missing biome ${id}`);
    return b;
  }

  // ---------- Point queries ----------

  private spawnDist(tx: number, ty: number): number {
    return Math.hypot(tx, ty);
  }

  /** Rare ruin sites: at most one per RUIN_CELL×RUIN_CELL chunk cell, never near spawn. */
  ruinSiteInCell(cellX: number, cellY: number): RuinSite | null {
    const key = cellX * 4194304 + cellY;
    const cached = this.ruinCache.get(key);
    if (cached !== undefined) return cached;
    const h = hash2(cellX, cellY, this.seed ^ 0x5eed);
    let site: RuinSite | null = null;
    if (h % 100 < WORLD_GEN.ruinChancePercent) {
      const span = WORLD_GEN.ruinCellChunks * CHUNK_TILES;
      const rng = mulberry32(h);
      const tx = cellX * span + 16 + Math.floor(rng() * (span - 32));
      const ty = cellY * span + 16 + Math.floor(rng() * (span - 32));
      if (Math.hypot(tx, ty) > WORLD_GEN.spawnSafeRadius + 30) site = { tx, ty, radius: WORLD_GEN.ruinRadius };
    }
    this.ruinCache.set(key, site);
    return site;
  }

  ruinAt(tx: number, ty: number): RuinSite | null {
    const span = WORLD_GEN.ruinCellChunks * CHUNK_TILES;
    // Sites sit ≥16 tiles inside their cell with radius 10, so only the tile's own cell can hold one.
    const s = this.ruinSiteInCell(Math.floor(tx / span), Math.floor(ty / span));
    return s && Math.hypot(tx - s.tx, ty - s.ty) <= s.radius ? s : null;
  }

  /** Ruin sites whose centre lies within `radiusTiles` of a tile (for maps and landmarks). */
  ruinsNear(tx: number, ty: number, radiusTiles: number): RuinSite[] {
    const span = WORLD_GEN.ruinCellChunks * CHUNK_TILES;
    const out: RuinSite[] = [];
    const r = Math.ceil(radiusTiles / span) + 1;
    const cx = Math.floor(tx / span);
    const cy = Math.floor(ty / span);
    for (let oy = -r; oy <= r; oy++) {
      for (let ox = -r; ox <= r; ox++) {
        const s = this.ruinSiteInCell(cx + ox, cy + oy);
        if (s && Math.hypot(s.tx - tx, s.ty - ty) <= radiusTiles) out.push(s);
      }
    }
    return out;
  }

  biomeAt(tx: number, ty: number): BiomeId {
    if (this.spawnDist(tx, ty) <= WORLD_GEN.spawnSafeRadius) return 'clearing';
    if (this.ruinAt(tx, ty)) return 'ancient_ruins';
    const m = this.moisture(tx / WORLD_GEN.moistureScale, ty / WORLD_GEN.moistureScale);
    const v = this.vegetation(tx / WORLD_GEN.vegetationScale, ty / WORLD_GEN.vegetationScale);
    if (m > WORLD_GEN.swampMoisture) return 'river_swamp';
    if (v > WORLD_GEN.bambooVegetation && m > -0.2) return 'bamboo_grove';
    if (v < WORLD_GEN.clearingVegetation) return 'clearing';
    return 'deep_jungle';
  }

  /** 'deep' = solid water, 'shallow' = walkable water, null = dry land. */
  waterAt(tx: number, ty: number): 'deep' | 'shallow' | null {
    const d = this.spawnDist(tx, ty);
    // Starter pond: guaranteed drinkable water a short walk from spawn.
    const sp = WORLD_GEN.starterPond;
    const pd = Math.hypot((tx - sp.tx) / sp.rx, (ty - sp.ty) / sp.ry);
    if (pd <= 1) return pd <= 0.7 ? 'deep' : 'shallow';
    if (d <= WORLD_GEN.spawnSafeRadius + 2) return null;
    if (this.ruinAt(tx, ty)) return null;

    const r = Math.abs(this.river(tx / WORLD_GEN.riverScale, ty / WORLD_GEN.riverScale));
    if (r < WORLD_GEN.riverWidth) {
      // Fords: stretches of the river stay shallow so rivers never wall off the world.
      const fordable = this.ford(tx / WORLD_GEN.fordScale, ty / WORLD_GEN.fordScale) > WORLD_GEN.fordThreshold;
      return r < WORLD_GEN.riverWidth * 0.55 && !fordable ? 'deep' : 'shallow';
    }
    if (this.biomeAt(tx, ty) === 'river_swamp') {
      const p = this.pond(tx / 14, ty / 14);
      if (p > 0.62) return 'deep';
      if (p > 0.38) return 'shallow';
    }
    return null;
  }

  isSolidWater(tx: number, ty: number): boolean {
    return this.waterAt(tx, ty) === 'deep';
  }

  tileAt(tx: number, ty: number): number {
    const water = this.waterAt(tx, ty);
    let shore = false;
    if (!water) {
      for (let oy = -1; oy <= 1 && !shore; oy++) for (let ox = -1; ox <= 1; ox++) if ((ox || oy) && this.waterAt(tx + ox, ty + oy) === 'deep') shore = true;
    }
    return this.tileFrom(tx, ty, water, shore);
  }

  /** Tile index from precomputed water info (shared by tileAt and the chunk grid). */
  private tileFrom(tx: number, ty: number, water: 'deep' | 'shallow' | null, shore: boolean): number {
    if (water === 'deep') return TILE.waterA;
    if (water === 'shallow') return TILE.shallowsA;
    if (shore) return TILE.shore;
    const ruin = this.ruinAt(tx, ty);
    if (ruin) {
      const rd = Math.hypot(tx - ruin.tx, ty - ruin.ty);
      if (rd <= ruin.radius - 1.5) return (hash2(tx, ty, this.seed) % 7 === 0 ? GROUND_TILE.moss : GROUND_TILE.stone_floor) ?? TILE.grassA;
    }
    const biome = this.biome(this.biomeAt(tx, ty));
    return this.pickGround(biome, tx, ty);
  }

  private pickGround(biome: BiomeDef, tx: number, ty: number): number {
    // Low-frequency detail noise keeps patches coherent instead of per-tile noise.
    const n = (this.detail(tx / 6, ty / 6) + 1) / 2;
    const h = (hash2(tx, ty, this.seed) % 1000) / 1000;
    const pick = n * 0.7 + h * 0.3;
    let total = 0;
    for (const g of biome.ground) total += g.weight;
    let acc = 0;
    for (const g of biome.ground) {
      acc += g.weight / total;
      if (pick <= acc) return GROUND_TILE[g.tile] ?? TILE.grassA;
    }
    const last = biome.ground[biome.ground.length - 1];
    return last ? (GROUND_TILE[last.tile] ?? TILE.grassA) : TILE.grassA;
  }

  minimapColor(tx: number, ty: number): string {
    const w = this.waterAt(tx, ty);
    if (w === 'deep') return WATER_MINIMAP.deep;
    if (w === 'shallow') return WATER_MINIMAP.shallow;
    return this.biome(this.biomeAt(tx, ty)).minimapColor;
  }

  // ---------- Chunks ----------

  generateChunk(cx: number, cy: number): ChunkData {
    const N = CHUNK_TILES;
    const tx0 = cx * N;
    const ty0 = cy * N;
    const G = N + 2;
    const water: Array<'deep' | 'shallow' | null> = new Array(G * G);
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) water[y * G + x] = this.waterAt(tx0 + x - 1, ty0 + y - 1);
    const tiles: number[][] = [];
    for (let y = 0; y < N; y++) {
      const row: number[] = [];
      for (let x = 0; x < N; x++) {
        const w = water[(y + 1) * G + x + 1] ?? null;
        let shore = false;
        if (!w) {
          for (let oy = 0; oy <= 2 && !shore; oy++) for (let ox = 0; ox <= 2; ox++) if (water[(y + oy) * G + x + ox] === 'deep') shore = true;
        }
        row.push(this.tileFrom(tx0 + x, ty0 + y, w, shore));
      }
      tiles.push(row);
    }

    const rng = mulberry32(hash2(cx, cy, this.seed ^ 0xc4a7));
    const occupied = new Set<number>();
    const props: GenProp[] = [];
    const blocked = (lx: number, ly: number) => {
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (occupied.has((ly + oy) * N + lx + ox)) return true;
      return false;
    };
    const dryLand = (lx: number, ly: number) => {
      const t = tiles[ly]?.[lx];
      return t !== undefined && t !== TILE.waterA && t !== TILE.waterB && t !== TILE.shallowsA && t !== TILE.shallowsB && t !== TILE.shore;
    };
    const add = (kind: GenProp['kind'], id: string, lx: number, ly: number, solid: boolean, jitter = 6) => {
      if (solid) occupied.add(ly * N + lx);
      props.push({
        key: `${cx},${cy}:${props.length}`,
        kind,
        id,
        x: (tx0 + lx) * TILE_SIZE + TILE_SIZE / 2 + (rng() * 2 - 1) * jitter,
        y: (ty0 + ly) * TILE_SIZE + TILE_SIZE - 4 + (rng() * 2 - 1) * 3,
        variant: Math.floor(rng() * 8),
        canopyVariant: Math.floor(rng() * 3),
      });
    };

    // Guaranteed starter resources near spawn (only in the spawn chunks).
    for (const s of WORLD_GEN.starterProps) {
      if (chunkOf(s.tx) !== cx || chunkOf(s.ty) !== cy) continue;
      const lx = s.tx - tx0;
      const ly = s.ty - ty0;
      add('resource', s.id, lx, ly, true, 0);
    }

    // Ruin architecture first so vegetation doesn't fill the courtyard.
    this.placeRuins(cx, cy, tiles, occupied, add);

    // Solid props stay off chunk edge tiles so neighbouring chunks can never wall each other off.
    const solidOk = (lx: number, ly: number) =>
      lx >= 1 && ly >= 1 && lx < N - 1 && ly < N - 1 && dryLand(lx, ly) && !blocked(lx, ly) && this.spawnDist(tx0 + lx, ty0 + ly) > 3.5;

    for (let attempt = 0; attempt < N * N * 0.35; attempt++) {
      const lx = Math.floor(rng() * N);
      const ly = Math.floor(rng() * N);
      const biome = this.biome(this.biomeAt(tx0 + lx, ty0 + ly));
      const roll = rng();
      let acc = 0;
      for (const p of biome.props) {
        acc += p.density / (N * N * 0.35);
        if (roll > acc) continue;
        const solid = p.kind === 'resource' || SOLID_SCENERY.has(p.id);
        if (solid ? solidOk(lx, ly) : dryLand(lx, ly) && !occupied.has(ly * N + lx)) add(p.kind, p.id, lx, ly, solid);
        break;
      }
    }
    return { cx, cy, tiles, props };
  }

  private placeRuins(
    cx: number,
    cy: number,
    tiles: number[][],
    occupied: Set<number>,
    add: (kind: GenProp['kind'], id: string, lx: number, ly: number, solid: boolean, jitter?: number) => void,
  ): void {
    const N = CHUNK_TILES;
    const tx0 = cx * N;
    const ty0 = cy * N;
    const site = this.ruinsNear(tx0 + N / 2, ty0 + N / 2, N * 1.5).find(
      (s) => s.tx + s.radius >= tx0 && s.tx - s.radius < tx0 + N && s.ty + s.radius >= ty0 && s.ty - s.radius < ty0 + N,
    );
    if (!site) return;
    const wallR = site.radius - 2;
    const gateAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2, -Math.PI];
    for (let ly = 0; ly < N; ly++) {
      for (let lx = 0; lx < N; lx++) {
        const tx = tx0 + lx;
        const ty = ty0 + ly;
        const d = Math.hypot(tx - site.tx, ty - site.ty);
        const ang = Math.atan2(ty - site.ty, tx - site.tx);
        let toGate = Infinity;
        for (const g of gateAngles) toGate = Math.min(toGate, Math.abs(ang - g));
        // Four wide gateways (N/E/S/W) guarantee the courtyard is always reachable:
        // reserve them (and the path just inside/outside) so random props can't block them.
        if (toGate < 0.38 && Math.abs(d - wallR) <= 2.5) {
          occupied.add(ly * N + lx);
          continue;
        }
        if (Math.abs(d - wallR) > 0.5) continue;
        if (hash2(tx, ty, this.seed ^ 0x77) % 5 === 0) continue;
        const t = tiles[ly]?.[lx];
        if (t === TILE.waterA || occupied.has(ly * N + lx)) continue;
        add('scenery', (tx + ty) % 3 === 0 ? 'ruin_pillar' : 'ruin_wall', lx, ly, true, 0);
      }
    }
    // Inner pillars and rubble.
    for (const [ox, oy] of [
      [-3, -3],
      [3, -3],
      [-3, 3],
      [3, 3],
    ] as const) {
      const lx = site.tx + ox - tx0;
      const ly = site.ty + oy - ty0;
      if (lx >= 1 && ly >= 1 && lx < N - 1 && ly < N - 1) add('scenery', 'ruin_pillar', lx, ly, true, 0);
    }
    const clx = site.tx - tx0;
    const cly = site.ty - ty0;
    if (clx >= 0 && cly >= 0 && clx < N && cly < N) add('scenery', 'ruin_altar', clx, cly, true, 0);
  }

  /** Spawn point in world px: centre of tile (0,0). */
  spawnPoint(): { x: number; y: number } {
    return { x: TILE_SIZE / 2, y: TILE_SIZE - 2 };
  }

  static biomeIds(): readonly BiomeId[] {
    return BIOME_ORDER;
  }
}

/** Scenery that blocks movement. Everything else (ferns, reeds, rubble) is walkable decoration. */
export const SOLID_SCENERY: ReadonlySet<string> = new Set(['big_tree', 'ruin_wall', 'ruin_pillar', 'ruin_altar']);

export function groundTileKey(index: number): GroundTileKey | null {
  for (const [k, v] of Object.entries(GROUND_TILE)) if (v === index) return k as GroundTileKey;
  return null;
}
