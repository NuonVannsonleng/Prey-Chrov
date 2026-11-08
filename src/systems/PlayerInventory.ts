import Phaser from 'phaser';
import { itemStackSize } from '../data/gameData';
import { gameEvents, onSceneEvent, type InventoryRequest } from './GameEvents';
import { HOTBAR_SLOTS, Inventory } from './Inventory';

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
    private readonly dropToGround: (item: string, qty: number) => boolean,
  ) {
    onSceneEvent(scene, 'inventory:request', (req) => this.handle(req));
    onSceneEvent(scene, 'ui:ready', () => this.broadcast());
  }

  add(item: string, qty: number): number {
    const leftover = this.inventory.add(item, qty);
    if (leftover !== qty) this.broadcast();
    return leftover;
  }

  capacityFor(item: string): number {
    return this.inventory.capacityFor(item);
  }

  broadcast(): void {
    gameEvents.emit('inventory:changed', { slots: this.inventory.snapshot(), selected: this.selected });
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
        if (!this.dropToGround(stack.item, qty)) {
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
