import Phaser from 'phaser';
import { CSS, FONTS, GAME_HEIGHT, GAME_WIDTH } from '../../config';
import { itemDef } from '../../data/gameData';
import { gameEvents, type InventoryView } from '../../systems/GameEvents';
import { HOTBAR_SLOTS } from '../../systems/Inventory';
import { ItemSlot } from '../components/ItemSlot';

const SLOT = 52;
const GAP = 6;

/** Bottom-centre 6-slot hotbar mirroring inventory slots 0–5. Click a slot to select it. */
export class Hotbar {
  readonly top: number;
  private readonly slots: ItemSlot[] = [];
  private readonly nameLabel: Phaser.GameObjects.Text;
  private selected = 0;
  private flashUntil = 0;

  constructor(private readonly scene: Phaser.Scene) {
    const total = HOTBAR_SLOTS * SLOT + (HOTBAR_SLOTS - 1) * GAP;
    const y = GAME_HEIGHT - SLOT / 2 - 16;
    this.top = y - SLOT / 2;
    const x0 = GAME_WIDTH / 2 - total / 2 + SLOT / 2;
    for (let i = 0; i < HOTBAR_SLOTS; i++) {
      const slot = new ItemSlot(scene, x0 + i * (SLOT + GAP), y, SLOT, i, String(i + 1));
      slot.setInteractive({ useHandCursor: true });
      slot.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => gameEvents.emit('inventory:request', { type: 'select', slot: i }));
      this.slots.push(slot);
    }
    this.nameLabel = scene.add
      .text(GAME_WIDTH / 2, this.top - 10, '', {
        fontFamily: FONTS.ui,
        fontSize: '15px',
        fontStyle: '600',
        color: CSS.text,
        stroke: '#071210',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 1);
  }

  get selectedSlot(): number {
    return this.selected;
  }

  render(view: InventoryView): void {
    this.selected = view.selected;
    const flash = this.scene.time.now < this.flashUntil;
    this.slots.forEach((slot, i) => {
      slot.setStack(view.slots[i] ?? null).setSlotState({ selected: i === view.selected, flash });
    });
    const stack = view.slots[view.selected];
    this.nameLabel.setText(stack ? `${itemDef(stack.item).name}${stack.qty > 1 ? ` ×${stack.qty}` : ''}` : '');
  }

  /** Briefly tints the hotbar red (inventory full). */
  flashFull(view: InventoryView | null): void {
    this.flashUntil = this.scene.time.now + 450;
    if (view) this.render(view);
    this.scene.time.delayedCall(460, () => {
      if (view) this.render(view);
    });
  }
}
