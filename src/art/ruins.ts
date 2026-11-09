import Phaser from 'phaser';
import { TEX } from '../textures';
import { mulberry32, randInt } from '../utils/random';
import { createCanvasTexture, ellipse, hex, px, shade, type Ctx } from './canvas';

/** Ruin chest: carved stone coffer; frame 0 closed, 1 open. */
function drawChest(ctx: Ctx, ox: number, open: boolean): void {
  const w = 30;
  const h = 24;
  ellipse(ctx, ox + w / 2, h - 3, 13, 3.5, 'rgba(0,0,0,0.35)');
  const stone = 0x6e7268;
  px(ctx, ox + 3, h - 15, w - 6, 12, hex(stone));
  px(ctx, ox + 3, h - 15, w - 6, 2, hex(shade(stone, 0.25)));
  px(ctx, ox + 3, h - 5, w - 6, 2, hex(shade(stone, -0.3)));
  for (let x = ox + 6; x < ox + w - 6; x += 6) px(ctx, x, h - 11, 3, 3, hex(shade(stone, -0.2)));
  if (open) {
    px(ctx, ox + 5, h - 15, w - 10, 3, hex(0x14181a));
    px(ctx, ox + 2, h - 23, w - 4, 6, hex(shade(stone, 0.1)));
    px(ctx, ox + 2, h - 23, w - 4, 1, hex(shade(stone, 0.3)));
  } else {
    px(ctx, ox + 2, h - 19, w - 4, 5, hex(shade(stone, 0.12)));
    px(ctx, ox + 2, h - 19, w - 4, 1, hex(shade(stone, 0.35)));
    px(ctx, ox + w / 2 - 2, h - 16, 4, 3, hex(0xe6b866));
  }
  const rng = mulberry32(open ? 2 : 1);
  for (let i = 0; i < 5; i++) px(ctx, ox + randInt(rng, 4, w - 6), randInt(rng, h - 16, h - 6), 2, 1, hex(0x4a6a38));
}

/** Key stone tablet: upright carved slab; frame 0 unread (faint turquoise glow), 1 read. */
function drawTablet(ctx: Ctx, ox: number, read: boolean): void {
  const w = 24;
  const h = 34;
  if (!read) {
    const g = ctx.createRadialGradient(ox + w / 2, h / 2, 1, ox + w / 2, h / 2, 16);
    g.addColorStop(0, 'rgba(79,194,180,0.45)');
    g.addColorStop(1, 'rgba(79,194,180,0)');
    ctx.fillStyle = g;
    ctx.fillRect(ox, 0, w, h);
  }
  ellipse(ctx, ox + w / 2, h - 3, 9, 3, 'rgba(0,0,0,0.35)');
  const stone = read ? 0x5d6058 : 0x6e7268;
  ctx.fillStyle = hex(stone);
  ctx.beginPath();
  ctx.moveTo(ox + 4, h - 4);
  ctx.lineTo(ox + 4, 8);
  ctx.quadraticCurveTo(ox + w / 2, 1, ox + w - 4, 8);
  ctx.lineTo(ox + w - 4, h - 4);
  ctx.closePath();
  ctx.fill();
  px(ctx, ox + 5, 8, 2, h - 13, hex(shade(stone, 0.2)));
  // carved script lines (abstract, not real text)
  for (let y = 11; y < h - 8; y += 4) px(ctx, ox + 8, y, w - 16, 1, hex(read ? shade(stone, -0.25) : 0x4fc2b4));
}

function generateChestAndTablet(scene: Phaser.Scene): void {
  const chest = createCanvasTexture(scene, TEX.chest, 60, 24, (ctx) => {
    drawChest(ctx, 0, false);
    drawChest(ctx, 30, true);
  });
  chest.add(0, 0, 0, 0, 30, 24);
  chest.add(1, 0, 30, 0, 30, 24);
  const tablet = createCanvasTexture(scene, TEX.tablet, 48, 34, (ctx) => {
    drawTablet(ctx, 0, false);
    drawTablet(ctx, 24, true);
  });
  tablet.add(0, 0, 0, 0, 24, 34);
  tablet.add(1, 0, 24, 0, 24, 34);
}

function generateRainAndArrow(scene: Phaser.Scene): void {
  createCanvasTexture(scene, TEX.rain, 2, 14, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 14);
    g.addColorStop(0, 'rgba(180,210,220,0)');
    g.addColorStop(1, 'rgba(200,225,235,0.75)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 14);
  });
  createCanvasTexture(scene, TEX.arrow, 24, 24, (ctx) => {
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = 'rgba(230,184,102,0.95)';
    ctx.strokeStyle = 'rgba(7,18,16,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(22, 12);
    ctx.lineTo(4, 3);
    ctx.lineTo(9, 12);
    ctx.lineTo(4, 21);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  });
}

export function generateRuinTextures(scene: Phaser.Scene): void {
  generateChestAndTablet(scene);
  generateRainAndArrow(scene);
}
