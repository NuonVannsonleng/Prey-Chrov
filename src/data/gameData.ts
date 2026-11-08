import items from './items.json';
import loot from './loot.json';
import recipes from './recipes.json';
import resources from './resources.json';
import structures from './structures.json';
import survival from './survival.json';
import { validateGameData, type GameData, type ItemDef } from './schema';

/** Raw JSON bundle (also used by tests). */
export const RAW_GAME_DATA = { items, loot, resources, recipes, structures, survival };

let cached: GameData | null = null;

/** Validated game data. Throws DataValidationError (listing every problem) on bad JSON. */
export function getGameData(): GameData {
  if (!cached) cached = validateGameData(RAW_GAME_DATA);
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
