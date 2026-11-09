import Phaser from 'phaser';
import type { EnemyDef } from '../data/schema';
import { CREATURE_POSE, TEX } from '../textures';

export type EnemyState = 'wander' | 'chase' | 'telegraph' | 'attack' | 'recover' | 'flee' | 'fade';

/** World services an enemy needs; implemented by the encounter system (no direct scene access). */
export interface EnemyWorld {
  readonly now: number;
  readonly playerX: number;
  /** Player body centre (feet − 10). */
  readonly playerY: number;
  /** Spirits are warded off (shrine blessing). */
  readonly spiritWard: boolean;
  /** Daylight returning: spirits fade away. */
  readonly dawn: boolean;
  /** Light source covering a point (+margin)? Returns the light centre or null. */
  lightAt(x: number, y: number, margin: number): { x: number; y: number; radius: number } | null;
  /** Deep water or out-of-world ahead for walkers. */
  blocked(x: number, y: number): boolean;
  hitPlayer(enemy: Enemy, damage: number): void;
  fireOrb(enemy: Enemy, dirX: number, dirY: number): void;
}

const WANDER_SPEED = 0.35;

/**
 * Pooled creature with a small, readable state machine per behaviour:
 * charger (boar), striker (viper), stalker (tiger), flier (Ap), caster (Arak).
 * Every attack is preceded by a visible telegraph pose for `def.telegraphMs`.
 */
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  def!: EnemyDef;
  hp = 0;
  aiState: EnemyState = 'wander';
  private stateUntil = 0;
  private attackReadyAt = 0;
  private invulnUntil = 0;
  private dirX = 1;
  private dirY = 0;
  private hitThisAttack = false;
  private nextWanderAt = 0;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, TEX.creatures, 'boar-0');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    this.setActive(false).setVisible(false);
    this.body.enable = false;
  }

  get isFlying(): boolean {
    return this.def?.flying === true;
  }

  /** Centre used for hit tests. */
  get cy(): number {
    return this.y - 10;
  }

  spawn(def: EnemyDef, x: number, y: number, now: number): void {
    this.def = def;
    this.hp = def.hp;
    this.aiState = 'wander';
    this.stateUntil = 0;
    this.attackReadyAt = now + 800;
    this.invulnUntil = 0;
    this.nextWanderAt = 0;
    this.setPosition(x, y).setActive(true).setVisible(true).setAlpha(def.kind === 'spirit' ? 0 : 1).clearTint();
    this.setFrame(`${def.sprite}-0`);
    this.body.enable = true;
    this.body.reset(x, y);
    const w = def.sprite === 'tiger' ? 30 : def.sprite === 'snake' ? 18 : 20;
    this.body.setSize(w, 10, false).setOffset((this.width - w) / 2, this.height - 10);
    if (def.kind === 'spirit') this.scene.tweens.add({ targets: this, alpha: 0.92, duration: 600 });
  }

  despawn(): void {
    this.scene.tweens.killTweensOf(this);
    this.setActive(false).setVisible(false);
    this.body.stop();
    this.body.enable = false;
  }

  /** Returns true if the hit landed (not during invulnerability). */
  takeHit(damage: number, fromX: number, fromY: number, knockback: number, iFramesMs: number, now: number): boolean {
    if (!this.active || now < this.invulnUntil || this.aiState === 'fade') return false;
    this.hp -= damage;
    this.invulnUntil = now + iFramesMs;
    const dx = this.x - fromX;
    const dy = this.cy - fromY;
    const d = Math.hypot(dx, dy) || 1;
    this.body.setVelocity((dx / d) * knockback, (dy / d) * knockback);
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => this.clearTint());
    // Being hit interrupts a wind-up (rewards aggression) and provokes the creature.
    if (this.aiState === 'telegraph' || this.aiState === 'wander') this.setAi('recover', now, 350);
    if (this.def.fleeBelowHp > 0 && this.hp / this.def.hp < this.def.fleeBelowHp) this.setAi('flee', now, 4000);
    return true;
  }

  get dead(): boolean {
    return this.hp <= 0;
  }

  /** Spirits dissolve at dawn instead of dying. */
  fadeAway(now: number): void {
    if (this.aiState === 'fade') return;
    this.setAi('fade', now, 1200);
    this.body.setVelocity(0, 0);
    this.scene.tweens.add({ targets: this, alpha: 0, duration: 1100 });
  }

  update2(w: EnemyWorld, dtMs: number): void {
    if (!this.active) return;
    const now = w.now;
    const d = this.def;
    const dx = w.playerX - this.x;
    const dy = w.playerY - this.cy;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;

    if (this.aiState === 'fade') return;
    if (d.kind === 'spirit' && w.dawn) return this.fadeAway(now);

    // Spirits are pushed out of light and never act inside it.
    if (d.avoidsLight) {
      const light = w.lightAt(this.x, this.cy, 10);
      if (light) {
        const lx = this.x - light.x;
        const ly = this.cy - light.y;
        const ld = Math.hypot(lx, ly) || 1;
        this.move((lx / ld) * d.speed, (ly / ld) * d.speed, w);
        if (this.aiState === 'telegraph' || this.aiState === 'attack') this.setAi('recover', now, 500);
        this.pose(CREATURE_POSE.moveA);
        return;
      }
    }

    const passive = d.kind === 'spirit' && w.spiritWard;
    const aggro = !passive && dist <= d.aggroRadius;
    const leashed = dist > d.leashRadius;

    switch (this.aiState) {
      case 'wander':
        if (aggro) this.setAi('chase', now);
        else this.wander(w, dtMs);
        break;
      case 'chase':
        if (passive || leashed) {
          this.setAi('wander', now);
          break;
        }
        this.chase(w, dist, ux, uy);
        break;
      case 'telegraph':
        this.body.setVelocity(0, 0);
        this.pose(CREATURE_POSE.telegraph);
        // Small shake so the wind-up reads even in the dark.
        this.x += Math.sin(now / 25) * 0.4;
        if (now >= this.stateUntil) this.beginAttack(w, ux, uy);
        break;
      case 'attack':
        this.pose(CREATURE_POSE.attack);
        this.attack(w, dist);
        if (now >= this.stateUntil) this.setAi('recover', now, 700);
        break;
      case 'recover':
        this.body.velocity.scale(Math.pow(0.02, dtMs / 1000));
        this.pose(CREATURE_POSE.idle);
        if (now >= this.stateUntil) this.setAi(aggro ? 'chase' : 'wander', now);
        break;
      case 'flee':
        this.move(-ux * d.speed * 1.25, -uy * d.speed * 1.25, w);
        this.animateMove(now);
        if (now >= this.stateUntil || dist > d.leashRadius) this.setAi('wander', now);
        break;
    }
    this.setDepth(this.y);
    this.setFlipX(this.body.velocity.x < -5 || (this.aiState === 'telegraph' && ux < 0));
  }

  private chase(w: EnemyWorld, dist: number, ux: number, uy: number): void {
    const d = this.def;
    const now = w.now;
    const ready = now >= this.attackReadyAt;
    switch (d.behavior) {
      case 'charger':
      case 'flier': {
        // Approach to a wind-up distance, then commit to a straight dash.
        const windup = d.behavior === 'flier' ? 110 : 150;
        if (ready && dist <= windup + 20) return this.startTelegraph(now, ux, uy);
        const orbit = d.behavior === 'flier' && !ready;
        const sx = orbit ? -uy * 0.8 + ux * 0.2 : ux;
        const sy = orbit ? ux * 0.8 + uy * 0.2 : uy;
        this.move(sx * d.speed, sy * d.speed, w);
        break;
      }
      case 'stalker': {
        // Circle at a distance, then pounce.
        if (ready && dist <= 120) return this.startTelegraph(now, ux, uy);
        const tangent = dist < 100 ? 1 : 0.4;
        this.move((ux * (1 - tangent) - uy * tangent) * d.speed, (uy * (1 - tangent) + ux * tangent) * d.speed, w);
        break;
      }
      case 'striker':
        if (ready && dist <= d.attackRange + 8) return this.startTelegraph(now, ux, uy);
        this.move(ux * d.speed, uy * d.speed, w);
        break;
      case 'caster': {
        // Keep a comfortable distance and cast from range.
        const range = d.projectile?.range ?? 200;
        if (ready && dist <= range * 0.9 && dist >= 70) return this.startTelegraph(now, ux, uy);
        const want = dist < 130 ? -1 : dist > 170 ? 1 : 0;
        this.move((ux * want - uy * 0.5) * d.speed, (uy * want + ux * 0.5) * d.speed, w);
        break;
      }
    }
    this.animateMove(now);
  }

  private startTelegraph(now: number, ux: number, uy: number): void {
    this.dirX = ux;
    this.dirY = uy;
    this.body.setVelocity(0, 0);
    this.setAi('telegraph', now, this.def.telegraphMs);
  }

  private beginAttack(w: EnemyWorld, ux: number, uy: number): void {
    const d = this.def;
    const now = w.now;
    this.hitThisAttack = false;
    this.attackReadyAt = now + d.attackCooldownMs;
    if (d.behavior === 'caster') {
      w.fireOrb(this, ux, uy);
      this.setAi('attack', now, 250);
      return;
    }
    if (d.charge) {
      // Charges keep the direction locked at the end of the telegraph (sidestep to dodge).
      if (d.kind === 'spirit') {
        const tx = this.x + this.dirX * 120;
        const ty = this.cy + this.dirY * 120;
        if (w.lightAt(tx, ty, 4)) return this.setAi('recover', now, 600);
      }
      this.body.setVelocity(this.dirX * d.charge.speed, this.dirY * d.charge.speed);
      this.setAi('attack', now, d.charge.durationMs);
      return;
    }
    this.setAi('attack', now, 220);
  }

  private attack(w: EnemyWorld, dist: number): void {
    const d = this.def;
    if (d.charge) {
      if (!d.flying && w.blocked(this.x + this.dirX * 14, this.y + this.dirY * 14)) this.body.setVelocity(0, 0);
      if (d.kind === 'spirit' && w.lightAt(this.x, this.cy, 4)) {
        this.body.setVelocity(0, 0);
        return;
      }
    }
    if (!this.hitThisAttack && d.behavior !== 'caster' && dist <= d.attackRange) {
      this.hitThisAttack = true;
      w.hitPlayer(this, d.damage);
      if (d.charge) this.body.setVelocity(-this.dirX * 60, -this.dirY * 60);
    }
  }

  private wander(w: EnemyWorld, _dtMs: number): void {
    const now = w.now;
    if (now >= this.nextWanderAt) {
      this.nextWanderAt = now + 1500 + Math.random() * 2500;
      const a = Math.random() * Math.PI * 2;
      const moving = Math.random() < 0.6;
      this.dirX = moving ? Math.cos(a) : 0;
      this.dirY = moving ? Math.sin(a) : 0;
    }
    this.move(this.dirX * this.def.speed * WANDER_SPEED, this.dirY * this.def.speed * WANDER_SPEED, w);
    if (this.dirX || this.dirY) this.animateMove(now);
    else this.pose(CREATURE_POSE.idle);
  }

  /** Sets velocity, stopping walkers at deep water (they steer away next wander tick). */
  private move(vx: number, vy: number, w: EnemyWorld): void {
    if (!this.def.flying && (vx || vy)) {
      const len = Math.hypot(vx, vy) || 1;
      if (w.blocked(this.x + (vx / len) * 14, this.y + (vy / len) * 10)) {
        this.body.setVelocity(-vy * 0.6, vx * 0.6);
        this.nextWanderAt = 0;
        return;
      }
    }
    this.body.setVelocity(vx, vy);
  }

  private animateMove(now: number): void {
    this.pose(Math.floor(now / 140) % 2 === 0 ? CREATURE_POSE.moveA : CREATURE_POSE.moveB);
  }

  private pose(f: number): void {
    const frame = `${this.def.sprite}-${f}`;
    if (this.frame.name !== frame) this.setFrame(frame);
  }

  private setAi(s: EnemyState, now: number, durationMs = 0): void {
    this.aiState = s;
    this.stateUntil = now + durationMs;
  }
}
