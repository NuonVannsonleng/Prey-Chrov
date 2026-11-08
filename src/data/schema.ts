import { ICON_KEYS, RESOURCE_SPRITES, type IconKey, type ResourceSprite } from '../textures';

// ---------- Types (JSON shapes) ----------

export const ITEM_CATEGORIES = ['material', 'food', 'tool', 'quest'] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const RARITIES = ['common', 'uncommon', 'rare'] as const;
export type Rarity = (typeof RARITIES)[number];

export const TOOL_KINDS = ['hand', 'axe', 'pickaxe'] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];

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
  /** Max per inventory slot, 1–999. */
  stackSize: number;
  /** "rare" items ask for confirmation before being dropped. */
  rarity: Rarity;
  icon: IconKey;
  tags: string[];
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
  /** Hit points; each hit deals 1 × toolMultipliers[tool]. */
  hp: number;
  /** Game-time seconds until the node regrows after depletion (> 0). */
  respawnSeconds: number;
  lootTable: string;
  /** Damage multiplier per tool. Missing or 0 = this tool can't gather it. `hand` must be > 0 in M2. */
  toolMultipliers: Partial<Record<ToolKind, number>>;
}

export interface GameData {
  items: ReadonlyMap<string, ItemDef>;
  loot: ReadonlyMap<string, LootTable>;
  resources: ReadonlyMap<string, ResourceDef>;
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

/** Validates raw JSON and returns typed lookup maps. Throws DataValidationError listing every problem. */
export function validateGameData(rawItems: unknown, rawLoot: unknown, rawResources: unknown): GameData {
  const p: string[] = [];
  const items = collectIds(p, 'items.json', rawItems);
  const loot = collectIds(p, 'loot.json', rawLoot);
  const resources = collectIds(p, 'resources.json', rawResources);
  const itemIds = new Set(items.map((i) => i['id']).filter(isStr));
  const lootIds = new Set(loot.map((l) => l['id']).filter(isStr));

  for (const it of items) {
    const w = `item "${String(it['id'])}"`;
    if (!isStr(it['name'])) p.push(`${w}: name required`);
    if (it['nameKm'] !== undefined && !isStr(it['nameKm'])) p.push(`${w}: nameKm must be a non-empty string`);
    if (!isStr(it['description'])) p.push(`${w}: description required`);
    if (!ITEM_CATEGORIES.includes(it['category'] as ItemCategory)) p.push(`${w}: unknown category ${String(it['category'])}`);
    if (!isInt(it['stackSize']) || (it['stackSize'] as number) < 1 || (it['stackSize'] as number) > 999)
      p.push(`${w}: stackSize must be an integer 1–999`);
    if (!RARITIES.includes(it['rarity'] as Rarity)) p.push(`${w}: unknown rarity ${String(it['rarity'])}`);
    if (!ICON_KEYS.includes(it['icon'] as IconKey)) p.push(`${w}: unknown icon ${String(it['icon'])}`);
    if (!Array.isArray(it['tags']) || !(it['tags'] as unknown[]).every(isStr)) p.push(`${w}: tags must be a string array`);
  }

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
        if (!isNum(e['weight']) || (e['weight'] as number) <= 0) p.push(`${w} entries[${i}]: weight must be > 0`);
        checkRange(p, `${w} entries[${i}]`, e['min'], e['max'], 1);
      });
      if (isRec(rolls) && isInt(rolls['max']) && (rolls['max'] as number) > 0 && entries.length === 0)
        p.push(`${w}: rolls > 0 but no weighted entries`);
    }
    if (Array.isArray(guaranteed) && Array.isArray(entries) && guaranteed.length === 0 && entries.length === 0)
      p.push(`${w}: drops nothing`);
  }

  for (const r of resources) {
    const w = `resource "${String(r['id'])}"`;
    if (!isStr(r['name'])) p.push(`${w}: name required`);
    if (!isStr(r['verb'])) p.push(`${w}: verb required`);
    if (!RESOURCE_SPRITES.includes(r['sprite'] as ResourceSprite)) p.push(`${w}: unknown sprite ${String(r['sprite'])}`);
    if (!isInt(r['hp']) || (r['hp'] as number) < 1) p.push(`${w}: hp must be an integer >= 1`);
    if (!isNum(r['respawnSeconds']) || (r['respawnSeconds'] as number) <= 0) p.push(`${w}: respawnSeconds must be > 0`);
    if (!lootIds.has(r['lootTable'] as string)) p.push(`${w}: unknown lootTable ${String(r['lootTable'])}`);
    const tm = r['toolMultipliers'];
    if (!isRec(tm)) p.push(`${w}: toolMultipliers required`);
    else {
      for (const [k, v] of Object.entries(tm)) {
        if (!TOOL_KINDS.includes(k as ToolKind)) p.push(`${w}: unknown tool ${k}`);
        if (!isNum(v) || v < 0) p.push(`${w}: toolMultipliers.${k} must be >= 0`);
      }
      if (!isNum(tm['hand']) || (tm['hand'] as number) <= 0) p.push(`${w}: toolMultipliers.hand must be > 0 (no tools exist yet)`);
    }
  }

  if (p.length) throw new DataValidationError(p);

  return {
    items: new Map((items as unknown as ItemDef[]).map((i) => [i.id, i])),
    loot: new Map((loot as unknown as LootTable[]).map((l) => [l.id, l])),
    resources: new Map((resources as unknown as ResourceDef[]).map((r) => [r.id, r])),
  };
}

/** Items that some resource node can actually drop (directly obtainable in the world). */
export function obtainableItems(data: GameData): Set<string> {
  const out = new Set<string>();
  for (const res of data.resources.values()) {
    const table = data.loot.get(res.lootTable);
    if (!table) continue;
    for (const g of table.guaranteed) out.add(g.item);
    if (table.rolls.max > 0) for (const e of table.entries) out.add(e.item);
  }
  return out;
}
