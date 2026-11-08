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
