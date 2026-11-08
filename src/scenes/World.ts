import Phaser from 'phaser';
import { CAMERA, DEPTH, GATHER, PICKUP, SCENES, TILE_SIZE, WATER } from '../config';
import { getGameData, itemDef } from '../data/gameData';
import { Player, type PlayerKeys } from '../entities/Player';
import type { ResourceNode } from '../entities/ResourceNode';
import { gameEvents, onSceneEvent, type PlayerTick } from '../systems/GameEvents';
import { Gathering } from '../systems/Gathering';
import { Interaction } from '../systems/Interaction';
import { Pickups } from '../systems/Pickups';
import { PlayerInventory } from '../systems/PlayerInventory';
import { TEX, TILE } from '../textures';
import { FloatingText } from '../ui/FloatingText';
import { PropLayer } from '../world/PropLayer';
import { buildTestMap } from '../world/TestMap';

/** Upper bound on distinct stacks one harvest can drop (loot tables have at most this many items). */
const MAX_LOOT_STACKS = 6;

interface WorldKeys extends PlayerKeys {
  interact: Phaser.Input.Keyboard.Key;
}

export class World extends Phaser.Scene {
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
  private debugOn = false;
  private modalOpen = false;
  private pointerHeld = false;
  /** Game-time clock (ms). Only advances while this scene updates, so pause freezes it. */
  private now = 0;
  private nextActAt = 0;
  private nextWaterFrameAt = 0;
  private lastPrompt = '';
  private readonly tick: PlayerTick = { x: 0, y: 0, speed: 0, sprinting: false };

  constructor() {
    super(SCENES.world);
  }

  create(): void {
    this.debugOn = false;
    this.modalOpen = false;
    this.pointerHeld = false;
    this.now = 0;
    this.nextActAt = 0;
    this.nextWaterFrameAt = 0;
    this.lastPrompt = '';

    const data = getGameData();
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
    this.gathering = new Gathering(this, this.props, map.props, data);
    this.player = new Player(this, map.spawn.x, map.spawn.y);
    this.physics.add.collider(this.player, this.props.solids);
    this.physics.add.collider(this.player, this.ground);

    this.floating = new FloatingText(this);
    this.interaction = new Interaction(this, this.gathering.nodes, this.ground);
    this.inventory = new PlayerInventory(this, (item, qty) => this.dropInFront(item, qty));
    this.pickups = new Pickups(this, {
      iconFor: (item) => itemDef(item).icon,
      capacityFor: (item) => this.inventory.capacityFor(item),
      add: (item, qty) => this.inventory.add(item, qty),
      onCollected: (item, qty, x, y) => this.floating.show(x, y - 12, `+${qty} ${itemDef(item).name}`),
      onInventoryFull: () => {
        this.floating.show(this.player.x, this.player.y - 34, 'Inventory full', '#d9644a');
        gameEvents.emit('inventory:full');
      },
    });

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
    });
    this.scene.launch(SCENES.ui);

    this.events.on(Phaser.Scenes.Events.RESUME, this.onResume, this);
    this.game.events.on(Phaser.Core.Events.BLUR, this.openPause, this);
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.openPause, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
  }

  override update(_time: number, delta: number): void {
    const dt = Math.min(delta, 100);
    this.now += dt;
    const p = this.player;
    const inputOn = !this.modalOpen;

    p.step(this.keys, dt, this.now, inputOn);
    this.props.updateCanopies(p.x, p.y, dt);
    this.gathering.update(this.now, p.x, p.y);
    this.pickups.update(p.x, p.y, dt, this.now);
    this.animateWater();

    if (!this.input.activePointer.isDown) this.pointerHeld = false;
    if (inputOn) {
      const target = this.interaction.update(p.x, p.y, p.facingVec.x, p.facingVec.y);
      this.setPrompt(
        target.kind === 'node' ? `E — ${target.node.label}` : target.kind === 'water' ? 'E — Drink water' : '',
      );
      if (this.keys.interact.isDown || this.pointerHeld) this.act(null);
    } else {
      this.interaction.hideRing();
      this.setPrompt('');
    }

    const t = this.tick;
    t.x = p.x;
    t.y = p.y;
    t.speed = p.speed;
    t.sprinting = p.sprinting;
    gameEvents.emit('player:tick', t);
  }

  /** One gather/drink action, rate-limited by game time. `clicked` overrides the target. */
  private act(clicked: ResourceNode | null): void {
    if (this.now < this.nextActAt) return;
    const target = this.interaction.current;
    const p = this.player;

    if (clicked || target.kind === 'node') {
      const node = clicked ?? (target.kind === 'node' ? target.node : null);
      if (!node) return;
      // Never destroy a node whose loot would have nowhere to go.
      if (this.pickups.freeSlots < MAX_LOOT_STACKS) {
        this.nextActAt = this.now + GATHER.hitCooldownMs;
        this.floating.show(node.targetX, node.targetY - 20, 'Too many items on the ground', '#d9644a');
        return;
      }
      p.swing(node.targetX, node.targetY, this.now, GATHER.swingMs);
      this.nextActAt = this.now + GATHER.hitCooldownMs;
      const { result, loot } = this.gathering.hit(node, 'hand', this.now, p.x);
      if (result === 'needs-tool') this.floating.show(node.targetX, node.targetY - 20, 'Needs a tool', '#e6b866');
      for (const stack of loot) {
        if (this.pickups.spawn(stack.item, stack.qty, node.prop.x, node.prop.y - 4, this.now, 250)) continue;
        const lost = this.inventory.add(stack.item, stack.qty);
        if (lost > 0) {
          this.floating.show(node.targetX, node.targetY - 20, 'No room for ' + lost + ' ' + itemDef(stack.item).name, '#d9644a');
        }
      }
      return;
    }

    if (target.kind === 'water') {
      p.swing(target.x, target.y + 8, this.now, GATHER.swingMs * 2);
      this.nextActAt = this.now + WATER.drinkCooldownMs;
      this.floating.show(p.x, p.y - 34, 'Fresh water', '#4fc2b4');
      gameEvents.emit('player:drank');
    }
  }

  /** Drops a stack just in front of the player; it can't be re-collected for a moment. */
  private dropInFront(item: string, qty: number): boolean {
    const p = this.player;
    const x = p.x + p.facingVec.x * 18;
    const y = p.y + p.facingVec.y * 14 + 2;
    const ok = this.pickups.spawn(item, qty, x, y, this.now, PICKUP.dropDelayMs, 4, true);
    if (ok) this.floating.show(x, y - 14, `-${qty} ${itemDef(item).name}`, '#8d978f');
    return ok;
  }

  private animateWater(): void {
    if (this.now < this.nextWaterFrameAt) return;
    this.nextWaterFrameAt = this.now + WATER.frameMs;
    // Swap the two water frames in place; only the index changes, so collision flags stay.
    for (const t of this.waterTiles) t.index = t.index === TILE.waterA ? TILE.waterB : TILE.waterA;
  }

  private setPrompt(text: string): void {
    if (text === this.lastPrompt) return;
    this.lastPrompt = text;
    gameEvents.emit('interact:prompt', text);
  }

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
    };
    kb.addKey(K.F3, true);
    kb.on('keydown-F3', this.toggleDebug, this);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
  }

  /** Only fires when no UI element above captured the click (Phaser globalTopOnly). */
  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.modalOpen || !pointer.leftButtonDown()) return;
    this.pointerHeld = true;
    const node = this.interaction.nodeAt(pointer.worldX, pointer.worldY, this.player.x, this.player.y);
    if (node) this.act(node);
    else if (this.interaction.current.kind === 'none' && this.now >= this.nextActAt) {
      this.player.swing(pointer.worldX, pointer.worldY, this.now, GATHER.swingMs);
      this.nextActAt = this.now + GATHER.hitCooldownMs;
    }
  }

  private openPause(): void {
    if (!this.scene.isActive() || this.scene.isActive(SCENES.pause)) return;
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
    kb?.off('keydown-F3', this.toggleDebug, this);
    kb?.removeAllKeys(true, true);
    this.scene.stop(SCENES.ui);
  }
}
