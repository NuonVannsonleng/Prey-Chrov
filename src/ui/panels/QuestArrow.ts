import Phaser from 'phaser';
import { CAMERA, CSS, FONTS, GAME_HEIGHT, GAME_WIDTH } from '../../config';
import { TEX } from '../../textures';

/**
 * Off-screen objective marker: an arrow on the screen edge pointing at the quest target,
 * with its name and rough distance. Hidden when the target is on screen or there is none.
 */
export class QuestArrow {
  private readonly arrow: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private target: { x: number; y: number; label: string } | null = null;

  constructor(scene: Phaser.Scene) {
    this.arrow = scene.add.image(0, 0, TEX.arrow).setVisible(false).setDepth(50);
    this.label = scene.add
      .text(0, 0, '', {
        fontFamily: FONTS.ui,
        fontSize: '12px',
        fontStyle: '600',
        color: CSS.gold,
        stroke: '#071210',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setVisible(false)
      .setDepth(50);
  }

  setTarget(t: { x: number; y: number; label: string } | null): void {
    this.target = t;
  }

  /** px/py: player world position (the camera keeps the player near screen centre). */
  update(px: number, py: number): void {
    const t = this.target;
    if (!t) return this.hide();
    const dx = (t.x - px) * CAMERA.zoom;
    const dy = (t.y - (py - 12)) * CAMERA.zoom;
    const halfW = GAME_WIDTH / 2 - 40;
    const halfH = GAME_HEIGHT / 2 - 50;
    if (Math.abs(dx) < halfW && Math.abs(dy) < halfH) return this.hide();
    const scale = Math.min(halfW / Math.abs(dx || 1), halfH / Math.abs(dy || 1));
    const ax = GAME_WIDTH / 2 + dx * scale;
    // Keep clear of the clock/forecast at the top and the hotbar at the bottom.
    const ay = Phaser.Math.Clamp(GAME_HEIGHT / 2 + dy * scale, 92, GAME_HEIGHT - 120);
    this.arrow.setPosition(ax, ay).setRotation(Math.atan2(dy, dx)).setVisible(true);
    const meters = Math.round(Math.hypot(t.x - px, t.y - py) / 32);
    this.label.setText(`${t.label} · ${meters} m`).setPosition(ax, ay + 14).setVisible(true);
  }

  setVisible(v: boolean): void {
    if (!v) this.hide();
  }

  private hide(): void {
    this.arrow.setVisible(false);
    this.label.setVisible(false);
  }
}
