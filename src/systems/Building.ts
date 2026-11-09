import Phaser from 'phaser';
import { BUILD, ySort } from '../config';
import { TEX } from '../textures';
import { gameEvents } from './GameEvents';
import type { Structures } from './Structures';

/**
 * Structure placement mode: a tinted ghost follows the mouse (clamped to reach) and
 * shows whether the spot is valid. World places on click / F; Esc or right-click cancels.
 */
export class Building {
  active = false;
  structureId = '';
  /** Inventory slot holding the kit being placed. */
  slot = -1;
  valid = false;
  x = 0;
  y = 0;
  private readonly ghost: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    private readonly structures: Structures,
  ) {
    this.ghost = scene.add.image(0, 0, TEX.structures, 'campfire').setOrigin(0.5, 1).setAlpha(0.6).setVisible(false);
  }

  start(slot: number, structureId: string): void {
    const def = this.structures.def(structureId);
    if (!def) return;
    this.active = true;
    this.slot = slot;
    this.structureId = structureId;
    this.ghost.setFrame(def.sprite).setVisible(true);
    gameEvents.emit('placement:mode', true);
  }

  cancel(): void {
    if (!this.active) return;
    this.active = false;
    this.slot = -1;
    this.ghost.setVisible(false);
    gameEvents.emit('placement:mode', false);
  }

  /** aimX/aimY = pointer world position; the ghost stays within reach of the player. */
  update(aimX: number, aimY: number, playerX: number, playerY: number, playerBody: Phaser.Geom.Rectangle): void {
    if (!this.active) return;
    let dx = aimX - playerX;
    let dy = aimY - playerY;
    const d = Math.hypot(dx, dy);
    const max = BUILD.reach - 6;
    if (d > max) {
      dx = (dx / d) * max;
      dy = (dy / d) * max;
    }
    this.x = Math.round(playerX + dx);
    this.y = Math.round(playerY + dy);
    this.valid = this.structures.canPlace(this.structureId, this.x, this.y, playerX, playerY, playerBody);
    this.ghost
      .setPosition(this.x, this.y)
      .setDepth(ySort(this.y))
      .setTint(this.valid ? BUILD.validTint : BUILD.invalidTint);
  }
}
