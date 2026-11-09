import { ellipse, hex, px, type Ctx } from './canvas';

/** M11 icons: tier-2 tools and wearable gear. */
const flintHead = (ctx: Ctx, x: number, y: number, w: number, h: number): void => {
  px(ctx, x, y, w, h, hex(0x5a6066));
  px(ctx, x, y, w, 1, hex(0x9aa4aa));
  px(ctx, x + w - 1, y + 1, 1, h - 1, hex(0x2c3034));
};

export const GEAR_ICON_DRAW = {
  flint_axe: (ctx: Ctx, ox: number) => {
    px(ctx, ox + 7, 3, 2, 12, hex(0x84603c));
    flintHead(ctx, ox + 8, 3, 6, 5);
    px(ctx, ox + 6, 6, 4, 2, hex(0xa87048));
  },
  flint_pickaxe: (ctx: Ctx, ox: number) => {
    px(ctx, ox + 7, 4, 2, 11, hex(0x84603c));
    flintHead(ctx, ox + 2, 3, 12, 3);
    px(ctx, ox + 6, 6, 4, 2, hex(0xa87048));
  },
  fang_spear: (ctx: Ctx, ox: number) => {
    ctx.strokeStyle = hex(0x9fbf5a);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ox + 2, 15);
    ctx.lineTo(ox + 11, 5);
    ctx.stroke();
    ctx.fillStyle = hex(0xf0e6c8);
    ctx.beginPath();
    ctx.moveTo(ox + 10, 6);
    ctx.lineTo(ox + 15, 0);
    ctx.lineTo(ox + 12, 7);
    ctx.closePath();
    ctx.fill();
    px(ctx, ox + 9, 6, 3, 2, hex(0xa87048));
  },
  hide_vest: (ctx: Ctx, ox: number) => {
    px(ctx, ox + 3, 3, 10, 11, hex(0x8a5a3a));
    px(ctx, ox + 1, 3, 3, 6, hex(0x8a5a3a));
    px(ctx, ox + 12, 3, 3, 6, hex(0x8a5a3a));
    px(ctx, ox + 7, 3, 2, 11, hex(0x5e3c26));
    for (let y = 5; y < 13; y += 3) px(ctx, ox + 6, y, 4, 1, hex(0xd8c8a0));
  },
  leaf_cape: (ctx: Ctx, ox: number) => {
    for (let r = 0; r < 4; r++) for (let i = 0; i < 4 - (r === 0 ? 1 : 0); i++) ellipse(ctx, ox + 4 + i * 3 + (r % 2), 4 + r * 3, 2.2, 2, hex(r % 2 ? 0x3f7a3a : 0x4f9a46));
    px(ctx, ox + 5, 2, 6, 1, hex(0x8a7a44));
  },
  bark_sandals: (ctx: Ctx, ox: number) => {
    ellipse(ctx, ox + 5, 9, 3, 6, hex(0x6b4a2e));
    ellipse(ctx, ox + 11, 8, 3, 6, hex(0x6b4a2e));
    px(ctx, ox + 3, 6, 5, 1, hex(0xa87048));
    px(ctx, ox + 9, 5, 5, 1, hex(0xa87048));
  },
} as const;
