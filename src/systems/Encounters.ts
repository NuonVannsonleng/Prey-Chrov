import Phaser from 'phaser';
import { CHUNK_TILES, TILE_SIZE } from '../config';
import type { BiomeId, EnemyDef, GameData } from '../data/schema';
import { Enemy, type EnemyWorld } from '../entities/Enemy';
import { gameEvents } from './GameEvents';
import { inArc } from './StatusEffects';

/** World services the encounter system needs (implemented by the World scene). */
export interface EncounterServices {
  isDeepWater(x: number, y: number): boolean;
  isLoaded(cx: number, cy: number): boolean;
  biomeAt(tx: number, ty: number): BiomeId;
  /** Light covering a point (with margin), or null. */
  lightAt(x: number, y: number, margin: number): { x: number; y: number; radius: number } | null;
  /** Distance to the nearest Neak Ta shrine (no spawns near shrines). */
  shrineDistance(x: number, y: number): number;
  /** Distance to the nearest outpost flag (no spawns close to one). */
  outpostDistance?(x: number, y: number): number;
  hitPlayer(enemy: Enemy, damage: number): void;
  fireOrb(enemy: Enemy, dirX: number, dirY: number): void;
  onKilled(enemy: Enemy): void;
}

export interface EncounterFrame {
  playerX: number;
  /** Player feet y. */
  playerY: number;
  darkness: number;
  day: number;
  spiritWard: boolean;
  /** M12: player noise radius, cover and crouch; monsoon; distance from spawn (tiles). */
  noise: number;
  hidden: boolean;
  crouching: boolean;
  monsoon: boolean;
  distTiles: number;
}

export { distanceDanger, eliteChance } from './Encounters.pure';
import { distanceDanger, eliteChance } from './Encounters.pure';

const MAX_POOL = 16;
/** No creature appears within this distance of an outpost flag (wider than the spawn ring). */
export const OUTPOST_SAFE_RADIUS = 600;
/** Outposts are camps, not a portable bubble: at most this many, this far apart. */
export const OUTPOST_MAX = 4;
export const OUTPOST_SPACING = 1200;
const NIGHT_DARKNESS = 0.5;
const DAWN_DARKNESS = 0.35;

/**
 * Finite, pooled creature population. Spawns off-screen in a ring around the player
 * using data weights (time of day, first day, biome, per-type caps), never in water,
 * solids, firelight or near shrines; despawns far creatures; spirits fade at dawn.
 * One collider (walkers vs static solids) for the whole pool.
 */
export class Encounters {
  readonly enemies: Enemy[] = [];
  readonly group: Phaser.Physics.Arcade.Group;
  private spawnTimer = 0;
  /** Natural spawning on/off (debug `?calm` turns it off for automated tests). */
  enabled = true;
  /** After the Heart is restored the restless ones grow quiet: night population is halved. */
  calmed = false;
  private readonly world: EnemyWorld & {
    now: number;
    playerX: number;
    playerY: number;
    spiritWard: boolean;
    dawn: boolean;
    noise: number;
    hidden: boolean;
    crouching: boolean;
    night: boolean;
  };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly data: GameData,
    solids: Phaser.Physics.Arcade.StaticGroup,
    private readonly services: EncounterServices,
  ) {
    this.group = scene.physics.add.group();
    scene.physics.add.collider(this.group, solids, undefined, (e) => !(e as Enemy).isFlying, this);
    const s = services;
    this.world = {
      now: 0,
      playerX: 0,
      playerY: 0,
      spiritWard: false,
      dawn: false,
      lightAt: (x, y, m) => s.lightAt(x, y, m),
      blocked: (x, y) => s.isDeepWater(x, y),
      hitPlayer: (e, d) => s.hitPlayer(e, d),
      fireOrb: (e, dx, dy) => s.fireOrb(e, dx, dy),
      stealth: data.stealth,
      noise: 0,
      hidden: false,
      crouching: false,
      night: false,
    };
  }

  get aliveCount(): number {
    let n = 0;
    for (const e of this.enemies) if (e.active) n++;
    return n;
  }

  update(dtMs: number, now: number, f: EncounterFrame): void {
    const w = this.world;
    w.now = now;
    w.playerX = f.playerX;
    w.playerY = f.playerY - 10;
    w.spiritWard = f.spiritWard;
    w.dawn = f.darkness < DAWN_DARKNESS;
    w.noise = f.noise;
    w.hidden = f.hidden;
    w.crouching = f.crouching;
    w.night = f.darkness > NIGHT_DARKNESS;

    for (const e of this.enemies) {
      if (!e.active) continue;
      if (e.aiState === 'fade' && e.alpha <= 0.02) {
        e.despawn();
        continue;
      }
      if (Math.hypot(e.x - f.playerX, e.y - f.playerY) > this.data.encounters.despawnDistance) {
        e.despawn();
        continue;
      }
      e.update2(w, dtMs);
    }

    const night = f.darkness > NIGHT_DARKNESS;
    const cfg = this.data.encounters;
    if (!this.enabled) return;
    this.spawnTimer -= dtMs / 1000;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = night ? cfg.spawnIntervalSeconds.night : cfg.spawnIntervalSeconds.day;
    if (this.aliveCount >= this.cap(night, f)) return;
    this.trySpawn(night, f, now);
  }

  /** Population cap: gentle first night, ramping with days survived, scaled by local biome danger. */
  cap(night: boolean, f: EncounterFrame): number {
    const cfg = this.data.encounters;
    if (!night) return Math.max(1, Math.round(cfg.maxAlive.day * distanceDanger(this.data.stealth.distanceDanger, f.distTiles)));
    const ramp = cfg.firstNightMax + Math.max(0, f.day - 1) * cfg.nightRampPerDay;
    const biome = this.data.biomes.get(this.services.biomeAt(Math.floor(f.playerX / TILE_SIZE), Math.floor(f.playerY / TILE_SIZE)));
    const danger = biome?.nightDanger ?? 1;
    const far = distanceDanger(this.data.stealth.distanceDanger, f.distTiles);
    const cap = Math.max(1, Math.min(cfg.maxAlive.night, Math.round(ramp * danger * far)));
    return this.calmed ? Math.max(1, Math.round(cap / 2)) : cap;
  }

  /** Player melee: hits every live enemy inside the arc. Returns enemies hit. */
  attack(ox: number, oy: number, fx: number, fy: number, reach: number, damage: number, now: number): Enemy[] {
    const c = this.data.combat;
    const hit: Enemy[] = [];
    for (const e of this.enemies) {
      if (!e.active || e.aiState === 'fade') continue;
      if (!inArc(ox, oy, fx, fy, e.x, e.cy, reach + 8, c.attackArcDegrees)) continue;
      if (e.takeHit(damage, ox, oy, c.enemyKnockback, c.enemyIFramesMs, now)) {
        hit.push(e);
        if (e.dead) {
          this.services.onKilled(e);
          e.despawn();
        }
      }
    }
    return hit;
  }

  /** Nearest live enemy within range of a point (for attack auto-aim and prompts). */
  nearest(x: number, y: number, range: number): Enemy | null {
    let best: Enemy | null = null;
    let bd = range;
    for (const e of this.enemies) {
      if (!e.active || e.aiState === 'fade') continue;
      const d = Math.hypot(e.x - x, e.cy - y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  clear(): void {
    for (const e of this.enemies) if (e.active) e.despawn();
  }

  private trySpawn(night: boolean, f: EncounterFrame, now: number): void {
    const cfg = this.data.encounters;
    for (let attempt = 0; attempt < 8; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const r = cfg.spawnRing.min + Math.random() * (cfg.spawnRing.max - cfg.spawnRing.min);
      const x = f.playerX + Math.cos(a) * r;
      const y = f.playerY + Math.sin(a) * r;
      const tx = Math.floor(x / TILE_SIZE);
      const ty = Math.floor(y / TILE_SIZE);
      if (!this.services.isLoaded(Math.floor(tx / CHUNK_TILES), Math.floor(ty / CHUNK_TILES))) continue;
      const def = this.pickDef(night, f.day, this.services.biomeAt(tx, ty), f.monsoon);
      if (!def) continue;
      if (!this.validSpot(def, x, y)) continue;
      const e = this.obtain();
      if (!e) return;
      const el = this.data.stealth.elite;
      const elite = Math.random() < eliteChance(el, f.day);
      e.spawn(def, x, y, now, elite, el.hp, el.damage);
      if (def.kind === 'spirit') gameEvents.emit('sfx', 'spirit');
      return;
    }
  }

  private validSpot(def: EnemyDef, x: number, y: number): boolean {
    const s = this.services;
    if (s.isDeepWater(x, y - 4)) return false;
    if (s.shrineDistance(x, y) < 180) return false;
    if ((s.outpostDistance?.(x, y) ?? Infinity) < OUTPOST_SAFE_RADIUS) return false;
    if (s.lightAt(x, y - 10, 40)) return false;
    if (!def.flying && this.scene.physics.overlapRect(x - 14, y - 12, 28, 12, false, true).length > 0) return false;
    return true;
  }

  private pickDef(night: boolean, day: number, biome: BiomeId, monsoon = false, lightShy = false): EnemyDef | null {
    const options: Array<[EnemyDef, number]> = [];
    for (const d of this.data.enemies.values()) {
      if (night ? d.active === 'day' : d.active === 'night') continue;
      if (d.spawn.minDay > day) continue;
      if (lightShy && !d.avoidsLight) continue;
      const bw = d.spawn.biomes[biome] ?? 0;
      if (bw <= 0) continue;
      let alive = 0;
      for (const e of this.enemies) if (e.active && e.def.id === d.id) alive++;
      if (alive >= d.spawn.maxAlive) continue;
      options.push([d, d.spawn.weight * bw * (monsoon && d.kind === 'spirit' ? this.data.stealth.monsoonSpiritWeight : 1)]);
    }
    const total = options.reduce((s, [, w]) => s + w, 0);
    if (total <= 0) return null;
    let pick = Math.random() * total;
    for (const [d, w] of options) {
      pick -= w;
      if (pick <= 0) return d;
    }
    return options[options.length - 1]?.[0] ?? null;
  }

  private obtain(): Enemy | null {
    const free = this.enemies.find((e) => !e.active);
    if (free) return free;
    if (this.enemies.length >= MAX_POOL) return null;
    const e = new Enemy(this.scene);
    this.group.add(e);
    e.body.enable = false;
    this.enemies.push(e);
    return e;
  }

  /** Test/debug and ambushes: spawn a specific creature at a point (bypasses spawn rules). */
  spawnAt(id: string, x: number, y: number, now: number, elite = false): Enemy | null {
    const def = this.data.enemies.get(id);
    const e = def ? this.obtain() : null;
    if (!def || !e) return null;
    const el = this.data.stealth.elite;
    e.spawn(def, x, y, now, elite, el.hp, el.damage);
    return e;
  }

  /**
   * Night ambush (after a fair warning): a few night creatures appear on a closer ring around
   * the player, never in water, solids, firelight, near shrines or outposts. Returns how many came.
   */
  spawnAmbush(f: EncounterFrame, now: number, count: number): number {
    const a = this.data.stealth.ambush;
    let n = 0;
    for (let attempt = 0; attempt < count * 10 && n < count; attempt++) {
      const ang = Math.random() * Math.PI * 2;
      const r = a.ringMin + Math.random() * (a.ringMax - a.ringMin);
      const x = f.playerX + Math.cos(ang) * r;
      const y = f.playerY + Math.sin(ang) * r;
      const tx = Math.floor(x / TILE_SIZE);
      const ty = Math.floor(y / TILE_SIZE);
      if (!this.services.isLoaded(Math.floor(tx / CHUNK_TILES), Math.floor(ty / CHUNK_TILES))) continue;
      const def = this.pickDef(true, f.day, this.services.biomeAt(tx, ty), f.monsoon, true);
      if (!def || !this.validSpot(def, x, y)) continue;
      const e = this.obtain();
      if (!e) break;
      e.spawn(def, x, y, now, false);
      // Ambushers know roughly where you are, but still have to find you.
      e.alertTo(f.playerX, f.playerY, 0.5);
      n++;
    }
    if (n > 0) gameEvents.emit('sfx', 'spirit');
    return n;
  }
}
