import { describe, expect, it } from 'vitest';
import { RAW_GAME_DATA } from '../data/gameData';
import { DataValidationError, reachableItems, validateGameData, type RawGameData } from '../data/schema';
import { FishingSession } from '../systems/Fishing';
import { applySeason, rollLoot } from '../systems/Loot';
import { mulberry32 } from '../utils/random';

const data = validateGameData(RAW_GAME_DATA);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('fishing minigame', () => {
  const cfg = data.fishing;

  it('bites after the configured delay and the window closes after windowSeconds', () => {
    const f = new FishingSession(cfg);
    f.cast(0, () => 0.5);
    expect(f.phase).toBe('waiting');
    expect(f.update(f.biteAt - 1)).toBe('none');
    expect(f.update(f.biteAt)).toBe('bite');
    expect(f.update(f.biteAt + cfg.windowSeconds * 1000 + 1)).toBe('escaped');
    expect(f.phase).toBe('idle');
  });

  it('pressing early or outside the zone fails; inside the zone catches', () => {
    const f = new FishingSession(cfg);
    f.cast(0, () => 0.5);
    expect(f.press(100)).toBe('early');
    // Inside: find a moment where the marker is in the zone.
    f.cast(0, () => 0.5);
    f.update(f.biteAt);
    let t = f.biteAt;
    while (!f.inZone(t)) t += 5;
    expect(f.press(t)).toBe('caught');
    // Outside.
    f.cast(0, () => 0.5);
    f.update(f.biteAt);
    t = f.biteAt;
    while (f.inZone(t)) t += 5;
    while (!f.inZone(t) && Math.abs(f.marker(t) - f.zoneCenter) < cfg.zoneWidth) t += 5;
    if (!f.inZone(t)) expect(f.press(t)).toBe('missed');
  });

  it('is fair: every bite window passes through the zone at least twice, for any zone position', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const f = new FishingSession(cfg);
      f.cast(0, () => r);
      f.update(f.biteAt);
      let entries = 0;
      let was = false;
      for (let t = f.biteAt; t <= f.biteAt + cfg.windowSeconds * 1000; t += 10) {
        const now = f.inZone(t);
        if (now && !was) entries++;
        was = now;
      }
      expect(entries, `zone at ${f.zoneCenter.toFixed(2)}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('rejects unfair tuning in fishing.json', () => {
    const raw = clone(RAW_GAME_DATA) as RawGameData & { fishing: Record<string, unknown> };
    raw.fishing['zoneWidth'] = 0.05;
    raw.fishing['windowSeconds'] = 0.3;
    try {
      validateGameData(raw);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(DataValidationError);
      expect((e as DataValidationError).problems.join(' ')).toMatch(/fairness/);
    }
  });
});

describe('harvest seasons', () => {
  it('scales seasonal items only and drops empty stacks', () => {
    const loot = [
      { item: 'berries', qty: 3 },
      { item: 'leaf', qty: 2 },
      { item: 'bamboo_shoot', qty: 1 },
    ];
    expect(applySeason(loot, { berries: 0.5, bamboo_shoot: 0.5 })).toEqual([
      { item: 'berries', qty: 1 },
      { item: 'leaf', qty: 2 },
    ]);
    expect(applySeason(loot, { bamboo_shoot: 2 })[2]).toEqual({ item: 'bamboo_shoot', qty: 2 });
    expect(applySeason(loot, undefined)).toBe(loot);
  });

  it('monsoon favours shoots and herbs; the dry season favours berries', () => {
    expect(data.resources.get('bamboo_clump')?.seasonal?.monsoon?.['bamboo_shoot']).toBeGreaterThan(1);
    expect(data.resources.get('berry_bush')?.seasonal?.monsoon?.['berries']).toBeLessThan(1);
  });
});

describe('sustainable food, water and poison treatment', () => {
  it('fish, tubes, boiled water, bandages and antidotes are all reachable', () => {
    const r = reachableItems(data);
    for (const id of ['raw_fish', 'cooked_fish', 'water_tube', 'boiled_water', 'bandage', 'antidote', 'vegetable_stew', 'fish_soup', 'cooking_pot_kit']) {
      expect(r.has(id), id).toBe(true);
    }
  });

  it('every input of the renewable loop comes from respawning nodes, fishing or water', () => {
    const fromNodes = new Set<string>();
    for (const res of data.resources.values()) {
      expect(res.respawnSeconds).toBeGreaterThan(0);
      const t = data.loot.get(res.lootTable);
      for (const g of t?.guaranteed ?? []) fromNodes.add(g.item);
    }
    // Antidote: bitter root (node) + boiled water (tube from bamboo node, water anywhere, campfire).
    expect(fromNodes.has('bitter_root')).toBe(true);
    expect(fromNodes.has('bamboo')).toBe(true);
    expect(fromNodes.has('healing_leaf')).toBe(true);
    expect(data.loot.get(data.fishing.lootTable)?.guaranteed.some((g) => g.item === 'raw_fish')).toBe(true);
  });

  it('a day of hunger and thirst costs a modest number of catches and refills', () => {
    const s = data.survival;
    const hungerPerDay = s.hungerPerHour * 24;
    const thirstPerDay = s.thirstPerHour * 24;
    const fish = data.items.get('cooked_fish')?.food?.hunger ?? 0;
    const water = data.items.get('boiled_water')?.food?.thirst ?? 0;
    const catchesPerDay = Math.ceil(hungerPerDay / fish);
    expect(catchesPerDay).toBeLessThanOrEqual(4);
    expect(Math.ceil(thirstPerDay / water)).toBeLessThanOrEqual(4);
    // A rod survives several days of that.
    const rod = data.items.get('fishing_rod')?.tool?.durability ?? 0;
    expect(rod / (catchesPerDay * 2)).toBeGreaterThanOrEqual(3);
  });

  it('every catch yields at least one fish', () => {
    const t = data.loot.get(data.fishing.lootTable);
    if (!t) throw new Error('fishing loot missing');
    const rng = mulberry32(5);
    for (let i = 0; i < 200; i++) expect(rollLoot(t, rng).some((st) => st.item === 'raw_fish' && st.qty >= 1)).toBe(true);
  });
});
