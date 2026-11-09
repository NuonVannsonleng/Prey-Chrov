import { describe, expect, it } from 'vitest';
import { CHUNK_TILES, TILE_SIZE } from '../config';
import { RAW_GAME_DATA } from '../data/gameData';
import { validateGameData } from '../data/schema';
import { LAMP_SYMBOLS, LANDMARK_CELL, PLATE_WINDOW_SECONDS, TRAP_CYCLE, ruinPlan, trapPhase } from '../world/RuinPlan';
import { SOLID_SCENERY, WorldGen, type GenProp } from '../world/WorldGen';

const data = validateGameData(RAW_GAME_DATA);
const SEEDS = [1, 42, 4242, 20261109];

/** Tile-level walkability around a point from the real generator (water + solid props). */
function grid(gen: WorldGen, cx0: number, cy0: number, r: number): { blocked: (tx: number, ty: number) => boolean; props: GenProp[] } {
  const solid = new Set<string>();
  const props: GenProp[] = [];
  const minC = Math.floor((cx0 - r) / CHUNK_TILES);
  const maxC = Math.floor((cx0 + r) / CHUNK_TILES);
  const minR = Math.floor((cy0 - r) / CHUNK_TILES);
  const maxR = Math.floor((cy0 + r) / CHUNK_TILES);
  for (let cy = minR; cy <= maxR; cy++) {
    for (let cx = minC; cx <= maxC; cx++) {
      for (const p of gen.generateChunk(cx, cy).props) {
        props.push(p);
        const isSolid =
          p.kind === 'resource' ||
          p.kind === 'chest' ||
          p.kind === 'tablet' ||
          p.kind === 'shrine' ||
          p.kind === 'landmark' ||
          p.kind === 'heart' ||
          p.kind === 'root' ||
          (p.kind === 'scenery' && SOLID_SCENERY.has(p.id)) ||
          (p.kind === 'feature' && /^(lamp|reliquary|glyph|secret):/.test(p.id));
        if (isSolid) solid.add(`${Math.floor(p.x / TILE_SIZE)},${Math.floor((p.y - 2) / TILE_SIZE)}`);
      }
    }
  }
  return { blocked: (tx, ty) => gen.waterAt(tx, ty) === 'deep' || solid.has(`${tx},${ty}`), props };
}

/** Tiles reachable (4-neighbour) from every open tile on a ring around a centre. */
function reachable(blocked: (tx: number, ty: number) => boolean, cx: number, cy: number, ringR: number, maxR: number): Set<string> {
  const seen = new Set<string>();
  const queue: Array<[number, number]> = [];
  for (let y = cy - ringR - 1; y <= cy + ringR + 1; y++)
    for (let x = cx - ringR - 1; x <= cx + ringR + 1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d >= ringR && d <= ringR + 1 && !blocked(x, y)) {
        seen.add(`${x},${y}`);
        queue.push([x, y]);
      }
    }
  while (queue.length) {
    const [x, y] = queue.shift() as [number, number];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      const k = `${nx},${ny}`;
      if (seen.has(k) || Math.hypot(nx - cx, ny - cy) > maxR || blocked(nx, ny)) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

describe('ruin puzzles are reachable and solvable', () => {
  it('every puzzle piece, reliquary, trap and cache in generated ruins can be reached from outside', () => {
    let checked = 0;
    for (const seed of SEEDS) {
      const gen = new WorldGen(seed, data.biomes);
      for (const site of gen.ruinsNear(0, 0, 900).slice(0, 5)) {
        const { blocked, props } = grid(gen, site.tx, site.ty, 16);
        const reach = reachable(blocked, site.tx, site.ty, site.radius + 3, site.radius + 6);
        const features = props.filter((p) => p.kind === 'feature' && p.id.endsWith(`@${site.tx},${site.ty}`));
        // Every planned puzzle piece exists (none dropped at chunk edges).
        const planned = ruinPlan(site, seed).features.filter((f) => f.kind !== 'pillar' && f.kind !== 'inner_wall').length;
        expect(features.length, `ruin ${site.tx},${site.ty} complete`).toBe(planned);
        for (const f of features) {
          const tx = Math.floor(f.x / TILE_SIZE);
          const ty = Math.floor((f.y - 2) / TILE_SIZE);
          const flat = /^(plate|trap):/.test(f.id);
          const ok = flat
            ? reach.has(`${tx},${ty}`)
            : [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
              ].some(([dx, dy]) => reach.has(`${tx + (dx ?? 0)},${ty + (dy ?? 0)}`));
          expect(ok, `${f.id} at ${tx},${ty} (seed ${seed})`).toBe(true);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('lamp puzzles: three different lamps, and the glyph stone spells the solution', () => {
    for (let i = 0; i < 200; i++) {
      const plan = ruinPlan({ tx: i * 37, ty: i * 91 }, 7);
      if (plan.puzzle !== 'lamps') continue;
      const lamps = plan.features.filter((f) => f.kind === 'lamp').map((f) => f.id);
      expect([...lamps].sort()).toEqual([...LAMP_SYMBOLS].sort());
      expect(plan.features.find((f) => f.kind === 'glyph')?.id).toBe(plan.order.join('-'));
    }
  });

  it('plate puzzles: four plates close enough to press within the time window', () => {
    for (let i = 0; i < 200; i++) {
      const plan = ruinPlan({ tx: i * 13, ty: i * 29 }, 11);
      if (plan.puzzle !== 'plates') continue;
      const plates = plan.features.filter((f) => f.kind === 'plate');
      expect(plates).toHaveLength(4);
      // Shortest visiting order, walking (150 px/s = 4.7 tiles/s), with 30% slack for detours.
      const pts = plates.map((f) => [f.ox, f.oy] as const);
      let best = Infinity;
      const perm = (rest: number[], at: readonly [number, number] | null, len: number) => {
        if (!rest.length) best = Math.min(best, len);
        for (const i of rest) {
          const q = pts[i] as readonly [number, number];
          perm(rest.filter((j) => j !== i), q, len + (at ? Math.hypot(q[0] - at[0], q[1] - at[1]) : 0));
        }
      };
      perm([0, 1, 2, 3], null, 0);
      expect((best * 1.3) / (150 / 32)).toBeLessThan(PLATE_WINDOW_SECONDS);
    }
  });

  it('every layout appears, and traps always telegraph before they rise', () => {
    const layouts = new Set<string>();
    for (let i = 0; i < 60; i++) layouts.add(ruinPlan({ tx: i * 41, ty: i * 7 }, 3).layout);
    expect([...layouts].sort()).toEqual(['colonnade', 'open', 'ring']);
    let sawWarnBeforeUp = false;
    let prev = trapPhase(0, 0);
    for (let t = 0; t < (TRAP_CYCLE.down + TRAP_CYCLE.warn + TRAP_CYCLE.up) * 2; t += 50) {
      const ph = trapPhase(t, 0);
      if (ph === 'up') expect(prev === 'warn' || prev === 'up').toBe(true);
      if (prev === 'warn' && ph === 'up') sawWarnBeforeUp = true;
      prev = ph;
    }
    expect(sawWarnBeforeUp).toBe(true);
  });
});

describe('landmarks and shortcuts', () => {
  it('landmarks stand on dry land and are not walled in', () => {
    let found = 0;
    for (const seed of SEEDS) {
      const gen = new WorldGen(seed, data.biomes);
      for (let cy = -3; cy <= 3; cy++)
        for (let cx = -3; cx <= 3; cx++) {
          const lm = gen.landmarkInCell(cx, cy);
          if (!lm) continue;
          found++;
          expect(gen.waterAt(lm.tx, lm.ty)).toBeNull();
          // It really spawns (no landmark lost at a chunk edge).
          const chunk = gen.generateChunk(Math.floor(lm.tx / CHUNK_TILES), Math.floor(lm.ty / CHUNK_TILES));
          expect(chunk.props.some((p) => p.kind === 'landmark' && p.id === lm.id), `landmark ${lm.id} spawned`).toBe(true);
          const { blocked } = grid(gen, lm.tx, lm.ty, 12);
          const reach = reachable(blocked, lm.tx, lm.ty, 9, 10);
          const near = [
            [2, 0],
            [-2, 0],
            [0, 2],
            [0, -2],
          ].filter(([dx, dy]) => reach.has(`${lm.tx + (dx ?? 0)},${lm.ty + (dy ?? 0)}`));
          expect(near.length, `landmark ${lm.id} at ${lm.tx},${lm.ty}`).toBeGreaterThan(0);
        }
    }
    expect(found).toBeGreaterThan(5);
    expect(LANDMARK_CELL).toBeGreaterThan(64);
  });

  it('stepping-stone shortcuts are walkable shallows', () => {
    let n = 0;
    for (const seed of SEEDS) {
      const gen = new WorldGen(seed, data.biomes);
      for (let ty = -300; ty <= 300 && n < 50; ty += 3)
        for (let tx = -300; tx <= 300; tx++) {
          if (!gen.steppingAt(tx, ty)) continue;
          expect(gen.waterAt(tx, ty)).toBe('shallow');
          n++;
        }
    }
    expect(n).toBeGreaterThan(0);
  });
});
