import { describe, expect, it } from 'vitest';
import { RAW_GAME_DATA } from '../data/gameData';
import { validateGameData } from '../data/schema';
import { distanceDanger, eliteChance } from '../systems/Encounters.pure';
import { perceive, playerNoise, sightRange, type Perceived } from '../systems/Perception';

const data = validateGameData(RAW_GAME_DATA);
const cfg = data.stealth;
const tiger = data.enemies.get('tiger');
if (!tiger) throw new Error('tiger missing');

/** Simulates a creature watching/listening for `seconds` at a fixed distance. */
function watch(dist: number, opts: { hidden: boolean; crouching: boolean; moving: boolean; sprinting?: boolean; acting?: boolean; night?: boolean }, seconds: number): number {
  const out: Perceived = { awareness: 0, seen: false, heard: false };
  const sight = sightRange(cfg, tiger!.aggroRadius, opts.hidden, opts.crouching, opts.night ?? false, true);
  const noise = playerNoise(cfg, opts.moving, opts.crouching, opts.sprinting ?? false, opts.acting ?? false);
  let a = 0;
  for (let t = 0; t < seconds; t += 0.05) a = perceive(cfg, a, dist, sight, noise, tiger!.hearing ?? 1, 0.05, out).awareness;
  return a;
}

describe('stealth', () => {
  it('noise: crouching < walking < sprinting; standing still is silent; working is loud', () => {
    const n = (m: boolean, c: boolean, s: boolean, a = false) => playerNoise(cfg, m, c, s, a);
    expect(n(true, true, false)).toBeLessThan(n(true, false, false));
    expect(n(true, false, false)).toBeLessThan(n(true, false, true));
    expect(n(false, false, false)).toBe(0);
    expect(n(false, false, false, true)).toBeGreaterThan(n(true, false, false));
  });

  it('a tiger 140 px away spots a walking player but never a player hiding still in cover', () => {
    expect(watch(140, { hidden: false, crouching: false, moving: true }, 3)).toBe(1);
    expect(watch(140, { hidden: true, crouching: true, moving: false }, 30)).toBe(0);
  });

  it('sneaking (crouched, moving) gets much closer than walking before being noticed', () => {
    const closest = (opts: Parameters<typeof watch>[1]) => {
      for (let d = 300; d > 0; d -= 5) if (watch(d, opts, 3) >= 1) return d;
      return 0;
    };
    expect(closest({ hidden: false, crouching: true, moving: true })).toBeLessThan(closest({ hidden: false, crouching: false, moving: true }));
  });

  it('awareness decays once the player is lost', () => {
    const out: Perceived = { awareness: 0, seen: false, heard: false };
    const a = perceive(cfg, 1, 500, 100, 0, 1, 1, out).awareness;
    expect(a).toBeLessThan(1);
    expect(out.seen || out.heard).toBe(false);
  });

  it('animals see less at night; spirits do not', () => {
    expect(sightRange(cfg, 200, false, false, true, true)).toBeLessThan(200);
    expect(sightRange(cfg, 200, false, false, true, false)).toBe(200);
  });
});

describe('dynamic encounters', () => {
  it('elites appear only from minDay, grow with days, and are capped', () => {
    const e = cfg.elite;
    expect(eliteChance(e, e.minDay - 1)).toBe(0);
    expect(eliteChance(e, e.minDay + 5)).toBeGreaterThan(eliteChance(e, e.minDay));
    expect(eliteChance(e, 500)).toBe(e.max);
  });

  it('danger grows with distance from home', () => {
    expect(distanceDanger(cfg.distanceDanger, 10)).toBeLessThan(distanceDanger(cfg.distanceDanger, 100));
    expect(distanceDanger(cfg.distanceDanger, 100)).toBeLessThan(distanceDanger(cfg.distanceDanger, 400));
  });

  it('ambushes always come with a warning of at least 3 seconds', () => {
    expect(cfg.ambush.warningSeconds).toBeGreaterThanOrEqual(3);
    expect(cfg.ambush.ringMin).toBeGreaterThan(200);
  });
});
