import { STRUCTURE_FRAME } from '../textures';
import { mulberry32 } from '../utils/random';
import { ellipse, hex, px, shade, type Ctx } from './canvas';

/** M10 structures, drawn into TEX.structures (bottom-aligned at `baseY`) by survival.ts. */

const BAMBOO = 0x9fbf5a;
const BAMBOO_DARK = 0x6e8a3a;
const BAMBOO_LIGHT = 0xc4dc80;
const THATCH = 0x8a7a44;
const WOOD = 0x6b4a2e;
const WOOD_LIGHT = 0x84603c;

function pole(ctx: Ctx, x: number, top: number, bottom: number, w = 4): void {
  px(ctx, x, top, w, bottom - top, hex(BAMBOO));
  px(ctx, x, top, 1, bottom - top, hex(BAMBOO_LIGHT));
  for (let y = top + 7; y < bottom - 2; y += 9) px(ctx, x, y, w, 1, hex(BAMBOO_DARK));
}

function drawWall(ctx: Ctx, baseY: number): void {
  const { x: ox, w } = STRUCTURE_FRAME.wall;
  ellipse(ctx, ox + w / 2, baseY - 3, w / 2, 3, 'rgba(0,0,0,0.3)');
  for (let x = ox + 1; x < ox + w - 3; x += 4) pole(ctx, x, baseY - 26 + ((x * 7) % 3), baseY - 2);
  // lashings
  px(ctx, ox + 1, baseY - 20, w - 2, 2, hex(THATCH));
  px(ctx, ox + 1, baseY - 9, w - 2, 2, hex(THATCH));
}

function drawWallV(ctx: Ctx, baseY: number): void {
  const { x: ox, w, h } = STRUCTURE_FRAME.wall_v;
  ellipse(ctx, ox + w / 2, baseY - 3, w / 2, 3, 'rgba(0,0,0,0.3)');
  // seen end-on: a narrow stack of poles with depth
  for (let i = 0; i < 4; i++) pole(ctx, ox + 2 + (i % 2) * 4, baseY - h + 2 + i * 9, baseY - 2 - (3 - i) * 0, 4);
  px(ctx, ox + 1, baseY - h + 10, w - 2, 2, hex(THATCH));
  px(ctx, ox + 1, baseY - 14, w - 2, 2, hex(THATCH));
}

function drawRoof(ctx: Ctx, baseY: number): void {
  const { x: ox, w, h } = STRUCTURE_FRAME.roof;
  const rng = mulberry32(6262);
  // corner posts
  pole(ctx, ox + 4, baseY - h + 14, baseY - 1, 3);
  pole(ctx, ox + w - 7, baseY - h + 14, baseY - 1, 3);
  // thatch slab (seen from above-front)
  ctx.fillStyle = hex(0x6f7a3a);
  ctx.beginPath();
  ctx.moveTo(ox + 1, baseY - h + 26);
  ctx.lineTo(ox + 10, baseY - h + 2);
  ctx.lineTo(ox + w - 10, baseY - h + 2);
  ctx.lineTo(ox + w - 1, baseY - h + 26);
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 140; i++) {
    const t = rng();
    const y = baseY - h + 3 + t * 22;
    const xMin = ox + 10 - 9 * t;
    const xMax = ox + w - 10 + 9 * t;
    px(ctx, xMin + rng() * (xMax - xMin), y, 1, 3 + Math.floor(rng() * 3), hex(shade(0x8a8a44, (rng() - 0.4) * 0.5)));
  }
  px(ctx, ox + 9, baseY - h + 2, w - 18, 2, hex(0xa8a65a));
}

function drawChest(ctx: Ctx, baseY: number): void {
  const { x: ox, w } = STRUCTURE_FRAME.chest;
  ellipse(ctx, ox + w / 2, baseY - 2, w / 2 - 1, 3, 'rgba(0,0,0,0.35)');
  px(ctx, ox + 2, baseY - 16, w - 4, 14, hex(WOOD));
  px(ctx, ox + 2, baseY - 20, w - 4, 5, hex(WOOD_LIGHT));
  for (let x = ox + 6; x < ox + w - 4; x += 5) px(ctx, x, baseY - 16, 1, 14, hex(shade(WOOD, -0.25)));
  px(ctx, ox + 2, baseY - 15, w - 4, 1, hex(shade(WOOD, -0.35)));
  px(ctx, ox + w / 2 - 2, baseY - 15, 4, 4, hex(BAMBOO));
}

function drawCollector(ctx: Ctx, baseY: number): void {
  const { x: ox, w, h } = STRUCTURE_FRAME.collector;
  ellipse(ctx, ox + w / 2, baseY - 2, w / 2 - 2, 3, 'rgba(0,0,0,0.3)');
  // leaf funnel on three legs over a big bamboo vessel
  pole(ctx, ox + 3, baseY - h + 10, baseY - 1, 2);
  pole(ctx, ox + w - 5, baseY - h + 10, baseY - 1, 2);
  px(ctx, ox + 8, baseY - 16, w - 16, 15, hex(BAMBOO));
  px(ctx, ox + 8, baseY - 16, 2, 15, hex(BAMBOO_LIGHT));
  px(ctx, ox + 8, baseY - 8, w - 16, 1, hex(BAMBOO_DARK));
  ctx.fillStyle = hex(0x3f7a3a);
  ctx.beginPath();
  ctx.moveTo(ox + 1, baseY - h + 6);
  ctx.lineTo(ox + w - 1, baseY - h + 6);
  ctx.lineTo(ox + w / 2 + 3, baseY - 17);
  ctx.lineTo(ox + w / 2 - 3, baseY - 17);
  ctx.closePath();
  ctx.fill();
  px(ctx, ox + 2, baseY - h + 6, w - 4, 1, hex(0x6fb05a));
}

function drawWorkbench(ctx: Ctx, baseY: number): void {
  const { x: ox, w } = STRUCTURE_FRAME.workbench;
  ellipse(ctx, ox + w / 2, baseY - 2, w / 2 - 1, 3, 'rgba(0,0,0,0.35)');
  px(ctx, ox + 3, baseY - 12, 3, 11, hex(WOOD));
  px(ctx, ox + w - 6, baseY - 12, 3, 11, hex(WOOD));
  px(ctx, ox + 1, baseY - 17, w - 2, 6, hex(WOOD_LIGHT));
  px(ctx, ox + 1, baseY - 12, w - 2, 1, hex(shade(WOOD, -0.3)));
  // tools on top: stone and a stick
  ellipse(ctx, ox + 9, baseY - 19, 3, 2, hex(0x9aa0a2));
  px(ctx, ox + 16, baseY - 20, 12, 2, hex(0x8a6a44));
  px(ctx, ox + 26, baseY - 22, 3, 4, hex(0x7d8285));
}

function drawBed(ctx: Ctx, baseY: number): void {
  const { x: ox, w } = STRUCTURE_FRAME.bed;
  ellipse(ctx, ox + w / 2, baseY - 2, w / 2 - 1, 3, 'rgba(0,0,0,0.35)');
  // raised bamboo frame with a woven mat and a hide blanket
  px(ctx, ox + 2, baseY - 9, w - 4, 4, hex(BAMBOO));
  px(ctx, ox + 3, baseY - 5, 3, 4, hex(BAMBOO_DARK));
  px(ctx, ox + w - 6, baseY - 5, 3, 4, hex(BAMBOO_DARK));
  px(ctx, ox + 3, baseY - 15, w - 6, 6, hex(THATCH));
  for (let x = ox + 4; x < ox + w - 4; x += 3) px(ctx, x, baseY - 15, 1, 6, hex(shade(THATCH, -0.2)));
  px(ctx, ox + 14, baseY - 16, w - 18, 7, hex(0x8a5a3a));
  px(ctx, ox + 14, baseY - 16, w - 18, 2, hex(0xa87048));
  ellipse(ctx, ox + 8, baseY - 14, 4, 2.5, hex(0xd8c8a0));
}

function drawFlag(ctx: Ctx, baseY: number): void {
  const { x: ox, h } = STRUCTURE_FRAME.flag;
  ellipse(ctx, ox + 5, baseY - 2, 5, 2, 'rgba(0,0,0,0.3)');
  pole(ctx, ox + 3, baseY - h + 1, baseY - 1, 2);
  ctx.fillStyle = hex(0xe6b866);
  ctx.beginPath();
  ctx.moveTo(ox + 5, baseY - h + 2);
  ctx.lineTo(ox + 15, baseY - h + 6);
  ctx.lineTo(ox + 5, baseY - h + 11);
  ctx.closePath();
  ctx.fill();
  px(ctx, ox + 6, baseY - h + 5, 4, 1, hex(0xb58a3e));
  // stone cairn at the base
  ellipse(ctx, ox + 5, baseY - 3, 4, 2.5, hex(0x7d8285));
}

export const BUILDING_FRAMES = ['wall', 'wall_v', 'roof', 'chest', 'collector', 'workbench', 'bed', 'flag'] as const;

export function drawBuildingStructures(ctx: Ctx, baseY: number): void {
  drawWall(ctx, baseY);
  drawWallV(ctx, baseY);
  drawRoof(ctx, baseY);
  drawChest(ctx, baseY);
  drawCollector(ctx, baseY);
  drawWorkbench(ctx, baseY);
  drawBed(ctx, baseY);
  drawFlag(ctx, baseY);
}

export const BUILDING_ICON_DRAW = {
  wall: (ctx: Ctx, ox: number) => {
    for (let x = ox + 2; x < ox + 14; x += 3) px(ctx, x, 3, 2, 11, hex(BAMBOO));
    px(ctx, ox + 1, 6, 14, 1, hex(THATCH));
    px(ctx, ox + 1, 11, 14, 1, hex(THATCH));
  },
  roof: (ctx: Ctx, ox: number) => {
    ctx.fillStyle = hex(0x8a8a44);
    ctx.beginPath();
    ctx.moveTo(ox + 1, 11);
    ctx.lineTo(ox + 8, 3);
    ctx.lineTo(ox + 15, 11);
    ctx.closePath();
    ctx.fill();
    px(ctx, ox + 3, 11, 2, 4, hex(BAMBOO));
    px(ctx, ox + 11, 11, 2, 4, hex(BAMBOO));
  },
  chest: (ctx: Ctx, ox: number) => {
    px(ctx, ox + 2, 6, 12, 8, hex(WOOD));
    px(ctx, ox + 2, 4, 12, 3, hex(WOOD_LIGHT));
    px(ctx, ox + 7, 7, 2, 2, hex(BAMBOO));
  },
  collector: (ctx: Ctx, ox: number) => {
    ctx.fillStyle = hex(0x3f7a3a);
    ctx.beginPath();
    ctx.moveTo(ox + 1, 3);
    ctx.lineTo(ox + 15, 3);
    ctx.lineTo(ox + 10, 8);
    ctx.lineTo(ox + 6, 8);
    ctx.closePath();
    ctx.fill();
    px(ctx, ox + 5, 8, 6, 7, hex(BAMBOO));
    px(ctx, ox + 6, 9, 4, 2, hex(0x4f8fa0));
  },
  workbench: (ctx: Ctx, ox: number) => {
    px(ctx, ox + 1, 6, 14, 3, hex(WOOD_LIGHT));
    px(ctx, ox + 2, 9, 2, 6, hex(WOOD));
    px(ctx, ox + 12, 9, 2, 6, hex(WOOD));
    ellipse(ctx, ox + 5, 5, 2, 1.5, hex(0x9aa0a2));
  },
  bed: (ctx: Ctx, ox: number) => {
    px(ctx, ox + 1, 8, 14, 3, hex(BAMBOO));
    px(ctx, ox + 1, 5, 14, 3, hex(THATCH));
    px(ctx, ox + 6, 4, 9, 4, hex(0x8a5a3a));
    ellipse(ctx, ox + 3, 6, 2, 1.5, hex(0xd8c8a0));
  },
  flag: (ctx: Ctx, ox: number) => {
    px(ctx, ox + 4, 2, 2, 13, hex(BAMBOO));
    ctx.fillStyle = hex(0xe6b866);
    ctx.beginPath();
    ctx.moveTo(ox + 6, 2);
    ctx.lineTo(ox + 14, 5);
    ctx.lineTo(ox + 6, 8);
    ctx.closePath();
    ctx.fill();
  },
  rain_water: (ctx: Ctx, ox: number) => {
    px(ctx, ox + 5, 2, 6, 12, hex(BAMBOO));
    px(ctx, ox + 5, 2, 2, 12, hex(BAMBOO_LIGHT));
    ellipse(ctx, ox + 8, 3, 2.5, 1.2, hex(0x9ae0f0));
    px(ctx, ox + 12, 1, 1, 2, hex(0x9ae0f0));
    px(ctx, ox + 2, 4, 1, 2, hex(0x9ae0f0));
  },
} as const;
