import Phaser from 'phaser';
import { CAMERA, SCENES, TILE_SIZE } from '../config';
import { Player, type PlayerKeys } from '../entities/Player';
import { gameEvents, type PlayerTick } from '../systems/GameEvents';
import { TEX } from '../textures';
import { PropLayer } from '../world/PropLayer';
import { buildTestMap } from '../world/TestMap';

export class World extends Phaser.Scene {
  private player!: Player;
  private keys!: PlayerKeys;
  private props!: PropLayer;
  private debugOn = false;
  private readonly tick: PlayerTick = { x: 0, y: 0, speed: 0, sprinting: false };

  constructor() {
    super(SCENES.world);
  }

  create(): void {
    this.debugOn = false;
    const map = buildTestMap();
    const worldW = map.widthTiles * TILE_SIZE;
    const worldH = map.heightTiles * TILE_SIZE;

    const tilemap = this.make.tilemap({ data: map.ground, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const tileset = tilemap.addTilesetImage('ground', TEX.tiles, TILE_SIZE, TILE_SIZE, 0, 0);
    if (!tileset) throw new Error('Ground tileset failed to load');
    tilemap.createLayer(0, tileset, 0, 0)?.setDepth(-1);

    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.props = new PropLayer(this, map.props);
    this.player = new Player(this, map.spawn.x, map.spawn.y);
    this.physics.add.collider(this.player, this.props.solids);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, worldW, worldH);
    cam.setZoom(CAMERA.zoom);
    cam.setRoundPixels(true);
    cam.startFollow(this.player, true, CAMERA.lerp, CAMERA.lerp, 0, 12);
    cam.fadeIn(350, 4, 10, 9);

    this.bindInput();
    this.scene.launch(SCENES.ui);

    this.events.on(Phaser.Scenes.Events.RESUME, this.onResume, this);
    this.game.events.on(Phaser.Core.Events.BLUR, this.openPause, this);
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.openPause, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
  }

  override update(_time: number, delta: number): void {
    this.player.step(this.keys, delta);
    this.props.updateCanopies(this.player.x, this.player.y, delta);

    const t = this.tick;
    t.x = this.player.x;
    t.y = this.player.y;
    t.speed = this.player.speed;
    t.sprinting = this.player.sprinting;
    gameEvents.emit('player:tick', t);
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
    };
    kb.on('keydown-ESC', this.openPause, this);
    kb.addKey(K.F3, true);
    kb.on('keydown-F3', this.toggleDebug, this);
  }

  private openPause(): void {
    if (!this.scene.isActive() || this.scene.isActive(SCENES.pause)) return;
    this.player.halt();
    this.scene.pause();
    this.scene.pause(SCENES.ui);
    this.scene.launch(SCENES.pause);
    this.scene.bringToTop(SCENES.pause);
  }

  private onResume(): void {
    // Keys released while paused never reached this scene; clear them to avoid stuck movement.
    this.input.keyboard?.resetKeys();
  }

  private toggleDebug(): void {
    this.debugOn = !this.debugOn;
    const world = this.physics.world;
    if (this.debugOn && !world.debugGraphic) world.createDebugGraphic();
    world.drawDebug = this.debugOn;
    world.debugGraphic?.setDepth(200000).setVisible(this.debugOn).clear();
    gameEvents.emit('debug:toggle', this.debugOn);
  }

  private onShutdown(): void {
    this.events.off(Phaser.Scenes.Events.RESUME, this.onResume, this);
    this.game.events.off(Phaser.Core.Events.BLUR, this.openPause, this);
    this.game.events.off(Phaser.Core.Events.HIDDEN, this.openPause, this);
    const kb = this.input.keyboard;
    kb?.off('keydown-ESC', this.openPause, this);
    kb?.off('keydown-F3', this.toggleDebug, this);
    kb?.removeAllKeys(true, true);
    this.scene.stop(SCENES.ui);
  }
}
