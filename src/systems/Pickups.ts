import Phaser from 'phaser';
import { PICKUP } from '../config';
import type { IconKey } from '../textures';
import { TEX } from '../textures';

export interface PickupHooks {
  iconFor(item: string): IconKey;
  /** Free capacity for this item in the player's inventory. */
  capacityFor(item: string): number;
  /** Adds to inventory; returns the amount that did NOT fit. */
  add(item: string, qty: number): number;
  onCollected(item: string, qty: number, x: number, y: number): void;
  onInventoryFull(): void;
}

interface Pickup {
  image: Phaser.GameObjects.Image;
  item: string;
  qty: number;
  active: boolean;
  /** Set the instant a pickup is claimed so it can never be added twice. */
  claimed: boolean;
  collectableAt: number;
  /** Player-dropped items only become collectable after the player has stepped away once. */
  armed: boolean;
  /** Game time when the spawn pop finishes; before that the tween owns the position. */
  settleAt: number;
  baseY: number;
  phase: number;
}

/**
 * Pooled ground items. No physics bodies: collection is a distance check each frame,
 * which also means nothing can leave phantom colliders behind.
 */
export class Pickups {
  private readonly pool: Pickup[] = [];
  private lastFullWarn = -Infinity;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly hooks: PickupHooks,
  ) {
    for (let i = 0; i < PICKUP.poolSize; i++) this.grow();
  }

  private grow(): Pickup {
    const image = this.scene.add.image(0, 0, TEX.icons, 'wood').setOrigin(0.5, 1).setVisible(false).setActive(false);
    const p: Pickup = {
      image,
      item: '',
      qty: 0,
      active: false,
      claimed: false,
      collectableAt: 0,
      armed: true,
      settleAt: 0,
      baseY: 0,
      phase: 0,
    };
    this.pool.push(p);
    return p;
  }

  /** Ground stacks that can still be created (free pool entries + room to grow). */
  get freeSlots(): number {
    let free = PICKUP.maxPool - this.pool.length;
    for (const p of this.pool) if (!p.active) free++;
    return free;
  }

  get activeCount(): number {
    let n = 0;
    for (const p of this.pool) if (p.active) n++;
    return n;
  }

  /**
   * Spawns a ground stack near (x, y). The pool grows up to PICKUP.maxPool; beyond that the
   * quantity merges into an existing ground stack of the same item. Returns false only if
   * neither is possible, so callers must keep the items (never silently lost).
   */
  spawn(
    item: string,
    qty: number,
    x: number,
    y: number,
    now: number,
    delayMs = 0,
    scatter: number = PICKUP.scatter,
    droppedByPlayer = false,
  ): boolean {
    if (qty <= 0) return false;
    let p = this.pool.find((c) => !c.active);
    if (!p && this.pool.length < PICKUP.maxPool) p = this.grow();
    if (!p) {
      let same: Pickup | null = null;
      let best = Infinity;
      for (const c of this.pool) {
        if (!c.active || c.claimed || c.item !== item) continue;
        const d = Math.hypot(c.image.x - x, c.baseY - y);
        if (d < best) {
          best = d;
          same = c;
        }
      }
      if (!same) return false;
      same.qty += qty;
      return true;
    }
    const tx = x + (Math.random() * 2 - 1) * scatter;
    const ty = y + (Math.random() * 2 - 1) * scatter * 0.6;
    p.item = item;
    p.qty = qty;
    p.active = true;
    p.claimed = false;
    p.collectableAt = now + delayMs;
    p.armed = !droppedByPlayer;
    p.settleAt = now + 280;
    p.baseY = ty;
    p.phase = Math.random() * Math.PI * 2;
    this.scene.tweens.killTweensOf(p.image);
    p.image
      .setFrame(this.hooks.iconFor(item))
      .setPosition(x, y)
      .setAlpha(1)
      .setScale(0.4)
      .setVisible(true)
      .setActive(true)
      .setDepth(ty);
    this.scene.tweens.add({ targets: p.image, x: tx, y: ty, scale: 1, duration: 260, ease: 'Back.easeOut' });
    return true;
  }

  update(px: number, py: number, dtMs: number, now: number): void {
    const step = (PICKUP.magnetSpeed * dtMs) / 1000;
    const cy = py - 6;
    for (const p of this.pool) {
      if (!p.active || p.claimed) continue;
      const img = p.image;
      if (now < p.collectableAt) continue;
      const dx = px - img.x;
      const dy = cy - p.baseY;
      const dist = Math.hypot(dx, dy);
      if (!p.armed) {
        if (dist > PICKUP.magnetRadius + 8) p.armed = true;
        else continue;
      }

      if (dist <= PICKUP.magnetRadius) {
        if (this.hooks.capacityFor(p.item) <= 0) {
          if (dist <= PICKUP.collectRadius + 8 && now - this.lastFullWarn > PICKUP.fullWarnCooldownMs) {
            this.lastFullWarn = now;
            this.hooks.onInventoryFull();
          }
        } else if (dist <= PICKUP.collectRadius) {
          this.collect(p);
          continue;
        } else if (now >= p.settleAt) {
          img.x += (dx / dist) * Math.min(step, dist);
          p.baseY += (dy / dist) * Math.min(step, dist);
        }
      }
      if (now >= p.settleAt) {
        img.y = p.baseY - 1.5 - Math.sin(now / 260 + p.phase) * 1.5;
        img.setDepth(p.baseY);
      }
    }
  }

  private collect(p: Pickup): void {
    const leftover = this.hooks.add(p.item, p.qty);
    const taken = p.qty - leftover;
    if (taken > 0) this.hooks.onCollected(p.item, taken, p.image.x, p.baseY);
    if (leftover > 0) {
      p.qty = leftover;
      return;
    }
    p.claimed = true;
    this.scene.tweens.killTweensOf(p.image);
    this.scene.tweens.add({
      targets: p.image,
      y: p.image.y - 10,
      alpha: 0,
      scale: 0.6,
      duration: 160,
      onComplete: () => this.release(p),
    });
  }

  private release(p: Pickup): void {
    p.active = false;
    p.claimed = false;
    p.image.setVisible(false).setActive(false);
  }
}
