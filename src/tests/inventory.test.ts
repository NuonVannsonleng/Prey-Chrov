import { describe, expect, it } from 'vitest';
import { HOTBAR_SLOTS, INVENTORY_SLOTS, Inventory } from '../systems/Inventory';

const sizes: Record<string, number> = { wood: 30, flint: 20, berries: 20, tool: 1 };
const make = (size = INVENTORY_SLOTS) => new Inventory((id) => sizes[id] ?? 10, size);

describe('Inventory', () => {
  it('has 20 slots and a 6-slot hotbar prefix', () => {
    expect(make().size).toBe(20);
    expect(HOTBAR_SLOTS).toBe(6);
  });

  it('stacks up to the item limit, then opens new slots', () => {
    const inv = make();
    expect(inv.add('wood', 45)).toBe(0);
    expect(inv.get(0)).toEqual({ item: 'wood', qty: 30 });
    expect(inv.get(1)).toEqual({ item: 'wood', qty: 15 });
    expect(inv.count('wood')).toBe(45);
  });

  it('tops up partial stacks before using empty slots', () => {
    const inv = make();
    inv.add('wood', 10);
    inv.add('berries', 1);
    inv.add('wood', 25);
    expect(inv.get(0)).toEqual({ item: 'wood', qty: 30 });
    expect(inv.get(1)).toEqual({ item: 'berries', qty: 1 });
    expect(inv.get(2)).toEqual({ item: 'wood', qty: 5 });
  });

  it('returns what does not fit and never loses or invents items', () => {
    const inv = make(2);
    expect(inv.add('wood', 70)).toBe(10);
    expect(inv.count('wood')).toBe(60);
    expect(inv.isFull()).toBe(true);
    expect(inv.capacityFor('wood')).toBe(0);
    expect(inv.add('berries', 3)).toBe(3);
  });

  it('reports capacity for partial stacks and empty slots', () => {
    const inv = make(3);
    inv.add('wood', 25);
    expect(inv.capacityFor('wood')).toBe(5 + 30 + 30);
    expect(inv.capacityFor('flint')).toBe(40);
  });

  it('ignores invalid quantities', () => {
    const inv = make();
    expect(inv.add('wood', 0)).toBe(0);
    expect(inv.add('wood', -5)).toBe(0);
    expect(inv.count('wood')).toBe(0);
  });

  it('moves into empty slots and swaps different items', () => {
    const inv = make();
    inv.add('wood', 5);
    inv.add('berries', 2);
    expect(inv.move(0, 7)).toBe(true);
    expect(inv.get(0)).toBeNull();
    expect(inv.get(7)).toEqual({ item: 'wood', qty: 5 });
    expect(inv.move(1, 7)).toBe(true);
    expect(inv.get(7)).toEqual({ item: 'berries', qty: 2 });
    expect(inv.get(1)).toEqual({ item: 'wood', qty: 5 });
  });

  it('merges same items up to the limit and keeps the remainder', () => {
    const inv = make();
    inv.add('wood', 30);
    inv.add('wood', 20);
    expect(inv.get(1)?.qty).toBe(20);
    inv.takeFromSlot(0, 15);
    expect(inv.move(1, 0)).toBe(true);
    expect(inv.get(0)).toEqual({ item: 'wood', qty: 30 });
    expect(inv.get(1)).toEqual({ item: 'wood', qty: 5 });
    expect(inv.count('wood')).toBe(35);
  });

  it('rejects merging onto a full stack and out-of-range moves', () => {
    const inv = make();
    inv.add('wood', 60);
    expect(inv.move(1, 0)).toBe(false);
    expect(inv.move(0, 0)).toBe(false);
    expect(inv.move(0, 99)).toBe(false);
    expect(inv.move(5, 0)).toBe(false);
    expect(inv.count('wood')).toBe(60);
  });

  it('splits half into the first empty slot', () => {
    const inv = make();
    inv.add('wood', 9);
    expect(inv.split(0)).toBe(1);
    expect(inv.get(0)?.qty).toBe(5);
    expect(inv.get(1)?.qty).toBe(4);
    inv.add('berries', 1);
    expect(inv.split(2)).toBe(-1);
  });

  it('cannot split when there is no empty slot', () => {
    const inv = make(2);
    inv.add('wood', 10);
    inv.add('berries', 1);
    expect(inv.split(0)).toBe(-1);
  });

  it('removes across stacks and takes from a single slot', () => {
    const inv = make();
    inv.add('wood', 40);
    expect(inv.remove('wood', 35)).toBe(35);
    expect(inv.count('wood')).toBe(5);
    expect(inv.remove('wood', 50)).toBe(5);
    expect(inv.get(0)).toBeNull();
    inv.add('berries', 4);
    expect(inv.takeFromSlot(0, 3)).toEqual({ item: 'berries', qty: 3 });
    expect(inv.takeFromSlot(0, 3)).toEqual({ item: 'berries', qty: 1 });
    expect(inv.takeFromSlot(0, 1)).toBeNull();
  });

  it('snapshots are copies', () => {
    const inv = make();
    inv.add('wood', 3);
    const snap = inv.snapshot();
    snap[0]!.qty = 99;
    expect(inv.get(0)?.qty).toBe(3);
  });
});
