import Phaser from 'phaser';
import { TEX, TRAVELER_FRAME, TRAVELER_LOOKS, travelerFrameName, type TravelerLook } from '../textures';
import { createCanvasTexture, ellipse, hex, px, shade, type Ctx } from './canvas';

/** M20: travelers — ordinary people passing through the forest, drawn in the player's pixel style. */
const SKIN = 0xb98a62;
const LOOK: Record<TravelerLook, { shirt: number; pants: number; extra: number }> = {
  // River trader: indigo shirt, sedge hat, pole over the shoulder.
  trader: { shirt: 0x3e4f7a, pants: 0x2e2a26, extra: 0xc9a86a },
  // Honey gatherer: earthy shirt, smoke-blackened cloth, a woven basket.
  gatherer: { shirt: 0x7a5a36, pants: 0x3a3226, extra: 0x8f6a3a },
  // Mapmaker: pale shirt, satchel and a rolled map.
  mapmaker: { shirt: 0xcfc6ae, pants: 0x4a4436, extra: 0x6e4a2e },
};

function drawTraveler(ctx: Ctx, ox: number, look: TravelerLook, bob: number): void {
  const c = LOOK[look];
  const W = TRAVELER_FRAME.w;
  const cx = ox + W / 2;
  const top = TRAVELER_FRAME.h - 32;
  const b = bob;
  ellipse(ctx, cx, top + 29.5, 7.5, 2.5, 'rgba(0,0,0,0.35)');
  // legs (a sampot-like wrap for the trader, trousers for the others)
  if (look === 'trader') {
    px(ctx, cx - 5, top + 21 + b, 10, 7, hex(c.pants));
    px(ctx, cx - 5, top + 24 + b, 10, 1, hex(shade(c.pants, 0.4)));
  } else {
    px(ctx, cx - 4, top + 23 + b, 3, 5, hex(c.pants));
    px(ctx, cx + 1, top + 23 + b, 3, 5, hex(c.pants));
  }
  px(ctx, cx - 4, top + 28, 3, 1.5, hex(0x2a1d14));
  px(ctx, cx + 1, top + 28, 3, 1.5, hex(0x2a1d14));
  // torso and arms
  px(ctx, cx - 5, top + 15 + b, 10, 9, hex(c.shirt));
  px(ctx, cx - 5, top + 22 + b, 10, 2, hex(shade(c.shirt, -0.25)));
  px(ctx, cx - 7, top + 16 + b, 2, 7, hex(shade(c.shirt, -0.15)));
  px(ctx, cx + 5, top + 16 + b, 2, 7, hex(shade(c.shirt, -0.15)));
  px(ctx, cx - 7, top + 22 + b, 2, 2, hex(shade(SKIN, -0.15)));
  px(ctx, cx + 5, top + 22 + b, 2, 2, hex(shade(SKIN, -0.15)));
  // a checked scarf, like the player's
  for (let i = 0; i < 10; i += 2) {
    px(ctx, cx - 5 + i, top + 14 + b, 1, 2, hex(0xd9644a));
    px(ctx, cx - 4 + i, top + 14 + b, 1, 2, hex(0xe8e0c8));
  }
  // head
  ellipse(ctx, cx, top + 10 + b, 5, 5, hex(SKIN));
  ellipse(ctx, cx, top + 7 + b, 5.2, 3, hex(0x1d1612));
  px(ctx, cx - 2, top + 10 + b, 1, 2, hex(0x1d1612));
  px(ctx, cx + 2, top + 10 + b, 1, 2, hex(0x1d1612));
  if (look === 'trader') {
    // conical sedge hat and a long boat pole
    ctx.fillStyle = hex(c.extra);
    ctx.beginPath();
    ctx.moveTo(cx - 10, top + 7 + b);
    ctx.lineTo(cx + 10, top + 7 + b);
    ctx.lineTo(cx, top - 1 + b);
    ctx.closePath();
    ctx.fill();
    px(ctx, cx - 10, top + 6 + b, 20, 1, hex(shade(c.extra, -0.3)));
    px(ctx, cx + 8, top - 6, 1.5, 34, hex(0x8a6a44));
  } else if (look === 'gatherer') {
    // wrapped head cloth and a basket on the back
    px(ctx, cx - 5, top + 4 + b, 10, 3, hex(0x4a4036));
    px(ctx, cx - 11, top + 14 + b, 6, 9, hex(c.extra));
    for (let y = 0; y < 9; y += 2) px(ctx, cx - 11, top + 14 + b + y, 6, 1, hex(shade(c.extra, -0.3)));
    px(ctx, cx - 10, top + 12 + b, 4, 2, hex(0xe6b866));
  } else {
    // satchel, strap and a rolled map under the arm
    px(ctx, cx - 4, top + 15 + b, 1, 9, hex(c.extra));
    px(ctx, cx + 3, top + 20 + b, 6, 5, hex(c.extra));
    px(ctx, cx + 3, top + 20 + b, 6, 1, hex(shade(c.extra, 0.3)));
    px(ctx, cx - 10, top + 17 + b, 5, 2, hex(0xe8e0c8));
    px(ctx, cx - 10, top + 17 + b, 1, 2, hex(0xb8ae94));
  }
}

export function generateTravelerTextures(scene: Phaser.Scene): void {
  const frames = TRAVELER_LOOKS.length * 2;
  const tex = createCanvasTexture(scene, TEX.travelers, TRAVELER_FRAME.w * frames, TRAVELER_FRAME.h, (ctx) => {
    TRAVELER_LOOKS.forEach((look, i) => {
      drawTraveler(ctx, i * 2 * TRAVELER_FRAME.w, look, 0);
      drawTraveler(ctx, (i * 2 + 1) * TRAVELER_FRAME.w, look, 1);
    });
  });
  TRAVELER_LOOKS.forEach((look, i) => {
    for (const f of [0, 1] as const) tex.add(travelerFrameName(look, f), 0, (i * 2 + f) * TRAVELER_FRAME.w, 0, TRAVELER_FRAME.w, TRAVELER_FRAME.h);
  });
}
