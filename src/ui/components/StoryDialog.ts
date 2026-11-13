import Phaser from 'phaser';
import { CSS, FONTS, GAME_HEIGHT, GAME_WIDTH } from '../../config';
import { fontPx, keyText } from '../../systems/Settings';
import { Button } from './Button';
import { ButtonList } from './ButtonList';

export interface StoryOption {
  id: string;
  label: string;
  description: string;
  /** Disabled options stay visible with a reason (e.g. missing items). */
  enabled: boolean;
  note?: string;
}

/**
 * Story moment (M14): a titled passage of text and two or three options with descriptions.
 * It must be answered (Esc does nothing), so a story choice is never skipped by accident.
 */
export class StoryDialog {
  private readonly root: Phaser.GameObjects.Container;
  private readonly list: ButtonList;
  private done = false;

  constructor(
    scene: Phaser.Scene,
    title: string,
    body: string,
    options: StoryOption[],
    private readonly onPick: (id: string) => void,
  ) {
    const cx = GAME_WIDTH / 2;
    const w = 760;
    const optH = 74;
    const h = 210 + options.length * optH;
    const top = GAME_HEIGHT / 2 - h / 2;
    const backdrop = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x020605, 0.62).setOrigin(0).setInteractive();
    const panel = scene.add.graphics();
    panel.fillStyle(0x0c1916, 0.98).fillRoundedRect(cx - w / 2, top, w, h, 14);
    panel.lineStyle(2, 0xe6b866, 1).strokeRoundedRect(cx - w / 2, top, w, h, 14);
    const t = scene.add.text(cx, top + 22, title, { fontFamily: FONTS.ui, fontSize: '22px', fontStyle: '700', color: CSS.gold }).setOrigin(0.5, 0);
    const b = scene.add
      .text(cx, top + 62, keyText(body), { fontFamily: FONTS.ui, fontSize: fontPx(16), color: CSS.text, align: 'center', wordWrap: { width: w - 80 }, lineSpacing: 5 })
      .setOrigin(0.5, 0);
    const children: Phaser.GameObjects.GameObject[] = [backdrop, panel, t, b];
    const buttons: Button[] = [];
    options.forEach((o, i) => {
      const y = top + 190 + i * optH;
      const btn = new Button(scene, cx - w / 2 + 130, y, { label: o.label, width: 210, height: 46, fontSize: 18, enabled: o.enabled, onActivate: () => this.pick(o) });
      const desc = scene.add
        .text(cx - w / 2 + 255, y - 24, keyText(o.enabled ? o.description : `${o.description}\n${o.note ?? ''}`), {
          fontFamily: FONTS.ui,
          fontSize: fontPx(13),
          color: o.enabled ? CSS.text : CSS.textDim,
          wordWrap: { width: w - 290 },
          lineSpacing: 2,
        })
        .setOrigin(0, 0);
      buttons.push(btn);
      children.push(btn, desc);
    });
    this.root = scene.add.container(0, 0, children).setDepth(3000);
    this.list = new ButtonList(scene, buttons);
  }

  private pick(o: StoryOption): void {
    if (this.done || !o.enabled) return;
    this.done = true;
    this.list.destroy();
    this.root.destroy();
    this.onPick(o.id);
  }
}
