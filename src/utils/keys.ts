/** A held action key: true while its physical key is down. */
export interface HeldKey {
  readonly isDown: boolean;
}

/** Both Shift keys count as one (players expect either to sprint). */
const normalise = (code: string) => (code === 'ShiftRight' ? 'ShiftLeft' : code);

/**
 * Held-key state by KeyboardEvent.code — the physical key position, the same thing the bindings
 * store — so movement and the HUD agree on every keyboard layout and browser. Cleared on blur
 * and when play resumes so nothing sticks.
 */
export class HeldKeys {
  private readonly down = new Set<string>();
  private readonly onDown = (e: KeyboardEvent) => {
    this.down.add(normalise(e.code));
    // Stop Space and the arrows from scrolling the page while they are bound to actions.
    if (this.noScroll.has(e.code)) e.preventDefault();
  };
  private readonly onUp = (e: KeyboardEvent): void => {
    this.down.delete(normalise(e.code));
  };
  private readonly onBlur = () => this.down.clear();
  private noScroll = new Set<string>();

  constructor(private readonly target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window) {
    target.addEventListener('keydown', this.onDown as EventListener);
    target.addEventListener('keyup', this.onUp as EventListener);
    target.addEventListener('blur', this.onBlur);
  }

  /** A live view of one binding. */
  key(code: string): HeldKey {
    const c = normalise(code);
    const down = this.down;
    return {
      get isDown() {
        return down.has(c);
      },
    };
  }

  setNoScroll(codes: readonly string[]): void {
    this.noScroll = new Set(codes.filter((c) => c === 'Space' || c.startsWith('Arrow')));
  }

  reset(): void {
    this.down.clear();
  }

  destroy(): void {
    this.target.removeEventListener('keydown', this.onDown as EventListener);
    this.target.removeEventListener('keyup', this.onUp as EventListener);
    this.target.removeEventListener('blur', this.onBlur);
    this.down.clear();
  }
}

/**
 * Phaser 3.90 re-dispatches every queued keyboard event each time a new DOM key event
 * arrives within the same frame, so a fast "1 then Q" can fire the first handler twice.
 * Wrap scene-level keydown handlers with this to process each DOM event exactly once.
 */
export function oncePerKeyEvent<A extends unknown[]>(
  handler: (event: KeyboardEvent, ...rest: A) => void,
): (event: KeyboardEvent, ...rest: A) => void {
  const seen = new WeakSet<KeyboardEvent>();
  return (event: KeyboardEvent, ...rest: A) => {
    if (seen.has(event)) return;
    seen.add(event);
    handler(event, ...rest);
  };
}
