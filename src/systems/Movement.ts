export interface MoveInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface MoveTuning {
  walkSpeed: number;
  sprintMultiplier: number;
  acceleration: number;
  deceleration: number;
}

/** Writes the desired velocity into `out` (no allocation). Diagonals are normalized. */
export function targetVelocity(input: MoveInput, tuning: MoveTuning, out: Vec2): Vec2 {
  let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const len = Math.hypot(dx, dy);
  if (len > 0) {
    dx /= len;
    dy /= len;
  }
  const speed = tuning.walkSpeed * (input.sprint && len > 0 ? tuning.sprintMultiplier : 1);
  out.x = dx * speed;
  out.y = dy * speed;
  return out;
}

/**
 * Frame-rate independent exponential approach of `current` toward `target`.
 * Writes into `out`, and never overshoots the target or exceeds its magnitude.
 */
export function approachVelocity(current: Vec2, target: Vec2, tuning: MoveTuning, dtSeconds: number, out: Vec2): Vec2 {
  const dt = Math.min(Math.max(dtSeconds, 0), 0.1);
  const accelerating = target.x !== 0 || target.y !== 0;
  const rate = accelerating ? tuning.acceleration : tuning.deceleration;
  const t = 1 - Math.exp(-rate * dt);
  out.x = current.x + (target.x - current.x) * t;
  out.y = current.y + (target.y - current.y) * t;
  if (Math.abs(out.x) < 0.5 && target.x === 0) out.x = 0;
  if (Math.abs(out.y) < 0.5 && target.y === 0) out.y = 0;
  return out;
}
