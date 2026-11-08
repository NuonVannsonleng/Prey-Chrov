import Phaser from 'phaser';
import type { Button } from './Button';

/**
 * Keyboard navigation for a vertical list of buttons (Up/Down or W/S, Enter/Space).
 * Disabled buttons are skipped. Listeners are removed on scene shutdown.
 */
export class ButtonList {
  private index = -1;

  constructor(
    scene: Phaser.Scene,
    private readonly buttons: Button[],
  ) {
    const kb = scene.input.keyboard;
    if (!kb) return;
    kb.on('keydown', this.onKey, this);
    for (const b of buttons) {
      b.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.focus(this.buttons.indexOf(b)));
    }
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => kb.off('keydown', this.onKey, this));
    this.focus(this.buttons.findIndex((b) => b.enabled));
  }

  private onKey(event: KeyboardEvent): void {
    switch (event.code) {
      case 'ArrowUp':
      case 'KeyW':
        this.move(-1);
        break;
      case 'ArrowDown':
      case 'KeyS':
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
