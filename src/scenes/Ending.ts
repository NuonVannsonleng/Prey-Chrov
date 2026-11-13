import Phaser from 'phaser';
import { APP_VERSION, CSS, FONTS, GAME_HEIGHT, GAME_WIDTH, SCENES } from '../config';
import { getGameData } from '../data/gameData';
import { TEX } from '../textures';
import { Button } from '../ui/components/Button';
import { ButtonList } from '../ui/components/ButtonList';
import { oncePerKeyEvent } from '../utils/keys';

export interface EndingData {
  day: number;
  kills: number;
  crafted: number;
  built: number;
  gathered: number;
  tablets: number;
  /** Whether the post-offering save succeeded (Continue needs it). */
  saved: boolean;
  /** M14: epilogue lines added by side-story choices. */
  storyLines?: string[];
}

const LINE_MS = 3600;

/**
 * The first complete ending: epilogue lines one by one (Space/Enter/click to advance), then a
 * summary of the journey, credits with the fiction disclaimer, and the choice to keep surviving.
 */
export class Ending extends Phaser.Scene {
  private lines: string[] = [];
  private index = -1;
  private text!: Phaser.GameObjects.Text;
  private nextAt = 0;
  private finished = false;
  private leaving = false;
  private stats!: EndingData;
  private readonly keyHandler = oncePerKeyEvent((e: KeyboardEvent) => {
    if (!this.finished && (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE')) this.advance();
  });

  constructor() {
    super(SCENES.ending);
  }

  create(data: EndingData): void {
    this.stats = data;
    // Side-story choices add their own lines before the final one.
    const base = [...getGameData().ending.epilogue];
    const last = base.pop();
    this.lines = [...base, ...(data.storyLines ?? []), ...(last ? [last] : [])];
    this.index = -1;
    this.finished = false;
    this.leaving = false;
    this.input.enabled = true;
    this.add.image(0, 0, TEX.menuBg).setOrigin(0).setAlpha(0.35);
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x040a09, 0.55).setOrigin(0);
    this.text = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
        fontFamily: FONTS.ui,
        fontSize: '26px',
        color: '#f1ede2',
        align: 'center',
        wordWrap: { width: 900 },
        lineSpacing: 10,
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 30, 'Space / click to continue', { fontFamily: FONTS.ui, fontSize: '13px', color: CSS.textDim })
      .setOrigin(0.5)
      .setName('hint');
    this.input.keyboard?.on('keydown', this.keyHandler);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onClick, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', this.keyHandler);
      this.input.off(Phaser.Input.Events.POINTER_UP, this.onClick, this);
    });
    this.cameras.main.fadeIn(1200, 4, 10, 9);
    this.time.delayedCall(900, () => this.advance());
  }

  override update(time: number): void {
    if (!this.finished && this.index >= 0 && time >= this.nextAt) this.advance();
  }

  private onClick(): void {
    if (!this.finished) this.advance();
  }

  private advance(): void {
    this.index++;
    this.nextAt = this.time.now + LINE_MS;
    this.tweens.killTweensOf(this.text);
    if (this.index >= this.lines.length) {
      this.showSummary();
      return;
    }
    this.text.setAlpha(0).setText(this.lines[this.index] ?? '');
    this.tweens.add({ targets: this.text, alpha: 1, duration: 900 });
  }

  private showSummary(): void {
    if (this.finished) return;
    this.finished = true;
    this.text.setVisible(false);
    this.children.getByName('hint')?.destroy();
    const cx = GAME_WIDTH / 2;
    const s = this.stats;
    const ending = getGameData().ending;
    this.add.text(cx, 70, 'ព្រៃជ្រៅ', { fontFamily: FONTS.title, fontSize: '54px', color: CSS.gold, padding: { top: 26, bottom: 14 } }).setOrigin(0.5);
    this.add.text(cx, 132, 'The promise is renewed', { fontFamily: FONTS.ui, fontSize: '24px', fontStyle: '700', color: CSS.text }).setOrigin(0.5);
    this.add
      .text(
        cx,
        215,
        [
          `Days survived: ${Math.max(0, s.day - 1)} (reached day ${s.day})`,
          `Stone tablets read: ${s.tablets}`,
          `Creatures faced down: ${s.kills}   ·   Things crafted: ${s.crafted}   ·   Structures built: ${s.built}   ·   Resources gathered: ${s.gathered}`,
          ...((this.registry.get('pendingAchievements') as string[] | undefined)?.length ? [`★ ${(this.registry.get('pendingAchievements') as string[]).join('  ·  ★ ')}`] : []),
        ].join('\n'),
        { fontFamily: FONTS.ui, fontSize: '16px', color: CSS.text, align: 'center', lineSpacing: 6 },
      )
      .setOrigin(0.5);
    this.add
      .text(cx, 360, [...ending.credits, `Version ${APP_VERSION}`].join('\n'), {
        fontFamily: FONTS.ui,
        fontSize: '14px',
        color: CSS.textDim,
        align: 'center',
        wordWrap: { width: 900 },
        lineSpacing: 6,
      })
      .setOrigin(0.5);
    // Buttons arrive after a beat so Space presses used to skip the epilogue can't pick one by accident.
    this.time.delayedCall(1400, () => {
      const buttons: Button[] = [];
      if (s.saved) {
        buttons.push(new Button(this, cx - 170, GAME_HEIGHT - 90, { label: 'Continue surviving', width: 300, onActivate: () => this.go(SCENES.world, { load: true }) }));
      } else {
        this.add
          .text(cx, GAME_HEIGHT - 150, 'Your journey could not be saved (browser storage is unavailable or full), so it cannot be continued.', { fontFamily: FONTS.ui, fontSize: '14px', color: '#d9644a' })
          .setOrigin(0.5);
      }
      buttons.push(new Button(this, s.saved ? cx + 170 : cx, GAME_HEIGHT - 90, { label: 'Main menu', width: 300, onActivate: () => this.go(SCENES.menu) }));
      for (const b of buttons) {
        b.setAlpha(0);
        this.tweens.add({ targets: b, alpha: 1, duration: 400 });
      }
      new ButtonList(this, buttons);
    });
  }

  private go(scene: string, data?: object): void {
    // Keyboard input stays live while input.enabled is false: guard against a second choice.
    if (this.leaving) return;
    this.leaving = true;
    this.input.enabled = false;
    this.cameras.main.fadeOut(500, 4, 10, 9);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(scene, data));
  }
}
