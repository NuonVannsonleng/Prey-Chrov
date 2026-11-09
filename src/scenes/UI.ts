import Phaser from 'phaser';
import { CSS, FONTS, GAME_HEIGHT, GAME_WIDTH, SCENES } from '../config';
import { itemDef } from '../data/gameData';
import { gameEvents, onSceneEvent, type InventoryView, type PlayerTick } from '../systems/GameEvents';
import { HOTBAR_SLOTS } from '../systems/Inventory';
import { TEX } from '../textures';
import { oncePerKeyEvent } from '../utils/keys';
import { ConfirmDialog } from '../ui/components/ConfirmDialog';
import { Toast } from '../ui/components/Toast';
import { CraftingPanel } from '../ui/panels/CraftingPanel';
import { Hotbar } from '../ui/panels/Hotbar';
import { InventoryPanel } from '../ui/panels/InventoryPanel';
import { Minimap } from '../ui/panels/Minimap';
import { StatusHud } from '../ui/panels/StatusHud';

const HINTS = [
  ['WASD', 'Move'],
  ['Shift', 'Sprint'],
  ['E / Click', 'Gather · drink · use'],
  ['Click / Space', 'Attack (near a creature)'],
  ['F', 'Eat / place held item'],
  ['1–6 / Wheel', 'Hotbar'],
  ['I', 'Inventory'],
  ['C', 'Crafting'],
  ['Q', 'Drop one (Ctrl: stack)'],
  ['Esc', 'Close / pause'],
  ['H', 'Hide help'],
] as const;

/** HUD overlay running in parallel with World. Owns UI-only input (panels, hotbar, pause request). */
export class UI extends Phaser.Scene {
  private hints!: Phaser.GameObjects.Container;
  private sprintTag!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private debugText!: Phaser.GameObjects.Text;
  private hotbar!: Hotbar;
  private panel!: InventoryPanel;
  private crafting!: CraftingPanel;
  private status!: StatusHud;
  private minimap!: Minimap;
  private hurtFlash!: Phaser.GameObjects.Rectangle;
  private placing = false;
  private toast!: Toast;
  private dialog: ConfirmDialog | null = null;
  private view: InventoryView | null = null;
  private modal = false;
  private debugOn = false;
  private lastDebugUpdate = 0;
  private lastTick: PlayerTick | null = null;
  private readonly keyHandler = oncePerKeyEvent((e) => this.onKey(e));

  constructor() {
    super(SCENES.ui);
  }

  create(): void {
    this.debugOn = false;
    this.lastTick = null;
    this.lastDebugUpdate = 0;
    this.dialog = null;
    this.view = null;
    this.modal = false;
    this.placing = false;
    this.add.image(0, 0, TEX.vignette).setOrigin(0);
    this.hurtFlash = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x8a1a10, 0).setOrigin(0);

    this.add
      .text(24, 20, 'ព្រៃជ្រៅ', { fontFamily: FONTS.title, fontSize: '22px', color: CSS.gold, padding: { top: 10, bottom: 6 } })
      .setAlpha(0.9);
    this.status = new StatusHud(this);
    this.minimap = new Minimap(this);
    this.hints = this.buildHints();
    this.hotbar = new Hotbar(this);
    this.prompt = this.add
      .text(GAME_WIDTH / 2, this.hotbar.top - 40, '', {
        fontFamily: FONTS.ui,
        fontSize: '17px',
        fontStyle: '700',
        color: CSS.gold,
        backgroundColor: 'rgba(8,17,15,0.78)',
        padding: { left: 12, right: 12, top: 5, bottom: 5 },
      })
      .setOrigin(0.5, 1)
      .setVisible(false);
    this.sprintTag = this.add
      .text(GAME_WIDTH / 2 + 200, GAME_HEIGHT - 42, 'SPRINT', {
        fontFamily: FONTS.ui,
        fontSize: '14px',
        fontStyle: '700',
        color: CSS.fire,
        backgroundColor: 'rgba(10,18,16,0.75)',
        padding: { left: 8, right: 8, top: 4, bottom: 4 },
      })
      .setOrigin(0, 0.5)
      .setVisible(false);
    this.debugText = this.add
      .text(GAME_WIDTH - 20, 210, '', {
        fontFamily: 'Consolas, monospace',
        fontSize: '14px',
        color: CSS.turquoise,
        backgroundColor: 'rgba(5,10,9,0.7)',
        padding: { left: 8, right: 8, top: 6, bottom: 6 },
        align: 'right',
      })
      .setOrigin(1, 0)
      .setVisible(false);
    this.panel = new InventoryPanel(
      this,
      (slot, qty) => this.requestDrop(slot, qty),
      () => this.dialog !== null,
    );
    this.crafting = new CraftingPanel(this);
    this.toast = new Toast(this);

    onSceneEvent(this, 'world:info', ({ seed }) => this.minimap.setSeed(seed));
    onSceneEvent(this, 'structures:changed', (list) => this.minimap.setStructures(list));
    onSceneEvent(this, 'player:tick', (t) => {
      this.lastTick = t;
      this.minimap.update(t.x, t.y);
      if (this.sprintTag.visible !== t.sprinting) this.sprintTag.setVisible(t.sprinting);
    });
    onSceneEvent(this, 'debug:toggle', (on) => {
      this.debugOn = on;
      this.debugText.setVisible(on);
    });
    onSceneEvent(this, 'inventory:changed', (view) => {
      this.view = view;
      this.hotbar.render(view);
      this.panel.render(view);
      this.crafting.setInventory(view);
    });
    onSceneEvent(this, 'survival:tick', (t) => this.status.updateSurvival(t));
    onSceneEvent(this, 'clock:tick', (c) => this.status.updateClock(c));
    onSceneEvent(this, 'effects:changed', (list) => this.status.updateEffects(list));
    onSceneEvent(this, 'objectives:changed', (list) => this.status.updateObjectives(list));
    onSceneEvent(this, 'craft:stations', (s) => this.crafting.setStations(s));
    onSceneEvent(this, 'ui:open-crafting', () => {
      if (!this.dialog && !this.panel.isOpen) this.setCrafting(true);
    });
    onSceneEvent(this, 'placement:mode', (on) => {
      this.placing = on;
      if (on) this.toast.show('Click (or F) to build on a green spot · right-click / Esc to cancel', 'info');
    });
    onSceneEvent(this, 'player:hurt', () => {
      this.tweens.killTweensOf(this.hurtFlash);
      this.hurtFlash.setAlpha(0.32);
      this.tweens.add({ targets: this.hurtFlash, alpha: 0, duration: 650, ease: 'Sine.easeOut' });
    });
    onSceneEvent(this, 'interact:prompt', (text) => this.prompt.setText(text).setVisible(text !== ''));
    onSceneEvent(this, 'toast', ({ text, tone }) => this.toast.show(text, tone));
    onSceneEvent(this, 'inventory:full', () => {
      this.toast.show('Inventory full — drop something (Q) or reorganise (I)', 'warn');
      this.hotbar.flashFull();
    });

    const kb = this.input.keyboard;
    kb?.on('keydown', this.keyHandler);
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      kb?.off('keydown', this.keyHandler);
      this.input.off(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);
      if (this.modal) gameEvents.emit('ui:modal', false);
    });

    gameEvents.emit('ui:ready');
  }

  override update(time: number): void {
    if (!this.debugOn || time - this.lastDebugUpdate < 200) return;
    this.lastDebugUpdate = time;
    const t = this.lastTick;
    const fps = this.game.loop.actualFps.toFixed(0);
    this.debugText.setText(
      t
        ? `FPS ${fps}\npos ${t.x.toFixed(0)}, ${t.y.toFixed(0)}\nspeed ${t.speed.toFixed(0)} px/s\nbus listeners ${gameEvents.listenerCount('player:tick')}`
        : `FPS ${fps}`,
    );
  }

  private onKey(event: KeyboardEvent): void {
    if (event.code === 'Escape') {
      if (this.dialog) this.dialog.cancel();
      else if (this.crafting.isOpen) this.setCrafting(false);
      else if (this.panel.isOpen) this.setPanel(false);
      else if (this.placing) gameEvents.emit('placement:cancel');
      else gameEvents.emit('game:pause-request');
      return;
    }
    if (event.code === 'KeyH') {
      this.hints.setVisible(!this.hints.visible);
      this.status.setObjectivesVisible(this.hints.visible);
      return;
    }
    if (this.dialog) return;
    if (event.code === 'KeyI') {
      if (this.crafting.isOpen) this.setCrafting(false);
      this.setPanel(!this.panel.isOpen);
      return;
    }
    if (event.code === 'KeyC') {
      if (this.panel.isOpen) this.setPanel(false);
      this.setCrafting(!this.crafting.isOpen);
      return;
    }
    if (event.code === 'KeyQ') {
      const slot = this.hotbar.selectedSlot;
      const stack = this.view?.slots[slot];
      if (stack) this.requestDrop(slot, event.ctrlKey ? stack.qty : 1);
      return;
    }
    const digit = /^Digit([1-6])$/.exec(event.code);
    if (digit?.[1]) gameEvents.emit('inventory:request', { type: 'select', slot: Number(digit[1]) - 1 });
  }

  private onWheel(_p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number): void {
    if (this.modal || dy === 0) return;
    const next = (this.hotbar.selectedSlot + Math.sign(dy) + HOTBAR_SLOTS) % HOTBAR_SLOTS;
    gameEvents.emit('inventory:request', { type: 'select', slot: next });
  }

  /** Rare items need confirmation before they leave the inventory. */
  private requestDrop(slot: number, qty: number): void {
    const stack = this.view?.slots[slot];
    if (!stack) return;
    const def = itemDef(stack.item);
    const drop = () => gameEvents.emit('inventory:request', { type: 'drop', slot, item: stack.item, qty });
    if (def.rarity !== 'rare') {
      drop();
      return;
    }
    this.dialog = new ConfirmDialog(this, `Drop ${def.name} ×${qty}?\n${def.name} is rare and hard to find.`, 'Drop', (ok) => {
      this.dialog = null;
      this.syncModal();
      if (ok) drop();
    });
    this.syncModal();
  }

  private setCrafting(open: boolean): void {
    if (open) this.crafting.open();
    else this.crafting.close();
    this.syncModal();
  }

  private setPanel(open: boolean): void {
    if (open) this.panel.open();
    else this.panel.close();
    this.syncModal();
  }

  private syncModal(): void {
    const modal = this.panel.isOpen || this.crafting.isOpen || this.dialog !== null;
    if (modal === this.modal) return;
    this.modal = modal;
    gameEvents.emit('ui:modal', modal);
  }

  private buildHints(): Phaser.GameObjects.Container {
    const lineH = 20;
    const w = 262;
    const h = HINTS.length * lineH + 18;
    const c = this.add.container(20, GAME_HEIGHT - h - 20);
    const bg = this.add.graphics();
    bg.fillStyle(0x08110f, 0.72);
    bg.fillRoundedRect(0, 0, w, h, 8);
    bg.lineStyle(1, 0x3a5249, 0.8);
    bg.strokeRoundedRect(0, 0, w, h, 8);
    c.add(bg);
    HINTS.forEach(([key, action], i) => {
      const y = 9 + i * lineH;
      c.add(this.add.text(14, y, key, { fontFamily: FONTS.ui, fontSize: '13px', fontStyle: '700', color: CSS.gold }));
      c.add(this.add.text(108, y, action, { fontFamily: FONTS.ui, fontSize: '13px', color: CSS.text }));
    });
    return c;
  }
}
