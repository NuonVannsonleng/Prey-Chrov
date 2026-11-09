import { describe, expect, it } from 'vitest';
import { RAW_GAME_DATA } from '../data/gameData';
import { validateGameData } from '../data/schema';
import { StatusEffects, inArc } from '../systems/StatusEffects';

const data = validateGameData(RAW_GAME_DATA);

describe('StatusEffects', () => {
  it('poison damages over its duration, then ends', () => {
    const fx = new StatusEffects();
    fx.apply('poison', 4, { dps: 1.5 });
    let total = 0;
    for (let i = 0; i < 60; i++) total += fx.update(0.1, 20).damage;
    expect(total).toBeCloseTo(6, 5);
    expect(fx.has('poison')).toBe(false);
  });

  it('repeated poison refreshes instead of stacking', () => {
    const fx = new StatusEffects();
    fx.apply('poison', 5, { dps: 1 });
    fx.apply('poison', 3, { dps: 1 });
    expect(fx.list.filter((e) => e.id === 'poison')).toHaveLength(1);
    expect(fx.remaining('poison')).toBe(5);
  });

  it('blessing heals per game hour', () => {
    const fx = new StatusEffects();
    fx.apply('blessing', 100, { regenPerHour: 4 });
    let heal = 0;
    for (let i = 0; i < 20; i++) heal += fx.update(1, 20).heal;
    expect(heal).toBeCloseTo(4, 5);
  });

  it('serialize/restore round-trips and rejects junk', () => {
    const fx = new StatusEffects();
    fx.apply('ward', 30);
    const copy = new StatusEffects();
    copy.restore([...fx.serialize(), { id: 'curse' as never, remaining: 5, dps: 0, regenPerHour: 0 }, { id: 'poison', remaining: Number.NaN, dps: 1, regenPerHour: 0 }]);
    expect(copy.list.map((e) => e.id)).toEqual(['ward']);
  });
});

describe('inArc', () => {
  it('hits in front within reach, misses behind or too far', () => {
    expect(inArc(0, 0, 1, 0, 20, 5, 30, 110)).toBe(true);
    expect(inArc(0, 0, 1, 0, -20, 0, 30, 110)).toBe(false);
    expect(inArc(0, 0, 1, 0, 40, 0, 30, 110)).toBe(false);
    expect(inArc(0, 0, 1, 0, 0, 25, 30, 110)).toBe(false);
    expect(inArc(0, 0, 1, 0, 2, 2, 30, 110)).toBe(true);
  });
});

describe('creature data fairness', () => {
  const enemies = [...data.enemies.values()];

  it('every attack is telegraphed and spirits respect light at night only', () => {
    for (const e of enemies) {
      expect(e.telegraphMs).toBeGreaterThanOrEqual(200);
      if (e.kind === 'spirit') {
        expect(e.active).toBe('night');
        expect(e.avoidsLight).toBe(true);
      }
    }
  });

  it('a sprinting player outruns every creature except during a committed charge', () => {
    const sprint = 150 * 1.65;
    for (const e of enemies) expect(e.speed).toBeLessThan(sprint);
  });

  it('night 1 is gentle, night 3 is more dangerous', () => {
    const c = data.encounters;
    const night = (day: number) => Math.min(c.maxAlive.night, c.firstNightMax + (day - 1) * c.nightRampPerDay);
    expect(night(1)).toBeLessThanOrEqual(2);
    expect(night(3)).toBeGreaterThan(night(1));
    const nightOne = enemies.filter((e) => e.kind === 'spirit' && e.spawn.minDay <= 1);
    expect(nightOne.length).toBeGreaterThan(0);
  });

  it('no creature can kill a full-health player in one hit', () => {
    for (const e of enemies) {
      expect(e.damage).toBeLessThan(data.survival.maxHealth / 2);
      if (e.projectile) expect(e.projectile.damage).toBeLessThan(data.survival.maxHealth / 4);
    }
  });

  it('shrines are offerings for blessings, never hostile', () => {
    expect(data.shrines.blessing.durationHours).toBeGreaterThan(0);
    for (const e of enemies) expect(e.name.toLowerCase()).not.toContain('neak');
  });
});
