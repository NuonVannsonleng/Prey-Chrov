import Phaser from 'phaser';
import { CSS, FONTS, GAME_WIDTH } from '../../config';
import type { ClockTick, ObjectiveView, SurvivalTick } from '../../systems/GameEvents';

interface Bar {
  key: keyof Pick<SurvivalTick, 'health' | 'hunger' | 'thirst' | 'stamina'>;
  label: string;
  color: number;
  fill: Phaser.GameObjects.Rectangle;
  value: Phaser.GameObjects.Text;
  warn: Phaser.GameObjects.Text;
}

const BAR_W = 170;
const BAR_H = 12;

/**
 * Top-left survival bars (labelled + numeric, so not colour-only), top-centre clock and the
 * first-day objectives list. Text only changes when the shown value changes.
 */
export class StatusHud {
  private readonly bars: Bar[] = [];
  private readonly clockText: Phaser.GameObjects.Text;
  private readonly objectives: Phaser.GameObjects.Container;
  private readonly objectiveTitle: Phaser.GameObjects.Text;
  private readonly objectiveLines: Phaser.GameObjects.Text[] = [];
  private lastClock = '';
  private readonly lastValues = new Map<string, string>();

  constructor(scene: Phaser.Scene) {
    const x = 24;
    let y = 74;
    const specs: Array<Pick<Bar, 'key' | 'label' | 'color'>> = [
      { key: 'health', label: 'Health', color: 0xd9644a },
      { key: 'hunger', label: 'Food', color: 0xe6b866 },
      { key: 'thirst', label: 'Water', color: 0x4fc2b4 },
      { key: 'stamina', label: 'Stamina', color: 0x8ec26a },
    ];
    for (const s of specs) {
      scene.add.text(x, y - 2, s.label, { fontFamily: FONTS.ui, fontSize: '13px', fontStyle: '600', color: CSS.textDim });
      scene.add.rectangle(x + 64, y, BAR_W, BAR_H, 0x08110f, 0.85).setOrigin(0).setStrokeStyle(1, 0x3a5249);
      const fill = scene.add.rectangle(x + 65, y + 1, BAR_W - 2, BAR_H - 2, s.color).setOrigin(0);
      const value = scene.add.text(x + 64 + BAR_W + 8, y - 2, '', { fontFamily: FONTS.ui, fontSize: '13px', color: CSS.text });
      const warn = scene.add
        .text(x + 64 + BAR_W + 40, y - 2, '', { fontFamily: FONTS.ui, fontSize: '13px', fontStyle: '700', color: CSS.danger })
        .setVisible(false);
      this.bars.push({ ...s, fill, value, warn });
      y += 20;
    }

    this.clockText = scene.add
      .text(GAME_WIDTH / 2, 18, '', {
        fontFamily: FONTS.ui,
        fontSize: '17px',
        fontStyle: '700',
        color: CSS.text,
        backgroundColor: 'rgba(8,17,15,0.7)',
        padding: { left: 12, right: 12, top: 4, bottom: 4 },
      })
      .setOrigin(0.5, 0);

    this.objectives = scene.add.container(24, 168);
    this.objectiveTitle = scene.add.text(0, 0, 'First day', { fontFamily: FONTS.ui, fontSize: '14px', fontStyle: '700', color: CSS.gold });
    this.objectives.add(this.objectiveTitle);
  }

  updateSurvival(t: SurvivalTick): void {
    for (const b of this.bars) {
      const max = t[`max${b.key[0]?.toUpperCase()}${b.key.slice(1)}` as keyof SurvivalTick] as number;
      const v = t[b.key];
      const frac = max > 0 ? Math.max(0, Math.min(1, v / max)) : 0;
      b.fill.width = Math.max(0, (BAR_W - 2) * frac);
      const shown = String(Math.ceil(v));
      if (this.lastValues.get(b.key) !== shown) {
        this.lastValues.set(b.key, shown);
        b.value.setText(shown);
      }
      const warning =
        b.key === 'hunger' && t.hungry
          ? v <= 0
            ? 'STARVING'
            : 'Hungry'
          : b.key === 'thirst' && t.thirsty
            ? v <= 0
              ? 'DEHYDRATED'
              : 'Thirsty'
            : b.key === 'stamina' && t.exhausted
              ? 'Exhausted'
              : b.key === 'health' && frac < 0.25
                ? 'Low!'
                : '';
      if (b.warn.text !== warning) b.warn.setText(warning).setVisible(warning !== '');
    }
  }

  updateClock(c: ClockTick): void {
    const text = `Day ${c.day}  ·  ${c.label}  ·  ${c.phase}`;
    if (text === this.lastClock) return;
    this.lastClock = text;
    this.clockText.setText(text).setColor(c.darkness > 0.5 ? CSS.turquoise : CSS.text);
  }

  updateObjectives(list: readonly ObjectiveView[]): void {
    const scene = this.objectives.scene;
    const allDone = list.every((o) => o.done);
    list.forEach((o, i) => {
      let line = this.objectiveLines[i];
      if (!line) {
        line = scene.add.text(0, 20 + i * 18, '', { fontFamily: FONTS.ui, fontSize: '13px', color: CSS.text });
        this.objectiveLines.push(line);
        this.objectives.add(line);
      }
      line.setText(`${o.done ? '✓' : '○'}  ${o.text}`).setColor(o.done ? CSS.textDim : CSS.text).setAlpha(o.done ? 0.7 : 1);
    });
    if (allDone) {
      this.objectiveTitle.setText('First day — complete. Survive and explore.');
      scene.time.delayedCall(8000, () => this.objectives.setVisible(false));
    }
  }

  setObjectivesVisible(visible: boolean): void {
    this.objectives.setVisible(visible);
  }
}
