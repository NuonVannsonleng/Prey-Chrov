import Phaser from 'phaser';
import { LIGHT_TEXTURE_SIZE, STRUCTURE_FRAME, TEX } from '../textures';
import { mulberry32, randInt } from '../utils/random';
import { createCanvasTexture, ellipse, hex, px, shade, type Ctx } from './canvas';
import { drawPot } from './cooking';
import { BUILDING_FRAMES, drawBuildingStructures } from './building';

/** Icon drawers for M3 items; registered into the shared icon sheet by gathering.ts. */
export const SURVIVAL_ICON_DRAW = {
  stone_axe: (ctx: Ctx, ox: number) => {
    for (let i = 0; i < 11; i++) px(ctx, ox + 4 + i * 0.6, 14 - i, 2, 1, hex(0x7a5a3a));
    ctx.fillStyle = hex(0x6b7173);
    ctx.beginPath();
    ctx.moveTo(ox + 7, 2);
    ctx.lineTo(ox + 14, 3);
    ctx.lineTo(ox + 13, 8);
    ctx.lineTo(ox + 8, 7);
    ctx.closePath();
    ctx.fill();
    px(ctx, ox + 12, 3, 2, 5, hex(0xa9b0b2));
    px(ctx, ox + 7, 5, 3, 2, hex(0xa8a46a));
  },
  stone_pickaxe: (ctx: Ctx, ox: number) => {
    for (let i = 0; i < 11; i++) px(ctx, ox + 7, 4 + i, 2, 1, hex(0x7a5a3a));
    ctx.strokeStyle = hex(0x8e9496);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ox + 2, 7);
    ctx.quadraticCurveTo(ox + 8, 1, ox + 14, 7);
    ctx.stroke();
    px(ctx, ox + 6, 3, 4, 2, hex(0xa8a46a));
  },
  spear: (ctx: Ctx, ox: number) => {
    for (let i = 0; i < 12; i++) px(ctx, ox + 2 + i, 14 - i, 1, 1, hex(0x7a5a3a));
    ctx.fillStyle = hex(0x9aa0a2);
    ctx.beginPath();
    ctx.moveTo(ox + 15, 1);
    ctx.lineTo(ox + 11, 3);
    ctx.lineTo(ox + 13, 5);
    ctx.closePath();
    ctx.fill();
    px(ctx, ox + 11, 4, 2, 1, hex(0xa8a46a));
  },
  torch: (ctx: Ctx, ox: number) => {
    px(ctx, ox + 7, 6, 2, 9, hex(0x6b4a2e));
    px(ctx, ox + 6, 6, 4, 2, hex(0xa8a46a));
    ellipse(ctx, ox + 8, 4, 3, 3.5, hex(0xe8893a));
    ellipse(ctx, ox + 8, 4.5, 1.5, 2, hex(0xffd27a));
  },
  campfire: (ctx: Ctx, ox: number) => {
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2;
      ellipse(ctx, ox + 8 + Math.cos(ang) * 5, 11 + Math.sin(ang) * 2.5, 1.8, 1.4, hex(0x7d8285));
    }
    px(ctx, ox + 4, 9, 8, 2, hex(0x6b4a2e));
    ellipse(ctx, ox + 8, 7, 3, 4, hex(0xe8893a));
    ellipse(ctx, ox + 8, 8, 1.5, 2, hex(0xffd27a));
  },
  shelter: (ctx: Ctx, ox: number) => {
    ctx.fillStyle = hex(0x8aa648);
    ctx.beginPath();
    ctx.moveTo(ox + 1, 14);
    ctx.lineTo(ox + 8, 3);
    ctx.lineTo(ox + 15, 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hex(0x4f7a32);
    ctx.beginPath();
    ctx.moveTo(ox + 3, 14);
    ctx.lineTo(ox + 8, 6);
    ctx.lineTo(ox + 13, 14);
    ctx.closePath();
    ctx.fill();
    px(ctx, ox + 6, 10, 4, 4, hex(0x14181a));
  },
  bamboo_shoot: (ctx: Ctx, ox: number) => {
    ctx.fillStyle = hex(0xc9b77a);
    ctx.beginPath();
    ctx.moveTo(ox + 5, 15);
    ctx.lineTo(ox + 8, 2);
    ctx.lineTo(ox + 11, 15);
    ctx.closePath();
    ctx.fill();
    px(ctx, ox + 6, 11, 4, 1, hex(0x8a7a44));
    px(ctx, ox + 7, 7, 2, 1, hex(0x8a7a44));
    px(ctx, ox + 7, 2, 2, 3, hex(0x7a9a3c));
  },
  roasted_shoot: (ctx: Ctx, ox: number) => {
    ctx.fillStyle = hex(0x9a6a34);
    ctx.beginPath();
    ctx.moveTo(ox + 5, 15);
    ctx.lineTo(ox + 8, 3);
    ctx.lineTo(ox + 11, 15);
    ctx.closePath();
    ctx.fill();
    px(ctx, ox + 6, 11, 4, 1, hex(0x5a3a1a));
    px(ctx, ox + 7, 7, 2, 1, hex(0x5a3a1a));
    px(ctx, ox + 9, 9, 1, 1, hex(0xe6b866));
  },
  meat_raw: (ctx: Ctx, ox: number) => {
    ellipse(ctx, ox + 8, 9, 6, 4.5, hex(0xb2433a));
    ellipse(ctx, ox + 7, 8, 3, 2, hex(0xd9786a));
    px(ctx, ox + 11, 11, 4, 2, hex(0xe8e0cc));
  },
  meat_cooked: (ctx: Ctx, ox: number) => {
    ellipse(ctx, ox + 8, 9, 6, 4.5, hex(0x7a4a2a));
    ellipse(ctx, ox + 7, 8, 3, 2, hex(0xa86a3a));
    px(ctx, ox + 11, 11, 4, 2, hex(0xe8e0cc));
    px(ctx, ox + 5, 6, 1, 1, hex(0xe6b866));
  },
  hide: (ctx: Ctx, ox: number) => {
    ctx.fillStyle = hex(0x6b5048);
    ctx.beginPath();
    ctx.moveTo(ox + 2, 4);
    ctx.lineTo(ox + 14, 3);
    ctx.lineTo(ox + 13, 13);
    ctx.lineTo(ox + 3, 14);
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 6; i++) px(ctx, ox + 4 + i * 1.5, 5 + (i % 3) * 3, 1, 2, hex(0x4a3a30));
  },
  fang: (ctx: Ctx, ox: number) => {
    ctx.fillStyle = hex(0xe8e0cc);
    ctx.beginPath();
    ctx.moveTo(ox + 5, 2);
    ctx.quadraticCurveTo(ox + 13, 6, ox + 9, 14);
    ctx.quadraticCurveTo(ox + 9, 7, ox + 5, 2);
    ctx.fill();
    px(ctx, ox + 5, 2, 3, 2, hex(0x8a7a5a));
  },
  spirit_dust: (ctx: Ctx, ox: number) => {
    for (const [x, y, r] of [
      [8, 8, 4],
      [4, 5, 1.6],
      [12, 4, 1.4],
      [11, 12, 1.8],
    ] as const) ellipse(ctx, ox + x, y, r, r, 'rgba(197,139,224,0.85)');
    ellipse(ctx, ox + 8, 8, 1.5, 1.5, hex(0xffffff));
  },
} as const;

// ---------- Structures ----------

function drawCampfire(ctx: Ctx): void {
  const { x: ox, w, h } = STRUCTURE_FRAME.campfire;
  ellipse(ctx, ox + w / 2, h - 5, 13, 4, 'rgba(0,0,0,0.35)');
  ellipse(ctx, ox + w / 2, h - 7, 9, 3.5, hex(0x1b1410));
  const rng = mulberry32(4242);
  for (let a = 0; a < 9; a++) {
    const ang = (a / 9) * Math.PI * 2;
    ellipse(ctx, ox + w / 2 + Math.cos(ang) * 11, h - 7 + Math.sin(ang) * 4, 3, 2.2, hex(shade(0x7d8285, (rng() - 0.5) * 0.3)));
  }
  ctx.save();
  ctx.translate(ox + w / 2, h - 9);
  for (const rot of [-0.5, 0.5, 0]) {
    ctx.save();
    ctx.rotate(rot);
    px(ctx, -8, -1.5, 16, 3, hex(0x5e4330));
    px(ctx, -8, -1.5, 16, 1, hex(0x7a5a3a));
    ctx.restore();
  }
  ctx.restore();
}

function drawShelter(ctx: Ctx): void {
  const { x: ox, w, h } = STRUCTURE_FRAME.shelter;
  ellipse(ctx, ox + w / 2, h - 5, w / 2 - 2, 6, 'rgba(0,0,0,0.35)');
  // back posts
  px(ctx, ox + 8, 14, 3, h - 18, hex(0x7a9a3c));
  px(ctx, ox + w - 11, 14, 3, h - 18, hex(0x7a9a3c));
  // floor mat
  px(ctx, ox + 10, h - 14, w - 20, 8, hex(0x8a7a44));
  for (let x = ox + 11; x < ox + w - 10; x += 3) px(ctx, x, h - 14, 1, 8, hex(0x6e6236));
  // thatched lean-to roof
  ctx.fillStyle = hex(0x4f7a32);
  ctx.beginPath();
  ctx.moveTo(ox + 2, h - 18);
  ctx.lineTo(ox + 10, 4);
  ctx.lineTo(ox + w - 10, 4);
  ctx.lineTo(ox + w - 2, h - 18);
  ctx.closePath();
  ctx.fill();
  const rng = mulberry32(5151);
  for (let i = 0; i < 90; i++) {
    const t = rng();
    const y = 5 + t * (h - 24);
    const xMin = ox + 10 - (8 * t);
    const xMax = ox + w - 10 + 8 * t;
    px(ctx, xMin + rng() * (xMax - xMin), y, 1, randInt(rng, 3, 6), hex(shade(0x4f7a32, (rng() - 0.3) * 0.5)));
  }
  px(ctx, ox + 9, 3, w - 18, 3, hex(0x8aa648));
  // front posts
  px(ctx, ox + 3, h - 20, 3, 14, hex(0x8aa648));
  px(ctx, ox + w - 6, h - 20, 3, 14, hex(0x8aa648));
}

function generateStructures(scene: Phaser.Scene): void {
  const width = STRUCTURE_FRAME.flag.x + STRUCTURE_FRAME.flag.w;
  const height = Math.max(STRUCTURE_FRAME.campfire.h, STRUCTURE_FRAME.shelter.h);
  const tex = createCanvasTexture(scene, TEX.structures, width, height, (ctx) => {
    ctx.save();
    ctx.translate(0, height - STRUCTURE_FRAME.campfire.h);
    drawCampfire(ctx);
    ctx.restore();
    drawShelter(ctx);
    drawPot(ctx, height);
    drawBuildingStructures(ctx, height);
  });
  const c = STRUCTURE_FRAME.campfire;
  const s = STRUCTURE_FRAME.shelter;
  tex.add('campfire', 0, c.x, height - c.h, c.w, c.h);
  tex.add('shelter', 0, s.x, height - s.h, s.w, s.h);
  const pt = STRUCTURE_FRAME.pot;
  tex.add('pot', 0, pt.x, height - pt.h, pt.w, pt.h);
  for (const key of BUILDING_FRAMES) {
    const f = STRUCTURE_FRAME[key];
    tex.add(key, 0, f.x, height - f.h, f.w, f.h);
  }
}

/** Three flame frames (animated by cycling frames + a flicker tween). */
function generateFlame(scene: Phaser.Scene): void {
  const w = 16;
  const h = 20;
  const tex = createCanvasTexture(scene, TEX.flame, w * 3, h, (ctx) => {
    for (let f = 0; f < 3; f++) {
      const ox = f * w;
      const sway = [-1, 0, 1][f] ?? 0;
      ctx.fillStyle = 'rgba(232,137,58,0.95)';
      ctx.beginPath();
      ctx.moveTo(ox + 2, h - 2);
      ctx.quadraticCurveTo(ox + 1 + sway, h - 12, ox + 8 + sway * 2, 1 + f);
      ctx.quadraticCurveTo(ox + 15 + sway, h - 12, ox + 14, h - 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,210,122,0.95)';
      ctx.beginPath();
      ctx.moveTo(ox + 5, h - 2);
      ctx.quadraticCurveTo(ox + 5 + sway, h - 9, ox + 8 + sway, 7 + f);
      ctx.quadraticCurveTo(ox + 11, h - 9, ox + 11, h - 2);
      ctx.closePath();
      ctx.fill();
    }
  });
  for (let f = 0; f < 3; f++) tex.add(f, 0, f * w, 0, w, h);
}

/** White radial falloff used both to erase darkness and (tinted) as a warm glow. */
function generateLight(scene: Phaser.Scene): void {
  const s = LIGHT_TEXTURE_SIZE;
  createCanvasTexture(scene, TEX.light, s, s, (ctx) => {
    ctx.imageSmoothingEnabled = true;
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

export function generateSurvivalTextures(scene: Phaser.Scene): void {
  generateStructures(scene);
  generateFlame(scene);
  generateLight(scene);
}
