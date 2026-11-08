import {
  ICON_KEYS,
  RESOURCE_SPRITES,
  STRUCTURE_SPRITES,
  type GroundTileKey,
  type IconKey,
  type ResourceSprite,
  type StructureSprite,
} from '../textures';

// ---------- Types (JSON shapes) ----------

export const ITEM_CATEGORIES = ['material', 'food', 'tool', 'light', 'structure', 'quest'] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const RARITIES = ['common', 'uncommon', 'rare'] as const;
export type Rarity = (typeof RARITIES)[number];

export const TOOL_KINDS = ['hand', 'axe', 'pickaxe', 'spear'] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];

export const RECIPE_CATEGORIES = ['tools', 'light', 'building', 'food'] as const;
export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];

export const STATIONS = ['none', 'campfire'] as const;
export type Station = (typeof STATIONS)[number];

export const STRUCTURE_INTERACTIONS = ['cook', 'sleep'] as const;
export type StructureInteraction = (typeof STRUCTURE_INTERACTIONS)[number];

/** items.json: array of ItemDef. */
export interface ItemDef {
  /** Stable snake_case id, never renamed once shipped (saves reference it). */
  id: string;
  name: string;
  /** Optional Khmer display name; flag for native-speaker review. */
  nameKm?: string;
  /** One short sentence shown in tooltips. */
  description: string;
  category: ItemCategory;
  /** Max per inventory slot, 1–999. Items with `tool` or `light` must be 1 (each has its own durability). */
  stackSize: number;
  /** "rare" items ask for confirmation before being dropped. */
  rarity: Rarity;
  icon: IconKey;
  tags: string[];
  /** Held tool: kind used for gathering multipliers; durability = successful hits before breaking. */
  tool?: { kind: Exclude<ToolKind, 'hand'>; durability: number; damage: number };
  /** Eating (F) applies these deltas. Health may be negative (e.g. raw, bitter food). */
  food?: { hunger: number; thirst: number; health: number };
  /** Using (F) enters placement mode for this structures.json id; placing consumes one. */
  places?: string;
  /** Light while held in the dark; burns `burnSeconds` of game time while lit. */
  light?: { radius: number; burnSeconds: number };
}

export interface LootEntry {
  item: string;
  /** Relative weight (> 0) among this table's weighted entries. */
  weight: number;
  min: number;
  max: number;
}

export interface GuaranteedDrop {
  item: string;
  min: number;
  max: number;
}

/** loot.json: array of LootTable. Result = all guaranteed drops + `rolls` weighted picks. */
export interface LootTable {
  id: string;
  guaranteed: GuaranteedDrop[];
  rolls: { min: number; max: number };
  entries: LootEntry[];
}

/** resources.json: array of ResourceDef (gatherable world nodes). */
export interface ResourceDef {
  id: string;
  name: string;
  /** Verb in the interaction prompt, e.g. "Chop", "Pick". */
  verb: string;
  sprite: ResourceSprite;
  /** Hit points; each hit deals damage × toolMultipliers[tool]. */
  hp: number;
  /** Game-time seconds until the node regrows after depletion (> 0). */
  respawnSeconds: number;
  lootTable: string;
  /** Damage multiplier per tool. Missing or 0 = this tool can't gather it. `hand` must be > 0. */
  toolMultipliers: Partial<Record<ToolKind, number>>;
}

export interface Ingredient {
  item: string;
  qty: number;
}

/** recipes.json: array of RecipeDef. Crafting is instant. */
export interface RecipeDef {
  id: string;
  output: string;
  qty: number;
  ingredients: Ingredient[];
  /** "campfire" recipes need a placed campfire within reach. */
  station: Station;
  category: RecipeCategory;
}

/** structures.json: array of StructureDef (placeable world objects). */
export interface StructureDef {
  id: string;
  name: string;
  sprite: StructureSprite;
  /** Collision/placement footprint at the base, px. */
  footprint: { w: number; h: number };
  solid: boolean;
  /** 0 = no light. */
  lightRadius: number;
  /** What E does when standing next to it. */
  interaction: StructureInteraction | null;
}

/** survival.json: single object with all survival / clock tuning. Rates are per game hour. */
export interface SurvivalConfig {
  maxHealth: number;
  maxHunger: number;
  maxThirst: number;
  maxStamina: number;
  hungerPerHour: number;
  thirstPerHour: number;
  starvationDamagePerHour: number;
  dehydrationDamagePerHour: number;
  /** Health regained per hour while hunger and thirst are both >= regenMinHungerThirst. */
  regenPerHour: number;
  regenMinHungerThirst: number;
  /** Below this hunger/thirst value the HUD warns. */
  warnAt: number;
  sprintStaminaPerSecond: number;
  staminaRegenPerSecond: number;
  staminaRegenDelaySeconds: number;
  /** Stamina needed to start sprinting again after exhaustion. */
  sprintMinStamina: number;
  drinkThirst: number;
  sleep: {
    /** Sleeping allowed from this hour (evening) ... */
    fromHour: number;
    /** ... until this hour (early morning). */
    untilHour: number;
    wakeHour: number;
    staminaRestore: number;
    healthRestore: number;
    hungerCost: number;
    thirstCost: number;
  };
  day: {
    /** Real seconds per full 24h day. */
    lengthSeconds: number;
    startHour: number;
  };
  /** [hour, darkness 0..1] keyframes covering 0..24, linearly interpolated. */
  darkness: Array<[number, number]>;
  /** Small light around the player so they can always see themselves. */
  playerLightRadius: number;
}

export interface GameData {
  items: ReadonlyMap<string, ItemDef>;
  loot: ReadonlyMap<string, LootTable>;
  resources: ReadonlyMap<string, ResourceDef>;
  recipes: ReadonlyMap<string, RecipeDef>;
  structures: ReadonlyMap<string, StructureDef>;
  survival: SurvivalConfig;
}

export interface RawGameData {
  items: unknown;
  loot: unknown;
  resources: unknown;
  recipes: unknown;
  structures: unknown;
  survival: unknown;
}

// ---------- Validation ----------

export class DataValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(`Game data is invalid:\n- ${problems.join('\n- ')}`);
    this.name = 'DataValidationError';
  }
}

const ID_RE = /^[a-z][a-z0-9_]*$/;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => isNum(v) && Number.isInteger(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const num = (v: unknown): number => (isNum(v) ? v : NaN);

function checkRange(p: string[], where: string, min: unknown, max: unknown, lowest: number): void {
  if (!isInt(min) || !isInt(max)) p.push(`${where}: min/max must be integers`);
  else if (min < lowest || max < min) p.push(`${where}: needs ${lowest} <= min <= max (got ${min}..${max})`);
}

function collectIds(p: string[], file: string, list: unknown): Rec[] {
  if (!Array.isArray(list)) {
    p.push(`${file}: must be a JSON array`);
    return [];
  }
  const seen = new Set<string>();
  const out: Rec[] = [];
  list.forEach((raw, i) => {
    if (!isRec(raw)) {
      p.push(`${file}[${i}]: must be an object`);
      return;
    }
    const id = raw['id'];
    if (!isStr(id) || !ID_RE.test(id)) p.push(`${file}[${i}]: id must be snake_case (got ${JSON.stringify(id)})`);
    else if (seen.has(id)) p.push(`${file}: duplicate id "${id}"`);
    else seen.add(id);
    out.push(raw);
  });
  return out;
}

function validateItems(p: string[], items: Rec[], structureIds: Set<string>): void {
  for (const it of items) {
    const w = `item "${String(it['id'])}"`;
    if (!isStr(it['name'])) p.push(`${w}: name required`);
    if (it['nameKm'] !== undefined && !isStr(it['nameKm'])) p.push(`${w}: nameKm must be a non-empty string`);
    if (!isStr(it['description'])) p.push(`${w}: description required`);
    if (!ITEM_CATEGORIES.includes(it['category'] as ItemCategory)) p.push(`${w}: unknown category ${String(it['category'])}`);
    const stack = it['stackSize'];
    if (!isInt(stack) || stack < 1 || stack > 999) p.push(`${w}: stackSize must be an integer 1–999`);
    if (!RARITIES.includes(it['rarity'] as Rarity)) p.push(`${w}: unknown rarity ${String(it['rarity'])}`);
    if (!ICON_KEYS.includes(it['icon'] as IconKey)) p.push(`${w}: unknown icon ${String(it['icon'])}`);
    if (!Array.isArray(it['tags']) || !(it['tags'] as unknown[]).every(isStr)) p.push(`${w}: tags must be a string array`);

    const tool = it['tool'];
    if (tool !== undefined) {
      if (!isRec(tool)) p.push(`${w}: tool must be an object`);
      else {
        if (!TOOL_KINDS.includes(tool['kind'] as ToolKind) || tool['kind'] === 'hand') p.push(`${w}: tool.kind must be axe|pickaxe|spear`);
        if (!isInt(tool['durability']) || num(tool['durability']) < 1) p.push(`${w}: tool.durability must be an integer >= 1`);
        if (!isNum(tool['damage']) || num(tool['damage']) <= 0) p.push(`${w}: tool.damage must be > 0`);
      }
      if (stack !== 1) p.push(`${w}: tools must have stackSize 1`);
    }
    const food = it['food'];
    if (food !== undefined) {
      if (!isRec(food) || !isNum(food['hunger']) || !isNum(food['thirst']) || !isNum(food['health']))
        p.push(`${w}: food needs numeric hunger, thirst, health`);
    }
    const places = it['places'];
    if (places !== undefined && !structureIds.has(places as string)) p.push(`${w}: places unknown structure ${String(places)}`);
    const light = it['light'];
    if (light !== undefined) {
      if (!isRec(light) || !isNum(light['radius']) || num(light['radius']) <= 0 || !isNum(light['burnSeconds']) || num(light['burnSeconds']) <= 0)
        p.push(`${w}: light needs radius > 0 and burnSeconds > 0`);
      if (stack !== 1) p.push(`${w}: light items must have stackSize 1`);
    }
  }
}

function validateLoot(p: string[], loot: Rec[], itemIds: Set<string>): void {
  for (const t of loot) {
    const w = `loot "${String(t['id'])}"`;
    const guaranteed = t['guaranteed'];
    const entries = t['entries'];
    const rolls = t['rolls'];
    if (!Array.isArray(guaranteed)) p.push(`${w}: guaranteed must be an array`);
    if (!Array.isArray(entries)) p.push(`${w}: entries must be an array`);
    if (!isRec(rolls)) p.push(`${w}: rolls {min,max} required`);
    else checkRange(p, `${w} rolls`, rolls['min'], rolls['max'], 0);
    if (Array.isArray(guaranteed)) {
      guaranteed.forEach((g: unknown, i) => {
        if (!isRec(g)) return void p.push(`${w} guaranteed[${i}]: must be an object`);
        if (!itemIds.has(g['item'] as string)) p.push(`${w} guaranteed[${i}]: unknown item ${String(g['item'])}`);
        checkRange(p, `${w} guaranteed[${i}]`, g['min'], g['max'], 1);
      });
    }
    if (Array.isArray(entries)) {
      entries.forEach((e: unknown, i) => {
        if (!isRec(e)) return void p.push(`${w} entries[${i}]: must be an object`);
        if (!itemIds.has(e['item'] as string)) p.push(`${w} entries[${i}]: unknown item ${String(e['item'])}`);
        if (!isNum(e['weight']) || num(e['weight']) <= 0) p.push(`${w} entries[${i}]: weight must be > 0`);
        checkRange(p, `${w} entries[${i}]`, e['min'], e['max'], 1);
      });
      if (isRec(rolls) && isInt(rolls['max']) && num(rolls['max']) > 0 && entries.length === 0)
        p.push(`${w}: rolls > 0 but no weighted entries`);
    }
    if (Array.isArray(guaranteed) && Array.isArray(entries) && guaranteed.length === 0 && entries.length === 0)
      p.push(`${w}: drops nothing`);
  }
}

function validateResources(p: string[], resources: Rec[], lootIds: Set<string>): void {
  for (const r of resources) {
    const w = `resource "${String(r['id'])}"`;
    if (!isStr(r['name'])) p.push(`${w}: name required`);
    if (!isStr(r['verb'])) p.push(`${w}: verb required`);
    if (!RESOURCE_SPRITES.includes(r['sprite'] as ResourceSprite)) p.push(`${w}: unknown sprite ${String(r['sprite'])}`);
    if (!isInt(r['hp']) || num(r['hp']) < 1) p.push(`${w}: hp must be an integer >= 1`);
    if (!isNum(r['respawnSeconds']) || num(r['respawnSeconds']) <= 0) p.push(`${w}: respawnSeconds must be > 0`);
    if (!lootIds.has(r['lootTable'] as string)) p.push(`${w}: unknown lootTable ${String(r['lootTable'])}`);
    const tm = r['toolMultipliers'];
    if (!isRec(tm)) p.push(`${w}: toolMultipliers required`);
    else {
      for (const [k, v] of Object.entries(tm)) {
        if (!TOOL_KINDS.includes(k as ToolKind)) p.push(`${w}: unknown tool ${k}`);
        if (!isNum(v) || v < 0) p.push(`${w}: toolMultipliers.${k} must be >= 0`);
      }
      if (!isNum(tm['hand']) || num(tm['hand']) <= 0) p.push(`${w}: toolMultipliers.hand must be > 0`);
    }
  }
}

function validateRecipes(p: string[], recipes: Rec[], itemIds: Set<string>): void {
  for (const r of recipes) {
    const w = `recipe "${String(r['id'])}"`;
    if (!itemIds.has(r['output'] as string)) p.push(`${w}: unknown output ${String(r['output'])}`);
    if (!isInt(r['qty']) || num(r['qty']) < 1) p.push(`${w}: qty must be an integer >= 1`);
    if (!STATIONS.includes(r['station'] as Station)) p.push(`${w}: unknown station ${String(r['station'])}`);
    if (!RECIPE_CATEGORIES.includes(r['category'] as RecipeCategory)) p.push(`${w}: unknown category ${String(r['category'])}`);
    const ing = r['ingredients'];
    if (!Array.isArray(ing) || ing.length === 0) {
      p.push(`${w}: ingredients must be a non-empty array`);
      continue;
    }
    const seen = new Set<string>();
    ing.forEach((g: unknown, i) => {
      if (!isRec(g)) return void p.push(`${w} ingredients[${i}]: must be an object`);
      const item = g['item'] as string;
      if (!itemIds.has(item)) p.push(`${w} ingredients[${i}]: unknown item ${String(item)}`);
      if (seen.has(item)) p.push(`${w}: ingredient ${item} listed twice`);
      seen.add(item);
      if (item === r['output']) p.push(`${w}: uses its own output as an ingredient`);
      if (!isInt(g['qty']) || num(g['qty']) < 1) p.push(`${w} ingredients[${i}]: qty must be an integer >= 1`);
    });
  }
}

function validateStructures(p: string[], structures: Rec[]): void {
  for (const s of structures) {
    const w = `structure "${String(s['id'])}"`;
    if (!isStr(s['name'])) p.push(`${w}: name required`);
    if (!STRUCTURE_SPRITES.includes(s['sprite'] as StructureSprite)) p.push(`${w}: unknown sprite ${String(s['sprite'])}`);
    const fp = s['footprint'];
    if (!isRec(fp) || !isNum(fp['w']) || !isNum(fp['h']) || num(fp['w']) <= 0 || num(fp['h']) <= 0)
      p.push(`${w}: footprint {w,h} must be > 0`);
    if (typeof s['solid'] !== 'boolean') p.push(`${w}: solid must be boolean`);
    if (!isNum(s['lightRadius']) || num(s['lightRadius']) < 0) p.push(`${w}: lightRadius must be >= 0`);
    const inter = s['interaction'];
    if (inter !== null && !STRUCTURE_INTERACTIONS.includes(inter as StructureInteraction))
      p.push(`${w}: interaction must be null, "cook" or "sleep"`);
  }
}

function validateSurvival(p: string[], s: unknown): void {
  if (!isRec(s)) {
    p.push('survival.json: must be an object');
    return;
  }
  const positive = ['maxHealth', 'maxHunger', 'maxThirst', 'maxStamina', 'sprintStaminaPerSecond', 'staminaRegenPerSecond', 'drinkThirst'];
  const nonNegative = [
    'hungerPerHour',
    'thirstPerHour',
    'starvationDamagePerHour',
    'dehydrationDamagePerHour',
    'regenPerHour',
    'regenMinHungerThirst',
    'warnAt',
    'staminaRegenDelaySeconds',
    'sprintMinStamina',
    'playerLightRadius',
  ];
  for (const k of positive) if (!isNum(s[k]) || num(s[k]) <= 0) p.push(`survival.${k} must be > 0`);
  for (const k of nonNegative) if (!isNum(s[k]) || num(s[k]) < 0) p.push(`survival.${k} must be >= 0`);
  const sleep = s['sleep'];
  if (!isRec(sleep)) p.push('survival.sleep required');
  else {
    for (const k of ['fromHour', 'untilHour', 'wakeHour'])
      if (!isNum(sleep[k]) || num(sleep[k]) < 0 || num(sleep[k]) >= 24) p.push(`survival.sleep.${k} must be 0–23.99`);
    for (const k of ['staminaRestore', 'healthRestore', 'hungerCost', 'thirstCost'])
      if (!isNum(sleep[k]) || num(sleep[k]) < 0) p.push(`survival.sleep.${k} must be >= 0`);
  }
  const day = s['day'];
  if (!isRec(day) || !isNum(day['lengthSeconds']) || num(day['lengthSeconds']) < 60 || !isNum(day['startHour']) || num(day['startHour']) < 0 || num(day['startHour']) >= 24)
    p.push('survival.day needs lengthSeconds >= 60 and startHour 0–23.99');
  const dark = s['darkness'];
  if (!Array.isArray(dark) || dark.length < 2) p.push('survival.darkness needs at least 2 [hour, value] keyframes');
  else {
    let last = -1;
    dark.forEach((k: unknown, i) => {
      if (!Array.isArray(k) || k.length !== 2 || !isNum(k[0]) || !isNum(k[1])) return void p.push(`survival.darkness[${i}] must be [hour, value]`);
      const [h, v] = k as [number, number];
      if (h < 0 || h > 24 || h < last) p.push(`survival.darkness[${i}]: hours must be ascending within 0–24`);
      if (v < 0 || v > 1) p.push(`survival.darkness[${i}]: value must be 0–1`);
      last = h;
    });
    const first = dark[0] as unknown[];
    const end = dark[dark.length - 1] as unknown[];
    if (first?.[0] !== 0 || end?.[0] !== 24) p.push('survival.darkness must start at hour 0 and end at hour 24');
  }
}

/** Validates raw JSON and returns typed lookup maps. Throws DataValidationError listing every problem. */
export function validateGameData(raw: RawGameData): GameData {
  const p: string[] = [];
  const items = collectIds(p, 'items.json', raw.items);
  const loot = collectIds(p, 'loot.json', raw.loot);
  const resources = collectIds(p, 'resources.json', raw.resources);
  const recipes = collectIds(p, 'recipes.json', raw.recipes);
  const structures = collectIds(p, 'structures.json', raw.structures);
  const ids = (list: Rec[]) => new Set(list.map((i) => i['id']).filter(isStr));
  const itemIds = ids(items);

  validateItems(p, items, ids(structures));
  validateLoot(p, loot, itemIds);
  validateResources(p, resources, ids(loot));
  validateRecipes(p, recipes, itemIds);
  validateStructures(p, structures);
  validateSurvival(p, raw.survival);

  if (p.length) throw new DataValidationError(p);

  const data: GameData = {
    items: new Map((items as unknown as ItemDef[]).map((i) => [i.id, i])),
    loot: new Map((loot as unknown as LootTable[]).map((l) => [l.id, l])),
    resources: new Map((resources as unknown as ResourceDef[]).map((r) => [r.id, r])),
    recipes: new Map((recipes as unknown as RecipeDef[]).map((r) => [r.id, r])),
    structures: new Map((structures as unknown as StructureDef[]).map((s) => [s.id, s])),
    survival: raw.survival as SurvivalConfig,
  };

  // Reachability: every item must be gatherable or craftable from gatherable items.
  const reachable = reachableItems(data);
  const unreachable = [...data.items.keys()].filter((id) => !reachable.has(id));
  if (unreachable.length) throw new DataValidationError([`unobtainable items: ${unreachable.join(', ')}`]);
  return data;
}

/** Items that some resource node can actually drop (directly obtainable in the world). */
export function obtainableItems(data: Pick<GameData, 'resources' | 'loot'>): Set<string> {
  const out = new Set<string>();
  for (const res of data.resources.values()) {
    const table = data.loot.get(res.lootTable);
    if (!table) continue;
    for (const g of table.guaranteed) out.add(g.item);
    if (table.rolls.max > 0) for (const e of table.entries) out.add(e.item);
  }
  return out;
}

/**
 * Fixed-point closure: gatherable items, plus outputs of recipes whose ingredients are all
 * reachable. Campfire-station recipes count only once the campfire item itself is reachable.
 */
export function reachableItems(data: Pick<GameData, 'resources' | 'loot' | 'recipes' | 'items'>): Set<string> {
  const have = obtainableItems(data);
  const campfireItems = [...data.items.values()].filter((i) => i.places === 'campfire').map((i) => i.id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of data.recipes.values()) {
      if (have.has(r.output)) continue;
      if (r.station === 'campfire' && !campfireItems.some((id) => have.has(id))) continue;
      if (r.ingredients.every((g) => have.has(g.item))) {
        have.add(r.output);
        changed = true;
      }
    }
  }
  return have;
}

// ---------- Biomes (biomes.json) ----------

/** Biome ids are fixed: world generation logic decides where each one appears. */
export const BIOME_IDS = ['clearing', 'deep_jungle', 'bamboo_grove', 'river_swamp', 'ancient_ruins'] as const;
export type BiomeId = (typeof BIOME_IDS)[number];

export interface BiomeProp {
  /** "resource" → resources.json id; "scenery" → a SCENERY_SPRITES key. */
  kind: 'resource' | 'scenery';
  id: string;
  /** Expected number per 32×32-tile chunk of this biome (before spacing rules reject some). */
  density: number;
}

export interface BiomeDef {
  id: BiomeId;
  name: string;
  nameKm?: string;
  /** #rrggbb minimap colour. */
  minimapColor: string;
  /** Weighted ground tile keys (GROUND_TILE_KEYS). */
  ground: Array<{ tile: GroundTileKey; weight: number }>;
  props: BiomeProp[];
  /** Short mood description (used for ambience/audio later). */
  ambience: string;
  /** Multiplier for night threat spawns (M5). 1 = normal. */
  nightDanger: number;
}
