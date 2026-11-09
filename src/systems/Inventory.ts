export interface ItemStack {
  item: string;
  qty: number;
  /** Remaining uses / burn seconds for single-stack tools and lights. */
  durability?: number;
}

export const INVENTORY_SLOTS = 20;
/** The first HOTBAR_SLOTS inventory slots double as the hotbar. */
export const HOTBAR_SLOTS = 6;

export type StackSizeLookup = (itemId: string) => number;

/**
 * Slot-based inventory with per-item stack limits. Pure logic (no Phaser).
 * Every mutation returns what actually happened so callers never assume success.
 */
export class Inventory {
  private readonly slots: (ItemStack | null)[];

  constructor(
    private readonly stackSize: StackSizeLookup,
    size = INVENTORY_SLOTS,
  ) {
    this.slots = new Array<ItemStack | null>(size).fill(null);
  }

  get size(): number {
    return this.slots.length;
  }

  get(slot: number): Readonly<ItemStack> | null {
    return this.slots[slot] ?? null;
  }

  /** Copy of all slots, safe to hand to UI. */
  snapshot(): (ItemStack | null)[] {
    return this.slots.map((s) => (s ? copyStack(s) : null));
  }

  /** Replaces every slot (used to roll back failed crafts and to load saves). */
  restore(slots: ReadonlyArray<Readonly<ItemStack> | null>): void {
    for (let i = 0; i < this.slots.length; i++) {
      const s = slots[i];
      this.slots[i] = s && s.qty > 0 ? copyStack(s) : null;
    }
  }

  count(itemId: string): number {
    let n = 0;
    for (const s of this.slots) if (s && s.item === itemId) n += s.qty;
    return n;
  }

  /** How many of `itemId` could be added right now. */
  capacityFor(itemId: string): number {
    const max = this.maxStack(itemId);
    let room = 0;
    for (const s of this.slots) {
      if (!s) room += max;
      else if (s.item === itemId) room += Math.max(0, max - s.qty);
    }
    return room;
  }

  /**
   * Adds up to `qty`, topping up existing stacks first. Returns the amount that did NOT fit.
   * Items with durability never merge into other stacks.
   */
  add(itemId: string, qty: number, durability?: number): number {
    let left = Math.max(0, Math.floor(qty));
    const max = this.maxStack(itemId);
    for (const s of this.slots) {
      if (left === 0 || durability !== undefined) break;
      if (s && s.item === itemId && s.qty < max && s.durability === undefined) {
        const moved = Math.min(left, max - s.qty);
        s.qty += moved;
        left -= moved;
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (this.slots[i]) continue;
      const moved = Math.min(left, max);
      this.slots[i] = durability === undefined ? { item: itemId, qty: moved } : { item: itemId, qty: moved, durability };
      left -= moved;
    }
    return left;
  }

  /** Removes up to `qty` of an item (from the last slots first). Returns the amount removed. */
  remove(itemId: string, qty: number): number {
    let left = Math.max(0, Math.floor(qty));
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (!s || s.item !== itemId) continue;
      const taken = Math.min(left, s.qty);
      s.qty -= taken;
      left -= taken;
      if (s.qty === 0) this.slots[i] = null;
    }
    return Math.floor(qty) - left;
  }

  /**
   * Uses up durability on a slot's item. Returns 'broke' (item removed), 'ok', or 'none'
   * if the slot holds nothing with durability.
   */
  wear(slot: number, amount: number): 'ok' | 'broke' | 'none' {
    const s = this.slots[slot];
    if (!s || s.durability === undefined) return 'none';
    s.durability = Math.max(0, s.durability - amount);
    if (s.durability > 0) return 'ok';
    this.slots[slot] = null;
    return 'broke';
  }

  /** Sets a slot item's durability (repairs). */
  setDurability(slot: number, value: number): boolean {
    const s = this.slots[slot];
    if (!s || s.durability === undefined || !(value > 0)) return false;
    s.durability = value;
    return true;
  }

  /** Takes up to `qty` from one slot. Returns the removed stack, or null. */
  takeFromSlot(slot: number, qty: number): ItemStack | null {
    const s = this.slots[slot];
    if (!s || qty <= 0) return null;
    const taken = Math.min(Math.floor(qty), s.qty);
    s.qty -= taken;
    if (s.qty === 0) this.slots[slot] = null;
    return s.durability === undefined ? { item: s.item, qty: taken } : { item: s.item, qty: taken, durability: s.durability };
  }

  /**
   * Moves a slot onto another: merges same items up to the stack limit (swapping if the
   * target stack is already full), otherwise swaps. Returns false if nothing changed.
   */
  move(from: number, to: number): boolean {
    if (from === to || !this.valid(from) || !this.valid(to)) return false;
    const a = this.slots[from];
    if (!a) return false;
    const b = this.slots[to];
    if (b && b.item === a.item && a.durability === undefined && b.durability === undefined) {
      const max = this.maxStack(a.item);
      const moved = Math.min(a.qty, max - b.qty);
      if (moved <= 0) {
        if (a.qty === b.qty) return false;
        this.slots[from] = b;
        this.slots[to] = a;
        return true;
      }
      b.qty += moved;
      a.qty -= moved;
      if (a.qty === 0) this.slots[from] = null;
      return true;
    }
    this.slots[from] = b ?? null;
    this.slots[to] = a;
    return true;
  }

  /** Splits half (rounded down) of a stack into the first empty slot. Returns the new slot index or -1. */
  split(slot: number): number {
    const s = this.slots[slot];
    if (!s || s.qty < 2) return -1;
    const empty = this.slots.indexOf(null);
    if (empty === -1) return -1;
    const half = Math.floor(s.qty / 2);
    s.qty -= half;
    this.slots[empty] = { item: s.item, qty: half };
    return empty;
  }

  isFull(): boolean {
    return this.slots.every((s) => s !== null && s.qty >= this.maxStack(s.item));
  }

  private valid(i: number): boolean {
    return Number.isInteger(i) && i >= 0 && i < this.slots.length;
  }

  private maxStack(itemId: string): number {
    const n = this.stackSize(itemId);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  }
}

function copyStack(s: Readonly<ItemStack>): ItemStack {
  return s.durability === undefined ? { item: s.item, qty: s.qty } : { item: s.item, qty: s.qty, durability: s.durability };
}
