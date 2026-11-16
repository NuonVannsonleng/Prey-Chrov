/**
 * M19: controllers and touch drive the game through the same paths as the keyboard and mouse.
 * Instead of a second input system, they send the player's *bound* keys (so rebinding, hints,
 * held-key tracking and every panel keep working) and real mouse events at a cursor (so panels,
 * dragging and buttons work unchanged).
 */

/** Legacy keyCodes Phaser needs for its key objects and `keydown-X` events. */
const KEY_CODES: Record<string, number> = {
  Space: 32,
  Enter: 13,
  Escape: 27,
  Tab: 9,
  ShiftLeft: 16,
  ShiftRight: 16,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Backquote: 192,
  Minus: 189,
  Equal: 187,
  BracketLeft: 219,
  BracketRight: 221,
  Semicolon: 186,
  Quote: 222,
  Comma: 188,
  Period: 190,
  Slash: 191,
  Backslash: 220,
};

export function keyCodeOf(code: string): number {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter?.[1]) return letter[1].charCodeAt(0);
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit?.[1]) return 48 + Number(digit[1]);
  return KEY_CODES[code] ?? 0;
}

function keyOf(code: string): string {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter?.[1]) return letter[1].toLowerCase();
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit?.[1]) return digit[1];
  if (code === 'Space') return ' ';
  if (code.startsWith('Shift')) return 'Shift';
  return code;
}

/**
 * Where the game is: playing (moving in the world), a world panel open, a story choice waiting,
 * or any other screen (menus, pause, game over, ending).
 */
export type InputState = 'play' | 'panel' | 'story' | 'screen';

type StateProvider = () => InputState;
let provider: StateProvider | null = null;

/** The World scene registers how to tell whether the player is in control; it clears it on shutdown. */
export function setInputStateProvider(p: StateProvider | null): void {
  provider = p;
}

export function inputState(): InputState {
  try {
    return provider ? provider() : 'screen';
  } catch {
    return 'screen';
  }
}

const held = new Set<string>();

/** True while the on-screen touch controls are in use (keyboard hints are hidden then). */
let touchOn = false;
const touchListeners = new Set<(on: boolean) => void>();
export function touchActive(): boolean {
  return touchOn;
}
export function setTouchActive(on: boolean): void {
  if (on === touchOn) return;
  touchOn = on;
  for (const l of touchListeners) l(on);
}
/** Returns an unsubscribe function. */
export function onTouchActive(l: (on: boolean) => void): () => void {
  touchListeners.add(l);
  return () => touchListeners.delete(l);
}

function send(type: 'keydown' | 'keyup', code: string, shift = false): void {
  if (typeof window === 'undefined') return;
  const ev = new KeyboardEvent(type, { code, key: keyOf(code), shiftKey: shift, bubbles: true, cancelable: true });
  const kc = keyCodeOf(code);
  // Not every browser accepts keyCode in the init dictionary.
  Object.defineProperty(ev, 'keyCode', { get: () => kc });
  Object.defineProperty(ev, 'which', { get: () => kc });
  window.dispatchEvent(ev);
}

/** Holds a key down (no repeats) until released. */
export function pressKey(code: string): void {
  if (!code || held.has(code)) return;
  held.add(code);
  send('keydown', code);
}

export function releaseKey(code: string): void {
  if (!held.delete(code)) return;
  send('keyup', code);
}

/** A single press and release. */
export function tapKey(code: string, shift = false): void {
  if (!code) return;
  if (held.has(code)) releaseKey(code);
  send('keydown', code, shift);
  send('keyup', code, shift);
}

/** Lets go of everything this module is holding (mode changes, pad unplugged, page hidden). */
export function releaseAllKeys(): void {
  for (const code of [...held]) releaseKey(code);
}

export function isHeld(code: string): boolean {
  return held.has(code);
}

/** Moves the held movement keys to match a direction (8-way). x/y in -1..1; inside the dead zone nothing is held. */
export function setMoveKeys(codes: { up: string; down: string; left: string; right: string }, x: number, y: number, deadZone: number): void {
  const mag = Math.hypot(x, y);
  let up = false;
  let down = false;
  let left = false;
  let right = false;
  if (mag > deadZone) {
    // 8 sectors of 45°: a diagonal only when the stick is clearly between two directions.
    const a = Math.atan2(y, x);
    const sector = Math.round(a / (Math.PI / 4));
    right = sector === 0 || sector === 1 || sector === -1;
    down = sector === 1 || sector === 2 || sector === 3;
    left = sector === 3 || sector === 4 || sector === -4 || sector === -3;
    up = sector === -1 || sector === -2 || sector === -3;
  }
  const want: Array<[string, boolean]> = [
    [codes.up, up],
    [codes.down, down],
    [codes.left, left],
    [codes.right, right],
  ];
  for (const [code, on] of want) {
    if (on) pressKey(code);
    else releaseKey(code);
  }
}

/**
 * How the player last aimed: with a real mouse, or with a pad / touch (then placement ghosts sit
 * in front of the player instead of following a pointer that isn't there).
 */
let aim: 'mouse' | 'virtual' = 'mouse';
export function aimMode(): 'mouse' | 'virtual' {
  return aim;
}
export function setAimMode(mode: 'mouse' | 'virtual'): void {
  aim = mode;
}

// ---------- Mouse at a virtual cursor ----------

function canvas(): HTMLCanvasElement | null {
  return typeof document === 'undefined' ? null : document.querySelector('#game canvas');
}

function mouse(type: 'mousemove' | 'mousedown' | 'mouseup', x: number, y: number, down: boolean): void {
  const c = canvas();
  if (!c) return;
  c.dispatchEvent(
    new MouseEvent(type, { clientX: x, clientY: y, screenX: x, screenY: y, button: 0, buttons: down ? 1 : 0, bubbles: true, cancelable: true, view: window }),
  );
}

/**
 * A gamepad-driven mouse cursor for panels and menus: moves, hovers, clicks and drags with real
 * mouse events on the game canvas. Drawn as a small DOM ring above the game.
 */
export class PadCursor {
  private el: HTMLDivElement | null = null;
  private x = -1;
  private y = -1;
  private down = false;
  visible = false;

  private ensure(): HTMLDivElement | null {
    if (this.el || typeof document === 'undefined') return this.el;
    const el = document.createElement('div');
    el.id = 'pad-cursor';
    el.setAttribute('aria-hidden', 'true');
    document.body.append(el);
    this.el = el;
    return el;
  }

  /** Moves by (dx, dy) CSS pixels, kept inside the game canvas. */
  move(dx: number, dy: number): void {
    const c = canvas();
    const el = this.ensure();
    if (!c || !el) return;
    const r = c.getBoundingClientRect();
    if (this.x < 0 || !this.visible) {
      if (this.x < 0) {
        this.x = r.left + r.width / 2;
        this.y = r.top + r.height / 2;
      }
      this.visible = true;
      el.style.display = 'block';
    }
    this.x = Math.max(r.left + 2, Math.min(r.right - 2, this.x + dx));
    this.y = Math.max(r.top + 2, Math.min(r.bottom - 2, this.y + dy));
    el.style.transform = `translate(${Math.round(this.x)}px, ${Math.round(this.y)}px)`;
    mouse('mousemove', this.x, this.y, this.down);
  }

  press(): void {
    if (!this.visible || this.down) return;
    this.down = true;
    this.el?.classList.add('down');
    mouse('mousedown', this.x, this.y, true);
  }

  release(): void {
    if (!this.down) return;
    this.down = false;
    this.el?.classList.remove('down');
    mouse('mouseup', this.x, this.y, false);
  }

  get pressed(): boolean {
    return this.down;
  }

  hide(): void {
    this.release();
    this.visible = false;
    if (this.el) this.el.style.display = 'none';
  }

  /** Position in CSS pixels (tests). */
  get position(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }
}
