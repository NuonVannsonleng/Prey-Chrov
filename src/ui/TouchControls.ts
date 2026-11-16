import type { Action } from '../systems/Settings';
import { getSettings } from '../systems/Settings';
import { isHeld, pressKey, releaseKey, setAimMode, setMoveKeys, setTouchActive, tapKey, type InputState } from '../systems/VirtualInput';

type Cmd = Action | 'pause';

/** Keeps a finger's moves on the control it started on (best effort: some pointers can't be captured). */
function capture(el: HTMLElement, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    /* not capturable: moves still arrive while the finger stays on the control */
  }
}
const STICK_DEAD_ZONE = 0.25;
/** Pushing the stick this far out also sprints. */
const SPRINT_AT = 0.92;

/**
 * M19: on-screen controls for touch screens, drawn as HTML above the game so several fingers work
 * at once and sizes stay finger-friendly at any canvas scale. They press the player's bound keys
 * (see VirtualInput), so everything else in the game is unchanged. Shown while playing; a Close
 * button replaces them while a world panel is open; a hint asks for landscape on tall screens.
 */
export class TouchControls {
  private readonly root: HTMLDivElement;
  private readonly close: HTMLButtonElement;
  private readonly rotate: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly stick: HTMLDivElement;
  private readonly crouchBtn: HTMLButtonElement;
  private stickPointer = -1;
  private touchSeen = false;
  private shown: 'none' | 'play' | 'panel' = 'none';

  constructor() {
    const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] => {
      const el = document.createElement(tag);
      el.className = cls;
      if (text) el.textContent = text;
      return el;
    };
    this.root = mk('div', 'touch-ui');
    this.root.id = 'touch';
    this.stick = mk('div', 'touch-stick');
    this.stick.setAttribute('aria-label', 'Move');
    this.knob = mk('div', 'touch-knob');
    this.stick.append(this.knob);

    const actions = mk('div', 'touch-actions');
    const act = this.button('Act', 'interact', 'hold', 'touch-big');
    act.setAttribute('aria-label', 'Gather, drink or use (hold)');
    this.crouchBtn = this.button('Crouch', 'crouch', 'toggle');
    actions.append(act, this.button('Attack', 'attack', 'tap'), this.button('Use', 'use', 'tap'), this.crouchBtn);

    const top = mk('div', 'touch-top');
    top.append(
      this.button('Bag', 'inventory', 'tap'),
      this.button('Craft', 'crafting', 'tap'),
      this.button('Map', 'map', 'tap'),
      this.button('Journal', 'journal', 'tap'),
      this.button('Self', 'character', 'tap'),
      this.button('Pause', 'pause', 'tap'),
    );
    this.root.append(this.stick, actions, top);

    this.close = mk('button', 'touch-close', 'Close ✕');
    this.close.type = 'button';
    this.close.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      tapKey('Escape');
    });
    this.rotate = mk('div', 'touch-rotate', 'Turn your device sideways for a bigger view');
    this.rotate.setAttribute('role', 'status');
    for (const el of [this.root, this.close, this.rotate]) el.style.display = 'none';
    document.body.append(this.root, this.close, this.rotate);

    this.stick.addEventListener('pointerdown', this.onStickDown);
    this.stick.addEventListener('pointermove', this.onStickMove);
    this.stick.addEventListener('pointerup', this.onStickUp);
    this.stick.addEventListener('pointercancel', this.onStickUp);
    this.stick.addEventListener('lostpointercapture', this.onStickUp);
    window.addEventListener('pointerdown', this.onAnyPointer, { capture: true, passive: true });
    window.addEventListener('touchstart', this.onAnyTouch, { capture: true, passive: true });
    // Long-press menus and double-tap zoom get in the way of play.
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Touch controls are on: by setting, or "Auto" once the screen has been touched. */
  get active(): boolean {
    const mode = getSettings().touchControls;
    return mode === 'on' || (mode === 'auto' && this.touchSeen);
  }

  /** Called every frame with where the game is. */
  sync(state: InputState): void {
    const on = this.active;
    setTouchActive(on);
    const want: typeof this.shown = !on ? 'none' : state === 'play' ? 'play' : state === 'panel' ? 'panel' : 'none';
    if (want !== this.shown) {
      if (this.shown === 'play') this.letGo();
      this.shown = want;
      this.root.style.display = want === 'play' ? 'block' : 'none';
      this.close.style.display = want === 'panel' ? 'block' : 'none';
    }
    const tall = on && window.innerHeight > window.innerWidth * 1.1;
    this.rotate.style.display = tall ? 'block' : 'none';
  }

  /** Releases everything the overlay holds (the stick, a held Act, crouch). */
  letGo(): void {
    this.stickPointer = -1;
    this.knob.style.transform = '';
    const k = getSettings().keys;
    setMoveKeys(k, 0, 0, 1);
    releaseKey(k.sprint);
    releaseKey(k.interact);
    releaseKey(k.crouch);
    this.crouchBtn.classList.remove('on');
  }

  private button(label: string, cmd: Cmd, kind: 'tap' | 'hold' | 'toggle', extra = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `touch-btn ${extra}`.trim();
    b.textContent = label;
    b.dataset['cmd'] = cmd;
    const code = () => (cmd === 'pause' ? 'Escape' : getSettings().keys[cmd]);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      setAimMode('virtual');
      if (kind === 'tap') tapKey(code());
      else if (kind === 'hold') {
        capture(b, e.pointerId);
        b.classList.add('on');
        pressKey(code());
      } else {
        const c = code();
        if (isHeld(c)) releaseKey(c);
        else pressKey(c);
        b.classList.toggle('on', isHeld(c));
      }
    });
    if (kind === 'hold') {
      const up = () => {
        b.classList.remove('on');
        releaseKey(code());
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('lostpointercapture', up);
    }
    return b;
  }

  private readonly onAnyPointer = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') this.touchSeen = true;
  };

  private readonly onAnyTouch = (): void => {
    this.touchSeen = true;
  };

  private readonly onStickDown = (e: PointerEvent): void => {
    e.preventDefault();
    if (this.stickPointer >= 0) return;
    this.stickPointer = e.pointerId;
    capture(this.stick, e.pointerId);
    setAimMode('virtual');
    this.onStickMove(e);
  };

  private readonly onStickMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.stickPointer) return;
    const r = this.stick.getBoundingClientRect();
    const radius = r.width / 2;
    let x = (e.clientX - (r.left + radius)) / radius;
    let y = (e.clientY - (r.top + radius)) / radius;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    this.knob.style.transform = `translate(${Math.round(x * radius * 0.6)}px, ${Math.round(y * radius * 0.6)}px)`;
    const k = getSettings().keys;
    setMoveKeys(k, x, y, STICK_DEAD_ZONE);
    if (Math.min(m, 1) >= SPRINT_AT) pressKey(k.sprint);
    else releaseKey(k.sprint);
  };

  private readonly onStickUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.stickPointer) return;
    this.stickPointer = -1;
    this.knob.style.transform = '';
    const k = getSettings().keys;
    setMoveKeys(k, 0, 0, 1);
    releaseKey(k.sprint);
  };
}
