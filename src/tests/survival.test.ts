import { describe, expect, it } from 'vitest';
import { RAW_GAME_DATA } from '../data/gameData';
import { validateGameData } from '../data/schema';
import { GameClock, darknessAt, inHourWindow, phaseOf } from '../systems/Clock';
import { checkRecipe, craft } from '../systems/Crafting';
import { Inventory } from '../systems/Inventory';
import { Survival } from '../systems/Survival';

const data = validateGameData(RAW_GAME_DATA);
const cfg = data.survival;
const sph = cfg.day.lengthSeconds / 24;

describe('GameClock', () => {
  it('starts at the configured hour on day 1', () => {
    const c = new GameClock(cfg.day);
    expect(c.dayNumber).toBe(1);
    expect(c.hour).toBeCloseTo(cfg.day.startHour);
  });

  it('rolls over to day 2 after midnight', () => {
    const c = new GameClock(cfg.day);
    c.advance(c.secondsUntil(0) + 1);
    expect(c.dayNumber).toBe(2);
    expect(c.hour).toBeLessThan(0.1);
  });

  it('secondsUntil is always positive and within a day', () => {
    const c = new GameClock(cfg.day);
    expect(c.secondsUntil(c.hour)).toBeCloseTo(cfg.day.lengthSeconds);
    expect(c.secondsUntil(c.hour + 1)).toBeCloseTo(sph);
  });

  it('ignores non-finite and negative advances', () => {
    const c = new GameClock(cfg.day);
    const t = c.totalSeconds;
    c.advance(Number.NaN);
    c.advance(-50);
    expect(c.totalSeconds).toBe(t);
  });

  it('formats HH:MM', () => {
    const c = new GameClock(cfg.day, 7.5 * sph);
    expect(c.label()).toBe('07:30');
  });
});

describe('darkness', () => {
  it('is light at noon and dark at midnight', () => {
    expect(darknessAt(12, cfg.darkness)).toBe(0);
    expect(darknessAt(0, cfg.darkness)).toBeGreaterThan(0.6);
    expect(phaseOf(darknessAt(12, cfg.darkness), 12)).toBe('Day');
    expect(phaseOf(darknessAt(1, cfg.darkness), 1)).toBe('Night');
  });

  it('interpolates smoothly between keyframes', () => {
    const keys: Array<[number, number]> = [
      [0, 1],
      [10, 0],
      [24, 0],
    ];
    expect(darknessAt(5, keys)).toBeCloseTo(0.5);
  });

  it('wrap-around hour windows', () => {
    expect(inHourWindow(23, 18, 5)).toBe(true);
    expect(inHourWindow(3, 18, 5)).toBe(true);
    expect(inHourWindow(12, 18, 5)).toBe(false);
    expect(inHourWindow(10, 8, 12)).toBe(true);
  });
});

describe('Survival', () => {
  it('drains hunger and thirst by game hours, not frames', () => {
    const a = new Survival(cfg);
    const b = new Survival(cfg);
    for (let i = 0; i < 60; i++) a.update(1, sph, false);
    for (let i = 0; i < 600; i++) b.update(0.1, sph, false);
    expect(a.stats.hunger).toBeCloseTo(b.stats.hunger, 5);
    expect(a.stats.thirst).toBeCloseTo(b.stats.thirst, 5);
    expect(a.stats.thirst).toBeCloseTo(cfg.maxThirst - cfg.thirstPerHour * (60 / sph), 5);
  });

  it('dehydration damages, can kill, and records the cause', () => {
    const s = new Survival(cfg, { thirst: 0, health: 5 });
    s.update(sph * 2, sph, false);
    expect(s.dead).toBe(true);
    expect(s.lastDamageCause).toBe('dehydration');
  });

  it('starvation can kill', () => {
    const s = new Survival(cfg, { hunger: 0, thirst: 100, health: 2 });
    s.update(sph * 2, sph, false);
    expect(s.dead).toBe(true);
    expect(s.lastDamageCause).toBe('starvation');
  });

  it('warns before damage starts', () => {
    const s = new Survival(cfg, { thirst: cfg.warnAt - 1 });
    expect(s.thirsty).toBe(true);
    const h = s.stats.health;
    s.update(1, sph, false);
    expect(s.stats.health).toBeGreaterThanOrEqual(h);
  });

  it('sprinting drains stamina, exhaustion blocks sprint until recovered', () => {
    const s = new Survival(cfg);
    for (let i = 0; i < 200 && !s.exhausted; i++) s.update(0.1, sph, true);
    expect(s.exhausted).toBe(true);
    expect(s.canSprint).toBe(false);
    for (let i = 0; i < 200 && s.exhausted; i++) s.update(0.1, sph, false);
    expect(s.canSprint).toBe(true);
    expect(s.stats.stamina).toBeGreaterThanOrEqual(cfg.sprintMinStamina);
  });

  it('eating, raw food penalties and drinking clamp to limits', () => {
    const s = new Survival(cfg, { hunger: 10, thirst: 10, health: 50 });
    s.eat({ hunger: 500, thirst: 0, health: -3 });
    expect(s.stats.hunger).toBe(cfg.maxHunger);
    expect(s.stats.health).toBe(47);
    s.drink();
    expect(s.stats.thirst).toBe(Math.min(cfg.maxThirst, 10 + cfg.drinkThirst));
  });

  it('sleep never kills', () => {
    const s = new Survival(cfg, { hunger: 2, thirst: 2, health: 1 });
    s.sleep();
    expect(s.dead).toBe(false);
    expect(s.stats.hunger).toBeGreaterThan(0);
    expect(s.stats.thirst).toBeGreaterThan(0);
  });

  it('dead players stop updating', () => {
    const s = new Survival(cfg, { health: 0 });
    s.update(100, sph, false);
    expect(s.stats.health).toBe(0);
  });
});

describe('Crafting', () => {
  const inv = () => new Inventory((id) => data.items.get(id)?.stackSize ?? 1);
  const axe = data.recipes.get('stone_axe')!;
  const roast = [...data.recipes.values()].find((r) => r.station === 'campfire')!;
  const dur = (id: string) => data.items.get(id)?.tool?.durability;

  it('reports missing ingredients and blocks crafting without changing the inventory', () => {
    const i = inv();
    i.add('stone', 1);
    const check = checkRecipe(axe, i, new Set());
    expect(check.ok).toBe(false);
    expect(check.missing.length).toBeGreaterThan(0);
    const before = JSON.stringify(i.snapshot());
    expect(craft(axe, i, new Set(), dur)).toEqual({ ok: false, reason: 'missing' });
    expect(JSON.stringify(i.snapshot())).toBe(before);
  });

  it('crafts atomically and gives tools full durability', () => {
    const i = inv();
    for (const g of axe.ingredients) i.add(g.item, g.qty);
    expect(craft(axe, i, new Set(), dur)).toEqual({ ok: true });
    for (const g of axe.ingredients) expect(i.count(g.item)).toBe(0);
    const slot = i.snapshot().find((s) => s?.item === axe.output);
    expect(slot?.durability).toBe(dur(axe.output));
  });

  it('station recipes need the station', () => {
    const i = inv();
    for (const g of roast.ingredients) i.add(g.item, g.qty);
    expect(craft(roast, i, new Set(), dur)).toEqual({ ok: false, reason: 'station' });
    expect(craft(roast, i, new Set(['campfire']), dur)).toEqual({ ok: true });
  });

  it('rolls back when the output does not fit', () => {
    const i = new Inventory((id) => data.items.get(id)?.stackSize ?? 1, 3);
    for (const g of axe.ingredients) i.add(g.item, g.qty * 2);
    const before = JSON.stringify(i.snapshot());
    const res = craft(axe, i, new Set(), dur);
    if (!res.ok) {
      expect(res.reason).toBe('no-room');
      expect(JSON.stringify(i.snapshot())).toBe(before);
    }
  });

  it('tool durability wears and breaks', () => {
    const i = inv();
    i.add('stone_axe', 1, 2);
    expect(i.wear(0, 1)).toBe('ok');
    expect(i.wear(0, 1)).toBe('broke');
    expect(i.get(0)).toBeNull();
    expect(i.wear(0, 1)).toBe('none');
  });

  it('items with durability never merge', () => {
    const i = inv();
    i.add('torch', 1, 50);
    i.add('torch', 1, 170);
    expect(i.get(0)?.durability).toBe(50);
    expect(i.get(1)?.durability).toBe(170);
    expect(i.move(1, 0)).toBe(true);
    expect(i.get(0)?.durability).toBe(170);
  });
});
