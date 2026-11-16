import Phaser from 'phaser';
import { CURSOR_SPEED, PLAY_HOLD, STICK_DEAD_ZONE, readPad, snapshotOf, type PadSnapshot } from './Gamepad';
import { gameEvents } from './GameEvents';
import { getSettings } from './Settings';
import { PadCursor, inputState, pressKey, releaseAllKeys, releaseKey, setAimMode, setMoveKeys, tapKey, type InputState } from './VirtualInput';
import { TouchControls } from '../ui/TouchControls';

/**
 * M19: polls controllers once per game step and drives the touch overlay. Both only ever press
 * the player's bound keys or move a mouse cursor (see VirtualInput), so no scene needs to know
 * which device is in use.
 */
export class InputDevices {
  private prev: PadSnapshot | null = null;
  private padIndex = -1;
  private readonly blocked = new Set<number>();
  private lastState: InputState = 'screen';
  private readonly cursor = new PadCursor();
  private readonly touch: TouchControls | null;
  private padHolding = false;

  constructor(game: Phaser.Game) {
    this.touch = typeof document !== 'undefined' ? new TouchControls() : null;
    game.events.on(Phaser.Core.Events.PRE_STEP, this.step, this);
    window.addEventListener('gamepadconnected', this.onConnect);
    window.addEventListener('gamepaddisconnected', this.onDisconnect);
    window.addEventListener('blur', this.onBlur);
    // A real mouse takes aiming back from the pad / touch.
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
  }

  private readonly onConnect = (e: GamepadEvent): void => {
    if (this.padIndex < 0) this.padIndex = e.gamepad.index;
    gameEvents.emit('toast', { text: 'Controller connected — layout in Settings › Controller & touch', tone: 'info' });
  };

  private readonly onDisconnect = (e: GamepadEvent): void => {
    if (e.gamepad.index !== this.padIndex) return;
    this.padIndex = -1;
    this.dropPad();
    gameEvents.emit('toast', { text: 'Controller disconnected', tone: 'warn' });
  };

  private readonly onBlur = (): void => {
    releaseAllKeys();
    this.cursor.release();
    this.prev = null;
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (e.isTrusted && e.pointerType === 'mouse') setAimMode('mouse');
  };

  /** Lets go of everything the pad holds. */
  private dropPad(): void {
    if (this.padHolding) {
      const k = getSettings().keys;
      setMoveKeys(k, 0, 0, 1);
      for (const [, a] of PLAY_HOLD) releaseKey(k[a]);
      this.padHolding = false;
    }
    this.cursor.hide();
    this.prev = null;
  }

  private readPad(): Gamepad | null {
    const pads = typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    if (this.padIndex >= 0) {
      const p = pads[this.padIndex];
      if (p?.connected) return p;
    }
    for (const p of pads) {
      if (p?.connected) {
        this.padIndex = p.index;
        return p;
      }
    }
    return null;
  }

  private step(_time: number, delta: number): void {
    const state = inputState();
    const changed = state !== this.lastState;
    if (changed) {
      // Nothing held in one mode may carry into the next (a key held into a panel, a drag into play).
      releaseAllKeys();
      this.padHolding = false;
      this.cursor.release();
      if (state === 'play') this.cursor.hide();
      this.lastState = state;
    }
    this.touch?.sync(state);
    const pad = this.readPad();
    if (!pad) {
      if (this.prev) this.dropPad();
      return;
    }
    const snap = snapshotOf(pad);
    if (changed) snap.buttons.forEach((b, i) => b && this.blocked.add(i));
    const f = readPad(snap, this.prev, state, this.blocked);
    this.prev = snap;
    const k = getSettings().keys;
    if (state === 'play') {
      const moving = Math.hypot(f.move.x, f.move.y) > STICK_DEAD_ZONE;
      if (moving || f.hold.size > 0 || f.taps.length > 0) setAimMode('virtual');
      // Only steer the move keys while the pad is (or was just) steering, so touch / keyboard keep theirs.
      if (moving || this.padHolding) setMoveKeys(k, f.move.x, f.move.y, STICK_DEAD_ZONE);
      for (const [, a] of PLAY_HOLD) {
        if (f.hold.has(a)) pressKey(k[a]);
        else if (this.padHolding) releaseKey(k[a]);
      }
      this.padHolding = moving || f.hold.size > 0;
      for (const t of f.taps) {
        if (t === 'pause') tapKey('Escape');
        else if (t === 'prev' || t === 'next') gameEvents.emit('hotbar:cycle', t === 'prev' ? -1 : 1);
        else tapKey(k[t]);
      }
      return;
    }
    if (f.cursor.x !== 0 || f.cursor.y !== 0) {
      const s = (CURSOR_SPEED * Math.min(delta, 50)) / 1000;
      // Gentle near the centre, quick at full tilt.
      const m = Math.hypot(f.cursor.x, f.cursor.y);
      this.cursor.move(f.cursor.x * s * m, f.cursor.y * s * m);
    }
    for (const mk of f.menuKeys) {
      if (mk.code.startsWith('Arrow')) this.cursor.hide();
      tapKey(mk.code, mk.shift);
    }
    if (f.select === 'press') {
      if (this.cursor.visible) this.cursor.press();
      else tapKey('Enter');
    } else if (f.select === 'release') this.cursor.release();
  }
}
