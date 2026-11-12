import Phaser from 'phaser';
import type { EnemyDef, StealthConfig } from '../data/schema';
import { perceive, sightRange, type Perceived } from '../systems/Perception';
import { CREATURE_POSE, TEX } from '../textures';
import { DEPTH, FONTS, ySort } from '../config';

export type EnemyState = 'wander' | 'investigate' | 'return' | 'chase' | 'telegraph' | 'attack' | 'recover' | 'flee' | 'fade' | 'stunned';

const ELITE_TINT = 0xffd27a;

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
  /** M12 stealth: what the player gives away this frame. */
  readonly stealth: StealthConfig;
  readonly noise: number;
  readonly hidden: boolean;
  readonly crouching: boolean;
  readonly night: boolean;
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
  /** M12: 0..1 — how sure it is the player is near (1 = alerted). */
  awareness = 0;
  /** Where it last heard or saw the player (investigation target). */
  private invX = 0;
  private invY = 0;
  homeX = 0;
  homeY = 0;
  elite = false;
  private damageMult = 1;
  private patrolAngle = 0;
  private lastCheckX = 0;
  private lastCheckY = 0;
  private nextCheckAt = 0;
  private stuckMs = 0;
  private sideUntil = 0;
  private sideX = 0;
  private sideY = 0;
  private readonly marker: Phaser.GameObjects.Text;
  private readonly sense: Perceived = { awareness: 0, seen: false, heard: false };

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, TEX.creatures, 'boar-0');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    this.setActive(false).setVisible(false);
    this.body.enable = false;
    this.marker = scene.add
      .text(0, 0, '', { fontFamily: FONTS.ui, fontSize: '14px', fontStyle: '700', color: '#e6b866', stroke: '#071210', strokeThickness: 3 })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.floatingText - 6)
      .setVisible(false);
  }

  get isFlying(): boolean {
    return this.def?.flying === true;
  }

  /** Centre used for hit tests. */
  get cy(): number {
    return this.y - 10;
  }

  spawn(def: EnemyDef, x: number, y: number, now: number, elite = false, eliteHp = 1, eliteDamage = 1): void {
    this.def = def;
    this.elite = elite;
    this.hp = elite ? Math.round(def.hp * eliteHp) : def.hp;
    this.damageMult = elite ? eliteDamage : 1;
    this.awareness = 0;
    this.homeX = x;
    this.homeY = y;
    this.invX = x;
    this.invY = y;
    this.maxHpAtSpawn = this.hp;
    this.wantsMove = false;
    this.patrolAngle = Math.random() * Math.PI * 2;
    this.lastCheckX = x;
    this.lastCheckY = y;
    this.nextCheckAt = 0;
    this.stuckMs = 0;
    this.sideUntil = 0;
    this.marker.setVisible(false);
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
    this.setScale(def.boss ? 1.9 : elite ? 1.15 : 1);
    if (elite) this.setTint(ELITE_TINT);
    else if (def.boss) this.setTint(0x9a8a78);
  }

  private maxHpAtSpawn = 0;
  /** M15 set-piece tuning (boss): stun length after a charge into something solid; damage taken. */
  stunMs = 2600;
  vulnerableMultiplier = 3;
  armouredDamage = 1;
  /** Damage the last landed hit actually dealt (after armour), for feedback. */
  lastDamage = 0;
  /** The last hit was turned by armour (boss not stunned). */
  lastArmoured = false;
  private chargeStartedAt = 0;
  /** Set by move() each frame: the creature is trying to go somewhere (for stuck detection). */
  private wantsMove = false;

  /** Max hp including the elite bonus. */
  get maxHp(): number {
    return this.maxHpAtSpawn;
  }

  /** Points the creature at a place it should search (ambushes), with a starting awareness. */
  alertTo(x: number, y: number, awareness: number): void {
    this.invX = x;
    this.invY = y;
    this.awareness = Math.max(this.awareness, awareness);
  }

  override destroy(fromScene?: boolean): void {
    this.marker.destroy();
    super.destroy(fromScene);
  }

  despawn(): void {
    this.marker.setVisible(false);
    this.scene.tweens.killTweensOf(this);
    this.setActive(false).setVisible(false);
    this.body.stop();
    this.body.enable = false;
  }

  /** Returns true if the hit landed (not during invulnerability). */
  takeHit(damage: number, fromX: number, fromY: number, knockback: number, iFramesMs: number, now: number): boolean {
    if (!this.active || now < this.invulnUntil || this.aiState === 'fade') return false;
    // A set-piece boss is armoured: only a stunned boss takes full (multiplied) damage.
    this.lastArmoured = this.def.boss === true && this.aiState !== 'stunned';
    if (this.def.boss) damage = this.lastArmoured ? this.armouredDamage : damage * this.vulnerableMultiplier;
    this.lastDamage = damage;
    this.hp -= damage;
    this.invulnUntil = now + iFramesMs;
    const dx = this.x - fromX;
    const dy = this.cy - fromY;
    const d = Math.hypot(dx, dy) || 1;
    this.body.setVelocity((dx / d) * knockback, (dy / d) * knockback);
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => {
      this.clearTint();
      if (this.elite) this.setTint(ELITE_TINT);
      else if (this.def.boss) this.setTint(0x9a8a78);
    });
    // A hit always gives you away.
    this.awareness = 1;
    // Being hit interrupts a wind-up (rewards aggression) and provokes the creature.
    if (!this.def.boss && (this.aiState === 'telegraph' || this.aiState === 'wander' || this.aiState === 'chase')) this.setAi('recover', now, 300);
    if (this.wounded) this.setAi('flee', now, 4000);
    return true;
  }

  /** Below its flee threshold: retreats instead of re-engaging. */
  get wounded(): boolean {
    return this.def.fleeBelowHp > 0 && this.hp > 0 && this.hp / this.def.hp < this.def.fleeBelowHp;
  }

  get dead(): boolean {
    return this.hp <= 0;
  }

  /** Spirits dissolve at dawn instead of dying. */
  fadeAway(now: number): void {
    if (this.aiState === 'fade') return;
    this.marker.setVisible(false);
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
    this.wantsMove = false;
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
        if (this.marker.visible) this.marker.setVisible(false);
        return;
      }
    }

    const passive = d.kind === 'spirit' && w.spiritWard;
    // M12 perception: sight shrinks when the player hides or crouches (and for animals at night);
    // noise carries further than sight when the player runs or works.
    const cfg = w.stealth;
    const sight = sightRange(cfg, d.aggroRadius, w.hidden, w.crouching, w.night, d.kind === 'wildlife');
    if (!passive && this.aiState !== 'flee') {
      const s = perceive(cfg, this.awareness, dist, sight, w.noise, d.hearing ?? 1, dtMs / 1000, this.sense);
      this.awareness = s.awareness;
      if (s.seen || s.heard) {
        this.invX = w.playerX;
        this.invY = w.playerY + 10;
      }
    } else if (passive) this.awareness = 0;
    const alerted = this.awareness >= 1;
    const aggro = !passive && alerted;
    const leashed = dist > d.leashRadius || this.outsideTerritory(1);

    switch (this.aiState) {
      case 'wander':
        if (aggro && this.wounded) this.setAi('flee', now, 4000);
        else if (aggro) this.setAi('chase', now);
        else if (!passive && this.awareness >= cfg.awareness.investigateAt) this.setAi('investigate', now, cfg.investigateSeconds * 1000);
        else if (d.kind === 'wildlife' && this.outsideTerritory(0.7)) this.setAi('return', now);
        else this.wander(w, dtMs);
        break;
      case 'investigate': {
        if (aggro) {
          this.setAi(this.wounded ? 'flee' : 'chase', now, this.wounded ? 4000 : 0);
          break;
        }
        const ix = this.invX - this.x;
        const iy = this.invY - this.y;
        const id = Math.hypot(ix, iy);
        if (id > 12 && !this.outsideTerritory(1)) {
          this.move((ix / id) * d.speed * 0.6, (iy / id) * d.speed * 0.6, w);
          this.animateMove(now);
        } else {
          this.body.setVelocity(0, 0);
          this.pose(CREATURE_POSE.idle);
        }
        if (now >= this.stateUntil || this.awareness <= 0.05 || passive) this.setAi('wander', now);
        break;
      }
      case 'return': {
        if (aggro && !this.outsideTerritory(1)) {
          this.setAi(this.wounded ? 'flee' : 'chase', now, this.wounded ? 4000 : 0);
          break;
        }
        if (aggro && this.awareness >= 1 && this.hp < this.maxHpAtSpawn) {
          // Struck on the way home: turn and fight back briefly.
          this.homeX = this.x;
          this.homeY = this.y;
          this.setAi('chase', now);
          break;
        }
        const hx = this.homeX - this.x;
        const hy = this.homeY - this.y;
        const hd = Math.hypot(hx, hy);
        if (hd < 30) {
          this.setAi('wander', now);
          break;
        }
        this.move((hx / hd) * d.speed * 0.8, (hy / hd) * d.speed * 0.8, w);
        this.animateMove(now);
        break;
      }
      case 'chase':
        if (passive) {
          this.setAi('wander', now);
          break;
        }
        // Lost the player (hidden / out of range): search where it last sensed them.
        if (this.awareness < cfg.awareness.loseAt) {
          this.setAi('investigate', now, cfg.investigateSeconds * 1000);
          break;
        }
        if (leashed) {
          this.awareness = 0.2;
          this.setAi(d.kind === 'wildlife' ? 'return' : 'wander', now);
          break;
        }
        this.chase(w, dist, ux, uy);
        break;
      case 'telegraph':
        if (passive) {
          this.setAi('wander', now);
          break;
        }
        this.body.setVelocity(0, 0);
        this.pose(CREATURE_POSE.telegraph);
        // Small shake so the wind-up reads even in the dark.
        this.x += Math.sin(now / 25) * 0.4;
        if (now >= this.stateUntil) this.beginAttack(w, ux, uy);
        break;
      case 'stunned':
        // Dazed after charging into something solid: the opening to strike back.
        this.body.setVelocity(0, 0);
        this.pose(CREATURE_POSE.idle);
        this.x += Math.sin(now / 40) * 0.5;
        if (now >= this.stateUntil) this.setAi('recover', now, 500);
        break;
      case 'attack':
        this.pose(CREATURE_POSE.attack);
        this.attack(w, dist);
        if (now >= this.stateUntil) this.setAi('recover', now, 700);
        break;
      case 'recover':
        this.body.velocity.scale(Math.pow(0.02, dtMs / 1000));
        this.pose(CREATURE_POSE.idle);
        if (now >= this.stateUntil) this.setAi(aggro && this.wounded ? 'flee' : aggro ? 'chase' : 'wander', now, aggro && this.wounded ? 4000 : 0);
        break;
      case 'flee':
        this.move(-ux * d.speed * 1.25, -uy * d.speed * 1.25, w);
        this.animateMove(now);
        if (now >= this.stateUntil || dist > d.leashRadius) this.setAi('wander', now);
        break;
    }
    this.checkStuck(w, dtMs);
    this.setDepth(ySort(this.y));
    this.setFlipX(this.body.velocity.x < -5 || (this.aiState === 'telegraph' && ux < 0));
    this.updateMarker();
  }

  /** "?" while searching, "!" when it has spotted you — readable warning before any attack. */
  private updateMarker(): void {
    const s = this.aiState;
    const t = s === 'investigate' ? '?' : s === 'chase' || s === 'telegraph' ? '!' : s === 'stunned' ? '✶' : '';
    if (!t || this.alpha < 0.3) {
      if (this.marker.visible) this.marker.setVisible(false);
      return;
    }
    if (this.marker.text !== t) this.marker.setText(t).setColor(t === '!' ? '#d9644a' : t === '✶' ? '#ffffff' : '#e6b866');
    this.marker.setVisible(true).setPosition(this.x, this.y - this.displayHeight - 2);
  }

  /** Wildlife keeps to a territory around where it appeared. */
  private outsideTerritory(frac: number): boolean {
    const t = this.def.territory;
    return t !== undefined && Math.hypot(this.x - this.homeX, this.y - this.homeY) > t * frac;
  }

  /**
   * Stuck on solid geometry? Every checkMs, if it tried to move but barely did, sidestep along a
   * perpendicular for a moment; if that keeps failing, give up the chase/search instead of
   * pressing into the obstacle forever.
   */
  private checkStuck(w: EnemyWorld, dtMs: number): void {
    if (this.def.flying) return;
    const cfg = w.stealth.stuck;
    const trying = this.wantsMove;
    if (w.now < this.nextCheckAt) return;
    this.nextCheckAt = w.now + cfg.checkMs;
    const moved = Math.hypot(this.x - this.lastCheckX, this.y - this.lastCheckY);
    this.lastCheckX = this.x;
    this.lastCheckY = this.y;
    if (!trying || moved >= cfg.minMove) {
      this.stuckMs = 0;
      return;
    }
    this.stuckMs += cfg.checkMs;
    const vx = this.body.velocity.x || this.dirX;
    const vy = this.body.velocity.y || this.dirY;
    const len = Math.hypot(vx, vy) || 1;
    const sign = Math.random() < 0.5 ? 1 : -1;
    this.sideX = (-vy / len) * sign;
    this.sideY = (vx / len) * sign;
    this.sideUntil = w.now + 450;
    if (this.stuckMs >= cfg.giveUpMs) {
      this.stuckMs = 0;
      if (this.aiState === 'chase' || this.aiState === 'investigate') this.awareness = Math.min(this.awareness, 0.2);
      if (this.aiState === 'return') {
        this.homeX = this.x;
        this.homeY = this.y;
      }
      this.setAi('wander', w.now);
      this.nextWanderAt = 0;
    }
    void dtMs;
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
      this.chargeStartedAt = now;
      this.setAi('attack', now, d.charge.durationMs);
      return;
    }
    this.setAi('attack', now, 220);
  }

  private attack(w: EnemyWorld, dist: number): void {
    const d = this.def;
    if (d.charge) {
      const water = !d.flying && w.blocked(this.x + this.dirX * 14, this.y + this.dirY * 14);
      const solid = !this.body.touching.none || !this.body.blocked.none;
      if (d.boss && w.now - this.chargeStartedAt > 120 && (water || solid)) {
        this.body.setVelocity(0, 0);
        this.setAi('stunned', w.now, this.stunMs);
        return;
      }
      if (water) this.body.setVelocity(0, 0);
      if (d.kind === 'spirit' && w.lightAt(this.x, this.cy, 4)) {
        this.body.setVelocity(0, 0);
        return;
      }
    }
    if (!this.hitThisAttack && d.behavior !== 'caster' && dist <= d.attackRange + (d.charge ? 0 : 10)) {
      this.hitThisAttack = true;
      w.hitPlayer(this, Math.round(d.damage * this.damageMult));
      if (d.charge) this.body.setVelocity(-this.dirX * 60, -this.dirY * 60);
    }
  }

  private wander(w: EnemyWorld, dtMs: number): void {
    const now = w.now;
    const pr = this.def.patrolRadius;
    if (pr) {
      // Spirits patrol a slow loop around where they appeared.
      this.patrolAngle += ((this.def.speed * WANDER_SPEED) / pr) * (dtMs / 1000);
      const tx = this.homeX + Math.cos(this.patrolAngle) * pr - this.x;
      const ty = this.homeY + Math.sin(this.patrolAngle) * pr - this.y;
      const td = Math.hypot(tx, ty) || 1;
      const sp = Math.min(this.def.speed * 0.5, td * 3);
      this.dirX = tx / td;
      this.dirY = ty / td;
      this.move(this.dirX * sp, this.dirY * sp, w);
      this.animateMove(now);
      return;
    }
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
    if (vx || vy) this.wantsMove = true;
    if (w.now < this.sideUntil && (vx || vy)) {
      const sp = Math.hypot(vx, vy);
      vx = this.sideX * sp;
      vy = this.sideY * sp;
    }
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
