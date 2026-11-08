import { TEST_MAP, TILE_SIZE } from '../config';
import { CANOPY_VARIANTS, FERN_VARIANTS, ROCK_VARIANTS, TILE, TRUNK_VARIANTS } from '../textures';
import { hash2, mulberry32, randInt, randRange } from '../utils/random';

export type PropKind = 'tree' | 'rock' | 'fern';

export interface Prop {
  kind: PropKind;
  /** World position of the prop's base (feet), in pixels. */
  x: number;
  y: number;
  variant: number;
  canopyVariant: number;
}

export interface TestMapData {
  widthTiles: number;
  heightTiles: number;
  ground: number[][];
  props: Prop[];
  spawn: { x: number; y: number };
}

/** Fixed, hand-shaped test grove for M1. Deterministic: same output every call. */
export function buildTestMap(): TestMapData {
  const { widthTiles: W, heightTiles: H, seed, spawnTileX, spawnTileY, spawnClearRadiusTiles } = TEST_MAP;
  const rng = mulberry32(seed);
  const pathTiles = new Set<number>();
  const key = (tx: number, ty: number) => ty * W + tx;

  // Winding trail: west → spawn → east, with a northern branch.
  const markPath = (tx: number, ty: number) => {
    if (tx >= 0 && ty >= 0 && tx < W && ty < H) pathTiles.add(key(tx, ty));
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

  const ground: number[][] = [];
  for (let ty = 0; ty < H; ty++) {
    const row: number[] = [];
    for (let tx = 0; tx < W; tx++) {
      const h = hash2(tx, ty, seed) % 100;
      let tile: number;
      if (pathTiles.has(key(tx, ty))) tile = TILE.path;
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
  const props: Prop[] = [];
  const nearSpawn = (tx: number, ty: number) =>
    Math.hypot(tx - spawnTileX, ty - spawnTileY) <= spawnClearRadiusTiles;
  const blocked = (tx: number, ty: number) => {
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (occupied.has(key(tx + ox, ty + oy))) return true;
    return false;
  };

  const place = (kind: 'tree' | 'rock', tx: number, ty: number, allowBorder = false): boolean => {
    if (tx < 0 || ty < 1 || tx >= W || ty >= H) return false;
    if (!allowBorder && (tx < 2 || ty < 2 || tx >= W - 2 || ty >= H - 2)) return false;
    if (nearSpawn(tx, ty) || pathTiles.has(key(tx, ty)) || blocked(tx, ty)) return false;
    occupied.add(key(tx, ty));
    props.push({
      kind,
      x: tx * TILE_SIZE + TILE_SIZE / 2 + randRange(rng, -6, 6),
      y: ty * TILE_SIZE + TILE_SIZE - 4 + randRange(rng, -4, 2),
      variant: randInt(rng, 0, (kind === 'tree' ? TRUNK_VARIANTS : ROCK_VARIANTS) - 1),
      canopyVariant: randInt(rng, 0, CANOPY_VARIANTS - 1),
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

  // Tree clusters and rock outcrops at fixed spots around the clearing.
  const treeClusters: Array<[number, number, number, number]> = [
    [10, 9, 5, 9],
    [46, 9, 6, 11],
    [12, 32, 5, 8],
    [44, 31, 6, 10],
    [24, 7, 3, 4],
    [52, 22, 3, 4],
    [6, 21, 3, 4],
    [30, 33, 4, 5],
  ];
  for (const [cx, cy, radius, count] of treeClusters) {
    let placed = 0;
    for (let attempt = 0; attempt < count * 6 && placed < count; attempt++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * radius;
      if (place('tree', Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d))) placed++;
    }
  }
  const rockGroups: Array<[number, number, number]> = [
    [37, 14, 4],
    [20, 26, 3],
    [40, 26, 3],
    [18, 14, 2],
    [54, 34, 3],
  ];
  for (const [cx, cy, count] of rockGroups) {
    let placed = 0;
    for (let attempt = 0; attempt < count * 8 && placed < count; attempt++) {
      if (place('rock', cx + randInt(rng, -2, 2), cy + randInt(rng, -2, 2))) placed++;
    }
  }
  for (let i = 0; i < 60; i++) place('tree', randInt(rng, 3, W - 4), randInt(rng, 3, H - 4));
  for (let i = 0; i < 6; i++) place('rock', randInt(rng, 3, W - 4), randInt(rng, 3, H - 4));

  // Non-colliding ferns.
  for (let i = 0; i < 260; i++) {
    const tx = randInt(rng, 1, W - 2);
    const ty = randInt(rng, 1, H - 2);
    if (pathTiles.has(key(tx, ty)) || occupied.has(key(tx, ty))) continue;
    if (Math.hypot(tx - spawnTileX, ty - spawnTileY) < 2) continue;
    props.push({
      kind: 'fern',
      x: tx * TILE_SIZE + randRange(rng, 4, 28),
      y: ty * TILE_SIZE + randRange(rng, 12, 30),
      variant: randInt(rng, 0, FERN_VARIANTS - 1),
      canopyVariant: 0,
    });
  }

  return {
    widthTiles: W,
    heightTiles: H,
    ground,
    props,
    spawn: { x: spawnTileX * TILE_SIZE + TILE_SIZE / 2, y: spawnTileY * TILE_SIZE + TILE_SIZE - 2 },
  };
}
