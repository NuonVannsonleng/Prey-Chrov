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

export const ITEM_CATEGORIES = ['material', 'food', 'tool', 'light', 'structure', 'quest', 'medicine', 'container', 'gear'] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const RARITIES = ['common', 'uncommon', 'rare'] as const;
export type Rarity = (typeof RARITIES)[number];

export const TOOL_KINDS = ['hand', 'axe', 'pickaxe', 'spear', 'rod'] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];

export const RECIPE_CATEGORIES = ['tools', 'light', 'building', 'food', 'medicine', 'gear'] as const;
export type RecipeCategory = (typeof RECIPE_CATEGORIES)[number];

export const STATIONS = ['none', 'campfire', 'pot', 'workbench'] as const;
export type Station = (typeof STATIONS)[number];

export const STRUCTURE_INTERACTIONS = ['cook', 'sleep', 'storage', 'collect', 'craft'] as const;
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
  tool?: { kind: Exclude<ToolKind, 'hand'>; durability: number; damage: number; /** Repair material (default: the recipe's first ingredient). */ repairItem?: string };
  /** Eating (F) applies these deltas. Health may be negative (e.g. raw, bitter food). */
  food?: { hunger: number; thirst: number; health: number };
  /** Using (F) enters placement mode for this structures.json id; placing consumes one. */
  places?: string;
  /** Light while held in the dark; burns `burnSeconds` of game time while lit. */
  light?: { radius: number; burnSeconds: number };
  /** Using (F) treats the player: heals and/or cures status effects (e.g. "poison"). */
  medicine?: { heal: number; cures: string[] };
  /** After eating/using one, this item is given back (e.g. the empty bamboo tube). */
  returns?: string;
  /** A container: E at water while holding it turns one into this item. */
  fillsTo?: string;
  /** Wearable gear (M11): one item per slot; F equips. */
  gear?: GearDef;
}

export const GEAR_SLOTS = ['body', 'feet'] as const;
export type GearSlot = (typeof GEAR_SLOTS)[number];

export interface GearDef {
  slot: GearSlot;
  /** Fraction of incoming damage removed (0..0.6). */
  damageReduction?: number;
  /** Multiplier on warmth lost in the rain (0..1). */
  rainWarmth?: number;
  /** Extra walking speed fraction. */
  speed?: number;
  /** Multiplier on the mud/shallows slow-down (0..1; 0.5 halves it). */
  terrain?: number;
}

export const SKILL_IDS = ['foraging', 'crafting', 'survival', 'combat', 'exploration'] as const;
export type SkillId = (typeof SKILL_IDS)[number];

/** progression.json (M11): skills, XP sources (no grind: unique firsts and small daily-capped repeats) and knowledge. */
/** setpieces.json (M15): the Old Tusker, the Great Storm and the Blight at the Heart. */
export interface SetPiecesConfig {
  tusker: { enemy: string; lairDistance: number; wakeRadius: number; rumourDay: number; stunMs: number; vulnerableMultiplier: number; armouredDamage: number };
  storm: { minDay: number; warningSeconds: number; durationSeconds: number; strikeIntervalMs: number; warningMs: number; radius: number; damage: number; warmthLossMultiplier: number; xp: number };
  blight: { cores: number; coreRadiusTiles: number; burnSeconds: number; fireReach: number; slamIntervalMs: number; warningMs: number; radius: number; damage: number; retryHealth: number };
  /** Every player-facing set-piece string ({s}, {n} are filled in). */
  text: Record<string, string>;
}

/** sidequests.json (M14): side stories offered by events, with steps and a final choice. */
export const SIDE_EVENTS = ['sleep', 'landmark', 'outpost', 'shortcut', 'puzzle', 'fish', 'spirit_defeat'] as const;
export const SIDE_STATS = ['tablets', 'puzzles', 'landmarks', 'cooked_fish'] as const;
export type SideQuestEffect =
  | { type: 'item'; item: string; qty: number }
  | { type: 'xp'; skill: SkillId; amount: number }
  | { type: 'flag'; flag: string }
  | { type: 'reveal'; radius: number }
  | { type: 'ending'; text: string };

export interface SideQuestDef {
  id: string;
  title: string;
  /** 'memories' chains unlock character memories; 'side' chains are side objectives. */
  kind: 'memories' | 'side';
  start: { event: string };
  offer: string;
  steps: Array<{
    kind: 'event' | 'state' | 'choice';
    event?: string;
    stat?: string;
    count?: number;
    text: string;
    memory?: string;
    prompt?: string;
    options?: Array<{ id: string; label: string; description: string; cost?: Array<{ item: string; qty: number }>; effects: SideQuestEffect[]; result: string }>;
  }>;
}

/** stealth.json (M12): noise, cover, awareness, stuck handling, elites, ambushes, spawn tuning. */
export interface StealthConfig {
  crouchSpeed: number;
  noise: { still: number; crouch: number; walk: number; sprint: number; action: number };
  coverRadius: number;
  sight: { hidden: number; crouch: number; night: number };
  awareness: { seeRise: number; hearRise: number; decay: number; investigateAt: number; loseAt: number };
  investigateSeconds: number;
  stuck: { checkMs: number; minMove: number; giveUpMs: number };
  elite: { minDay: number; chance: number; perDay: number; max: number; hp: number; damage: number };
  ambush: { minDay: number; chancePerNight: number; warningSeconds: number; min: number; max: number; ringMin: number; ringMax: number };
  distanceDanger: Array<{ tiles: number; mult: number }>;
  monsoonSpiritWeight: number;
}

export interface ProgressionConfig {
  /** Cumulative XP needed for levels 1, 2, 3. */
  levels: number[];
  skills: Array<{ id: SkillId; name: string; effect: string }>;
  effects: { foragingExtraChance: number; toolWear: number; survivalDrain: number; combatDamage: number; exploreSpeed: number };
  sources: Record<string, { skill: SkillId; xp: number; unique?: boolean; dailyCap?: number; text: string }>;
  knowledge: Array<{ id: string; name: string; hint: string; text: string; item?: string; skill?: SkillId; level?: number }>;
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
  /** Plant identification: shown instead of the name until the player has gathered one. */
  unknownName?: string;
  /** Harvest seasons: per-item loot multipliers during the monsoon or the dry season. */
  seasonal?: { monsoon?: Record<string, number>; dry?: Record<string, number> };
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
  /** Knowledge id that must be learned before this recipe can be crafted (M11). */
  unlock?: string;
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
  /** Crafting station this structure provides within reach. */
  station?: Exclude<Station, 'none'>;
  /** R rotates it during placement (horizontal / vertical frame and footprint). */
  rotatable?: boolean;
  /** Snaps to this grid (px) and may sit flush against other structures (walls). */
  snap?: number;
  /** Game hours of monsoon weathering before it breaks (absent = never weathers). */
  durability?: number;
  /** Weathers in the monsoon even under a roof (roofs themselves). */
  wearsAlways?: boolean;
  /** Keeps the player warm and dry, and protects structures from weathering, within this radius. */
  shelterRadius?: number;
  /** Drawn above the player (roofs); fades while the player is underneath. */
  overhead?: boolean;
  /** Storage chest slots. */
  storageSlots?: number;
  /** Rain collector: units held; one unit per game hour of rain. */
  rainCapacity?: number;
  /** Item a held container is filled with at this structure (rain collector). */
  collectItem?: string;
  /** Extra health and full warmth after sleeping here (improved beds). */
  sleepBonus?: { health: number };
  /** Outpost flag: named marker on the map; creatures never spawn close by. */
  outpost?: boolean;
}

/** fishing.json: the fishing minigame (M9). */
export interface FishingConfig {
  lootTable: string;
  /** Seconds between casting and a bite. */
  biteDelaySeconds: { min: number; max: number };
  /** Seconds the bite lasts before the fish escapes. */
  windowSeconds: number;
  /** Width of the catch zone as a fraction of the bar (0..1). */
  zoneWidth: number;
  /** Marker sweeps (there and back) per second. */
  markerCyclesPerSecond: number;
  /** Rod durability used per attempt. */
  rodWear: number;
  text: { cast: string; bite: string; caught: string; missed: string; early: string; needDeep: string; escaped: string };
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
  fishing: FishingConfig;
  progression: ProgressionConfig;
  stealth: StealthConfig;
  sidequests: readonly SideQuestDef[];
  setpieces: SetPiecesConfig;
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
  fishing: unknown;
  progression: unknown;
  stealth: unknown;
  sidequests: unknown;
  setpieces: unknown;
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

function validateItems(p: string[], items: Rec[], structureIds: Set<string>, itemIds: Set<string>): void {
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
    const med = it['medicine'];
    if (med !== undefined) {
      if (!isRec(med) || !isNum(med['heal']) || num(med['heal']) < 0 || !Array.isArray(med['cures']) || !(med['cures'] as unknown[]).every((c) => c === 'poison'))
        p.push(`${w}: medicine needs heal >= 0 and cures (only "poison" is known)`);
    }
    const gear = it['gear'];
    if (gear !== undefined) {
      if (!isRec(gear) || !GEAR_SLOTS.includes(gear['slot'] as GearSlot)) p.push(`${w}: gear.slot must be body|feet`);
      else {
        const frac = (k: string, max: number) => gear[k] === undefined || (isNum(gear[k]) && num(gear[k]) >= 0 && num(gear[k]) <= max);
        if (!frac('damageReduction', 0.6) || !frac('rainWarmth', 1) || !frac('speed', 0.3) || !frac('terrain', 1)) p.push(`${w}: gear values out of range`);
      }
      if (stack !== 1) p.push(`${w}: gear must have stackSize 1`);
    }
    const rep = isRec(tool) ? tool['repairItem'] : undefined;
    if (rep !== undefined && !itemIds.has(rep as string)) p.push(`${w}: tool.repairItem unknown item`);
    for (const k of ['returns', 'fillsTo'] as const) {
      const v = it[k];
      if (v !== undefined && !itemIds.has(v as string)) p.push(`${w}: ${k} unknown item ${String(v)}`);
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
    if (r['unknownName'] !== undefined && !isStr(r['unknownName'])) p.push(`${w}: unknownName must be a non-empty string`);
    const se = r['seasonal'];
    if (se !== undefined) {
      if (!isRec(se)) p.push(`${w}: seasonal must be an object`);
      else
        for (const [k, v] of Object.entries(se)) {
          if (k !== 'monsoon' && k !== 'dry') p.push(`${w}: seasonal.${k} must be monsoon|dry`);
          if (!isRec(v) || !Object.values(v).every((m) => isNum(m) && m >= 0)) p.push(`${w}: seasonal.${k} must map items to multipliers >= 0`);
        }
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
      p.push(`${w}: interaction must be null or one of ${STRUCTURE_INTERACTIONS.join(', ')}`);
    const st = s['station'];
    if (st !== undefined && (st === 'none' || !STATIONS.includes(st as Station))) p.push(`${w}: unknown station ${String(st)}`);
    for (const k of ['snap', 'durability', 'shelterRadius', 'storageSlots', 'rainCapacity'] as const) {
      const v = s[k];
      if (v !== undefined && (!isNum(v) || num(v) <= 0)) p.push(`${w}: ${k} must be > 0`);
    }
    if (s['storageSlots'] !== undefined && (!isInt(s['storageSlots']) || num(s['storageSlots']) > 24)) p.push(`${w}: storageSlots must be an integer <= 24`);
    if (s['interaction'] === 'storage' && s['storageSlots'] === undefined) p.push(`${w}: storage needs storageSlots`);
    if (s['interaction'] === 'collect' && (s['rainCapacity'] === undefined || !isStr(s['collectItem']))) p.push(`${w}: collect needs rainCapacity and collectItem`);
    if (s['interaction'] === 'craft' && s['station'] === undefined) p.push(`${w}: craft needs a station`);
    if (s['rotatable'] === true && !STRUCTURE_SPRITES.includes(s['sprite'] as StructureSprite)) p.push(`${w}: rotatable needs a sprite`);
    const sb = s['sleepBonus'];
    if (sb !== undefined && (!isRec(sb) || !isNum(sb['health']) || num(sb['health']) < 0)) p.push(`${w}: sleepBonus.health must be >= 0`);
  }
}

function validateSetPieces(p: string[], raw: unknown, enemies: Rec[]): void {
  if (!isRec(raw)) {
    p.push('setpieces.json: must be an object');
    return;
  }
  const pos = (v: unknown) => isNum(v) && num(v) > 0;
  const t = raw['tusker'];
  if (!isRec(t)) p.push('setpieces.tusker required');
  else {
    const boss = enemies.find((e) => e['id'] === t['enemy']);
    if (!boss || boss['boss'] !== true) p.push('setpieces.tusker.enemy must be an enemy with boss: true');
    for (const k of ['lairDistance', 'wakeRadius', 'rumourDay', 'stunMs', 'vulnerableMultiplier', 'armouredDamage']) if (!pos(t[k])) p.push(`setpieces.tusker.${k} must be > 0`);
    // Beatable without exploits: a stun window long enough to land several hits.
    if (pos(t['stunMs']) && num(t['stunMs']) < 1500) p.push('setpieces.tusker.stunMs must be >= 1500 (fair window)');
    if (boss && (!isNum(boss['telegraphMs']) || num(boss['telegraphMs']) < 800)) p.push('old tusker telegraphMs must be >= 800 (telegraphed)');
  }
  const s = raw['storm'];
  if (!isRec(s)) p.push('setpieces.storm required');
  else {
    for (const k of ['minDay', 'warningSeconds', 'durationSeconds', 'strikeIntervalMs', 'warningMs', 'radius', 'damage', 'warmthLossMultiplier']) if (!pos(s[k])) p.push(`setpieces.storm.${k} must be > 0`);
    if (pos(s['warningMs']) && num(s['warningMs']) < 800) p.push('setpieces.storm.warningMs must be >= 800 (telegraphed)');
    if (pos(s['warningMs']) && pos(s['strikeIntervalMs']) && num(s['strikeIntervalMs']) <= num(s['warningMs'])) p.push('setpieces.storm: strikes must not overlap their warnings');
  }
  const tx = raw['text'];
  const keys = ['tuskerName', 'tuskerRumour', 'tuskerMarker', 'tuskerWake', 'tuskerHintDazed', 'tuskerHintLure', 'armoured', 'tuskerDefeated', 'stormWarning', 'stormPassed', 'blightName', 'blightStart', 'blightHint', 'blightCoreOne', 'blightCoreMany', 'blightCoreBurned', 'blightCleared', 'blightBlocked', 'blightRetry'];
  for (const k of keys) if (!isRec(tx) || !isStr(tx[k])) p.push(`setpieces.text.${k} required`);
  const b = raw['blight'];
  if (!isRec(b)) p.push('setpieces.blight required');
  else {
    for (const k of ['cores', 'coreRadiusTiles', 'burnSeconds', 'fireReach', 'slamIntervalMs', 'warningMs', 'radius', 'damage']) if (!pos(b[k])) p.push(`setpieces.blight.${k} must be > 0`);
    if (pos(b['warningMs']) && num(b['warningMs']) < 800) p.push('setpieces.blight.warningMs must be >= 800 (telegraphed)');
    if (!isNum(b['retryHealth']) || num(b['retryHealth']) <= 0 || num(b['retryHealth']) > 1) p.push('setpieces.blight.retryHealth must be 0–1');
  }
}

function validateSideQuests(p: string[], raw: unknown, itemIds: Set<string>): void {
  if (!Array.isArray(raw)) {
    p.push('sidequests.json: must be an array');
    return;
  }
  const ids = new Set<string>();
  for (const q of raw) {
    if (!isRec(q) || !isStr(q['id'])) {
      p.push('sidequests.json: every quest needs an id');
      continue;
    }
    const w = `side quest "${q['id']}"`;
    if (ids.has(q['id'] as string)) p.push(`${w}: duplicate id`);
    ids.add(q['id'] as string);
    if (!isStr(q['title']) || !isStr(q['offer'])) p.push(`${w}: title and offer text required`);
    if (q['kind'] !== 'memories' && q['kind'] !== 'side') p.push(`${w}: kind must be memories or side`);
    const st = q['start'];
    if (!isRec(st) || !SIDE_EVENTS.includes(st['event'] as (typeof SIDE_EVENTS)[number])) p.push(`${w}: start.event must be one of ${SIDE_EVENTS.join(', ')}`);
    const steps = Array.isArray(q['steps']) ? (q['steps'] as unknown[]) : [];
    if (steps.length < 2) p.push(`${w}: needs at least two steps (a beginning and a resolution)`);
    steps.forEach((s, i) => {
      const sw = `${w} step ${i}`;
      if (!isRec(s) || !isStr(s['text'])) {
        p.push(`${sw}: text required`);
        return;
      }
      if (s['kind'] === 'event' && !SIDE_EVENTS.includes(s['event'] as (typeof SIDE_EVENTS)[number])) p.push(`${sw}: unknown event`);
      else if (s['kind'] === 'state' && !SIDE_STATS.includes(s['stat'] as (typeof SIDE_STATS)[number])) p.push(`${sw}: unknown stat`);
      else if (s['kind'] === 'choice') {
        if (i !== steps.length - 1) p.push(`${sw}: the choice must be the last step`);
        const opts = Array.isArray(s['options']) ? (s['options'] as Rec[]) : [];
        if (opts.length < 2) p.push(`${sw}: a choice needs at least two options`);
        // No soft-lock: at least one option is always affordable.
        if (!opts.some((o) => !Array.isArray(o['cost']) || (o['cost'] as unknown[]).length === 0)) p.push(`${sw}: one option must have no cost`);
        for (const o of opts) {
          if (!isStr(o['id']) || !isStr(o['label']) || !isStr(o['description']) || !isStr(o['result'])) p.push(`${sw}: option id/label/description/result required`);
          for (const c of Array.isArray(o['cost']) ? (o['cost'] as Rec[]) : []) if (!itemIds.has(c['item'] as string) || !isInt(c['qty'])) p.push(`${sw}: bad cost`);
          for (const e of Array.isArray(o['effects']) ? (o['effects'] as Rec[]) : []) {
            const t = e['type'];
            if (t === 'item' ? !itemIds.has(e['item'] as string) || !isInt(e['qty']) : t === 'xp' ? !SKILL_IDS.includes(e['skill'] as SkillId) || !isInt(e['amount']) : t === 'flag' ? !isStr(e['flag']) : t === 'reveal' ? !isNum(e['radius']) : t === 'ending' ? !isStr(e['text']) : true)
              p.push(`${sw}: bad effect ${JSON.stringify(e)}`);
          }
        }
      } else if (s['kind'] !== 'event' && s['kind'] !== 'state') p.push(`${sw}: kind must be event, state or choice`);
    });
    if (!steps.some((s) => isRec(s) && s['kind'] === 'choice')) p.push(`${w}: needs a final choice (a satisfying resolution)`);
  }
}

function validateStealth(p: string[], s: unknown): void {
  if (!isRec(s)) {
    p.push('stealth.json: must be an object');
    return;
  }
  const pos = (v: unknown) => isNum(v) && num(v) > 0;
  const frac = (v: unknown) => isNum(v) && num(v) > 0 && num(v) <= 1;
  if (!frac(s['crouchSpeed'])) p.push('stealth.crouchSpeed must be 0–1');
  const n = s['noise'];
  if (!isRec(n) || !['crouch', 'walk', 'sprint', 'action'].every((k) => pos(n[k])) || !isNum(n['still'])) p.push('stealth.noise needs still, crouch, walk, sprint, action');
  else if (!(num(n['crouch']) < num(n['walk']) && num(n['walk']) < num(n['sprint']))) p.push('stealth.noise: crouch < walk < sprint (stealth must be quieter)');
  if (!pos(s['coverRadius'])) p.push('stealth.coverRadius must be > 0');
  const sg = s['sight'];
  if (!isRec(sg) || !frac(sg['hidden']) || !frac(sg['crouch']) || !frac(sg['night'])) p.push('stealth.sight multipliers must be 0–1');
  const a = s['awareness'];
  if (!isRec(a) || !['seeRise', 'hearRise', 'decay'].every((k) => pos(a[k])) || !frac(a['investigateAt']) || !frac(a['loseAt'])) p.push('stealth.awareness invalid');
  if (!pos(s['investigateSeconds'])) p.push('stealth.investigateSeconds must be > 0');
  const st = s['stuck'];
  if (!isRec(st) || !pos(st['checkMs']) || !pos(st['minMove']) || !pos(st['giveUpMs'])) p.push('stealth.stuck invalid');
  const e = s['elite'];
  if (!isRec(e) || !pos(e['minDay']) || !frac(e['chance']) || !isNum(e['perDay']) || !frac(e['max']) || !pos(e['hp']) || !pos(e['damage'])) p.push('stealth.elite invalid');
  const am = s['ambush'];
  if (!isRec(am) || !pos(am['minDay']) || !frac(am['chancePerNight']) || !isNum(am['warningSeconds']) || num(am['warningSeconds']) < 3 || !isInt(am['min']) || !isInt(am['max']) || num(am['max']) < num(am['min']) || !pos(am['ringMin']) || num(am['ringMax']) < num(am['ringMin']))
    p.push('stealth.ambush invalid (warning must be >= 3 s: fair warning)');
  const dd = s['distanceDanger'];
  if (!Array.isArray(dd) || dd.length === 0 || !dd.every((x) => isRec(x) && pos(x['tiles']) && pos(x['mult']))) p.push('stealth.distanceDanger invalid');
  if (!pos(s['monsoonSpiritWeight'])) p.push('stealth.monsoonSpiritWeight must be > 0');
}

function validateProgression(p: string[], raw: unknown, itemIds: Set<string>, recipes: Rec[]): void {
  if (!isRec(raw)) {
    p.push('progression.json: must be an object');
    return;
  }
  const levels = raw['levels'];
  if (!Array.isArray(levels) || levels.length < 1 || !levels.every((l, i) => isInt(l) && l > 0 && (i === 0 || l > (levels[i - 1] as number))))
    p.push('progression.levels must be increasing positive integers');
  const skills = Array.isArray(raw['skills']) ? (raw['skills'] as Rec[]) : [];
  for (const id of SKILL_IDS) if (!skills.some((s) => s['id'] === id && isStr(s['name']) && isStr(s['effect']))) p.push(`progression.skills: missing ${id}`);
  const sources = raw['sources'];
  if (!isRec(sources)) p.push('progression.sources required');
  else
    for (const [k, v] of Object.entries(sources)) {
      if (!isRec(v) || !SKILL_IDS.includes(v['skill'] as SkillId) || !isInt(v['xp']) || num(v['xp']) < 1 || !isStr(v['text'])) p.push(`progression.sources.${k} invalid`);
      // No grind: every source is either a one-time first or capped per day.
      else if (v['unique'] !== true && !(isInt(v['dailyCap']) && num(v['dailyCap']) >= 1)) p.push(`progression.sources.${k} must be unique or have a dailyCap`);
    }
  const know = Array.isArray(raw['knowledge']) ? (raw['knowledge'] as Rec[]) : [];
  const knowIds = new Set<string>();
  for (const k of know) {
    const w = `knowledge "${String(k['id'])}"`;
    if (!isStr(k['id']) || !isStr(k['name']) || !isStr(k['hint']) || !isStr(k['text'])) p.push(`${w}: id, name, hint, text required`);
    knowIds.add(k['id'] as string);
    const byItem = k['item'] !== undefined;
    const bySkill = k['skill'] !== undefined;
    if (byItem === bySkill) p.push(`${w}: needs exactly one of item or skill`);
    if (byItem && !itemIds.has(k['item'] as string)) p.push(`${w}: unknown item`);
    if (bySkill && (!SKILL_IDS.includes(k['skill'] as SkillId) || !isInt(k['level']) || num(k['level']) < 1)) p.push(`${w}: skill and level >= 1 required`);
  }
  for (const r of recipes) if (r['unlock'] !== undefined && !knowIds.has(r['unlock'] as string)) p.push(`recipe "${String(r['id'])}": unknown unlock ${String(r['unlock'])}`);
}

function validateFishing(p: string[], f: unknown, lootIds: Set<string>): void {
  if (!isRec(f)) {
    p.push('fishing.json: must be an object');
    return;
  }
  if (!lootIds.has(f['lootTable'] as string)) p.push('fishing.lootTable unknown');
  const d = f['biteDelaySeconds'];
  if (!isRec(d) || !isNum(d['min']) || !isNum(d['max']) || num(d['min']) <= 0 || num(d['max']) < num(d['min'])) p.push('fishing.biteDelaySeconds needs 0 < min <= max');
  if (!isNum(f['windowSeconds']) || num(f['windowSeconds']) < 0.8) p.push('fishing.windowSeconds must be >= 0.8 (fairness)');
  if (!isNum(f['zoneWidth']) || num(f['zoneWidth']) < 0.15 || num(f['zoneWidth']) > 0.8) p.push('fishing.zoneWidth must be 0.15–0.8 (fairness)');
  if (!isNum(f['markerCyclesPerSecond']) || num(f['markerCyclesPerSecond']) <= 0 || num(f['markerCyclesPerSecond']) > 1.5) p.push('fishing.markerCyclesPerSecond must be 0–1.5');
  if (!isNum(f['rodWear']) || num(f['rodWear']) < 0) p.push('fishing.rodWear must be >= 0');
  const t = f['text'];
  for (const k of ['cast', 'bite', 'caught', 'missed', 'early', 'needDeep', 'escaped']) if (!isRec(t) || !isStr(t[k])) p.push(`fishing.text.${k} required`);
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

  validateItems(p, items, ids(structures), itemIds);
  validateLoot(p, loot, itemIds);
  validateResources(p, resources, ids(loot));
  validateRecipes(p, recipes, itemIds);
  validateStructures(p, structures);
  for (const s of structures) if (s['collectItem'] !== undefined && !itemIds.has(s['collectItem'] as string)) p.push(`structure "${String(s['id'])}": collectItem unknown item ${String(s['collectItem'])}`);
  validateSurvival(p, raw.survival);
  validateBiomes(p, biomes, ids(resources));
  validateEnemies(p, enemies, ids(loot));
  validateM5Configs(p, raw);
  validateM6(p, raw, tablets, quests, ids(loot));
  validateFishing(p, raw.fishing, ids(loot));
  validateProgression(p, raw.progression, itemIds, recipes);
  validateStealth(p, raw.stealth);
  validateSideQuests(p, raw.sidequests, itemIds);
  validateSetPieces(p, raw.setpieces, enemies);

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
    fishing: raw.fishing as FishingConfig,
    progression: raw.progression as ProgressionConfig,
    stealth: raw.stealth as StealthConfig,
    sidequests: raw.sidequests as SideQuestDef[],
    setpieces: raw.setpieces as SetPiecesConfig,
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
export function reachableItems(
  data: Pick<GameData, 'resources' | 'loot' | 'recipes' | 'items'> & Partial<Pick<GameData, 'enemies' | 'structures' | 'fishing'>>,
): Set<string> {
  const have = obtainableItems(data);
  for (const q of (data as { sidequests?: readonly SideQuestDef[] }).sidequests ?? [])
    for (const s of q.steps) for (const o of s.options ?? []) for (const e of o.effects) if (e.type === 'item') have.add(e.item);
  /** Kits that place a structure providing each station. */
  const stationKits = (station: string): string[] =>
    [...data.items.values()]
      .filter((i) => {
        if (!i.places) return false;
        const s = data.structures?.get(i.places);
        return s ? s.station === station : station === 'campfire' && i.places === 'campfire';
      })
      .map((i) => i.id);
  const add = (id: string | undefined): boolean => {
    if (!id || have.has(id)) return false;
    have.add(id);
    return true;
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of data.recipes.values()) {
      if (have.has(r.output)) continue;
      if (r.station !== 'none' && !stationKits(r.station).some((id) => have.has(id))) continue;
      if (r.ingredients.every((g) => have.has(g.item))) changed = add(r.output) || changed;
    }
    // A placed rain collector fills a held container with its collectItem.
    for (const s of data.structures?.values() ?? []) {
      if (!s.collectItem || have.has(s.collectItem)) continue;
      const kitHave = [...data.items.values()].some((i) => i.places === s.id && have.has(i.id));
      const containerHave = [...data.items.values()].some((i) => i.fillsTo && have.has(i.id));
      if (kitHave && containerHave) changed = add(s.collectItem) || changed;
    }
    for (const it of data.items.values()) {
      if (!have.has(it.id)) continue;
      // Filling a container at water; getting the container back after use.
      changed = add(it.fillsTo) || changed;
      changed = add(it.returns) || changed;
      // A fishing rod makes the fishing loot table reachable.
      if (it.tool?.kind === 'rod' && data.fishing) {
        const t = data.loot.get(data.fishing.lootTable);
        if (t) for (const e of [...t.guaranteed, ...(t.rolls.max > 0 ? t.entries : [])]) changed = add(e.item) || changed;
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
  /** M12: how far it hears noise (multiplier on the player's noise radius). */
  hearing?: number;
  /** M12 wildlife: gives up and returns home beyond this distance from where it appeared. */
  territory?: number;
  /** M12 spirits: radius of the loop it patrols around where it appeared. */
  patrolRadius?: number;
  /** M15 set-piece creature: armoured except while stunned; never spawns naturally. */
  boss?: boolean;
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
