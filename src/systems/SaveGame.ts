import type { GameData } from '../data/schema';
import type { Player } from '../entities/Player';
import type { GameClock } from './Clock';
import { HOTBAR_SLOTS, type ItemStack } from './Inventory';
import type { Objectives } from './Objectives';
import type { Pickups } from './Pickups';
import type { PlayerInventory } from './PlayerInventory';
import { SAVE_VERSION, type SaveData } from './Save';
import type { Structures } from './Structures';
import type { StatusEffects } from './StatusEffects';
import type { Survival } from './Survival';
import type { ChunkManager } from '../world/ChunkManager';

export interface WorldState {
  clock: GameClock;
  survival: Survival;
  player: Player;
  inventory: PlayerInventory;
  structures: Structures;
  chunks: ChunkManager;
  seed: number;
  pickups: Pickups;
  objectives: Objectives;
  effects: StatusEffects;
  shrines: ReadonlyMap<string, number>;
  /** World game-time clock in ms (node respawn timers are relative to it). */
  now: number;
}

/** Snapshot of everything that matters for a resumed session. Unchanged nodes are omitted (compact diff). */
export function buildSave(w: WorldState): SaveData {
  const s = w.survival.stats;
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    seed: w.seed,
    clockSeconds: w.clock.totalSeconds,
    player: {
      x: Math.round(w.player.x),
      y: Math.round(w.player.y),
      health: s.health,
      hunger: s.hunger,
      thirst: s.thirst,
      stamina: s.stamina,
    },
    inventory: w.inventory.inventory.snapshot(),
    selected: w.inventory.selected,
    structures: w.structures.serialize(),
    nodes: w.chunks.serializeNodes(w.now),
    pickups: w.pickups.serialize(),
    objectives: w.objectives.serialize(),
    refundStructures: [],
    refundItems: [],
    effects: w.effects.serialize(),
    shrines: [...w.shrines].map(([key, lastOffering]) => ({ key, lastOffering })),
  };
}

/**
 * Cleans a saved inventory against current data: unknown items are removed (and counted
 * so the player is told), quantities clamp to stack size, durability to its maximum.
 */
export function sanitizeInventory(
  slots: ReadonlyArray<ItemStack | null>,
  data: GameData,
  size: number,
): { slots: (ItemStack | null)[]; removed: number } {
  let removed = 0;
  const out: (ItemStack | null)[] = [];
  for (let i = 0; i < size; i++) {
    const s = slots[i] ?? null;
    if (!s) {
      out.push(null);
      continue;
    }
    const def = data.items.get(s.item);
    if (!def) {
      removed++;
      out.push(null);
      continue;
    }
    const qty = Math.min(s.qty, def.stackSize);
    const maxDur = def.tool?.durability ?? def.light?.burnSeconds;
    if (maxDur !== undefined) out.push({ item: s.item, qty, durability: Math.min(s.durability ?? maxDur, maxDur) });
    else out.push({ item: s.item, qty });
  }
  return { slots: out, removed };
}

export function clampSelected(selected: number): number {
  return Number.isInteger(selected) && selected >= 0 && selected < HOTBAR_SLOTS ? selected : 0;
}
