const NAMED_KEYCODES: Record<string, number> = {
  Space: 32,
  ShiftLeft: 16,
  ShiftRight: 16,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
  Semicolon: 186,
  Equal: 187,
  Comma: 188,
  Minus: 189,
  Period: 190,
  Slash: 191,
  Backquote: 192,
  BracketLeft: 219,
  Backslash: 220,
  BracketRight: 221,
  Quote: 222,
};

/** KeyboardEvent.code (layout-independent) → the keyCode Phaser's Key objects use. */
export function codeToKeyCode(code: string): number {
  if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3);
  if (/^Digit[0-9]$/.test(code)) return code.charCodeAt(5);
  return NAMED_KEYCODES[code] ?? 0;
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
