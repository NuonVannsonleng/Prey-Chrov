import type { ItemDef, SeasonConfig, SurvivalConfig } from '../data/schema';

export interface SurvivalStats {
  health: number;
  hunger: number;
  thirst: number;
  stamina: number;
  /** 0..100. Only drops during the monsoon while exposed to the rain. */
  warmth: number;
}

export const MAX_WARMTH = 100;
const NO_MODS: { hunger: number; thirst: number } = { hunger: 1, thirst: 1 };

export type DeathCause = 'starvation' | 'dehydration' | 'injury' | 'wildlife' | 'spirit' | 'poison' | 'cold';

/**
 * Health / hunger / thirst / stamina. Pure logic: feed it real seconds and the clock's
 * seconds-per-hour so all rates stay tied to game time, never to frame rate.
 */
export class Survival {
  readonly stats: SurvivalStats;
  /** Set when sprinting drains stamina to 0; cleared once stamina recovers past sprintMinStamina. */
  exhausted = false;
  lastDamageCause: DeathCause | null = null;
  private sinceSprint = Infinity;

  constructor(
    private readonly cfg: SurvivalConfig,
    initial?: Partial<SurvivalStats>,
  ) {
    this.stats = {
      health: clamp(initial?.health ?? cfg.maxHealth, 0, cfg.maxHealth),
      hunger: clamp(initial?.hunger ?? cfg.maxHunger, 0, cfg.maxHunger),
      thirst: clamp(initial?.thirst ?? cfg.maxThirst, 0, cfg.maxThirst),
      stamina: clamp(initial?.stamina ?? cfg.maxStamina, 0, cfg.maxStamina),
      warmth: clamp(initial?.warmth ?? MAX_WARMTH, 0, MAX_WARMTH),
    };
  }

  get dead(): boolean {
    return this.stats.health <= 0;
  }

  /** Whether the player may sprint this frame. */
  get canSprint(): boolean {
    return !this.exhausted && this.stats.stamina > 0;
  }

  get hungry(): boolean {
    return this.stats.hunger <= this.cfg.warnAt;
  }

  get thirsty(): boolean {
    return this.stats.thirst <= this.cfg.warnAt;
  }

  /** dtSeconds = real seconds of game time elapsed; sprinting = player actually sprinted this frame. */
  /**
   * `mods` scale hunger/thirst drain (monsoon: thirst slower, hunger faster).
   */
  update(dtSeconds: number, secondsPerHour: number, sprinting: boolean, mods = NO_MODS): void {
    if (this.dead || !(dtSeconds > 0)) return;
    const c = this.cfg;
    const s = this.stats;
    const hours = dtSeconds / secondsPerHour;

    s.hunger = clamp(s.hunger - c.hungerPerHour * mods.hunger * hours, 0, c.maxHunger);
    s.thirst = clamp(s.thirst - c.thirstPerHour * mods.thirst * hours, 0, c.maxThirst);

    if (s.thirst <= 0) this.damage(c.dehydrationDamagePerHour * hours, 'dehydration');
    if (s.hunger <= 0) this.damage(c.starvationDamagePerHour * hours, 'starvation');
    if (s.hunger >= c.regenMinHungerThirst && s.thirst >= c.regenMinHungerThirst) {
      s.health = clamp(s.health + c.regenPerHour * hours, 0, c.maxHealth);
    }

    if (sprinting && this.canSprint) {
      s.stamina = clamp(s.stamina - c.sprintStaminaPerSecond * dtSeconds, 0, c.maxStamina);
      this.sinceSprint = 0;
      if (s.stamina <= 0) this.exhausted = true;
    } else {
      this.sinceSprint += dtSeconds;
      if (this.sinceSprint >= c.staminaRegenDelaySeconds) {
        s.stamina = clamp(s.stamina + c.staminaRegenPerSecond * dtSeconds, 0, c.maxStamina);
      }
    }
    if (this.exhausted && s.stamina >= c.sprintMinStamina) this.exhausted = false;
  }

  /**
   * Cold: while `exposed` (raining, away from shelter and fire) warmth drops; otherwise it
   * recovers. At zero warmth health drains slowly. Never touches warmth outside the monsoon
   * beyond recovering it.
   */
  updateWarmth(dtSeconds: number, secondsPerHour: number, exposed: boolean, cold: SeasonConfig['cold']): void {
    if (this.dead || !(dtSeconds > 0)) return;
    const s = this.stats;
    const hours = dtSeconds / secondsPerHour;
    if (exposed) s.warmth = clamp(s.warmth - cold.lossPerHour * hours, 0, MAX_WARMTH);
    else s.warmth = clamp(s.warmth + cold.recoverPerHour * hours, 0, MAX_WARMTH);
    if (exposed && s.warmth <= 0) this.damage(cold.damagePerHour * hours, 'cold');
  }

  get cold(): boolean {
    return this.stats.warmth <= 25;
  }

  damage(amount: number, cause: DeathCause): void {
    if (!(amount > 0) || this.dead) return;
    this.stats.health = clamp(this.stats.health - amount, 0, this.cfg.maxHealth);
    this.lastDamageCause = cause;
  }

  heal(amount: number): void {
    if (!(amount > 0) || this.dead) return;
    this.stats.health = clamp(this.stats.health + amount, 0, this.cfg.maxHealth);
  }

  eat(food: NonNullable<ItemDef['food']>): void {
    const c = this.cfg;
    const s = this.stats;
    s.hunger = clamp(s.hunger + food.hunger, 0, c.maxHunger);
    s.thirst = clamp(s.thirst + food.thirst, 0, c.maxThirst);
    if (food.health < 0) this.damage(-food.health, 'injury');
    else s.health = clamp(s.health + food.health, 0, c.maxHealth);
  }

  drink(): void {
    this.stats.thirst = clamp(this.stats.thirst + this.cfg.drinkThirst, 0, this.cfg.maxThirst);
  }

  /** Applies a night's sleep. Hunger/thirst costs never kill: they stop at 1. */
  sleep(): void {
    const c = this.cfg;
    const s = this.stats;
    s.hunger = clamp(s.hunger - c.sleep.hungerCost, Math.min(1, s.hunger), c.maxHunger);
    s.thirst = clamp(s.thirst - c.sleep.thirstCost, Math.min(1, s.thirst), c.maxThirst);
    s.stamina = clamp(s.stamina + c.sleep.staminaRestore, 0, c.maxStamina);
    s.health = clamp(s.health + c.sleep.healthRestore, 0, c.maxHealth);
    this.exhausted = false;
  }
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}
