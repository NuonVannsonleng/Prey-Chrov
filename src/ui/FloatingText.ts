import Phaser from 'phaser';
import { DEPTH, FONTS } from '../config';

const POOL_SIZE = 14;

/** Pooled world-space rising text ("+3 Wood"). Reuses the oldest label when all are busy. */
export class FloatingText {
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private next = 0;

  constructor(private readonly scene: Phaser.Scene) {
    for (let i = 0; i < POOL_SIZE; i++) {
      this.labels.push(
        scene.add
          .text(0, 0, '', {
            fontFamily: FONTS.ui,
            fontSize: '9px',
            fontStyle: '700',
            color: '#ffffff',
            stroke: '#071210',
            strokeThickness: 3,
            resolution: 3,
          })
          .setOrigin(0.5, 1)
          .setDepth(DEPTH.floatingText)
          .setVisible(false),
      );
    }
  }

  show(x: number, y: number, text: string, color = '#e8e4d8'): void {
    const label = this.labels[this.next];
    if (!label) return;
    this.next = (this.next + 1) % this.labels.length;
    this.scene.tweens.killTweensOf(label);
    label.setText(text).setColor(color).setPosition(x, y).setAlpha(1).setVisible(true);
    this.scene.tweens.add({
      targets: label,
      y: y - 20,
      alpha: { from: 1, to: 0 },
      duration: 1000,
      ease: 'Cubic.easeOut',
      onComplete: () => label.setVisible(false),
    });
  }
}
