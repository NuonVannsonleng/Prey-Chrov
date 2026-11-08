import { describe, expect, it } from 'vitest';
import { RAW_GAME_DATA } from '../data/gameData';
import { validateGameData } from '../data/schema';
import { SAVE_KEY, SAVE_VERSION, parseSave, readSave, writeSave, type SaveData } from '../systems/Save';
import { clampSelected, sanitizeInventory } from '../systems/SaveGame';

const data = validateGameData(RAW_GAME_DATA);

const full: SaveData = {
  version: SAVE_VERSION,
  savedAt: 1_700_000_000_000,
  clockSeconds: 650,
  player: { x: 900, y: 600, health: 70, hunger: 60, thirst: 50, stamina: 90 },
  inventory: [{ item: 'stone_axe', qty: 1, durability: 40 }, null, { item: 'wood', qty: 12 }],
  selected: 2,
  structures: [{ type: 'campfire', x: 1000, y: 640 }],
  nodes: [{ id: 3, hp: 0, depleted: true, respawnInMs: 5000, harvests: 2 }],
  pickups: [{ item: 'stick', qty: 2, x: 950, y: 610 }],
  objectives: ['gather', 'craft_axe'],
};

describe('parseSave', () => {
  it('round-trips a full save', () => {
    const r = parseSave(JSON.stringify(full));
    expect('data' in r && r.data).toEqual(full);
  });

  it('loads partial saves with safe defaults', () => {
    const r = parseSave(JSON.stringify({ version: 1, savedAt: 5 }));
    expect('data' in r).toBe(true);
    if (!('data' in r)) return;
    expect(r.data.inventory).toEqual([]);
    expect(r.data.structures).toEqual([]);
    expect(Number.isNaN(r.data.player.x)).toBe(true);
    expect(r.data.clockSeconds).toBe(0);
  });

  it('drops malformed entries instead of crashing', () => {
    const r = parseSave(
      JSON.stringify({
        ...full,
        inventory: [{ item: 'wood', qty: -3 }, 'junk', { qty: 2 }, { item: 'wood', qty: 2, durability: 'x' }],
        structures: [{ type: 'campfire' }, { type: 'campfire', x: 1, y: 2 }, null],
        nodes: [{ id: -1 }, { id: 2.5 }, { id: 4, hp: 'a' }],
        pickups: [{ item: 'stick', qty: 1, x: 'no', y: 0 }],
        objectives: ['gather', 7],
        clockSeconds: -100,
      }),
    );
    expect('data' in r).toBe(true);
    if (!('data' in r)) return;
    expect(r.data.inventory).toEqual([null, null, null, { item: 'wood', qty: 2 }]);
    expect(r.data.structures).toEqual([{ type: 'campfire', x: 1, y: 2 }]);
    expect(r.data.nodes.map((n) => n.id)).toEqual([4]);
    expect(r.data.pickups).toEqual([]);
    expect(r.data.objectives).toEqual(['gather']);
    expect(r.data.clockSeconds).toBe(0);
  });

  it('rejects corrupt, versionless and newer saves', () => {
    expect(parseSave('{oops')).toEqual({ error: { kind: 'corrupt', reason: 'not valid JSON' } });
    expect('error' in parseSave('{"savedAt":1}')).toBe(true);
    expect(parseSave(JSON.stringify({ version: SAVE_VERSION + 1, savedAt: 1 }))).toEqual({
      error: { kind: 'newer', version: SAVE_VERSION + 1 },
    });
    expect(parseSave(null)).toEqual({ error: { kind: 'none' } });
  });
});

describe('read/write', () => {
  it('writes and reads through injected storage; storage errors never throw', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    expect(writeSave(full, storage)).toBe(true);
    expect(mem.has(SAVE_KEY)).toBe(true);
    const r = readSave(storage);
    expect('data' in r && r.data.clockSeconds).toBe(650);
    const broken = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(writeSave(full, broken)).toBe(false);
    expect(writeSave(full, null)).toBe(false);
  });
});

describe('sanitizeInventory', () => {
  it('removes unknown items (counted), clamps stacks and durability', () => {
    const { slots, removed } = sanitizeInventory(
      [
        { item: 'wood', qty: 999 },
        { item: 'ancient_relic_v9', qty: 1 },
        { item: 'stone_axe', qty: 1, durability: 99999 },
        { item: 'torch', qty: 1 },
      ],
      data,
      20,
    );
    expect(removed).toBe(1);
    expect(slots).toHaveLength(20);
    expect(slots[0]).toEqual({ item: 'wood', qty: data.items.get('wood')!.stackSize });
    expect(slots[1]).toBeNull();
    expect(slots[2]?.durability).toBe(data.items.get('stone_axe')!.tool!.durability);
    expect(slots[3]?.durability).toBe(data.items.get('torch')!.light!.burnSeconds);
  });

  it('clamps the selected hotbar slot', () => {
    expect(clampSelected(3)).toBe(3);
    expect(clampSelected(9)).toBe(0);
    expect(clampSelected(-1)).toBe(0);
    expect(clampSelected(1.5)).toBe(0);
  });
});
