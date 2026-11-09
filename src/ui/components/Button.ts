import Phaser from 'phaser';
import { FONTS } from '../../config';
import { gameEvents } from '../../systems/GameEvents';

export interface ButtonOptions {
  label: string;
  width?: number;
  height?: number;
  enabled?: boolean;
  /** Label size in px (default 24). */
  fontSize?: number;
  onActivate: () => void;
}

const COLORS = {
  fill: 0x10221e,
  fillHover: 0x1b3a31,
  border: 0x4b6a5c,
  borderFocus: 0xe6b866,
  text: '#e8e4d8',
  textDisabled: '#5f6a63',
  fillDisabled: 0x0b1513,
  borderDisabled: 0x26332e,
};

/** Rounded menu button supporting hover, keyboard focus and a disabled state. */
export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private readonly btnW: number;
  private readonly btnH: number;
  private readonly onActivate: () => void;
  private hovered = false;
  private focused = false;
  private pressed = false;
  enabled: boolean;

  constructor(scene: Phaser.Scene, x: number, y: number, opts: ButtonOptions) {
    super(scene, x, y);
    this.btnW = opts.width ?? 300;
    this.btnH = opts.height ?? 56;
    this.enabled = opts.enabled ?? true;
    this.onActivate = opts.onActivate;

    this.bg = scene.add.graphics();
    this.text = scene.add
      .text(0, 0, opts.label, { fontFamily: FONTS.ui, fontSize: `${opts.fontSize ?? 24}px`, fontStyle: '600', color: COLORS.text })
      .setOrigin(0.5);
    this.add([this.bg, this.text]);
    this.setSize(this.btnW, this.btnH);
    this.setInteractive({ useHandCursor: true });

    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      this.hovered = true;
      this.redraw();
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
      this.hovered = false;
      this.pressed = false;
      this.redraw();
    });
    // Only a press that started on this button counts as a click.
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      this.pressed = true;
    });
    this.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
      const wasPressed = this.pressed;
      this.pressed = false;
      if (wasPressed) this.activate();
    });

    scene.add.existing(this);
    this.redraw();
  }

  setFocused(focused: boolean): this {
    this.focused = focused;
    this.redraw();
    return this;
  }

  activate(): void {
    if (!this.enabled) return;
    gameEvents.emit('sfx', 'ui');
    this.onActivate();
  }

  setLabel(label: string): this {
    this.text.setText(label);
    return this;
  }

  private redraw(): void {
    const active = this.enabled && (this.hovered || this.focused);
    const fill = !this.enabled ? COLORS.fillDisabled : active ? COLORS.fillHover : COLORS.fill;
    const border = !this.enabled ? COLORS.borderDisabled : this.focused ? COLORS.borderFocus : COLORS.border;
    this.bg.clear();
    this.bg.fillStyle(fill, 0.92);
    this.bg.fillRoundedRect(-this.btnW / 2, -this.btnH / 2, this.btnW, this.btnH, 10);
    this.bg.lineStyle(this.focused && this.enabled ? 2 : 1.5, border, 1);
    this.bg.strokeRoundedRect(-this.btnW / 2, -this.btnH / 2, this.btnW, this.btnH, 10);
    this.text.setColor(this.enabled ? COLORS.text : COLORS.textDisabled);
    if (this.input) this.input.cursor = this.enabled ? 'pointer' : 'not-allowed';
  }
}
