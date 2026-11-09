import {
  CREATURE_SPRITES,
  GROUND_TILE_KEYS,
  ICON_KEYS,
  RESOURCE_SPRITES,
  SCENERY_SPRITES,
  STRUCTURE_SPRITES,
  type GroundTileKey,
  type IconKey,
  type ResourceSprite,
  type CreatureSprite,
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
  biomes: ReadonlyMap<BiomeId, BiomeDef>;
  enemies: ReadonlyMap<string, EnemyDef>;
  encounters: EncounterConfig;
  combat: CombatConfig;
  shrines: ShrineConfig;
  season: SeasonConfig;
  tablets: readonly TabletDef[];
  quests: ReadonlyMap<string, QuestDef>;
  lore: LoreConfig;
  ending: EndingConfig;
}

export interface RawGameData {
  items: unknown;
  loot: unknown;
  resources: unknown;
  recipes: unknown;
  structures: unknown;
  survival: unknown;
  biomes: unknown;
  enemies: unknown;
  encounters: unknown;
  combat: unknown;
  shrines: unknown;
  season: unknown;
  tablets: unknown;
  quests: unknown;
  lore: unknown;
  ending: unknown;
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

function validateBiomes(p: string[], biomes: Rec[], resourceIds: Set<string>): void {
  const ids = new Set(biomes.map((b) => b['id']));
  for (const id of BIOME_IDS) if (!ids.has(id)) p.push(`biomes.json: missing biome "${id}"`);
  for (const b of biomes) {
    const w = `biome "${String(b['id'])}"`;
    if (!BIOME_IDS.includes(b['id'] as BiomeId)) p.push(`${w}: id must be one of ${BIOME_IDS.join(', ')}`);
    if (!isStr(b['name'])) p.push(`${w}: name required`);
    if (b['nameKm'] !== undefined && !isStr(b['nameKm'])) p.push(`${w}: nameKm must be a non-empty string`);
    if (typeof b['minimapColor'] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(b['minimapColor'] as string))
      p.push(`${w}: minimapColor must be #rrggbb`);
    if (!isStr(b['ambience'])) p.push(`${w}: ambience required`);
    if (!isNum(b['nightDanger']) || num(b['nightDanger']) < 0) p.push(`${w}: nightDanger must be >= 0`);
    const ground = b['ground'];
    if (!Array.isArray(ground) || ground.length === 0) p.push(`${w}: ground must be a non-empty array`);
    else
      ground.forEach((g: unknown, i) => {
        if (!isRec(g) || !GROUND_TILE_KEYS.includes(g['tile'] as GroundTileKey)) p.push(`${w} ground[${i}]: unknown tile ${String(isRec(g) ? g['tile'] : g)}`);
        else if (!isNum(g['weight']) || num(g['weight']) <= 0) p.push(`${w} ground[${i}]: weight must be > 0`);
      });
    const props = b['props'];
    if (!Array.isArray(props)) p.push(`${w}: props must be an array`);
    else
      props.forEach((pr: unknown, i) => {
        if (!isRec(pr)) return void p.push(`${w} props[${i}]: must be an object`);
        const kind = pr['kind'];
        if (kind === 'resource') {
          if (!resourceIds.has(pr['id'] as string)) p.push(`${w} props[${i}]: unknown resource ${String(pr['id'])}`);
        } else if (kind === 'scenery') {
          if (!(SCENERY_SPRITES as readonly string[]).includes(pr['id'] as string)) p.push(`${w} props[${i}]: unknown scenery ${String(pr['id'])}`);
        } else p.push(`${w} props[${i}]: kind must be resource or scenery`);
        if (!isNum(pr['density']) || num(pr['density']) < 0 || num(pr['density']) > 200) p.push(`${w} props[${i}]: density must be 0–200`);
      });
  }
}

function requireNumbers(p: string[], where: string, rec: unknown, keys: string[], min: number, max = Infinity): void {
  if (!isRec(rec)) return void p.push(`${where}: must be an object`);
  for (const k of keys) {
    const v = rec[k];
    if (!isNum(v) || v < min || v > max) p.push(`${where}.${k} must be a number in ${min}..${max}`);
  }
}

function validateEnemies(p: string[], enemies: Rec[], lootIds: Set<string>): void {
  for (const e of enemies) {
    const w = `enemy "${String(e['id'])}"`;
    if (!isStr(e['name'])) p.push(`${w}: name required`);
    if (!isStr(e['description'])) p.push(`${w}: description required`);
    if (e['kind'] !== 'wildlife' && e['kind'] !== 'spirit') p.push(`${w}: kind must be wildlife or spirit`);
    if (!CREATURE_SPRITES.includes(e['sprite'] as CreatureSprite)) p.push(`${w}: unknown sprite ${String(e['sprite'])}`);
    if (!['day', 'night', 'any'].includes(e['active'] as string)) p.push(`${w}: active must be day, night or any`);
    if (!ENEMY_BEHAVIORS.includes(e['behavior'] as EnemyBehavior)) p.push(`${w}: unknown behavior ${String(e['behavior'])}`);
    requireNumbers(p, w, e, ['hp', 'speed', 'attackRange', 'attackCooldownMs', 'aggroRadius', 'leashRadius'], 1);
    requireNumbers(p, w, e, ['damage', 'telegraphMs'], 0);
    requireNumbers(p, w, e, ['fleeBelowHp'], 0, 1);
    if (isNum(e['telegraphMs']) && num(e['telegraphMs']) < 200) p.push(`${w}: telegraphMs must be >= 200 (fair warning)`);
    if (isNum(e['leashRadius']) && isNum(e['aggroRadius']) && num(e['leashRadius']) < num(e['aggroRadius']))
      p.push(`${w}: leashRadius must be >= aggroRadius`);
    if (!lootIds.has(e['lootTable'] as string)) p.push(`${w}: unknown lootTable ${String(e['lootTable'])}`);
    if (typeof e['avoidsLight'] !== 'boolean') p.push(`${w}: avoidsLight must be boolean`);
    if (typeof e['flying'] !== 'boolean') p.push(`${w}: flying must be boolean`);
    if (e['kind'] === 'spirit' && e['active'] !== 'night') p.push(`${w}: spirits must be night-only`);
    if (e['kind'] === 'spirit' && e['avoidsLight'] !== true) p.push(`${w}: spirits must avoid light (the torch/fire promise)`);
    const spawn = e['spawn'];
    if (!isRec(spawn)) p.push(`${w}: spawn required`);
    else {
      requireNumbers(p, `${w} spawn`, spawn, ['weight', 'minDay', 'maxAlive'], 0);
      const b = spawn['biomes'];
      if (!isRec(b) || Object.keys(b).length === 0) p.push(`${w} spawn.biomes must list at least one biome`);
      else for (const [k, v] of Object.entries(b)) {
        if (!BIOME_IDS.includes(k as BiomeId)) p.push(`${w} spawn.biomes: unknown biome ${k}`);
        if (!isNum(v) || v < 0) p.push(`${w} spawn.biomes.${k} must be >= 0`);
      }
    }
    const behavior = e['behavior'];
    if ((behavior === 'charger' || behavior === 'stalker' || behavior === 'flier') && !isRec(e['charge'])) p.push(`${w}: ${String(behavior)} needs charge`);
    if (e['charge'] !== undefined) requireNumbers(p, `${w} charge`, e['charge'], ['speed', 'durationMs'], 1);
    if (behavior === 'caster' && !isRec(e['projectile'])) p.push(`${w}: caster needs projectile`);
    if (e['projectile'] !== undefined) requireNumbers(p, `${w} projectile`, e['projectile'], ['speed', 'damage', 'range'], 1);
    if (e['poison'] !== undefined) requireNumbers(p, `${w} poison`, e['poison'], ['damagePerSecond', 'seconds'], 0.01);
  }
}

function validateM5Configs(p: string[], raw: RawGameData): void {
  const enc = raw.encounters;
  if (!isRec(enc)) p.push('encounters.json: must be an object');
  else {
    requireNumbers(p, 'encounters.maxAlive', enc['maxAlive'], ['day', 'night'], 0, 40);
    requireNumbers(p, 'encounters.spawnIntervalSeconds', enc['spawnIntervalSeconds'], ['day', 'night'], 0.5);
    requireNumbers(p, 'encounters.spawnRing', enc['spawnRing'], ['min', 'max'], 200);
    requireNumbers(p, 'encounters', enc, ['despawnDistance'], 400);
    requireNumbers(p, 'encounters', enc, ['nightRampPerDay', 'firstNightMax'], 0);
  }
  requireNumbers(
    p,
    'combat',
    raw.combat,
    ['playerIFramesMs', 'playerKnockback', 'enemyIFramesMs', 'enemyKnockback', 'attackCooldownMs', 'attackArcDegrees', 'baseReach', 'spearBonusReach', 'handDamage'],
    0,
  );
  const sh = raw.shrines;
  if (!isRec(sh)) p.push('shrines.json: must be an object');
  else {
    requireNumbers(p, 'shrines', sh, ['chancePerClearingChunk'], 0, 1);
    requireNumbers(p, 'shrines', sh, ['cooldownHours'], 0);
    if (!ITEM_CATEGORIES.includes(sh['offeringCategory'] as ItemCategory)) p.push('shrines.offeringCategory unknown');
    requireNumbers(p, 'shrines.blessing', sh['blessing'], ['durationHours', 'regenPerHour'], 0);
    const text = sh['text'];
    if (!isRec(text) || !['offered', 'resting', 'needOffering', 'prompt'].every((k) => isStr(text[k]))) p.push('shrines.text needs offered, resting, needOffering, prompt');
  }
}

function validateM6(p: string[], raw: RawGameData, tablets: Rec[], quests: Rec[], lootIds: Set<string>): void {
  const s = raw.season;
  if (!isRec(s)) p.push('season.json: must be an object');
  else {
    requireNumbers(p, 'season', s, ['firstDay', 'cycleDays', 'lengthDays'], 1);
    requireNumbers(p, 'season', s, ['thirstMultiplier', 'hungerMultiplier', 'floodRiverWidth'], 0.1, 5);
    requireNumbers(p, 'season', s, ['rainDarkness'], 0, 0.6);
    requireNumbers(p, 'season.cold', s['cold'], ['lossPerHour', 'recoverPerHour', 'damagePerHour', 'shelterRadius'], 0);
    if (isNum(s['lengthDays']) && isNum(s['cycleDays']) && num(s['lengthDays']) >= num(s['cycleDays']))
      p.push('season.lengthDays must be shorter than cycleDays (the rain has to stop)');
  }
  const orders = new Set<number>();
  for (const t of tablets) {
    const w = `tablet "${String(t['id'])}"`;
    if (!isInt(t['order']) || num(t['order']) < 1 || num(t['order']) > 5) p.push(`${w}: order must be 1..5`);
    else if (orders.has(num(t['order']))) p.push(`${w}: duplicate order ${String(t['order'])}`);
    else orders.add(num(t['order']));
    for (const k of ['titleKm', 'titleEn', 'text']) if (!isStr(t[k])) p.push(`${w}: ${k} required`);
  }
  if (tablets.length !== 5) p.push(`tablets.json: exactly 5 tablets required (got ${tablets.length})`);
  for (const q of quests) {
    const w = `quest "${String(q['id'])}"`;
    if (!isStr(q['title']) || !isStr(q['description'])) p.push(`${w}: title and description required`);
    if (typeof q['mandatory'] !== 'boolean') p.push(`${w}: mandatory must be boolean`);
    const steps = q['steps'];
    if (!Array.isArray(steps) || steps.length === 0) p.push(`${w}: steps required`);
    else
      steps.forEach((st: unknown, i) => {
        if (!isRec(st) || !isStr(st['id']) || !isStr(st['text'])) return void p.push(`${w} steps[${i}]: id and text required`);
        if (st['kind'] !== 'collect_tablets' && st['kind'] !== 'reach_heart' && st['kind'] !== 'restore_heart') p.push(`${w} steps[${i}]: unknown kind`);
        if (st['kind'] === 'collect_tablets' && (!isInt(st['count']) || num(st['count']) < 1 || num(st['count']) > tablets.length))
          p.push(`${w} steps[${i}]: count must be 1..${tablets.length} (no dead-end quest)`);
      });
  }
  if (!quests.some((q) => q['id'] === 'the_five_tablets')) p.push('quests.json: main quest "the_five_tablets" missing');
  const lore = raw.lore;
  if (!isRec(lore) || !isStr(lore['disclaimer']) || !Array.isArray(lore['entries'])) p.push('lore.json needs disclaimer and entries');
  if (!lootIds.has('ruin_chest')) p.push('loot.json: "ruin_chest" table required for ruin chests');
  const e = raw.ending;
  if (!isRec(e)) p.push('ending.json: must be an object');
  else {
    if (!ITEM_CATEGORIES.includes(e['offeringCategory'] as ItemCategory)) p.push('ending.offeringCategory unknown');
    if (!isInt(e['spiritDust']) || num(e['spiritDust']) < 0 || num(e['spiritDust']) > 10) p.push('ending.spiritDust must be an integer 0..10');
    const t = e['text'];
    if (!isRec(t) || !['prompt', 'rootsBlock', 'rootsWither', 'needTablets', 'needOffering', 'restored'].every((k) => isStr(t[k]))) p.push('ending.text incomplete');
    const ep = e['epilogue'];
    if (!Array.isArray(ep) || ep.length < 3 || ep.length > 8 || !ep.every(isStr)) p.push('ending.epilogue needs 3–8 lines');
    if (!Array.isArray(e['credits']) || !(e['credits'] as unknown[]).every(isStr)) p.push('ending.credits must be strings');
  }
  const main = quests.find((q) => q['id'] === 'the_five_tablets');
  const steps = main && Array.isArray(main['steps']) ? (main['steps'] as Rec[]) : [];
  if (!steps.some((st) => st['kind'] === 'restore_heart')) p.push('quests.json: main quest needs a final "restore_heart" step (a real conclusion)');
}

/** Validates raw JSON and returns typed lookup maps. Throws DataValidationError listing every problem. */
export function validateGameData(raw: RawGameData): GameData {
  const p: string[] = [];
  const items = collectIds(p, 'items.json', raw.items);
  const loot = collectIds(p, 'loot.json', raw.loot);
  const resources = collectIds(p, 'resources.json', raw.resources);
  const recipes = collectIds(p, 'recipes.json', raw.recipes);
  const structures = collectIds(p, 'structures.json', raw.structures);
  const biomes = collectIds(p, 'biomes.json', raw.biomes);
  const enemies = collectIds(p, 'enemies.json', raw.enemies);
  const tablets = collectIds(p, 'tablets.json', raw.tablets);
  const quests = collectIds(p, 'quests.json', raw.quests);
  const ids = (list: Rec[]) => new Set(list.map((i) => i['id']).filter(isStr));
  const itemIds = ids(items);

  validateItems(p, items, ids(structures));
  validateLoot(p, loot, itemIds);
  validateResources(p, resources, ids(loot));
  validateRecipes(p, recipes, itemIds);
  validateStructures(p, structures);
  validateSurvival(p, raw.survival);
  validateBiomes(p, biomes, ids(resources));
  validateEnemies(p, enemies, ids(loot));
  validateM5Configs(p, raw);
  validateM6(p, raw, tablets, quests, ids(loot));

  if (p.length) throw new DataValidationError(p);

  const data: GameData = {
    items: new Map((items as unknown as ItemDef[]).map((i) => [i.id, i])),
    loot: new Map((loot as unknown as LootTable[]).map((l) => [l.id, l])),
    resources: new Map((resources as unknown as ResourceDef[]).map((r) => [r.id, r])),
    recipes: new Map((recipes as unknown as RecipeDef[]).map((r) => [r.id, r])),
    structures: new Map((structures as unknown as StructureDef[]).map((s) => [s.id, s])),
    survival: raw.survival as SurvivalConfig,
    biomes: new Map((biomes as unknown as BiomeDef[]).map((b) => [b.id, b])),
    enemies: new Map((enemies as unknown as EnemyDef[]).map((e) => [e.id, e])),
    encounters: raw.encounters as EncounterConfig,
    combat: raw.combat as CombatConfig,
    shrines: raw.shrines as ShrineConfig,
    season: raw.season as SeasonConfig,
    tablets: (tablets as unknown as TabletDef[]).slice().sort((a, b) => a.order - b.order),
    quests: new Map((quests as unknown as QuestDef[]).map((q) => [q.id, q])),
    lore: raw.lore as LoreConfig,
    ending: raw.ending as EndingConfig,
  };

  // Reachability: every item must be gatherable or craftable from gatherable items.
  const reachable = reachableItems(data);
  const unreachable = [...data.items.keys()].filter((id) => !reachable.has(id));
  if (unreachable.length) throw new DataValidationError([`unobtainable items: ${unreachable.join(', ')}`]);
  return data;
}

/** Items that some resource node can actually drop (directly obtainable in the world). */
export function obtainableItems(data: Pick<GameData, 'resources' | 'loot'> & Partial<Pick<GameData, 'enemies'>>): Set<string> {
  const out = new Set<string>();
  const tables = [...data.resources.values()]
    .map((r) => r.lootTable)
    .concat([...(data.enemies?.values() ?? [])].map((e) => e.lootTable))
    .concat(data.loot.has('ruin_chest') ? ['ruin_chest'] : []);
  for (const id of tables) {
    const table = data.loot.get(id);
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
export function reachableItems(data: Pick<GameData, 'resources' | 'loot' | 'recipes' | 'items'> & Partial<Pick<GameData, 'enemies'>>): Set<string> {
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

// ---------- Creatures, encounters, combat, shrines (M5) ----------

export const ENEMY_BEHAVIORS = ['charger', 'striker', 'stalker', 'flier', 'caster'] as const;
export type EnemyBehavior = (typeof ENEMY_BEHAVIORS)[number];

/** enemies.json: array of EnemyDef. Neak Ta are never enemies (shrines.json). */
export interface EnemyDef {
  id: string;
  name: string;
  nameKm?: string;
  description: string;
  kind: 'wildlife' | 'spirit';
  sprite: CreatureSprite;
  /** When it may spawn. Spirits are night-only and fade at dawn. */
  active: 'day' | 'night' | 'any';
  behavior: EnemyBehavior;
  hp: number;
  /** Movement speed, px/s. */
  speed: number;
  /** Damage per hit (melee) — projectile damage is in `projectile`. */
  damage: number;
  /** Melee reach in px (centre to centre). */
  attackRange: number;
  attackCooldownMs: number;
  /** Visible wind-up before an attack lands (fair warning). */
  telegraphMs: number;
  aggroRadius: number;
  /** Gives up the chase beyond this distance. */
  leashRadius: number;
  /** Flees when hp fraction drops below this (0 = never flees). */
  fleeBelowHp: number;
  lootTable: string;
  /** Spirits keep out of light (campfires, held torches). */
  avoidsLight: boolean;
  /** Fliers ignore trees/rocks/water. */
  flying: boolean;
  spawn: {
    weight: number;
    /** First day number it can appear on. */
    minDay: number;
    maxAlive: number;
    /** Relative weight per biome; missing biome = never there. */
    biomes: Partial<Record<BiomeId, number>>;
  };
  charge?: { speed: number; durationMs: number };
  poison?: { damagePerSecond: number; seconds: number };
  projectile?: { speed: number; damage: number; range: number };
}

/** encounters.json: population and pacing (single object). */
export interface EncounterConfig {
  maxAlive: { day: number; night: number };
  /** Seconds between spawn attempts. */
  spawnIntervalSeconds: { day: number; night: number };
  /** Spawn distance band from the player (px), outside the camera view. */
  spawnRing: { min: number; max: number };
  despawnDistance: number;
  /** Extra night population per day survived (fractional ok), capped by maxAlive.night. */
  nightRampPerDay: number;
  /** Night 1 cap (gentle first night). */
  firstNightMax: number;
}

/** combat.json: player combat tuning (single object). */
export interface CombatConfig {
  playerIFramesMs: number;
  playerKnockback: number;
  enemyIFramesMs: number;
  enemyKnockback: number;
  attackCooldownMs: number;
  /** Total swing arc in degrees. */
  attackArcDegrees: number;
  /** Bare-hand / short-tool reach in px. */
  baseReach: number;
  /** Extra reach when holding a spear. */
  spearBonusReach: number;
  handDamage: number;
}

/** shrines.json: Neak Ta guardian shrines (single object). Never hostile, never lootable. */
export interface ShrineConfig {
  /** Chance a clearing chunk holds a shrine. */
  chancePerClearingChunk: number;
  /** Item category accepted as an offering. */
  offeringCategory: ItemCategory;
  cooldownHours: number;
  blessing: { durationHours: number; regenPerHour: number; spiritWard: boolean };
  text: { offered: string; resting: string; needOffering: string; prompt: string };
}

// ---------- Season, ruins, tablets, quests, lore (M6) ----------

/** season.json: monsoon schedule and weather effects (single object). */
export interface SeasonConfig {
  /** First monsoon day (5 → days 5–6, 10–11 … with cycle 5, length 2). */
  firstDay: number;
  cycleDays: number;
  lengthDays: number;
  /** Rain lowers thirst drain and raises hunger drain. */
  thirstMultiplier: number;
  hungerMultiplier: number;
  /** Extra darkness while it rains (daytime gloom). */
  rainDarkness: number;
  /** River flood: noise half-width multiplier at full flood (shallows only — never deep). */
  floodRiverWidth: number;
  cold: {
    /** Warmth lost per game hour while exposed in the rain. */
    lossPerHour: number;
    /** Warmth regained per game hour near fire or in shelter. */
    recoverPerHour: number;
    /** Health lost per game hour at zero warmth. */
    damagePerHour: number;
    /** Within this many px of a shelter you count as sheltered. */
    shelterRadius: number;
  };
}

/** tablets.json: the five key stone tablets (array). */
export interface TabletDef {
  id: string;
  /** Story order 1..5 (also which ruin, by distance from spawn, holds it). */
  order: number;
  titleKm: string;
  titleEn: string;
  /** 2–3 short sentences, English. */
  text: string;
}

/** quests.json: quests (array). M6 ships the main quest. */
export interface QuestDef {
  id: string;
  title: string;
  titleKm?: string;
  description: string;
  mandatory: boolean;
  steps: Array<{ id: string; text: string; kind: 'collect_tablets' | 'reach_heart' | 'restore_heart'; count?: number }>;
}

/** lore.json: glossary with a clear fiction disclaimer (single object). */
export interface LoreConfig {
  disclaimer: string;
  entries: Array<{ term: string; termKm?: string; text: string }>;
}

// ---------- Ending (M8) ----------

/** ending.json: the Heart of the Forest finale (single object). */
export interface EndingConfig {
  /** Item category accepted as the offering at the Heart Tree. */
  offeringCategory: ItemCategory;
  /** Spirit dust (from Ap/Arak) also needed: the restless spirits' share returned. 0 = none. */
  spiritDust: number;
  text: {
    prompt: string;
    rootsBlock: string;
    rootsWither: string;
    needTablets: string;
    needOffering: string;
    restored: string;
  };
  /** Ending sequence lines shown one after another (3–8). */
  epilogue: string[];
  credits: string[];
}
