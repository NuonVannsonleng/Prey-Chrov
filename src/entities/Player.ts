import Phaser from 'phaser';
import { PLAYER } from '../config';
import { approachVelocity, targetVelocity, type MoveInput, type Vec2 } from '../systems/Movement';
import { PLAYER_DIRS, TEX, playerFrameName, type PlayerDir } from '../textures';

export interface PlayerKeys {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  sprint: Phaser.Input.Keyboard.Key;
}

/** Registers player animations once per game (animations are global). */
export function ensurePlayerAnimations(anims: Phaser.Animations.AnimationManager): void {
  for (const dir of PLAYER_DIRS) {
    const walkKey = `player-walk-${dir}`;
    const idleKey = `player-idle-${dir}`;
    if (!anims.exists(walkKey)) {
      anims.create({
        key: walkKey,
        frames: (['stepA', 'idle', 'stepB', 'idle'] as const).map((pose) => ({
          key: TEX.player,
          frame: playerFrameName(dir, pose),
        })),
        frameRate: PLAYER.walkFrameRate,
        repeat: -1,
      });
    }
    if (!anims.exists(idleKey)) {
      anims.create({
        key: idleKey,
        frames: [
          { key: TEX.player, frame: playerFrameName(dir, 'idle'), duration: 900 },
          { key: TEX.player, frame: playerFrameName(dir, 'breathe'), duration: 500 },
        ],
        repeat: -1,
      });
    }
  }
}

export class Player extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;

  private readonly moveInput: MoveInput = { up: false, down: false, left: false, right: false, sprint: false };
  private readonly target: Vec2 = { x: 0, y: 0 };
  private readonly current: Vec2 = { x: 0, y: 0 };
  private readonly next: Vec2 = { x: 0, y: 0 };
  private facing: PlayerDir = 'down';
  private animKey = '';
  sprinting = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEX.player, playerFrameName('down', 'idle'));
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    const b = PLAYER.body;
    this.body.setSize(b.width, b.height, false);
    this.body.setOffset(b.offsetX, b.offsetY);
    this.body.setCollideWorldBounds(true);
    this.playAnim(`player-idle-down`);
  }

  /** Reads input, smooths velocity, updates facing/animation. dt in ms. */
  step(keys: PlayerKeys, dtMs: number): void {
    const inp = this.moveInput;
    inp.up = keys.up.isDown;
    inp.down = keys.down.isDown;
    inp.left = keys.left.isDown;
    inp.right = keys.right.isDown;
    inp.sprint = keys.sprint.isDown;

    targetVelocity(inp, PLAYER, this.target);
    this.current.x = this.body.velocity.x;
    this.current.y = this.body.velocity.y;
    approachVelocity(this.current, this.target, PLAYER, dtMs / 1000, this.next);
    this.body.setVelocity(this.next.x, this.next.y);

    const moving = this.target.x !== 0 || this.target.y !== 0;
    this.sprinting = moving && inp.sprint;
    if (moving) {
      if (Math.abs(this.target.x) > Math.abs(this.target.y)) {
        this.facing = 'side';
        this.setFlipX(this.target.x < 0);
      } else {
        this.facing = this.target.y < 0 ? 'up' : 'down';
        this.setFlipX(false);
      }
      this.playAnim(`player-walk-${this.facing}`);
      this.anims.timeScale = this.sprinting ? PLAYER.sprintFrameRate / PLAYER.walkFrameRate : 1;
    } else {
      this.playAnim(`player-idle-${this.facing}`);
      this.anims.timeScale = 1;
    }
    this.setDepth(this.y);
  }

  halt(): void {
    this.body.setVelocity(0, 0);
    this.sprinting = false;
  }

  get speed(): number {
    return Math.hypot(this.body.velocity.x, this.body.velocity.y);
  }

  private playAnim(key: string): void {
    if (this.animKey === key) return;
    this.animKey = key;
    this.play(key, true);
  }
}
