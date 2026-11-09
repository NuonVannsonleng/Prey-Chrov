import Phaser from 'phaser';
import { oncePerKeyEvent } from '../../utils/keys';
import type { Button } from './Button';

/**
 * Keyboard navigation for a list of buttons (Up/Down/Left/Right, WASD or Tab; Enter/Space).
 * Disabled buttons are skipped. Listeners are removed on scene shutdown.
 */
export class ButtonList {
  private index = -1;
  private readonly keyHandler = oncePerKeyEvent((e) => this.onKey(e));
  private readonly kb: Phaser.Input.Keyboard.KeyboardPlugin | null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly buttons: Button[],
  ) {
    this.kb = scene.input.keyboard;
    for (const b of buttons) {
      b.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.focus(this.buttons.indexOf(b)));
    }
    this.focus(this.buttons.findIndex((b) => b.enabled));
    if (!this.kb) return;
    this.kb.on('keydown', this.keyHandler);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  /** Removes key listeners; call when the buttons go away before the scene does. */
  destroy(): void {
    this.kb?.off('keydown', this.keyHandler);
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  private onKey(event: KeyboardEvent): void {
    // Held keys must not auto-activate a button (e.g. Space held through a skip).
    if (event.repeat) return;
    switch (event.code) {
      case 'ArrowUp':
      case 'ArrowLeft':
      case 'KeyW':
      case 'KeyA':
        this.move(-1);
        break;
      case 'ArrowDown':
      case 'ArrowRight':
      case 'KeyS':
      case 'KeyD':
      case 'Tab':
        event.preventDefault();
        this.move(event.shiftKey && event.code === 'Tab' ? -1 : 1);
        break;
      case 'Enter':
      case 'Space':
        this.buttons[this.index]?.activate();
        break;
    }
  }

  private move(dir: number): void {
    const n = this.buttons.length;
    for (let i = 1; i <= n; i++) {
      const next = (((this.index + dir * i) % n) + n) % n;
      if (this.buttons[next]?.enabled) {
        this.focus(next);
        return;
      }
    }
  }

  private focus(i: number): void {
    if (i < 0 || !this.buttons[i]?.enabled) return;
    this.index = i;
    this.buttons.forEach((b, j) => b.setFocused(j === i));
  }
}
