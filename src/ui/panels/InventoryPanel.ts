import Phaser from 'phaser';
import { CSS, FONTS, GAME_HEIGHT, GAME_WIDTH } from '../../config';
import { itemDef } from '../../data/gameData';
import { gameEvents, type InventoryView } from '../../systems/GameEvents';
import { HOTBAR_SLOTS, INVENTORY_SLOTS } from '../../systems/Inventory';
import { TEX } from '../../textures';
import { ItemSlot } from '../components/ItemSlot';
import { Tooltip } from '../components/Tooltip';

const COLS = 5;
const SLOT = 60;
const GAP = 8;
const HOTBAR_GAP = 14;
const PAD = 24;
const DRAG_THRESHOLD = 6;

/**
 * Modal 20-slot inventory (I). Drag to move/merge/swap, Shift+click to split,
 * drag outside the panel to drop, click a hotbar-row slot to select it.
 */
export class InventoryPanel {
  private readonly root: Phaser.GameObjects.Container;
  private readonly slots: ItemSlot[] = [];
  private readonly tooltip: Tooltip;
  private readonly dragIcon: Phaser.GameObjects.Image;
  private readonly bounds: Phaser.Geom.Rectangle;
  private view: InventoryView | null = null;
  private dragFrom = -1;
  private dragStart = { x: 0, y: 0 };
  private dragging = false;
  private hover = -1;

  constructor(
    scene: Phaser.Scene,
    private readonly requestDrop: (slot: number, qty: number) => void,
  ) {
    const rows = Math.ceil(INVENTORY_SLOTS / COLS);
    const gridW = COLS * SLOT + (COLS - 1) * GAP;
    const gridH = rows * SLOT + (rows - 1) * GAP + HOTBAR_GAP;
    const w = gridW + PAD * 2;
    const h = gridH + 132;
    const left = GAME_WIDTH / 2 - w / 2;
    const top = GAME_HEIGHT / 2 - h / 2 - 20;
    this.bounds = new Phaser.Geom.Rectangle(left, top, w, h);

    const backdrop = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x020605, 0.45).setOrigin(0).setInteractive();
    const panel = scene.add.graphics();
    panel.fillStyle(0x0a1513, 0.96).fillRoundedRect(left, top, w, h, 12);
    panel.lineStyle(1.5, 0x4b6a5c, 1).strokeRoundedRect(left, top, w, h, 12);
    const title = scene.add.text(left + PAD, top + 18, 'Inventory', {
      fontFamily: FONTS.ui,
      fontSize: '24px',
      fontStyle: '700',
      color: CSS.text,
    });
    const hotbarLabel = scene.add
      .text(left + w - PAD, top + 26, 'Top row = hotbar (1–6)', { fontFamily: FONTS.ui, fontSize: '13px', color: CSS.gold })
      .setOrigin(1, 0);
    const help = scene.add
      .text(GAME_WIDTH / 2, top + h - 30, 'Drag to move · Shift+click to split · Drag outside to drop · I / Esc to close', {
        fontFamily: FONTS.ui,
        fontSize: '13px',
        color: CSS.textDim,
      })
      .setOrigin(0.5);

    this.root = scene.add.container(0, 0, [backdrop, panel, title, hotbarLabel, help]).setDepth(500);
    const gx = left + PAD + SLOT / 2;
    const gy = top + 72 + SLOT / 2;
    for (let i = 0; i < INVENTORY_SLOTS; i++) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      // First 6 slots span row 0 (5) + first of row 1; keep the grid uniform and mark hotbar slots instead.
      const y = gy + row * (SLOT + GAP) + (row > 0 ? HOTBAR_GAP : 0);
      const slot = new ItemSlot(scene, gx + col * (SLOT + GAP), y, SLOT, i, i < HOTBAR_SLOTS ? String(i + 1) : undefined);
      this.slots.push(slot);
      this.root.add(slot);
    }
    this.dragIcon = scene.add.image(0, 0, TEX.icons, 'wood').setScale(2.4).setAlpha(0.9).setVisible(false).setDepth(2500);
    this.tooltip = new Tooltip(scene);
    this.root.setVisible(false);

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
      scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
      scene.input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    });
  }

  get isOpen(): boolean {
    return this.root.visible;
  }

  open(): void {
    this.root.setVisible(true);
    this.refresh();
  }

  close(): void {
    this.cancelDrag();
    this.tooltip.hide();
    this.hover = -1;
    this.root.setVisible(false);
  }

  render(view: InventoryView): void {
    this.view = view;
    if (this.isOpen) this.refresh();
  }

  private refresh(): void {
    const view = this.view;
    this.slots.forEach((slot, i) => {
      slot.setStack(view?.slots[i] ?? null).setSlotState({
        selected: i === view?.selected,
        hovered: i === this.hover,
        dimmed: this.dragging && i === this.dragFrom,
      });
    });
  }

  private slotAt(x: number, y: number): number {
    for (const s of this.slots) {
      if (Math.abs(x - s.x) <= SLOT / 2 && Math.abs(y - s.y) <= SLOT / 2) return s.index;
    }
    return -1;
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (!this.isOpen || !pointer.leftButtonDown()) return;
    const i = this.slotAt(pointer.x, pointer.y);
    if (i < 0 || !this.view?.slots[i]) {
      if (i >= 0 && i < HOTBAR_SLOTS) gameEvents.emit('inventory:request', { type: 'select', slot: i });
      return;
    }
    const shift = (pointer.event as MouseEvent | undefined)?.shiftKey === true;
    if (shift) {
      gameEvents.emit('inventory:request', { type: 'split', slot: i });
      return;
    }
    this.dragFrom = i;
    this.dragStart = { x: pointer.x, y: pointer.y };
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (!this.isOpen) return;
    if (this.dragFrom >= 0 && !this.dragging) {
      if (Math.hypot(pointer.x - this.dragStart.x, pointer.y - this.dragStart.y) > DRAG_THRESHOLD) {
        const stack = this.slots[this.dragFrom]?.item;
        if (stack) {
          this.dragging = true;
          this.dragIcon.setFrame(itemDef(stack.item).icon).setVisible(true);
          this.tooltip.hide();
        }
      }
    }
    if (this.dragging) {
      this.dragIcon.setPosition(pointer.x, pointer.y);
    }
    const hover = this.slotAt(pointer.x, pointer.y);
    if (hover !== this.hover) {
      this.hover = hover;
      this.refresh();
    }
    const stack = hover >= 0 ? this.view?.slots[hover] : null;
    if (stack && !this.dragging) this.tooltip.showFor(stack, pointer.x, pointer.y);
    else this.tooltip.hide();
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    if (!this.isOpen || this.dragFrom < 0) return;
    const from = this.dragFrom;
    const wasDragging = this.dragging;
    this.cancelDrag();
    const to = this.slotAt(pointer.x, pointer.y);
    if (!wasDragging) {
      if (to === from && from < HOTBAR_SLOTS) gameEvents.emit('inventory:request', { type: 'select', slot: from });
      return;
    }
    if (to >= 0 && to !== from) {
      gameEvents.emit('inventory:request', { type: 'move', from, to });
    } else if (to < 0 && !this.bounds.contains(pointer.x, pointer.y)) {
      const stack = this.view?.slots[from];
      if (stack) this.requestDrop(from, stack.qty);
    }
  }

  private cancelDrag(): void {
    this.dragFrom = -1;
    this.dragging = false;
    this.dragIcon.setVisible(false);
    this.refresh();
  }
}
