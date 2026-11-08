import type { RecipeDef, Station } from '../data/schema';
import type { Inventory } from './Inventory';

export interface MissingIngredient {
  item: string;
  have: number;
  need: number;
}

export interface CraftCheck {
  ok: boolean;
  missing: MissingIngredient[];
  /** Station the recipe needs that isn't nearby, or null. */
  needsStation: Station | null;
}

export type CraftResult = { ok: true } | { ok: false; reason: 'missing' | 'station' | 'no-room' };

export function checkRecipe(recipe: RecipeDef, inv: Inventory, stations: ReadonlySet<Station>): CraftCheck {
  const missing: MissingIngredient[] = [];
  for (const g of recipe.ingredients) {
    const have = inv.count(g.item);
    if (have < g.qty) missing.push({ item: g.item, have, need: g.qty });
  }
  const needsStation = recipe.station !== 'none' && !stations.has(recipe.station) ? recipe.station : null;
  return { ok: missing.length === 0 && needsStation === null, missing, needsStation };
}

/**
 * Crafts atomically: ingredients are removed and the output added, or nothing changes.
 * `durabilityFor` supplies the starting durability for tool/light outputs.
 */
export function craft(
  recipe: RecipeDef,
  inv: Inventory,
  stations: ReadonlySet<Station>,
  durabilityFor: (item: string) => number | undefined,
): CraftResult {
  const check = checkRecipe(recipe, inv, stations);
  if (check.needsStation) return { ok: false, reason: 'station' };
  if (check.missing.length) return { ok: false, reason: 'missing' };

  const backup = inv.snapshot();
  for (const g of recipe.ingredients) inv.remove(g.item, g.qty);
  const leftover = inv.add(recipe.output, recipe.qty, durabilityFor(recipe.output));
  if (leftover > 0) {
    inv.restore(backup);
    return { ok: false, reason: 'no-room' };
  }
  return { ok: true };
}
