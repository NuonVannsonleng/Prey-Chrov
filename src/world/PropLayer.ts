import Phaser from 'phaser';
import { CANOPY, DEPTH } from '../config';
import { CANOPY_SIZE, TEX, type ResourceSprite } from '../textures';
import type { Prop } from './TestMap';

/** Collider footprints (px) at each prop's base. */
export const FOOTPRINT: Record<ResourceSprite, { w: number; h: number }> = {
  tree: { w: 14, h: 10 },
  rock: { w: 24, h: 12 },
  bamboo: { w: 22, h: 10 },
  bush: { w: 18, h: 8 },
};

export interface Canopy {
  image: Phaser.GameObjects.Image;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Scenery props (ferns, non-gatherable trees), the shared static collider group
 * and the canopy registry that fades leaves over the player.
 */
export class PropLayer {
  readonly solids: Phaser.Physics.Arcade.StaticGroup;
  private readonly canopies: Canopy[] = [];

  constructor(private readonly scene: Phaser.Scene) {
    this.solids = scene.physics.add.staticGroup();
  }

  /** Adds scenery for every prop without a resource id. */
  addScenery(props: readonly Prop[]): void {
    for (const p of props) {
      if (p.resource !== null) continue;
      if (p.kind === 'fern') {
        this.scene.add.image(p.x, p.y, TEX.fern, p.variant).setOrigin(0.5, 1).setDepth(p.y);
      } else if (p.kind === 'tree') {
        this.scene.add.image(p.x, p.y, TEX.trunk, p.variant).setOrigin(0.5, 1).setDepth(p.y);
        this.addSolid(p.x, p.y, FOOTPRINT.tree);
        this.addCanopy(p.x, p.y, p.canopyVariant);
      }
    }
  }

  /** Creates a static collider zone whose bottom edge sits at the prop's base. */
  addSolid(x: number, baseY: number, size: { w: number; h: number }): Phaser.GameObjects.Zone {
    const zone = this.scene.add.zone(x, baseY - size.h / 2 - 1, size.w, size.h);
    this.scene.physics.add.existing(zone, true);
    this.solids.add(zone);
    return zone;
  }

  addCanopy(trunkX: number, trunkBaseY: number, variant: number): Canopy {
    const cx = trunkX;
    const cy = trunkBaseY - 70;
    const image = this.scene.add.image(cx, cy, TEX.canopy, variant).setDepth(DEPTH.canopy + trunkBaseY);
    const hw = CANOPY_SIZE.w * 0.4;
    const hh = CANOPY_SIZE.h * 0.4;
    const canopy = { image, left: cx - hw, right: cx + hw, top: cy - hh, bottom: cy + hh + 12 };
    this.canopies.push(canopy);
    return canopy;
  }

  /** Fades any visible canopy covering the target point; restores the rest. No allocations. */
  updateCanopies(px: number, py: number, dtMs: number): void {
    const step = (CANOPY.fadeRatePerSecond * dtMs) / 1000;
    const headY = py - 16;
    for (const c of this.canopies) {
      if (!c.image.visible) continue;
      const covered = px > c.left && px < c.right && headY > c.top && headY < c.bottom;
      const target = covered ? CANOPY.fadedAlpha : 1;
      const a = c.image.alpha;
      if (a === target) continue;
      c.image.setAlpha(a < target ? Math.min(target, a + step) : Math.max(target, a - step));
    }
  }
}
