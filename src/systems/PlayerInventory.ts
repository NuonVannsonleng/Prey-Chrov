import Phaser from 'phaser';
import { getGameData, itemDef, itemStackSize } from '../data/gameData';
import type { Station } from '../data/schema';
import { craft } from './Crafting';
import { gameEvents, onSceneEvent, type InventoryRequest } from './GameEvents';
import { HOTBAR_SLOTS, Inventory } from './Inventory';

/** Starting durability for a fresh tool (hits) or light (burn seconds); undefined for normal items. */
export function freshDurability(item: string): number | undefined {
  const def = getGameData().items.get(item);
  return def?.tool?.durability ?? def?.light?.burnSeconds;
}

/**
 * World-side owner of the player's inventory. Applies UI requests,
 * and broadcasts a fresh snapshot on every change.
 */
export class PlayerInventory {
  readonly inventory = new Inventory(itemStackSize);
  selected = 0;

  constructor(
    scene: Phaser.Scene,
    /** Places a dropped stack in the world; returns false if it couldn't be placed. */
    private readonly dropToGround: (item: string, qty: number, durability?: number) => boolean,
    /** Crafting stations currently in reach. */
    private readonly stations: () => ReadonlySet<Station>,
    private readonly onCrafted: (recipe: string, output: string) => void,
  ) {
    onSceneEvent(scene, 'inventory:request', (req) => this.handle(req));
    onSceneEvent(scene, 'ui:ready', () => this.broadcast());
    onSceneEvent(scene, 'craft:request', ({ recipe }) => this.craft(recipe));
  }

  /** The stack in the selected hotbar slot, if any. */
  get held(): ReturnType<Inventory['get']> {
    return this.inventory.get(this.selected);
  }

  add(item: string, qty: number, durability?: number): number {
    const leftover = this.inventory.add(item, qty, durability ?? freshDurability(item));
    if (leftover !== qty) this.broadcast();
    return leftover;
  }

  capacityFor(item: string): number {
    return this.inventory.capacityFor(item);
  }

  broadcast(): void {
    gameEvents.emit('inventory:changed', { slots: this.inventory.snapshot(), selected: this.selected });
  }

  private craft(recipeId: string): void {
    const recipe = getGameData().recipes.get(recipeId);
    if (!recipe) return;
    const res = craft(recipe, this.inventory, this.stations(), freshDurability);
    const name = itemDef(recipe.output).name;
    if (res.ok) {
      this.broadcast();
      gameEvents.emit('sfx', 'craft');
      gameEvents.emit('toast', { text: `Crafted ${recipe.qty > 1 ? recipe.qty + ' × ' : ''}${name}`, tone: 'info' });
      this.onCrafted(recipe.id, recipe.output);
      return;
    }
    const why =
      res.reason === 'station' ? 'You need to be near a campfire' : res.reason === 'no-room' ? 'No room in your inventory' : 'Missing materials';
    gameEvents.emit('toast', { text: `Can't craft ${name}: ${why}`, tone: 'warn' });
  }

  private handle(req: InventoryRequest): void {
    switch (req.type) {
      case 'select':
        if (req.slot >= 0 && req.slot < HOTBAR_SLOTS && req.slot !== this.selected) {
          this.selected = req.slot;
          this.broadcast();
        }
        return;
      case 'move':
        if (this.inventory.move(req.from, req.to)) this.broadcast();
        return;
      case 'split':
        if (this.inventory.split(req.slot) >= 0) this.broadcast();
        else gameEvents.emit('toast', { text: 'Nothing to split, or no empty slot', tone: 'warn' });
        return;
      case 'drop': {
        const stack = this.inventory.get(req.slot);
        // The slot may have changed since the request (e.g. while a confirm dialog was open).
        if (!stack || stack.item !== req.item) return;
        const qty = Math.min(stack.qty, Math.max(1, Math.floor(req.qty)));
        // Place first, then remove: a failed placement never deletes items.
        if (!this.dropToGround(stack.item, qty, stack.durability)) {
          gameEvents.emit('toast', { text: 'Too many items on the ground here', tone: 'warn' });
          return;
        }
        this.inventory.takeFromSlot(req.slot, qty);
        this.broadcast();
        return;
      }
    }
  }
}
