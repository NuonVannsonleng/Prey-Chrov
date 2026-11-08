import Phaser from 'phaser';
import { SCENES } from '../config';
import { ensurePlayerAnimations } from '../entities/Player';
import { generateAllTextures } from '../textures';

/** Generates all placeholder art in code, then opens the menu. */
export class Preload extends Phaser.Scene {
  constructor() {
    super(SCENES.preload);
  }

  create(): void {
    generateAllTextures(this);
    ensurePlayerAnimations(this.anims);
    this.scene.start(SCENES.menu);
  }
}
