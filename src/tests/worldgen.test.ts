import { describe, expect, it } from 'vitest';
import { CHUNK_TILES, TILE_SIZE, WORLD_GEN } from '../config';
import { RAW_GAME_DATA } from '../data/gameData';
import { validateGameData } from '../data/schema';
import { SHALLOW_TILES, TILE, WATER_TILES } from '../textures';
import { SOLID_SCENERY, WorldGen, chunkOf } from '../world/WorldGen';

const data = validateGameData(RAW_GAME_DATA);
const make = (seed: number) => new WorldGen(seed, data.biomes);
const SEEDS = [1, 42, 1337, 987654321, 20261109];

const solidTilesOf = (gen: WorldGen, cx: number, cy: number): Set<string> => {
  const out = new Set<string>();
  for (const p of gen.generateChunk(cx, cy).props) {
    if (p.kind === 'resource' || SOLID_SCENERY.has(p.id)) out.add(`${Math.floor(p.x / TILE_SIZE)},${Math.floor((p.y - 1) / TILE_SIZE)}`);
  }
  return out;
};

describe('WorldGen determinism', () => {
  it('same seed → identical chunks, including negative coordinates', () => {
    for (const [cx, cy] of [
      [0, 0],
      [-1, -1],
      [-3, 2],
      [5, -7],
    ] as const) {
      expect(make(42).generateChunk(cx, cy)).toEqual(make(42).generateChunk(cx, cy));
    }
  });

  it('regenerating a chunk after other work gives the same result', () => {
    const gen = make(7);
    const first = gen.generateChunk(2, -2);
    for (let i = -3; i <= 3; i++) gen.generateChunk(i, i);
    expect(gen.generateChunk(2, -2)).toEqual(first);
  });

  it('different seeds give different worlds', () => {
    expect(make(1).generateChunk(3, 3)).not.toEqual(make(2).generateChunk(3, 3));
  });

  it('chunkOf floors correctly for negatives', () => {
    expect(chunkOf(-1)).toBe(-1);
    expect(chunkOf(-CHUNK_TILES)).toBe(-1);
    expect(chunkOf(-CHUNK_TILES - 1)).toBe(-2);
    expect(chunkOf(CHUNK_TILES - 1)).toBe(0);
  });

  it('prop keys are unique and stable', () => {
    const gen = make(99);
    const keys = new Set<string>();
    for (let cy = -1; cy <= 1; cy++) for (let cx = -1; cx <= 1; cx++) for (const p of gen.generateChunk(cx, cy).props) keys.add(p.key);
    const count = [-1, 0, 1].flatMap((cy) => [-1, 0, 1].map((cx) => gen.generateChunk(cx, cy).props.length)).reduce((a, b) => a + b, 0);
    expect(keys.size).toBe(count);
  });
});

describe('WorldGen safety guarantees', () => {
  it.each(SEEDS)('seed %i: safe spawn with every basic material and drinkable water nearby', (seed) => {
    const gen = make(seed);
    expect(gen.biomeAt(0, 0)).toBe('clearing');
    expect(WATER_TILES).not.toContain(gen.tileAt(0, 0));
    const found = new Set<string>();
    let water = false;
    for (let cy = -1; cy <= 0; cy++) {
      for (let cx = -1; cx <= 0; cx++) {
        for (const p of gen.generateChunk(cx, cy).props) {
          if (p.kind === 'resource' && Math.hypot(p.x / TILE_SIZE, p.y / TILE_SIZE) < 14) found.add(p.id);
        }
      }
    }
    for (let ty = -12; ty <= 12; ty++) for (let tx = -12; tx <= 12; tx++) if (gen.waterAt(tx, ty)) water = true;
    for (const id of data.resources.keys()) expect(found.has(id), `${id} near spawn`).toBe(true);
    expect(water).toBe(true);
  });

  it.each(SEEDS)('seed %i: no solid prop on chunk edges, on water, or adjacent to another solid', (seed) => {
    const gen = make(seed);
    for (const [cx, cy] of [
      [0, 0],
      [2, 1],
      [-2, -3],
      [4, -1],
    ] as const) {
      const chunk = gen.generateChunk(cx, cy);
      const solid = chunk.props.filter((p) => p.kind === 'resource' || SOLID_SCENERY.has(p.id));
      const tiles = solid.map((p) => [Math.floor(p.x / TILE_SIZE) - cx * CHUNK_TILES, Math.floor((p.y - 1) / TILE_SIZE) - cy * CHUNK_TILES] as const);
      tiles.forEach(([lx, ly], i) => {
        const prop = solid[i];
        const isRuin = prop?.id.startsWith('ruin');
        if (!isRuin) {
          expect(lx).toBeGreaterThanOrEqual(1);
          expect(ly).toBeGreaterThanOrEqual(1);
          expect(lx).toBeLessThan(CHUNK_TILES - 1);
          expect(ly).toBeLessThan(CHUNK_TILES - 1);
        }
        const t = chunk.tiles[ly]?.[lx] ?? -1;
        expect(WATER_TILES).not.toContain(t);
        if (!isRuin) expect(SHALLOW_TILES).not.toContain(t);
      });
    }
  });

  it.each(SEEDS)('seed %i: almost all dry land near spawn is reachable on foot, including ruin courtyards', (seed) => {
    const gen = make(seed);
    const R = 3; // chunks each side → 7×7 chunks = 224×224 tiles
    const solids = new Set<string>();
    for (let cy = -R; cy <= R; cy++) for (let cx = -R; cx <= R; cx++) for (const k of solidTilesOf(gen, cx, cy)) solids.add(k);
    const min = -R * CHUNK_TILES;
    const max = (R + 1) * CHUNK_TILES - 1;
    const walkable = (tx: number, ty: number) =>
      tx >= min && ty >= min && tx <= max && ty <= max && !gen.isSolidWater(tx, ty) && !solids.has(`${tx},${ty}`);
    let dry = 0;
    for (let ty = min; ty <= max; ty++) for (let tx = min; tx <= max; tx++) if (walkable(tx, ty)) dry++;
    const seen = new Set<string>(['0,0']);
    const queue: Array<[number, number]> = [[0, 0]];
    while (queue.length) {
      const [x, y] = queue.pop()!;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        const k = `${nx},${ny}`;
        if (seen.has(k) || !walkable(nx, ny)) continue;
        seen.add(k);
        queue.push([nx, ny]);
      }
    }
    expect(seen.size / dry).toBeGreaterThan(0.95);
    for (const ruin of gen.ruinsNear(0, 0, R * CHUNK_TILES - WORLD_GEN.ruinRadius)) {
      expect(seen.has(`${ruin.tx + 1},${ruin.ty + 1}`) || seen.has(`${ruin.tx + 2},${ruin.ty}`), `ruin at ${ruin.tx},${ruin.ty}`).toBe(true);
    }
  });

  it('produces a variety of biomes, and rare ruins exist somewhere', () => {
    for (const seed of SEEDS) {
      const gen = make(seed);
      const seen = new Set<string>();
      for (let ty = -300; ty <= 300; ty += 6) for (let tx = -300; tx <= 300; tx += 6) seen.add(gen.biomeAt(tx, ty));
      expect(seen.size, `seed ${seed}: ${[...seen].join(',')}`).toBeGreaterThanOrEqual(4);
      expect(gen.ruinsNear(0, 0, 600).length).toBeGreaterThan(0);
    }
  });

  it('ruin courtyards are stone floor and never start on spawn', () => {
    const gen = make(42);
    const ruins = gen.ruinsNear(0, 0, 800);
    expect(ruins.length).toBeGreaterThan(0);
    for (const r of ruins) {
      expect(Math.hypot(r.tx, r.ty)).toBeGreaterThan(WORLD_GEN.spawnSafeRadius + 20);
      const floor = [0, 1, 2, -1, -2].flatMap((d) => [gen.tileAt(r.tx + d, r.ty), gen.tileAt(r.tx, r.ty + d)]);
      expect(floor.filter((t) => t === TILE.stoneFloor).length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('depth sorting', () => {
  it('y-sorted objects always draw above the ground and below canopies, north or south', async () => {
    const { DEPTH, ySort } = await import('../config');
    for (const y of [-4_000_000, -7000, -1, 0, 1, 7000, 4_000_000]) {
      expect(ySort(y)).toBeGreaterThan(DEPTH.ground);
      expect(ySort(y)).toBeGreaterThan(DEPTH.targetRing);
      expect(ySort(y)).toBeLessThan(DEPTH.canopy);
    }
    expect(ySort(-6500)).toBeLessThan(ySort(-6499.5));
    expect(DEPTH.canopy + ySort(4_000_000) - DEPTH.actors).toBeLessThan(DEPTH.darkness);
  });
});
