import Phaser from 'phaser';
import { CSS, FONTS, GAME_HEIGHT, GAME_WIDTH, SCENES } from '../config';
import { gameEvents, onSceneEvent, type PlayerTick } from '../systems/GameEvents';
import { TEX } from '../textures';

const HINTS = [
  ['WASD', 'Move'],
  ['Shift', 'Sprint'],
  ['Esc', 'Pause'],
  ['H', 'Hide hints'],
  ['F3', 'Debug view'],
] as const;

/** HUD overlay running in parallel with World. */
export class UI extends Phaser.Scene {
  private hints!: Phaser.GameObjects.Container;
  private sprintTag!: Phaser.GameObjects.Text;
  private debugText!: Phaser.GameObjects.Text;
  private debugOn = false;
  private lastDebugUpdate = 0;
  private lastTick: PlayerTick | null = null;

  constructor() {
    super(SCENES.ui);
  }

  create(): void {
    this.debugOn = false;
    this.lastTick = null;
    this.add.image(0, 0, TEX.vignette).setOrigin(0);

    this.add
      .text(24, 20, 'ព្រៃជ្រៅ', { fontFamily: FONTS.title, fontSize: '22px', color: CSS.gold, padding: { top: 10, bottom: 6 } })
      .setAlpha(0.9);
    this.add.text(24, 64, 'Test Grove', { fontFamily: FONTS.ui, fontSize: '15px', color: CSS.textDim });

    this.hints = this.buildHints();
    this.sprintTag = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 40, 'SPRINTING', {
        fontFamily: FONTS.ui,
        fontSize: '15px',
        fontStyle: '700',
        color: CSS.fire,
        backgroundColor: 'rgba(10,18,16,0.7)',
        padding: { left: 10, right: 10, top: 4, bottom: 4 },
      })
      .setOrigin(0.5)
      .setVisible(false);
    this.debugText = this.add
      .text(GAME_WIDTH - 20, 20, '', {
        fontFamily: 'Consolas, monospace',
        fontSize: '14px',
        color: CSS.turquoise,
        backgroundColor: 'rgba(5,10,9,0.7)',
        padding: { left: 8, right: 8, top: 6, bottom: 6 },
        align: 'right',
      })
      .setOrigin(1, 0)
      .setVisible(false);

    onSceneEvent(this, 'player:tick', (t) => {
      this.lastTick = t;
      this.sprintTag.setVisible(t.sprinting);
    });
    onSceneEvent(this, 'debug:toggle', (on) => {
      this.debugOn = on;
      this.debugText.setVisible(on);
    });

    const kb = this.input.keyboard;
    kb?.on('keydown-H', this.toggleHints, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => kb?.off('keydown-H', this.toggleHints, this));
  }

  override update(time: number): void {
    if (!this.debugOn || time - this.lastDebugUpdate < 200) return;
    this.lastDebugUpdate = time;
    const t = this.lastTick;
    const fps = this.game.loop.actualFps.toFixed(0);
    this.debugText.setText(
      t
        ? `FPS ${fps}\npos ${t.x.toFixed(0)}, ${t.y.toFixed(0)}\nspeed ${t.speed.toFixed(0)} px/s\nbus listeners ${gameEvents.listenerCount('player:tick')}`
        : `FPS ${fps}`,
    );
  }

  private buildHints(): Phaser.GameObjects.Container {
    const lineH = 24;
    const w = 210;
    const h = HINTS.length * lineH + 20;
    const c = this.add.container(20, GAME_HEIGHT - h - 20);
    const bg = this.add.graphics();
    bg.fillStyle(0x08110f, 0.72);
    bg.fillRoundedRect(0, 0, w, h, 8);
    bg.lineStyle(1, 0x3a5249, 0.8);
    bg.strokeRoundedRect(0, 0, w, h, 8);
    c.add(bg);
    HINTS.forEach(([key, action], i) => {
      const y = 10 + i * lineH;
      c.add(
        this.add.text(14, y, key, { fontFamily: FONTS.ui, fontSize: '15px', fontStyle: '700', color: CSS.gold }),
      );
      c.add(this.add.text(84, y, action, { fontFamily: FONTS.ui, fontSize: '15px', color: CSS.text }));
    });
    return c;
  }

  private toggleHints(): void {
    this.hints.setVisible(!this.hints.visible);
  }
}
