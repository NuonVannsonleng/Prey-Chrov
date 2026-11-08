import Phaser from 'phaser';
import { CSS, FONTS, GAME_HEIGHT, GAME_WIDTH, SCENES } from '../config';
import { Button } from '../ui/components/Button';
import { ButtonList } from '../ui/components/ButtonList';
import { oncePerKeyEvent } from '../utils/keys';

/** Ignore the Esc press that opened the menu (same physical key event). */
const ESC_GUARD_MS = 150;

export class Pause extends Phaser.Scene {
  private openedAt = 0;
  private leaving = false;
  private readonly escHandler = oncePerKeyEvent(() => this.onEsc());

  constructor() {
    super(SCENES.pause);
  }

  create(): void {
    this.openedAt = performance.now();
    this.leaving = false;
    const cx = GAME_WIDTH / 2;

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x040a09, 0.72).setOrigin(0).setInteractive();
    this.add
      .text(cx, 200, 'Paused', { fontFamily: FONTS.ui, fontSize: '48px', fontStyle: '700', color: CSS.text })
      .setOrigin(0.5);
    this.add
      .text(cx, 250, 'The forest waits.', { fontFamily: FONTS.ui, fontSize: '18px', color: CSS.textDim })
      .setOrigin(0.5);

    const resume = new Button(this, cx, 330, { label: 'Resume', onActivate: () => this.resume() });
    const menu = new Button(this, cx, 400, { label: 'Main Menu', onActivate: () => this.toMenu() });
    new ButtonList(this, [resume, menu]);

    this.add
      .text(cx, 480, 'WASD move   ·   Shift sprint   ·   Esc resume   ·   F3 debug', {
        fontFamily: FONTS.ui,
        fontSize: '16px',
        color: CSS.textDim,
      })
      .setOrigin(0.5);

    const kb = this.input.keyboard;
    kb?.on('keydown-ESC', this.escHandler);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => kb?.off('keydown-ESC', this.escHandler));
  }

  private onEsc(): void {
    if (performance.now() - this.openedAt < ESC_GUARD_MS) return;
    this.resume();
  }

  private resume(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.resume(SCENES.ui);
    this.scene.resume(SCENES.world);
    this.scene.stop();
  }

  private toMenu(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.stop(SCENES.ui);
    this.scene.stop(SCENES.world);
    this.scene.start(SCENES.menu);
  }
}
