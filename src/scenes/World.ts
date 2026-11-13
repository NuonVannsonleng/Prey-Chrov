import Phaser from 'phaser';
import { CAMERA, DEBUG_HOOKS, DEPTH, GATHER, PICKUP, SCENES, WATER, WORLD_GEN } from '../config';
import { getGameData, itemDef } from '../data/gameData';
import type { GameData, ItemDef, SeasonConfig, Station, ToolKind } from '../data/schema';
import type { ItemStack } from '../systems/Inventory';
import { Player, type PlayerKeys } from '../entities/Player';
import type { ResourceNode } from '../entities/ResourceNode';
import { Building } from '../systems/Building';
import { Encounters, OUTPOST_MAX, OUTPOST_SPACING } from '../systems/Encounters';
import { Projectiles } from '../systems/Projectiles';
import { StatusEffects, type EffectId } from '../systems/StatusEffects';
import type { Enemy } from '../entities/Enemy';
import { hash2, hashString, mulberry32 } from '../utils/random';
import { forecast, weatherModifiers, type Forecast } from '../systems/Season';
import { QuestLog } from '../systems/Quest';
import { getSettings, onSettings } from '../systems/Settings';
import { rollLoot } from '../systems/Loot';
import { GameClock, darknessAt, inHourWindow, phaseOf } from '../systems/Clock';
import { gameEvents, onSceneEvent, type ClockTick, type PlayerTick, type SurvivalTick } from '../systems/GameEvents';
import { Gathering } from '../systems/Gathering';
import { FishingSession } from '../systems/Fishing';
import { Progression } from '../systems/Progression';
import { SideQuestBook, type SideUpdate } from '../systems/SideQuests';
import { playerNoise } from '../systems/Perception';
import { LANDMARK_NAMES, PLATE_WINDOW_SECONDS, STEPPING_CELL, ruinKey, ruinPlan, trapPhase, type LandmarkId } from '../world/RuinPlan';
import type { LandmarkObj, RuinFeatureObj } from '../world/ChunkManager';
import { Interaction } from '../systems/Interaction';
import { Lighting } from '../systems/Lighting';
import { Objectives } from '../systems/Objectives';
import { Pickups } from '../systems/Pickups';
import { PlayerInventory } from '../systems/PlayerInventory';
import { currentSlot, deleteSlot, readSave, writeSave, type SaveData } from '../systems/Save';
import { CONTENT_VERSION, defaultRules, describeRules, parseRules, ruleEffects, type EffectKey, type JourneyRules } from '../systems/Rules';
import { loadRecords, recordEvent, saveRecords, type RecordEvent, type RecordsState } from '../systems/Records';
import { buildSave, clampSelected, sanitizeInventory } from '../systems/SaveGame';
import { Structures, footprintOf, type Structure } from '../systems/Structures';
import { Survival } from '../systems/Survival';
import { TEX, TILE } from '../textures';
import { FloatingText } from '../ui/FloatingText';
import { PropLayer } from '../world/PropLayer';
import { HeldKeys, oncePerKeyEvent, type HeldKey } from '../utils/keys';
import { ChunkManager, type RootWall } from '../world/ChunkManager';
import type { EndingData } from './Ending';
import { WorldGen } from '../world/WorldGen';

/** Upper bound on distinct stacks one harvest can drop (loot tables have at most this many items). */
const MAX_LOOT_STACKS = 6;
const TORCH_DARKNESS = 0.15;
/** Withered roots regrow after this long out of the light (ms of game time). */
const ROOT_REGROW_MS = 3000;

interface WorldKeys extends PlayerKeys {
  interact: HeldKey;
  use: HeldKey;
}

export interface WorldStartData {
  /** Resume from the save slot instead of starting a new journey. */
  load?: boolean;
  /** World seed for a new journey (random if omitted; ?seed=N in the URL also works). */
  seed?: number;
  /** M17: rules for a new journey (difficulty, modifiers, permadeath). Ignored when loading. */
  rules?: JourneyRules;
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
  /** M11: skills and knowledge, worn gear. */
  private progression!: Progression;
  private readonly equipment: { body: ItemStack | null; feet: ItemStack | null } = { body: null, feet: null };
  private readonly survivalMods = { thirst: 1, hunger: 1 };
  /** Skill effects, recomputed on load and level-up (not per frame). */
  private fx = { foragingExtraChance: 0, toolWear: 1, drain: 1, combatDamage: 0, speed: 1 };
  /** M17: this journey's rules and the multipliers they put in force. */
  private rules: JourneyRules = defaultRules();
  private rfx: Record<EffectKey, number> = ruleEffects(defaultRules(), { default: 'survival', presets: [], modifiers: [] });
  private records!: RecordsState;
  private ruleColdCache = new WeakMap<object, SeasonConfig['cold']>();

  /** Tool wear: skills slow it, difficulty may speed it up. */
  private get wearMult(): number {
    return this.fx.toolWear * this.rfx.toolWear;
  }

  /** Monsoon cold scaled by difficulty (cached per source config). */
  private ruleCold(cfg: SeasonConfig['cold']): SeasonConfig['cold'] {
    if (this.rfx.warmthLoss === 1) return cfg;
    let c = this.ruleColdCache.get(cfg);
    if (!c) {
      c = { ...cfg, lossPerHour: cfg.lossPerHour * this.rfx.warmthLoss };
      this.ruleColdCache.set(cfg, c);
    }
    return c;
  }

  /** M17: local achievements. Counters are cumulative across journeys on this browser. */
  private record(ev: RecordEvent, value = 1): void {
    if (!this.records) return;
    const earned = recordEvent(this.records, this.gameData.achievements, ev, { difficulty: this.rules.difficulty, permadeath: this.rules.permadeath }, value);
    saveRecords(this.records);
    for (const a of earned) gameEvents.emit('achievement', { name: a.name, description: a.description });
  }
  private feetGear: ItemDef['gear'] | undefined;
  private coldWorn: SeasonConfig['cold'] | null = null;
  private lastDayNumber = 0;
  /** M12 stealth/encounters. */
  private noise = 0;
  private hidden = false;
  private nextCoverAt = 0;
  private ambushRolledNight = -1;
  /** M13 exploration state (saved). */
  private readonly explored = new Set<string>();
  private readonly found = { ruins: new Set<string>(), landmarks: new Set<string>(), shortcuts: new Set<string>(), shrines: new Set<string>(), puzzles: new Set<string>() };
  private markers: Array<{ x: number; y: number; kind: 'pin' | 'note'; text: string }> = [];
  private readonly lampProgress = new Map<string, string[]>();
  private readonly plateProgress = new Map<string, { pressed: Set<string>; until: number }>();
  private nextTrapHitAt = 0;
  /** M14 side stories, story flags and their epilogue lines (saved). */
  private sideQuests!: SideQuestBook;
  private readonly storyFlags = new Set<string>();
  private endingLines: string[] = [];
  /** M15 set pieces (saved flags + live state). */
  private readonly setFlags = { tuskerDefeated: false, tuskerRumour: false, stormDone: false, blightCleared: false };
  private tusker: Enemy | null = null;
  private lair: { x: number; y: number } | null = null;
  private nextBossBarAt = 0;
  private nextTuskerTryAt = 0;
  private blightBarShown = false;
  private blightBarLeft = -1;
  /** When the blight last struck the player: only its own blows trigger the checkpoint retry. */
  private lastBlightHitAt = -Infinity;
  private telegraphsDrawn = false;
  private bossBarShown = false;
  private readonly storm = { phase: 'none' as 'none' | 'warning' | 'active', until: 0, nextStrikeAt: 0 };
  private readonly strikes: Array<{ x: number; y: number; at: number; kind: 'storm' | 'blight' }> = [];
  private readonly blight = { active: false, cores: [] as Array<{ x: number; y: number; burn: number }>, nextSlamAt: 0 };
  private telegraphG!: Phaser.GameObjects.Graphics;
  private stormCold: SeasonConfig['cold'] | null = null;
  /** A story moment is on screen: the world holds still (no attacks, no drain). */
  private storyOpen = false;
  /** Side stories on (debug ?nostory turns them off for tests). */
  storiesEnabled = true;
  /** Set pieces on (debug ?calm turns them off for tests of other systems). */
  setPiecesEnabled = true;
  /** Story updates and events waiting for a safe moment (not busy, not in danger). */
  private readonly storyBacklog: SideUpdate[] = [];
  private readonly storyEventsWaiting: string[] = [];
  private nextChoiceRetryAt = 0;
  private readonly trapPhases = new Map<string, string>();
  private ambushAt = 0;
  private readonly encFrame = { playerX: 0, playerY: 0, darkness: 0, day: 1, spiritWard: false, noise: 0, hidden: false, crouching: false, monsoon: false, distTiles: 0, spawnScale: 1, detection: 1, eliteScale: 1 };
  private nextKnowledgeAt = 0;
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
    const k = getSettings().keys;
    if (e.code === k.use) this.pendingUse = true;
    else if (e.code === k.attack) this.pendingAttack = true;
    else if (e.code === k.interact) this.pendingInteract = true;
    else if (e.code === k.rotate) this.pendingRotate = true;
    else if (e.code === k.dismantle) this.pendingDismantle = true;
  });
  private pendingRotate = false;
  private pendingDismantle = false;
  /** X must be pressed twice on the same structure to dismantle it. */
  private dismantleArmed = { uid: -1, until: 0 };
  private openChestUid = -1;
  private lastWearHour = -1;
  private readonly playerRect = new Phaser.Geom.Rectangle();
  private readonly tick: PlayerTick = { x: 0, y: 0, speed: 0, sprinting: false, stealth: '' };
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
    // M17: rules come from the save (pre-M17 saves: Survival, original content) or the new-journey setup.
    const modIds = this.gameData.difficulty.modifiers.map((m) => m.id);
    this.rules = save ? parseRules(save.rules, modIds) : start?.rules ? { ...parseRules(start.rules, modIds), content: CONTENT_VERSION } : defaultRules();
    this.rfx = ruleEffects(this.rules, this.gameData.difficulty);
    this.registry.set('journeyRules', describeRules(this.rules, this.gameData.difficulty));
    this.records = loadRecords();
    if (!save) {
      this.records.journeys++;
      saveRecords(this.records);
    }
    this.gen = new WorldGen(this.seed, this.gameData.biomes, this.gameData.shrines.chancePerClearingChunk, this.rules.content);
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
    this.progression = new Progression(this.gameData.progression);
    this.equipment.body = null;
    this.equipment.feet = null;
    this.coldWorn = null;
    this.nextKnowledgeAt = 0;
    this.ambushAt = 0;
    this.ambushRolledNight = -1;
    this.explored.clear();
    this.sideQuests = new SideQuestBook(getGameData().sidequests);
    this.storyFlags.clear();
    this.endingLines = [];
    this.storyOpen = false;
    this.setFlags.tuskerDefeated = this.setFlags.tuskerRumour = this.setFlags.stormDone = this.setFlags.blightCleared = false;
    this.tusker = null;
    this.lair = null;
    this.nextBossBarAt = 0;
    this.bossBarShown = false;
    this.blightBarShown = false;
    this.blightBarLeft = -1;
    this.nextTuskerTryAt = 0;
    this.lastBlightHitAt = -Infinity;
    this.telegraphsDrawn = false;
    this.storm.phase = 'none';
    this.strikes.length = 0;
    this.blight.active = false;
    this.blight.cores = [];
    this.telegraphG = this.add.graphics().setDepth(DEPTH.floatingText - 7);
    this.storyBacklog.length = 0;
    this.storyEventsWaiting.length = 0;
    this.nextChoiceRetryAt = 0;
    for (const s of Object.values(this.found)) s.clear();
    this.markers = [];
    this.lampProgress.clear();
    this.plateProgress.clear();
    this.nextTrapHitAt = 0;
    this.trapPhases.clear();
    this.noise = 0;
    this.hidden = false;

    this.floating = new FloatingText(this);
    this.interaction = new Interaction(this, this.chunks.nodes, (x, y) => this.chunks.tileAtWorld(x, y), this.structures.list, this.chunks.shrines, this.chunks.ruins, this.chunks.roots, () => this.chunks.heart, this.chunks.features, this.chunks.landmarks);
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
      hitPlayer: (dmg, fx, fy) => this.hurtPlayer(Math.max(1, Math.round(dmg * this.rfx.enemyDamage)), 'spirit', fx, fy),
    });
    this.encounters = new Encounters(this, this.gameData, this.props.solids, {
      isDeepWater: (x, y) => this.chunks.isDeepWater(x, y),
      isLoaded: (cx, cy) => this.chunks.isLoaded(cx, cy),
      biomeAt: (tx, ty) => this.gen.biomeAt(tx, ty),
      lightAt: (x, y, m) => this.lightAt(x, y, m),
      shrineDistance: (x, y) => this.shrineDistance(x, y),
      outpostDistance: (x, y) => this.outpostDistance(x, y),
      hitPlayer: (enemy, dmg) => this.enemyHitsPlayer(enemy, dmg),
      fireOrb: (enemy, dx, dy) => {
        const pr = enemy.def.projectile;
        if (pr) this.projectiles.fire(enemy.x + dx * 10, enemy.cy + dy * 10, dx, dy, pr.speed, pr.damage, pr.range);
      },
      onKilled: (enemy) => this.onEnemyKilled(enemy),
    });
    this.encounters.enabled = !(DEBUG_HOOKS && new URLSearchParams(window.location.search).has('calm'));
    // Debug only: ?nostory keeps side stories quiet for automated tests of other systems.
    this.storiesEnabled = !(DEBUG_HOOKS && new URLSearchParams(window.location.search).has('nostory'));
    // Debug only: ?calm also keeps set pieces (tusker, storm, blight) out of automated tests.
    this.setPiecesEnabled = !(DEBUG_HOOKS && new URLSearchParams(window.location.search).has('calm'));
    this.building = new Building(this, this.structures);
    this.lighting = new Lighting(this, CAMERA.zoom);
    this.clock = new GameClock(this.gameData.survival.day);
    this.survival = new Survival(this.gameData.survival);
    this.objectives = new Objectives();
    this.inventory = new PlayerInventory(
      this,
      (item, qty, durability) => this.dropInFront(item, qty, durability),
      () => this.stations,
      (recipeId, output) => {
        this.stats.crafted++;
        if (!this.grant('craft_first', recipeId)) this.grant('craft', null);
        const r = this.gameData.recipes.get(recipeId);
        if (r?.category === 'food' && r.station !== 'none') {
          this.grant('cook', null);
          this.record('meal_cooked');
        }
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
    this.inventory.knows = (u) => this.progression.knows(u);
    this.applyProgressionEffects();
    this.applyGear();
    this.lastDayNumber = this.clock.dayNumber;
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
    onSceneEvent(this, 'storage:move', (req) => this.moveStorage(req.uid, req.from, req.slot));
    onSceneEvent(this, 'storage:close', () => {
      this.openChestUid = -1;
    });
    onSceneEvent(this, 'ui:ready', () => {
      // A rebuilt HUD has no boss bar: let the blight send it again.
      this.blightBarShown = false;
      this.blightBarLeft = -1;
      gameEvents.emit('objectives:changed', this.objectives.view());
      gameEvents.emit('craft:stations', [...this.stations]);
      gameEvents.emit('world:info', { seed: this.seed });
      gameEvents.emit('quest:changed', this.quest.view());
      this.weatherKey = '';
      this.nextWeatherAt = 0;
      this.nextQuestTargetAt = 0;
      this.emitStructures();
      this.emitOutposts();
      this.emitCharacter();
      this.emitSideQuests();
      // A choice interrupted by a reload is offered again.
      const pending = this.sideQuests.pendingChoice();
      if (pending) this.time.delayedCall(800, () => this.handleStory([pending]));
    });
    onSceneEvent(this, 'equipment:unequip', (slot) => this.unequip(slot));
    onSceneEvent(this, 'map:request', () => gameEvents.emit('map:data', this.mapData()));
    onSceneEvent(this, 'story:answer', ({ id, accept }) => {
      this.handleStory(this.sideQuests.answerOffer(id, accept));
      if (!accept) gameEvents.emit('toast', { text: 'You let that story go. The main journey is unaffected.', tone: 'info' });
      this.emitSideQuests();
    });
    onSceneEvent(this, 'story:choose', ({ id, option }) => this.chooseStory(id, option));
    onSceneEvent(this, 'ui:story', (open) => {
      this.storyOpen = open;
      if (open) {
        this.player.halt();
        this.pointerHeld = false;
      }
    });
    onSceneEvent(this, 'map:marker', ({ x, y }) => this.toggleMarker(x, y));
    this.scene.launch(SCENES.ui);

    this.events.on(Phaser.Scenes.Events.RESUME, this.onResume, this);
    this.game.events.on(Phaser.Core.Events.BLUR, this.openPause, this);
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.openPause, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
  }

  private resetFlags(): void {
    this.dust = null;
    this.nextBumpAt = 0;
    this.lookX = 0;
    this.lookY = 0;
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
    this.pendingRotate = false;
    this.pendingDismantle = false;
    this.dismantleArmed = { uid: -1, until: 0 };
    this.openChestUid = -1;
    this.lastWearHour = -1;
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
    if (this.busy || this.storyOpen) {
      this.pendingUse = false;
      this.pendingInteract = false;
      this.pendingAttack = false;
      this.renderLighting();
      return;
    }
    this.now += dt;
    const inputOn = !this.modalOpen;
    const cfg = this.gameData.survival;

    p.step(this.keys, dt, this.now, inputOn, this.survival.canSprint, this.terrainSpeed(p.x, p.y) * (p.crouching ? this.gameData.stealth.crouchSpeed : 1));
    this.updateCameraFeel(p, dt, inputOn);
    this.clock.advance(dt / 1000);
    this.updateWeather();
    const wm = weatherModifiers(this.weather, this.gameData.season);
    const drain = this.fx.drain;
    this.survivalMods.hunger = wm.hunger * drain * this.rfx.hungerDrain;
    this.survivalMods.thirst = wm.thirst * drain * this.rfx.thirstDrain;
    this.survival.update(dt / 1000, this.clock.secondsPerHour, p.sprinting, this.survivalMods);
    this.survival.updateWarmth(dt / 1000, this.clock.secondsPerHour, this.weather.monsoon && !this.isSheltered(p.x, p.y), this.ruleCold(this.storm.phase === 'active' ? this.stormColdConfig() : (this.coldWorn ?? this.gameData.season.cold)));
    const fx = this.effects.update(dt / 1000, this.clock.secondsPerHour);
    if (fx.damage > 0) this.survival.damage(fx.damage, 'poison');
    if (fx.heal > 0) this.survival.heal(fx.heal);
    this.watchSurvival();
    if (this.survival.dead && this.blight.active && this.now - this.lastBlightHitAt < 1500) this.retryBlight();
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
    this.updateStealth(p);
    const ef = this.encFrame;
    ef.playerX = p.x;
    ef.playerY = p.y;
    ef.darkness = this.darkness();
    ef.day = this.clock.dayNumber;
    ef.spiritWard = this.effects.has('ward');
    ef.noise = this.noise;
    ef.hidden = this.hidden;
    ef.crouching = p.crouching;
    ef.monsoon = this.weather.monsoon;
    ef.distTiles = Math.hypot(p.x - this.spawn.x, p.y - this.spawn.y) / 32;
    ef.spawnScale = this.rfx.spawnCap;
    ef.detection = this.rfx.detection;
    ef.eliteScale = this.rfx.eliteChance;
    this.encounters.update(dt, this.now, ef);
    this.updateAmbush(ef);
    this.updateSetPieces(dt);
    this.projectiles.update(dt, this.now);
    this.updateShrines();
    this.updateRuins();
    this.updateHeart();
    this.frameDt = dt;
    this.updateFeatures();
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
        this.setPrompt(target.kind === 'structure' ? this.structurePrompt(target.structure) : this.promptFor(target.kind, target));
        if (this.pendingRotate) {
          if (this.building.active) this.building.rotate();
          else if (target.kind === 'structure' && target.structure.def.station === 'workbench' && this.heldToolWorn()) this.repairHeldTool();
          else if (target.kind === 'structure') this.repairStructure(target.structure);
        }
        if (this.pendingDismantle && !this.building.active && target.kind === 'structure') this.dismantle(target.structure);
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
    this.pendingRotate = false;
    this.pendingDismantle = false;
    this.updateRoofs();
    if (this.openChestUid >= 0) {
      const c = this.structures.byUid(this.openChestUid);
      if (!c || Math.hypot(c.x - p.x, c.y - p.y) > 120) {
        this.openChestUid = -1;
        gameEvents.emit('storage:dismiss');
      }
    }
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

  private outpostDistance(x: number, y: number): number {
    let best = Infinity;
    for (const s of this.structures.records) if (s.def.outpost) best = Math.min(best, Math.hypot(s.x - x, s.y - y));
    // "Rekindle the lamps" (Embers in the Stone): solved ruins are safe too.
    if (this.storyFlags.has('ruin_ward')) {
      for (const k of this.found.puzzles) {
        const [tx, ty] = k.split(',').map(Number) as [number, number];
        best = Math.min(best, Math.hypot(tx * 32 + 16 - x, ty * 32 + 16 - y));
      }
    }
    return best;
  }

  private applyStoryFlags(): void {
    const cfg = this.gameData.fishing;
    this.fishing = new FishingSession(this.storyFlags.has('river_blessing') ? { ...cfg, zoneWidth: Math.min(0.8, cfg.zoneWidth + 0.08) } : cfg);
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
    const damage = (tool ? tool.damage : c.handDamage) + this.fx.combatDamage;
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
    for (const e of hits) this.floating.show(e.x, e.cy - 14, e.lastArmoured ? this.gameData.setpieces.text['armoured'] ?? '' : `-${e.lastDamage || damage}`, e.lastArmoured ? '#e6b866' : '#ffffff');
    if (hits.length > 0 && tool && tool.kind !== 'rod') {
      if (this.inventory.inventory.wear(this.inventory.selected, this.wearMult) === 'broke') {
        gameEvents.emit('toast', { text: `Your ${itemDef(held?.item ?? '').name} broke`, tone: 'warn' });
      }
      this.inventory.broadcast();
    }
    return hits.length > 0;
  }

  private enemyHitsPlayer(enemy: Enemy, rawDamage: number): void {
    const cause = enemy.def.kind === 'spirit' ? 'spirit' : 'wildlife';
    // Difficulty scales how hard a landed blow is; every attack keeps its telegraph.
    const damage = Math.max(1, Math.round(rawDamage * this.rfx.enemyDamage));
    if (!this.hurtPlayer(damage, cause, enemy.x, enemy.cy)) return;
    const poison = enemy.def.poison;
    if (poison) {
      this.effects.apply('poison', poison.seconds, { dps: poison.damagePerSecond });
      this.floating.show(this.player.x, this.player.y - 40, 'Poisoned', '#8ec26a');
    }
  }

  /** Applies damage with i-frames, knockback, flash and shake. Returns false while invulnerable. */
  private hurtPlayer(damage: number, cause: 'wildlife' | 'spirit' | 'injury', fromX: number, fromY: number): boolean {
    if (this.now < this.playerInvulnUntil || this.busy || damage <= 0) return false;
    const c = this.gameData.combat;
    const p = this.player;
    this.playerInvulnUntil = this.now + c.playerIFramesMs;
    const armour = this.equipment.body ? (itemDef(this.equipment.body.item).gear?.damageReduction ?? 0) : 0;
    damage = Math.max(1, Math.round(damage * (1 - armour) * 10) / 10);
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
    this.record('creature_defeated');
    if (enemy.def.boss) {
      this.record('tusker_defeated');
      this.setFlags.tuskerDefeated = true;
      this.tusker = null;
      gameEvents.emit('boss:bar', null);
      this.bossBarShown = false;
      this.progression.addXp('combat', 4);
      this.applyProgressionEffects();
      this.emitCharacter();
      gameEvents.emit('music', 'victory');
      gameEvents.emit('toast', { text: this.spText('tuskerDefeated'), tone: 'info' });
      this.save();
    }
    this.kills++;
    if (!this.grant('defeat_first', enemy.def.id)) this.grant('defeat', null);
    if (enemy.def.kind === 'spirit') this.storyEvent('spirit_defeat');
    this.stats.kills++;
    const table = this.gameData.loot.get(enemy.def.lootTable);
    this.floating.show(enemy.x, enemy.cy - 20, enemy.def.kind === 'spirit' ? 'The spirit fades' : `${enemy.def.name} down`, '#e6b866');
    if (!table) return;
    const rng = mulberry32(hash2(this.kills, Math.floor(this.now), this.seed));
    const drops = rollLoot(table, rng);
    // Elites drop a second share.
    if (enemy.elite) drops.push(...rollLoot(table, rng));
    for (const stack of drops) {
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
    this.grant('shrine', key);
    const seconds = cfg.blessing.durationHours * this.clock.secondsPerHour;
    this.effects.apply('blessing', seconds, { regenPerHour: cfg.blessing.regenPerHour });
    if (cfg.blessing.spiritWard) this.effects.apply('ward', seconds);
    this.player.swing(this.player.x, this.player.y - 30, this.now, GATHER.swingMs * 3);
    this.floating.show(this.player.x, this.player.y - 40, 'Blessed', '#e6b866');
    gameEvents.emit('sfx', 'shrine');
    gameEvents.emit('toast', { text: cfg.text.offered, tone: 'info' });
    this.record('shrine_restored');
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
    gameEvents.emit('ambience', { day: 1 - dark, night: dark, rain: this.weather.monsoon ? 1 : 0, fire: Math.max(0, fire), river: this.riverLevel() });
    this.chunks.setFlood(this.weather.flood, this.gameData.season.floodRiverWidth);
    const dayNow = this.clock.dayNumber;
    if (dayNow > this.lastDayNumber) {
      const prev = this.lastDayNumber;
      this.lastDayNumber = dayNow;
      if (prev > 0) {
        gameEvents.emit('music', 'dawn');
        this.record('night_survived');
        // Surviving teaches most in the first week; after that nights give nothing new.
        if (dayNow <= 8) this.grant('survive_night', dayNow);
        if (forecast(prev, 12, this.gameData.season).monsoon) this.grant('monsoon_day', prev);
      }
    }
    // The biome you start in isn't a discovery.
    const biome = this.gen.biomeAt(Math.floor(this.player.x / 32), Math.floor(this.player.y / 32));
    if (biome !== this.gen.biomeAt(Math.floor(this.spawn.x / 32), Math.floor(this.spawn.y / 32))) this.grant('biome', biome);
    this.updateDiscovery();
    this.checkStoryState();
    if (this.now >= this.nextKnowledgeAt) {
      this.nextKnowledgeAt = this.now + 1000;
      this.checkKnowledge();
    }
    const hour = Math.floor(this.clock.totalSeconds / this.clock.secondsPerHour);
    if (hour !== this.lastWearHour) {
      const steps = this.lastWearHour < 0 ? 0 : Math.max(0, Math.min(48, hour - this.lastWearHour));
      this.lastWearHour = hour;
      if (steps > 0 && this.weather.monsoon) this.weatherStructures(steps);
    }
    const key = `${this.weather.label}|${this.weather.monsoon}|${this.chunks.flood}`;
    if (key === this.weatherKey) return;
    const started = this.weather.monsoon && this.weatherKey !== '' && !this.weatherKey.includes('|true|');
    this.weatherKey = key;
    gameEvents.emit('weather:changed', { raining: this.weather.monsoon, label: this.weather.label, flood: this.chunks.flood });
    if (started) gameEvents.emit('toast', { text: 'The monsoon breaks. Stay near fire or shelter to keep warm. Shoots and herbs grow fast in the rain; berries are scarce.', tone: 'warn' });
  }

  private lookX = 0;
  private lookY = 0;
  private nextBumpAt = 0;
  private dust: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  /**
   * Camera looks a little ahead of where you walk (off with reduced motion), and pushing into
   * something solid kicks up a small puff of dust so collisions read clearly.
   */
  private updateCameraFeel(p: Player, dt: number, inputOn: boolean): void {
    const moving = Math.hypot(p.body.velocity.x, p.body.velocity.y) > 30;
    const reduced = getSettings().reducedMotion;
    const tx = moving && !reduced ? -p.facingVec.x * 26 : 0;
    const ty = moving && !reduced ? -p.facingVec.y * 18 : 0;
    const k = 1 - Math.pow(0.04, dt / 1000);
    this.lookX += (tx - this.lookX) * k;
    this.lookY += (ty - this.lookY) * k;
    this.cameras.main.setFollowOffset(this.lookX, 12 + this.lookY);
    const keys = this.keys;
    const pushing = inputOn && (keys.up.isDown || keys.down.isDown || keys.left.isDown || keys.right.isDown);
    const blocked = !p.body.blocked.none || !p.body.touching.none;
    if (pushing && blocked && !moving && !reduced && this.now >= this.nextBumpAt) {
      this.nextBumpAt = this.now + 700;
      this.dust ??= this.add.particles(0, 0, TEX.chip, { emitting: false, speed: { min: 15, max: 45 }, angle: { min: 200, max: 340 }, lifespan: 380, scale: { start: 0.7, end: 0 }, tint: 0xb8a888, alpha: { start: 0.8, end: 0 } }).setDepth(DEPTH.floatingText - 8);
      this.dust.explode(5, p.x + p.facingVec.x * 9, p.y - 2 + p.facingVec.y * 6);
    }
  }

  /** 0..1: how close running or standing water is (sampled every 2 tiles within 6). */
  private riverLevel(): number {
    const tx = Math.floor(this.player.x / 32);
    const ty = Math.floor(this.player.y / 32);
    let best = Infinity;
    for (let oy = -6; oy <= 6; oy += 2) for (let ox = -6; ox <= 6; ox += 2) if (this.gen.waterAt(tx + ox, ty + oy)) best = Math.min(best, Math.hypot(ox, oy));
    return best === Infinity ? 0 : Math.max(0, 1 - best / 7);
  }

  /** Under a shelter's roof or by a campfire's warmth. */
  private isSheltered(x: number, y: number): boolean {
    const cold = this.gameData.season.cold;
    for (const s of this.structures.list) {
      const d = Math.hypot(s.x - x, s.y - y);
      if (this.structures.isBroken(s)) continue;
      if (s.def.interaction === 'sleep' && d <= cold.shelterRadius) return true;
      if (s.def.shelterRadius && Math.hypot(s.x - x, this.structures.centerY(s) - y) <= s.def.shelterRadius) return true;
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
    this.grant('chest', key);
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
    if (isNew) {
      this.grant('tablet', id);
      this.record('tablet_read');
    }
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
        (this.blight.cores.length > 0 && !this.setFlags.blightCleared) ||
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
    if (!this.setFlags.blightCleared) {
      gameEvents.emit('toast', { text: this.spText('blightBlocked'), tone: 'warn' });
      return;
    }
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
    this.record('ending_reached');
    this.building.cancel();
    this.player.halt();
    this.encounters.clear();
    this.projectiles.clear();
    const summary: EndingData = { day: this.clock.dayNumber, tablets: this.quest.tabletsRead.length, ...this.stats, saved, storyLines: [...this.endingLines] };
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
    const d = this.weather.monsoon ? Math.min(0.85, base + this.gameData.season.rainDarkness) : base;
    // High contrast keeps nights readable.
    return getSettings().highContrast ? d * 0.75 : d;
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
    t.stealth = this.hidden ? 'hidden' : p.crouching ? 'crouch' : '';
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
    const key = (this.stations.has('campfire') ? 1 : 0) + (this.stations.has('pot') ? 2 : 0) + (this.stations.has('workbench') ? 4 : 0);
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
      case 'feature':
        return target.kind === 'feature' ? this.featurePrompt(target.feature) : '';
      case 'landmark':
        return target.kind === 'landmark' ? (target.landmark.id === 'great_fig' && !this.openedChests.has(`fig@${target.landmark.key}`) ? 'E — Search the hollow roots' : target.landmark.id === 'old_oxcart' && !this.openedChests.has(`cart@${target.landmark.key}`) ? 'E — Look under the cart bed' : LANDMARK_NAMES[target.landmark.id as LandmarkId] ?? '') : '';
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
    if (target.kind === 'feature' && pressed) {
      this.useFeature(target.feature);
      return;
    }
    if (target.kind === 'landmark' && pressed) {
      this.useLandmark(target.landmark);
      return;
    }
    if (target.kind === 'roots' && pressed) {
      gameEvents.emit('toast', { text: this.gameData.ending.text.rootsBlock, tone: 'info' });
      return;
    }
    if (target.kind === 'structure' && pressed) {
      const s = target.structure;
      if (this.structures.isBroken(s)) {
        gameEvents.emit('toast', { text: `The ${s.def.name.toLowerCase()} is broken — press R to repair it`, tone: 'info' });
        return;
      }
      switch (s.def.interaction) {
        case 'cook':
          gameEvents.emit('ui:open-crafting', 'food');
          break;
        case 'craft':
          gameEvents.emit('ui:open-crafting', 'building');
          break;
        case 'sleep':
          this.trySleep(s);
          break;
        case 'storage':
          this.openStorage(s);
          break;
        case 'collect':
          this.collectRain(s);
          break;
        default:
          break;
      }
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
      if (this.inventory.inventory.wear(this.inventory.selected, this.wearMult) === 'broke') {
        gameEvents.emit('toast', { text: `Your ${itemDef(held?.item ?? '').name} broke`, tone: 'warn' });
      }
      this.inventory.broadcast();
    }
    if (result === 'depleted') {
      if (!this.grant('gather_first', node.def.id)) this.grant('gather', null);
      const first = loot[0];
      if (first && Math.random() < this.fx.foragingExtraChance) {
        first.qty++;
        this.floating.show(node.targetX, node.targetY - 30, 'Skilled harvest +1', '#8ec26a');
      }
      // Difficulty: forage (food and herbs) is richer or leaner; never below one.
      const fy = this.rfx.forageYield;
      const forage = first && (itemDef(first.item).category === 'food' || itemDef(first.item).tags?.includes('herb'));
      if (first && forage && fy !== 1) {
        if (fy > 1 && Math.random() < fy - 1) first.qty++;
        else if (fy < 1 && first.qty > 1 && Math.random() < 1 - fy) first.qty--;
      }
    }
    if (result === 'depleted' && node.def.unknownName && !this.knownPlants.has(node.def.id)) {
      this.knownPlants.add(node.def.id);
      this.grant('identify', node.def.id);
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
    if (def.gear) {
      this.equip(def);
      return;
    }
    if (def.id === 'nav_note') {
      this.writeNote();
      return;
    }
    if (def.id === 'compass') {
      gameEvents.emit('toast', { text: 'While you carry the compass, your map markers (M) point the way on screen', tone: 'info' });
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
    if (caught) this.record('fish_caught');
    const p = this.player;
    this.stopFishing();
    this.nextActAt = this.now + 500;
    this.pendingInteract = false;
    if ((caught || wear) && this.inventory.inventory.wear(this.inventory.selected, cfg.rodWear * this.wearMult) === 'broke') {
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
      this.storyEvent('fish');
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
    const def = this.structures.def(b.structureId);
    let outpostName: string | null = null;
    if (def?.outpost) {
      const flags = this.structures.records.filter((s) => s.def.outpost);
      if (flags.length >= OUTPOST_MAX) {
        this.inventory.inventory.add(taken.item, 1);
        gameEvents.emit('toast', { text: `You can keep up to ${OUTPOST_MAX} outposts — dismantle one first`, tone: 'info' });
        return b.cancel();
      }
      if (flags.some((s) => Math.hypot(s.x - b.x, s.y - b.y) < OUTPOST_SPACING)) {
        this.inventory.inventory.add(taken.item, 1);
        gameEvents.emit('toast', { text: 'Too close to another outpost — outposts must be far apart', tone: 'info' });
        return b.cancel();
      }
      let n = 1;
      while (flags.some((s) => s.name === `Outpost ${n}`)) n++;
      outpostName = `Outpost ${n}`;
    }
    const placed = this.structures.place(b.structureId, b.x, b.y, { rot: b.rot, name: outpostName });
    if (!placed) {
      this.inventory.inventory.add(taken.item, 1);
      return b.cancel();
    }
    this.inventory.broadcast();
    this.stats.built++;
    this.record('structure_built');
    this.emitStructures();
    gameEvents.emit('sfx', 'build');
    this.floating.show(b.x, b.y - 30, `Built ${placed.def.name}`, '#8ec26a');
    if (placed.def.station === 'campfire') this.completeObjective('campfire');
    this.grant('build_first', placed.def.id);
    if (placed.def.outpost) {
      this.grant('outpost', placed.name);
      this.record('outpost_marked');
      this.storyEvent('outpost');
    }
    if (placed.def.interaction === 'sleep') this.completeObjective('shelter');
    if (placed.def.outpost) {
      this.emitOutposts();
      gameEvents.emit('toast', { text: `${placed.name} is marked on your map. No new creatures appear close to it.`, tone: 'info' });
    }
    if (!this.inventory.inventory.get(b.slot)) b.cancel();
  }

  private trySleep(bed?: Structure): void {
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
      if (bed?.def.sleepBonus) {
        this.survival.heal(bed.def.sleepBonus.health);
        this.survival.stats.warmth = 100;
      }
      this.lastHealth = this.survival.stats.health;
      this.gathering.update(this.now, this.player.x, this.player.y);
      this.completeObjective('sleep');
      const saved = this.save();
      this.input.keyboard?.resetKeys();
      this.held?.reset();
      this.pendingUse = false;
      this.pendingInteract = false;
      cam.fadeIn(900, 2, 4, 8);
      this.busy = false;
      this.time.delayedCall(1200, () => this.storyEvent('sleep'));
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
        ambushNight: this.ambushRolledNight,
        story: { quests: this.sideQuests.serialize(), flags: [...this.storyFlags], endingLines: [...this.endingLines] },
        setpieces: { ...this.setFlags },
        rules: { ...this.rules, modifiers: [...this.rules.modifiers] },
        exploration: {
          explored: [...this.explored],
          ruins: [...this.found.ruins],
          landmarks: [...this.found.landmarks],
          shortcuts: [...this.found.shortcuts],
          shrines: [...this.found.shrines],
          puzzles: [...this.found.puzzles],
          markers: this.markers.map((m) => ({ ...m })),
        },
        progression: this.progression.serialize(),
        equipment: { body: this.equipment.body ? { item: this.equipment.body.item, qty: 1 } : null, feet: this.equipment.feet ? { item: this.equipment.feet.item, qty: 1 } : null },
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
    if (this.blight.active || this.storm.phase !== 'none' || (this.tusker?.active && this.tusker.awareness >= 1)) return true;
    const st = this.survival.stats;
    if (st.health < this.gameData.survival.maxHealth * 0.25) return true;
    const e = this.encounters.nearest(this.player.x, this.player.y - 10, 150);
    return e !== null && (e.def.kind === 'spirit' || e.aiState !== 'wander');
  }

  /** Wading through shallows is slow; mud a little slow. */
  private terrainSpeed(x: number, y: number): number {
    const t = this.chunks.tileAtWorld(x, y - 4);
    const base = t === TILE.shallowsA ? 0.6 : t === TILE.mud ? 0.85 : 1;
    const feet = this.feetGear;
    const slow = (1 - base) * (feet?.terrain ?? 1);
    return (1 - slow) * (this.fx.speed + (feet?.speed ?? 0));
  }

  // ---------- Set pieces (M15) ----------

  /** Set-piece text from setpieces.json with {s} / {n} filled in (localization-ready). */
  private spText(key: string, vars: Record<string, string | number> = {}): string {
    let t = this.gameData.setpieces.text[key] ?? key;
    for (const [k, v] of Object.entries(vars)) t = t.split(`{${k}}`).join(String(v));
    return t;
  }

  /** The Old Tusker's ground: dry, open land a fixed distance from spawn (per seed). */
  private lairSite(): { x: number; y: number } {
    if (this.lair) return this.lair;
    const t = this.gameData.setpieces.tusker;
    const a0 = ((this.seed % 360) * Math.PI) / 180;
    for (let i = 0; i < 72; i++) {
      const a = a0 + i * 0.26;
      for (const r of [t.lairDistance, t.lairDistance + 12, t.lairDistance - 12]) {
        const tx = Math.round(Math.cos(a) * r);
        const ty = Math.round(Math.sin(a) * r);
        if (this.gen.ruinsNear(tx, ty, 22).length || this.gen.inHeartGlade(tx, ty, 10)) continue;
        let dry = true;
        for (let oy = -4; oy <= 4 && dry; oy++) for (let ox = -4; ox <= 4; ox++) if (this.gen.waterAt(tx + ox, ty + oy)) dry = false;
        if (dry) return (this.lair = { x: tx * 32 + 16, y: ty * 32 + 16 });
      }
    }
    return (this.lair = { x: Math.round(Math.cos(a0) * t.lairDistance) * 32, y: Math.round(Math.sin(a0) * t.lairDistance) * 32 });
  }

  private stormColdConfig(): SeasonConfig['cold'] {
    const base = this.coldWorn ?? this.gameData.season.cold;
    if (!this.stormCold || this.stormCold.recoverPerHour !== base.recoverPerHour || this.stormCold.damagePerHour !== base.damagePerHour)
      this.stormCold = { ...base, lossPerHour: base.lossPerHour * this.gameData.setpieces.storm.warmthLossMultiplier };
    return this.stormCold;
  }

  private updateSetPieces(dt: number): void {
    if (!this.setPiecesEnabled) return;
    const p = this.player;
    const sp = this.gameData.setpieces;
    // ---- The Old Tusker ----
    if (!this.setFlags.tuskerDefeated) {
      const lair = this.lairSite();
      if (!this.setFlags.tuskerRumour && this.clock.dayNumber >= sp.tusker.rumourDay && this.markers.length < 30) {
        this.setFlags.tuskerRumour = true;
        this.markers.push({ x: lair.x, y: lair.y, kind: 'pin', text: this.spText('tuskerMarker') });
        gameEvents.emit('toast', { text: this.spText('tuskerRumour'), tone: 'info' });
      }
      if (this.tusker && !this.tusker.active) this.tusker = null;
      if (!this.tusker && this.now >= this.nextTuskerTryAt && Math.hypot(p.x - lair.x, p.y - lair.y) < sp.tusker.wakeRadius) {
        this.nextTuskerTryAt = this.now + 1000;
        const e = this.encounters.spawnAt(sp.tusker.enemy, lair.x, lair.y, this.now);
        if (e) {
          e.stunMs = sp.tusker.stunMs;
          e.vulnerableMultiplier = sp.tusker.vulnerableMultiplier;
          e.armouredDamage = sp.tusker.armouredDamage;
          this.tusker = e;
          gameEvents.emit('sfx', 'thunder');
          gameEvents.emit('music', 'danger');
          gameEvents.emit('toast', { text: this.spText('tuskerWake'), tone: 'warn' });
        }
      }
      if (this.tusker && this.now >= this.nextBossBarAt) {
        this.nextBossBarAt = this.now + 200;
        const engaged = this.tusker.awareness >= 0.35 || this.tusker.hp < this.tusker.maxHp;
        if (engaged) {
          gameEvents.emit('boss:bar', { name: this.spText('tuskerName'), frac: Math.max(0, this.tusker.hp / this.tusker.maxHp), hint: this.spText(this.tusker.aiState === 'stunned' ? 'tuskerHintDazed' : 'tuskerHintLure') });
          this.bossBarShown = true;
        } else if (this.bossBarShown) {
          gameEvents.emit('boss:bar', null);
          this.bossBarShown = false;
        }
      }
    }
    if (!this.tusker && this.bossBarShown && !this.blightBarShown) {
      gameEvents.emit('boss:bar', null);
      this.bossBarShown = false;
    }

    // ---- The Great Storm ----
    const night = this.darkness() > 0.5;
    const st = this.storm;
    if (st.phase === 'none' && !this.setFlags.stormDone && this.weather.monsoon && night && this.clock.dayNumber >= sp.storm.minDay && !this.isSheltered(p.x, p.y)) {
      st.phase = 'warning';
      st.until = this.now + sp.storm.warningSeconds * 1000;
      gameEvents.emit('sfx', 'thunder');
      gameEvents.emit('music', 'danger');
      gameEvents.emit('toast', { text: this.spText('stormWarning', { s: sp.storm.warningSeconds }), tone: 'warn' });
    } else if (st.phase === 'warning' && this.now >= st.until && (!this.weather.monsoon || !night)) {
      st.phase = 'none';
    } else if (st.phase === 'warning' && this.now >= st.until) {
      st.phase = 'active';
      st.until = this.now + sp.storm.durationSeconds * 1000;
      st.nextStrikeAt = this.now + 400;
    } else if (st.phase === 'active') {
      if (this.now >= st.nextStrikeAt) {
        st.nextStrikeAt += sp.storm.strikeIntervalMs;
        const sheltered = this.isSheltered(p.x, p.y);
        const a = Math.random() * Math.PI * 2;
        const r = sheltered ? 220 + Math.random() * 160 : Math.random() * 26;
        this.strikes.push({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r, at: this.now + sp.storm.warningMs, kind: 'storm' });
      }
      if (this.now >= st.until || !this.weather.monsoon || !night) {
        st.phase = 'none';
        if (!this.setFlags.stormDone) this.record('storm_weathered');
        this.setFlags.stormDone = true;
        this.strikes.length = 0;
        const up = this.progression.addXp('survival', sp.storm.xp);
        if (up.levelUp !== null) this.applyProgressionEffects();
        this.emitCharacter();
        gameEvents.emit('music', 'victory');
        gameEvents.emit('toast', { text: this.spText('stormPassed'), tone: 'info' });
      }
    }

    // ---- The Blight at the Heart ----
    const heart = this.chunks.heart;
    const bl = this.blight;
    const R = WORLD_GEN.heartRootRadius;
    if (!bl.active && !this.setFlags.blightCleared && this.quest.stage === 'restore' && heart && Math.hypot(p.x - heart.x, p.y - heart.y) < (R - 0.6) * 32) {
      bl.active = true;
      // After a retry the cores (and their burn progress) are kept: a checkpoint, not a reset.
      if (!bl.cores.length) for (let i = 0; i < sp.blight.cores; i++) {
        const a = -Math.PI / 2 + Math.PI / 6 + (i * Math.PI * 2) / sp.blight.cores;
        bl.cores.push({ x: heart.x + Math.cos(a) * sp.blight.coreRadiusTiles * 32, y: heart.y - 8 + Math.sin(a) * sp.blight.coreRadiusTiles * 32, burn: 0 });
      }
      bl.nextSlamAt = this.now + 1800;
      gameEvents.emit('sfx', 'spirit');
      this.shake(300, 0.004);
      gameEvents.emit('music', 'danger');
      gameEvents.emit('toast', { text: this.spText('blightStart'), tone: 'warn' });
    }
    if (bl.active) {
      const held = this.inventory.held;
      const carrying = held ? itemDef(held.item).light !== undefined : false;
      let left = 0;
      for (const c of bl.cores) {
        if (c.burn >= sp.blight.burnSeconds) continue;
        let nearFire = carrying && Math.hypot(p.x - c.x, p.y - 12 - c.y) <= sp.blight.fireReach;
        if (!nearFire) for (const s of this.structures.list) if (s.def.lightRadius > 0 && Math.hypot(s.x - c.x, s.y - c.y) <= sp.blight.fireReach) nearFire = true;
        if (nearFire) {
          c.burn += dt / 1000;
          if (c.burn >= sp.blight.burnSeconds) {
            gameEvents.emit('sfx', 'chest');
            this.floating.show(c.x, c.y - 20, this.spText('blightCoreBurned'), '#e6b866');
          }
        }
        if (c.burn < sp.blight.burnSeconds) left++;
      }
      if (left !== this.blightBarLeft || !this.blightBarShown) {
        this.blightBarLeft = left;
        this.blightBarShown = true;
        gameEvents.emit('boss:bar', { name: this.spText('blightName'), frac: left / sp.blight.cores, hint: this.spText('blightHint', { n: this.spText(left === 1 ? 'blightCoreOne' : 'blightCoreMany', { n: left }) }) });
      }
      const inGlade = heart ? Math.hypot(p.x - heart.x, p.y - heart.y) < (WORLD_GEN.heartGladeRadius + 1) * 32 : false;
      if (left === 0) {
        bl.active = false;
        if (!this.setFlags.blightCleared) this.record('blight_cleared');
        this.setFlags.blightCleared = true;
        this.strikes.length = 0;
        gameEvents.emit('boss:bar', null);
        this.blightBarShown = false;
        this.blightBarLeft = -1;
        this.progression.addXp('exploration', 3);
        this.emitCharacter();
        gameEvents.emit('music', 'victory');
        gameEvents.emit('toast', { text: this.spText('blightCleared'), tone: 'info' });
      } else if (inGlade && this.now >= bl.nextSlamAt) {
        bl.nextSlamAt = this.now + sp.blight.slamIntervalMs;
        this.strikes.push({ x: p.x + (Math.random() - 0.5) * 30, y: p.y + (Math.random() - 0.5) * 20, at: this.now + sp.blight.warningMs, kind: 'blight' });
      }
    }

    // ---- Telegraphed strikes resolve ----
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      if (!s || this.now < s.at) continue;
      this.strikes.splice(i, 1);
      const cfgS = s.kind === 'storm' ? sp.storm : sp.blight;
      if (s.kind === 'storm') {
        gameEvents.emit('sfx', 'thunder');
        if (!getSettings().reducedFlash) this.cameras.main.flash(120, 230, 240, 255);
      } else {
        gameEvents.emit('sfx', 'stone');
        this.shake(120, 0.003);
      }
      const shelteredNow = s.kind === 'storm' && this.isSheltered(p.x, p.y);
      if (!shelteredNow && Math.hypot(p.x - s.x, p.y - 6 - s.y) <= cfgS.radius && this.hurtPlayer(cfgS.damage, 'injury', s.x, s.y) && s.kind === 'blight') this.lastBlightHitAt = this.now;
    }
    this.drawTelegraphs();
  }

  /** Warning rings fill as a strike approaches; blight cores show how far they have burned. */
  private drawTelegraphs(): void {
    const any = this.strikes.length > 0 || this.blight.active;
    if (!any && !this.telegraphsDrawn) return;
    this.telegraphsDrawn = any;
    const g = this.telegraphG.clear();
    const sp = this.gameData.setpieces;
    for (const s of this.strikes) {
      const cfgS = s.kind === 'storm' ? sp.storm : sp.blight;
      const t = 1 - Math.max(0, s.at - this.now) / cfgS.warningMs;
      const color = s.kind === 'storm' ? 0xfff2c8 : 0xb070d0;
      g.lineStyle(2, color, 0.9).strokeCircle(s.x, s.y, cfgS.radius);
      g.fillStyle(color, 0.12 + t * 0.3).fillCircle(s.x, s.y, cfgS.radius * t);
    }
    if (this.blight.active) {
      const pulse = 0.5 + Math.sin(this.now / 180) * 0.2;
      for (const c of this.blight.cores) {
        const done = c.burn >= sp.blight.burnSeconds;
        if (done) {
          g.fillStyle(0x2a2420, 0.7).fillCircle(c.x, c.y, 9);
          continue;
        }
        g.fillStyle(0x3a1a40, 0.9).fillCircle(c.x, c.y, 13);
        g.fillStyle(0x9a50c0, pulse).fillCircle(c.x, c.y, 8);
        if (c.burn > 0) {
          g.lineStyle(3, 0xe8893a, 1);
          g.beginPath();
          g.arc(c.x, c.y, 16, -Math.PI / 2, -Math.PI / 2 + (c.burn / sp.blight.burnSeconds) * Math.PI * 2);
          g.strokePath();
        }
      }
    }
  }

  /** Story-only checkpoint: falling to the blight returns you to the glade's edge (no real death, no save change). */
  private retryBlight(): void {
    const heart = this.chunks.heart;
    const sp = this.gameData.setpieces.blight;
    this.survival.stats.health = this.gameData.survival.maxHealth * sp.retryHealth;
    this.strikes.length = 0;
    this.blight.nextSlamAt = this.now + 3000;
    this.playerInvulnUntil = this.now + 2500;
    if (heart) {
      const r = (WORLD_GEN.heartGladeRadius + 1) * 32;
      let spot = { x: heart.x, y: heart.y + r };
      for (let i = 0; i < 16; i++) {
        const a = Math.PI / 2 + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 8);
        const x = heart.x + Math.cos(a) * r;
        const y = heart.y + Math.sin(a) * r;
        if (!this.chunks.isDeepWater(x, y - 4) && this.physics.overlapRect(x - 8, y - 11, 16, 11, true, true).length === 0) {
          spot = { x, y };
          break;
        }
      }
      this.player.body.reset(spot.x, spot.y);
    }
    this.blight.active = false;
    this.cameras.main.fadeIn(600, 20, 4, 24);
    gameEvents.emit('toast', { text: this.spText('blightRetry'), tone: 'warn' });
  }

  // ---------- Side stories (M14) ----------

  private storyEvent(event: string): void {
    if (!this.storiesEnabled) return;
    if (this.busy) {
      this.storyEventsWaiting.push(event);
      return;
    }
    this.handleStory(this.sideQuests.notify(event));
  }

  private checkStoryState(): void {
    if (!this.storiesEnabled) return;
    if (!this.busy) for (const ev of this.storyEventsWaiting.splice(0)) this.handleStory(this.sideQuests.notify(ev));
    // Story moments wait until you are safe (not mid-fight, not asleep or dying).
    if (this.storyBacklog.length && !this.busy && !this.storyOpen && !this.inDanger()) this.showStory(this.storyBacklog.splice(0));
    // A choice that was never answered (lost dialog, several at once) is asked again.
    if (!this.storyOpen && !this.storyBacklog.length && this.now >= this.nextChoiceRetryAt) {
      const pending = this.sideQuests.pendingChoice();
      if (pending) {
        this.nextChoiceRetryAt = this.now + 6000;
        this.handleStory([pending]);
      }
    }
    const ups = this.sideQuests.checkState((stat) => {
      if (stat === 'tablets') return this.quest.tabletsRead.length;
      if (stat === 'puzzles') return this.found.puzzles.size;
      if (stat === 'landmarks') return this.found.landmarks.size;
      if (stat === 'cooked_fish') return this.inventory.inventory.count('cooked_fish');
      return 0;
    });
    if (ups.length) this.handleStory(ups);
  }

  private handleStory(ups: SideUpdate[]): void {
    if (!ups.length) return;
    if (this.busy || this.inDanger()) {
      this.storyBacklog.push(...ups);
      this.emitSideQuests();
      return;
    }
    this.showStory(ups);
  }

  private showStory(ups: SideUpdate[]): void {
    for (const u of ups) {
      if (u.offer) gameEvents.emit('story:offer', u.offer);
      if (u.memory) {
        gameEvents.emit('toast', { text: `A memory returns (${u.memory.title}) — see Journal (J) › Memories`, tone: 'info' });
        gameEvents.emit('sfx', 'tablet');
      }
      if (u.choice) {
        const inv = this.inventory.inventory;
        gameEvents.emit('story:choice', {
          id: u.choice.id,
          title: u.choice.title,
          prompt: u.choice.prompt,
          options: u.choice.options.map((o) => {
            const missing = o.cost.filter((c) => inv.count(c.item) < c.qty);
            return {
              id: o.id,
              label: o.label,
              description: o.description,
              enabled: missing.length === 0,
              note: missing.length ? `Needs ${missing.map((c) => `${c.qty} ${itemDef(c.item).name}`).join(', ')}` : undefined,
            };
          }),
        });
      }
    }
    if (ups.length) this.emitSideQuests();
  }

  /** The final choice: pays any cost, applies its effects once, and records the outcome. */
  private chooseStory(id: string, option: string): void {
    const def = this.gameData.sidequests.find((q) => q.id === id);
    const opt = def?.steps[def.steps.length - 1]?.options?.find((o) => o.id === option);
    if (!opt) return;
    const inv = this.inventory.inventory;
    if ((opt.cost ?? []).some((c) => inv.count(c.item) < c.qty)) {
      // Can't afford it any more: ask again (the free option is always available).
      const pending = this.sideQuests.pendingChoice();
      if (pending) this.handleStory([pending]);
      return;
    }
    const res = this.sideQuests.choose(id, option);
    if (!res) return;
    for (const c of opt.cost ?? []) inv.remove(c.item, c.qty);
    for (const e of res.effects) {
      if (e.type === 'item') {
        const left = this.inventory.add(e.item, e.qty);
        if (left > 0 && !this.dropInFront(e.item, left)) this.pickups.spawn(e.item, left, this.player.x, this.player.y + 8, this.now, 0, 4, false);
      } else if (e.type === 'xp') {
        const up = this.progression.addXp(e.skill, e.amount);
        const skill = this.gameData.progression.skills.find((s) => s.id === e.skill);
        this.floating.show(this.player.x + 18, this.player.y - 48, `+${e.amount} ${skill?.name ?? e.skill}`, '#c58be0');
        if (up.levelUp !== null) gameEvents.emit('toast', { text: `${skill?.name ?? e.skill} rose to level ${up.levelUp}: ${skill?.effect ?? ''}`, tone: 'info' });
        this.applyProgressionEffects();
        this.checkKnowledge();
      } else if (e.type === 'flag') {
        this.storyFlags.add(e.flag);
        this.applyStoryFlags();
      } else if (e.type === 'reveal') {
        const p = this.player;
        const r = Math.ceil(e.radius / 8);
        const ccx = Math.floor(p.x / 256);
        const ccy = Math.floor(p.y / 256);
        for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) if (ox * ox + oy * oy <= r * r) this.explored.add(`${ccx + ox},${ccy + oy}`);
      } else if (e.type === 'ending') this.endingLines.push(e.text);
    }
    this.inventory.broadcast();
    this.emitCharacter();
    this.emitSideQuests();
    gameEvents.emit('sfx', 'shrine');
    gameEvents.emit('music', 'quest');
    this.record('side_story_completed');
    gameEvents.emit('toast', { text: `${def?.title}: ${res.result}`, tone: 'info' });
    this.save();
  }

  private emitSideQuests(): void {
    gameEvents.emit('sidequests:changed', { quests: this.sideQuests.view(), memories: this.sideQuests.memories() });
  }

  // ---------- Exploration, map and ruins (M13) ----------

  /** Fog of war, ruins, landmarks, shortcuts and shrines you have come near (every half second). */
  private updateDiscovery(): void {
    const p = this.player;
    const ptx = Math.floor(p.x / 32);
    const pty = Math.floor(p.y / 32);
    const ccx = Math.floor(ptx / 8);
    const ccy = Math.floor(pty / 8);
    for (let oy = -2; oy <= 2; oy++) for (let ox = -2; ox <= 2; ox++) if (ox * ox + oy * oy <= 5) this.explored.add(`${ccx + ox},${ccy + oy}`);
    for (const r of this.gen.ruinsNear(ptx, pty, 18)) this.found.ruins.add(ruinKey(r));
    for (const s of this.chunks.shrines) if (Math.hypot(s.x - p.x, s.y - p.y) < 260) this.found.shrines.add(`${Math.round(s.x)},${Math.round(s.y)}`);
    for (const l of this.chunks.landmarks) {
      const key = `${l.id}@${Math.round(l.x)},${Math.round(l.y)}`;
      if (this.found.landmarks.has(key) || Math.hypot(l.x - p.x, l.y - p.y) > 200) continue;
      this.found.landmarks.add(key);
      this.grant('landmark', key);
      this.storyEvent('landmark');
      gameEvents.emit('music', 'discover');
      this.record('landmark_found');
      gameEvents.emit('toast', { text: `Landmark discovered: ${LANDMARK_NAMES[l.id as LandmarkId] ?? l.id}. It is now on your map (M).`, tone: 'info' });
    }
    if (this.gen.steppingAt(ptx, Math.floor((p.y - 4) / 32))) {
      const cell = `${Math.floor(ptx / STEPPING_CELL)},${Math.floor(pty / STEPPING_CELL)}`;
      const key = `${cell}|${ptx},${pty}`;
      if (![...this.found.shortcuts].some((k) => k.split('|')[0] === cell)) {
        this.found.shortcuts.add(key);
        this.grant('shortcut', key);
        this.storyEvent('shortcut');
        gameEvents.emit('music', 'discover');
        this.record('shortcut_found');
        gameEvents.emit('toast', { text: 'Shortcut found: hidden stepping stones across the river. Marked on your map (M).', tone: 'info' });
      }
    }
    // Compass: point at the nearest markers.
    if (this.inventory.inventory.count('compass') > 0 && this.markers.length) {
      const near = [...this.markers]
        .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))
        .slice(0, 3)
        .map((m, i) => ({ x: m.x, y: m.y, label: m.text || `Marker ${i + 1}` }));
      gameEvents.emit('markers:pointers', near);
    } else gameEvents.emit('markers:pointers', []);
  }

  private mapData(): import('../systems/GameEvents').MapData {
    const parse = (k: string) => {
      const at = k.indexOf('@');
      const [x, y] = k.slice(at + 1).split(',').map(Number) as [number, number];
      return { x, y, id: k.slice(0, at) };
    };
    const h = this.quest.stage === 'heart' || this.quest.stage === 'restore' || this.quest.stage === 'done' ? this.gen.heartSite() : null;
    return {
      seed: this.seed,
      player: { x: this.player.x, y: this.player.y },
      explored: [...this.explored],
      markers: this.markers.map((m) => ({ ...m })),
      outposts: this.structures.records.filter((s) => s.def.outpost).map((s) => ({ x: s.x, y: s.y, name: s.name ?? s.def.name })),
      ruins: [...this.found.ruins].map((k) => {
        const [tx, ty] = k.split(',').map(Number) as [number, number];
        return { x: tx * 32 + 16, y: ty * 32 + 16, solved: this.found.puzzles.has(k) };
      }),
      landmarks: [...this.found.landmarks].map((k) => {
        const l = parse(k);
        return { x: l.x, y: l.y, name: LANDMARK_NAMES[l.id as LandmarkId] ?? l.id };
      }),
      shortcuts: [...this.found.shortcuts].map((k) => {
        const at = k.split('|')[1];
        if (at) {
          const [tx, ty] = at.split(',').map(Number) as [number, number];
          return { x: tx * 32 + 16, y: ty * 32 + 16 };
        }
        const [cx, cy] = k.split(',').map(Number) as [number, number];
        return { x: (cx * STEPPING_CELL + STEPPING_CELL / 2) * 32, y: (cy * STEPPING_CELL + STEPPING_CELL / 2) * 32 };
      }),
      shrines: [...this.found.shrines].map((k) => {
        const [x, y] = k.split(',').map(Number) as [number, number];
        return { x, y };
      }),
      signs: this.structures.records.filter((s) => s.def.id === 'trail_sign').map((s) => ({ x: s.x, y: s.y })),
      heart: h ? { x: h.tx * 32 + 16, y: h.ty * 32 + 16 } : null,
    };
  }

  /** Click on the map: remove the marker under the click, or add a pin there (max 30). */
  private toggleMarker(x: number, y: number): void {
    const i = this.markers.findIndex((m) => Math.hypot(m.x - x, m.y - y) < 520);
    if (i >= 0) this.markers.splice(i, 1);
    else if (this.markers.length < 30) this.markers.push({ x: Math.round(x), y: Math.round(y), kind: 'pin', text: `Marker ${this.markers.length + 1}` });
    else gameEvents.emit('toast', { text: 'Your map holds up to 30 markers — click one to remove it', tone: 'info' });
    gameEvents.emit('map:data', this.mapData());
  }

  private writeNote(): void {
    const p = this.player;
    if (this.markers.length >= 30) {
      gameEvents.emit('toast', { text: 'Your map holds up to 30 markers — remove one (M, click it) first', tone: 'info' });
      return;
    }
    if (!this.inventory.inventory.takeFromSlot(this.inventory.selected, 1)) return;
    this.inventory.broadcast();
    const biome = this.gameData.biomes.get(this.gen.biomeAt(Math.floor(p.x / 32), Math.floor(p.y / 32)));
    const text = `${biome?.name ?? 'Note'}, day ${this.clock.dayNumber}`;
    this.markers.push({ x: Math.round(p.x), y: Math.round(p.y), kind: 'note', text });
    gameEvents.emit('sfx', 'leaf');
    this.floating.show(p.x, p.y - 34, `Noted: ${text}`, '#e6b866');
  }

  private featurePrompt(f: RuinFeatureObj): string {
    const solved = this.found.puzzles.has(f.ruin);
    switch (f.kind) {
      case 'lamp':
        return solved ? 'The lamp burns steadily' : `E — Light the ${f.fid} lamp`;
      case 'glyph':
        return 'E — Read the carved symbols';
      case 'reliquary':
        return this.openedChests.has(`reliquary@${f.ruin}`) ? 'An empty reliquary' : solved ? 'E — Open the reliquary' : 'A sealed reliquary';
      case 'secret':
        return this.openedChests.has(`secret@${f.key}`) ? 'An empty hollow' : 'E — Look at the loose stones';
      default:
        return '';
    }
  }

  private useFeature(f: RuinFeatureObj): void {
    this.nextActAt = this.now + 300;
    const solved = this.found.puzzles.has(f.ruin);
    if (f.kind === 'glyph') {
      const pretty: Record<string, string> = { sun: '☀ sun', moon: '☾ moon', water: '≈ water' };
      gameEvents.emit('toast', { text: `The carvings show: ${f.fid.split('-').map((s) => pretty[s] ?? s).join(', then ')}.`, tone: 'info' });
      gameEvents.emit('sfx', 'tablet');
      return;
    }
    if (f.kind === 'lamp') {
      if (solved) return;
      const plan = this.planFor(f.ruin);
      if (!plan) return;
      const prog = this.lampProgress.get(f.ruin) ?? [];
      if (prog.includes(f.fid)) return;
      prog.push(f.fid);
      gameEvents.emit('sfx', 'shrine');
      if (plan.order.slice(0, prog.length).join() !== prog.join()) {
        this.lampProgress.delete(f.ruin);
        gameEvents.emit('toast', { text: 'The flames gutter out. The order was wrong; the glyph stone holds it.', tone: 'warn' });
        return;
      }
      this.lampProgress.set(f.ruin, prog);
      if (prog.length === plan.order.length) this.solvePuzzle(f.ruin);
      return;
    }
    if (f.kind === 'reliquary') {
      const key = `reliquary@${f.ruin}`;
      if (this.openedChests.has(key)) {
        gameEvents.emit('toast', { text: 'The reliquary is empty.', tone: 'info' });
        return;
      }
      if (!solved) {
        const plan = this.planFor(f.ruin);
        gameEvents.emit('toast', {
          text: plan?.puzzle === 'lamps' ? 'Sealed. The three lamps of this ruin must be lit in the right order.' : 'Sealed. Every floor plate here must be pressed at once — or nearly.',
          tone: 'info',
        });
        return;
      }
      this.openedChests.add(key);
      this.dropLoot('reliquary', f.x, f.y, hashString(key));
      gameEvents.emit('sfx', 'chest');
      this.floating.show(f.x, f.y - 30, 'The reliquary opens', '#e6b866');
      return;
    }
    if (f.kind === 'secret') {
      const key = `secret@${f.key}`;
      if (this.openedChests.has(key)) return;
      this.openedChests.add(key);
      this.grant('secret', key);
      this.dropLoot('hidden_cache', f.x, f.y, hashString(key));
      gameEvents.emit('sfx', 'stone');
      this.record('cache_found');
      gameEvents.emit('toast', { text: 'Behind the loose stones: a hidden cache!', tone: 'info' });
    }
  }

  private useLandmark(l: LandmarkObj): void {
    this.nextActAt = this.now + 300;
    const key = `fig@${l.key}`;
    if (l.id === 'great_fig' && !this.openedChests.has(key)) {
      this.openedChests.add(key);
      this.grant('secret', key);
      this.dropLoot('hidden_cache', l.x, l.y + 10, hashString(key));
      this.record('cache_found');
      gameEvents.emit('toast', { text: 'Tucked among the fig\'s hollow roots: a forgotten bundle.', tone: 'info' });
      return;
    }
    const cartKey = `cart@${l.key}`;
    if (l.id === 'old_oxcart' && !this.openedChests.has(cartKey)) {
      this.openedChests.add(cartKey);
      this.grant('secret', cartKey);
      this.dropLoot('hidden_cache', l.x, l.y + 10, hashString(cartKey));
      this.record('cache_found');
      gameEvents.emit('toast', { text: 'Under the rotting cart bed, someone left a wrapped bundle long ago.', tone: 'info' });
      return;
    }
    const text: Record<string, string> = {
      great_fig: 'A strangler fig older than any trail, its roots a cathedral of wood.',
      termite_mound: 'A termite mound taller than a person. The whole hill hums faintly.',
      split_boulder: 'A boulder split clean in two by lightning; ferns already grow in the crack.',
      honey_tree: 'Wild bees have hung their combs high in this pale giant. Best admired from below.',
      old_oxcart: 'An ox-cart left to the forest long ago. Its wheels have not turned in years.',
    };
    gameEvents.emit('toast', { text: text[l.id] ?? '', tone: 'info' });
  }

  private dropLoot(table: string, x: number, y: number, salt: number): void {
    const t = this.gameData.loot.get(table);
    if (!t) return;
    for (const stack of rollLoot(t, mulberry32(hash2(salt, 7, this.seed)))) {
      if (!this.pickups.spawn(stack.item, stack.qty, x, y + 12, this.now, 250, 10)) this.inventory.add(stack.item, stack.qty);
    }
  }

  private planCache = new Map<string, ReturnType<typeof ruinPlan>>();
  private planFor(ruin: string): ReturnType<typeof ruinPlan> | null {
    let plan = this.planCache.get(ruin);
    if (!plan) {
      const [tx, ty] = ruin.split(',').map(Number) as [number, number];
      if (!Number.isFinite(tx) || !Number.isFinite(ty)) return null;
      plan = ruinPlan({ tx, ty }, this.seed);
      this.planCache.set(ruin, plan);
    }
    return plan;
  }

  private solvePuzzle(ruin: string): void {
    if (this.found.puzzles.has(ruin)) return;
    this.found.puzzles.add(ruin);
    this.lampProgress.delete(ruin);
    this.plateProgress.delete(ruin);
    this.grant('puzzle', ruin);
    this.time.delayedCall(2500, () => this.storyEvent('puzzle'));
    gameEvents.emit('sfx', 'chest');
    this.shake(220, 0.003);
    gameEvents.emit('music', 'discover');
    this.record('puzzle_solved');
    gameEvents.emit('toast', { text: 'A deep grinding sound… the reliquary unseals.', tone: 'info' });
  }

  /** Feature frames from state; floor plates and spike traps react to the player. */
  private frameDt = 0;

  private updateFeatures(): void {
    const p = this.player;
    for (const f of this.chunks.features) {
      const solved = this.found.puzzles.has(f.ruin);
      let frame: string | null = null;
      if (f.kind === 'lamp') frame = `lamp_${f.fid}_${solved || (this.lampProgress.get(f.ruin) ?? []).includes(f.fid) ? 'on' : 'off'}`;
      else if (f.kind === 'reliquary') frame = this.openedChests.has(`reliquary@${f.ruin}`) ? 'reliquary_open' : 'reliquary_closed';
      else if (f.kind === 'secret') frame = this.openedChests.has(`secret@${f.key}`) ? 'secret_found' : 'secret';
      else if (f.kind === 'plate') {
        const on = !this.modalOpen && Math.abs(p.x - f.x) < 14 && Math.abs(p.y - (f.y + 2)) < 12;
        let prog = this.plateProgress.get(f.ruin);
        // The window pauses while a panel is open.
        if (prog && this.modalOpen) prog.until += this.frameDt;
        if (prog && this.now > prog.until && !solved) {
          this.plateProgress.delete(f.ruin);
          prog = undefined;
          gameEvents.emit('toast', { text: 'The plates sink back with a sigh. Press them all, quickly.', tone: 'warn' });
        }
        if (on && !solved && !prog?.pressed.has(f.fid)) {
          prog ??= { pressed: new Set<string>(), until: this.now + PLATE_WINDOW_SECONDS * 1000 };
          prog.pressed.add(f.fid);
          this.plateProgress.set(f.ruin, prog);
          gameEvents.emit('sfx', 'stone');
          if (prog.pressed.size === 1) gameEvents.emit('toast', { text: `A plate sinks with a click… ${PLATE_WINDOW_SECONDS} seconds to press the rest.`, tone: 'info' });
          if (prog.pressed.size >= 4) this.solvePuzzle(f.ruin);
        }
        frame = solved || prog?.pressed.has(f.fid) ? 'plate_down' : 'plate_up';
      } else if (f.kind === 'trap') {
        const phase = trapPhase(this.now, Number(f.fid));
        frame = `trap_${phase}`;
        // A click as the spikes glint (fair warning you can hear as well as see).
        if (phase === 'warn' && this.trapPhases.get(f.key) !== 'warn' && Math.hypot(p.x - f.x, p.y - f.y) < 260) gameEvents.emit('sfx', 'ui');
        this.trapPhases.set(f.key, phase);
        // Through hurtPlayer: armour and invulnerability frames apply as for any other hit.
        if (phase === 'up' && this.now >= this.nextTrapHitAt && Math.abs(p.x - f.x) < 15 && Math.abs(p.y - (f.y + 2)) < 12) {
          this.nextTrapHitAt = this.now + 900;
          this.hurtPlayer(8, 'injury', f.x, f.y + 10);
        }
      }
      if (frame && f.image.frame.name !== frame) f.image.setFrame(frame);
    }
  }

  // ---------- Stealth and ambushes (M12) ----------

  /** Noise radius from movement and actions; hidden = still or crouching in dense cover. */
  private updateStealth(p: Player): void {
    const cfg = this.gameData.stealth;
    const moving = Math.hypot(p.body.velocity.x, p.body.velocity.y) > 8;
    this.noise = playerNoise(cfg, moving, p.crouching, p.sprinting, p.isActing(this.now));
    if (this.now >= this.nextCoverAt) {
      this.nextCoverAt = this.now + 150;
      this.hidden = (p.crouching || !moving) && this.inCover(p.x, p.y);
    }
    if (!(p.crouching || !moving)) this.hidden = false;
    const a = this.hidden ? 0.6 : 1;
    if (p.alpha !== a && !this.tweens.isTweening(p)) p.setAlpha(a);
    // Crouch reads as a darker tint (scaling would also resize the physics body).
    const tint = p.crouching ? 0x9fb3ad : 0xffffff;
    if (p.tintTopLeft !== tint) p.setTint(tint);
  }

  private inCover(x: number, y: number): boolean {
    const r = this.gameData.stealth.coverRadius;
    for (const n of this.chunks.nodes) {
      const s = n.def.sprite;
      if ((s !== 'bush' && s !== 'bamboo') || (s === 'bamboo' && n.depleted)) continue;
      if (Math.abs(n.prop.x - x) < r && Math.abs(n.prop.y - y) < r) return true;
    }
    for (const c of this.chunks.cover) if (Math.abs(c.x - x) < r && Math.abs(c.y - y) < r) return true;
    return false;
  }

  /**
   * Night ambushes with fair warning: at most one roll per night (from day minDay), never at an
   * outpost; the warning (sound + message) comes warningSeconds before anything appears.
   */
  private updateAmbush(f: typeof this.encFrame): void {
    const cfg = this.gameData.stealth.ambush;
    const night = f.darkness > 0.5;
    if (this.ambushAt > 0) {
      if (this.now >= this.ambushAt) {
        this.ambushAt = 0;
        if (night && this.ambushAllowed(f.playerX, f.playerY)) {
          const count = cfg.min + Math.floor(Math.random() * (cfg.max - cfg.min + 1));
          const n = this.encounters.spawnAmbush(f, this.now, count);
          if (n > 0) gameEvents.emit('toast', { text: 'They are here. Find light, or slip away quietly.', tone: 'warn' });
        }
      }
      return;
    }
    const nightIndex = Math.floor((this.clock.totalSeconds + 12 * this.clock.secondsPerHour) / (24 * this.clock.secondsPerHour));
    if (!night || !this.encounters.enabled || f.day < cfg.minDay || this.ambushRolledNight === nightIndex) return;
    this.ambushRolledNight = nightIndex;
    if (Math.random() >= cfg.chancePerNight || !this.ambushAllowed(f.playerX, f.playerY)) return;
    this.startAmbushWarning();
  }

  /** Never at an outpost, in your own light, after the Heart is restored, or in the Heart glade. */
  private ambushAllowed(x: number, y: number): boolean {
    if (this.outpostDistance(x, y) <= 600) return false;
    if (this.lightAt(x, y - 10, 0)) return false;
    if (this.quest.restored) return false;
    return !this.gen.inHeartGlade(Math.floor(x / 32), Math.floor(y / 32), 4);
  }

  /** Fair warning, then the ambush (also used by tests). */
  private startAmbushWarning(): void {
    const cfg = this.gameData.stealth.ambush;
    this.ambushAt = this.now + cfg.warningSeconds * 1000;
    gameEvents.emit('sfx', 'spirit');
    gameEvents.emit('toast', { text: `The insects fall silent… something is circling. You have a few moments (${cfg.warningSeconds}s).`, tone: 'warn' });
  }

  // ---------- Progression and gear (M11) ----------

  /** Grants XP for a source (one-time per key, or daily-capped). True if anything was granted. */
  private grant(source: string, key: string | number | null): boolean {
    const a = this.progression.award(source, key, this.clock.dayNumber);
    if (!a) return false;
    const skill = this.gameData.progression.skills.find((s) => s.id === a.skill);
    this.floating.show(this.player.x + 18, this.player.y - 48, `+${a.xp} ${skill?.name ?? a.skill}`, '#c58be0');
    if (a.levelUp !== null) {
      gameEvents.emit('music', 'levelup');
      this.record('skill_level', a.levelUp);
      gameEvents.emit('toast', { text: `${skill?.name ?? a.skill} rose to level ${a.levelUp}: ${skill?.effect ?? ''}`, tone: 'info' });
      gameEvents.emit('sfx', 'shrine');
      this.applyProgressionEffects();
      this.checkKnowledge();
    }
    this.emitCharacter();
    return true;
  }

  /** Learns any knowledge whose condition is met (an item owned, or a skill level reached). */
  private checkKnowledge(): void {
    const inv = this.inventory.inventory;
    const owned = (id: string) =>
      inv.count(id) > 0 ||
      this.equipment.body?.item === id ||
      this.equipment.feet?.item === id ||
      this.structures.records.some((s) => (s.storage?.count(id) ?? 0) > 0);
    for (const k of this.progression.learnable(owned)) {
      if (!this.progression.learn(k.id)) continue;
      const recipes = [...this.gameData.recipes.values()].filter((r) => r.unlock === k.id).map((r) => itemDef(r.output).name);
      gameEvents.emit('toast', { text: `Learned ${k.name}: ${k.text}${recipes.length ? ` New at the workbench: ${recipes.join(', ')}.` : ''}`, tone: 'info' });
      this.emitCharacter();
    }
  }

  private applyProgressionEffects(): void {
    this.fx = this.progression.effects();
  }

  private applyGear(): void {
    const body = this.equipment.body ? itemDef(this.equipment.body.item).gear : undefined;
    const cold = this.gameData.season.cold;
    this.coldWorn = body?.rainWarmth !== undefined ? { ...cold, lossPerHour: cold.lossPerHour * body.rainWarmth } : null;
    this.feetGear = this.equipment.feet ? itemDef(this.equipment.feet.item).gear : undefined;
  }

  private equip(def: ItemDef): void {
    const gear = def.gear;
    if (!gear) return;
    const taken = this.inventory.inventory.takeFromSlot(this.inventory.selected, 1);
    if (!taken) return;
    const old = this.equipment[gear.slot];
    this.equipment[gear.slot] = { item: taken.item, qty: 1 };
    if (old) this.giveBack(old.item);
    this.applyGear();
    this.inventory.broadcast();
    this.emitCharacter();
    gameEvents.emit('sfx', 'craft');
    this.floating.show(this.player.x, this.player.y - 34, `Wearing ${def.name}`, '#8ec26a');
  }

  private unequip(slot: 'body' | 'feet'): void {
    const e = this.equipment[slot];
    if (!e) return;
    if (this.inventory.inventory.capacityFor(e.item) < 1) {
      gameEvents.emit('toast', { text: 'No room in your pack to take it off', tone: 'warn' });
      return;
    }
    this.inventory.inventory.add(e.item, 1);
    this.equipment[slot] = null;
    this.applyGear();
    this.inventory.broadcast();
    this.emitCharacter();
  }

  private heldToolWorn(): boolean {
    const held = this.inventory.held;
    const tool = held ? itemDef(held.item).tool : undefined;
    return !!tool && held?.durability !== undefined && held.durability < tool.durability * 0.95;
  }

  /** R at a workbench: restore half of a held tool's durability for 1 of its main material. */
  private repairHeldTool(): void {
    const held = this.inventory.held;
    const def = held ? itemDef(held.item) : null;
    const tool = def?.tool;
    if (!held || !def || !tool || held.durability === undefined) {
      gameEvents.emit('toast', { text: 'Hold a worn tool and press R at the workbench to repair it', tone: 'info' });
      return;
    }
    const max = tool.durability;
    if (held.durability >= max * 0.95) {
      gameEvents.emit('toast', { text: `Your ${def.name} doesn't need repairs`, tone: 'info' });
      return;
    }
    const recipeMain = [...this.gameData.recipes.values()].find((r) => r.output === held.item)?.ingredients[0];
    const main = tool.repairItem ? { item: tool.repairItem, qty: 1 } : recipeMain;
    if (main && this.inventory.inventory.count(main.item) < 1) {
      gameEvents.emit('toast', { text: `Repairing the ${def.name} needs 1 ${itemDef(main.item).name}`, tone: 'info' });
      return;
    }
    const slot = this.inventory.selected;
    const value = Math.min(max, held.durability + Math.ceil(tool.durability / 2));
    if (main) this.inventory.inventory.remove(main.item, 1);
    this.inventory.inventory.setDurability(slot, value);
    this.inventory.broadcast();
    gameEvents.emit('sfx', 'build');
    this.floating.show(this.player.x, this.player.y - 34, `${def.name} repaired`, '#8ec26a');
  }

  /** What a skill gives right now, in plain words. */
  private effectNow(id: string): string {
    const f = this.fx;
    switch (id) {
      case 'foraging':
        return f.foragingExtraChance > 0 ? `now ${Math.round(f.foragingExtraChance * 100)}% chance of an extra harvest` : 'no bonus yet';
      case 'crafting':
        return f.toolWear < 1 ? `now tools wear ${Math.round((1 - f.toolWear) * 100)}% slower` : 'no bonus yet';
      case 'survival':
        return f.drain < 1 ? `now ${Math.round((1 - f.drain) * 100)}% less hunger and thirst` : 'no bonus yet';
      case 'combat':
        return f.combatDamage > 0 ? `now +${f.combatDamage} melee damage` : 'no bonus yet';
      case 'exploration':
        return f.speed > 1 ? `now +${Math.round((f.speed - 1) * 100)}% walking speed` : 'no bonus yet';
      default:
        return '';
    }
  }

  private emitCharacter(): void {
    const cfg = this.gameData.progression;
    gameEvents.emit('character:changed', {
      equipment: { body: this.equipment.body, feet: this.equipment.feet },
      skills: cfg.skills.map((s) => ({ id: s.id, name: s.name, level: this.progression.level(s.id), xp: this.progression.xp[s.id], toNext: this.progression.toNext(s.id), effect: s.effect, now: this.effectNow(s.id) })),
      knowledge: [...this.progression.knowledge],
    });
  }

  // ---------- Building and outposts (M10) ----------

  private emitOutposts(): void {
    gameEvents.emit(
      'outposts:changed',
      this.structures.records.filter((s) => s.def.outpost).map((s) => ({ name: s.name ?? s.def.name, x: s.x, y: s.y })),
    );
  }

  /** The recipe that makes a structure's kit (for refunds and repairs). */
  private kitRecipe(s: Structure): { kit: string; ingredients: ReadonlyArray<{ item: string; qty: number }>; qty: number } | null {
    const kit = [...this.gameData.items.values()].find((i) => i.places === s.def.id);
    if (!kit) return null;
    const r = [...this.gameData.recipes.values()].find((x) => x.output === kit.id);
    return r ? { kit: kit.id, ingredients: r.ingredients, qty: r.qty } : { kit: kit.id, ingredients: [], qty: 1 };
  }

  private structurePrompt(s: Structure): string {
    const d = s.def;
    const parts: string[] = [];
    if (this.structures.isBroken(s)) parts.push(`${d.name} (broken)`);
    else
      switch (d.interaction) {
        case 'cook':
          parts.push(`E — Cook at the ${d.name.toLowerCase()}`);
          break;
        case 'craft': {
          parts.push(`E — Use the ${d.name.toLowerCase()}`);
          const held = this.inventory.held;
          const tool = held ? itemDef(held.item).tool : undefined;
          if (tool && held?.durability !== undefined && held.durability < tool.durability * 0.95) parts.push('R — Repair held tool');
          break;
        }
        case 'storage':
          parts.push(`E — Open the ${d.name.toLowerCase()}`);
          break;
        case 'sleep': {
          const sl = this.gameData.survival.sleep;
          parts.push(inHourWindow(this.clock.hour, sl.fromHour, sl.untilHour) ? 'E — Sleep until morning (saves)' : `${d.name} — sleep from ${hourLabel(sl.fromHour)}`);
          break;
        }
        case 'collect': {
          const held = this.inventory.held;
          const canFill = held ? itemDef(held.item).fillsTo !== undefined : false;
          parts.push(`${d.name} ${s.water}/${d.rainCapacity ?? 0}${canFill ? ' · E — Fill your tube' : ' · hold a bamboo tube'}`);
          break;
        }
        default:
          parts.push(s.name ?? d.name);
      }
    if (d.durability) {
      const pct = Math.round((s.durability / d.durability) * 100);
      if (pct < 75) parts.push(`${pct}% · R — Repair`);
      else if (pct < 100) parts.push(`${pct}%`);
    }
    parts.push('X — Dismantle');
    return parts.join(' · ');
  }

  /** X twice: remove a structure and get about half its materials back (chests must be empty). */
  private dismantle(s: Structure): void {
    if (s.storage && s.storage.snapshot().some((x) => x !== null)) {
      gameEvents.emit('toast', { text: 'Empty the chest before dismantling it', tone: 'info' });
      return;
    }
    if (this.dismantleArmed.uid !== s.uid || this.now > this.dismantleArmed.until) {
      this.dismantleArmed = { uid: s.uid, until: this.now + 2500 };
      gameEvents.emit('toast', { text: `Press X again to dismantle the ${s.def.name.toLowerCase()} (returns about half its materials)`, tone: 'info' });
      return;
    }
    this.dismantleArmed = { uid: -1, until: 0 };
    const r = this.kitRecipe(s);
    const refund: Array<{ item: string; qty: number }> = [];
    if (r) {
      r.ingredients.forEach((g, i) => {
        const q = Math.floor(g.qty / r.qty / 2);
        const qty = i === 0 ? Math.max(1, q) : q;
        if (qty > 0) refund.push({ item: g.item, qty });
      });
    }
    this.structures.remove(s);
    for (const g of refund) {
      const left = this.inventory.add(g.item, g.qty);
      if (left > 0 && !this.dropInFront(g.item, left)) this.pickups.spawn(g.item, left, s.x, s.y, this.now, 0, 6, false);
    }
    this.inventory.broadcast();
    this.emitStructures();
    if (s.def.outpost) this.emitOutposts();
    gameEvents.emit('sfx', 'chop');
    this.floating.show(s.x, s.y - 24, refund.length ? `+${refund.map((g) => `${g.qty} ${itemDef(g.item).name}`).join(', ')}` : 'Dismantled', '#8ec26a');
  }

  /** R near a weathered structure: one of its main material restores it fully. */
  private repairStructure(s: Structure): void {
    const max = s.def.durability ?? 0;
    if (!max || s.durability >= max * 0.75) return;
    const main = this.kitRecipe(s)?.ingredients[0];
    if (main && this.inventory.inventory.count(main.item) < 1) {
      gameEvents.emit('toast', { text: `Repairing needs 1 ${itemDef(main.item).name}`, tone: 'info' });
      return;
    }
    if (s.def.solid && this.structures.isBroken(s)) {
      const f = footprintOf(s.def, s.rot);
      if (this.physics.overlapRect(s.x - f.w / 2, s.y - f.h, f.w, f.h, true, false).length > 0) {
        gameEvents.emit('toast', { text: 'Step out of the way to repair it', tone: 'info' });
        return;
      }
    }
    if (main) this.inventory.inventory.remove(main.item, 1);
    s.durability = max;
    this.structures.refresh(s);
    this.inventory.broadcast();
    gameEvents.emit('sfx', 'build');
    this.floating.show(s.x, s.y - 26, 'Repaired', '#8ec26a');
  }

  /** Monsoon weathering: unroofed structures wear (roofs always); rain collectors fill. */
  private weatherStructures(hours: number): void {
    const p = this.player;
    let brokeNear = 0;
    let lastName = '';
    for (const s of this.structures.records) {
      const d = s.def;
      if (d.rainCapacity && !this.structures.isBroken(s)) s.water = Math.min(d.rainCapacity, s.water + hours);
      if (!d.durability || this.structures.isBroken(s)) continue;
      if (!d.wearsAlways && this.isRoofed(s)) continue;
      s.durability = Math.max(0, s.durability - hours);
      if (s.durability > 0) continue;
      this.structures.refresh(s);
      if (Math.hypot(s.x - p.x, s.y - p.y) < 700) {
        brokeNear++;
        lastName = d.name.toLowerCase();
      }
    }
    if (brokeNear > 0) {
      gameEvents.emit('toast', {
        text: brokeNear === 1 ? `Your ${lastName} gave way in the rain — repair it with R` : `${brokeNear} of your structures gave way in the rain — repair them with R`,
        tone: 'warn',
      });
    }
  }

  private isRoofed(s: Structure): boolean {
    for (const r of this.structures.records) {
      if (r === s || !r.def.shelterRadius || this.structures.isBroken(r)) continue;
      if (Math.hypot(r.x - s.x, this.structures.centerY(r) - this.structures.centerY(s)) <= r.def.shelterRadius) return true;
    }
    return false;
  }

  /** Roofs fade while the player is underneath. */
  private updateRoofs(): void {
    const p = this.player;
    for (const s of this.structures.list) {
      if (!s.def.overhead || !s.image) continue;
      const f = footprintOf(s.def, s.rot);
      const under = Math.abs(p.x - s.x) < f.w / 2 + 4 && p.y < s.y + 6 && p.y > s.y - f.h - 12;
      const base = this.structures.isBroken(s) ? 0.55 : 1;
      const a = under ? 0.3 : base;
      if (s.image.alpha !== a) s.image.setAlpha(a);
    }
  }

  private storageView(s: Structure): { uid: number; title: string; slots: ReturnType<NonNullable<Structure['storage']>['snapshot']> } {
    return { uid: s.uid, title: s.def.name, slots: s.storage?.snapshot() ?? [] };
  }

  private openStorage(s: Structure): void {
    if (!s.storage) return;
    this.openChestUid = s.uid;
    gameEvents.emit('sfx', 'chest');
    gameEvents.emit('storage:open', this.storageView(s));
  }

  /** Moves stacks between an open chest and the pack; never loses items (leftovers stay put). */
  private moveStorage(uid: number, from: 'chest' | 'player', slot: number): void {
    const s = this.structures.byUid(uid);
    if (!s?.storage || uid !== this.openChestUid) return;
    if (Math.hypot(s.x - this.player.x, s.y - this.player.y) > 120) return;
    const chest = s.storage;
    const pack = this.inventory.inventory;
    const transfer = (src: typeof chest, dst: typeof chest, i: number) => {
      const st = src.get(i);
      if (!st) return;
      const left = dst.add(st.item, st.qty, st.durability);
      const moved = st.qty - left;
      if (moved > 0) src.takeFromSlot(i, moved);
    };
    if (from === 'chest') {
      if (slot < 0) for (let i = 0; i < chest.size; i++) transfer(chest, pack, i);
      else transfer(chest, pack, slot);
    } else transfer(pack, chest, slot);
    this.inventory.broadcast();
    gameEvents.emit('storage:changed', this.storageView(s));
  }

  private collectRain(s: Structure): void {
    const held = this.inventory.held;
    const def = held ? itemDef(held.item) : null;
    const item = s.def.collectItem;
    if (!item || !def?.fillsTo) {
      gameEvents.emit('toast', { text: `Hold a bamboo tube to collect rainwater (${s.water}/${s.def.rainCapacity ?? 0})`, tone: 'info' });
      return;
    }
    if (s.water <= 0) {
      gameEvents.emit('toast', { text: 'The collector is empty — it fills during the monsoon rains', tone: 'info' });
      return;
    }
    if (!this.inventory.inventory.takeFromSlot(this.inventory.selected, 1)) return;
    s.water--;
    this.giveBack(item);
    this.inventory.broadcast();
    gameEvents.emit('sfx', 'drink');
    this.floating.show(this.player.x, this.player.y - 34, `+1 ${itemDef(item).name}`, '#4fc2b4');
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
    let droppedStored = 0;
    for (const st of save.structures) {
      if (this.structures.hasSaved(st.type, st.x, st.y, st.uid)) continue;
      const storage = st.storage?.map((it) => {
        if (it && !this.gameData.items.has(it.item)) droppedStored++;
        return it && this.gameData.items.has(it.item) ? it : null;
      });
      if (!this.structures.place(st.type, st.x, st.y, { rot: st.rot, uid: st.uid, durability: st.durability, storage, water: st.water, name: st.name ?? null }))
        refundTypes.push(st.type);
    }
    if (droppedStored > 0) {
      this.time.delayedCall(700, () =>
        gameEvents.emit('toast', { text: `${droppedStored} unknown stored stack(s) from an older version were removed`, tone: 'warn' }),
      );
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
    this.ambushRolledNight = save.ambushNight;
    this.sideQuests = new SideQuestBook(this.gameData.sidequests, save.story.quests as Record<string, Partial<import('../systems/SideQuests').SideQuestState>>);
    for (const f of save.story.flags) this.storyFlags.add(f);
    Object.assign(this.setFlags, save.setpieces);
    this.endingLines = [...save.story.endingLines];
    this.applyStoryFlags();
    const ex = save.exploration;
    for (const k of ex.explored) this.explored.add(k);
    for (const k of ex.ruins) this.found.ruins.add(k);
    for (const k of ex.landmarks) this.found.landmarks.add(k);
    for (const k of ex.shortcuts) this.found.shortcuts.add(k);
    for (const k of ex.shrines) this.found.shrines.add(k);
    for (const k of ex.puzzles) this.found.puzzles.add(k);
    this.markers = ex.markers.map((m) => ({ ...m }));
    this.progression = new Progression(this.gameData.progression, save.progression);
    for (const slot of ['body', 'feet'] as const) {
      const e = save.equipment[slot];
      const def = e ? this.gameData.items.get(e.item) : undefined;
      this.equipment[slot] = e && def?.gear?.slot === slot ? { item: e.item, qty: 1 } : null;
    }
    this.effects.restore(save.effects.map((e) => ({ ...e, id: e.id as EffectId })));
    for (const s of save.shrines) this.shrineState.set(s.key, s.lastOffering);
    for (const k of save.openedChests) this.openedChests.add(k);
    this.quest = new QuestLog(this.gameData, save.tabletsRead, save.heartReached, this.gen.tabletSites().length, save.restored);
    this.lastWearHour = -1;
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
    if (this.openChestUid >= 0) {
      this.openChestUid = -1;
      gameEvents.emit('storage:dismiss');
    }
    this.building.cancel();
    this.player.halt();
    this.encounters.clear();
    this.projectiles.clear();
    const cause = this.survival.lastDamageCause ?? 'injury';
    // Opt-in permadeath: the journey and its save end here (nothing autosaves after this point).
    if (this.rules.permadeath) deleteSlot(currentSlot());
    const summary = { day: this.clock.dayNumber, time: this.clock.label(), cause, rules: { ...this.rules }, permadeath: this.rules.permadeath };
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
    this.applyBindings();
    // Rebind live when the controls change (settings are reachable from the pause menu).
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = onSettings(() => this.applyBindings());
    kb.addKey(K.F3, true);
    kb.on('keydown-F3', this.debugHandler);
    kb.on('keydown', this.pressHandler);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
  }

  private unsubscribeSettings: (() => void) | null = null;
  private boundSig = '';

  private held: HeldKeys | null = null;

  /** Held actions from the current bindings, by physical key (crouch is Z by default, never Ctrl). */
  private applyBindings(): void {
    const k = getSettings().keys;
    const sig = JSON.stringify(k);
    if (sig === this.boundSig && this.keys && this.held) return;
    this.boundSig = sig;
    this.held ??= new HeldKeys();
    this.held.setNoScroll(Object.values(k));
    const h = this.held;
    this.keys = { up: h.key(k.up), down: h.key(k.down), left: h.key(k.left), right: h.key(k.right), sprint: h.key(k.sprint), crouch: h.key(k.crouch), interact: h.key(k.interact), use: h.key(k.use) };
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
    this.held?.reset();
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
    gameEvents.emit('ambience', { day: 0, night: 0, rain: 0, fire: 0, river: 0 });
    this.unsubscribeSettings?.();
    this.unsubscribeSettings = null;
    this.boundSig = '';
    this.held?.destroy();
    this.held = null;
    this.dust = null;
    gameEvents.emit('audio:duck', false);
  }
}

function hourLabel(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
