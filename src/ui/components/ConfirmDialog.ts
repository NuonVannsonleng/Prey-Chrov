import Phaser from 'phaser';
import { CSS, FONTS, GAME_HEIGHT, GAME_WIDTH } from '../../config';
import { Button } from './Button';
import { ButtonList } from './ButtonList';

/** Modal yes/no dialog. Destroys itself (and its key listeners) when answered. */
export class ConfirmDialog {
  private readonly root: Phaser.GameObjects.Container;
  private readonly list: ButtonList;
  private done = false;

  constructor(
    scene: Phaser.Scene,
    message: string,
    confirmLabel: string,
    private readonly onAnswer: (confirmed: boolean) => void,
    /** Above any panel that opened it (panels sit at 5000). */
    depth = 3000,
  ) {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const backdrop = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x020605, 0.55).setOrigin(0).setInteractive();
    const panel = scene.add.graphics();
    panel.fillStyle(0x0c1916, 0.98).fillRoundedRect(cx - 220, cy - 95, 440, 190, 12);
    panel.lineStyle(2, 0xe6b866, 1).strokeRoundedRect(cx - 220, cy - 95, 440, 190, 12);
    const text = scene.add
      .text(cx, cy - 45, message, { fontFamily: FONTS.ui, fontSize: '18px', color: CSS.text, align: 'center', wordWrap: { width: 380 } })
      .setOrigin(0.5);
    const yes = new Button(scene, cx - 100, cy + 45, { label: confirmLabel, width: 170, height: 48, onActivate: () => this.answer(true) });
    const no = new Button(scene, cx + 100, cy + 45, { label: 'Keep', width: 170, height: 48, onActivate: () => this.answer(false) });
    this.root = scene.add.container(0, 0, [backdrop, panel, text, yes, no]).setDepth(depth);
    this.list = new ButtonList(scene, [no, yes]);
  }

  /** Esc or programmatic cancel. */
  cancel(): void {
    this.answer(false);
  }

  private answer(confirmed: boolean): void {
    if (this.done) return;
    this.done = true;
    this.list.destroy();
    this.root.destroy();
    this.onAnswer(confirmed);
  }
}
