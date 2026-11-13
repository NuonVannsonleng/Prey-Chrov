import Phaser from 'phaser';
import { CSS, FONTS, GAME_WIDTH, GAME_HEIGHT } from '../../config';
import type { ToastTone } from '../../systems/GameEvents';
import { fontPx, getSettings } from '../../systems/Settings';
import { backing } from '../../config';

/** Single short message at the top centre; a new message replaces the current one. */
export class Toast {
  private readonly text: Phaser.GameObjects.Text;

  constructor(private readonly scene: Phaser.Scene) {
    this.text = scene.add
      .text(GAME_WIDTH / 2, 104, '', {
        fontFamily: FONTS.ui,
        fontSize: fontPx(17),
        fontStyle: '600',
        color: CSS.text,
        backgroundColor: backing(0.85, getSettings().highContrast),
        wordWrap: { width: GAME_WIDTH - 120 },
        align: 'center',
        padding: { left: 14, right: 14, top: 7, bottom: 7 },
      })
      .setOrigin(0.5)
      .setDepth(1000)
      .setAlpha(0);
  }

  /** Toasts move down above the hotbar while a panel covers the top of the screen. */
  setLow(low: boolean): void {
    this.text.setY(low ? GAME_HEIGHT - 150 : 104);
  }

  show(message: string, tone: ToastTone = 'info'): void {
    this.scene.tweens.killTweensOf(this.text);
    this.text.setText(tone === 'warn' ? `⚠ ${message}` : message).setColor(tone === 'warn' ? CSS.gold : CSS.text);
    this.text.setAlpha(1);
    this.scene.tweens.add({ targets: this.text, alpha: 0, delay: 1800, duration: 500 });
  }
}
