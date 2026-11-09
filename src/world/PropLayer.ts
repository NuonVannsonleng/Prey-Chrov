import Phaser from 'phaser';
import { CANOPY, DEPTH, ySort } from '../config';
import { CANOPY_SIZE, TEX, type ResourceSprite } from '../textures';

/** Collider footprints (px) at each gatherable prop's base. */
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
 * Shared static collider group plus the canopy registry that fades leaves over the player.
 * Chunks add and remove their solids/canopies here as they load and unload.
 */
export class PropLayer {
  readonly solids: Phaser.Physics.Arcade.StaticGroup;
  private readonly canopies = new Set<Canopy>();

  constructor(private readonly scene: Phaser.Scene) {
    this.solids = scene.physics.add.staticGroup();
  }

  /** Creates a static collider zone whose bottom edge sits at the prop's base. */
  addSolid(x: number, baseY: number, size: { w: number; h: number }): Phaser.GameObjects.Zone {
    const zone = this.scene.add.zone(x, baseY - size.h / 2 - 1, size.w, size.h);
    this.scene.physics.add.existing(zone, true);
    this.solids.add(zone);
    return zone;
  }

  /** Removes a solid from the group and destroys its body (no phantom colliders). */
  removeSolid(zone: Phaser.GameObjects.Zone): void {
    this.solids.remove(zone, true, true);
  }

  addCanopy(trunkX: number, trunkBaseY: number, variant: number, scale = 1, lift = 70): Canopy {
    const cx = trunkX;
    const cy = trunkBaseY - lift * scale;
    const image = this.scene.add.image(cx, cy, TEX.canopy, variant).setScale(scale).setDepth(DEPTH.canopy + ySort(trunkBaseY) - DEPTH.actors);
    const hw = CANOPY_SIZE.w * 0.4 * scale;
    const hh = CANOPY_SIZE.h * 0.4 * scale;
    const canopy = { image, left: cx - hw, right: cx + hw, top: cy - hh, bottom: cy + hh + 12 };
    this.canopies.add(canopy);
    return canopy;
  }

  removeCanopy(c: Canopy): void {
    this.canopies.delete(c);
    c.image.destroy();
  }

  get canopyCount(): number {
    return this.canopies.size;
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
