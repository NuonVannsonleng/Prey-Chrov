import Phaser from 'phaser';
import { FONTS } from '../../config';
import { itemDef } from '../../data/gameData';
import type { ItemStack } from '../../systems/Inventory';
import { TEX } from '../../textures';

export const RARITY_COLOR = { common: 0x4b6a5c, uncommon: 0x4fc2b4, rare: 0xc58be0 } as const;

export interface SlotState {
  selected?: boolean;
  hovered?: boolean;
  dimmed?: boolean;
  flash?: boolean;
}

/** One inventory/hotbar cell: frame, item icon, stack count and optional key label. */
export class ItemSlot extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly icon: Phaser.GameObjects.Image;
  private readonly qty: Phaser.GameObjects.Text;
  private readonly wear: Phaser.GameObjects.Graphics;
  private stack: Readonly<ItemStack> | null = null;
  private slotState: SlotState = {};

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    readonly size: number,
    readonly index: number,
    keyLabel?: string,
  ) {
    super(scene, x, y);
    this.bg = scene.add.graphics();
    this.icon = scene.add.image(0, -2, TEX.icons, 'wood').setScale(2).setVisible(false);
    this.qty = scene.add
      .text(size / 2 - 5, size / 2 - 3, '', {
        fontFamily: FONTS.ui,
        fontSize: '15px',
        fontStyle: '700',
        color: '#e8e4d8',
        stroke: '#071210',
        strokeThickness: 3,
      })
      .setOrigin(1, 1);
    this.wear = scene.add.graphics();
    this.add([this.bg, this.icon, this.wear, this.qty]);
    if (keyLabel) {
      this.add(
        scene.add.text(-size / 2 + 5, -size / 2 + 3, keyLabel, {
          fontFamily: FONTS.ui,
          fontSize: '12px',
          fontStyle: '700',
          color: '#8d978f',
        }),
      );
    }
    this.setSize(size, size);
    scene.add.existing(this);
    this.redraw();
  }

  get item(): Readonly<ItemStack> | null {
    return this.stack;
  }

  setStack(stack: Readonly<ItemStack> | null): this {
    this.stack = stack;
    if (stack) {
      this.icon.setFrame(itemDef(stack.item).icon).setVisible(true);
      this.qty.setText(stack.qty > 1 ? String(stack.qty) : '');
    } else {
      this.icon.setVisible(false);
      this.qty.setText('');
    }
    this.redraw();
    return this;
  }

  setSlotState(state: SlotState): this {
    this.slotState = state;
    this.redraw();
    return this;
  }

  private redraw(): void {
    const s = this.size;
    const g = this.bg.clear();
    const rarity = this.stack ? itemDef(this.stack.item).rarity : 'common';
    const fill = this.slotState.flash ? 0x4a1e18 : this.slotState.hovered ? 0x1b3a31 : 0x0c1916;
    g.fillStyle(fill, 0.88).fillRoundedRect(-s / 2, -s / 2, s, s, 6);
    const border = this.slotState.selected ? 0xe6b866 : this.slotState.flash ? 0xd9644a : RARITY_COLOR[rarity];
    g.lineStyle(this.slotState.selected ? 2.5 : 1.5, border, this.stack || this.slotState.selected ? 1 : 0.5);
    g.strokeRoundedRect(-s / 2, -s / 2, s, s, 6);
    this.icon.setAlpha(this.slotState.dimmed ? 0.35 : 1);
    this.wear.clear();
    if (this.stack?.durability !== undefined) {
      const def = itemDef(this.stack.item);
      const max = def.tool?.durability ?? def.light?.burnSeconds ?? this.stack.durability;
      const frac = Math.max(0, Math.min(1, this.stack.durability / max));
      const bw = s - 12;
      this.wear.fillStyle(0x071210, 0.9).fillRect(-bw / 2, s / 2 - 7, bw, 4);
      this.wear.fillStyle(frac > 0.5 ? 0x8ec26a : frac > 0.2 ? 0xe6b866 : 0xd9644a, 1).fillRect(-bw / 2, s / 2 - 7, bw * frac, 4);
    }
    this.qty.setAlpha(this.slotState.dimmed ? 0.35 : 1);
  }
}
