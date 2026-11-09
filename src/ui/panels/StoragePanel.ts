import Phaser from 'phaser';
import { CSS, FONTS, GAME_HEIGHT, GAME_WIDTH } from '../../config';
import { gameEvents, type InventoryView, type StorageView } from '../../systems/GameEvents';
import type { ItemStack } from '../../systems/Inventory';
import { Button } from '../components/Button';
import { ItemSlot } from '../components/ItemSlot';

const SLOT = 52;
const GAP = 6;
const W = 720;
const H = 470;

/**
 * Storage chest (E at a chest): the chest's slots above, your inventory below. Click a stack to
 * move it across; "Take all" empties the chest into your pack. The World owns both inventories
 * and answers every request with fresh views, so the panel never assumes a move succeeded.
 */
export class StoragePanel {
  private readonly root: Phaser.GameObjects.Container;
  private readonly title: Phaser.GameObjects.Text;
  private readonly chestSlots: ItemSlot[] = [];
  private readonly playerSlots: ItemSlot[] = [];
  private uid = -1;

  constructor(scene: Phaser.Scene) {
    const left = GAME_WIDTH / 2 - W / 2;
    const top = GAME_HEIGHT / 2 - H / 2 - 20;
    const backdrop = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x020605, 0.5).setOrigin(0).setInteractive();
    const panel = scene.add.graphics();
    panel.fillStyle(0x0a1513, 0.97).fillRoundedRect(left, top, W, H, 12);
    panel.lineStyle(1.5, 0x84603c, 1).strokeRoundedRect(left, top, W, H, 12);
    this.title = scene.add.text(left + 24, top + 18, 'Storage Chest', { fontFamily: FONTS.ui, fontSize: '24px', fontStyle: '700', color: CSS.text });
    const help = scene.add
      .text(left + W - 24, top + 24, 'Click a stack to move it · E / Esc to close', { fontFamily: FONTS.ui, fontSize: '13px', color: CSS.textDim })
      .setOrigin(1, 0);
    const chestHead = scene.add.text(left + 24, top + 62, 'Chest', { fontFamily: FONTS.ui, fontSize: '15px', fontStyle: '700', color: CSS.gold });
    const packHead = scene.add.text(left + 24, top + 236, 'Your pack', { fontFamily: FONTS.ui, fontSize: '15px', fontStyle: '700', color: CSS.gold });
    this.root = scene.add.container(0, 0, [backdrop, panel, this.title, help, chestHead, packHead]).setDepth(650);

    const grid = (count: number, cols: number, y0: number, into: ItemSlot[], from: 'chest' | 'player') => {
      const gridW = cols * SLOT + (cols - 1) * GAP;
      const x0 = GAME_WIDTH / 2 - gridW / 2 + SLOT / 2;
      for (let i = 0; i < count; i++) {
        const slot = new ItemSlot(scene, x0 + (i % cols) * (SLOT + GAP), y0 + Math.floor(i / cols) * (SLOT + GAP), SLOT, i, from === 'player' && i < 6 ? String(i + 1) : undefined);
        slot.setInteractive({ useHandCursor: true });
        slot.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
          if (this.uid >= 0 && slot.item) gameEvents.emit('storage:move', { uid: this.uid, from, slot: i });
        });
        slot.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => slot.setSlotState({ hovered: true }));
        slot.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => slot.setSlotState({ hovered: false }));
        into.push(slot);
        this.root.add(slot);
      }
    };
    grid(24, 12, top + 104, this.chestSlots, 'chest');
    grid(20, 10, top + 296, this.playerSlots, 'player');
    const takeAll = new Button(scene, left + W - 110, top + 72, {
      label: 'Take all',
      width: 160,
      height: 34,
      fontSize: 16,
      onActivate: () => {
        if (this.uid >= 0) gameEvents.emit('storage:move', { uid: this.uid, from: 'chest', slot: -1 });
      },
    });
    this.root.add(takeAll);
    this.root.setVisible(false);
  }

  get isOpen(): boolean {
    return this.root.visible;
  }

  get chestUid(): number {
    return this.uid;
  }

  open(view: StorageView): void {
    this.uid = view.uid;
    this.title.setText(view.title);
    this.setChest(view);
    this.root.setVisible(true);
  }

  close(): void {
    this.uid = -1;
    this.root.setVisible(false);
  }

  setChest(view: StorageView): void {
    if (view.uid !== this.uid) return;
    this.fill(this.chestSlots, view.slots);
    // Only as many cells as this chest has.
    this.chestSlots.forEach((s, i) => s.setVisible(i < view.slots.length));
  }

  setInventory(view: InventoryView): void {
    this.fill(this.playerSlots, view.slots);
  }

  private fill(slots: ItemSlot[], stacks: ReadonlyArray<Readonly<ItemStack> | null>): void {
    slots.forEach((s, i) => s.setStack(stacks[i] ?? null));
  }
}
