import { describe, expect, it } from 'vitest';
import { RAW_GAME_DATA } from '../data/gameData';
import { DataValidationError, reachableItems, validateGameData, type RawGameData } from '../data/schema';
import { rollLoot } from '../systems/Loot';
import { mulberry32 } from '../utils/random';
import { TEST_MAP_RESOURCES, buildTestMap } from '../world/TestMap';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
type Raw = typeof RAW_GAME_DATA;
const fresh = (): Raw => clone(RAW_GAME_DATA);
const problems = (raw: RawGameData): string[] => {
  try {
    validateGameData(raw);
    return [];
  } catch (e) {
    if (e instanceof DataValidationError) return e.problems;
    throw e;
  }
};

describe('shipped game data', () => {
  const data = validateGameData(RAW_GAME_DATA);

  it('validates', () => {
    expect(data.items.size).toBeGreaterThan(0);
    expect(data.recipes.size).toBeGreaterThan(0);
  });

  it('every item is obtainable by gathering or crafting', () => {
    const got = reachableItems(data);
    for (const id of data.items.keys()) expect(got.has(id), `${id} is unobtainable`).toBe(true);
  });

  it('every recipe is craftable from reachable items', () => {
    const got = reachableItems(data);
    for (const r of data.recipes.values()) {
      for (const g of r.ingredients) expect(got.has(g.item), `${r.id} needs unreachable ${g.item}`).toBe(true);
    }
  });

  it('has the M3 recipes and structures the game code relies on', () => {
    for (const id of ['stone_axe', 'stone_pickaxe', 'spear', 'torch', 'campfire', 'bamboo_shelter']) {
      expect(data.recipes.has(id), `recipe ${id}`).toBe(true);
    }
    expect(data.structures.get('campfire')?.interaction).toBe('cook');
    expect(data.structures.get('bamboo_shelter')?.interaction).toBe('sleep');
    expect([...data.recipes.values()].some((r) => r.station === 'campfire')).toBe(true);
  });

  it('every resource the test map places exists, and the map uses each one', () => {
    const placed = new Set(buildTestMap().props.map((p) => p.resource).filter(Boolean));
    for (const id of Object.values(TEST_MAP_RESOURCES)) {
      expect(data.resources.has(id), `${id} missing from resources.json`).toBe(true);
      expect(placed.has(id), `${id} never placed on the map`).toBe(true);
    }
  });

  it('every resource can be gathered by hand', () => {
    for (const r of data.resources.values()) expect(r.toolMultipliers.hand ?? 0).toBeGreaterThan(0);
  });

  it('has at least one rare item (exercises drop confirmation)', () => {
    expect([...data.items.values()].some((i) => i.rarity === 'rare')).toBe(true);
  });

  it('a new player survives night 1 with no food or water at all', () => {
    const s = data.survival;
    // From day start to the end of night 1 (06:00 next day), never eating or drinking.
    const hours = 24 - s.day.startHour + 6;
    const thirstZeroAt = s.maxThirst / s.thirstPerHour;
    const hungerZeroAt = s.maxHunger / s.hungerPerHour;
    const dmg =
      Math.max(0, hours - thirstZeroAt) * s.dehydrationDamagePerHour + Math.max(0, hours - hungerZeroAt) * s.starvationDamagePerHour;
    expect(dmg).toBeLessThan(s.maxHealth);
  });
});

describe('validateGameData rejects bad data', () => {
  it('duplicate ids', () => {
    const raw = fresh();
    raw.items.push(clone(raw.items[0]!));
    expect(problems(raw).join()).toMatch(/duplicate id/);
  });

  it('unknown item references in loot', () => {
    const raw = fresh();
    raw.loot[0]!.guaranteed[0]!.item = 'unobtainium';
    expect(problems(raw).join()).toMatch(/unknown item unobtainium/);
  });

  it('unknown loot table on a resource', () => {
    const raw = fresh();
    raw.resources[0]!.lootTable = 'nope';
    expect(problems(raw).join()).toMatch(/unknown lootTable/);
  });

  it('invalid weights, ranges and stats', () => {
    const raw = fresh();
    const entry = raw.loot.find((t) => t.entries.length > 0)!.entries[0]!;
    entry.weight = 0;
    entry.min = 3;
    entry.max = 1;
    (raw.resources[0] as { hp: number }).hp = -1;
    (raw.resources[1] as { respawnSeconds: number }).respawnSeconds = Number.NaN;
    (raw.items[0] as { stackSize: number }).stackSize = 0;
    const all = problems(raw).join('\n');
    expect(all).toMatch(/weight must be > 0/);
    expect(all).toMatch(/min <= max/);
    expect(all).toMatch(/hp must be/);
    expect(all).toMatch(/respawnSeconds/);
    expect(all).toMatch(/stackSize/);
  });

  it('unknown icons, sprites and non-array files', () => {
    const raw = fresh() as unknown as Record<string, unknown> & Raw;
    (raw.items[0] as { icon: string }).icon = 'sword';
    (raw.resources[0] as { sprite: string }).sprite = 'castle';
    const all = problems({ ...raw, loot: {} }).join('\n');
    expect(all).toMatch(/unknown icon/);
    expect(all).toMatch(/unknown sprite/);
    expect(all).toMatch(/loot.json: must be a JSON array/);
  });

  it('bad recipes: unknown items, self-use, negative qty, bad station', () => {
    const raw = fresh();
    const r = raw.recipes[0] as unknown as { output: string; ingredients: { item: string; qty: number }[]; station: string };
    r.ingredients.push({ item: r.output, qty: 1 });
    r.ingredients.push({ item: 'ghost', qty: -2 });
    r.station = 'forge';
    const all = problems(raw).join('\n');
    expect(all).toMatch(/uses its own output/);
    expect(all).toMatch(/unknown item ghost/);
    expect(all).toMatch(/qty must be/);
    expect(all).toMatch(/unknown station/);
  });

  it('unreachable items (recipe cycle with no gatherable entry)', () => {
    const raw = fresh();
    const base = clone(raw.items[0]!);
    raw.items.push({ ...base, id: 'moon_a', name: 'A' }, { ...base, id: 'moon_b', name: 'B' });
    raw.recipes.push(
      { id: 'make_a', output: 'moon_a', qty: 1, ingredients: [{ item: 'moon_b', qty: 1 }], station: 'none', category: 'tools' },
      { id: 'make_b', output: 'moon_b', qty: 1, ingredients: [{ item: 'moon_a', qty: 1 }], station: 'none', category: 'tools' },
    );
    expect(problems(raw).join()).toMatch(/unobtainable items: moon_a, moon_b/);
  });

  it('bad survival config and structures', () => {
    const raw = fresh();
    const s = raw.survival as unknown as Record<string, unknown>;
    s['hungerPerHour'] = -1;
    s['darkness'] = [[3, 2]];
    (raw.structures[0] as { footprint: { w: number; h: number } }).footprint.w = 0;
    const all = problems(raw).join('\n');
    expect(all).toMatch(/hungerPerHour/);
    expect(all).toMatch(/darkness/);
    expect(all).toMatch(/footprint/);
  });

  it('tools and lights must not stack', () => {
    const raw = fresh();
    const tool = raw.items.find((i) => 'tool' in i) as { stackSize: number };
    tool.stackSize = 5;
    expect(problems(raw).join()).toMatch(/tools must have stackSize 1/);
  });
});

describe('rollLoot', () => {
  const data = validateGameData(RAW_GAME_DATA);
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
