import { describe, expect, it } from 'vitest';
import { RAW_GAME_DATA, getGameData } from '../data/gameData';
import { validateGameData } from '../data/schema';
import { ecoSeasonOn, forecast } from '../systems/Season';

const data = getGameData();
const cfg = data.season;
const L = cfg.ecology.lengthDays;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('ecological seasons (M21)', () => {
  it('the year runs cool → hot → rainy and repeats, from day 1', () => {
    expect(ecoSeasonOn(1, cfg).season.id).toBe('cool');
    expect(ecoSeasonOn(1, cfg).dayInSeason).toBe(1);
    expect(ecoSeasonOn(L, cfg)).toMatchObject({ dayInSeason: L, daysLeft: 0 });
    expect(ecoSeasonOn(L + 1, cfg).season.id).toBe('hot');
    expect(ecoSeasonOn(2 * L + 1, cfg).season.id).toBe('rainy');
    expect(ecoSeasonOn(3 * L + 1, cfg)).toMatchObject({ year: 2, dayInSeason: 1 });
    expect(ecoSeasonOn(3 * L + 1, cfg).season.id).toBe('cool');
    // Junk days clamp to the start rather than throwing.
    expect(ecoSeasonOn(0, cfg).season.id).toBe('cool');
    expect(ecoSeasonOn(-5, cfg).season.id).toBe('cool');
  });

  it('monsoon storms keep their own schedule on top of the seasons', () => {
    expect(forecast(cfg.firstDay, 12, cfg).monsoon).toBe(true);
    expect(forecast(cfg.firstDay + cfg.cycleDays, 12, cfg).monsoon).toBe(true);
  });

  it('every season is a modest pressure; the cool season opens gently with cold nights only there', () => {
    for (const s of cfg.ecology.seasons) {
      expect(s.hunger).toBeLessThanOrEqual(1.3);
      expect(s.thirst).toBeLessThanOrEqual(1.4);
    }
    const cool = cfg.ecology.seasons[0];
    expect(cool?.hunger).toBeLessThanOrEqual(1.1);
    expect(cool?.nightCold).toBeGreaterThan(0);
    for (const s of cfg.ecology.seasons.slice(1)) expect(s.nightCold).toBe(0);
  });

  it('the validator refuses a wrong order, harsh values and unknown resources', () => {
    const bad = clone(RAW_GAME_DATA.season) as { ecology: { seasons: Array<Record<string, unknown>> } };
    const [a, b] = bad.ecology.seasons;
    if (!a || !b) throw new Error('fixture');
    bad.ecology.seasons[0] = b;
    bad.ecology.seasons[1] = a;
    a['thirst'] = 3;
    a['forage'] = { dragon_fruit: 1.2 };
    expect(() => validateGameData({ ...RAW_GAME_DATA, season: bad })).toThrow(/cool, hot, rainy in order[\s\S]*thirst must be[\s\S]*unknown resource dragon_fruit/);
  });
});
