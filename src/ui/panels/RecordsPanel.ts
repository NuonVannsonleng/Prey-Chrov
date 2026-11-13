import Phaser from 'phaser';
import { CSS, FONTS, GAME_HEIGHT, GAME_WIDTH } from '../../config';
import { completion, loadRecords, type AchievementDef } from '../../systems/Records';
import { Button } from '../components/Button';
import { ButtonList } from '../components/ButtonList';

/**
 * Records (M17): achievements and completion, kept only in this browser (no accounts, nothing
 * sent anywhere). Hidden achievements read "???" until earned.
 */
export class RecordsPanel {
  private readonly root: Phaser.GameObjects.Container;
  private readonly back: Button;
  private readonly summary: Phaser.GameObjects.Text;
  private readonly rows: Phaser.GameObjects.Text[] = [];
  private list: ButtonList | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly defs: readonly AchievementDef[],
    private readonly onClose: () => void,
  ) {
    const cx = GAME_WIDTH / 2;
    const backdrop = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x040a09, 0.94).setOrigin(0).setInteractive();
    const title = scene.add.text(cx, 46, 'Records', { fontFamily: FONTS.ui, fontSize: '32px', fontStyle: '700', color: CSS.text }).setOrigin(0.5);
    this.summary = scene.add.text(cx, 82, '', { fontFamily: FONTS.ui, fontSize: '15px', color: CSS.gold, align: 'center' }).setOrigin(0.5, 0);
    const children: Phaser.GameObjects.GameObject[] = [backdrop, title, this.summary];
    const half = Math.ceil(defs.length / 2);
    defs.forEach((_, i) => {
      const col = i < half ? 0 : 1;
      const row = i < half ? i : i - half;
      const t = scene.add.text(cx - 600 + col * 610, 128 + row * 41, '', { fontFamily: FONTS.ui, fontSize: '14px', color: CSS.text, wordWrap: { width: 580 }, lineSpacing: 1 });
      this.rows.push(t);
      children.push(t);
    });
    this.back = new Button(scene, cx, GAME_HEIGHT - 40, { label: 'Back', width: 220, height: 42, fontSize: 18, onActivate: () => this.close() });
    children.push(this.back);
    this.root = scene.add.container(0, 0, children).setDepth(5000).setVisible(false);
  }

  get isOpen(): boolean {
    return this.root.visible;
  }

  open(): void {
    const r = loadRecords();
    const earned = this.defs.filter((a) => r.earned[a.id] !== undefined).length;
    const e = r.endings;
    this.summary.setText(
      `${earned} of ${this.defs.length} achievements · ${Math.round(completion(r, this.defs) * 100)}% complete\n` +
        `Journeys begun: ${r.journeys} · Endings — Story ${e.story ?? 0} · Survival ${e.survival ?? 0} · Hard ${e.hard ?? 0} · with permadeath ${e.permadeath ?? 0}`,
    );
    this.defs.forEach((a, i) => {
      const got = r.earned[a.id] !== undefined;
      const secret = a.hidden && !got;
      const count = a.count ?? 1;
      const have = Math.min(count, r.counters[a.event] ?? 0);
      const progress = !got && !secret && count > 1 && a.event !== 'skill_level' ? `  (${have}/${count})` : '';
      this.rows[i]
        ?.setText(`${got ? '★' : '☆'}  ${secret ? '???' : a.name}${progress}\n     ${secret ? 'A hidden achievement.' : a.description}`)
        .setColor(got ? CSS.gold : CSS.textDim);
    });
    this.root.setVisible(true);
    this.list?.destroy();
    this.list = new ButtonList(this.scene, [this.back]);
  }

  close(): void {
    if (!this.root.visible) return;
    this.root.setVisible(false);
    this.list?.destroy();
    this.list = null;
    this.onClose();
  }
}
