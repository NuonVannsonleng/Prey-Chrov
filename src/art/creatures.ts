import Phaser from 'phaser';
import { CREATURE_FRAMES, CREATURE_SPRITES, TEX, type CreatureSprite } from '../textures';
import { mulberry32, randInt } from '../utils/random';
import { createCanvasTexture, ellipse, hex, px, shade, type Ctx } from './canvas';

/**
 * Creature sheets: one row per creature, CREATURE_FRAMES poses each:
 * 0 idle, 1 move A, 2 move B, 3 telegraph (wind-up), 4 attack.
 * Spirits are drawn as restrained spectral shapes (no gore); the Neak Ta shrine is a
 * respectful spirit house.
 */
export const CREATURE_SIZE: Record<CreatureSprite, { w: number; h: number }> = {
  boar: { w: 36, h: 26 },
  snake: { w: 30, h: 16 },
  tiger: { w: 52, h: 30 },
  ap: { w: 28, h: 34 },
  arak: { w: 26, h: 40 },
};

function drawBoar(ctx: Ctx, ox: number, w: number, h: number, pose: number): void {
  const leg = pose === 1 ? 2 : pose === 2 ? -2 : 0;
  const crouch = pose === 3 ? 2 : 0;
  ellipse(ctx, ox + w / 2, h - 3, 14, 3.5, 'rgba(0,0,0,0.35)');
  const base = 0x4a3a30;
  // legs
  px(ctx, ox + 9 + leg, h - 9, 3, 7, hex(0x2a221c));
  px(ctx, ox + 14 - leg, h - 9, 3, 7, hex(0x2a221c));
  px(ctx, ox + 21 + leg, h - 9, 3, 7, hex(0x2a221c));
  px(ctx, ox + 26 - leg, h - 9, 3, 7, hex(0x2a221c));
  // body
  ellipse(ctx, ox + 18, h - 13 + crouch, 13, 7, hex(base));
  ellipse(ctx, ox + 16, h - 16 + crouch, 10, 4, hex(shade(base, 0.2)));
  // bristly back
  for (let x = 8; x < 26; x += 2) px(ctx, ox + x, h - 21 + crouch + (x % 4 === 0 ? 0 : 1), 1, 3, hex(0x1f1813));
  // head + snout + tusk (faces right)
  ellipse(ctx, ox + 29, h - 13 + crouch, 6, 5, hex(shade(base, -0.05)));
  px(ctx, ox + 33, h - 13 + crouch, 3, 3, hex(0x6b5048));
  px(ctx, ox + 32, h - 10 + crouch, 2, 2, hex(0xe8e0cc));
  px(ctx, ox + 29, h - 16 + crouch, 1, 1, hex(pose === 3 ? 0xd9644a : 0x0d0b0a));
  if (pose === 4) for (let i = 0; i < 3; i++) px(ctx, ox + 1 + i * 3, h - 12 - i, 3, 1, 'rgba(230,220,200,0.6)');
}

function drawSnake(ctx: Ctx, ox: number, w: number, h: number, pose: number): void {
  ellipse(ctx, ox + w / 2, h - 2, 12, 2.5, 'rgba(0,0,0,0.3)');
  const color = 0x5a6b2a;
  const wave = pose === 1 ? 1 : pose === 2 ? -1 : 0;
  for (let i = 0; i < 20; i++) {
    const x = ox + 3 + i;
    const y = h - 5 + Math.sin(i * 0.7 + wave) * 2;
    px(ctx, x, y, 2, 3, hex(i % 3 === 0 ? shade(color, -0.3) : color));
  }
  const lift = pose === 3 ? -5 : pose === 4 ? -3 : 0;
  const headX = pose === 4 ? ox + 26 : ox + 23;
  ellipse(ctx, headX, h - 5 + lift, 3, 2.4, hex(shade(color, 0.15)));
  px(ctx, headX + 1, h - 6 + lift, 1, 1, hex(0xe6b866));
  if (pose >= 3) px(ctx, headX + 3, h - 5 + lift, 3, 1, hex(0xb2432f));
}

function drawTiger(ctx: Ctx, ox: number, w: number, h: number, pose: number): void {
  const leg = pose === 1 ? 3 : pose === 2 ? -3 : 0;
  const crouch = pose === 3 ? 3 : 0;
  ellipse(ctx, ox + w / 2, h - 3, 20, 4, 'rgba(0,0,0,0.35)');
  const fur = 0xc77a2e;
  for (const lx of [11, 17, 31, 37]) px(ctx, ox + lx + (lx < 25 ? leg : -leg), h - 10, 4, 8, hex(shade(fur, -0.15)));
  ellipse(ctx, ox + 24, h - 14 + crouch, 17, 7, hex(fur));
  ellipse(ctx, ox + 22, h - 10 + crouch, 13, 3, hex(0xe8dcc0));
  for (let x = 12; x < 36; x += 4) px(ctx, ox + x, h - 20 + crouch, 2, 7, hex(0x2a1c12));
  // tail
  for (let i = 0; i < 8; i++) px(ctx, ox + 6 - i * 0.6, h - 18 + crouch - Math.sin(i / 2) * 3, 2, 2, hex(i % 2 ? 0x2a1c12 : fur));
  // head
  ellipse(ctx, ox + 42, h - 16 + crouch, 7, 6, hex(fur));
  px(ctx, ox + 39, h - 23 + crouch, 3, 3, hex(fur));
  px(ctx, ox + 45, h - 23 + crouch, 3, 3, hex(fur));
  px(ctx, ox + 46, h - 14 + crouch, 3, 3, hex(0xe8dcc0));
  px(ctx, ox + 43, h - 18 + crouch, 1, 1, hex(pose >= 3 ? 0xe6b866 : 0x0d0b0a));
  for (let i = 0; i < 3; i++) px(ctx, ox + 38 + i * 2, h - 21 + crouch, 1, 4, hex(0x2a1c12));
  if (pose === 4) for (let i = 0; i < 3; i++) px(ctx, ox + 49, h - 20 + i * 4, 3, 1, 'rgba(255,255,255,0.7)');
}

function drawAp(ctx: Ctx, ox: number, w: number, h: number, pose: number): void {
  const bob = pose === 1 ? -1 : pose === 2 ? 1 : 0;
  // glow
  const g = ctx.createRadialGradient(ox + w / 2, 12 + bob, 1, ox + w / 2, 12 + bob, 14);
  g.addColorStop(0, pose >= 3 ? 'rgba(255,140,120,0.55)' : 'rgba(160,255,220,0.45)');
  g.addColorStop(1, 'rgba(160,255,220,0)');
  ctx.fillStyle = g;
  ctx.fillRect(ox, 0, w, 28);
  // pale face with long dark hair, trailing faint wisps (no gore)
  ellipse(ctx, ox + w / 2, 12 + bob, 6, 7, hex(0xd8d2c0));
  ctx.fillStyle = hex(0x0d0b0a);
  ctx.beginPath();
  ctx.moveTo(ox + w / 2 - 8, 9 + bob);
  ctx.quadraticCurveTo(ox + w / 2, -2 + bob, ox + w / 2 + 8, 9 + bob);
  ctx.lineTo(ox + w / 2 + 6, 22 + bob);
  ctx.lineTo(ox + w / 2 - 6, 22 + bob);
  ctx.closePath();
  ctx.fill();
  ellipse(ctx, ox + w / 2, 13 + bob, 4.5, 5.5, hex(0xd8d2c0));
  px(ctx, ox + w / 2 - 3, 12 + bob, 2, 1, hex(pose >= 3 ? 0xd9644a : 0x4fc2b4));
  px(ctx, ox + w / 2 + 1, 12 + bob, 2, 1, hex(pose >= 3 ? 0xd9644a : 0x4fc2b4));
  ctx.strokeStyle = 'rgba(160,255,220,0.5)';
  ctx.lineWidth = 1;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(ox + w / 2 + i * 3, 21 + bob);
    ctx.quadraticCurveTo(ox + w / 2 + i * 5 + (pose === 1 ? 2 : -2), 28 + bob, ox + w / 2 + i * 2, h - 1);
    ctx.stroke();
  }
}

function drawArak(ctx: Ctx, ox: number, w: number, h: number, pose: number): void {
  const sway = pose === 1 ? 1 : pose === 2 ? -1 : 0;
  ellipse(ctx, ox + w / 2, h - 3, 9, 2.5, 'rgba(0,0,0,0.35)');
  // tattered shadow robe
  ctx.fillStyle = 'rgba(20,16,30,0.92)';
  ctx.beginPath();
  ctx.moveTo(ox + w / 2, 4);
  ctx.quadraticCurveTo(ox + w / 2 + 10 + sway, 16, ox + w / 2 + 9 + sway, h - 4);
  for (let x = 8; x >= -8; x -= 4) ctx.lineTo(ox + w / 2 + x + sway, h - 4 - (x % 8 === 0 ? 0 : 4));
  ctx.quadraticCurveTo(ox + w / 2 - 10 + sway, 16, ox + w / 2, 4);
  ctx.fill();
  // hood + eyes
  ellipse(ctx, ox + w / 2, 10, 6, 6, hex(0x0d0a14));
  const eye = pose >= 3 ? 0xc58be0 : 0x8e7ab0;
  px(ctx, ox + w / 2 - 3, 10, 2, 1, hex(eye));
  px(ctx, ox + w / 2 + 1, 10, 2, 1, hex(eye));
  if (pose >= 3) {
    const g = ctx.createRadialGradient(ox + w - 4, 18, 0, ox + w - 4, 18, 6);
    g.addColorStop(0, 'rgba(197,139,224,0.9)');
    g.addColorStop(1, 'rgba(197,139,224,0)');
    ctx.fillStyle = g;
    ctx.fillRect(ox + w - 10, 12, 10, 12);
  }
}

const DRAW: Record<CreatureSprite, (ctx: Ctx, ox: number, w: number, h: number, pose: number) => void> = {
  boar: drawBoar,
  snake: drawSnake,
  tiger: drawTiger,
  ap: drawAp,
  arak: drawArak,
};

function generateCreatures(scene: Phaser.Scene): void {
  const maxW = Math.max(...CREATURE_SPRITES.map((k) => CREATURE_SIZE[k].w));
  const maxH = Math.max(...CREATURE_SPRITES.map((k) => CREATURE_SIZE[k].h));
  const tex = createCanvasTexture(scene, TEX.creatures, maxW * CREATURE_FRAMES, maxH * CREATURE_SPRITES.length, (ctx) => {
    CREATURE_SPRITES.forEach((key, row) => {
      const { w, h } = CREATURE_SIZE[key];
      for (let f = 0; f < CREATURE_FRAMES; f++) {
        ctx.save();
        ctx.translate(f * maxW, row * maxH + (maxH - h));
        DRAW[key](ctx, 0, w, h, f);
        ctx.restore();
      }
    });
  });
  CREATURE_SPRITES.forEach((key, row) => {
    const { w, h } = CREATURE_SIZE[key];
    for (let f = 0; f < CREATURE_FRAMES; f++) tex.add(`${key}-${f}`, 0, f * maxW, row * maxH + (maxH - h), w, h);
  });
}

/** Neak Ta spirit house: small raised wooden shrine with a tiered roof, flowers and incense. */
function generateShrine(scene: Phaser.Scene): void {
  const w = 36;
  const h = 52;
  createCanvasTexture(scene, TEX.shrine, w * 2, h, (ctx) => {
    for (let f = 0; f < 2; f++) {
      const ox = f * w;
      ellipse(ctx, ox + w / 2, h - 3, 12, 3.5, 'rgba(0,0,0,0.35)');
      px(ctx, ox + w / 2 - 2, h - 22, 4, 20, hex(0x6b4a2e));
      px(ctx, ox + w / 2 - 9, h - 26, 18, 4, hex(0x7a5a3a));
      px(ctx, ox + w / 2 - 8, h - 38, 16, 12, hex(0xb08a5a));
      px(ctx, ox + w / 2 - 3, h - 35, 6, 9, hex(0x2a1c12));
      // tiered roof
      ctx.fillStyle = hex(0x8a2f24);
      ctx.beginPath();
      ctx.moveTo(ox + w / 2 - 12, h - 37);
      ctx.lineTo(ox + w / 2, h - 50);
      ctx.lineTo(ox + w / 2 + 12, h - 37);
      ctx.closePath();
      ctx.fill();
      px(ctx, ox + w / 2 - 12, h - 38, 24, 2, hex(0xe6b866));
      px(ctx, ox + w / 2 - 1, h - 52, 2, 3, hex(0xe6b866));
      // offerings: marigold dots, incense with smoke (frame 1 = recently honoured, more flowers)
      const rng = mulberry32(3 + f);
      for (let i = 0; i < (f ? 7 : 3); i++) px(ctx, ox + w / 2 - 7 + randInt(rng, 0, 14), h - 28, 2, 2, hex(i % 2 ? 0xe8a33a : 0xf2d06b));
      px(ctx, ox + w / 2 + 5, h - 33, 1, 6, hex(0x9a7a5a));
      ctx.fillStyle = 'rgba(220,220,220,0.35)';
      ctx.fillRect(ox + w / 2 + 5, h - 41, 1, 7);
    }
  });
  scene.textures.get(TEX.shrine).add(0, 0, 0, 0, w, h);
  scene.textures.get(TEX.shrine).add(1, 0, w, 0, w, h);
}

function generateOrb(scene: Phaser.Scene): void {
  createCanvasTexture(scene, TEX.orb, 14, 14, (ctx) => {
    ctx.imageSmoothingEnabled = true;
    const g = ctx.createRadialGradient(7, 7, 0, 7, 7, 7);
    g.addColorStop(0, 'rgba(255,240,255,1)');
    g.addColorStop(0.35, 'rgba(197,139,224,0.95)');
    g.addColorStop(1, 'rgba(120,60,160,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 14, 14);
  });
}

/** Small 12×12 status icons: poison (green drop), blessing (gold lotus), spirit ward (teal ring). */
function generateStatusIcons(scene: Phaser.Scene): void {
  const tex = createCanvasTexture(scene, TEX.status, 36, 12, (ctx) => {
    ctx.fillStyle = hex(0x6fbf4a);
    ctx.beginPath();
    ctx.moveTo(6, 1);
    ctx.quadraticCurveTo(11, 7, 6, 11);
    ctx.quadraticCurveTo(1, 7, 6, 1);
    ctx.fill();
    for (const [x, y] of [
      [18, 3],
      [15, 6],
      [21, 6],
    ] as const) ellipse(ctx, x, y + 2, 2.4, 3.2, hex(0xe6b866));
    px(ctx, 14, 9, 9, 2, hex(0x8ec26a));
    ctx.strokeStyle = hex(0x4fc2b4);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(30, 6, 4, 0, Math.PI * 2);
    ctx.stroke();
  });
  tex.add('poison', 0, 0, 0, 12, 12);
  tex.add('blessing', 0, 12, 0, 12, 12);
  tex.add('ward', 0, 24, 0, 12, 12);
}

export function generateCreatureTextures(scene: Phaser.Scene): void {
  generateCreatures(scene);
  generateShrine(scene);
  generateOrb(scene);
  generateStatusIcons(scene);
}
