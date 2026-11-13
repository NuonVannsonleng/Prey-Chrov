import Phaser from 'phaser';
import { CSS, FONTS, GAME_HEIGHT, GAME_WIDTH } from '../../config';
import { defaultRules, describeRules, seedFromText, type DifficultyData, type JourneyRules } from '../../systems/Rules';
import { oncePerKeyEvent } from '../../utils/keys';
import { Button } from '../components/Button';
import { ButtonList } from '../components/ButtonList';

export interface JourneySetup {
  rules: JourneyRules;
  /** null: a random world */
  seed: number | null;
}

/**
 * New journey setup (M17): world seed (random or typed), difficulty preset, opt-in challenge
 * modifiers and opt-in permadeath. The choices are written into the journey's save when it
 * starts and never change afterwards.
 */
export class NewJourneyPanel {
  private readonly root: Phaser.GameObjects.Container;
  private readonly seedBtn: Button;
  private readonly diffBtn: Button;
  private readonly modBtns: Array<{ id: string; button: Button }> = [];
  private readonly permaBtn: Button;
  private readonly start: Button;
  private readonly back: Button;
  private readonly info: Phaser.GameObjects.Text;
  private list: ButtonList | null = null;
  private rules: JourneyRules = defaultRules();
  private seedText = '';
  private typing = false;
  private readonly typeHandler = oncePerKeyEvent((e: KeyboardEvent) => this.onType(e));

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly data: DifficultyData,
    private readonly onStart: (setup: JourneySetup) => void,
    private readonly onClose: () => void,
  ) {
    const cx = GAME_WIDTH / 2;
    const top = 70;
    const backdrop = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x040a09, 0.92).setOrigin(0).setInteractive();
    const title = scene.add.text(cx, top, 'A new journey', { fontFamily: FONTS.ui, fontSize: '34px', fontStyle: '700', color: CSS.text }).setOrigin(0.5);
    const note = scene.add
      .text(cx, top + 36, 'These rules stay with the journey and its save. You can’t change them later.', { fontFamily: FONTS.ui, fontSize: '15px', color: CSS.textDim })
      .setOrigin(0.5);
    const children: Phaser.GameObjects.GameObject[] = [backdrop, title, note];
    this.seedBtn = new Button(scene, cx - 150, top + 96, { label: '', width: 400, height: 44, fontSize: 18, onActivate: () => this.beginTyping() });
    const reroll = new Button(scene, cx + 200, top + 96, { label: 'Random world', width: 260, height: 44, fontSize: 18, onActivate: () => this.setSeed('') });
    this.diffBtn = new Button(scene, cx, top + 152, { label: '', width: 660, height: 44, fontSize: 18, onActivate: () => this.cycleDifficulty() });
    children.push(this.seedBtn, reroll, this.diffBtn);
    this.info = scene.add.text(cx, top + 182, '', { fontFamily: FONTS.ui, fontSize: '15px', color: CSS.textDim, align: 'center', wordWrap: { width: 760 } }).setOrigin(0.5, 0);
    children.push(this.info);
    const mods = data.modifiers;
    const half = Math.ceil(mods.length / 2);
    mods.forEach((m, i) => {
      const col = i < half ? 0 : 1;
      const row = i < half ? i : i - half;
      const b = new Button(scene, cx - 170 + col * 340, top + 262 + row * 50, { label: '', width: 320, height: 42, fontSize: 16, onActivate: () => this.toggleModifier(m.id) });
      b.on('pointerover', () => this.info.setText(m.description));
      this.modBtns.push({ id: m.id, button: b });
      children.push(b);
    });
    const modsBottom = top + 262 + half * 50;
    this.permaBtn = new Button(scene, cx, modsBottom + 6, { label: '', width: 660, height: 42, fontSize: 16, onActivate: () => this.togglePermadeath() });
    this.start = new Button(scene, cx + 120, GAME_HEIGHT - 70, { label: 'Begin', width: 220, height: 46, onActivate: () => this.begin() });
    this.back = new Button(scene, cx - 120, GAME_HEIGHT - 70, { label: 'Back', width: 220, height: 46, onActivate: () => this.close() });
    children.push(reroll, this.permaBtn, this.start, this.back);
    this.root = scene.add.container(0, 0, children).setDepth(5000).setVisible(false);
    this.reroll = reroll;
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.input.keyboard?.off('keydown', this.typeHandler));
  }

  private readonly reroll: Button;

  get isOpen(): boolean {
    return this.root.visible;
  }

  get isTyping(): boolean {
    return this.typing;
  }

  /** Current choices (tests). */
  get setup(): JourneySetup {
    return { rules: { ...this.rules, modifiers: [...this.rules.modifiers] }, seed: seedFromText(this.seedText) };
  }

  open(): void {
    this.rules = defaultRules();
    this.rules.difficulty = this.data.default;
    this.seedText = '';
    this.root.setVisible(true);
    this.refresh();
    this.rebuildList();
  }

  /** Esc: stops typing a seed first, then closes. */
  close(): void {
    if (!this.root.visible) return;
    if (this.typing) {
      this.endTyping();
      return;
    }
    this.root.setVisible(false);
    this.list?.destroy();
    this.list = null;
    this.onClose();
  }

  /** Buttons by role (tests). */
  buttonFor(what: 'seed' | 'random' | 'difficulty' | 'permadeath' | 'begin' | string): Button | undefined {
    if (what === 'seed') return this.seedBtn;
    if (what === 'random') return this.reroll;
    if (what === 'difficulty') return this.diffBtn;
    if (what === 'permadeath') return this.permaBtn;
    if (what === 'begin') return this.start;
    return this.modBtns.find((m) => m.id === what)?.button;
  }

  setSeed(text: string): void {
    this.seedText = text.slice(0, 16);
    this.refresh();
  }

  private cycleDifficulty(): void {
    const ids = this.data.presets.map((p) => p.id);
    const i = ids.indexOf(this.rules.difficulty);
    this.rules.difficulty = ids[(i + 1) % ids.length] ?? 'survival';
    this.refresh();
  }

  private toggleModifier(id: string): void {
    const has = this.rules.modifiers.includes(id);
    this.rules.modifiers = has ? this.rules.modifiers.filter((m) => m !== id) : [...this.rules.modifiers, id];
    this.info.setText(this.data.modifiers.find((m) => m.id === id)?.description ?? '');
    this.refresh(false);
  }

  private togglePermadeath(): void {
    this.rules.permadeath = !this.rules.permadeath;
    this.info.setText(
      this.rules.permadeath
        ? 'Permadeath: when you fall, this journey and its save end for good. Set-piece retries still apply.'
        : 'Permadeath off: when you fall, you can load your last save.',
    );
    this.refresh(false);
  }

  private begin(): void {
    if (this.typing) this.endTyping();
    const setup = this.setup;
    this.root.setVisible(false);
    this.list?.destroy();
    this.list = null;
    this.onStart(setup);
  }

  private beginTyping(): void {
    this.typing = true;
    this.list?.destroy();
    this.list = null;
    this.refresh(false);
    this.scene.time.delayedCall(0, () => this.scene.input.keyboard?.on('keydown', this.typeHandler));
  }

  private onType(e: KeyboardEvent): void {
    if (!this.typing) return;
    e.preventDefault();
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Escape') {
      this.endTyping();
      return;
    }
    if (e.code === 'Backspace') this.setSeed(this.seedText.slice(0, -1));
    else if (e.key.length === 1 && /[A-Za-z0-9 _-]/.test(e.key)) this.setSeed(this.seedText + e.key);
    this.refresh(false);
  }

  private endTyping(): void {
    this.typing = false;
    this.scene.input.keyboard?.off('keydown', this.typeHandler);
    this.refresh(false);
    this.scene.time.delayedCall(0, () => this.rebuildList());
  }

  private refresh(describeDifficulty = true): void {
    const seed = seedFromText(this.seedText);
    this.seedBtn.setLabel(this.typing ? `Seed: ${this.seedText}▌  (Enter)` : seed === null ? 'World seed: random  (choose…)' : `World seed: ${this.seedText}`);
    const preset = this.data.presets.find((p) => p.id === this.rules.difficulty);
    this.diffBtn.setLabel(`Difficulty: ${preset?.name ?? this.rules.difficulty}`);
    if (describeDifficulty) this.info.setText(preset?.description ?? '');
    for (const { id, button } of this.modBtns) {
      const m = this.data.modifiers.find((x) => x.id === id);
      button.setLabel(`${this.rules.modifiers.includes(id) ? '☑' : '☐'}  ${m?.name ?? id}`);
    }
    this.permaBtn.setLabel(`Permadeath (opt-in):  ${this.rules.permadeath ? 'On — one life' : 'Off'}`);
    this.start.setLabel(`Begin · ${describeRules(this.rules, this.data).split(' · ')[0]}`);
  }

  private rebuildList(): void {
    if (!this.root.visible || this.typing) return;
    this.list?.destroy();
    this.list = new ButtonList(this.scene, [this.seedBtn, this.reroll, this.diffBtn, ...this.modBtns.map((m) => m.button), this.permaBtn, this.back, this.start]);
  }
}
