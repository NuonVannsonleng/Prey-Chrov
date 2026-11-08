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
  private actUntil = 0;
  /** Unit vector the player is facing (used for interaction targeting). */
  readonly facingVec: Vec2 = { x: 0, y: 1 };
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

  /**
   * Reads input, smooths velocity, updates facing/animation. dt and now in ms (game time).
   * With `inputEnabled` false the player glides to a stop (used while panels are open).
   */
  step(keys: PlayerKeys, dtMs: number, now: number, inputEnabled = true, sprintAllowed = true): void {
    const inp = this.moveInput;
    inp.up = inputEnabled && keys.up.isDown;
    inp.down = inputEnabled && keys.down.isDown;
    inp.left = inputEnabled && keys.left.isDown;
    inp.right = inputEnabled && keys.right.isDown;
    inp.sprint = inputEnabled && sprintAllowed && keys.sprint.isDown;

    targetVelocity(inp, PLAYER, this.target);
    this.current.x = this.body.velocity.x;
    this.current.y = this.body.velocity.y;
    approachVelocity(this.current, this.target, PLAYER, dtMs / 1000, this.next);
    this.body.setVelocity(this.next.x, this.next.y);

    const moving = this.target.x !== 0 || this.target.y !== 0;
    this.sprinting = moving && inp.sprint;
    if (moving) {
      const len = Math.hypot(this.target.x, this.target.y);
      this.facingVec.x = this.target.x / len;
      this.facingVec.y = this.target.y / len;
      this.updateFacing(this.target.x, this.target.y);
    }

    if (now < this.actUntil) {
      this.animKey = '';
      this.anims.stop();
      this.setFrame(playerFrameName(this.facing, 'act'));
    } else if (moving) {
      this.playAnim(`player-walk-${this.facing}`);
      this.anims.timeScale = this.sprinting ? PLAYER.sprintFrameRate / PLAYER.walkFrameRate : 1;
    } else {
      this.playAnim(`player-idle-${this.facing}`);
      this.anims.timeScale = 1;
    }
    this.setDepth(this.y);
  }

  /** Shows the swing/reach pose toward a world point for `durationMs`. */
  swing(towardX: number, towardY: number, now: number, durationMs: number): void {
    const dx = towardX - this.x;
    const dy = towardY - (this.y - 8);
    const len = Math.hypot(dx, dy);
    if (len > 0.001) {
      this.facingVec.x = dx / len;
      this.facingVec.y = dy / len;
      this.updateFacing(dx, dy);
    }
    this.actUntil = now + durationMs;
  }

  halt(): void {
    this.body.setVelocity(0, 0);
    this.sprinting = false;
  }

  get speed(): number {
    return Math.hypot(this.body.velocity.x, this.body.velocity.y);
  }

  private updateFacing(dx: number, dy: number): void {
    if (Math.abs(dx) > Math.abs(dy)) {
      this.facing = 'side';
      this.setFlipX(dx < 0);
    } else {
      this.facing = dy < 0 ? 'up' : 'down';
      this.setFlipX(false);
    }
  }

  private playAnim(key: string): void {
    if (this.animKey === key) return;
    this.animKey = key;
    this.play(key, true);
  }
}
