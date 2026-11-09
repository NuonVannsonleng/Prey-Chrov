import type { StealthConfig } from '../data/schema';

/** The player's footprint in sound this frame (px radius). Pure. */
export function playerNoise(cfg: StealthConfig, moving: boolean, crouching: boolean, sprinting: boolean, acting: boolean): number {
  const n = cfg.noise;
  let r = !moving ? n.still : crouching ? n.crouch : sprinting ? n.sprint : n.walk;
  if (acting) r = Math.max(r, n.action);
  return r;
}

/** How far a creature can see the player (px). Hiding in cover beats crouching; night dulls animals. */
export function sightRange(cfg: StealthConfig, aggroRadius: number, hidden: boolean, crouching: boolean, night: boolean, wildlife: boolean): number {
  let r = aggroRadius;
  if (hidden) r *= cfg.sight.hidden;
  else if (crouching) r *= cfg.sight.crouch;
  if (night && wildlife) r *= cfg.sight.night;
  return r;
}

export interface Perceived {
  awareness: number;
  seen: boolean;
  heard: boolean;
}

/**
 * One perception step: seeing raises awareness fastest (more when close), hearing raises it more
 * slowly, nothing perceived lets it decay. Awareness 1 = alerted; a mid value = investigate.
 */
export function perceive(
  cfg: StealthConfig,
  awareness: number,
  dist: number,
  sight: number,
  noiseRadius: number,
  hearing: number,
  dtSeconds: number,
  out: Perceived,
): Perceived {
  const a = cfg.awareness;
  const seen = dist <= sight;
  const heard = noiseRadius > 0 && dist <= noiseRadius * hearing;
  let v = awareness;
  if (seen) v += a.seeRise * dtSeconds * (1.5 - Math.min(1, dist / Math.max(1, sight)));
  if (heard) v += a.hearRise * dtSeconds;
  if (!seen && !heard) v -= a.decay * dtSeconds;
  out.awareness = Math.max(0, Math.min(1, v));
  out.seen = seen;
  out.heard = heard;
  return out;
}
