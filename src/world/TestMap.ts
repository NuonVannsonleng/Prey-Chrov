import { TEST_MAP, TILE_SIZE } from '../config';
import { BAMBOO_VARIANTS, CANOPY_VARIANTS, FERN_VARIANTS, ROCK_VARIANTS, TILE, TRUNK_VARIANTS } from '../textures';
import { hash2, mulberry32, randInt, randRange } from '../utils/random';

export type PropKind = 'tree' | 'rock' | 'fern' | 'bamboo' | 'bush';

/** Resource ids (resources.json) the test map places for each gatherable prop kind. */
export const TEST_MAP_RESOURCES = {
  tree: 'jungle_tree',
  rock: 'boulder',
  bamboo: 'bamboo_clump',
  bush: 'berry_bush',
} as const;

export interface Prop {
  /** Stable index within the map; future chunk diffs key on it. */
  id: number;
  kind: PropKind;
  /** World position of the prop's base (feet), in pixels. */
  x: number;
  y: number;
  variant: number;
  canopyVariant: number;
  /** resources.json id if gatherable; null for scenery (ferns, border trees). */
  resource: string | null;
}

export interface TestMapData {
  widthTiles: number;
  heightTiles: number;
  ground: number[][];
  props: Prop[];
  spawn: { x: number; y: number };
}

const POND = { cx: 22, cy: 27, rx: 4.2, ry: 2.6 } as const;

/** Fixed, hand-shaped test grove. Deterministic: same output every call. */
export function buildTestMap(): TestMapData {
  const { widthTiles: W, heightTiles: H, seed, spawnTileX, spawnTileY, spawnClearRadiusTiles } = TEST_MAP;
  const rng = mulberry32(seed);
  const key = (tx: number, ty: number) => ty * W + tx;
  const inMap = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < W && ty < H;

  // Winding trail: west → spawn → east, with a northern branch.
  const pathTiles = new Set<number>();
  const markPath = (tx: number, ty: number) => {
    if (inMap(tx, ty)) pathTiles.add(key(tx, ty));
  };
  for (let tx = 2; tx < W - 2; tx++) {
    const cy = Math.round(spawnTileY + 1 + Math.sin(tx * 0.21) * 2.2 + Math.sin(tx * 0.07) * 1.5);
    markPath(tx, cy);
    markPath(tx, cy + 1);
  }
  for (let ty = 3; ty < spawnTileY; ty++) {
    const cx = Math.round(spawnTileX + 6 + Math.sin(ty * 0.3) * 1.8);
    markPath(cx, ty);
    markPath(cx + 1, ty);
  }

  // Pond with a stream running south to the map edge.
  const waterTiles = new Set<number>();
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      const d = ((tx - POND.cx) / POND.rx) ** 2 + ((ty - POND.cy) / POND.ry) ** 2;
      if (d <= 1 && !pathTiles.has(key(tx, ty))) waterTiles.add(key(tx, ty));
    }
  }
  for (let ty = POND.cy + 2; ty < H; ty++) {
    const sx = Math.round(POND.cx + Math.sin(ty * 0.55) * 1.4);
    waterTiles.add(key(sx, ty));
    waterTiles.add(key(sx + 1, ty));
  }
  const shoreTiles = new Set<number>();
  for (const k of waterTiles) {
    const tx = k % W;
    const ty = Math.floor(k / W);
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const nk = key(tx + ox, ty + oy);
        if (inMap(tx + ox, ty + oy) && !waterTiles.has(nk) && !pathTiles.has(nk)) shoreTiles.add(nk);
      }
    }
  }

  const ground: number[][] = [];
  for (let ty = 0; ty < H; ty++) {
    const row: number[] = [];
    for (let tx = 0; tx < W; tx++) {
      const k = key(tx, ty);
      const h = hash2(tx, ty, seed) % 100;
      let tile: number;
      if (waterTiles.has(k)) tile = TILE.waterA;
      else if (shoreTiles.has(k)) tile = TILE.shore;
      else if (pathTiles.has(k)) tile = TILE.path;
      else if (
        pathTiles.has(key(tx + 1, ty)) ||
        pathTiles.has(key(tx - 1, ty)) ||
        pathTiles.has(key(tx, ty + 1)) ||
        pathTiles.has(key(tx, ty - 1))
      )
        tile = TILE.pathEdge;
      else if (tx < 3 || ty < 3 || tx >= W - 3 || ty >= H - 3) tile = h < 60 ? TILE.leafLitter : TILE.moss;
      else if (h < 6) tile = TILE.grassFlowers;
      else if (h < 16) tile = TILE.moss;
      else if (h < 22) tile = TILE.leafLitter;
      else tile = h % 2 === 0 ? TILE.grassA : TILE.grassB;
      row.push(tile);
    }
    ground.push(row);
  }

  const occupied = new Set<number>();
  const props: Omit<Prop, 'id'>[] = [];
  const nearSpawn = (tx: number, ty: number) =>
    Math.hypot(tx - spawnTileX, ty - spawnTileY) <= spawnClearRadiusTiles;
  const blocked = (tx: number, ty: number) => {
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (occupied.has(key(tx + ox, ty + oy))) return true;
    return false;
  };
  const variantsFor: Record<Exclude<PropKind, 'fern'>, number> = {
    tree: TRUNK_VARIANTS,
    rock: ROCK_VARIANTS,
    bamboo: BAMBOO_VARIANTS,
    bush: 1,
  };

  const place = (kind: Exclude<PropKind, 'fern'>, tx: number, ty: number, border = false): boolean => {
    if (!inMap(tx, ty) || ty < 1) return false;
    if (!border && (tx < 2 || ty < 2 || tx >= W - 2 || ty >= H - 2)) return false;
    const k = key(tx, ty);
    if (nearSpawn(tx, ty) || pathTiles.has(k) || waterTiles.has(k) || shoreTiles.has(k) || blocked(tx, ty)) return false;
    occupied.add(k);
    props.push({
      kind,
      x: tx * TILE_SIZE + TILE_SIZE / 2 + randRange(rng, -6, 6),
      y: ty * TILE_SIZE + TILE_SIZE - 4 + randRange(rng, -4, 2),
      variant: randInt(rng, 0, variantsFor[kind] - 1),
      canopyVariant: randInt(rng, 0, CANOPY_VARIANTS - 1),
      // Border trees are scenery so the grove stays enclosed.
      resource: border ? null : TEST_MAP_RESOURCES[kind],
    });
    return true;
  };

  // Dense border so the grove reads as enclosed jungle.
  for (let tx = 0; tx < W; tx += 2) {
    place('tree', tx, 1, true);
    place('tree', tx + 1, H - 1, true);
  }
  for (let ty = 3; ty < H - 1; ty += 2) {
    place('tree', 0, ty, true);
    place('tree', W - 1, ty + 1, true);
  }

  const scatterCluster = (kind: Exclude<PropKind, 'fern'>, cx: number, cy: number, radius: number, count: number) => {
    let placed = 0;
    for (let attempt = 0; attempt < count * 8 && placed < count; attempt++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * radius;
      if (place(kind, Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d))) placed++;
    }
  };

  const treeClusters: Array<[number, number, number, number]> = [
    [10, 9, 5, 9],
    [46, 9, 6, 11],
    [12, 33, 4, 6],
    [44, 31, 6, 10],
    [24, 7, 3, 4],
    [52, 22, 3, 4],
    [30, 33, 4, 5],
  ];
  for (const [cx, cy, r, n] of treeClusters) scatterCluster('tree', cx, cy, r, n);

  const bambooGroves: Array<[number, number, number, number]> = [
    [7, 22, 3, 6],
    [51, 15, 3, 6],
    [36, 34, 3, 4],
  ];
  for (const [cx, cy, r, n] of bambooGroves) scatterCluster('bamboo', cx, cy, r, n);

  const rockGroups: Array<[number, number, number]> = [
    [37, 14, 4],
    [40, 26, 3],
    [18, 14, 3],
    [54, 34, 3],
  ];
  for (const [cx, cy, n] of rockGroups) scatterCluster('rock', cx, cy, 2.5, n);

  // Berry bushes ring the starting clearing so food is close.
  const bushSpots: Array<[number, number]> = [
    [24, 16],
    [36, 17],
    [26, 25],
    [35, 25],
    [33, 14],
    [17, 20],
    [42, 20],
    [28, 30],
  ];
  for (const [tx, ty] of bushSpots) {
    for (let r = 0; r < 4 && !place('bush', tx + randInt(rng, -r, r), ty + randInt(rng, -r, r)); r++);
  }

  for (let i = 0; i < 50; i++) place('tree', randInt(rng, 3, W - 4), randInt(rng, 3, H - 4));
  for (let i = 0; i < 4; i++) place('rock', randInt(rng, 3, W - 4), randInt(rng, 3, H - 4));

  // Non-colliding ferns.
  for (let i = 0; i < 260; i++) {
    const tx = randInt(rng, 1, W - 2);
    const ty = randInt(rng, 1, H - 2);
    const k = key(tx, ty);
    if (pathTiles.has(k) || occupied.has(k) || waterTiles.has(k)) continue;
    if (Math.hypot(tx - spawnTileX, ty - spawnTileY) < 2) continue;
    props.push({
      kind: 'fern',
      x: tx * TILE_SIZE + randRange(rng, 4, 28),
      y: ty * TILE_SIZE + randRange(rng, 12, 30),
      variant: randInt(rng, 0, FERN_VARIANTS - 1),
      canopyVariant: 0,
      resource: null,
    });
  }

  return {
    widthTiles: W,
    heightTiles: H,
    ground,
    props: props.map((p, id) => ({ id, ...p })),
    spawn: { x: spawnTileX * TILE_SIZE + TILE_SIZE / 2, y: spawnTileY * TILE_SIZE + TILE_SIZE - 2 },
  };
}
