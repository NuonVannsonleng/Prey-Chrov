import Phaser from 'phaser';
import {
  BAMBOO_SIZE,
  BAMBOO_VARIANTS,
  BUSH_SIZE,
  DEPLETED_FRAME,
  DEPLETED_SIZE,
  ICON_KEYS,
  ICON_SIZE,
  TEX,
  type IconKey,
} from '../textures';
import { mulberry32, randInt, randRange } from '../utils/random';
import { createCanvasTexture, ellipse, hex, px, shade, type Ctx } from './canvas';
import { SURVIVAL_ICON_DRAW } from './survival';
import { COOKING_ICON_DRAW } from './cooking';
import { BUILDING_ICON_DRAW } from './building';
import { GEAR_ICON_DRAW } from './gear';

// ---------- Bamboo ----------

function drawBambooStalk(ctx: Ctx, x: number, baseY: number, height: number, color: number, rng: () => number): void {
  const w = 3;
  px(ctx, x, baseY - height, w, height, hex(color));
  px(ctx, x, baseY - height, 1, height, hex(shade(color, 0.25)));
  for (let y = baseY - 6; y > baseY - height; y -= randInt(rng, 7, 10)) {
    px(ctx, x - 1, y, w + 2, 1, hex(shade(color, -0.35)));
    if (rng() < 0.45) {
      const dir = rng() < 0.5 ? -1 : 1;
      for (let l = 1; l <= 5; l++) px(ctx, x + 1 + dir * (l + 1), y - l + (l > 3 ? 1 : 0), 2, 1, hex(0x5f8a3a));
    }
  }
  for (let i = 0; i < 3; i++) {
    const dir = i % 2 === 0 ? -1 : 1;
    for (let l = 0; l < 6; l++) px(ctx, x + 1 + dir * l, baseY - height + l * 0.6 + i, 2, 1, hex(0x6e9a40));
  }
}

function generateBamboo(scene: Phaser.Scene): void {
  const { w, h } = BAMBOO_SIZE;
  const rng = mulberry32(7301);
  const tex = createCanvasTexture(scene, TEX.bamboo, w * BAMBOO_VARIANTS, h, (ctx) => {
    for (let v = 0; v < BAMBOO_VARIANTS; v++) {
      const ox = v * w;
      ellipse(ctx, ox + w / 2, h - 4, 15, 4, 'rgba(0,0,0,0.35)');
      const stalks = 6 + v;
      for (let s = 0; s < stalks; s++) {
        const x = ox + 6 + (s / (stalks - 1)) * (w - 15) + randRange(rng, -1.5, 1.5);
        const height = randRange(rng, h * 0.6, h - 2);
        const color = [0x7a9a3c, 0x8aa648, 0x6b8a36][s % 3] ?? 0x7a9a3c;
        drawBambooStalk(ctx, Math.round(x), h - 4 - (s % 2), Math.round(height), color, rng);
      }
    }
  });
  for (let v = 0; v < BAMBOO_VARIANTS; v++) tex.add(v, 0, v * w, 0, w, h);
}

// ---------- Berry bush ----------

function drawBush(ctx: Ctx, ox: number, rng: () => number, berries: boolean): void {
  const { w, h } = BUSH_SIZE;
  ellipse(ctx, ox + w / 2, h - 3, 13, 3.5, 'rgba(0,0,0,0.35)');
  const blobs: Array<[number, number, number, number]> = [
    [w / 2, h - 9, 11, -0.2],
    [w / 2 - 6, h - 11, 7, -0.05],
    [w / 2 + 6, h - 11, 7, 0],
    [w / 2, h - 15, 7, 0.12],
  ];
  for (const [x, y, r, amt] of blobs) ellipse(ctx, ox + x, y, r, r * 0.8, hex(shade(0x2f5a2e, amt)));
  for (let i = 0; i < 18; i++) {
    px(ctx, ox + randInt(rng, 5, w - 6), randInt(rng, 5, h - 6), 2, 1, hex(shade(0x2f5a2e, randRange(rng, 0.2, 0.5))));
  }
  if (berries) {
    const spots: Array<[number, number]> = [
      [9, 9],
      [14, 13],
      [20, 8],
      [18, 15],
      [11, 15],
      [23, 12],
      [15, 6],
    ];
    for (const [x, y] of spots) {
      px(ctx, ox + x, y, 3, 3, hex(0x9b2f4a));
      px(ctx, ox + x, y, 1, 1, hex(0xe08aa0));
    }
  }
}

function generateBush(scene: Phaser.Scene): void {
  const { w, h } = BUSH_SIZE;
  const tex = createCanvasTexture(scene, TEX.bush, w * 2, h, (ctx) => {
    drawBush(ctx, 0, mulberry32(8101), true);
    drawBush(ctx, w, mulberry32(8101), false);
  });
  tex.add(0, 0, 0, 0, w, h);
  tex.add(1, 0, w, 0, w, h);
}

// ---------- Depleted states ----------

function generateDepleted(scene: Phaser.Scene): void {
  const { w, h } = DEPLETED_SIZE;
  const rng = mulberry32(9201);
  const tex = createCanvasTexture(scene, TEX.depleted, w * 4, h, (ctx) => {
    // tree stump
    let ox = DEPLETED_FRAME.tree * w;
    ellipse(ctx, ox + w / 2, h - 4, 11, 3.5, 'rgba(0,0,0,0.35)');
    px(ctx, ox + 10, h - 12, 12, 9, hex(0x4a3b2e));
    px(ctx, ox + 10, h - 12, 3, 9, hex(0x5e4a38));
    ellipse(ctx, ox + 16, h - 12, 6, 2.5, hex(0xb08a5a));
    ellipse(ctx, ox + 16, h - 12, 3, 1.2, hex(0x8a6a44));
    // bamboo stubs
    ox = DEPLETED_FRAME.bamboo * w;
    ellipse(ctx, ox + w / 2, h - 4, 12, 3.5, 'rgba(0,0,0,0.3)');
    for (let s = 0; s < 6; s++) {
      const x = ox + 7 + s * 3.5;
      const sh = randInt(rng, 3, 7);
      px(ctx, x, h - 4 - sh, 3, sh, hex(0x7a9a3c));
      px(ctx, x, h - 4 - sh, 3, 1, hex(0xc9d68a));
    }
    // rubble
    ox = DEPLETED_FRAME.rock * w;
    for (let i = 0; i < 6; i++) {
      const x = ox + randInt(rng, 7, w - 9);
      const y = h - randInt(rng, 4, 8);
      ellipse(ctx, x, y, randRange(rng, 2, 3.5), 2, hex(shade(0x6b7173, randRange(rng, -0.2, 0.15))));
    }
    // bare bush (frame kept for completeness; bushes use TEX.bush picked frame)
    ox = DEPLETED_FRAME.bush * w;
    for (let i = 0; i < 7; i++) {
      const x = ox + w / 2 + randInt(rng, -6, 6);
      px(ctx, x, h - randInt(rng, 8, 12), 1, 8, hex(0x4a3b2e));
    }
  });
  for (let f = 0; f < 4; f++) tex.add(f, 0, f * w, 0, w, h);
}

// ---------- Item icons (16×16) ----------

const ICON_DRAW: Record<IconKey, (ctx: Ctx, ox: number) => void> = {
  ...SURVIVAL_ICON_DRAW,
  ...COOKING_ICON_DRAW,
  ...BUILDING_ICON_DRAW,
  ...GEAR_ICON_DRAW,
  wood: (ctx, ox) => {
    px(ctx, ox + 2, 6, 12, 6, hex(0x6b4a2e));
    px(ctx, ox + 2, 6, 12, 2, hex(0x84603c));
    px(ctx, ox + 2, 11, 12, 1, hex(0x4a3320));
    ellipse(ctx, ox + 13.5, 9, 2.2, 3, hex(0xc49a62));
    ellipse(ctx, ox + 13.5, 9, 1, 1.4, hex(0x8a6a44));
  },
  stick: (ctx, ox) => {
    for (let i = 0; i < 11; i++) px(ctx, ox + 3 + i, 12 - i, 2, 2, hex(i % 3 === 0 ? 0x5e4a38 : 0x7a5a3a));
    px(ctx, ox + 8, 5, 1, 3, hex(0x7a5a3a));
    px(ctx, ox + 7, 4, 2, 1, hex(0x5f8a3a));
  },
  bamboo: (ctx, ox) => {
    px(ctx, ox + 6, 1, 4, 14, hex(0x8aa648));
    px(ctx, ox + 6, 1, 1, 14, hex(0xb4c870));
    px(ctx, ox + 5, 5, 6, 1, hex(0x55702a));
    px(ctx, ox + 5, 11, 6, 1, hex(0x55702a));
  },
  stone: (ctx, ox) => {
    ellipse(ctx, ox + 8, 9.5, 6, 4.5, hex(0x6b7173));
    ellipse(ctx, ox + 7, 8, 3.5, 2, hex(0x8e9496));
    px(ctx, ox + 9, 11, 3, 1, hex(0x4a4f51));
  },
  flint: (ctx, ox) => {
    ctx.fillStyle = hex(0x3a3f4a);
    ctx.beginPath();
    ctx.moveTo(ox + 8, 2);
    ctx.lineTo(ox + 13, 8);
    ctx.lineTo(ox + 9, 14);
    ctx.lineTo(ox + 3, 9);
    ctx.closePath();
    ctx.fill();
    px(ctx, ox + 7, 4, 2, 4, hex(0x8fa0b8));
    px(ctx, ox + 9, 8, 1, 3, hex(0x4fc2b4));
  },
  berries: (ctx, ox) => {
    px(ctx, ox + 7, 2, 1, 4, hex(0x4a6a30));
    px(ctx, ox + 8, 3, 3, 2, hex(0x5f8a3a));
    for (const [x, y] of [
      [4, 7],
      [8, 6],
      [6, 10],
      [10, 10],
    ] as const) {
      ellipse(ctx, ox + x + 1.5, y + 1.5, 2.2, 2.2, hex(0x9b2f4a));
      px(ctx, ox + x + 0.5, y + 0.5, 1, 1, hex(0xe08aa0));
    }
  },
  fiber: (ctx, ox) => {
    for (let i = 0; i < 5; i++) {
      for (let y = 2; y < 14; y++) px(ctx, ox + 4 + i * 2 + Math.round(Math.sin(y * 0.6 + i) * 0.8), y, 1, 1, hex(i % 2 ? 0xa8a46a : 0x8e8a52));
    }
    px(ctx, ox + 3, 7, 10, 2, hex(0x6b4a2e));
  },
  leaf: (ctx, ox) => {
    ctx.fillStyle = hex(0x4f8a3a);
    ctx.beginPath();
    ctx.moveTo(ox + 2, 14);
    ctx.quadraticCurveTo(ox + 2, 3, ox + 14, 2);
    ctx.quadraticCurveTo(ox + 13, 13, ox + 2, 14);
    ctx.fill();
    for (let i = 0; i < 9; i++) px(ctx, ox + 3 + i, 13 - i, 1, 1, hex(0x8ec26a));
  },
};

function generateIcons(scene: Phaser.Scene): void {
  const tex = createCanvasTexture(scene, TEX.icons, ICON_SIZE * ICON_KEYS.length, ICON_SIZE, (ctx) => {
    ICON_KEYS.forEach((key, i) => ICON_DRAW[key](ctx, i * ICON_SIZE));
  });
  ICON_KEYS.forEach((key, i) => tex.add(key, 0, i * ICON_SIZE, 0, ICON_SIZE, ICON_SIZE));
}

// ---------- Effects ----------

function generateEffects(scene: Phaser.Scene): void {
  createCanvasTexture(scene, TEX.chip, 4, 4, (ctx) => px(ctx, 0, 0, 4, 4, '#ffffff'));
  createCanvasTexture(scene, TEX.targetRing, 36, 14, (ctx) => {
    ctx.strokeStyle = 'rgba(230,184,102,0.95)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.ellipse(18, 7, 16, 5.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  });
}

/** Resource nodes, depleted states, item icons and gathering effects. */
export function generateGatheringTextures(scene: Phaser.Scene): void {
  generateBamboo(scene);
  generateBush(scene);
  generateDepleted(scene);
  generateIcons(scene);
  generateEffects(scene);
}
