import { describe, expect, it } from 'vitest';
import { RAW_GAME_DATA } from '../data/gameData';
import { reachableItems, validateGameData } from '../data/schema';
import { Progression } from '../systems/Progression';

const data = validateGameData(RAW_GAME_DATA);
const cfg = data.progression;

describe('skills without grind', () => {
  it('one-time awards are granted once, even across a save/load round trip', () => {
    const p = new Progression(cfg);
    expect(p.award('craft_first', 'stone_axe', 1)?.xp).toBe(2);
    expect(p.award('craft_first', 'stone_axe', 1)).toBeNull();
    const reloaded = new Progression(cfg, JSON.parse(JSON.stringify(p.serialize())));
    expect(reloaded.award('craft_first', 'stone_axe', 9)).toBeNull();
    expect(reloaded.xp.crafting).toBe(2);
  });

  it('repeat awards are capped per in-game day and reset the next day', () => {
    const p = new Progression(cfg);
    const cap = cfg.sources['gather']?.dailyCap ?? 0;
    let granted = 0;
    for (let i = 0; i < 20; i++) if (p.award('gather', null, 3)) granted++;
    expect(granted).toBe(cap);
    // Reloading the same day doesn't reset the cap.
    const reloaded = new Progression(cfg, p.serialize());
    expect(reloaded.award('gather', null, 3)).toBeNull();
    expect(reloaded.award('gather', null, 4)).not.toBeNull();
  });

  it('levels follow the thresholds and report level-ups', () => {
    const p = new Progression(cfg);
    const [l1] = cfg.levels;
    let up: number | null = null;
    for (let i = 0; up === null && i < 50; i++) up = p.award('defeat_first', 'e' + i, 1)?.levelUp ?? null;
    expect(up).toBe(1);
    expect(p.xp.combat).toBeGreaterThanOrEqual(l1 ?? 0);
    expect(p.level('combat')).toBe(1);
  });

  it('every source is a one-time first or daily-capped (validated)', () => {
    for (const s of Object.values(cfg.sources)) expect(s.unique === true || (s.dailyCap ?? 0) >= 1).toBe(true);
  });
});

describe('measurable upgrades', () => {
  it('each skill level changes a number the game uses', () => {
    const p = new Progression(cfg);
    const base = p.effects();
    p.xp.foraging = p.xp.crafting = p.xp.survival = p.xp.combat = p.xp.exploration = cfg.levels[cfg.levels.length - 1] ?? 99;
    const max = p.effects();
    expect(max.foragingExtraChance).toBeGreaterThan(base.foragingExtraChance);
    expect(max.toolWear).toBeLessThan(base.toolWear);
    expect(max.drain).toBeLessThan(base.drain);
    expect(max.combatDamage).toBeGreaterThan(base.combatDamage);
    expect(max.speed).toBeGreaterThan(base.speed);
  });

  it('tier-2 tools beat stone tools; gear has real effects', () => {
    const tool = (id: string) => data.items.get(id)?.tool;
    expect(tool('flint_axe')?.durability).toBeGreaterThan(tool('stone_axe')?.durability ?? 0);
    expect(tool('flint_axe')?.damage).toBeGreaterThan(tool('stone_axe')?.damage ?? 0);
    expect(tool('fang_spear')?.damage).toBeGreaterThan(tool('spear')?.damage ?? 0);
    expect(data.items.get('hide_vest')?.gear?.damageReduction).toBeGreaterThan(0);
    expect(data.items.get('leaf_cape')?.gear?.rainWarmth).toBeLessThan(1);
    expect(data.items.get('bark_sandals')?.gear?.speed).toBeGreaterThan(0);
  });
});

describe('knowledge unlocks', () => {
  it('recipes behind knowledge are learnable from items or skill levels, never time', () => {
    for (const r of data.recipes.values()) {
      if (!r.unlock) continue;
      const k = cfg.knowledge.find((x) => x.id === r.unlock);
      expect(k, r.id).toBeDefined();
      expect(Boolean(k?.item) || Boolean(k?.skill)).toBe(true);
    }
    const reach = reachableItems(data);
    for (const k of cfg.knowledge) if (k.item) expect(reach.has(k.item), k.id).toBe(true);
  });

  it('learning is triggered by owning the item or reaching the level, and is saved', () => {
    const p = new Progression(cfg);
    expect(p.learnable(() => false).map((k) => k.id)).toEqual([]);
    expect(p.learnable((id) => id === 'hide').map((k) => k.id)).toEqual(['tanning']);
    expect(p.learn('tanning')).toBe(true);
    expect(p.learn('tanning')).toBe(false);
    p.xp.crafting = cfg.levels[0] ?? 3;
    expect(p.learnable(() => false).map((k) => k.id)).toContain('flint_working');
    const reloaded = new Progression(cfg, p.serialize());
    expect(reloaded.knows('tanning')).toBe(true);
    expect(reloaded.knows('fang_craft')).toBe(false);
    expect(new Progression(cfg, { knowledge: ['bogus'] }).knowledge.size).toBe(0);
  });
});
