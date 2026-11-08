import Phaser from 'phaser';
import { CANOPY } from '../config';
import { CANOPY_SIZE, TEX } from '../textures';
import type { Prop } from './TestMap';

const DEPTH_CANOPY = 100000;

/** Collider footprints (px) at each prop's base. */
const FOOTPRINT = {
  tree: { w: 14, h: 10 },
  rock: { w: 24, h: 12 },
} as const;

interface Canopy {
  image: Phaser.GameObjects.Image;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Renders map props, owns their static colliders and fades canopies over the player. */
export class PropLayer {
  readonly solids: Phaser.Physics.Arcade.StaticGroup;
  private readonly canopies: Canopy[] = [];

  constructor(scene: Phaser.Scene, props: readonly Prop[]) {
    this.solids = scene.physics.add.staticGroup();

    for (const p of props) {
      if (p.kind === 'fern') {
        scene.add.image(p.x, p.y, TEX.fern, p.variant).setOrigin(0.5, 1).setDepth(p.y);
        continue;
      }
      const tex = p.kind === 'tree' ? TEX.trunk : TEX.rock;
      scene.add.image(p.x, p.y, tex, p.variant).setOrigin(0.5, 1).setDepth(p.y);

      const fp = FOOTPRINT[p.kind];
      const zone = scene.add.zone(p.x, p.y - fp.h / 2 - 1, fp.w, fp.h);
      scene.physics.add.existing(zone, true);
      this.solids.add(zone);

      if (p.kind === 'tree') {
        const cx = p.x;
        const cy = p.y - 70;
        const image = scene.add.image(cx, cy, TEX.canopy, p.canopyVariant).setDepth(DEPTH_CANOPY + p.y);
        const hw = CANOPY_SIZE.w * 0.4;
        const hh = CANOPY_SIZE.h * 0.4;
        this.canopies.push({ image, left: cx - hw, right: cx + hw, top: cy - hh, bottom: cy + hh + 12 });
      }
    }
  }

  /** Fades any canopy covering the target point; restores the rest. No allocations. */
  updateCanopies(px: number, py: number, dtMs: number): void {
    const step = (CANOPY.fadeRatePerSecond * dtMs) / 1000;
    const headY = py - 16;
    for (const c of this.canopies) {
      const covered = px > c.left && px < c.right && headY > c.top && headY < c.bottom;
      const target = covered ? CANOPY.fadedAlpha : 1;
      const a = c.image.alpha;
      if (a === target) continue;
      c.image.setAlpha(a < target ? Math.min(target, a + step) : Math.max(target, a - step));
    }
  }

  get canopyCount(): number {
    return this.canopies.length;
  }
}
