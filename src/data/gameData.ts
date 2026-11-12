import biomes from './biomes.json';
import combat from './combat.json';
import encounters from './encounters.json';
import enemies from './enemies.json';
import items from './items.json';
import loot from './loot.json';
import recipes from './recipes.json';
import resources from './resources.json';
import shrines from './shrines.json';
import season from './season.json';
import tablets from './tablets.json';
import quests from './quests.json';
import lore from './lore.json';
import ending from './ending.json';
import fishing from './fishing.json';
import progression from './progression.json';
import stealth from './stealth.json';
import sidequests from './sidequests.json';
import setpieces from './setpieces.json';
import structures from './structures.json';
import survival from './survival.json';
import { validateGameData, type GameData, type ItemDef } from './schema';

/** Raw JSON bundle (also used by tests). */
export const RAW_GAME_DATA = {
  items,
  loot,
  resources,
  recipes,
  structures,
  survival,
  biomes,
  enemies,
  encounters,
  combat,
  shrines,
  season,
  tablets,
  quests,
  lore,
  ending,
  fishing,
  progression,
  stealth,
  sidequests,
  setpieces,
};

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
