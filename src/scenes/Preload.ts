import Phaser from 'phaser';
import { CSS, SCENES } from '../config';
import { generateAllTextures } from '../art/generate';
import { getGameData } from '../data/gameData';
import { DataValidationError } from '../data/schema';
import { ensurePlayerAnimations } from '../entities/Player';

/** Validates game data, generates all placeholder art in code, then opens the menu. */
export class Preload extends Phaser.Scene {
  constructor() {
    super(SCENES.preload);
  }

  create(): void {
    try {
      getGameData();
    } catch (err) {
      this.showDataError(err);
      return;
    }
    generateAllTextures(this);
    ensurePlayerAnimations(this.anims);
    this.scene.start(SCENES.menu);
  }

  /** Bad JSON must never produce a blank screen: list the problems instead. */
  private showDataError(err: unknown): void {
    console.error(err);
    const lines = err instanceof DataValidationError ? err.problems.slice(0, 18) : [String(err)];
    this.add
      .text(40, 40, ['Game data failed validation:', '', ...lines.map((l) => `• ${l}`)].join('\n'), {
        fontFamily: 'Consolas, monospace',
        fontSize: '16px',
        color: CSS.danger,
        wordWrap: { width: 1200 },
        lineSpacing: 4,
      });
  }
}
