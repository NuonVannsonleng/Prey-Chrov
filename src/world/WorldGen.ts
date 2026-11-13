import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import type { BiomeDef, BiomeId } from '../data/schema';
import { CHUNK_TILES, TILE_SIZE, WORLD_GEN } from '../config';
import { GROUND_TILE, TILE, type GroundTileKey } from '../textures';
import { hash2, mulberry32 } from '../utils/random';
import { LANDMARK_CELL, isSteppingTile, landmarkCandidate, ruinPlan, type LandmarkId } from './RuinPlan';

const WATER_MINIMAP = { deep: '#1d4a52', shallow: '#2c6a6a' } as const;

export interface GenProp {
  /** Stable id: "cx,cy:index" — chunk diffs and saves key on it. */
  key: string;
  kind: 'resource' | 'scenery' | 'shrine' | 'chest' | 'tablet' | 'heart' | 'root' | 'feature' | 'landmark';
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
  private readonly landmarkCache = new Map<number, { tx: number; ty: number; id: LandmarkId } | null>();
  private tabletSiteCache: RuinSite[] | null = null;
  private heartCache: { tx: number; ty: number } | null = null;
  private heartSearching = false;

  constructor(
    seed: number,
    private readonly biomes: ReadonlyMap<BiomeId, BiomeDef>,
    /** Chance (0..1) that a clearing chunk holds a Neak Ta shrine (shrines.json). */
    private readonly shrineChance = 0,
    /** M17: content generation (2 adds the newer landmark kinds); old saves stay on 1. */
    private readonly content = 1,
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
    if (this.inHeartGlade(tx, ty, 2)) return null;

    const r = Math.abs(this.river(tx / WORLD_GEN.riverScale, ty / WORLD_GEN.riverScale));
    if (r < WORLD_GEN.riverWidth) {
      // Fords: stretches of the river stay shallow so rivers never wall off the world.
      const fordable = this.ford(tx / WORLD_GEN.fordScale, ty / WORLD_GEN.fordScale) > WORLD_GEN.fordThreshold;
      const deep = r < WORLD_GEN.riverWidth * 0.55 && !fordable;
      return deep && !isSteppingTile(tx, ty, this.seed) ? 'deep' : 'shallow';
    }
    if (this.biomeAt(tx, ty) === 'river_swamp') {
      const p = this.pond(tx / 14, ty / 14);
      if (p > 0.62) return 'deep';
      if (p > 0.38) return 'shallow';
    }
    return null;
  }

  /** M13 shortcut: a stepping-stone tile where the river would otherwise be deep. */
  steppingAt(tx: number, ty: number): boolean {
    if (!isSteppingTile(tx, ty, this.seed)) return false; // cheap column test first
    if (this.spawnDist(tx, ty) <= WORLD_GEN.spawnSafeRadius + 2 || this.ruinAt(tx, ty) || this.inHeartGlade(tx, ty, 2)) return false;
    const r = Math.abs(this.river(tx / WORLD_GEN.riverScale, ty / WORLD_GEN.riverScale));
    if (r >= WORLD_GEN.riverWidth * 0.55) return false;
    return !(this.ford(tx / WORLD_GEN.fordScale, ty / WORLD_GEN.fordScale) > WORLD_GEN.fordThreshold);
  }

  /** M13: the validated landmark in a landmark cell (dry, clear of ruins, spawn and the Heart), cached. */
  landmarkInCell(cellX: number, cellY: number): { tx: number; ty: number; id: LandmarkId } | null {
    const key = cellX * 4194304 + cellY;
    const cached = this.landmarkCache.get(key);
    if (cached !== undefined) return cached;
    let out: { tx: number; ty: number; id: LandmarkId } | null = null;
    const raw = landmarkCandidate(cellX, cellY, this.seed, this.content);
    const N = CHUNK_TILES;
    const snap = (t: number) => {
      const ch = Math.floor(t / N);
      return ch * N + Math.min(N - 4, Math.max(3, t - ch * N));
    };
    const c = raw ? { ...raw, tx: snap(raw.tx), ty: snap(raw.ty) } : null;
    if (c && this.spawnDist(c.tx, c.ty) > WORLD_GEN.spawnSafeRadius + 20 && !this.inHeartGlade(c.tx, c.ty, 8) && this.ruinsNear(c.tx, c.ty, WORLD_GEN.ruinRadius + 8).length === 0) {
      let dry = true;
      for (let oy = -3; oy <= 3 && dry; oy++) for (let ox = -3; ox <= 3; ox++) if (this.waterAt(c.tx + ox, c.ty + oy)) dry = false;
      if (dry) out = c;
    }
    this.landmarkCache.set(key, out);
    return out;
  }

  isSolidWater(tx: number, ty: number): boolean {
    return this.waterAt(tx, ty) === 'deep';
  }

  tileAt(tx: number, ty: number): number {
    const water = this.waterAt(tx, ty);
    let shore = false;
    if (!water) {
      // Stepping stones keep their banks as shore (as when the river there was deep).
      for (let oy = -1; oy <= 1 && !shore; oy++) for (let ox = -1; ox <= 1; ox++) if ((ox || oy) && (this.waterAt(tx + ox, ty + oy) === 'deep' || this.steppingAt(tx + ox, ty + oy))) shore = true;
    }
    return this.tileFrom(tx, ty, water, shore);
  }

  /** Tile index from precomputed water info (shared by tileAt and the chunk grid). */
  private tileFrom(tx: number, ty: number, water: 'deep' | 'shallow' | null, shore: boolean): number {
    if (water === 'deep') return TILE.waterA;
    if (water === 'shallow') return TILE.shallowsA;
    if (shore) return TILE.shore;
    if (this.inHeartGlade(tx, ty, 0)) return hash2(tx, ty, this.seed) % 3 === 0 ? TILE.leafLitter : TILE.moss;
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
          for (let oy = 0; oy <= 2 && !shore; oy++) for (let ox = 0; ox <= 2; ox++) if (water[(y + oy) * G + x + ox] === 'deep' || this.steppingAt(tx0 + x + ox - 1, ty0 + y + oy - 1)) shore = true;
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

    // Neak Ta shrines: one guaranteed near spawn, occasional ones in clearings. Space around
    // them is reserved (and no creatures spawn near them).
    const reserve = (lx: number, ly: number, r: number) => {
      for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) occupied.add((ly + oy) * N + lx + ox);
    };
    const shrineTile = this.shrineTileInChunk(cx, cy, tiles);
    if (shrineTile) {
      add('shrine', 'neak_ta', shrineTile[0], shrineTile[1], true, 0);
      reserve(shrineTile[0], shrineTile[1], 2);
    }

    // Ruin architecture first so vegetation doesn't fill the courtyard.
    this.placeRuins(cx, cy, tiles, occupied, add);
    this.placeHeart(cx, cy, occupied, add);

    // Solid props stay off chunk edge tiles so neighbouring chunks can never wall each other off.
    const solidOk = (lx: number, ly: number) =>
      lx >= 1 && ly >= 1 && lx < N - 1 && ly < N - 1 && dryLand(lx, ly) && !blocked(lx, ly) && this.spawnDist(tx0 + lx, ty0 + ly) > 3.5;

    const vegStart = props.length;
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
    this.placeExtras(cx, cy, props, vegStart, add);
    return { cx, cy, tiles, props };
  }

  /**
   * M13 extras (ruin layouts, puzzle pieces, traps, caches, landmarks) are appended after the
   * vegetation pass and then clear any vegetation on their tiles. Everything generated before
   * keeps exactly the same keys and positions as in older versions, so saved chest and node
   * states still line up.
   */
  private placeExtras(
    cx: number,
    cy: number,
    props: GenProp[],
    vegStart: number,
    add: (kind: GenProp['kind'], id: string, lx: number, ly: number, solid: boolean, jitter?: number) => void,
  ): void {
    const N = CHUNK_TILES;
    const tx0 = cx * N;
    const ty0 = cy * N;
    const clear: Array<[number, number, number]> = [];
    const site = this.ruinsNear(tx0 + N / 2, ty0 + N / 2, N * 1.5).find(
      (s) => s.tx + s.radius >= tx0 && s.tx - s.radius < tx0 + N && s.ty + s.radius >= ty0 && s.ty - s.radius < ty0 + N,
    );
    if (site) {
      for (const f of ruinPlan(site, this.seed).features) {
        if (f.kind === 'pillar' && f.id === 'inner') continue; // placed by placeRuins
        const lx = site.tx + f.ox - tx0;
        const ly = site.ty + f.oy - ty0;
        if (lx < 0 || ly < 0 || lx >= N || ly >= N) continue;
        // Architecture keeps off chunk edges (chunks never wall each other off); puzzle pieces
        // always exist wherever they fall, or a puzzle could become unsolvable.
        const edge = lx < 1 || ly < 1 || lx >= N - 1 || ly >= N - 1;
        if (edge && (f.kind === 'pillar' || f.kind === 'inner_wall')) continue;
        if (f.kind === 'pillar') add('scenery', 'ruin_pillar', lx, ly, true, 0);
        else if (f.kind === 'inner_wall') add('scenery', 'ruin_wall', lx, ly, true, 0);
        else add('feature', `${f.kind}:${f.id}@${site.tx},${site.ty}`, lx, ly, f.solid, 0);
        clear.push([lx, ly, 0]);
      }
    }
    const lm = this.landmarkInCell(Math.floor((tx0 + N / 2) / LANDMARK_CELL), Math.floor((ty0 + N / 2) / LANDMARK_CELL));
    if (lm && lm.tx >= tx0 && lm.tx < tx0 + N && lm.ty >= ty0 && lm.ty < ty0 + N) {
      add('landmark', lm.id, lm.tx - tx0, lm.ty - ty0, true, 0);
      clear.push([lm.tx - tx0, lm.ty - ty0, 3]);
    }
    if (!clear.length) return;
    const vegEnd = props.length - clear.length;
    for (let i = vegEnd - 1; i >= vegStart; i--) {
      const p = props[i];
      if (!p) continue;
      const lx = Math.floor(p.x / TILE_SIZE) - tx0;
      const ly = Math.floor(p.y / TILE_SIZE) - ty0;
      if (clear.some(([x, y, r]) => Math.abs(x - lx) <= r && Math.abs(y - ly) <= r)) props.splice(i, 1);
    }
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
    // Inner pillars and rubble (unchanged since M6 so saved prop keys stay stable; M13 extras
    // are appended after the vegetation pass in placeExtras).
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
    // Two chests flank the altar; the five nearest ruins also hold a key tablet before it.
    for (const [ox, oy] of [
      [-5, 1],
      [5, 1],
    ] as const) {
      const lx = site.tx + ox - tx0;
      const ly = site.ty + oy - ty0;
      if (lx >= 0 && ly >= 0 && lx < N && ly < N) add('chest', 'ruin_chest', lx, ly, true, 0);
    }
    const order = this.tabletOrderAt(site);
    const tlx = site.tx - tx0;
    const tly = site.ty + 3 - ty0;
    if (order > 0 && tlx >= 0 && tly >= 0 && tlx < N && tly < N) add('tablet', `tablet_${order}`, tlx, tly, true, 0);
  }

  /** Local tile of this chunk's Neak Ta shrine, or null. Deterministic per (seed, chunk). */
  private shrineTileInChunk(cx: number, cy: number, tiles: number[][]): [number, number] | null {
    const N = CHUNK_TILES;
    const st = WORLD_GEN.starterShrine;
    const dry = (lx: number, ly: number) => {
      const t = tiles[ly]?.[lx];
      return t !== undefined && t !== TILE.waterA && t !== TILE.shallowsA && t !== TILE.shore;
    };
    if (chunkOf(st.tx) === cx && chunkOf(st.ty) === cy) return [st.tx - cx * N, st.ty - cy * N];
    if (Math.max(Math.abs(cx), Math.abs(cy)) <= 1) return null;
    const h = hash2(cx, cy, this.seed ^ 0x5417);
    if ((h % 10000) / 10000 >= this.shrineChance) return null;
    if (this.biomeAt(cx * N + N / 2, cy * N + N / 2) !== 'clearing') return null;
    const rng = mulberry32(h);
    for (let i = 0; i < 12; i++) {
      const lx = 8 + Math.floor(rng() * 16);
      const ly = 8 + Math.floor(rng() * 16);
      if (dry(lx, ly) && dry(lx, ly + 1) && !this.ruinAt(cx * N + lx, cy * N + ly)) return [lx, ly];
    }
    return null;
  }

  /**
   * The ruins holding the five key tablets: the five ruin sites nearest to spawn, so the main
   * quest always has reachable, discoverable targets (ruin courtyards are always reachable).
   */
  tabletSites(): RuinSite[] {
    if (this.tabletSiteCache) return this.tabletSiteCache;
    let radius = 300;
    let sites: RuinSite[] = [];
    while (sites.length < 5 && radius < 6000) {
      sites = this.ruinsNear(0, 0, radius);
      radius *= 1.6;
    }
    sites.sort((a, b) => Math.hypot(a.tx, a.ty) - Math.hypot(b.tx, b.ty));
    this.tabletSiteCache = sites.slice(0, 5);
    return this.tabletSiteCache;
  }

  /** Tablet order (1..5) held by a ruin site, or 0. */
  tabletOrderAt(site: RuinSite): number {
    const i = this.tabletSites().findIndex((s) => s.tx === site.tx && s.ty === site.ty);
    return i + 1;
  }

  /**
   * Heart of the Forest: a deterministic far site (~220 tiles out, direction from the seed),
   * nudged to dry, non-ruin land so the quest target is always reachable.
   */
  heartSite(): { tx: number; ty: number } {
    return this.heartSiteRaw();
  }

  private heartSiteRaw(): { tx: number; ty: number } {
    if (this.heartCache) return this.heartCache;
    if (this.heartSearching) return { tx: 1e9, ty: 1e9 };
    this.heartSearching = true;
    const ang = ((hash2(17, 23, this.seed) % 3600) / 3600) * Math.PI * 2;
    const baseX = Math.round(Math.cos(ang) * WORLD_GEN.heartDistance);
    const baseY = Math.round(Math.sin(ang) * WORLD_GEN.heartDistance);
    for (let r = 0; r < 60; r++) {
      for (let a = 0; a < 16; a++) {
        const tx = baseX + Math.round(Math.cos((a / 16) * Math.PI * 2) * r);
        const ty = baseY + Math.round(Math.sin((a / 16) * Math.PI * 2) * r);
        if (!this.waterAt(tx, ty) && !this.ruinAt(tx, ty) && !this.ruinsNear(tx, ty, WORLD_GEN.heartGladeRadius + WORLD_GEN.ruinRadius + 2).length) {
          this.heartCache = { tx, ty };
          this.heartSearching = false;
          return this.heartCache;
        }
      }
    }
    this.heartCache = { tx: baseX, ty: baseY };
    this.heartSearching = false;
    return this.heartCache;
  }

  /** Inside the Heart glade (+margin tiles)? Heart site is computed lazily and cached. */
  inHeartGlade(tx: number, ty: number, margin: number): boolean {
    // Cheap reject before touching the cached site: the Heart is ~heartDistance tiles out.
    const r = Math.hypot(tx, ty);
    if (Math.abs(r - WORLD_GEN.heartDistance) > 80) return false;
    const h = this.heartSiteRaw();
    return Math.hypot(tx - h.tx, ty - h.ty) <= WORLD_GEN.heartGladeRadius + margin;
  }

  /** Heart Tree at the centre; a closed ring of ancient roots around it; the glade otherwise empty. */
  private placeHeart(
    cx: number,
    cy: number,
    occupied: Set<number>,
    add: (kind: GenProp['kind'], id: string, lx: number, ly: number, solid: boolean, jitter?: number) => void,
  ): void {
    const N = CHUNK_TILES;
    const tx0 = cx * N;
    const ty0 = cy * N;
    const h = this.heartSite();
    const R = WORLD_GEN.heartGladeRadius;
    if (h.tx + R < tx0 || h.tx - R >= tx0 + N || h.ty + R < ty0 || h.ty - R >= ty0 + N) return;
    for (let ly = 0; ly < N; ly++) {
      for (let lx = 0; lx < N; lx++) {
        const d = Math.hypot(tx0 + lx - h.tx, ty0 + ly - h.ty);
        if (d > R) continue;
        if (Math.abs(d - WORLD_GEN.heartRootRadius) <= 0.55) add('root', 'heart_root', lx, ly, true, 0);
        // Reserve the whole glade so no random props spawn in it.
        occupied.add(ly * N + lx);
      }
    }
    const clx = h.tx - tx0;
    const cly = h.ty - ty0;
    if (clx >= 0 && cly >= 0 && clx < N && cly < N) add('heart', 'heart_tree', clx, cly, true, 0);
  }

  /**
   * Monsoon flood mask: at flood level 0..1, low ground along rivers and in swamps becomes
   * walkable shallows. Never deep water, never the spawn clearing or ruin courtyards, so the
   * player can never be trapped and structures are never lost.
   */
  floodAt(tx: number, ty: number, level: number, floodRiverWidth: number): boolean {
    if (level <= 0) return false;
    if (this.spawnDist(tx, ty) <= WORLD_GEN.spawnSafeRadius - 2) return false;
    if (this.waterAt(tx, ty)) return false;
    if (this.ruinAt(tx, ty)) return false;
    const r = Math.abs(this.river(tx / WORLD_GEN.riverScale, ty / WORLD_GEN.riverScale));
    if (r < WORLD_GEN.riverWidth * (1 + (floodRiverWidth - 1) * level)) return true;
    if (this.biomeAt(tx, ty) === 'river_swamp') return this.pond(tx / 14, ty / 14) > 0.38 - 0.25 * level;
    return false;
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
