import type { LootTable } from '../data/schema';
import type { ItemStack } from './Inventory';

/** Rolls a loot table with the given RNG. Same rng sequence → same drops. Quantities are merged per item. */
export function rollLoot(table: LootTable, rng: () => number): ItemStack[] {
  const totals = new Map<string, number>();
  const add = (item: string, qty: number) => totals.set(item, (totals.get(item) ?? 0) + qty);
  const between = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

  for (const g of table.guaranteed) add(g.item, between(g.min, g.max));

  const totalWeight = table.entries.reduce((sum, e) => sum + e.weight, 0);
  if (totalWeight > 0) {
    const rolls = between(table.rolls.min, table.rolls.max);
    for (let r = 0; r < rolls; r++) {
      let pick = rng() * totalWeight;
      for (const e of table.entries) {
        pick -= e.weight;
        if (pick < 0) {
          add(e.item, between(e.min, e.max));
          break;
        }
      }
    }
  }
  return [...totals].map(([item, qty]) => ({ item, qty }));
}
