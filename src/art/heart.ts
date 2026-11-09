import Phaser from 'phaser';
import { TEX } from '../textures';
import { mulberry32, randRange } from '../utils/random';
import { createCanvasTexture, ellipse, hex, px, shade, type Ctx } from './canvas';

export const HEART_TREE_SIZE = { w: 128, h: 156 } as const;
export const ROOT_SIZE = { w: 36, h: 34 } as const;

/** The Heart Tree: vast trunk with buttress roots and a hollow; frame 1 glows (promise renewed). */
function drawHeartTree(ctx: Ctx, ox: number, restored: boolean): void {
  const { w, h } = HEART_TREE_SIZE;
  const rng = mulberry32(808);
  ellipse(ctx, ox + w / 2, h - 8, 54, 12, 'rgba(0,0,0,0.45)');
  // buttress roots
  ctx.fillStyle = hex(0x3a3028);
  for (const [dx, spread] of [
    [-1, 46],
    [1, 46],
    [-0.4, 30],
    [0.4, 30],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(ox + w / 2 + dx * 8, h - 60);
    ctx.quadraticCurveTo(ox + w / 2 + dx * (spread - 6), h - 34, ox + w / 2 + dx * spread, h - 6);
    ctx.lineTo(ox + w / 2 + dx * (spread - 14), h - 6);
    ctx.quadraticCurveTo(ox + w / 2 + dx * 10, h - 30, ox + w / 2, h - 50);
    ctx.fill();
  }
  // trunk
  px(ctx, ox + w / 2 - 20, 40, 40, h - 70, hex(0x463a30));
  px(ctx, ox + w / 2 - 20, 40, 8, h - 70, hex(0x5a4a3c));
  px(ctx, ox + w / 2 + 12, 40, 8, h - 70, hex(0x30271f));
  for (let i = 0; i < 24; i++) px(ctx, ox + w / 2 - 18 + Math.floor(rng() * 36), 44 + Math.floor(rng() * (h - 80)), 1, 6 + Math.floor(rng() * 8), hex(0x2a221c));
  // hollow with the heart light
  ellipse(ctx, ox + w / 2, h - 58, 9, 13, hex(0x120e0c));
  const glow = ctx.createRadialGradient(ox + w / 2, h - 58, 1, ox + w / 2, h - 58, restored ? 26 : 12);
  glow.addColorStop(0, restored ? 'rgba(160,255,230,0.95)' : 'rgba(79,194,180,0.55)');
  glow.addColorStop(1, 'rgba(79,194,180,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(ox + w / 2 - 30, h - 90, 60, 64);
  // crown (layered canopy, darker when cursed)
  const base = restored ? 0x2f6a3a : 0x1d3a26;
  for (let layer = 0; layer < 4; layer++) {
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2;
      const d = rng() * (46 - layer * 8);
      const r = randRange(rng, 14, 22) - layer * 2;
      ellipse(ctx, ox + w / 2 + Math.cos(a) * d, 40 - layer * 4 + Math.sin(a) * d * 0.55, r, r * 0.8, hex(shade(base, -0.2 + layer * 0.13)));
    }
  }
  if (restored) for (let i = 0; i < 18; i++) px(ctx, ox + w / 2 + randRange(rng, -48, 48), randRange(rng, 6, 60), 2, 2, hex(0xa0ffe6, 0.8));
}

/** Ancient roots: frame 0 a twisted wall, frame 1 withered back from firelight. */
function drawRoots(ctx: Ctx, ox: number, withered: boolean): void {
  const { w, h } = ROOT_SIZE;
  const rng = mulberry32(withered ? 61 : 60);
  ellipse(ctx, ox + w / 2, h - 4, 15, 4, 'rgba(0,0,0,0.35)');
  const count = withered ? 4 : 9;
  for (let i = 0; i < count; i++) {
    const x0 = ox + 4 + rng() * (w - 8);
    const top = withered ? h - 10 - rng() * 4 : 3 + rng() * 10;
    ctx.strokeStyle = hex(shade(0x3a2d22, rng() * 0.3 - 0.15));
    ctx.lineWidth = withered ? 2 : 3 + rng() * 2;
    ctx.beginPath();
    ctx.moveTo(x0, h - 4);
    ctx.bezierCurveTo(x0 + randRange(rng, -10, 10), h - 14, x0 + randRange(rng, -12, 12), top + 8, x0 + randRange(rng, -6, 6), top);
    ctx.stroke();
  }
  if (!withered) for (let i = 0; i < 6; i++) px(ctx, ox + 4 + rng() * (w - 8), 6 + rng() * (h - 14), 2, 1, hex(0x4a6a38));
}

export function generateHeartTextures(scene: Phaser.Scene): void {
  const t = createCanvasTexture(scene, TEX.heartTree, HEART_TREE_SIZE.w * 2, HEART_TREE_SIZE.h, (ctx) => {
    drawHeartTree(ctx, 0, false);
    drawHeartTree(ctx, HEART_TREE_SIZE.w, true);
  });
  t.add(0, 0, 0, 0, HEART_TREE_SIZE.w, HEART_TREE_SIZE.h);
  t.add(1, 0, HEART_TREE_SIZE.w, 0, HEART_TREE_SIZE.w, HEART_TREE_SIZE.h);
  const r = createCanvasTexture(scene, TEX.roots, ROOT_SIZE.w * 2, ROOT_SIZE.h, (ctx) => {
    drawRoots(ctx, 0, false);
    drawRoots(ctx, ROOT_SIZE.w, true);
  });
  r.add(0, 0, 0, 0, ROOT_SIZE.w, ROOT_SIZE.h);
  r.add(1, 0, ROOT_SIZE.w, 0, ROOT_SIZE.w, ROOT_SIZE.h);
}
