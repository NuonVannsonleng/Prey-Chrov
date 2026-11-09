import { describe, expect, it } from 'vitest';
import { RAW_GAME_DATA } from '../data/gameData';
import { validateGameData } from '../data/schema';
import { QuestLog } from '../systems/Quest';
import { forecast, isMonsoonDay, weatherModifiers } from '../systems/Season';
import { Survival } from '../systems/Survival';
import { WorldGen } from '../world/WorldGen';

const data = validateGameData(RAW_GAME_DATA);
const s = data.season;
const sph = data.survival.day.lengthSeconds / 24;

describe('monsoon schedule', () => {
  it('rains on days 5–6 and 10–11 (every fifth day for two days)', () => {
    const rainy = Array.from({ length: 16 }, (_, i) => i + 1).filter((d) => isMonsoonDay(d, s));
    expect(rainy).toEqual([5, 6, 10, 11, 15, 16]);
  });

  it('forecast counts down and labels the monsoon', () => {
    expect(forecast(1, 8, s).daysUntil).toBe(4);
    expect(forecast(4, 8, s).label).toMatch(/tomorrow/);
    const f = forecast(5, 12, s);
    expect(f.monsoon).toBe(true);
    expect(f.monsoonDay).toBe(1);
    expect(forecast(6, 1, s).monsoonDay).toBe(2);
    expect(forecast(7, 20, s).monsoon).toBe(false);
  });

  it('flood rises through the monsoon and recedes after', () => {
    expect(forecast(5, 6, s).flood).toBeLessThan(forecast(6, 18, s).flood);
    expect(forecast(7, 2, s).flood).toBeGreaterThan(0);
    expect(forecast(7, 13, s).flood).toBe(0);
    expect(forecast(3, 12, s).flood).toBe(0);
  });

  it('rain: thirst slower, hunger faster', () => {
    const m = weatherModifiers(forecast(5, 12, s), s);
    expect(m.thirst).toBeLessThan(1);
    expect(m.hunger).toBeGreaterThan(1);
    expect(weatherModifiers(forecast(2, 12, s), s)).toEqual({ thirst: 1, hunger: 1 });
  });
});

describe('cold', () => {
  it('exposure drains warmth then health; shelter recovers it', () => {
    const sv = new Survival(data.survival);
    for (let i = 0; i < 24 * 20; i++) sv.updateWarmth(1, sph, true, s.cold);
    expect(sv.stats.warmth).toBe(0);
    expect(sv.stats.health).toBeLessThan(100);
    expect(sv.lastDamageCause).toBe('cold');
    for (let i = 0; i < 6 * 20; i++) sv.updateWarmth(1, sph, false, s.cold);
    expect(sv.stats.warmth).toBeGreaterThan(50);
  });

  it('a prepared player (warming every few hours) takes no cold damage on a monsoon day', () => {
    const sv = new Survival(data.survival);
    for (let h = 0; h < 12; h++) {
      const exposed = h % 4 !== 3;
      for (let i = 0; i < 20; i++) sv.updateWarmth(1, sph, exposed, s.cold);
    }
    expect(sv.stats.health).toBe(100);
  });
});

describe('flood mask', () => {
  it('never floods spawn, ruins or deep water, and only grows with the level', () => {
    const gen = new WorldGen(42, data.biomes);
    let low = 0;
    let high = 0;
    for (let ty = -150; ty <= 150; ty += 3) {
      for (let tx = -150; tx <= 150; tx += 3) {
        const a = gen.floodAt(tx, ty, 0.3, s.floodRiverWidth);
        const b = gen.floodAt(tx, ty, 1, s.floodRiverWidth);
        if (a) low++;
        if (b) high++;
        if (a) expect(b).toBe(true);
        if (a || b) {
          expect(gen.waterAt(tx, ty)).toBeNull();
          expect(gen.ruinAt(tx, ty)).toBeNull();
        }
      }
    }
    expect(gen.floodAt(0, 0, 1, s.floodRiverWidth)).toBe(false);
    expect(high).toBeGreaterThan(low);
  });
});

describe('main quest', () => {
  it('reading tablets is idempotent; all five reveal the Heart', () => {
    const q = new QuestLog(data);
    expect(q.stage).toBe('tablets');
    expect(q.readTablet('tablet_2')).toBe(true);
    expect(q.readTablet('tablet_2')).toBe(false);
    expect(q.readTablet('nope')).toBe(false);
    for (const t of data.tablets) q.readTablet(t.id);
    expect(q.stage).toBe('heart');
    expect(q.view().steps[0]?.progress).toBe('5/5');
    expect(q.reachHeart()).toBe(true);
    expect(q.stage).toBe('restore');
    expect(q.restore()).toBe(true);
    expect(q.stage).toBe('done');
    expect(q.view().steps.every((st) => st.done)).toBe(true);
  });

  it('restores from a save and ignores unknown ids', () => {
    const q = new QuestLog(data, ['tablet_1', 'ghost'], true);
    expect(q.tabletsRead).toEqual(['tablet_1']);
    expect(q.heartReached).toBe(false);
  });

  it('five tablet ruins exist for any seed, and the heart is on dry land', () => {
    for (const seed of [1, 42, 777, 20261109]) {
      const gen = new WorldGen(seed, data.biomes);
      const sites = gen.tabletSites();
      expect(sites).toHaveLength(5);
      const h = gen.heartSite();
      expect(gen.waterAt(h.tx, h.ty)).toBeNull();
      expect(Math.hypot(h.tx, h.ty)).toBeGreaterThan(150);
    }
  });

  it('each tablet ruin generates its tablet prop', () => {
    const gen = new WorldGen(42, data.biomes);
    gen.tabletSites().forEach((site, i) => {
      const cx = Math.floor(site.tx / 32);
      const cy = Math.floor((site.ty + 3) / 32);
      const props = gen.generateChunk(cx, cy).props;
      expect(props.some((p) => p.kind === 'tablet' && p.id === `tablet_${i + 1}`), `tablet_${i + 1}`).toBe(true);
    });
  });
});
