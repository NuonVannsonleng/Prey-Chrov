import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, TILE_SIZE } from '../config';
import {
  CANOPY_SIZE,
  CANOPY_VARIANTS,
  FERN_SIZE,
  FERN_VARIANTS,
  PLAYER_DIRS,
  PLAYER_FRAME,
  PLAYER_POSES,
  ROCK_SIZE,
  ROCK_VARIANTS,
  TEX,
  TILE,
  TILE_COUNT,
  TRUNK_SIZE,
  TRUNK_VARIANTS,
  playerFrameName,
  type PlayerPose,
} from '../textures';
import { mulberry32, randInt, randRange } from '../utils/random';
import { createCanvasTexture, ellipse, hex, px, shade, type Ctx } from './canvas';
import { generateGatheringTextures } from './gathering';
import { generateSurvivalTextures } from './survival';
import { drawExtraTiles, generateScenery } from './world';
import { generateCreatureTextures } from './creatures';
import { generateRuinTextures } from './ruins';

/** Draws every placeholder texture on canvases. Keys and frame layout live in textures.ts. */

// ---------- Ground tiles ----------

const GRASS_BASE = 0x2d4728;
const DIRT_BASE = 0x564633;

function speckle(ctx: Ctx, ox: number, rng: () => number, base: number, count: number, spread: number): void {
  for (let i = 0; i < count; i++) {
    const c = shade(base, randRange(rng, -spread, spread));
    px(ctx, ox + randInt(rng, 0, 31), randInt(rng, 0, 31), randInt(rng, 1, 3), randInt(rng, 1, 2), hex(c));
  }
}

function blades(ctx: Ctx, ox: number, rng: () => number, base: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const x = ox + randInt(rng, 1, 30);
    const y = randInt(rng, 3, 31);
    const c = hex(shade(base, randRange(rng, 0.1, 0.3)));
    px(ctx, x, y - 2, 1, 3, c);
    px(ctx, x + 1, y - 3, 1, 2, c);
  }
}

function drawGrass(ctx: Ctx, ox: number, rng: () => number, base: number, flowers: boolean): void {
  px(ctx, ox, 0, TILE_SIZE, TILE_SIZE, hex(base));
  speckle(ctx, ox, rng, base, 70, 0.2);
  blades(ctx, ox, rng, base, 9);
  if (flowers) {
    const colors = [0xb8a77a, 0xa8705a, 0x7fb0a6];
    for (let i = 0; i < colors.length; i++) {
      px(ctx, ox + randInt(rng, 4, 27), randInt(rng, 4, 27), 1, 1, hex(colors[i] ?? 0xb8a77a));
    }
  }
}

function drawPath(ctx: Ctx, ox: number, rng: () => number): void {
  px(ctx, ox, 0, TILE_SIZE, TILE_SIZE, hex(DIRT_BASE));
  speckle(ctx, ox, rng, DIRT_BASE, 80, 0.22);
  for (let i = 0; i < 4; i++) px(ctx, ox + randInt(rng, 1, 29), randInt(rng, 1, 29), 2, 1, hex(0x6f665a));
}

function drawPathEdge(ctx: Ctx, ox: number, rng: () => number): void {
  px(ctx, ox, 0, TILE_SIZE, TILE_SIZE, hex(0x3a4529));
  speckle(ctx, ox, rng, GRASS_BASE, 60, 0.18);
  speckle(ctx, ox, rng, DIRT_BASE, 30, 0.2);
  blades(ctx, ox, rng, GRASS_BASE, 5);
}

function drawLeafLitter(ctx: Ctx, ox: number, rng: () => number): void {
  const base = shade(GRASS_BASE, -0.1);
  px(ctx, ox, 0, TILE_SIZE, TILE_SIZE, hex(base));
  speckle(ctx, ox, rng, base, 50, 0.2);
  const leafColors = [0x55482c, 0x5f4f2e, 0x45512a, 0x634a2c];
  for (let i = 0; i < 12; i++) {
    const c = leafColors[randInt(rng, 0, leafColors.length - 1)] ?? 0x55482c;
    const x = ox + randInt(rng, 0, 29);
    const y = randInt(rng, 0, 30);
    px(ctx, x, y, 2, 1, hex(c));
    px(ctx, x + 1, y + 1, 1, 1, hex(shade(c, -0.25)));
  }
}

function generateTiles(scene: Phaser.Scene): void {
  const rng = mulberry32(1103);
  createCanvasTexture(scene, TEX.tiles, TILE_SIZE * TILE_COUNT, TILE_SIZE, (ctx) => {
    drawGrass(ctx, TILE.grassA * TILE_SIZE, rng, GRASS_BASE, false);
    drawGrass(ctx, TILE.grassB * TILE_SIZE, rng, GRASS_BASE, false);
    drawGrass(ctx, TILE.grassFlowers * TILE_SIZE, rng, GRASS_BASE, true);
    drawGrass(ctx, TILE.moss * TILE_SIZE, rng, shade(GRASS_BASE, -0.035), false);
    drawPath(ctx, TILE.path * TILE_SIZE, rng);
    drawPathEdge(ctx, TILE.pathEdge * TILE_SIZE, rng);
    drawLeafLitter(ctx, TILE.leafLitter * TILE_SIZE, rng);
    drawShore(ctx, TILE.shore * TILE_SIZE, rng);
    drawWater(ctx, TILE.waterA * TILE_SIZE, 0);
    drawWater(ctx, TILE.waterB * TILE_SIZE, 1);
    drawExtraTiles(ctx);
  });
}

function drawShore(ctx: Ctx, ox: number, rng: () => number): void {
  const base = 0x3b3b2a;
  px(ctx, ox, 0, TILE_SIZE, TILE_SIZE, hex(base));
  speckle(ctx, ox, rng, base, 70, 0.22);
  for (let i = 0; i < 6; i++) px(ctx, ox + randInt(rng, 1, 28), randInt(rng, 1, 29), 3, 1, hex(0x2c3f3a));
  blades(ctx, ox, rng, 0x3e5a30, 4);
}

/** Two water frames with shifted ripples, swapped at runtime for a gentle animation. */
function drawWater(ctx: Ctx, ox: number, phase: number): void {
  px(ctx, ox, 0, TILE_SIZE, TILE_SIZE, hex(0x163a40));
  const rng = mulberry32(6100);
  for (let i = 0; i < 40; i++) {
    const c = shade(0x163a40, randRange(rng, -0.25, 0.15));
    px(ctx, ox + randInt(rng, 0, 29), randInt(rng, 0, 31), randInt(rng, 2, 3), 1, hex(c));
  }
  for (let i = 0; i < 5; i++) {
    const x = randInt(rng, 0, 27);
    const y = (randInt(rng, 0, 31) + phase * 3) % 32;
    px(ctx, ox + x, y, 4, 1, hex(0x4fc2b4, 0.3 + 0.2 * ((i + phase) % 2)));
  }
}

// ---------- Player ----------

const P = {
  skin: hex(0xc99a6e),
  skinShade: hex(0xa97b54),
  hair: hex(0x1a1512),
  shirt: hex(0x6d6a44),
  shirtShade: hex(0x53512f),
  pants: hex(0x3d2f24),
  boots: hex(0x1f1a16),
  pack: hex(0x7a5533),
  packShade: hex(0x5a3d24),
  kramaRed: hex(0xb2432f),
  kramaLight: hex(0xe7dccb),
  eye: hex(0x0d0b0a),
  shadow: 'rgba(0,0,0,0.32)',
};

function drawKrama(ctx: Ctx, x: number, y: number, w: number): void {
  for (let i = 0; i < w; i++) px(ctx, x + i, y, 1, 2, i % 2 === 0 ? P.kramaRed : P.kramaLight);
}

function poseOffsets(pose: PlayerPose): { legL: number; legR: number; armL: number; armR: number; bob: number } {
  switch (pose) {
    case 'stepA':
      return { legL: -2, legR: 1, armL: 1, armR: -1, bob: -1 };
    case 'stepB':
      return { legL: 1, legR: -2, armL: -1, armR: 1, bob: -1 };
    case 'breathe':
      return { legL: 0, legR: 0, armL: 0, armR: 0, bob: 1 };
    case 'act':
      return { legL: 0, legR: -1, armL: 1, armR: -5, bob: 0 };
    default:
      return { legL: 0, legR: 0, armL: 0, armR: 0, bob: 0 };
  }
}

function drawPlayerFront(ctx: Ctx, ox: number, oy: number, pose: PlayerPose, back: boolean): void {
  const o = poseOffsets(pose);
  const b = o.bob;
  ellipse(ctx, ox + 16, oy + 29.5, 7, 2.5, P.shadow);
  // legs
  px(ctx, ox + 12, oy + 23 + b, 3, 5 + o.legL, P.pants);
  px(ctx, ox + 17, oy + 23 + b, 3, 5 + o.legR, P.pants);
  px(ctx, ox + 12, oy + 27 + b + o.legL, 3, 2, P.boots);
  px(ctx, ox + 17, oy + 27 + b + o.legR, 3, 2, P.boots);
  // arms
  px(ctx, ox + 9, oy + 16 + b + o.armL, 2, 7, P.shirtShade);
  px(ctx, ox + 21, oy + 16 + b + o.armR, 2, 7, P.shirtShade);
  px(ctx, ox + 9, oy + 22 + b + o.armL, 2, 2, P.skinShade);
  px(ctx, ox + 21, oy + 22 + b + o.armR, 2, 2, P.skinShade);
  // torso
  px(ctx, ox + 11, oy + 15 + b, 10, 9, P.shirt);
  px(ctx, ox + 11, oy + 22 + b, 10, 2, P.shirtShade);
  if (back) {
    px(ctx, ox + 12, oy + 15 + b, 8, 8, P.pack);
    px(ctx, ox + 12, oy + 21 + b, 8, 2, P.packShade);
    px(ctx, ox + 14, oy + 17 + b, 4, 1, P.packShade);
  }
  drawKrama(ctx, ox + 11, oy + 14 + b, 10);
  // head
  ellipse(ctx, ox + 16, oy + 10 + b, 5, 5, P.skin);
  if (back) {
    ellipse(ctx, ox + 16, oy + 9.5 + b, 5.2, 5, P.hair);
  } else {
    ellipse(ctx, ox + 16, oy + 7 + b, 5.2, 3, P.hair);
    px(ctx, ox + 11, oy + 7 + b, 2, 4, P.hair);
    px(ctx, ox + 19, oy + 7 + b, 2, 4, P.hair);
    px(ctx, ox + 14, oy + 10 + b, 1, 2, P.eye);
    px(ctx, ox + 18, oy + 10 + b, 1, 2, P.eye);
  }
}

function drawPlayerSide(ctx: Ctx, ox: number, oy: number, pose: PlayerPose): void {
  const o = poseOffsets(pose);
  const b = o.bob;
  ellipse(ctx, ox + 16, oy + 29.5, 6.5, 2.5, P.shadow);
  // legs: forward/back stride
  const stride = pose === 'stepA' ? 3 : pose === 'stepB' ? -3 : 0;
  px(ctx, ox + 14 - stride, oy + 23 + b, 3, 5, hex(shade(0x3d2f24, -0.25)));
  px(ctx, ox + 15 + stride, oy + 23 + b, 3, 5, P.pants);
  px(ctx, ox + 14 - stride, oy + 27 + b, 4, 2, P.boots);
  px(ctx, ox + 15 + stride, oy + 27 + b, 4, 2, P.boots);
  // backpack
  px(ctx, ox + 9, oy + 15 + b, 4, 8, P.pack);
  px(ctx, ox + 9, oy + 21 + b, 4, 2, P.packShade);
  // torso
  px(ctx, ox + 12, oy + 15 + b, 8, 9, P.shirt);
  px(ctx, ox + 12, oy + 22 + b, 8, 2, P.shirtShade);
  // arm swing
  if (pose === 'act') {
    px(ctx, ox + 16, oy + 17 + b, 8, 3, P.shirtShade);
    px(ctx, ox + 24, oy + 17 + b, 3, 3, P.skinShade);
  } else {
    const swing = pose === 'stepA' ? 2 : pose === 'stepB' ? -2 : 0;
    px(ctx, ox + 15 + swing, oy + 16 + b, 3, 7, P.shirtShade);
    px(ctx, ox + 15 + swing, oy + 22 + b, 3, 2, P.skinShade);
  }
  drawKrama(ctx, ox + 12, oy + 14 + b, 8);
  // head (facing right)
  ellipse(ctx, ox + 16.5, oy + 10 + b, 4.8, 5, P.skin);
  ellipse(ctx, ox + 15, oy + 8 + b, 4.8, 3.6, P.hair);
  px(ctx, ox + 11, oy + 8 + b, 3, 5, P.hair);
  px(ctx, ox + 19, oy + 10 + b, 1, 2, P.eye);
  px(ctx, ox + 21, oy + 11 + b, 1, 1, P.skinShade);
}

function generatePlayer(scene: Phaser.Scene): void {
  const cols = PLAYER_POSES.length;
  const tex = createCanvasTexture(
    scene,
    TEX.player,
    PLAYER_FRAME * cols,
    PLAYER_FRAME * PLAYER_DIRS.length,
    (ctx) => {
      PLAYER_DIRS.forEach((dir, row) => {
        PLAYER_POSES.forEach((pose, col) => {
          const ox = col * PLAYER_FRAME;
          const oy = row * PLAYER_FRAME;
          if (dir === 'side') drawPlayerSide(ctx, ox, oy, pose);
          else drawPlayerFront(ctx, ox, oy, pose, dir === 'up');
        });
      });
    },
  );
  PLAYER_DIRS.forEach((dir, row) => {
    PLAYER_POSES.forEach((pose, col) => {
      tex.add(playerFrameName(dir, pose), 0, col * PLAYER_FRAME, row * PLAYER_FRAME, PLAYER_FRAME, PLAYER_FRAME);
    });
  });
}

// ---------- Trees, rocks, ferns ----------

function generateTrunks(scene: Phaser.Scene): void {
  const { w, h } = TRUNK_SIZE;
  const rng = mulberry32(2207);
  const barks = [0x4a3b2e, 0x564434, 0x3f3a33];
  const tex = createCanvasTexture(scene, TEX.trunk, w * TRUNK_VARIANTS, h, (ctx) => {
    for (let v = 0; v < TRUNK_VARIANTS; v++) {
      const ox = v * w;
      const bark = barks[v] ?? 0x4a3b2e;
      ellipse(ctx, ox + w / 2, h - 4, 12, 4, 'rgba(0,0,0,0.35)');
      // roots
      ctx.fillStyle = hex(shade(bark, -0.1));
      ctx.beginPath();
      ctx.moveTo(ox + 3, h - 3);
      ctx.quadraticCurveTo(ox + 10, h - 9, ox + 10, h - 20);
      ctx.lineTo(ox + 18, h - 20);
      ctx.quadraticCurveTo(ox + 18, h - 9, ox + w - 3, h - 3);
      ctx.quadraticCurveTo(ox + w / 2, h - 7, ox + 3, h - 3);
      ctx.fill();
      // trunk
      px(ctx, ox + 9, 0, 10, h - 8, hex(bark));
      px(ctx, ox + 9, 0, 3, h - 8, hex(shade(bark, 0.2)));
      px(ctx, ox + 16, 0, 3, h - 8, hex(shade(bark, -0.25)));
      for (let i = 0; i < 9; i++) {
        px(ctx, ox + randInt(rng, 10, 17), randInt(rng, 2, h - 12), 1, randInt(rng, 3, 6), hex(shade(bark, -0.35)));
      }
      if (v === 1) {
        for (let i = 0; i < 5; i++) px(ctx, ox + randInt(rng, 9, 18), randInt(rng, h - 22, h - 10), 2, 1, hex(0x4f6b34));
      }
    }
  });
  for (let v = 0; v < TRUNK_VARIANTS; v++) tex.add(v, 0, v * w, 0, w, h);
}

function generateCanopies(scene: Phaser.Scene): void {
  const { w, h } = CANOPY_SIZE;
  const rng = mulberry32(3301);
  const bases = [0x1d3b25, 0x183323, 0x22402a];
  const tex = createCanvasTexture(scene, TEX.canopy, w * CANOPY_VARIANTS, h, (ctx) => {
    for (let v = 0; v < CANOPY_VARIANTS; v++) {
      const ox = v * w;
      const cx = ox + w / 2;
      const cy = h / 2;
      const base = bases[v] ?? 0x1d3b25;
      // soft drop shadow
      ellipse(ctx, cx + 4, cy + 10, w * 0.42, h * 0.36, 'rgba(0,0,0,0.22)');
      const layers: Array<[number, number, number]> = [
        [-0.25, 13, 22],
        [-0.08, 12, 19],
        [0.12, 10, 15],
        [0.32, 7, 10],
      ];
      layers.forEach(([amt, count, radius], layer) => {
        for (let i = 0; i < count; i++) {
          const ang = rng() * Math.PI * 2;
          const dist = rng() * (w * 0.3 - layer * 6);
          const bx = cx + Math.cos(ang) * dist - layer * 3;
          const by = cy + Math.sin(ang) * dist * 0.82 - layer * 4;
          const r = radius * randRange(rng, 0.7, 1.1);
          ellipse(ctx, bx, by, r, r * 0.9, hex(shade(base, amt + randRange(rng, -0.05, 0.05))));
        }
      });
      for (let i = 0; i < 70; i++) {
        const ang = rng() * Math.PI * 2;
        const dist = rng() * w * 0.36;
        px(ctx, cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist * 0.8, 2, 1, hex(shade(base, randRange(rng, 0.2, 0.6))));
      }
      if (v === 2) {
        for (let i = 0; i < 6; i++) px(ctx, cx + randInt(rng, -30, 30), cy + randInt(rng, -25, 25), 2, 2, hex(0x4fc2b4, 0.55));
      }
    }
  });
  for (let v = 0; v < CANOPY_VARIANTS; v++) tex.add(v, 0, v * w, 0, w, h);
}

function generateRocks(scene: Phaser.Scene): void {
  const { w, h } = ROCK_SIZE;
  const rng = mulberry32(4409);
  const tex = createCanvasTexture(scene, TEX.rock, w * ROCK_VARIANTS, h, (ctx) => {
    for (let v = 0; v < ROCK_VARIANTS; v++) {
      const ox = v * w;
      const base = [0x6b7173, 0x5e6466, 0x737a73][v] ?? 0x6b7173;
      ellipse(ctx, ox + w / 2, h - 4, 13, 4, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = hex(base);
      ctx.beginPath();
      const pts = 9;
      for (let i = 0; i < pts; i++) {
        const a = Math.PI + (i / (pts - 1)) * Math.PI;
        const rx = 13 * randRange(rng, 0.85, 1.05);
        const ry = 15 * randRange(rng, 0.75, 1.0);
        const x = ox + w / 2 + Math.cos(a) * rx;
        const y = h - 6 + Math.sin(a) * ry;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.lineTo(ox + w / 2 + 12, h - 3);
      ctx.lineTo(ox + w / 2 - 12, h - 3);
      ctx.closePath();
      ctx.fill();
      ellipse(ctx, ox + w / 2 - 4, h - 15, 6, 4, hex(shade(base, 0.25)));
      px(ctx, ox + w / 2 + 2, h - 10, 8, 5, hex(shade(base, -0.22)));
      px(ctx, ox + 7, h - 5, w - 14, 2, hex(shade(base, -0.35)));
      for (let i = 0; i < 8; i++) {
        px(ctx, ox + randInt(rng, 8, w - 10), randInt(rng, h - 18, h - 7), 1, 1, hex(shade(base, -0.4)));
      }
      if (v !== 1) {
        for (let i = 0; i < 7; i++) px(ctx, ox + randInt(rng, 8, w - 12), randInt(rng, h - 21, h - 15), 3, 2, hex(0x4a6a38));
      }
    }
  });
  for (let v = 0; v < ROCK_VARIANTS; v++) tex.add(v, 0, v * w, 0, w, h);
}

function generateFerns(scene: Phaser.Scene): void {
  const { w, h } = FERN_SIZE;
  const rng = mulberry32(5501);
  const tex = createCanvasTexture(scene, TEX.fern, w * FERN_VARIANTS, h, (ctx) => {
    for (let v = 0; v < FERN_VARIANTS; v++) {
      const ox = v * w;
      const base = [0x2f5a32, 0x3a6236, 0x2a4d35][v] ?? 0x2f5a32;
      const fronds = 7;
      for (let f = 0; f < fronds; f++) {
        const ang = Math.PI + 0.25 + (f / (fronds - 1)) * (Math.PI - 0.5);
        const len = randRange(rng, 7, 11);
        for (let s = 0; s < len; s++) {
          const x = ox + w / 2 + Math.cos(ang) * s;
          const y = h - 2 + Math.sin(ang) * s * 1.1;
          px(ctx, x, y, 2, 1, hex(shade(base, s / len / 2)));
          if (s % 2 === 0) px(ctx, x - 1, y + 1, 1, 1, hex(shade(base, -0.15)));
        }
      }
    }
  });
  for (let v = 0; v < FERN_VARIANTS; v++) tex.add(v, 0, v * w, 0, w, h);
}

// ---------- Screen overlays & menu ----------

function generateVignette(scene: Phaser.Scene): void {
  createCanvasTexture(scene, TEX.vignette, GAME_WIDTH, GAME_HEIGHT, (ctx) => {
    const g = ctx.createRadialGradient(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_HEIGHT * 0.35,
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH * 0.62,
    );
    g.addColorStop(0, 'rgba(4,10,9,0)');
    g.addColorStop(0.7, 'rgba(4,10,9,0.32)');
    g.addColorStop(1, 'rgba(4,10,9,0.72)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  });
}

function generateGlow(scene: Phaser.Scene): void {
  createCanvasTexture(scene, TEX.glow, 16, 16, (ctx) => {
    const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 16);
  });
}

function drawTreeSilhouette(ctx: Ctx, x: number, baseY: number, height: number, color: string, rng: () => number): void {
  ctx.fillStyle = color;
  ctx.fillRect(x - height * 0.03, baseY - height * 0.65, height * 0.06, height * 0.65);
  for (let i = 0; i < 6; i++) {
    const r = height * randRange(rng, 0.14, 0.22);
    ctx.beginPath();
    ctx.ellipse(
      x + randRange(rng, -height * 0.18, height * 0.18),
      baseY - height * randRange(rng, 0.6, 0.95),
      r,
      r * 0.85,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

function drawPrasat(ctx: Ctx, cx: number, baseY: number, scale: number, color: string): void {
  ctx.fillStyle = color;
  const tower = (x: number, h: number, w: number) => {
    const tiers = 6;
    for (let t = 0; t < tiers; t++) {
      const tw = w * (1 - t * 0.13);
      const th = h / tiers;
      ctx.fillRect(x - tw / 2, baseY - h * 0.45 - th * (t + 1), tw, th + 1);
    }
    ctx.beginPath();
    ctx.moveTo(x - w * 0.12, baseY - h * 0.45 - h);
    ctx.lineTo(x, baseY - h * 0.45 - h - h * 0.22);
    ctx.lineTo(x + w * 0.12, baseY - h * 0.45 - h);
    ctx.fill();
    ctx.fillRect(x - w * 0.55, baseY - h * 0.45, w * 1.1, h * 0.45);
  };
  tower(cx - 58 * scale, 60 * scale, 34 * scale);
  tower(cx + 58 * scale, 60 * scale, 34 * scale);
  tower(cx, 86 * scale, 46 * scale);
  ctx.fillRect(cx - 110 * scale, baseY - 18 * scale, 220 * scale, 18 * scale);
}

function generateMenuBackground(scene: Phaser.Scene): void {
  const rng = mulberry32(777);
  createCanvasTexture(scene, TEX.menuBg, GAME_WIDTH, GAME_HEIGHT, (ctx) => {
    ctx.imageSmoothingEnabled = true;
    const sky = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
    sky.addColorStop(0, '#071312');
    sky.addColorStop(0.45, '#0f2a2a');
    sky.addColorStop(0.75, '#1a3a33');
    sky.addColorStop(1, '#08110f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const moon = ctx.createRadialGradient(930, 170, 0, 930, 170, 160);
    moon.addColorStop(0, 'rgba(214,226,206,0.55)');
    moon.addColorStop(0.2, 'rgba(160,190,175,0.18)');
    moon.addColorStop(1, 'rgba(160,190,175,0)');
    ctx.fillStyle = moon;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    ellipse(ctx, 930, 170, 34, 34, 'rgba(226,232,214,0.85)');

    drawPrasat(ctx, 860, 470, 1.25, 'rgba(22,48,44,0.95)');

    const mist = (y: number, alpha: number) => {
      const g = ctx.createLinearGradient(0, y - 40, 0, y + 40);
      g.addColorStop(0, 'rgba(169,181,176,0)');
      g.addColorStop(0.5, `rgba(169,181,176,${alpha})`);
      g.addColorStop(1, 'rgba(169,181,176,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y - 40, GAME_WIDTH, 80);
    };
    mist(455, 0.16);

    const layers: Array<[number, number, string, number]> = [
      [500, 150, '#123029', 22],
      [570, 210, '#0c221d', 18],
      [660, 290, '#071512', 14],
    ];
    for (const [baseY, height, color, count] of layers) {
      for (let i = 0; i < count; i++) {
        drawTreeSilhouette(ctx, (i / count) * GAME_WIDTH + randRange(rng, -30, 30), baseY, height * randRange(rng, 0.75, 1.15), color, rng);
      }
      ctx.fillStyle = color;
      ctx.fillRect(0, baseY - 4, GAME_WIDTH, GAME_HEIGHT - baseY + 4);
      mist(baseY - 20, 0.07);
    }

    // hanging vines framing the title
    ctx.strokeStyle = 'rgba(8,20,16,0.9)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 14; i++) {
      const x = i < 7 ? randRange(rng, 0, 220) : randRange(rng, GAME_WIDTH - 220, GAME_WIDTH);
      const len = randRange(rng, 80, 260);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.quadraticCurveTo(x + randRange(rng, -20, 20), len / 2, x + randRange(rng, -10, 10), len);
      ctx.stroke();
      for (let l = 20; l < len; l += 22) ellipse(ctx, x + randRange(rng, -6, 6), l, 6, 3, 'rgba(10,26,20,0.95)');
    }
  });
}

/** Generates every placeholder texture. Safe to call again (replaces existing keys). */
export function generateAllTextures(scene: Phaser.Scene): void {
  generateTiles(scene);
  generatePlayer(scene);
  generateTrunks(scene);
  generateCanopies(scene);
  generateRocks(scene);
  generateFerns(scene);
  generateVignette(scene);
  generateGlow(scene);
  generateMenuBackground(scene);
  generateGatheringTextures(scene);
  generateSurvivalTextures(scene);
  generateScenery(scene);
  generateCreatureTextures(scene);
  generateRuinTextures(scene);

  const crisp = [
    TEX.tiles,
    TEX.player,
    TEX.trunk,
    TEX.canopy,
    TEX.rock,
    TEX.fern,
    TEX.bamboo,
    TEX.bush,
    TEX.depleted,
    TEX.icons,
    TEX.chip,
    TEX.structures,
    TEX.flame,
    TEX.scenery,
    TEX.creatures,
    TEX.shrine,
    TEX.status,
    TEX.chest,
    TEX.tablet,
  ];
  for (const key of crisp) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
}
