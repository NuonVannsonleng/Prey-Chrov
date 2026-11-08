import Phaser from 'phaser';
import { TILE_SIZE } from '../config';
import { SCENERY_SPRITES, TEX, TILE, type ScenerySprite } from '../textures';
import { mulberry32, randInt, randRange } from '../utils/random';
import { createCanvasTexture, ellipse, hex, px, shade, type Ctx } from './canvas';

// ---------- Extra ground tiles (drawn into the shared tileset by generate.ts) ----------

function speckle(ctx: Ctx, ox: number, rng: () => number, base: number, count: number, spread: number): void {
  for (let i = 0; i < count; i++) {
    px(ctx, ox + randInt(rng, 0, 31), randInt(rng, 0, 31), randInt(rng, 1, 3), randInt(rng, 1, 2), hex(shade(base, randRange(rng, -spread, spread))));
  }
}

export function drawExtraTiles(ctx: Ctx): void {
  const rng = mulberry32(2024);
  // Mud: dark wet earth with puddle glints.
  let ox = TILE.mud * TILE_SIZE;
  px(ctx, ox, 0, TILE_SIZE, TILE_SIZE, hex(0x3d3326));
  speckle(ctx, ox, rng, 0x3d3326, 70, 0.25);
  for (let i = 0; i < 3; i++) ellipse(ctx, ox + randInt(rng, 6, 26), randInt(rng, 6, 26), randRange(rng, 3, 5), 1.6, 'rgba(110,140,140,0.35)');

  // Stone floor: worn temple flagstones with moss in the joints.
  ox = TILE.stoneFloor * TILE_SIZE;
  px(ctx, ox, 0, TILE_SIZE, TILE_SIZE, hex(0x5d6058));
  for (const [x, y, w, h] of [
    [1, 1, 14, 9],
    [17, 1, 14, 13],
    [1, 12, 10, 19],
    [13, 16, 18, 15],
  ] as const) {
    px(ctx, ox + x, y, w, h, hex(shade(0x6e7268, randRange(rng, -0.12, 0.08))));
    px(ctx, ox + x, y, w, 1, hex(0x858a7e));
  }
  for (let i = 0; i < 10; i++) px(ctx, ox + randInt(rng, 0, 30), randInt(rng, 0, 30), 2, 1, hex(0x4a6a38));

  // Shallows (2 frames): lighter teal water with ripples, walkable.
  for (const [frame, phase] of [
    [TILE.shallowsA, 0],
    [TILE.shallowsB, 1],
  ] as const) {
    ox = frame * TILE_SIZE;
    px(ctx, ox, 0, TILE_SIZE, TILE_SIZE, hex(0x2a5a58));
    const r = mulberry32(77);
    for (let i = 0; i < 18; i++) px(ctx, ox + randInt(r, 0, 29), randInt(r, 0, 31), 3, 1, hex(shade(0x2a5a58, randRange(r, -0.15, 0.2))));
    for (let i = 0; i < 5; i++) {
      const y = (randInt(r, 0, 31) + phase * 2) % 32;
      px(ctx, ox + randInt(r, 0, 27), y, 4, 1, hex(0x9fe0d8, 0.35));
    }
    for (let i = 0; i < 4; i++) px(ctx, ox + randInt(r, 2, 28), randInt(r, 2, 28), 2, 2, hex(0x5a5a3e));
  }

  // Jungle floor: very dark, root-laced ground under deep canopy.
  ox = TILE.jungleFloor * TILE_SIZE;
  px(ctx, ox, 0, TILE_SIZE, TILE_SIZE, hex(0x1f3020));
  speckle(ctx, ox, rng, 0x1f3020, 60, 0.3);
  for (let i = 0; i < 3; i++) {
    let x = ox + randInt(rng, 0, 31);
    let y = randInt(rng, 0, 31);
    for (let s = 0; s < 8; s++) {
      px(ctx, x, y, 2, 1, hex(0x3a2d20));
      x += randInt(rng, 0, 2);
      y += randInt(rng, -1, 1);
    }
  }
}

// ---------- Scenery sprites ----------

export const SCENERY_FRAME: Record<ScenerySprite, { w: number; h: number }> = {
  fern: { w: 26, h: 20 },
  big_tree: { w: 40, h: 60 },
  reeds: { w: 24, h: 26 },
  ruin_wall: { w: 34, h: 40 },
  ruin_pillar: { w: 26, h: 52 },
  ruin_rubble: { w: 30, h: 16 },
  ruin_altar: { w: 40, h: 34 },
};

const STONE = 0x6e7268;

function drawBigTree(ctx: Ctx, ox: number, w: number, h: number): void {
  ellipse(ctx, ox + w / 2, h - 5, 18, 5, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = hex(0x3a3028);
  ctx.beginPath();
  ctx.moveTo(ox + 2, h - 3);
  ctx.quadraticCurveTo(ox + 12, h - 12, ox + 13, 0);
  ctx.lineTo(ox + 27, 0);
  ctx.quadraticCurveTo(ox + 28, h - 12, ox + w - 2, h - 3);
  ctx.closePath();
  ctx.fill();
  px(ctx, ox + 14, 0, 4, h - 10, hex(0x4a3d32));
  const rng = mulberry32(31);
  for (let i = 0; i < 14; i++) px(ctx, ox + randInt(rng, 14, 26), randInt(rng, 2, h - 14), 1, randInt(rng, 4, 9), hex(0x2a221c));
  for (let i = 0; i < 6; i++) px(ctx, ox + randInt(rng, 12, 28), randInt(rng, h - 26, h - 8), 3, 2, hex(0x4f6b34));
}

function drawReeds(ctx: Ctx, ox: number, w: number, h: number): void {
  const rng = mulberry32(57);
  for (let i = 0; i < 9; i++) {
    const x = ox + 3 + i * 2.2;
    const top = randInt(rng, 2, 10);
    px(ctx, x, top, 1, h - top - 2, hex(shade(0x6b8a3a, randRange(rng, -0.2, 0.2))));
    if (i % 3 === 0) px(ctx, x - 1, top, 3, 4, hex(0x6b4a2e));
  }
  ellipse(ctx, ox + w / 2, h - 2, 10, 2, 'rgba(0,0,0,0.25)');
}

function carvedBlock(ctx: Ctx, x: number, y: number, w: number, h: number, rng: () => number): void {
  px(ctx, x, y, w, h, hex(shade(STONE, randRange(rng, -0.1, 0.05))));
  px(ctx, x, y, w, 2, hex(shade(STONE, 0.25)));
  px(ctx, x, y + h - 2, w, 2, hex(shade(STONE, -0.3)));
}

function drawRuinWall(ctx: Ctx, ox: number, w: number, h: number): void {
  const rng = mulberry32(91);
  ellipse(ctx, ox + w / 2, h - 3, w / 2, 4, 'rgba(0,0,0,0.35)');
  for (let row = 0; row < 4; row++) {
    const y = h - 10 - row * 8;
    const shift = row % 2 ? 4 : 0;
    for (let x = ox + 1 - shift; x < ox + w - 2; x += 10) carvedBlock(ctx, Math.max(ox + 1, x), y, Math.min(9, ox + w - 1 - Math.max(ox + 1, x)), 7, rng);
  }
  for (let i = 0; i < 7; i++) px(ctx, ox + randInt(rng, 2, w - 4), randInt(rng, 6, h - 10), 3, 2, hex(0x4a6a38));
  // Broken top edge.
  for (let x = ox + 1; x < ox + w - 1; x += 4) if (rng() < 0.4) px(ctx, x, h - 34, 4, randInt(rng, 2, 6), 'rgba(0,0,0,0)');
}

function drawRuinPillar(ctx: Ctx, ox: number, w: number, h: number): void {
  const rng = mulberry32(73);
  ellipse(ctx, ox + w / 2, h - 3, 12, 4, 'rgba(0,0,0,0.35)');
  carvedBlock(ctx, ox + 3, h - 9, w - 6, 7, rng);
  for (let y = h - 17; y > 10; y -= 8) carvedBlock(ctx, ox + 6, y, w - 12, 7, rng);
  carvedBlock(ctx, ox + 4, 6, w - 8, 6, rng);
  // Lotus-bud finial (simple stepped silhouette).
  px(ctx, ox + 9, 2, w - 18, 4, hex(shade(STONE, 0.1)));
  px(ctx, ox + 11, 0, w - 22, 2, hex(shade(STONE, 0.2)));
  for (let i = 0; i < 5; i++) px(ctx, ox + randInt(rng, 6, w - 8), randInt(rng, 12, h - 12), 2, 3, hex(0x4a6a38));
}

function drawRubble(ctx: Ctx, ox: number, w: number, h: number): void {
  const rng = mulberry32(19);
  for (let i = 0; i < 7; i++) {
    const x = ox + randInt(rng, 3, w - 9);
    const y = h - randInt(rng, 4, 10);
    px(ctx, x, y, randInt(rng, 4, 7), randInt(rng, 3, 5), hex(shade(STONE, randRange(rng, -0.25, 0.1))));
  }
}

function drawAltar(ctx: Ctx, ox: number, w: number, h: number): void {
  const rng = mulberry32(5);
  ellipse(ctx, ox + w / 2, h - 3, w / 2 - 1, 5, 'rgba(0,0,0,0.35)');
  carvedBlock(ctx, ox + 2, h - 12, w - 4, 10, rng);
  carvedBlock(ctx, ox + 6, h - 22, w - 12, 10, rng);
  carvedBlock(ctx, ox + 11, h - 32, w - 22, 10, rng);
  px(ctx, ox + w / 2 - 3, h - 28, 6, 3, hex(0x4fc2b4, 0.6));
}

function drawFern(ctx: Ctx, ox: number, w: number, h: number): void {
  const rng = mulberry32(5501);
  const base = 0x2f5a32;
  for (let f = 0; f < 7; f++) {
    const ang = Math.PI + 0.25 + (f / 6) * (Math.PI - 0.5);
    const len = randRange(rng, 7, 11);
    for (let s = 0; s < len; s++) px(ctx, ox + w / 2 + Math.cos(ang) * s, h - 2 + Math.sin(ang) * s * 1.1, 2, 1, hex(shade(base, s / len / 2)));
  }
}

export function generateScenery(scene: Phaser.Scene): void {
  const width = SCENERY_SPRITES.reduce((sum, k) => sum + SCENERY_FRAME[k].w, 0);
  const height = Math.max(...SCENERY_SPRITES.map((k) => SCENERY_FRAME[k].h));
  const offsets: Partial<Record<ScenerySprite, number>> = {};
  const tex = createCanvasTexture(scene, TEX.scenery, width, height, (ctx) => {
    let ox = 0;
    for (const key of SCENERY_SPRITES) {
      const { w, h } = SCENERY_FRAME[key];
      offsets[key] = ox;
      ctx.save();
      ctx.translate(0, height - h);
      const draw = {
        fern: drawFern,
        big_tree: drawBigTree,
        reeds: drawReeds,
        ruin_wall: drawRuinWall,
        ruin_pillar: drawRuinPillar,
        ruin_rubble: drawRubble,
        ruin_altar: drawAltar,
      }[key];
      draw(ctx, ox, w, h);
      ctx.restore();
      ox += w;
    }
  });
  for (const key of SCENERY_SPRITES) {
    const { w, h } = SCENERY_FRAME[key];
    tex.add(key, 0, offsets[key] ?? 0, height - h, w, h);
  }
}

/** Collision footprints (px) for solid scenery. */
export const SCENERY_FOOTPRINT: Partial<Record<ScenerySprite, { w: number; h: number }>> = {
  big_tree: { w: 22, h: 12 },
  ruin_wall: { w: 32, h: 14 },
  ruin_pillar: { w: 18, h: 12 },
  ruin_altar: { w: 36, h: 16 },
};
