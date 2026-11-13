/**
 * M17: journey rules — difficulty preset, opt-in challenge modifiers, opt-in permadeath and the
 * world seed. Chosen once when a journey starts and stored in its save; nothing in play changes
 * them afterwards. Pure (no Phaser) so it is unit tested.
 */

export const EFFECT_KEYS = ['hungerDrain', 'thirstDrain', 'enemyDamage', 'spawnCap', 'detection', 'eliteChance', 'toolWear', 'forageYield', 'warmthLoss'] as const;
export type EffectKey = (typeof EFFECT_KEYS)[number];
export type RuleEffects = Partial<Record<EffectKey, number>>;
export type DifficultyId = 'story' | 'survival' | 'hard';
export const DIFFICULTY_IDS: readonly DifficultyId[] = ['story', 'survival', 'hard'];

export interface DifficultyPreset {
  id: DifficultyId;
  name: string;
  description: string;
  effects: RuleEffects;
}

export interface ChallengeModifier {
  id: string;
  name: string;
  description: string;
  effects: RuleEffects;
}

export interface DifficultyData {
  default: DifficultyId;
  presets: DifficultyPreset[];
  modifiers: ChallengeModifier[];
}

/** Content generation: 1 = worlds made before M17 (three landmark kinds), 2 = M17 worlds. */
export const CONTENT_VERSION = 2;

export interface JourneyRules {
  difficulty: DifficultyId;
  modifiers: string[];
  permadeath: boolean;
  /** Which landmark set this world was generated with (kept so old worlds never change). */
  content: number;
}

/** Saves made before M17 keep playing exactly as they did: Survival, no modifiers, old content. */
export const LEGACY_RULES: Readonly<JourneyRules> = { difficulty: 'survival', modifiers: [], permadeath: false, content: 1 };

export function defaultRules(): JourneyRules {
  return { difficulty: 'survival', modifiers: [], permadeath: false, content: CONTENT_VERSION };
}

/** Defensive parse of stored rules; unknown modifiers are dropped, missing rules mean legacy. */
export function parseRules(raw: unknown, knownModifiers: readonly string[]): JourneyRules {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...LEGACY_RULES, modifiers: [] };
  const r = raw as Record<string, unknown>;
  const difficulty = DIFFICULTY_IDS.includes(r['difficulty'] as DifficultyId) ? (r['difficulty'] as DifficultyId) : 'survival';
  const mods = Array.isArray(r['modifiers']) ? r['modifiers'].filter((m): m is string => typeof m === 'string' && knownModifiers.includes(m)) : [];
  const content = typeof r['content'] === 'number' && Number.isInteger(r['content']) && r['content'] >= 1 ? Math.min(CONTENT_VERSION, r['content']) : 1;
  return { difficulty, modifiers: [...new Set(mods)], permadeath: r['permadeath'] === true, content };
}

/** The multipliers in force: the preset's effects times each modifier's (1 when unset). */
export function ruleEffects(rules: JourneyRules, data: DifficultyData): Record<EffectKey, number> {
  const out = Object.fromEntries(EFFECT_KEYS.map((k) => [k, 1])) as Record<EffectKey, number>;
  const apply = (e: RuleEffects) => {
    for (const k of EFFECT_KEYS) {
      const v = e[k];
      if (typeof v === 'number' && Number.isFinite(v)) out[k] *= v;
    }
  };
  const preset = data.presets.find((p) => p.id === rules.difficulty);
  if (preset) apply(preset.effects);
  for (const id of rules.modifiers) {
    const m = data.modifiers.find((x) => x.id === id);
    if (m) apply(m.effects);
  }
  // Stacked modifiers never go past the bounds a single preset may use.
  for (const k of EFFECT_KEYS) out[k] = Math.min(2, Math.max(0.4, out[k]));
  return out;
}

/** Short label for menus and the journal: "Hard · Brittle Tools · permadeath". */
export function describeRules(rules: JourneyRules, data: DifficultyData): string {
  const preset = data.presets.find((p) => p.id === rules.difficulty)?.name ?? rules.difficulty;
  const mods = rules.modifiers.map((id) => data.modifiers.find((m) => m.id === id)?.name ?? id);
  return [preset, ...mods, ...(rules.permadeath ? ['permadeath'] : [])].join(' · ');
}

/** Seeds typed by the player: digits are used as-is, any other text is hashed (same text, same world). */
export function seedFromText(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (/^\d{1,9}$/.test(t)) return Number(t) >>> 0;
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 1_000_000_000;
}
