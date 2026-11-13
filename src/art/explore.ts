import Phaser from 'phaser';
import { TEX } from '../textures';
import { mulberry32, randRange } from '../utils/random';
import { createCanvasTexture, ellipse, hex, px, shade, type Ctx } from './canvas';

/** M13: ruin puzzle parts (lamps, plates, traps, reliquary, glyph stone, secret cache, stepping stones) and landmarks. */
export const PART_W = 32;
export const PART_H = 40;
export const RUIN_PART_FRAMES = [
  'lamp_sun_off',
  'lamp_sun_on',
  'lamp_moon_off',
  'lamp_moon_on',
  'lamp_water_off',
  'lamp_water_on',
  'plate_up',
  'plate_down',
  'trap_down',
  'trap_warn',
  'trap_up',
  'reliquary_closed',
  'reliquary_open',
  'glyph',
  'secret',
  'secret_found',
  'stones',
] as const;
export type RuinPartFrame = (typeof RUIN_PART_FRAMES)[number];

const STONE = 0x6e7268;

function symbol(ctx: Ctx, cx: number, cy: number, s: 'sun' | 'moon' | 'water', color: string): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  if (s === 'sun') {
    ellipse(ctx, cx, cy, 2.5, 2.5, color);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      px(ctx, cx + Math.cos(a) * 4.5 - 0.5, cy + Math.sin(a) * 4.5 - 0.5, 1.5, 1.5, color);
    }
  } else if (s === 'moon') {
    ctx.beginPath();
    ctx.arc(cx, cy, 4, Math.PI * 0.35, Math.PI * 1.65);
    ctx.arc(cx + 2, cy, 3, Math.PI * 1.55, Math.PI * 0.45, true);
    ctx.fill();
  } else {
    for (let r = 0; r < 2; r++) {
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy - 1 + r * 4);
      ctx.quadraticCurveTo(cx - 2.5, cy - 4 + r * 4, cx, cy - 1 + r * 4);
      ctx.quadraticCurveTo(cx + 2.5, cy + 2 + r * 4, cx + 5, cy - 1 + r * 4);
      ctx.stroke();
    }
  }
}

function drawLamp(ctx: Ctx, ox: number, s: 'sun' | 'moon' | 'water', lit: boolean): void {
  const cx = ox + PART_W / 2;
  const b = PART_H - 3;
  ellipse(ctx, cx, b, 9, 3, 'rgba(0,0,0,0.35)');
  px(ctx, cx - 7, b - 20, 14, 20, hex(STONE));
  px(ctx, cx - 7, b - 20, 3, 20, hex(shade(STONE, 0.15)));
  px(ctx, cx - 9, b - 23, 18, 4, hex(shade(STONE, 0.1)));
  symbol(ctx, cx, b - 11, s, lit ? '#ffd27a' : hex(shade(STONE, -0.35)));
  // bowl and flame
  ellipse(ctx, cx, b - 25, 7, 3, hex(shade(STONE, -0.2)));
  if (lit) {
    const g = ctx.createRadialGradient(cx, b - 30, 1, cx, b - 30, 10);
    g.addColorStop(0, 'rgba(255,220,140,0.95)');
    g.addColorStop(1, 'rgba(232,137,58,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - 10, b - 40, 20, 18);
    ellipse(ctx, cx, b - 30, 2.5, 5, '#ffd27a');
  }
}

function drawPlate(ctx: Ctx, ox: number, down: boolean): void {
  const cx = ox + PART_W / 2;
  const b = PART_H - 6;
  px(ctx, cx - 12, b - 8, 24, 10, hex(shade(STONE, -0.25)));
  px(ctx, cx - 10, b - (down ? 6 : 8), 20, down ? 6 : 8, hex(down ? 0x4fc2b4 : shade(STONE, 0.05)));
  px(ctx, cx - 10, b - (down ? 6 : 8), 20, 1, hex(down ? 0xa0ffe6 : shade(STONE, 0.25)));
  symbol(ctx, cx, b - (down ? 3 : 4), 'sun', down ? '#e6fff8' : hex(shade(STONE, -0.3)));
}

function drawTrap(ctx: Ctx, ox: number, phase: 'down' | 'warn' | 'up'): void {
  const cx = ox + PART_W / 2;
  const b = PART_H - 6;
  px(ctx, cx - 13, b - 8, 26, 10, hex(shade(STONE, -0.3)));
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) px(ctx, cx - 10 + i * 6, b - 6 + j * 4, 2, 2, hex(0x1a1c1a));
  if (phase === 'warn') for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) px(ctx, cx - 10 + i * 6, b - 7 + j * 4, 2, 2, hex(0xd8dcdc));
  if (phase === 'up') {
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 2; j++) {
        ctx.fillStyle = hex(0xb8bcbc);
        ctx.beginPath();
        ctx.moveTo(cx - 11 + i * 6, b - 5 + j * 4);
        ctx.lineTo(cx - 9 + i * 6, b - 17 + j * 4);
        ctx.lineTo(cx - 7 + i * 6, b - 5 + j * 4);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
}

function drawReliquary(ctx: Ctx, ox: number, open: boolean): void {
  const cx = ox + PART_W / 2;
  const b = PART_H - 3;
  ellipse(ctx, cx, b, 12, 3, 'rgba(0,0,0,0.35)');
  px(ctx, cx - 11, b - 14, 22, 14, hex(shade(STONE, -0.05)));
  for (let x = cx - 9; x < cx + 10; x += 6) px(ctx, x, b - 12, 1, 10, hex(shade(STONE, -0.3)));
  if (open) {
    px(ctx, cx - 12, b - 24, 24, 5, hex(shade(STONE, 0.1)));
    ellipse(ctx, cx, b - 15, 7, 2, '#ffd27a');
  } else {
    px(ctx, cx - 12, b - 18, 24, 5, hex(shade(STONE, 0.1)));
    symbol(ctx, cx, b - 8, 'sun', '#4fc2b4');
  }
}

function drawGlyph(ctx: Ctx, ox: number): void {
  const cx = ox + PART_W / 2;
  const b = PART_H - 3;
  ellipse(ctx, cx, b, 10, 3, 'rgba(0,0,0,0.35)');
  px(ctx, cx - 9, b - 26, 18, 26, hex(shade(STONE, 0.05)));
  px(ctx, cx - 9, b - 26, 18, 2, hex(shade(STONE, 0.25)));
  for (let i = 0; i < 3; i++) px(ctx, cx - 6, b - 21 + i * 7, 12, 4, hex(shade(STONE, -0.3)));
}

function drawSecret(ctx: Ctx, ox: number, found: boolean): void {
  const cx = ox + PART_W / 2;
  const b = PART_H - 3;
  px(ctx, cx - 13, b - 22, 26, 22, hex(shade(STONE, -0.08)));
  for (let i = 0; i < 3; i++) px(ctx, cx - 13, b - 16 + i * 7, 26, 1, hex(shade(STONE, -0.35)));
  if (found) {
    px(ctx, cx - 4, b - 14, 8, 6, hex(0x1a1c1a));
  } else {
    ctx.strokeStyle = hex(shade(STONE, -0.45));
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 3, b - 20);
    ctx.lineTo(cx + 1, b - 14);
    ctx.lineTo(cx - 2, b - 9);
    ctx.lineTo(cx + 3, b - 4);
    ctx.stroke();
  }
}

function drawStones(ctx: Ctx, ox: number): void {
  const rng = mulberry32(911);
  for (let i = 0; i < 3; i++) {
    const x = ox + 6 + i * 9 + randRange(rng, -2, 2);
    const y = 12 + i * 8 + randRange(rng, -2, 2);
    ellipse(ctx, x, y + 2, 6, 3, 'rgba(0,0,0,0.25)');
    ellipse(ctx, x, y, 6, 4, hex(shade(STONE, rng() * 0.2 - 0.1)));
    ellipse(ctx, x - 1, y - 1, 3, 2, hex(shade(STONE, 0.25)));
  }
}

export const LANDMARK_SIZE = { w: 112, h: 120 } as const;
export const LANDMARK_FRAMES = ['great_fig', 'termite_mound', 'split_boulder', 'honey_tree', 'old_oxcart'] as const;

function drawFig(ctx: Ctx, ox: number): void {
  const { w, h } = LANDMARK_SIZE;
  const rng = mulberry32(5150);
  ellipse(ctx, ox + w / 2, h - 6, 46, 9, 'rgba(0,0,0,0.4)');
  // web of aerial roots
  for (let i = 0; i < 16; i++) {
    const x0 = ox + w / 2 + randRange(rng, -30, 30);
    ctx.strokeStyle = hex(shade(0x5e4a38, rng() * 0.3 - 0.15));
    ctx.lineWidth = 2 + rng() * 2;
    ctx.beginPath();
    ctx.moveTo(x0, 40);
    ctx.bezierCurveTo(x0 + randRange(rng, -14, 14), 70, x0 + randRange(rng, -20, 20), h - 30, x0 + randRange(rng, -26, 26), h - 6);
    ctx.stroke();
  }
  ellipse(ctx, ox + w / 2, h - 34, 6, 9, hex(0x120e0c));
  for (let layer = 0; layer < 3; layer++)
    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2;
      const d = rng() * (40 - layer * 8);
      ellipse(ctx, ox + w / 2 + Math.cos(a) * d, 30 - layer * 4 + Math.sin(a) * d * 0.5, 16 - layer * 2, 12, hex(shade(0x2f5a2e, -0.15 + layer * 0.12)));
    }
}

function drawMound(ctx: Ctx, ox: number): void {
  const { w, h } = LANDMARK_SIZE;
  ellipse(ctx, ox + w / 2, h - 6, 26, 6, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = hex(0xa0683c);
  ctx.beginPath();
  ctx.moveTo(ox + w / 2 - 24, h - 6);
  ctx.quadraticCurveTo(ox + w / 2 - 14, h - 50, ox + w / 2 - 4, h - 92);
  ctx.lineTo(ox + w / 2 + 4, h - 96);
  ctx.quadraticCurveTo(ox + w / 2 + 12, h - 50, ox + w / 2 + 24, h - 6);
  ctx.closePath();
  ctx.fill();
  const rng = mulberry32(77);
  for (let i = 0; i < 40; i++) px(ctx, ox + w / 2 + randRange(rng, -16, 16), h - 10 - rng() * 70, 2, 3, hex(shade(0xa0683c, rng() * 0.4 - 0.2)));
  ctx.fillStyle = hex(0xb87a48);
  ctx.beginPath();
  ctx.moveTo(ox + w / 2 + 10, h - 30);
  ctx.quadraticCurveTo(ox + w / 2 + 20, h - 50, ox + w / 2 + 16, h - 66);
  ctx.lineTo(ox + w / 2 + 12, h - 30);
  ctx.closePath();
  ctx.fill();
}

function drawSplitBoulder(ctx: Ctx, ox: number): void {
  const { w, h } = LANDMARK_SIZE;
  ellipse(ctx, ox + w / 2, h - 6, 42, 8, 'rgba(0,0,0,0.4)');
  for (const [dx, tilt] of [
    [-14, -0.08],
    [14, 0.08],
  ] as const) {
    ctx.save();
    ctx.translate(ox + w / 2 + dx, h - 8);
    ctx.rotate(tilt);
    ctx.fillStyle = hex(0x7d8285);
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.quadraticCurveTo(-26, -40, -6 * Math.sign(dx), -56);
    ctx.lineTo(dx > 0 ? -4 : 4, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // scorched crack and new growth
  px(ctx, ox + w / 2 - 2, h - 60, 4, 54, hex(0x1a1c1a));
  for (let i = 0; i < 5; i++) ellipse(ctx, ox + w / 2 - 6 + i * 3, h - 10, 3, 2, hex(0x4f9a46));
}

/** M17: a tall pale forest tree with wild combs hanging from its branches. */
function drawHoneyTree(ctx: Ctx, ox: number): void {
  const { w, h } = LANDMARK_SIZE;
  const cx = ox + w / 2;
  ellipse(ctx, cx, h - 6, 24, 6, 'rgba(0,0,0,0.4)');
  // buttressed pale trunk
  ctx.fillStyle = hex(0xcfc6b0);
  ctx.beginPath();
  ctx.moveTo(cx - 16, h - 6);
  ctx.quadraticCurveTo(cx - 7, h - 30, cx - 6, h - 96);
  ctx.lineTo(cx + 6, h - 96);
  ctx.quadraticCurveTo(cx + 7, h - 30, cx + 16, h - 6);
  ctx.closePath();
  ctx.fill();
  px(ctx, cx + 2, h - 92, 3, 84, hex(0xa89f88));
  // branches
  ctx.strokeStyle = hex(0xb9b098);
  ctx.lineWidth = 4;
  for (const [dx, dy] of [[-34, -100], [32, -104], [-24, -84], [26, -80]] as const) {
    ctx.beginPath();
    ctx.moveTo(cx, h - 88);
    ctx.lineTo(cx + dx, h + dy);
    ctx.stroke();
  }
  const rng = mulberry32(4411);
  for (let i = 0; i < 14; i++) ellipse(ctx, cx + randRange(rng, -44, 44), randRange(rng, 6, 26), 13, 9, hex(shade(0x3c6a33, rng() * 0.3 - 0.15)));
  // hanging combs
  for (const [dx, y, s] of [[-24, h - 82, 1], [20, h - 76, 0.8], [-12, h - 70, 0.7]] as const) {
    ctx.fillStyle = hex(0x6b4a1e);
    ctx.beginPath();
    ctx.ellipse(cx + dx, y, 7 * s, 12 * s, 0, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = hex(0xd9a441);
    ctx.beginPath();
    ctx.ellipse(cx + dx, y + 2, 4 * s, 7 * s, 0, 0, Math.PI);
    ctx.fill();
  }
  for (let i = 0; i < 10; i++) px(ctx, cx + randRange(rng, -36, 30), h - randRange(rng, 64, 96), 2, 2, hex(0x2a2015));
}

/** M17: a broken wooden ox-cart, one wheel fallen, half taken by vines. */
function drawOxcart(ctx: Ctx, ox: number): void {
  const { w, h } = LANDMARK_SIZE;
  const cx = ox + w / 2;
  ellipse(ctx, cx, h - 6, 46, 8, 'rgba(0,0,0,0.4)');
  // shafts resting on the ground
  ctx.strokeStyle = hex(0x6a4a2c);
  ctx.lineWidth = 3;
  for (const dy of [-2, 4]) {
    ctx.beginPath();
    ctx.moveTo(cx - 10, h - 30 + dy);
    ctx.lineTo(cx - 50, h - 8 + dy);
    ctx.stroke();
  }
  // tilted cart bed
  ctx.save();
  ctx.translate(cx + 4, h - 32);
  ctx.rotate(0.12);
  for (let i = 0; i < 5; i++) px(ctx, -26, -14 + i * 5, 54, 4, hex(shade(0x7a5634, (i % 2) * 0.08 - 0.04)));
  px(ctx, -28, -20, 4, 30, hex(0x5c3f24));
  px(ctx, 26, -20, 4, 30, hex(0x5c3f24));
  ctx.restore();
  // standing wheel (spoked) and fallen wheel
  const wheel = (x: number, y: number, rx: number, ry: number) => {
    ctx.strokeStyle = hex(0x4e3520);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * rx, y + Math.sin(a) * ry);
      ctx.stroke();
    }
    ellipse(ctx, x, y, 3, 3, hex(0x3a2716));
  };
  wheel(cx + 14, h - 22, 16, 16);
  wheel(cx + 34, h - 8, 16, 5);
  // vines
  const rng = mulberry32(3131);
  for (let i = 0; i < 18; i++) ellipse(ctx, cx + randRange(rng, -30, 36), h - randRange(rng, 8, 44), 3, 2, hex(shade(0x4f8a3e, rng() * 0.3 - 0.15)));
}

export function generateExploreTextures(scene: Phaser.Scene): void {
  const tex = createCanvasTexture(scene, TEX.ruinParts, PART_W * RUIN_PART_FRAMES.length, PART_H, (ctx) => {
    RUIN_PART_FRAMES.forEach((f, i) => {
      const ox = i * PART_W;
      if (f.startsWith('lamp_')) {
        const [, s, st] = f.split('_') as [string, 'sun' | 'moon' | 'water', string];
        drawLamp(ctx, ox, s, st === 'on');
      } else if (f.startsWith('plate_')) drawPlate(ctx, ox, f === 'plate_down');
      else if (f.startsWith('trap_')) drawTrap(ctx, ox, f.slice(5) as 'down' | 'warn' | 'up');
      else if (f.startsWith('reliquary_')) drawReliquary(ctx, ox, f === 'reliquary_open');
      else if (f === 'glyph') drawGlyph(ctx, ox);
      else if (f.startsWith('secret')) drawSecret(ctx, ox, f === 'secret_found');
      else drawStones(ctx, ox);
    });
  });
  RUIN_PART_FRAMES.forEach((f, i) => tex.add(f, 0, i * PART_W, 0, PART_W, PART_H));
  const lm = createCanvasTexture(scene, TEX.landmarks, LANDMARK_SIZE.w * LANDMARK_FRAMES.length, LANDMARK_SIZE.h, (ctx) => {
    drawFig(ctx, 0);
    drawMound(ctx, LANDMARK_SIZE.w);
    drawSplitBoulder(ctx, LANDMARK_SIZE.w * 2);
    drawHoneyTree(ctx, LANDMARK_SIZE.w * 3);
    drawOxcart(ctx, LANDMARK_SIZE.w * 4);
  });
  LANDMARK_FRAMES.forEach((f, i) => lm.add(f, 0, i * LANDMARK_SIZE.w, 0, LANDMARK_SIZE.w, LANDMARK_SIZE.h));
}

/** Icons for the compass and navigation notes. */
export const EXPLORE_ICON_DRAW = {
  compass: (ctx: Ctx, ox: number) => {
    ellipse(ctx, ox + 8, 8, 6.5, 6.5, hex(0x84603c));
    ellipse(ctx, ox + 8, 8, 5, 5, hex(0xe8e0c8));
    ctx.fillStyle = hex(0xd9644a);
    ctx.beginPath();
    ctx.moveTo(ox + 8, 3);
    ctx.lineTo(ox + 10, 8);
    ctx.lineTo(ox + 6, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hex(0x4b6a5c);
    ctx.beginPath();
    ctx.moveTo(ox + 8, 13);
    ctx.lineTo(ox + 10, 8);
    ctx.lineTo(ox + 6, 8);
    ctx.closePath();
    ctx.fill();
  },
  nav_note: (ctx: Ctx, ox: number) => {
    px(ctx, ox + 3, 2, 10, 12, hex(0x6fb05a));
    px(ctx, ox + 3, 2, 10, 1, hex(0x9ad07a));
    for (let i = 0; i < 4; i++) px(ctx, ox + 5, 5 + i * 2, 6 - (i % 2) * 2, 1, hex(0x2c4a2a));
  },
  lantern: (ctx: Ctx, ox: number) => {
    px(ctx, ox + 5, 3, 6, 11, hex(0x9fbf5a));
    px(ctx, ox + 4, 2, 8, 2, hex(0x6e8a3a));
    px(ctx, ox + 4, 13, 8, 2, hex(0x6e8a3a));
    ellipse(ctx, ox + 8, 8, 2.5, 3.5, '#ffd27a');
    ellipse(ctx, ox + 8, 8, 1.2, 1.8, '#fff2c8');
    px(ctx, ox + 7, 0, 2, 2, hex(0x84603c));
  },
  trail_sign: (ctx: Ctx, ox: number) => {
    px(ctx, ox + 7, 4, 2, 11, hex(0x84603c));
    ctx.fillStyle = hex(0xa87048);
    ctx.beginPath();
    ctx.moveTo(ox + 2, 4);
    ctx.lineTo(ox + 12, 4);
    ctx.lineTo(ox + 15, 6.5);
    ctx.lineTo(ox + 12, 9);
    ctx.lineTo(ox + 2, 9);
    ctx.closePath();
    ctx.fill();
  },
} as const;
