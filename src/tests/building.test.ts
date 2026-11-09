import { describe, expect, it } from 'vitest';
import { RAW_GAME_DATA } from '../data/gameData';
import { reachableItems, validateGameData } from '../data/schema';
import { parseSave } from '../systems/Save';
import { footprintOf, frameOf } from '../systems/structureShape';

const data = validateGameData(RAW_GAME_DATA);

describe('building data', () => {
  it('every M10 structure kit is craftable from gatherable materials', () => {
    const r = reachableItems(data);
    for (const id of ['workbench_kit', 'bamboo_wall_kit', 'thatch_roof_kit', 'storage_chest_kit', 'rain_collector_kit', 'bamboo_bed_kit', 'outpost_flag_kit', 'rain_water']) {
      expect(r.has(id), id).toBe(true);
    }
  });

  it('advanced structures (and outpost flags) need the workbench; the bench itself does not', () => {
    const station = (out: string) => [...data.recipes.values()].find((x) => x.output === out)?.station;
    expect(station('workbench_kit')).toBe('none');
    for (const k of ['outpost_flag_kit', 'bamboo_wall_kit', 'thatch_roof_kit', 'storage_chest_kit', 'rain_collector_kit', 'bamboo_bed_kit']) expect(station(k), k).toBe('workbench');
  });

  it('walls rotate: frame and footprint swap', () => {
    const wall = data.structures.get('bamboo_wall');
    if (!wall) throw new Error('missing wall');
    expect(frameOf(wall, 0)).toBe('wall');
    expect(frameOf(wall, 1)).toBe('wall_v');
    expect(footprintOf(wall, 1)).toEqual({ w: wall.footprint.h, h: wall.footprint.w });
    const chest = data.structures.get('storage_chest');
    if (!chest) throw new Error('missing chest');
    expect(footprintOf(chest, 1)).toEqual(chest.footprint);
  });

  it('a roof shelters and protects; the chest never weathers', () => {
    expect(data.structures.get('thatch_roof')?.shelterRadius).toBeGreaterThan(0);
    expect(data.structures.get('storage_chest')?.durability).toBeUndefined();
  });
});

describe('structure persistence in saves', () => {
  const base = { version: 2, savedAt: 1, seed: 1, clockSeconds: 0, player: { x: 0, y: 0, health: 100, hunger: 100, thirst: 100, stamina: 100 } };

  it('keeps uid, rotation, weathering, chest contents, water and outpost names', () => {
    const r = parseSave(
      JSON.stringify({
        ...base,
        structures: [
          { type: 'storage_chest', x: 10, y: 20, uid: 3, storage: [{ item: 'wood', qty: 5 }, null, { item: 'stone_axe', qty: 1, durability: 40 }] },
          { type: 'bamboo_wall', x: 32, y: 48, uid: 4, rot: 1, durability: 12 },
          { type: 'rain_collector', x: 64, y: 48, uid: 5, water: 3, durability: 100 },
          { type: 'outpost_flag', x: 90, y: 90, uid: 6, name: 'Outpost 1' },
        ],
      }),
    );
    if (!('data' in r)) throw new Error('parse failed');
    const [chest, wall, collector, flag] = r.data.structures;
    expect(chest?.storage?.[0]).toEqual({ item: 'wood', qty: 5 });
    expect(chest?.storage?.[1]).toBeNull();
    expect(chest?.storage?.[2]).toEqual({ item: 'stone_axe', qty: 1, durability: 40 });
    expect(wall).toMatchObject({ uid: 4, rot: 1, durability: 12 });
    expect(collector?.water).toBe(3);
    expect(flag?.name).toBe('Outpost 1');
  });

  it('sanitises junk structure fields', () => {
    const r = parseSave(
      JSON.stringify({
        ...base,
        structures: [{ type: 'storage_chest', x: 1, y: 2, uid: -4, rot: 7, durability: 'x', water: NaN, name: 5, storage: [{ item: 3 }, { item: 'wood', qty: -2 }, 'junk'] }],
      }),
    );
    if (!('data' in r)) throw new Error('parse failed');
    const s = r.data.structures[0];
    expect(s?.uid).toBeUndefined();
    expect(s?.rot).toBeUndefined();
    expect(s?.durability).toBeUndefined();
    expect(s?.name).toBeUndefined();
    expect(s?.storage).toEqual([null, null, null]);
  });

  it('old M3–M9 structures (type/x/y only) still load', () => {
    const r = parseSave(JSON.stringify({ ...base, structures: [{ type: 'campfire', x: 5, y: 6 }] }));
    if (!('data' in r)) throw new Error('parse failed');
    expect(r.data.structures).toEqual([{ type: 'campfire', x: 5, y: 6 }]);
  });
});
