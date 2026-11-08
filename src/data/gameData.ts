import items from './items.json';
import loot from './loot.json';
import resources from './resources.json';
import { validateGameData, type GameData, type ItemDef } from './schema';

let cached: GameData | null = null;

/** Validated game data. Throws DataValidationError (listing every problem) on bad JSON. */
export function getGameData(): GameData {
  if (!cached) cached = validateGameData(items, loot, resources);
  return cached;
}

export function itemDef(id: string): ItemDef {
  const def = getGameData().items.get(id);
  if (!def) throw new Error(`Unknown item "${id}"`);
  return def;
}

export function itemStackSize(id: string): number {
  return getGameData().items.get(id)?.stackSize ?? 1;
}
