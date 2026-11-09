import { SKILL_IDS, type ProgressionConfig, type SkillId } from '../data/schema';

export interface ProgressionSave {
  xp: Partial<Record<SkillId, number>>;
  /** "source:key" of every one-time award already granted. */
  firsts: string[];
  /** Repeatable awards counted per in-game day (resets at a new day). */
  daily: { day: number; counts: Record<string, number> };
  knowledge: string[];
}

export interface Award {
  skill: SkillId;
  xp: number;
  /** New level when this award crossed a threshold. */
  levelUp: number | null;
  text: string;
}

export interface ProgressionEffects {
  foragingExtraChance: number;
  /** Multiplier on tool wear per use (< 1 is better). */
  toolWear: number;
  /** Multiplier on hunger and thirst drain (< 1 is better). */
  drain: number;
  combatDamage: number;
  speed: number;
}

/**
 * Skills without grind (pure logic, saved): XP comes from one-time firsts (a new recipe, a new
 * foe, a tablet…) and small repeat awards capped per in-game day, so reloading or repeating an
 * action can never farm levels. Knowledge (recipe unlocks) is learned from items or skill levels.
 */
export class Progression {
  readonly xp: Record<SkillId, number>;
  private readonly firsts: Set<string>;
  private daily: { day: number; counts: Record<string, number> };
  readonly knowledge: Set<string>;

  constructor(
    private readonly cfg: ProgressionConfig,
    saved?: Partial<ProgressionSave>,
  ) {
    this.xp = { foraging: 0, crafting: 0, survival: 0, combat: 0, exploration: 0 };
    for (const id of SKILL_IDS) {
      const v = saved?.xp?.[id];
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) this.xp[id] = Math.floor(v);
    }
    this.firsts = new Set((saved?.firsts ?? []).filter((s) => typeof s === 'string'));
    const d = saved?.daily;
    this.daily = d && Number.isFinite(d.day) && typeof d.counts === 'object' && d.counts ? { day: d.day, counts: { ...d.counts } } : { day: 0, counts: {} };
    const known = new Set(cfg.knowledge.map((k) => k.id));
    this.knowledge = new Set((saved?.knowledge ?? []).filter((k) => known.has(k)));
  }

  level(skill: SkillId): number {
    const xp = this.xp[skill];
    let lv = 0;
    for (const need of this.cfg.levels) if (xp >= need) lv++;
    return lv;
  }

  /** XP still needed for the next level (null at max). */
  toNext(skill: SkillId): number | null {
    const need = this.cfg.levels[this.level(skill)];
    return need === undefined ? null : need - this.xp[skill];
  }

  /**
   * Grants XP for a source. `key` identifies the thing for one-time sources (recipe id, enemy
   * id, day…). Returns null when nothing is granted (already earned, or today's cap reached).
   */
  award(source: string, key: string | number | null, day: number): Award | null {
    const s = this.cfg.sources[source];
    if (!s) return null;
    if (s.unique) {
      const id = `${source}:${key ?? ''}`;
      if (this.firsts.has(id)) return null;
      this.firsts.add(id);
    } else {
      if (this.daily.day !== day) this.daily = { day, counts: {} };
      const n = this.daily.counts[source] ?? 0;
      if (n >= (s.dailyCap ?? 0)) return null;
      this.daily.counts[source] = n + 1;
    }
    const before = this.level(s.skill);
    this.xp[s.skill] += s.xp;
    const after = this.level(s.skill);
    return { skill: s.skill, xp: s.xp, levelUp: after > before ? after : null, text: s.text };
  }

  /** Knowledge whose condition is now met (item owned or skill level reached) and not yet learned. */
  learnable(hasItem: (id: string) => boolean): Array<ProgressionConfig['knowledge'][number]> {
    return this.cfg.knowledge.filter((k) => {
      if (this.knowledge.has(k.id)) return false;
      if (k.item) return hasItem(k.item);
      if (k.skill) return this.level(k.skill) >= (k.level ?? 1);
      return false;
    });
  }

  learn(id: string): boolean {
    if (this.knowledge.has(id) || !this.cfg.knowledge.some((k) => k.id === id)) return false;
    this.knowledge.add(id);
    return true;
  }

  knows(id: string | undefined): boolean {
    return !id || this.knowledge.has(id);
  }

  effects(): ProgressionEffects {
    const e = this.cfg.effects;
    return {
      foragingExtraChance: e.foragingExtraChance * this.level('foraging'),
      toolWear: Math.max(0.5, 1 - e.toolWear * this.level('crafting')),
      drain: Math.max(0.5, 1 - e.survivalDrain * this.level('survival')),
      combatDamage: e.combatDamage * this.level('combat'),
      speed: 1 + e.exploreSpeed * this.level('exploration'),
    };
  }

  serialize(): ProgressionSave {
    return { xp: { ...this.xp }, firsts: [...this.firsts], daily: { day: this.daily.day, counts: { ...this.daily.counts } }, knowledge: [...this.knowledge] };
  }
}
