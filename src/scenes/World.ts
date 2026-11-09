import Phaser from 'phaser';
import { CAMERA, DEBUG_HOOKS, DEPTH, GATHER, PICKUP, SCENES, WATER, WORLD_GEN } from '../config';
import { getGameData, itemDef } from '../data/gameData';
import type { GameData, ItemDef, Station, ToolKind } from '../data/schema';
import { Player, type PlayerKeys } from '../entities/Player';
import type { ResourceNode } from '../entities/ResourceNode';
import { Building } from '../systems/Building';
import { Encounters } from '../systems/Encounters';
import { Projectiles } from '../systems/Projectiles';
import { StatusEffects, type EffectId } from '../systems/StatusEffects';
import type { Enemy } from '../entities/Enemy';
import { hash2, hashString, mulberry32 } from '../utils/random';
import { forecast, weatherModifiers, type Forecast } from '../systems/Season';
import { QuestLog } from '../systems/Quest';
import { getSettings } from '../systems/Settings';
import { rollLoot } from '../systems/Loot';
import { GameClock, darknessAt, inHourWindow, phaseOf } from '../systems/Clock';
import { gameEvents, onSceneEvent, type ClockTick, type PlayerTick, type SurvivalTick } from '../systems/GameEvents';
import { Gathering } from '../systems/Gathering';
import { FishingSession } from '../systems/Fishing';
import { Interaction } from '../systems/Interaction';
import { Lighting } from '../systems/Lighting';
import { Objectives } from '../systems/Objectives';
import { Pickups } from '../systems/Pickups';
import { PlayerInventory } from '../systems/PlayerInventory';
import { readSave, writeSave, type SaveData } from '../systems/Save';
import { buildSave, clampSelected, sanitizeInventory } from '../systems/SaveGame';
import { Structures } from '../systems/Structures';
import { Survival } from '../systems/Survival';
import { TILE } from '../textures';
import { FloatingText } from '../ui/FloatingText';
import { PropLayer } from '../world/PropLayer';
import { oncePerKeyEvent } from '../utils/keys';
import { ChunkManager, type RootWall } from '../world/ChunkManager';
import type { EndingData } from './Ending';
import { WorldGen } from '../world/WorldGen';

/** Upper bound on distinct stacks one harvest can drop (loot tables have at most this many items). */
const MAX_LOOT_STACKS = 6;
const TORCH_DARKNESS = 0.15;
/** Withered roots regrow after this long out of the light (ms of game time). */
const ROOT_REGROW_MS = 3000;

interface WorldKeys extends PlayerKeys {
  interact: Phaser.Input.Keyboard.Key;
  use: Phaser.Input.Keyboard.Key;
}

export interface WorldStartData {
  /** Resume from the save slot instead of starting a new journey. */
  load?: boolean;
  /** World seed for a new journey (random if omitted; ?seed=N in the URL also works). */
  seed?: number;
}

/** Seed for a new journey: explicit, then ?seed= URL param, then random. */
function pickSeed(explicit?: number): number {
  if (explicit !== undefined && Number.isFinite(explicit)) return explicit >>> 0;
  const fromUrl = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('seed') : null;
  if (fromUrl !== null && fromUrl.trim() !== '' && Number.isFinite(Number(fromUrl))) return Number(fromUrl) >>> 0;
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
}

export class World extends Phaser.Scene {
  private gameData!: GameData;
  private player!: Player;
  private keys!: WorldKeys;
  private props!: PropLayer;
  private gen!: WorldGen;
  private chunks!: ChunkManager;
  private seed = 0;
  private gathering!: Gathering;
  private interaction!: Interaction;
  private pickups!: Pickups;
  private inventory!: PlayerInventory;
  private floating!: FloatingText;
  private structures!: Structures;
  private building!: Building;
  private clock!: GameClock;
  private survival!: Survival;
  private lighting!: Lighting;
  private objectives!: Objectives;
  private spawn = { x: 0, y: 0 };
  private debugOn = false;
  private modalOpen = false;
  private pointerHeld = false;
  /** Sleeping or dying: gameplay input and simulation are suspended. */
  private busy = false;
  /** Game-time clock (ms). Only advances while this scene updates, so pause freezes it. */
  private now = 0;
  private nextActAt = 0;
  private nextWaterFrameAt = 0;
  private torchBurn = 0;
  private lastPrompt = '';
  private lastHealth = 0;
  private lastHurtAt = -Infinity;
  private wasHungry = false;
  private wasThirsty = false;
  private stationsKey = -1;
  private readonly stations = new Set<Station>();
  private readonly debugHandler = oncePerKeyEvent(() => this.toggleDebug());
  private encounters!: Encounters;
  private projectiles!: Projectiles;
  private effects = new StatusEffects();
  /** Neak Ta shrine key → clock seconds of the last offering. */
  private readonly shrineState = new Map<string, number>();
  private playerInvulnUntil = 0;
  private nextAttackAt = 0;
  private nextEffectsEmitAt = 0;
  private kills = 0;
  private pendingAttack = false;
  private readonly lightHit = { x: 0, y: 0, radius: 0 };
  private quest!: QuestLog;
  private readonly openedChests = new Set<string>();
  /** Plant identification: resource ids gathered at least once (saved). */
  private readonly knownPlants = new Set<string>();
  private fishing!: FishingSession;
  private fishBar!: Phaser.GameObjects.Graphics;
  /** Where the player stood when casting, and where the bobber floats. */
  private readonly fishAt = { x: 0, y: 0, spotX: 0, spotY: 0 };
  private fishTipShown = false;
  private weather: Forecast = { monsoon: false, monsoonDay: 0, daysUntil: 0, flood: 0, label: '' };
  private nextWeatherAt = 0;
  private nextQuestTargetAt = 0;
  private weatherKey = '';
  private nextAutosaveAt = 0;
  /** Journey statistics shown on the ending screen (saved). */
  private stats = { kills: 0, crafted: 0, built: 0, gathered: 0 };
  private nextRootToastAt = 0;
  private autosaveWarned = false;
  /** Smoothed World.update cost in ms (F3 overlay, perf checks). */
  perfMs = 0;
  /**
   * Discrete presses are captured from keydown events (not Key.JustDown, which Phaser clears
   * when a key is pressed and released within one frame) and consumed in update().
   */
  private pendingUse = false;
  private pendingInteract = false;
  private readonly pressHandler = oncePerKeyEvent((e: KeyboardEvent) => {
    // Keys pressed to close a panel must never act in the world.
    if (e.repeat || this.modalOpen) return;
    if (e.code === 'KeyF') this.pendingUse = true;
    else if (e.code === 'Space') this.pendingAttack = true;
    else if (e.code === 'KeyE') this.pendingInteract = true;
  });
  private readonly playerRect = new Phaser.Geom.Rectangle();
  private readonly tick: PlayerTick = { x: 0, y: 0, speed: 0, sprinting: false };
  private readonly survivalTick: SurvivalTick = {
    health: 0,
    hunger: 0,
    thirst: 0,
    stamina: 0,
    maxHealth: 0,
    maxHunger: 0,
    maxThirst: 0,
    maxStamina: 0,
    hungry: false,
    thirsty: false,
    exhausted: false,
    warmth: 100,
    cold: false,
    raining: false,
  };
  private readonly clockTick: ClockTick = { day: 1, label: '', phase: '', darkness: 0 };

  constructor() {
    super(SCENES.world);
  }

  create(start?: WorldStartData): void {
    this.resetFlags();
    this.gameData = getGameData();
    // A loaded save decides the seed; otherwise pick one for the new journey.
    const saved = start?.load ? readSave() : null;
    const save = saved && 'data' in saved ? saved.data : null;
    if (saved && 'error' in saved) {
      this.time.delayedCall(400, () => gameEvents.emit('toast', { text: 'Saved journey could not be loaded — starting fresh', tone: 'warn' }));
    }
    this.seed = save ? save.seed : pickSeed(start?.seed);
    this.registry.set('worldSeed', this.seed);
    this.gen = new WorldGen(this.seed, this.gameData.biomes, this.gameData.shrines.chancePerClearingChunk);
    this.spawn = this.gen.spawnPoint();

    this.props = new PropLayer(this);
    this.player = new Player(this, this.spawn.x, this.spawn.y);
    this.physics.add.collider(this.player, this.props.solids);
    this.chunks = new ChunkManager(this, this.gen, this.props, this.gameData, this.player);
    this.structures = new Structures(this, this.props, this.chunks, this.gameData.structures);
    this.structures.keepClear = this.spawn;
    this.chunks.onLoad = (cx, cy) => this.structures.loadChunk(cx, cy);
    this.chunks.onUnload = (cx, cy) => this.structures.unloadChunk(cx, cy);
    this.gathering = new Gathering(this, this.chunks.nodes, this.gameData, this.seed, () => (this.weather.monsoon ? 'monsoon' : 'dry'));
    this.fishing = new FishingSession(this.gameData.fishing);
    this.fishBar = this.add.graphics().setDepth(DEPTH.floatingText - 3).setVisible(false);
    this.knownPlants.clear();
    this.fishTipShown = false;

    this.floating = new FloatingText(this);
    this.interaction = new Interaction(this, this.chunks.nodes, (x, y) => this.chunks.tileAtWorld(x, y), this.structures.list, this.chunks.shrines, this.chunks.ruins, this.chunks.roots, () => this.chunks.heart);
    this.quest = new QuestLog(this.gameData, [], false, this.gen.tabletSites().length);
    this.openedChests.clear();
    this.nextWeatherAt = 0;
    this.nextQuestTargetAt = 0;
    this.weatherKey = '';
    this.nextAutosaveAt = 60000;
    this.perfMs = 0;
    this.effects = new StatusEffects();
    this.shrineState.clear();
    this.projectiles = new Projectiles(this, {
      playerX: () => this.player.x,
      playerY: () => this.player.y - 10,
      inLight: (x, y) => this.lightAt(x, y, 0) !== null,
      hitPlayer: (dmg, fx, fy) => this.hurtPlayer(dmg, 'spirit', fx, fy),
    });
    this.encounters = new Encounters(this, this.gameData, this.props.solids, {
      isDeepWater: (x, y) => this.chunks.isDeepWater(x, y),
      isLoaded: (cx, cy) => this.chunks.isLoaded(cx, cy),
      biomeAt: (tx, ty) => this.gen.biomeAt(tx, ty),
      lightAt: (x, y, m) => this.lightAt(x, y, m),
      shrineDistance: (x, y) => this.shrineDistance(x, y),
      hitPlayer: (enemy, dmg) => this.enemyHitsPlayer(enemy, dmg),
      fireOrb: (enemy, dx, dy) => {
        const pr = enemy.def.projectile;
        if (pr) this.projectiles.fire(enemy.x + dx * 10, enemy.cy + dy * 10, dx, dy, pr.speed, pr.damage, pr.range);
      },
      onKilled: (enemy) => this.onEnemyKilled(enemy),
    });
    this.encounters.enabled = !(DEBUG_HOOKS && new URLSearchParams(window.location.search).has('calm'));
    this.building = new Building(this, this.structures);
    this.lighting = new Lighting(this, CAMERA.zoom);
    this.clock = new GameClock(this.gameData.survival.day);
    this.survival = new Survival(this.gameData.survival);
    this.objectives = new Objectives();
    this.inventory = new PlayerInventory(
      this,
      (item, qty, durability) => this.dropInFront(item, qty, durability),
      () => this.stations,
      (_recipe, output) => {
        this.stats.crafted++;
        if (itemDef(output).tool?.kind === 'axe') this.completeObjective('craft_axe');
      },
    );
    this.pickups = new Pickups(this, {
      iconFor: (item) => itemDef(item).icon,
      capacityFor: (item) => this.inventory.capacityFor(item),
      add: (item, qty, durability) => this.inventory.add(item, qty, durability),
      onCollected: (item, qty, x, y) => {
        this.floating.show(x, y - 12, `+${qty} ${itemDef(item).name}`);
        gameEvents.emit('sfx', 'pickup');
        const inv = this.inventory.inventory;
        if (inv.count('wood') > 0 && inv.count('stone') > 0) this.completeObjective('gather');
      },
      onInventoryFull: () => {
        this.floating.show(this.player.x, this.player.y - 34, 'Inventory full', '#d9644a');
        gameEvents.emit('inventory:full');
      },
    });

    if (save) this.applySave(save);
    else this.chunks.loadAllAround(this.spawn.x, this.spawn.y, this.now);
    this.lastHealth = this.survival.stats.health;
    this.wasHungry = this.survival.hungry;
    this.wasThirsty = this.survival.thirsty;

    const cam = this.cameras.main;
    cam.removeBounds();
    cam.setZoom(CAMERA.zoom);
    cam.setRoundPixels(true);
    cam.startFollow(this.player, true, CAMERA.lerp, CAMERA.lerp, 0, 12);
    cam.fadeIn(350, 4, 10, 9);

    this.bindInput();
    onSceneEvent(this, 'game:pause-request', () => this.openPause());
    onSceneEvent(this, 'ui:modal', (open) => {
      this.modalOpen = open;
      this.pointerHeld = false;
      if (open) this.building.cancel();
    });
    onSceneEvent(this, 'placement:cancel', () => this.building.cancel());
    onSceneEvent(this, 'ui:ready', () => {
      gameEvents.emit('objectives:changed', this.objectives.view());
      gameEvents.emit('craft:stations', [...this.stations]);
      gameEvents.emit('world:info', { seed: this.seed });
      gameEvents.emit('quest:changed', this.quest.view());
      this.weatherKey = '';
      this.nextWeatherAt = 0;
      this.nextQuestTargetAt = 0;
      this.emitStructures();
    });
    this.scene.launch(SCENES.ui);

    this.events.on(Phaser.Scenes.Events.RESUME, this.onResume, this);
    this.game.events.on(Phaser.Core.Events.BLUR, this.openPause, this);
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.openPause, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
  }

  private resetFlags(): void {
    this.debugOn = false;
    this.modalOpen = false;
    this.pointerHeld = false;
    this.busy = false;
    this.now = 0;
    this.nextActAt = 0;
    this.nextWaterFrameAt = 0;
    this.torchBurn = 0;
    this.lastPrompt = '';
    this.lastHurtAt = -Infinity;
    this.stationsKey = -1;
    this.stations.clear();
    this.pendingUse = false;
    this.pendingInteract = false;
    this.pendingAttack = false;
    this.playerInvulnUntil = 0;
    this.nextAttackAt = 0;
    this.nextEffectsEmitAt = 0;
    this.kills = 0;
    this.stats = { kills: 0, crafted: 0, built: 0, gathered: 0 };
    this.nextRootToastAt = 0;
    this.autosaveWarned = false;
  }

  override update(time: number, delta: number): void {
    const t0 = performance.now();
    this.tickWorld(time, delta);
    this.perfMs = this.perfMs * 0.95 + (performance.now() - t0) * 0.05;
  }

  private shake(durationMs: number, intensity: number): void {
    if (!getSettings().reducedMotion) this.cameras.main.shake(durationMs, intensity);
  }

  private tickWorld(_time: number, delta: number): void {
    const dt = Math.min(delta, 100);
    const p = this.player;
    this.animateWater(dt);
    this.chunks.update(p.x, p.y, this.now);
    this.chunks.processFlood();
    if (this.busy) {
      this.pendingUse = false;
      this.pendingInteract = false;
      this.renderLighting();
      return;
    }
    this.now += dt;
    const inputOn = !this.modalOpen;
    const cfg = this.gameData.survival;

    p.step(this.keys, dt, this.now, inputOn, this.survival.canSprint, this.terrainSpeed(p.x, p.y));
    this.clock.advance(dt / 1000);
    this.updateWeather();
    this.survival.update(dt / 1000, this.clock.secondsPerHour, p.sprinting, weatherModifiers(this.weather, this.gameData.season));
    this.survival.updateWarmth(dt / 1000, this.clock.secondsPerHour, this.weather.monsoon && !this.isSheltered(p.x, p.y), this.gameData.season.cold);
    const fx = this.effects.update(dt / 1000, this.clock.secondsPerHour);
    if (fx.damage > 0) this.survival.damage(fx.damage, 'poison');
    if (fx.heal > 0) this.survival.heal(fx.heal);
    this.watchSurvival();
    if (this.survival.dead) {
      this.emitTicks(cfg);
      this.die();
      return;
    }

    this.props.updateCanopies(p.x, p.y, dt);
    this.gathering.update(this.now, p.x, p.y);
    this.pickups.update(p.x, p.y, dt, this.now);
    this.burnTorch(dt);
    this.updateStations();
    this.encounters.update(dt, this.now, {
      playerX: p.x,
      playerY: p.y,
      darkness: this.darkness(),
      day: this.clock.dayNumber,
      spiritWard: this.effects.has('ward'),
    });
    this.projectiles.update(dt, this.now);
    this.updateShrines();
    this.updateRuins();
    this.updateHeart();
    this.updateQuestTarget();
    this.emitEffects();
    if (this.now >= this.nextAutosaveAt) {
      this.nextAutosaveAt = this.now + 60000;
      this.save(true);
    }
    if (this.building.active) this.updateBuilding();

    if (!this.input.activePointer.isDown) this.pointerHeld = false;
    if (inputOn) {
      const target = this.interaction.update(p.x, p.y, p.facingVec.x, p.facingVec.y);
      if (this.fishing.phase !== 'idle') {
        this.updateFishing(this.pendingInteract || this.pendingAttack);
      } else {
        this.setPrompt(this.promptFor(target.kind === 'structure' ? target.structure.def.interaction : target.kind, target));
        const pressed = this.pendingInteract;
        if (this.pendingAttack) this.attack(p.x + p.facingVec.x * 20, p.y - 10 + p.facingVec.y * 20);
        if (this.pendingUse) this.useHeld();
        if (this.keys.interact.isDown || this.pointerHeld || pressed) this.act(null, pressed);
      }
    } else {
      this.interaction.hideRing();
      this.setPrompt('');
      if (this.fishing.phase !== 'idle') {
        this.stopFishing();
        this.floating.show(p.x, p.y - 34, 'You reel in your line', '#c8d8dc');
      }
    }

    this.pendingUse = false;
    this.pendingInteract = false;
    this.pendingAttack = false;
    this.renderLighting();
    this.emitTicks(cfg);
  }

  // ---------- Combat, creatures, shrines ----------

  /** Light covering a point (+margin): campfires, the held torch in the dark. Reuses one result object. */
  private lightAt(x: number, y: number, margin: number): { x: number; y: number; radius: number } | null {
    const dark = this.darkness() > TORCH_DARKNESS;
    for (const s of this.structures.list) {
      const r = s.def.lightRadius;
      if (r > 0 && Math.hypot(x - s.x, y - (s.y - 8)) <= r * 0.9 + margin) {
        this.lightHit.x = s.x;
        this.lightHit.y = s.y - 8;
        this.lightHit.radius = r;
        return this.lightHit;
      }
    }
    const held = this.inventory.held;
    const light = held && dark ? itemDef(held.item).light : undefined;
    if (light) {
      const p = this.player;
      if (Math.hypot(x - p.x, y - (p.y - 16)) <= light.radius * 0.9 + margin) {
        this.lightHit.x = p.x;
        this.lightHit.y = p.y - 16;
        this.lightHit.radius = light.radius;
        return this.lightHit;
      }
    }
    return null;
  }

  private shrineDistance(x: number, y: number): number {
    let best = Infinity;
    for (const s of this.chunks.shrines) best = Math.min(best, Math.hypot(s.x - x, s.y - y));
    return best;
  }

  /** Melee swing toward (ax, ay): held weapon/tool damage, spear reach bonus, wear on hit. */
  private attack(ax: number, ay: number): boolean {
    if (this.now < this.nextAttackAt || this.building.active) return false;
    const c = this.gameData.combat;
    const p = this.player;
    const held = this.inventory.held;
    const tool = held ? itemDef(held.item).tool : undefined;
    const damage = tool ? tool.damage : c.handDamage;
    const reach = c.baseReach + (tool?.kind === 'spear' ? c.spearBonusReach : 0);
    const ox = p.x;
    const oy = p.y - 10;
    const dx = ax - ox;
    const dy = ay - oy;
    const len = Math.hypot(dx, dy) || 1;
    p.swing(ax, ay + 8, this.now, GATHER.swingMs);
    this.nextAttackAt = this.now + c.attackCooldownMs;
    this.nextActAt = Math.max(this.nextActAt, this.now + GATHER.swingMs);
    const hits = this.encounters.attack(ox, oy, dx / len, dy / len, reach, damage, this.now);
    gameEvents.emit('sfx', hits.length > 0 ? 'enemy_hit' : 'swing');
    for (const e of hits) this.floating.show(e.x, e.cy - 14, `-${damage}`, '#ffffff');
    if (hits.length > 0 && tool && tool.kind !== 'rod') {
      if (this.inventory.inventory.wear(this.inventory.selected, 1) === 'broke') {
        gameEvents.emit('toast', { text: `Your ${itemDef(held?.item ?? '').name} broke`, tone: 'warn' });
      }
      this.inventory.broadcast();
    }
    return hits.length > 0;
  }

  private enemyHitsPlayer(enemy: Enemy, damage: number): void {
    const cause = enemy.def.kind === 'spirit' ? 'spirit' : 'wildlife';
    if (!this.hurtPlayer(damage, cause, enemy.x, enemy.cy)) return;
    const poison = enemy.def.poison;
    if (poison) {
      this.effects.apply('poison', poison.seconds, { dps: poison.damagePerSecond });
      this.floating.show(this.player.x, this.player.y - 40, 'Poisoned', '#8ec26a');
    }
  }

  /** Applies damage with i-frames, knockback, flash and shake. Returns false while invulnerable. */
  private hurtPlayer(damage: number, cause: 'wildlife' | 'spirit', fromX: number, fromY: number): boolean {
    if (this.now < this.playerInvulnUntil || this.busy || damage <= 0) return false;
    const c = this.gameData.combat;
    const p = this.player;
    this.playerInvulnUntil = this.now + c.playerIFramesMs;
    this.survival.damage(damage, cause);
    gameEvents.emit('sfx', 'hurt');
    const dx = p.x - fromX;
    const dy = p.y - 10 - fromY;
    const len = Math.hypot(dx, dy) || 1;
    p.body.setVelocity((dx / len) * c.playerKnockback, (dy / len) * c.playerKnockback);
    this.tweens.killTweensOf(p);
    p.setAlpha(1);
    this.tweens.add({ targets: p, alpha: 0.35, duration: 90, yoyo: true, repeat: Math.max(1, Math.floor(c.playerIFramesMs / 180) - 1), onComplete: () => p.setAlpha(1) });
    this.shake(120, 0.004);
    this.floating.show(p.x, p.y - 36, `-${damage}`, '#d9644a');
    this.lastHurtAt = -Infinity;
    return true;
  }

  private onEnemyKilled(enemy: Enemy): void {
    this.kills++;
    this.stats.kills++;
    const table = this.gameData.loot.get(enemy.def.lootTable);
    this.floating.show(enemy.x, enemy.cy - 20, enemy.def.kind === 'spirit' ? 'The spirit fades' : `${enemy.def.name} down`, '#e6b866');
    if (!table) return;
    const rng = mulberry32(hash2(this.kills, Math.floor(this.now), this.seed));
    for (const stack of rollLoot(table, rng)) {
      if (!this.pickups.spawn(stack.item, stack.qty, enemy.x, enemy.y - 4, this.now, 200)) this.inventory.add(stack.item, stack.qty);
    }
  }

  /** Shows which shrines are resting (recently honoured) with the flower-laden frame. */
  private updateShrines(): void {
    const cooldown = this.gameData.shrines.cooldownHours * this.clock.secondsPerHour;
    for (const s of this.chunks.shrines) {
      const last = this.shrineState.get(s.key);
      const resting = last !== undefined && this.clock.totalSeconds - last < cooldown;
      const frame = resting ? 1 : 0;
      if (Number(s.image.frame.name) !== frame) s.image.setFrame(frame);
    }
  }

  private offerAtShrine(key: string): void {
    const cfg = this.gameData.shrines;
    const last = this.shrineState.get(key);
    const cooldown = cfg.cooldownHours * this.clock.secondsPerHour;
    if (last !== undefined && this.clock.totalSeconds - last < cooldown) {
      gameEvents.emit('toast', { text: cfg.text.resting, tone: 'info' });
      return;
    }
    const held = this.inventory.held;
    const def = held ? itemDef(held.item) : null;
    if (!held || !def || def.category !== cfg.offeringCategory) {
      gameEvents.emit('toast', { text: cfg.text.needOffering, tone: 'info' });
      return;
    }
    this.inventory.inventory.takeFromSlot(this.inventory.selected, 1);
    this.inventory.broadcast();
    this.shrineState.set(key, this.clock.totalSeconds);
    const seconds = cfg.blessing.durationHours * this.clock.secondsPerHour;
    this.effects.apply('blessing', seconds, { regenPerHour: cfg.blessing.regenPerHour });
    if (cfg.blessing.spiritWard) this.effects.apply('ward', seconds);
    this.player.swing(this.player.x, this.player.y - 30, this.now, GATHER.swingMs * 3);
    this.floating.show(this.player.x, this.player.y - 40, 'Blessed', '#e6b866');
    gameEvents.emit('sfx', 'shrine');
    gameEvents.emit('toast', { text: cfg.text.offered, tone: 'info' });
    this.nextEffectsEmitAt = 0;
  }

  // ---------- Weather, ruins, quest ----------

  /** Recomputes the forecast twice a (real) second; floods and HUD only change on transitions. */
  private updateWeather(): void {
    if (this.now < this.nextWeatherAt) return;
    this.nextWeatherAt = this.now + 500;
    this.weather = forecast(this.clock.dayNumber, this.clock.hour, this.gameData.season);
    const dark = darknessAt(this.clock.hour, this.gameData.survival.darkness);
    let fire = 0;
    for (const s of this.structures.list) if (s.def.lightRadius > 0) fire = Math.max(fire, 1 - Math.hypot(s.x - this.player.x, s.y - this.player.y) / 220);
    gameEvents.emit('ambience', { day: 1 - dark, night: dark, rain: this.weather.monsoon ? 1 : 0, fire: Math.max(0, fire) });
    this.chunks.setFlood(this.weather.flood, this.gameData.season.floodRiverWidth);
    const key = `${this.weather.label}|${this.weather.monsoon}|${this.chunks.flood}`;
    if (key === this.weatherKey) return;
    const started = this.weather.monsoon && this.weatherKey !== '' && !this.weatherKey.includes('|true|');
    this.weatherKey = key;
    gameEvents.emit('weather:changed', { raining: this.weather.monsoon, label: this.weather.label, flood: this.chunks.flood });
    if (started) gameEvents.emit('toast', { text: 'The monsoon breaks. Stay near fire or shelter to keep warm. Shoots and herbs grow fast in the rain; berries are scarce.', tone: 'warn' });
  }

  /** Under a shelter's roof or by a campfire's warmth. */
  private isSheltered(x: number, y: number): boolean {
    const cold = this.gameData.season.cold;
    for (const s of this.structures.list) {
      const d = Math.hypot(s.x - x, s.y - y);
      if (s.def.interaction === 'sleep' && d <= cold.shelterRadius) return true;
      if (s.def.lightRadius > 0 && d <= s.def.lightRadius * 0.6) return true;
    }
    return false;
  }

  /** Chest frames (open/closed) and tablet frames (read/unread) follow saved state. */
  private updateRuins(): void {
    for (const r of this.chunks.ruins) {
      const done = r.kind === 'chest' ? this.openedChests.has(r.key) : this.quest.hasRead(r.id);
      const frame = done ? 1 : 0;
      if (Number(r.image.frame.name) !== frame) r.image.setFrame(frame);
    }
  }

  /** Each chest opens once; its loot is seeded by (world seed, chest key) so it can't be re-rolled. */
  private openChest(key: string, x: number, y: number): void {
    if (this.openedChests.has(key)) {
      gameEvents.emit('toast', { text: 'The chest is empty.', tone: 'info' });
      return;
    }
    const table = this.gameData.loot.get('ruin_chest');
    if (!table) return;
    this.openedChests.add(key);
    this.player.swing(x, y - 8, this.now, GATHER.swingMs * 2);
    const rng = mulberry32(hash2(hashString(key), 99, this.seed));
    for (const stack of rollLoot(table, rng)) {
      if (!this.pickups.spawn(stack.item, stack.qty, x, y + 10, this.now, 250, 10)) this.inventory.add(stack.item, stack.qty);
    }
    this.floating.show(x, y - 30, 'The lid grinds open', '#e6b866');
    gameEvents.emit('sfx', 'chest');
  }

  private readTablet(id: string): void {
    const tablet = this.gameData.tablets.find((t) => t.id === id);
    if (!tablet) return;
    const isNew = this.quest.readTablet(id);
    gameEvents.emit('tablet:read', tablet);
    gameEvents.emit('sfx', 'tablet');
    if (isNew) {
      gameEvents.emit('quest:changed', this.quest.view());
      const n = this.quest.tabletsRead.length;
      gameEvents.emit('toast', {
        text: n >= this.gameData.tablets.length ? 'All five tablets read. The way to the Heart of the Forest is revealed.' : `Tablet ${n} of ${this.gameData.tablets.length} recorded in your journal (J)`,
        tone: 'info',
      });
      this.nextQuestTargetAt = 0;
    }
  }

  /** Objective arrow target: nearest unread tablet ruin, then the Heart of the Forest. */
  private updateQuestTarget(): void {
    if (this.now < this.nextQuestTargetAt) return;
    this.nextQuestTargetAt = this.now + 1000;
    const p = this.player;
    const stage = this.quest.stage;
    if (stage === 'done') {
      gameEvents.emit('quest:target', null);
      return;
    }
    if (stage === 'heart' || stage === 'restore') {
      const h = this.gen.heartSite();
      const hx = h.tx * 32 + 16;
      const hy = h.ty * 32 + 16;
      if (stage === 'heart' && Math.hypot(hx - p.x, hy - p.y) < (WORLD_GEN.heartGladeRadius + 1) * 32) {
        this.quest.reachHeart();
        gameEvents.emit('quest:changed', this.quest.view());
        gameEvents.emit('toast', { text: `You reach the Heart of the Forest. ${this.gameData.ending.text.rootsBlock}`, tone: 'info' });
      }
      gameEvents.emit('quest:target', { x: hx, y: hy, label: stage === 'heart' ? 'Heart of the Forest' : 'The Heart Tree' });
      return;
    }
    let best: { x: number; y: number; d: number } | null = null;
    this.gen.tabletSites().forEach((site, i) => {
      if (this.quest.hasRead(`tablet_${i + 1}`)) return;
      const x = site.tx * 32 + 16;
      const y = (site.ty + 3) * 32 + 16;
      const d = Math.hypot(x - p.x, y - p.y);
      if (!best || d < best.d) best = { x, y, d };
    });
    const target = best as { x: number; y: number; d: number } | null;
    gameEvents.emit('quest:target', target ? { x: target.x, y: target.y, label: 'Stone tablet (ruins)' } : null);
  }

  /**
   * Root walls shrink from firelight (a campfire, or a held torch in the dark) and open a path;
   * out of the light they regrow after a moment — unless the player stands in the gap.
   * The Heart Tree glows once the promise is renewed.
   */
  private updateHeart(): void {
    const heart = this.chunks.heart;
    if (heart) {
      const frame = this.quest.restored ? 1 : 0;
      if (Number(heart.image.frame.name) !== frame) heart.image.setFrame(frame);
    }
    const roots = this.chunks.roots;
    if (roots.length === 0) return;
    const p = this.player;
    // Never trap the player: while inside the ring, nothing regrows.
    // Inside the ring the roots stand aside (old saves may even load you there); near it, nothing regrows.
    const dHeart = heart ? Math.hypot(p.x - heart.x, p.y - heart.y) : Infinity;
    const inside = dHeart < (WORLD_GEN.heartRootRadius - 0.6) * 32;
    const nearRing = dHeart < (WORLD_GEN.heartRootRadius + 1) * 32;
    // A held torch is fire even by day (it only *lights the dark* at night).
    const held = this.inventory.held;
    const torch = held ? itemDef(held.item).light : undefined;
    let opened = false;
    for (const r of roots) {
      const lit =
        this.quest.restored ||
        inside ||
        this.lightAt(r.x, r.y - 12, 0) !== null ||
        (torch !== undefined && Math.hypot(r.x - p.x, r.y - 12 - (p.y - 16)) <= torch.radius * 0.9);
      if (lit) {
        r.litAt = this.now;
        if (!r.withered) {
          this.setRootWithered(r, true);
          opened = true;
        }
      } else if (!nearRing && r.withered && this.now - r.litAt > ROOT_REGROW_MS && !this.overlapsRoot(r)) {
        this.setRootWithered(r, false);
      }
    }
    if (opened && !this.quest.restored && this.now >= this.nextRootToastAt) {
      this.nextRootToastAt = this.now + 8000;
      gameEvents.emit('toast', { text: this.gameData.ending.text.rootsWither, tone: 'info' });
      gameEvents.emit('sfx', 'leaf');
    }
  }

  /** Would a regrown root (zone y-29..y-1, 34 wide) overlap the player's body (y-11..y-1, 16 wide)? Small margin. */
  private overlapsRoot(r: RootWall): boolean {
    const p = this.player;
    return Math.abs(p.x - r.x) < 27 && p.y - 1 > r.y - 32 && p.y - 11 < r.y + 2;
  }

  private setRootWithered(r: RootWall, withered: boolean): void {
    r.withered = withered;
    r.image.setFrame(withered ? 1 : 0);
    const body = r.zone.body as Phaser.Physics.Arcade.StaticBody | null;
    if (!body) return;
    if (withered) this.physics.world.disableBody(body);
    else {
      body.enable = true;
      this.physics.world.add(body);
    }
  }

  /** The offering at the Heart Tree: all tablets read, held food and spirit dust. */
  private offerAtHeart(): void {
    const t = this.gameData.ending.text;
    if (this.quest.stage === 'done') {
      gameEvents.emit('toast', { text: 'The Heart Tree is at peace. Its light warms the glade.', tone: 'info' });
      return;
    }
    if (this.quest.stage === 'tablets') {
      gameEvents.emit('toast', { text: t.needTablets, tone: 'info' });
      return;
    }
    if (this.quest.stage === 'heart' && this.quest.reachHeart()) gameEvents.emit('quest:changed', this.quest.view());
    const cfg = this.gameData.ending;
    const held = this.inventory.held;
    const def = held ? itemDef(held.item) : null;
    const inv = this.inventory.inventory;
    if (!held || !def || def.category !== cfg.offeringCategory || inv.count('spirit_dust') < cfg.spiritDust) {
      gameEvents.emit('toast', { text: t.needOffering, tone: 'info' });
      return;
    }
    inv.takeFromSlot(this.inventory.selected, 1);
    inv.remove('spirit_dust', cfg.spiritDust);
    this.inventory.broadcast();
    this.quest.restore();
    this.encounters.calmed = true;
    gameEvents.emit('quest:changed', this.quest.view());
    gameEvents.emit('quest:target', null);
    gameEvents.emit('sfx', 'shrine');
    gameEvents.emit('toast', { text: t.restored, tone: 'info' });
    this.player.swing(this.player.x, this.player.y - 30, this.now, GATHER.swingMs * 3);
    this.updateHeart();
    const saved = this.save();
    this.startEnding(saved);
  }

  private startEnding(saved: boolean): void {
    if (this.busy) return;
    this.busy = true;
    this.building.cancel();
    this.player.halt();
    this.encounters.clear();
    this.projectiles.clear();
    const summary: EndingData = { day: this.clock.dayNumber, tablets: this.quest.tabletsRead.length, ...this.stats, saved };
    const cam = this.cameras.main;
    this.time.delayedCall(1600, () => {
      cam.fadeEffect.reset();
      cam.fadeOut(1800, 230, 240, 220);
      cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.stop(SCENES.ui);
        this.scene.start(SCENES.ending, summary);
      });
    });
  }

  private emitEffects(): void {
    if (this.now < this.nextEffectsEmitAt) return;
    this.nextEffectsEmitAt = this.now + 500;
    gameEvents.emit(
      'effects:changed',
      this.effects.list.map((e) => ({ id: e.id, remaining: e.remaining })),
    );
  }

  // ---------- Survival, clock, lighting ----------

  private watchSurvival(): void {
    const s = this.survival;
    if (s.stats.health < this.lastHealth - 0.001 && this.now - this.lastHurtAt > 1200) {
      const first = this.now - this.lastHurtAt > 20000;
      this.lastHurtAt = this.now;
      gameEvents.emit('player:hurt');
      if (first && s.lastDamageCause === 'starvation') gameEvents.emit('toast', { text: 'Starving! You are losing health — eat now', tone: 'warn' });
      if (first && s.lastDamageCause === 'dehydration') gameEvents.emit('toast', { text: 'Dehydrated! You are losing health — drink now', tone: 'warn' });
    }
    this.lastHealth = s.stats.health;
    if (s.hungry && !this.wasHungry) gameEvents.emit('toast', { text: 'You are getting hungry — eat something (select food, F)', tone: 'warn' });
    if (s.thirsty && !this.wasThirsty) gameEvents.emit('toast', { text: 'You are thirsty — drink at the pond (E)', tone: 'warn' });
    this.wasHungry = s.hungry;
    this.wasThirsty = s.thirsty;
  }

  private darkness(): number {
    const base = darknessAt(this.clock.hour, this.gameData.survival.darkness);
    return this.weather.monsoon ? Math.min(0.85, base + this.gameData.season.rainDarkness) : base;
  }

  private renderLighting(): void {
    const p = this.player;
    const l = this.lighting;
    l.begin();
    l.add(p.x, p.y - 12, this.gameData.survival.playerLightRadius, 0);
    const held = this.inventory.held;
    const light = held ? itemDef(held.item).light : undefined;
    if (light && this.darkness() > TORCH_DARKNESS) l.add(p.x + p.facingVec.x * 6, p.y - 16, light.radius, 0.8);
    const view = this.cameras.main.worldView;
    for (const s of this.structures.list) {
      const r = s.def.lightRadius;
      if (r <= 0 || s.x + r < view.x || s.x - r > view.right || s.y + r < view.y || s.y - r > view.bottom) continue;
      l.add(s.x, s.y - 8, r, 1);
    }
    l.render(this.darkness(), this.now);
  }

  /** Held torches burn (game time) only while lit in the dark. Wear applies once per second. */
  private burnTorch(dt: number): void {
    const held = this.inventory.held;
    if (!held || !itemDef(held.item).light || this.darkness() <= TORCH_DARKNESS) return;
    this.torchBurn += dt / 1000;
    if (this.torchBurn < 1) return;
    const burn = Math.floor(this.torchBurn);
    this.torchBurn -= burn;
    if (this.inventory.inventory.wear(this.inventory.selected, burn) === 'broke') {
      gameEvents.emit('toast', { text: 'Your torch burned out', tone: 'warn' });
    }
    this.inventory.broadcast();
  }

  private emitTicks(cfg: GameData['survival']): void {
    const p = this.player;
    const t = this.tick;
    t.x = p.x;
    t.y = p.y;
    t.speed = p.speed;
    t.sprinting = p.sprinting;
    gameEvents.emit('player:tick', t);

    const s = this.survival;
    const st = this.survivalTick;
    st.health = s.stats.health;
    st.hunger = s.stats.hunger;
    st.thirst = s.stats.thirst;
    st.stamina = s.stats.stamina;
    st.maxHealth = cfg.maxHealth;
    st.maxHunger = cfg.maxHunger;
    st.maxThirst = cfg.maxThirst;
    st.maxStamina = cfg.maxStamina;
    st.hungry = s.hungry;
    st.thirsty = s.thirsty;
    st.exhausted = s.exhausted;
    st.warmth = s.stats.warmth;
    st.cold = s.cold;
    st.raining = this.weather.monsoon;
    gameEvents.emit('survival:tick', st);

    const c = this.clockTick;
    const dark = this.darkness();
    c.day = this.clock.dayNumber;
    c.label = this.clock.label();
    // Phase follows daylight only; rain gloom does not turn noon into dusk.
    c.phase = phaseOf(darknessAt(this.clock.hour, this.gameData.survival.darkness), this.clock.hour);
    c.darkness = dark;
    gameEvents.emit('clock:tick', c);
  }

  private updateStations(): void {
    this.structures.stationsNear(this.player.x, this.player.y, this.stations);
    const key = (this.stations.has('campfire') ? 1 : 0) + (this.stations.has('pot') ? 2 : 0);
    if (key === this.stationsKey) return;
    this.stationsKey = key;
    gameEvents.emit('craft:stations', [...this.stations]);
  }

  // ---------- Actions ----------

  private promptFor(kind: string | null, target: typeof this.interaction.current): string {
    switch (kind) {
      case 'node':
        return target.kind === 'node' ? `E — ${this.nodeLabel(target.node)}` : '';
      case 'water': {
        const held = this.inventory.held;
        const def = held ? itemDef(held.item) : null;
        if (def?.tool?.kind === 'rod') return 'E — Cast your line';
        if (def?.fillsTo) return `E — Fill the ${def.name}`;
        return 'E — Drink water';
      }
      case 'cook':
        return target.kind === 'structure' ? `E — Cook at the ${target.structure.def.name.toLowerCase()}` : 'E — Cook';
      case 'sleep': {
        const sl = this.gameData.survival.sleep;
        return inHourWindow(this.clock.hour, sl.fromHour, sl.untilHour)
          ? 'E — Sleep until morning (saves)'
          : `Shelter — you can sleep from ${hourLabel(sl.fromHour)}`;
      }
      case 'shrine':
        return `E — ${this.gameData.shrines.text.prompt}`;
      case 'heart':
        if (this.quest.stage === 'done') return 'The Heart Tree is at peace';
        return `E — ${this.gameData.ending.text.prompt}`;
      case 'roots':
        return this.gameData.ending.text.rootsBlock;
      case 'ruin':
        if (target.kind !== 'ruin') return '';
        if (target.ruin.kind === 'chest') return this.openedChests.has(target.ruin.key) ? 'An empty stone chest' : 'E — Open the stone chest';
        return this.quest.hasRead(target.ruin.id) ? 'E — Read the tablet again' : 'E — Read the stone tablet';
      default:
        return '';
    }
  }

  /** One gather/drink/structure action, rate-limited by game time. `clicked` overrides the target. */
  private act(clicked: ResourceNode | null, pressed: boolean): void {
    if (this.building.active) return;
    if (this.now < this.nextActAt) return;
    const target = this.interaction.current;
    const p = this.player;

    if (clicked || target.kind === 'node') {
      const node = clicked ?? (target.kind === 'node' ? target.node : null);
      if (node) this.gather(node);
      return;
    }
    if (target.kind === 'water') {
      const held = this.inventory.held;
      const hdef = held ? itemDef(held.item) : null;
      // A rod or a container in hand turns E at water into fishing / filling (never drinking).
      if (hdef?.tool?.kind === 'rod' || hdef?.fillsTo) {
        if (!pressed) return;
        if (hdef.fillsTo) this.fillContainer(hdef.fillsTo, target.x, target.y);
        else this.castLine(target.x, target.y);
        return;
      }
      p.swing(target.x, target.y + 8, this.now, GATHER.swingMs * 2);
      this.nextActAt = this.now + WATER.drinkCooldownMs;
      this.survival.drink();
      gameEvents.emit('sfx', 'drink');
      this.floating.show(p.x, p.y - 34, 'Fresh water', '#4fc2b4');
      gameEvents.emit('player:drank');
      this.completeObjective('drink');
      return;
    }
    if (target.kind === 'ruin' && pressed) {
      if (target.ruin.kind === 'chest') this.openChest(target.ruin.key, target.ruin.x, target.ruin.y);
      else this.readTablet(target.ruin.id);
      return;
    }
    if (target.kind === 'shrine' && pressed) {
      this.offerAtShrine(target.shrine.key);
      return;
    }
    if (target.kind === 'heart' && pressed) {
      this.offerAtHeart();
      return;
    }
    if (target.kind === 'roots' && pressed) {
      gameEvents.emit('toast', { text: this.gameData.ending.text.rootsBlock, tone: 'info' });
      return;
    }
    if (target.kind === 'structure' && pressed) {
      if (target.structure.def.interaction === 'cook') gameEvents.emit('ui:open-crafting');
      else if (target.structure.def.interaction === 'sleep') this.trySleep();
    }
  }

  private gather(node: ResourceNode): void {
    // Never destroy a node whose loot would have nowhere to go.
    if (this.pickups.freeSlots < MAX_LOOT_STACKS) {
      this.nextActAt = this.now + GATHER.hitCooldownMs;
      this.floating.show(node.targetX, node.targetY - 20, 'Too many items on the ground', '#d9644a');
      return;
    }
    const p = this.player;
    p.swing(node.targetX, node.targetY, this.now, GATHER.swingMs);
    this.nextActAt = this.now + GATHER.hitCooldownMs;

    // Use the held tool only when it beats bare hands on this node.
    const held = this.inventory.held;
    const tool = held ? itemDef(held.item).tool : undefined;
    let kind: ToolKind = 'hand';
    let base: number = GATHER.handDamage;
    const hand = (node.def.toolMultipliers.hand ?? 0) * GATHER.handDamage;
    if (tool && (node.def.toolMultipliers[tool.kind] ?? 0) * tool.damage > hand) {
      kind = tool.kind;
      base = tool.damage;
    }
    const { result, loot } = this.gathering.hit(node, kind, this.now, p.x, base);
    if (result === 'hit' || result === 'depleted') {
      gameEvents.emit('sfx', node.def.sprite === 'rock' ? 'stone' : node.def.sprite === 'tree' || node.def.sprite === 'bamboo' ? 'chop' : 'leaf');
    }
    if (result === 'needs-tool') this.floating.show(node.targetX, node.targetY - 20, 'Needs a tool', '#e6b866');
    if (kind !== 'hand' && (result === 'hit' || result === 'depleted')) {
      if (this.inventory.inventory.wear(this.inventory.selected, 1) === 'broke') {
        gameEvents.emit('toast', { text: `Your ${itemDef(held?.item ?? '').name} broke`, tone: 'warn' });
      }
      this.inventory.broadcast();
    }
    if (result === 'depleted' && node.def.unknownName && !this.knownPlants.has(node.def.id)) {
      this.knownPlants.add(node.def.id);
      const first = loot[0] ? itemDef(loot[0].item) : null;
      gameEvents.emit('toast', { text: `Identified: ${node.def.name}${first ? ` — ${first.description}` : ''}`, tone: 'info' });
    }
    for (const stack of loot) {
      if (this.pickups.spawn(stack.item, stack.qty, node.prop.x, node.prop.y - 4, this.now, 250)) {
        this.stats.gathered += stack.qty;
        continue;
      }
      const lost = this.inventory.add(stack.item, stack.qty);
      this.stats.gathered += stack.qty - lost;
      if (lost > 0) this.floating.show(node.targetX, node.targetY - 20, `No room for ${lost} ${itemDef(stack.item).name}`, '#d9644a');
    }
  }

  /** F: eat food, start placing a kit, or explain what the held item does. */
  private useHeld(): void {
    const held = this.inventory.held;
    if (!held) {
      gameEvents.emit('toast', { text: 'Select an item in the hotbar (1–6) to use it', tone: 'info' });
      return;
    }
    const def = itemDef(held.item);
    if (def.places) {
      if (this.building.active && this.building.slot === this.inventory.selected) this.tryPlace();
      else this.building.start(this.inventory.selected, def.places);
      return;
    }
    if (def.medicine) {
      this.useMedicine(def);
      return;
    }
    if (def.food) {
      const st = this.survival.stats;
      const cfgS = this.gameData.survival;
      const helps =
        (def.food.hunger > 0 && st.hunger < cfgS.maxHunger - 1) ||
        (def.food.thirst > 0 && st.thirst < cfgS.maxThirst - 1) ||
        (def.food.health > 0 && st.health < cfgS.maxHealth - 1);
      if (!helps) {
        gameEvents.emit('toast', { text: `You're not ${def.food.thirst > def.food.hunger ? 'thirsty' : 'hungry'} — save the ${def.name} for later`, tone: 'info' });
        return;
      }
      this.survival.eat(def.food);
      gameEvents.emit('sfx', def.food.thirst > def.food.hunger ? 'drink' : 'eat');
      this.inventory.inventory.takeFromSlot(this.inventory.selected, 1);
      if (def.returns) this.giveBack(def.returns);
      this.inventory.broadcast();
      this.player.swing(this.player.x, this.player.y - 20, this.now, GATHER.swingMs * 2);
      const parts = [`+${def.food.hunger} food`];
      if (def.food.thirst) parts.push(`+${def.food.thirst} water`);
      if (def.food.health) parts.push(`${def.food.health > 0 ? '+' : ''}${def.food.health} health`);
      this.floating.show(this.player.x, this.player.y - 34, parts.join('  '), def.food.health < 0 ? '#e6b866' : '#8ec26a');
      return;
    }
    const msg = def.fillsTo
      ? `Stand at water and press E to fill the ${def.name}`
      : def.tool?.kind === 'rod'
        ? 'Stand at the edge of deep water and press E to cast your line'
        : def.tool
      ? def.tool.kind === 'spear'
        ? 'Swing the spear with Space, or click a creature — it reaches further than your hands'
        : `Hold E or click a ${def.tool.kind === 'axe' ? 'tree or bamboo' : 'boulder'} to use your ${def.name}`
      : def.light
        ? 'Torches light up automatically in the dark while held'
        : `${def.name} is a crafting material — open crafting with C`;
    gameEvents.emit('toast', { text: msg, tone: 'info' });
  }

  /** Unknown plants show a generic name until the player has gathered one (plant identification). */
  private nodeLabel(node: ResourceNode): string {
    const d = node.def;
    return d.unknownName && !this.knownPlants.has(d.id) ? `${d.verb} ${d.unknownName}` : node.label;
  }

  /** Puts an item back in the inventory (e.g. the empty tube), dropping it if there is no room. */
  private giveBack(item: string): void {
    const left = this.inventory.inventory.add(item, 1);
    if (left > 0 && !this.dropInFront(item, left)) this.pickups.spawn(item, left, this.player.x, this.player.y + 6, this.now, 0, 0, false);
  }

  /** Room for one more of an item (inventory or a free ground slot)? */
  private hasRoomFor(item: string): boolean {
    return this.inventory.capacityFor(item) > 0 || this.pickups.freeSlots > 0;
  }

  private useMedicine(def: ItemDef): void {
    const med = def.medicine;
    if (!med) return;
    const st = this.survival.stats;
    const cures = med.cures.includes('poison') && this.effects.has('poison');
    const heals = med.heal > 0 && st.health < this.gameData.survival.maxHealth - 1;
    if (!cures && !heals) {
      gameEvents.emit('toast', { text: `You don't need the ${def.name} right now`, tone: 'info' });
      return;
    }
    if (cures) {
      this.effects.clear('poison');
      this.nextEffectsEmitAt = 0;
    }
    if (med.heal > 0) this.survival.heal(med.heal);
    this.inventory.inventory.takeFromSlot(this.inventory.selected, 1);
    if (def.returns) this.giveBack(def.returns);
    this.inventory.broadcast();
    gameEvents.emit('sfx', 'eat');
    this.player.swing(this.player.x, this.player.y - 20, this.now, GATHER.swingMs * 2);
    const parts: string[] = [];
    if (cures) parts.push('Poison cured');
    if (med.heal > 0) parts.push(`+${med.heal} health`);
    this.floating.show(this.player.x, this.player.y - 34, parts.join('  '), '#8ec26a');
  }

  // ---------- Water containers and fishing (M9) ----------

  private fillContainer(fillsTo: string, tx: number, ty: number): void {
    const slot = this.inventory.selected;
    const held = this.inventory.inventory.get(slot);
    // Filling the last tube frees its slot; otherwise there must be room for the filled one.
    if (!held || (held.qty > 1 && !this.hasRoomFor(fillsTo))) {
      gameEvents.emit('toast', { text: 'No room for a filled tube — make space first', tone: 'warn' });
      this.nextActAt = this.now + 600;
      return;
    }
    if (!this.inventory.inventory.takeFromSlot(slot, 1)) return;
    const left = this.inventory.inventory.add(fillsTo, 1);
    if (left > 0) this.giveBack(fillsTo);
    this.inventory.broadcast();
    this.player.swing(tx, ty + 8, this.now, GATHER.swingMs * 2);
    this.nextActAt = this.now + WATER.drinkCooldownMs;
    gameEvents.emit('sfx', 'drink');
    this.floating.show(this.player.x, this.player.y - 34, `+1 ${itemDef(fillsTo).name}`, '#4fc2b4');
  }

  /** Deep water within a short reach of the water edge the player faces. */
  private deepWaterNear(x: number, y: number): { x: number; y: number } | null {
    // Prefer a spot a little way out so the bobber floats on open water.
    for (const r of [28, 44, 16, 60, 0]) {
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const px = x + dx * r;
        const py = y + dy * r;
        if (this.chunks.isDeepWater(px, py)) return { x: px, y: py };
      }
    }
    return null;
  }

  private castLine(tx: number, ty: number): void {
    const t = this.gameData.fishing.text;
    const spot = this.deepWaterNear(tx, ty);
    if (!spot) {
      gameEvents.emit('toast', { text: t.needDeep, tone: 'info' });
      this.nextActAt = this.now + 600;
      return;
    }
    const p = this.player;
    this.fishing.cast(this.now, Math.random);
    this.fishAt.x = p.x;
    this.fishAt.y = p.y;
    this.fishAt.spotX = spot.x;
    this.fishAt.spotY = spot.y;
    p.swing(spot.x, spot.y, this.now, GATHER.swingMs * 2);
    gameEvents.emit('sfx', 'swing');
    this.floating.show(p.x, p.y - 34, 'Casting…', '#c8d8dc');
    if (!this.fishTipShown) gameEvents.emit('toast', { text: t.cast, tone: 'info' });
  }

  private stopFishing(): void {
    this.fishing.cancel();
    this.fishBar.clear().setVisible(false);
  }

  /** One frame of an active fishing session. `pull` = E or Space pressed this frame. */
  private updateFishing(pull: boolean): void {
    const f = this.fishing;
    const cfg = this.gameData.fishing;
    const p = this.player;
    const held = this.inventory.held;
    // Walking away or putting the rod down ends the session.
    if (Math.hypot(p.x - this.fishAt.x, p.y - this.fishAt.y) > 10 || !held || itemDef(held.item).tool?.kind !== 'rod') {
      this.stopFishing();
      this.floating.show(p.x, p.y - 34, 'You reel in your line', '#c8d8dc');
      return;
    }
    const ev = f.update(this.now);
    if (ev === 'bite') {
      gameEvents.emit('sfx', 'splash');
      this.floating.show(this.fishAt.spotX, this.fishAt.spotY - 18, '!', '#e6b866');
      if (!this.fishTipShown) {
        this.fishTipShown = true;
        gameEvents.emit('toast', { text: cfg.text.bite, tone: 'info' });
      }
    } else if (ev === 'escaped') {
      this.finishFishing(cfg.text.escaped, false);
      return;
    }
    if (pull) {
      const r = f.press(this.now);
      if (r === 'caught') {
        this.finishFishing(cfg.text.caught, true);
        return;
      }
      if (r === 'missed' || r === 'early') {
        this.finishFishing(r === 'missed' ? cfg.text.missed : cfg.text.early, false, r === 'missed');
        return;
      }
    }
    this.setPrompt(f.phase === 'bite' ? 'E / Space — Pull the line!' : 'Fishing… wait for a bite (move to stop)');
    this.drawFishing();
  }

  private finishFishing(text: string, caught: boolean, wear = true): void {
    const cfg = this.gameData.fishing;
    const p = this.player;
    this.stopFishing();
    this.nextActAt = this.now + 500;
    this.pendingInteract = false;
    if ((caught || wear) && this.inventory.inventory.wear(this.inventory.selected, cfg.rodWear) === 'broke') {
      gameEvents.emit('toast', { text: 'Your fishing rod broke', tone: 'warn' });
    }
    if (caught) {
      const table = this.gameData.loot.get(cfg.lootTable);
      for (const stack of table ? rollLoot(table, Math.random) : []) {
        this.stats.gathered += stack.qty;
        if (!this.pickups.spawn(stack.item, stack.qty, p.x, p.y - 6, this.now, 0, 4)) {
          const left = this.inventory.add(stack.item, stack.qty);
          if (left > 0) this.dropInFront(stack.item, left);
        }
      }
      gameEvents.emit('sfx', 'splash');
    }
    this.inventory.broadcast();
    this.floating.show(p.x, p.y - 36, text, caught ? '#8ec26a' : '#e6b866');
  }

  /** Bobber on the water; during a bite, the timing bar above the player. */
  private drawFishing(): void {
    const g = this.fishBar.clear().setVisible(true);
    const f = this.fishing;
    const bob = Math.sin(this.now / (f.phase === 'bite' ? 60 : 300)) * (f.phase === 'bite' ? 2.5 : 1);
    g.lineStyle(1, 0xe6e6dc, 0.6).lineBetween(this.player.x + 6, this.player.y - 22, this.fishAt.spotX, this.fishAt.spotY + bob);
    g.fillStyle(0xd9644a, 1).fillCircle(this.fishAt.spotX, this.fishAt.spotY + bob, 2);
    if (f.phase !== 'bite') return;
    const w = 80;
    const x0 = this.player.x - w / 2;
    const y0 = this.player.y - 66;
    const zw = this.gameData.fishing.zoneWidth * w;
    g.fillStyle(0x08110f, 0.85).fillRoundedRect(x0 - 2, y0 - 2, w + 4, 12, 3);
    g.fillStyle(0x4f9a46, 1).fillRect(x0 + f.zoneCenter * w - zw / 2, y0, zw, 8);
    const mx = x0 + f.marker(this.now) * w;
    g.fillStyle(f.inZone(this.now) ? 0xffffff : 0xe6b866, 1).fillRect(mx - 1, y0 - 2, 2, 12);
  }

  private updateBuilding(): void {
    const b = this.building;
    const held = this.inventory.inventory.get(b.slot);
    if (!held || itemDef(held.item).places !== b.structureId || b.slot !== this.inventory.selected) {
      b.cancel();
      return;
    }
    const ptr = this.input.activePointer;
    ptr.updateWorldPoint(this.cameras.main);
    this.playerRect.setTo(this.player.body.x, this.player.body.y, this.player.body.width, this.player.body.height);
    b.update(ptr.worldX, ptr.worldY, this.player.x, this.player.y, this.playerRect);
  }

  private tryPlace(): void {
    const b = this.building;
    if (!b.active) return;
    this.updateBuilding();
    if (!b.active) return;
    if (!b.valid) {
      gameEvents.emit('toast', { text: 'Can’t build there — find clear, dry ground nearby', tone: 'warn' });
      return;
    }
    const taken = this.inventory.inventory.takeFromSlot(b.slot, 1);
    if (!taken) return b.cancel();
    const placed = this.structures.place(b.structureId, b.x, b.y);
    if (!placed) {
      this.inventory.inventory.add(taken.item, 1);
      return b.cancel();
    }
    this.inventory.broadcast();
    this.stats.built++;
    this.emitStructures();
    gameEvents.emit('sfx', 'build');
    this.floating.show(b.x, b.y - 30, `Built ${placed.def.name}`, '#8ec26a');
    if (placed.def.station === 'campfire') this.completeObjective('campfire');
    if (placed.def.interaction === 'sleep') this.completeObjective('shelter');
    if (!this.inventory.inventory.get(b.slot)) b.cancel();
  }

  private trySleep(): void {
    const sl = this.gameData.survival.sleep;
    if (!inHourWindow(this.clock.hour, sl.fromHour, sl.untilHour)) {
      gameEvents.emit('toast', { text: `Too early to sleep — rest from ${hourLabel(sl.fromHour)} until ${hourLabel(sl.untilHour)}`, tone: 'info' });
      return;
    }
    this.busy = true;
    this.building.cancel();
    this.player.halt();
    this.pointerHeld = false;
    const cam = this.cameras.main;
    cam.fadeEffect.reset();
    cam.fadeOut(700, 2, 4, 8);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      const secs = this.clock.secondsUntil(sl.wakeHour);
      this.clock.advance(secs);
      this.now += secs * 1000;
      const slept = this.effects.update(secs, this.clock.secondsPerHour);
      if (slept.damage > 0) this.survival.damage(Math.min(slept.damage, Math.max(0, this.survival.stats.health - 1)), 'poison');
      if (slept.heal > 0) this.survival.heal(slept.heal);
      this.survival.sleep();
      this.lastHealth = this.survival.stats.health;
      this.gathering.update(this.now, this.player.x, this.player.y);
      this.completeObjective('sleep');
      const saved = this.save();
      this.input.keyboard?.resetKeys();
      this.pendingUse = false;
      this.pendingInteract = false;
      cam.fadeIn(900, 2, 4, 8);
      this.busy = false;
      gameEvents.emit('toast', {
        text: saved ? `Day ${this.clock.dayNumber} — you wake rested. Journey saved.` : `Day ${this.clock.dayNumber} — could not save (browser storage unavailable)`,
        tone: saved ? 'info' : 'warn',
      });
    });
  }

  private save(auto = false): boolean {
    if (this.busy && auto) return false;
    if (auto && this.inDanger()) return false;
    const ok = writeSave(
      buildSave({
        clock: this.clock,
        survival: this.survival,
        player: this.player,
        inventory: this.inventory,
        structures: this.structures,
        chunks: this.chunks,
        seed: this.seed,
        pickups: this.pickups,
        objectives: this.objectives,
        effects: this.effects,
        shrines: this.shrineState,
        openedChests: this.openedChests,
        knownPlants: this.knownPlants,
        quest: { tabletsRead: this.quest.tabletsRead, heartReached: this.quest.heartReached, restored: this.quest.restored },
        stats: this.stats,
        now: this.now,
      }),
    );
    if (ok) gameEvents.emit('game:saved', { auto });
    else if (auto && !this.autosaveWarned) {
      this.autosaveWarned = true;
      gameEvents.emit('toast', { text: 'Autosave failed — browser storage is unavailable or full', tone: 'warn' });
    }
    return ok;
  }

  /** Low health or a hostile close by: an autosave here could trap a reload in a lost fight. */
  private inDanger(): boolean {
    const st = this.survival.stats;
    if (st.health < this.gameData.survival.maxHealth * 0.25) return true;
    const e = this.encounters.nearest(this.player.x, this.player.y - 10, 150);
    return e !== null && (e.def.kind === 'spirit' || e.aiState !== 'wander');
  }

  /** Wading through shallows is slow; mud a little slow. */
  private terrainSpeed(x: number, y: number): number {
    const t = this.chunks.tileAtWorld(x, y - 4);
    if (t === TILE.shallowsA) return 0.6;
    if (t === TILE.mud) return 0.85;
    return 1;
  }

  private emitStructures(): void {
    gameEvents.emit(
      'structures:changed',
      this.structures.records.map((s) => ({ x: s.x, y: s.y, kind: s.def.station === 'campfire' ? 'fire' : (s.def.interaction ?? 'other') })),
    );
  }

  private applySave(save: SaveData): void {
    if (Number.isFinite(save.clockSeconds)) this.clock.totalSeconds = save.clockSeconds;
    const ps = save.player;
    this.survival = new Survival(this.gameData.survival, {
      ...(Number.isFinite(ps.health) && ps.health > 0 ? { health: ps.health } : {}),
      ...(Number.isFinite(ps.hunger) ? { hunger: ps.hunger } : {}),
      ...(Number.isFinite(ps.thirst) ? { thirst: ps.thirst } : {}),
      ...(Number.isFinite(ps.stamina) ? { stamina: ps.stamina } : {}),
      ...(Number.isFinite(ps.warmth) ? { warmth: ps.warmth } : {}),
    });
    const { slots, removed } = sanitizeInventory(save.inventory, this.gameData, this.inventory.inventory.size);
    this.inventory.inventory.restore(slots);
    this.inventory.selected = clampSelected(save.selected);
    if (removed > 0) {
      this.time.delayedCall(600, () =>
        gameEvents.emit('toast', { text: `${removed} unknown item stack(s) from an older version were removed`, tone: 'warn' }),
      );
    }
    // Node diffs must exist before chunks load so harvested spots stay harvested.
    this.chunks.restoreNodes(save.nodes, this.now);
    const refundTypes: string[] = [...save.refundStructures];
    for (const st of save.structures) {
      if (this.structures.hasAt(st.x, st.y)) continue;
      if (!this.structures.place(st.type, st.x, st.y)) refundTypes.push(st.type);
    }
    this.placePlayer(ps.x, ps.y);
    // Refunds go to the inventory first, then the ground at the player's feet; anything that
    // still can't be placed is counted and reported, never silently dropped.
    let refunded = 0;
    let lost = 0;
    const give = (item: string, qty: number) => {
      const left = this.inventory.add(item, qty);
      if (left > 0 && !this.pickups.spawn(item, left, this.player.x, this.player.y + 10, 0, 0, 6)) lost += left;
    };
    for (const type of refundTypes) {
      const kit = [...this.gameData.items.values()].find((i) => i.places === type);
      if (!kit) continue;
      refunded++;
      give(kit.id, 1);
    }
    for (const r of save.refundItems) {
      if (!this.gameData.items.has(r.item)) continue;
      refunded++;
      give(r.item, r.qty);
    }
    for (const pk of save.pickups) {
      if (this.gameData.items.has(pk.item) && !this.pickups.spawn(pk.item, pk.qty, pk.x, pk.y, 0, 0, 0, false, pk.durability)) lost += pk.qty;
    }
    if (refunded > 0 || lost > 0) {
      const msg =
        (refunded > 0 ? `${refunded} structure(s)/item stack(s) from an older save were returned to you. ` : '') +
        (lost > 0 ? `${lost} ground item(s) could not be restored (too many on the ground).` : '');
      this.time.delayedCall(800, () => gameEvents.emit('toast', { text: msg.trim(), tone: lost > 0 ? 'warn' : 'info' }));
    }
    this.objectives = new Objectives(save.objectives);
    for (const k of save.knownPlants) this.knownPlants.add(k);
    this.effects.restore(save.effects.map((e) => ({ ...e, id: e.id as EffectId })));
    for (const s of save.shrines) this.shrineState.set(s.key, s.lastOffering);
    for (const k of save.openedChests) this.openedChests.add(k);
    this.quest = new QuestLog(this.gameData, save.tabletsRead, save.heartReached, this.gen.tabletSites().length, save.restored);
    this.encounters.calmed = this.quest.restored;
    this.stats = { ...save.stats };
    this.kills = save.stats.kills;
  }

  /**
   * Puts the player at a saved spot if it is valid (finite, not in deep water, not inside a
   * solid); otherwise at spawn. Chunks around the candidate load first so the check is real.
   */
  private placePlayer(x: number, y: number): void {
    let ok = Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) < 5e6 && Math.abs(y) < 5e6;
    if (ok) {
      this.chunks.loadAllAround(x, y, this.now);
      // Inset by a pixel: resting flush against a solid (edges touching) is a valid spot.
      ok = !this.chunks.isDeepWater(x, y - 4) && this.physics.overlapRect(x - 7, y - 10, 14, 9, false, true).length === 0;
    }
    const px = ok ? x : this.spawn.x;
    const py = ok ? y : this.spawn.y;
    if (!ok) this.chunks.loadAllAround(px, py, this.now);
    this.player.body.reset(px, py);
  }

  private die(): void {
    if (this.busy) return;
    this.busy = true;
    this.stopFishing();
    this.building.cancel();
    this.player.halt();
    this.encounters.clear();
    this.projectiles.clear();
    const cause = this.survival.lastDamageCause ?? 'injury';
    const summary = { day: this.clock.dayNumber, time: this.clock.label(), cause };
    const cam = this.cameras.main;
    this.shake(250, 0.004);
    cam.fadeEffect.reset();
    cam.fadeOut(1400, 40, 6, 4);
    cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.stop(SCENES.ui);
      this.scene.start(SCENES.gameOver, summary);
    });
  }

  private completeObjective(id: string): void {
    if (!this.objectives.complete(id)) return;
    gameEvents.emit('objectives:changed', this.objectives.view());
  }

  /** Drops a stack just in front of the player; it can't be re-collected for a moment. */
  private dropInFront(item: string, qty: number, durability?: number): boolean {
    const p = this.player;
    const x = p.x + p.facingVec.x * 18;
    const y = p.y + p.facingVec.y * 14 + 2;
    const ok = this.pickups.spawn(item, qty, x, y, this.now, PICKUP.dropDelayMs, 4, true, durability);
    if (ok) this.floating.show(x, y - 14, `-${qty} ${itemDef(item).name}`, '#8d978f');
    return ok;
  }

  private animateWater(dt: number): void {
    this.nextWaterFrameAt -= dt;
    if (this.nextWaterFrameAt > 0) return;
    this.nextWaterFrameAt = WATER.frameMs;
    this.chunks.animateWater();
  }

  private setPrompt(text: string): void {
    if (text === this.lastPrompt) return;
    this.lastPrompt = text;
    gameEvents.emit('interact:prompt', text);
  }

  // ---------- Input, pause, lifecycle ----------

  private bindInput(): void {
    const kb = this.input.keyboard;
    if (!kb) throw new Error('Keyboard input unavailable');
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      up: kb.addKey(K.W),
      down: kb.addKey(K.S),
      left: kb.addKey(K.A),
      right: kb.addKey(K.D),
      sprint: kb.addKey(K.SHIFT),
      interact: kb.addKey(K.E),
      use: kb.addKey(K.F),
    };
    kb.addKey(K.F3, true);
    kb.on('keydown-F3', this.debugHandler);
    kb.on('keydown', this.pressHandler);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
  }

  /** Only fires when no UI element above captured the click (Phaser globalTopOnly). */
  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.modalOpen || this.busy) return;
    if (this.building.active) {
      if (pointer.rightButtonDown()) this.building.cancel();
      else if (pointer.leftButtonDown()) this.tryPlace();
      return;
    }
    if (!pointer.leftButtonDown()) return;
    if (this.fishing.phase !== 'idle') {
      this.pendingInteract = true;
      return;
    }
    const c = this.gameData.combat;
    const near = this.encounters.nearest(this.player.x, this.player.y - 10, c.baseReach + c.spearBonusReach + 30);
    const nodeUnder = this.interaction.nodeAt(pointer.worldX, pointer.worldY, this.player.x, this.player.y);
    const aimingAtCreature = near !== null && Math.hypot(near.x - pointer.worldX, near.cy - pointer.worldY) < 40;
    if (near && (!nodeUnder || aimingAtCreature)) {
      this.attack(pointer.worldX, pointer.worldY);
      return;
    }
    this.pointerHeld = true;
    const node = this.interaction.nodeAt(pointer.worldX, pointer.worldY, this.player.x, this.player.y);
    if (node) this.act(node, true);
    else if (this.interaction.current.kind === 'none' && this.now >= this.nextActAt) {
      this.player.swing(pointer.worldX, pointer.worldY, this.now, GATHER.swingMs);
      this.nextActAt = this.now + GATHER.hitCooldownMs;
    }
  }

  private openPause(): void {
    if (!this.scene.isActive() || this.scene.isActive(SCENES.pause) || this.busy) return;
    this.save(true);
    this.player.halt();
    this.pointerHeld = false;
    this.scene.pause();
    this.scene.pause(SCENES.ui);
    this.scene.launch(SCENES.pause);
    this.scene.bringToTop(SCENES.pause);
    gameEvents.emit('audio:duck', true);
  }

  private onResume(): void {
    // Keys released while paused never reached this scene; clear them to avoid stuck movement.
    this.input.keyboard?.resetKeys();
    this.pointerHeld = false;
    gameEvents.emit('audio:duck', false);
  }

  private toggleDebug(): void {
    this.debugOn = !this.debugOn;
    const world = this.physics.world;
    if (this.debugOn && !world.debugGraphic) world.createDebugGraphic();
    world.drawDebug = this.debugOn;
    world.debugGraphic?.setDepth(DEPTH.debug).setVisible(this.debugOn).clear();
    gameEvents.emit('debug:toggle', this.debugOn);
  }

  private onShutdown(): void {
    this.events.off(Phaser.Scenes.Events.RESUME, this.onResume, this);
    this.game.events.off(Phaser.Core.Events.BLUR, this.openPause, this);
    this.game.events.off(Phaser.Core.Events.HIDDEN, this.openPause, this);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    const kb = this.input.keyboard;
    kb?.off('keydown-F3', this.debugHandler);
    kb?.off('keydown', this.pressHandler);
    kb?.removeAllKeys(true, true);
    // Scene shutdown destroys every game object and the physics world; just drop references.
    this.chunks.forget();
    this.scene.stop(SCENES.ui);
    gameEvents.emit('ambience', { day: 0, night: 0, rain: 0, fire: 0 });
    gameEvents.emit('audio:duck', false);
  }
}

function hourLabel(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
