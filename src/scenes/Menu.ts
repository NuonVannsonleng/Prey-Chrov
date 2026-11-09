import Phaser from 'phaser';
import { CSS, FONTS, GAME_HEIGHT, GAME_WIDTH, SCENES } from '../config';
import { CAN_LOAD_SAVES, describeSaveStatus, inspectSave } from '../systems/Save';
import { TEX } from '../textures';
import { Button } from '../ui/components/Button';
import { ButtonList } from '../ui/components/ButtonList';
import { ConfirmDialog } from '../ui/components/ConfirmDialog';
import { SettingsPanel } from '../ui/panels/SettingsPanel';
import { oncePerKeyEvent } from '../utils/keys';
import { mulberry32, randRange } from '../utils/random';

export class Menu extends Phaser.Scene {
  private starting = false;
  private dialog: ConfirmDialog | null = null;
  private list: ButtonList | null = null;
  private settingsPanel: SettingsPanel | null = null;

  constructor() {
    super(SCENES.menu);
  }

  create(): void {
    this.starting = false;
    this.dialog = null;
    this.input.enabled = true;
    const cx = GAME_WIDTH / 2;
    this.add.image(0, 0, TEX.menuBg).setOrigin(0);
    this.spawnFireflies();
    this.add.image(0, 0, TEX.vignette).setOrigin(0).setAlpha(0.85);

    this.add
      .text(cx, 190, 'ព្រៃជ្រៅ', {
        fontFamily: FONTS.title,
        fontSize: '104px',
        color: CSS.gold,
        padding: { top: 40, bottom: 30, left: 20, right: 20 },
      })
      .setOrigin(0.5)
      .setShadow(0, 6, '#000000', 18, false, true);
    this.add
      .text(cx, 305, 'P R E Y   C H R O V', { fontFamily: FONTS.ui, fontSize: '30px', fontStyle: '600', color: CSS.text })
      .setOrigin(0.5);
    this.add
      .text(cx, 345, 'The Deep Forest', { fontFamily: FONTS.ui, fontSize: '20px', color: CSS.textDim })
      .setOrigin(0.5);

    const save = inspectSave();
    const canContinue = CAN_LOAD_SAVES && save.kind === 'valid';
    const play = new Button(this, cx, 430, {
      label: canContinue ? 'New journey' : 'Play',
      onActivate: () => (canContinue ? this.confirmNewJourney(save.kind === 'valid' ? save.day : 1) : this.startGame(false)),
    });
    const cont = new Button(this, cx, 500, { label: 'Continue', enabled: canContinue, onActivate: () => this.startGame(true) });
    const reason =
      save.kind === 'valid' && !CAN_LOAD_SAVES ? 'Loading saves is not available in this build yet.' : describeSaveStatus(save);
    this.add
      .text(cx, 536, canContinue ? reason : `Continue unavailable — ${reason}`, {
        fontFamily: FONTS.ui,
        fontSize: '16px',
        color: CSS.textDim,
      })
      .setOrigin(0.5);
    const settingsBtn = new Button(this, cx, 570, { label: 'Settings', width: 220, height: 40, onActivate: () => this.openSettings() });
    const order = canContinue ? [cont, play, settingsBtn] : [play, cont, settingsBtn];
    this.list = new ButtonList(this, order);
    this.settingsPanel = new SettingsPanel(this, () => {
      this.list = new ButtonList(this, order);
    });
    const esc = oncePerKeyEvent((e: KeyboardEvent) => {
      if (e.code === 'Escape' && this.settingsPanel?.isOpen) this.settingsPanel.close();
    });
    this.input.keyboard?.on('keydown', esc);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', esc));

    this.add
      .text(cx, GAME_HEIGHT - 34, '↑/↓ to choose · Enter to select    ·    Prototype build — all art is generated placeholder', {
        fontFamily: FONTS.ui,
        fontSize: '14px',
        color: CSS.textDim,
      })
      .setOrigin(0.5)
      .setAlpha(0.8);

    this.cameras.main.fadeIn(400, 4, 10, 9);
  }

  /** A new journey doesn't delete the save; it is only replaced the next time the player sleeps. */
  private confirmNewJourney(day: number): void {
    if (this.dialog) return;
    this.list?.destroy();
    this.dialog = new ConfirmDialog(
      this,
      `Start a new journey?\nYour saved journey (day ${day}) stays until you next sleep in a shelter.`,
      'Start new',
      (ok) => {
        this.dialog = null;
        if (ok) this.startGame(false);
        else this.scene.restart();
      },
    );
  }

  private openSettings(): void {
    this.list?.destroy();
    this.list = null;
    this.settingsPanel?.open();
  }

  private startGame(load: boolean): void {
    if (this.starting) return;
    this.starting = true;
    this.input.enabled = false;
    this.cameras.main.fadeOut(300, 4, 10, 9);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(SCENES.world, { load }));
  }

  private spawnFireflies(): void {
    const rng = mulberry32(99);
    for (let i = 0; i < 22; i++) {
      const fly = this.add
        .image(randRange(rng, 40, GAME_WIDTH - 40), randRange(rng, 380, GAME_HEIGHT - 40), TEX.glow)
        .setTint(0x9ff0d8)
        .setScale(randRange(rng, 0.35, 0.7))
        .setAlpha(0)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: fly,
        alpha: { from: 0, to: randRange(rng, 0.5, 0.95) },
        x: fly.x + randRange(rng, -40, 40),
        y: fly.y + randRange(rng, -30, 20),
        duration: randRange(rng, 1800, 3600),
        delay: randRange(rng, 0, 2500),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }
}
