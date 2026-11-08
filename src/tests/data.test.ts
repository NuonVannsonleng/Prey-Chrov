import { describe, expect, it } from 'vitest';
import items from '../data/items.json';
import loot from '../data/loot.json';
import resources from '../data/resources.json';
import { DataValidationError, obtainableItems, validateGameData } from '../data/schema';
import { rollLoot } from '../systems/Loot';
import { mulberry32 } from '../utils/random';
import { TEST_MAP_RESOURCES, buildTestMap } from '../world/TestMap';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const problems = (i: unknown, l: unknown, r: unknown): string[] => {
  try {
    validateGameData(i, l, r);
    return [];
  } catch (e) {
    if (e instanceof DataValidationError) return e.problems;
    throw e;
  }
};

describe('shipped game data', () => {
  const data = validateGameData(items, loot, resources);

  it('validates', () => {
    expect(data.items.size).toBeGreaterThan(0);
  });

  it('every item is obtainable from some resource node', () => {
    const got = obtainableItems(data);
    for (const id of data.items.keys()) expect(got.has(id), `${id} is unobtainable`).toBe(true);
  });

  it('every resource the test map places exists, and the map uses each one', () => {
    const placed = new Set(buildTestMap().props.map((p) => p.resource).filter(Boolean));
    for (const id of Object.values(TEST_MAP_RESOURCES)) {
      expect(data.resources.has(id), `${id} missing from resources.json`).toBe(true);
      expect(placed.has(id), `${id} never placed on the map`).toBe(true);
    }
  });

  it('every resource can be gathered by hand (no tools exist yet)', () => {
    for (const r of data.resources.values()) expect(r.toolMultipliers.hand ?? 0).toBeGreaterThan(0);
  });

  it('has at least one rare item (exercises drop confirmation)', () => {
    expect([...data.items.values()].some((i) => i.rarity === 'rare')).toBe(true);
  });
});

describe('validateGameData rejects bad data', () => {
  it('duplicate ids', () => {
    const i = clone(items);
    i.push(clone(i[0]!));
    expect(problems(i, loot, resources).join()).toMatch(/duplicate id/);
  });

  it('unknown item references in loot', () => {
    const l = clone(loot);
    l[0]!.guaranteed[0]!.item = 'unobtainium';
    expect(problems(items, l, resources).join()).toMatch(/unknown item unobtainium/);
  });

  it('unknown loot table on a resource', () => {
    const r = clone(resources);
    r[0]!.lootTable = 'nope';
    expect(problems(items, loot, r).join()).toMatch(/unknown lootTable/);
  });

  it('invalid weights, ranges and stats', () => {
    const l = clone(loot);
    const entry = l.find((t) => t.entries.length > 0)!.entries[0]!;
    entry.weight = 0;
    entry.min = 3;
    entry.max = 1;
    const r = clone(resources);
    (r[0] as { hp: number }).hp = -1;
    (r[1] as { respawnSeconds: number }).respawnSeconds = Number.NaN;
    const i = clone(items);
    (i[0] as { stackSize: number }).stackSize = 0;
    const all = problems(i, l, r).join('\n');
    expect(all).toMatch(/weight must be > 0/);
    expect(all).toMatch(/min <= max/);
    expect(all).toMatch(/hp must be/);
    expect(all).toMatch(/respawnSeconds/);
    expect(all).toMatch(/stackSize/);
  });

  it('unknown icons, sprites and non-array files', () => {
    const i = clone(items);
    (i[0] as { icon: string }).icon = 'sword';
    const r = clone(resources);
    (r[0] as { sprite: string }).sprite = 'castle';
    const all = problems(i, {}, r).join('\n');
    expect(all).toMatch(/unknown icon/);
    expect(all).toMatch(/unknown sprite/);
    expect(all).toMatch(/loot.json: must be a JSON array/);
  });
});

describe('rollLoot', () => {
  const data = validateGameData(items, loot, resources);
  const tables = [...data.loot.values()];

  it('is deterministic for the same seed', () => {
    for (const t of tables) expect(rollLoot(t, mulberry32(42))).toEqual(rollLoot(t, mulberry32(42)));
  });

  it('always includes guaranteed drops within range and only known items', () => {
    for (const t of tables) {
      for (let s = 0; s < 200; s++) {
        const out = rollLoot(t, mulberry32(s));
        for (const g of t.guaranteed) {
          const got = out.find((o) => o.item === g.item)?.qty ?? 0;
          expect(got).toBeGreaterThanOrEqual(g.min);
        }
        for (const o of out) {
          expect(data.items.has(o.item)).toBe(true);
          expect(Number.isInteger(o.qty) && o.qty > 0).toBe(true);
        }
      }
    }
  });

  it('respects weights roughly', () => {
    const table = {
      id: 't',
      guaranteed: [],
      rolls: { min: 1, max: 1 },
      entries: [
        { item: 'a', weight: 3, min: 1, max: 1 },
        { item: 'b', weight: 1, min: 1, max: 1 },
      ],
    };
    const rng = mulberry32(7);
    let a = 0;
    for (let i = 0; i < 4000; i++) if (rollLoot(table, rng)[0]?.item === 'a') a++;
    expect(a / 4000).toBeGreaterThan(0.7);
    expect(a / 4000).toBeLessThan(0.8);
  });
});
