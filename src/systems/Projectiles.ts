import Phaser from 'phaser';
import { DEPTH } from '../config';
import { TEX } from '../textures';

interface Orb {
  image: Phaser.GameObjects.Image;
  active: boolean;
  vx: number;
  vy: number;
  sx: number;
  sy: number;
  range: number;
  damage: number;
}

export interface ProjectileHooks {
  /** Player body centre. */
  playerX(): number;
  playerY(): number;
  /** Orbs fizzle on entering any light (the fire/torch promise holds for spirit attacks too). */
  inLight(x: number, y: number): boolean;
  hitPlayer(damage: number, fromX: number, fromY: number): void;
}

const POOL = 32;
const HIT_RADIUS = 11;

/** Pooled spirit orbs (Arak). No physics bodies: distance checks only, so nothing lingers. */
export class Projectiles {
  private readonly pool: Orb[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly hooks: ProjectileHooks,
  ) {
    for (let i = 0; i < POOL; i++) {
      const image = scene.add.image(0, 0, TEX.orb).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.floatingText - 5).setVisible(false);
      this.pool.push({ image, active: false, vx: 0, vy: 0, sx: 0, sy: 0, range: 0, damage: 0 });
    }
  }

  get activeCount(): number {
    let n = 0;
    for (const o of this.pool) if (o.active) n++;
    return n;
  }

  fire(x: number, y: number, dirX: number, dirY: number, speed: number, damage: number, range: number): boolean {
    const o = this.pool.find((p) => !p.active);
    if (!o) return false;
    // A recently fizzled orb may still be fading: stop that tween before reuse.
    this.scene.tweens.killTweensOf(o.image);
    const len = Math.hypot(dirX, dirY) || 1;
    o.active = true;
    o.vx = (dirX / len) * speed;
    o.vy = (dirY / len) * speed;
    o.sx = x;
    o.sy = y;
    o.range = range;
    o.damage = damage;
    o.image.setPosition(x, y).setScale(0.6).setAlpha(1).setVisible(true);
    return true;
  }

  update(dtMs: number, now: number): void {
    const dt = dtMs / 1000;
    const px = this.hooks.playerX();
    const py = this.hooks.playerY();
    for (const o of this.pool) {
      if (!o.active) continue;
      const img = o.image;
      img.x += o.vx * dt;
      img.y += o.vy * dt;
      img.setScale(0.6 + Math.sin(now / 60) * 0.08);
      if (Math.hypot(img.x - px, img.y - py) <= HIT_RADIUS) {
        this.hooks.hitPlayer(o.damage, img.x - o.vx * 0.05, img.y - o.vy * 0.05);
        this.release(o);
        continue;
      }
      if (Math.hypot(img.x - o.sx, img.y - o.sy) > o.range || this.hooks.inLight(img.x, img.y)) this.fizzle(o);
    }
  }

  clear(): void {
    for (const o of this.pool) if (o.active) this.release(o);
  }

  private fizzle(o: Orb): void {
    o.active = false;
    this.scene.tweens.add({ targets: o.image, alpha: 0, scale: 0.2, duration: 160, onComplete: () => o.image.setVisible(false) });
  }

  private release(o: Orb): void {
    this.scene.tweens.killTweensOf(o.image);
    o.active = false;
    o.image.setVisible(false);
  }
}
