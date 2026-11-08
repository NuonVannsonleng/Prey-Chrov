import Phaser from 'phaser';
import { CAMERA, DEPTH, GATHER, PICKUP, SCENES, TILE_SIZE, WATER } from '../config';
import { getGameData, itemDef } from '../data/gameData';
import type { GameData, Station, ToolKind } from '../data/schema';
import { Player, type PlayerKeys } from '../entities/Player';
import type { ResourceNode } from '../entities/ResourceNode';
import { Building } from '../systems/Building';
import { GameClock, darknessAt, inHourWindow, phaseOf } from '../systems/Clock';
import { gameEvents, onSceneEvent, type ClockTick, type PlayerTick, type SurvivalTick } from '../systems/GameEvents';
import { Gathering } from '../systems/Gathering';
import { Interaction } from '../systems/Interaction';
import { Lighting } from '../systems/Lighting';
import { Objectives } from '../systems/Objectives';
import { Pickups } from '../systems/Pickups';
import { PlayerInventory } from '../systems/PlayerInventory';
import { readSave, writeSave, type SaveData } from '../systems/Save';
import { buildSave, clampSelected, sanitizeInventory } from '../systems/SaveGame';
import { Structures } from '../systems/Structures';
import { Survival } from '../systems/Survival';
import { TEX, TILE, WATER_TILES } from '../textures';
import { FloatingText } from '../ui/FloatingText';
import { PropLayer } from '../world/PropLayer';
import { oncePerKeyEvent } from '../utils/keys';
import { buildTestMap } from '../world/TestMap';

/** Upper bound on distinct stacks one harvest can drop (loot tables have at most this many items). */
const MAX_LOOT_STACKS = 6;
const TORCH_DARKNESS = 0.15;

interface WorldKeys extends PlayerKeys {
  interact: Phaser.Input.Keyboard.Key;
  use: Phaser.Input.Keyboard.Key;
}

export interface WorldStartData {
  /** Resume from the save slot instead of starting a new journey. */
  load?: boolean;
}

export class World extends Phaser.Scene {
  private gameData!: GameData;
  private player!: Player;
  private keys!: WorldKeys;
  private props!: PropLayer;
  private ground!: Phaser.Tilemaps.TilemapLayer;
  private waterTiles: Phaser.Tilemaps.Tile[] = [];
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
  private stationsKey = '';
  private readonly stations = new Set<Station>();
  private readonly debugHandler = oncePerKeyEvent(() => this.toggleDebug());
  /**
   * Discrete presses are captured from keydown events (not Key.JustDown, which Phaser clears
   * when a key is pressed and released within one frame) and consumed in update().
   */
  private pendingUse = false;
  private pendingInteract = false;
  private readonly pressHandler = oncePerKeyEvent((e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.code === 'KeyF') this.pendingUse = true;
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
  };
  private readonly clockTick: ClockTick = { day: 1, label: '', phase: '', darkness: 0 };

  constructor() {
    super(SCENES.world);
  }

  create(start?: WorldStartData): void {
    this.resetFlags();
    this.gameData = getGameData();
    const map = buildTestMap();
    const worldW = map.widthTiles * TILE_SIZE;
    const worldH = map.heightTiles * TILE_SIZE;

    const tilemap = this.make.tilemap({ data: map.ground, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const tileset = tilemap.addTilesetImage('ground', TEX.tiles, TILE_SIZE, TILE_SIZE, 0, 0);
    const layer = tileset ? tilemap.createLayer(0, tileset, 0, 0) : null;
    if (!layer) throw new Error('Ground layer failed to build');
    this.ground = layer.setDepth(DEPTH.ground);
    this.ground.setCollision([TILE.waterA, TILE.waterB]);
    this.waterTiles = this.ground.filterTiles((t: Phaser.Tilemaps.Tile) => t.index === TILE.waterA);

    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.props = new PropLayer(this);
    this.props.addScenery(map.props);
    this.gathering = new Gathering(this, this.props, map.props, this.gameData);
    this.structures = new Structures(this, this.props, this.ground, this.gameData.structures);
    this.structures.keepClear = map.spawn;
    this.spawn = map.spawn;
    this.player = new Player(this, map.spawn.x, map.spawn.y);
    this.physics.add.collider(this.player, this.props.solids);
    this.physics.add.collider(this.player, this.ground);

    this.floating = new FloatingText(this);
    this.interaction = new Interaction(this, this.gathering.nodes, this.ground, this.structures.list);
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
        if (itemDef(output).tool?.kind === 'axe') this.completeObjective('craft_axe');
      },
    );
    this.pickups = new Pickups(this, {
      iconFor: (item) => itemDef(item).icon,
      capacityFor: (item) => this.inventory.capacityFor(item),
      add: (item, qty, durability) => this.inventory.add(item, qty, durability),
      onCollected: (item, qty, x, y) => {
        this.floating.show(x, y - 12, `+${qty} ${itemDef(item).name}`);
        const inv = this.inventory.inventory;
        if (inv.count('wood') > 0 && inv.count('stone') > 0) this.completeObjective('gather');
      },
      onInventoryFull: () => {
        this.floating.show(this.player.x, this.player.y - 34, 'Inventory full', '#d9644a');
        gameEvents.emit('inventory:full');
      },
    });

    if (start?.load) this.loadFromSave();
    this.lastHealth = this.survival.stats.health;
    this.wasHungry = this.survival.hungry;
    this.wasThirsty = this.survival.thirsty;

    const cam = this.cameras.main;
    cam.setBounds(0, 0, worldW, worldH);
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
    this.stationsKey = '';
    this.stations.clear();
    this.pendingUse = false;
    this.pendingInteract = false;
  }

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta, 100);
    const p = this.player;
    this.animateWater(dt);
    if (this.busy) {
      this.pendingUse = false;
      this.pendingInteract = false;
      this.renderLighting();
      return;
    }
    this.now += dt;
    const inputOn = !this.modalOpen;
    const cfg = this.gameData.survival;

    p.step(this.keys, dt, this.now, inputOn, this.survival.canSprint);
    this.clock.advance(dt / 1000);
    this.survival.update(dt / 1000, this.clock.secondsPerHour, p.sprinting);
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
    if (this.building.active) this.updateBuilding();

    if (!this.input.activePointer.isDown) this.pointerHeld = false;
    if (inputOn) {
      const target = this.interaction.update(p.x, p.y, p.facingVec.x, p.facingVec.y);
      this.setPrompt(this.promptFor(target.kind === 'structure' ? target.structure.def.interaction : target.kind, target));
      const pressed = this.pendingInteract;
      if (this.pendingUse) this.useHeld();
      if (this.keys.interact.isDown || this.pointerHeld || pressed) this.act(null, pressed);
    } else {
      this.interaction.hideRing();
      this.setPrompt('');
    }

    this.pendingUse = false;
    this.pendingInteract = false;
    this.renderLighting();
    this.emitTicks(cfg);
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
    return darknessAt(this.clock.hour, this.gameData.survival.darkness);
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
    gameEvents.emit('survival:tick', st);

    const c = this.clockTick;
    const dark = this.darkness();
    c.day = this.clock.dayNumber;
    c.label = this.clock.label();
    c.phase = phaseOf(dark, this.clock.hour);
    c.darkness = dark;
    gameEvents.emit('clock:tick', c);
  }

  private updateStations(): void {
    this.structures.stationsNear(this.player.x, this.player.y, this.stations);
    const key = this.stations.has('campfire') ? 'campfire' : '';
    if (key === this.stationsKey) return;
    this.stationsKey = key;
    gameEvents.emit('craft:stations', [...this.stations]);
  }

  // ---------- Actions ----------

  private promptFor(kind: string | null, target: typeof this.interaction.current): string {
    switch (kind) {
      case 'node':
        return target.kind === 'node' ? `E — ${target.node.label}` : '';
      case 'water':
        return 'E — Drink water';
      case 'cook':
        return 'E — Cook at the campfire';
      case 'sleep': {
        const sl = this.gameData.survival.sleep;
        return inHourWindow(this.clock.hour, sl.fromHour, sl.untilHour)
          ? 'E — Sleep until morning (saves)'
          : `Shelter — you can sleep from ${hourLabel(sl.fromHour)}`;
      }
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
      p.swing(target.x, target.y + 8, this.now, GATHER.swingMs * 2);
      this.nextActAt = this.now + WATER.drinkCooldownMs;
      this.survival.drink();
      this.floating.show(p.x, p.y - 34, 'Fresh water', '#4fc2b4');
      gameEvents.emit('player:drank');
      this.completeObjective('drink');
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
    if (result === 'needs-tool') this.floating.show(node.targetX, node.targetY - 20, 'Needs a tool', '#e6b866');
    if (kind !== 'hand' && (result === 'hit' || result === 'depleted')) {
      if (this.inventory.inventory.wear(this.inventory.selected, 1) === 'broke') {
        gameEvents.emit('toast', { text: `Your ${itemDef(held?.item ?? '').name} broke`, tone: 'warn' });
      }
      this.inventory.broadcast();
    }
    for (const stack of loot) {
      if (this.pickups.spawn(stack.item, stack.qty, node.prop.x, node.prop.y - 4, this.now, 250)) continue;
      const lost = this.inventory.add(stack.item, stack.qty);
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
    if (def.food) {
      const st = this.survival.stats;
      const cfgS = this.gameData.survival;
      const helps =
        (def.food.hunger > 0 && st.hunger < cfgS.maxHunger - 1) ||
        (def.food.thirst > 0 && st.thirst < cfgS.maxThirst - 1) ||
        (def.food.health > 0 && st.health < cfgS.maxHealth - 1);
      if (!helps) {
        gameEvents.emit('toast', { text: `You're not hungry — save the ${def.name} for later`, tone: 'info' });
        return;
      }
      this.survival.eat(def.food);
      this.inventory.inventory.takeFromSlot(this.inventory.selected, 1);
      this.inventory.broadcast();
      this.player.swing(this.player.x, this.player.y - 20, this.now, GATHER.swingMs * 2);
      const parts = [`+${def.food.hunger} food`];
      if (def.food.thirst) parts.push(`+${def.food.thirst} water`);
      if (def.food.health) parts.push(`${def.food.health > 0 ? '+' : ''}${def.food.health} health`);
      this.floating.show(this.player.x, this.player.y - 34, parts.join('  '), def.food.health < 0 ? '#e6b866' : '#8ec26a');
      return;
    }
    const msg = def.tool
      ? def.tool.kind === 'spear'
        ? 'The spear is ready, but there is nothing to fight yet.'
        : `Hold E or click a ${def.tool.kind === 'axe' ? 'tree or bamboo' : 'boulder'} to use your ${def.name}`
      : def.light
        ? 'Torches light up automatically in the dark while held'
        : `${def.name} is a crafting material — open crafting with C`;
    gameEvents.emit('toast', { text: msg, tone: 'info' });
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
    this.floating.show(b.x, b.y - 30, `Built ${placed.def.name}`, '#8ec26a');
    if (placed.def.interaction === 'cook') this.completeObjective('campfire');
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

  private save(): boolean {
    return writeSave(
      buildSave({
        clock: this.clock,
        survival: this.survival,
        player: this.player,
        inventory: this.inventory,
        structures: this.structures,
        gathering: this.gathering,
        pickups: this.pickups,
        objectives: this.objectives,
        now: this.now,
      }),
    );
  }

  private loadFromSave(): void {
    const r = readSave();
    if ('error' in r) {
      this.time.delayedCall(400, () => gameEvents.emit('toast', { text: 'Saved journey could not be loaded — starting fresh', tone: 'warn' }));
      return;
    }
    this.applySave(r.data);
  }

  private applySave(save: SaveData): void {
    if (Number.isFinite(save.clockSeconds)) this.clock.totalSeconds = save.clockSeconds;
    const ps = save.player;
    this.survival = new Survival(this.gameData.survival, {
      ...(Number.isFinite(ps.health) && ps.health > 0 ? { health: ps.health } : {}),
      ...(Number.isFinite(ps.hunger) ? { hunger: ps.hunger } : {}),
      ...(Number.isFinite(ps.thirst) ? { thirst: ps.thirst } : {}),
      ...(Number.isFinite(ps.stamina) ? { stamina: ps.stamina } : {}),
    });
    const { slots, removed } = sanitizeInventory(save.inventory, this.gameData, this.inventory.inventory.size);
    this.inventory.inventory.restore(slots);
    this.inventory.selected = clampSelected(save.selected);
    if (removed > 0) {
      this.time.delayedCall(600, () =>
        gameEvents.emit('toast', { text: `${removed} unknown item stack(s) from an older version were removed`, tone: 'warn' }),
      );
    }
    let refunded = 0;
    for (const st of save.structures) {
      if (this.structures.list.some((s) => s.x === Math.round(st.x) && s.y === Math.round(st.y))) continue;
      if (this.structures.place(st.type, st.x, st.y)) continue;
      const kit = [...this.gameData.items.values()].find((i) => i.places === st.type);
      if (kit && this.inventory.add(kit.id, 1) === 0) refunded++;
    }
    if (refunded > 0) {
      this.time.delayedCall(800, () => gameEvents.emit('toast', { text: `${refunded} structure(s) could not be rebuilt and were returned as kits`, tone: 'info' }));
    }
    const byId = new Map(this.gathering.nodes.map((n) => [n.prop.id, n]));
    for (const sn of save.nodes) {
      const node = byId.get(sn.id);
      if (!node) continue;
      node.harvestCount = sn.harvests;
      if (sn.depleted) {
        node.forceDepleted(this.now + sn.respawnInMs);
      } else node.hp = Math.min(node.def.hp, Math.max(1, sn.hp));
    }
    for (const pk of save.pickups) {
      if (this.gameData.items.has(pk.item)) this.pickups.spawn(pk.item, pk.qty, pk.x, pk.y, 0, 0, 0, false, pk.durability);
    }
    this.objectives = new Objectives(save.objectives);
    this.placePlayer(ps.x, ps.y);
  }

  /** Puts the player at a saved spot if it is inside the world and not blocked; otherwise at spawn. */
  private placePlayer(x: number, y: number): void {
    const b = this.physics.world.bounds;
    const ok =
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      x > b.x + 8 &&
      x < b.right - 8 &&
      y > b.y + 16 &&
      y < b.bottom - 4 &&
      this.physics.overlapRect(x - 8, y - 11, 16, 11, false, true).length === 0 &&
      !WATER_TILES.includes(this.ground.getTileAtWorldXY(x, y - 4)?.index ?? -1);
    const px = ok ? x : this.spawn.x;
    const py = ok ? y : this.spawn.y;
    this.player.body.reset(px, py);
  }

  private die(): void {
    if (this.busy) return;
    this.busy = true;
    this.building.cancel();
    this.player.halt();
    const cause = this.survival.lastDamageCause ?? 'injury';
    const summary = { day: this.clock.dayNumber, time: this.clock.label(), cause };
    const cam = this.cameras.main;
    cam.shake(250, 0.004);
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
    // Swap the two water frames in place; only the index changes, so collision flags stay.
    for (const t of this.waterTiles) t.index = t.index === TILE.waterA ? TILE.waterB : TILE.waterA;
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
    this.player.halt();
    this.pointerHeld = false;
    this.scene.pause();
    this.scene.pause(SCENES.ui);
    this.scene.launch(SCENES.pause);
    this.scene.bringToTop(SCENES.pause);
  }

  private onResume(): void {
    // Keys released while paused never reached this scene; clear them to avoid stuck movement.
    this.input.keyboard?.resetKeys();
    this.pointerHeld = false;
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
    this.scene.stop(SCENES.ui);
  }
}

function hourLabel(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
