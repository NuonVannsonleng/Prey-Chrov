import Phaser from 'phaser';
import { HERB_FRAME, HERB_SIZE, STRUCTURE_FRAME, TEX } from '../textures';
import { mulberry32, randRange } from '../utils/random';
import { createCanvasTexture, ellipse, hex, px, shade, type Ctx } from './canvas';

// ---------- Herbs (M9): healing leaf and bitter root, each full / picked ----------

function drawHealingLeaf(ctx: Ctx, ox: number, picked: boolean): void {
  const { w, h } = HERB_SIZE;
  const rng = mulberry32(7301);
  ellipse(ctx, ox + w / 2, h - 2, 8, 2.5, 'rgba(0,0,0,0.3)');
  const leaves = picked ? 3 : 7;
  for (let i = 0; i < leaves; i++) {
    const a = -Math.PI / 2 + (i - (leaves - 1) / 2) * 0.42;
    const len = picked ? 4 : randRange(rng, 7, 10);
    const cx = ox + w / 2 + Math.cos(a) * len * 0.6;
    const cy = h - 3 + Math.sin(a) * len * 0.8;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a + Math.PI / 2);
    ellipse(ctx, 0, 0, 2.6, len * 0.55, hex(shade(0x4f9a46, (rng() - 0.5) * 0.25)));
    px(ctx, -0.5, -len * 0.5, 1, len, hex(0x9ad07a, 0.8));
    ctx.restore();
  }
  // pale veined leaves are the identifying mark
  if (!picked) for (let i = 0; i < 4; i++) px(ctx, ox + 6 + rng() * (w - 12), 3 + rng() * 8, 1, 1, hex(0xd8f0b0));
}

function drawBitterRoot(ctx: Ctx, ox: number, picked: boolean): void {
  const { w, h } = HERB_SIZE;
  const rng = mulberry32(7411);
  ellipse(ctx, ox + w / 2, h - 2, 8, 2.5, 'rgba(0,0,0,0.3)');
  // purple stems with jagged dark leaves
  const stems = picked ? 2 : 5;
  for (let i = 0; i < stems; i++) {
    const x = ox + w / 2 + (i - (stems - 1) / 2) * 3;
    const top = picked ? h - 6 : randRange(rng, 3, 7);
    ctx.strokeStyle = hex(0x7a3e6a);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, h - 3);
    ctx.quadraticCurveTo(x + randRange(rng, -3, 3), (top + h) / 2, x + randRange(rng, -2, 2), top);
    ctx.stroke();
    if (!picked) {
      ellipse(ctx, x - 2, top + 2, 2.5, 1.5, hex(0x2f5a34));
      ellipse(ctx, x + 2, top + 4, 2.5, 1.5, hex(0x36633a));
    }
  }
  // exposed knobbly root at the base
  ellipse(ctx, ox + w / 2, h - 3, picked ? 2 : 4, 2, hex(0xa8794a));
}

function generateHerbs(scene: Phaser.Scene): void {
  const { w, h } = HERB_SIZE;
  const tex = createCanvasTexture(scene, TEX.herbs, w * 4, h, (ctx) => {
    drawHealingLeaf(ctx, HERB_FRAME.leafFull * w, false);
    drawHealingLeaf(ctx, HERB_FRAME.leafPicked * w, true);
    drawBitterRoot(ctx, HERB_FRAME.rootFull * w, false);
    drawBitterRoot(ctx, HERB_FRAME.rootPicked * w, true);
  });
  for (let f = 0; f < 4; f++) tex.add(f, 0, f * w, 0, w, h);
}

export function generateCookingTextures(scene: Phaser.Scene): void {
  generateHerbs(scene);
}

// ---------- Cooking pot structure (drawn into TEX.structures by survival.ts) ----------

export function drawPot(ctx: Ctx, baseY: number): void {
  const { x: ox, w } = STRUCTURE_FRAME.pot;
  const cx = ox + w / 2;
  ellipse(ctx, cx, baseY - 3, 12, 3.5, 'rgba(0,0,0,0.35)');
  // three hearth stones and embers
  for (const dx of [-8, 0, 8]) ellipse(ctx, cx + dx, baseY - 4, 3.5, 2.5, hex(0x7d8285));
  ellipse(ctx, cx, baseY - 5, 5, 1.6, hex(0xe8893a, 0.9));
  // clay pot
  ellipse(ctx, cx, baseY - 12, 9, 7, hex(0x8a5236));
  ellipse(ctx, cx - 3, baseY - 14, 3, 3, hex(0xa86a46));
  px(ctx, cx - 7, baseY - 20, 14, 3, hex(0x6e3f2a));
  ellipse(ctx, cx, baseY - 20, 7, 2, hex(0x2c4a3a));
  // steam
  for (let i = 0; i < 3; i++) px(ctx, cx - 3 + i * 3, baseY - 24 - i, 1, 2, hex(0xe8f0ec, 0.5));
}

// ---------- Icons ----------

const tube = (ctx: Ctx, ox: number, water: number | null): void => {
  px(ctx, ox + 5, 2, 6, 12, hex(0x9fbf5a));
  px(ctx, ox + 5, 2, 2, 12, hex(0xc4dc80));
  px(ctx, ox + 5, 8, 6, 1, hex(0x6e8a3a));
  if (water !== null) {
    ellipse(ctx, ox + 8, 3, 2.5, 1.2, hex(water));
  } else ellipse(ctx, ox + 8, 3, 2.5, 1.2, hex(0x2c3a24));
};

const fish = (ctx: Ctx, ox: number, body: number, belly: number): void => {
  ellipse(ctx, ox + 7, 8, 5.5, 3, hex(body));
  ellipse(ctx, ox + 7, 9, 4, 1.5, hex(belly));
  ctx.fillStyle = hex(body);
  ctx.beginPath();
  ctx.moveTo(ox + 12, 8);
  ctx.lineTo(ox + 15, 5);
  ctx.lineTo(ox + 15, 11);
  ctx.closePath();
  ctx.fill();
  px(ctx, ox + 3, 7, 1, 1, hex(0x101010));
};

export const COOKING_ICON_DRAW = {
  fish_raw: (ctx: Ctx, ox: number) => fish(ctx, ox, 0x7a9aa8, 0xc8d8dc),
  fish_cooked: (ctx: Ctx, ox: number) => {
    fish(ctx, ox, 0xa8703e, 0xd8a868);
    for (let i = 0; i < 3; i++) px(ctx, ox + 4 + i * 3, 6, 1, 4, hex(0x5a3a1e));
  },
  fishing_rod: (ctx: Ctx, ox: number) => {
    ctx.strokeStyle = hex(0x9fbf5a);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ox + 2, 14);
    ctx.lineTo(ox + 13, 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(230,230,220,0.85)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(ox + 13, 2);
    ctx.lineTo(ox + 13, 12);
    ctx.stroke();
    px(ctx, ox + 12, 12, 2, 2, hex(0xd9644a));
  },
  tube_empty: (ctx: Ctx, ox: number) => tube(ctx, ox, null),
  tube_water: (ctx: Ctx, ox: number) => tube(ctx, ox, 0x4f8fa0),
  tube_boiled: (ctx: Ctx, ox: number) => {
    tube(ctx, ox, 0x8ad6e0);
    px(ctx, ox + 6, 0, 1, 1, hex(0xffffff, 0.7));
    px(ctx, ox + 9, 0, 1, 1, hex(0xffffff, 0.7));
  },
  healing_leaf: (ctx: Ctx, ox: number) => {
    ctx.save();
    ctx.translate(ox + 8, 8);
    ctx.rotate(-0.6);
    ellipse(ctx, 0, 0, 3.5, 7, hex(0x4f9a46));
    px(ctx, -0.5, -6, 1, 12, hex(0xd8f0b0));
    ctx.restore();
  },
  bitter_root: (ctx: Ctx, ox: number) => {
    ellipse(ctx, ox + 8, 10, 5, 3, hex(0xa8794a));
    ellipse(ctx, ox + 6, 9, 1.5, 1, hex(0xc89a6a));
    px(ctx, ox + 7, 2, 1, 6, hex(0x7a3e6a));
    px(ctx, ox + 9, 3, 1, 5, hex(0x7a3e6a));
    ellipse(ctx, ox + 6, 3, 2, 1.2, hex(0x2f5a34));
  },
  bandage: (ctx: Ctx, ox: number) => {
    ellipse(ctx, ox + 8, 8, 6, 5, hex(0xe8e0c8));
    ellipse(ctx, ox + 8, 8, 2.5, 2, hex(0xb8ac88));
    px(ctx, ox + 12, 9, 3, 2, hex(0xe8e0c8));
    px(ctx, ox + 4, 6, 2, 1, hex(0x4f9a46));
  },
  antidote: (ctx: Ctx, ox: number) => {
    tube(ctx, ox, 0x7ad08a);
    px(ctx, ox + 5, 10, 6, 2, hex(0x7a3e6a));
  },
  stew: (ctx: Ctx, ox: number) => {
    ellipse(ctx, ox + 8, 10, 6.5, 4, hex(0x8a5236));
    ellipse(ctx, ox + 8, 8, 5.5, 2, hex(0xc89a4a));
    px(ctx, ox + 6, 7, 2, 1, hex(0x4f9a46));
    px(ctx, ox + 9, 8, 2, 1, hex(0x9b2f4a));
    px(ctx, ox + 6, 3, 1, 2, hex(0xe8f0ec, 0.6));
    px(ctx, ox + 9, 2, 1, 2, hex(0xe8f0ec, 0.6));
  },
  pot: (ctx: Ctx, ox: number) => {
    ellipse(ctx, ox + 8, 9, 6, 5, hex(0x8a5236));
    px(ctx, ox + 3, 3, 10, 2, hex(0x6e3f2a));
    ellipse(ctx, ox + 6, 8, 2, 2, hex(0xa86a46));
    for (const dx of [-5, 0, 5]) ellipse(ctx, ox + 8 + dx, 14, 2, 1.2, hex(0x7d8285));
  },
} as const;
