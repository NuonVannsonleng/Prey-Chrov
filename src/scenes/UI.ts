import Phaser from 'phaser';
import { CSS, FONTS, GAME_HEIGHT, GAME_WIDTH, SCENES } from '../config';
import { itemDef } from '../data/gameData';
import { gameEvents, onSceneEvent, type InventoryView, type PlayerTick } from '../systems/GameEvents';
import { HOTBAR_SLOTS } from '../systems/Inventory';
import { TEX } from '../textures';
import { getSettings } from '../systems/Settings';
import { oncePerKeyEvent } from '../utils/keys';
import { ConfirmDialog } from '../ui/components/ConfirmDialog';
import { Toast } from '../ui/components/Toast';
import { CraftingPanel } from '../ui/panels/CraftingPanel';
import { StoragePanel } from '../ui/panels/StoragePanel';
import { CharacterPanel } from '../ui/panels/CharacterPanel';
import { MapPanel } from '../ui/panels/MapPanel';
import { StoryDialog } from '../ui/components/StoryDialog';
import { Hotbar } from '../ui/panels/Hotbar';
import { InventoryPanel } from '../ui/panels/InventoryPanel';
import { Minimap } from '../ui/panels/Minimap';
import { JournalPanel, TabletView } from '../ui/panels/JournalPanel';
import { QuestArrow } from '../ui/panels/QuestArrow';
import { WeatherOverlay } from '../ui/panels/WeatherOverlay';
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
  ['J', 'Journal (quest, tablets)'],
  ['K', 'Character (gear, skills)'],
  ['M', 'Map (click: add/remove marker)'],
  ['Q', 'Drop one (Ctrl: stack)'],
  ['R · X', 'Rotate / repair · dismantle'],
  ['Z (hold)', 'Crouch: quiet; hide in bushes'],
  ['Esc', 'Close / pause'],
  ['H', 'Hide help'],
] as const;

/** HUD overlay running in parallel with World. Owns UI-only input (panels, hotbar, pause request). */
export class UI extends Phaser.Scene {
  private hints!: Phaser.GameObjects.Container;
  private sprintTag!: Phaser.GameObjects.Text;
  private stealthTag!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private debugText!: Phaser.GameObjects.Text;
  private hotbar!: Hotbar;
  private panel!: InventoryPanel;
  private crafting!: CraftingPanel;
  private storage!: StoragePanel;
  private character!: CharacterPanel;
  private map!: MapPanel;
  /** Story offers/choices waiting to be shown one at a time. */
  private story: StoryDialog | null = null;
  private readonly storyQueue: Array<() => StoryDialog> = [];
  /** Compass pointers toward the nearest map markers. */
  private pointerG!: Phaser.GameObjects.Graphics;
  private readonly pointerT: Phaser.GameObjects.Text[] = [];
  private pointers: Array<{ x: number; y: number; label: string }> = [];
  private status!: StatusHud;
  private minimap!: Minimap;
  private journal!: JournalPanel;
  private tabletView!: TabletView;
  private questArrow!: QuestArrow;
  private weather!: WeatherOverlay;
  private hurtFlash!: Phaser.GameObjects.Rectangle;
  private placing = false;
  private closeTabletNextFrame = false;
  private savedText!: Phaser.GameObjects.Text;
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
    // The scene instance is reused across runs: never carry a dead story dialog over.
    this.story = null;
    this.storyQueue.length = 0;
    this.placing = false;
    this.add.image(0, 0, TEX.vignette).setOrigin(0);
    this.hurtFlash = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x8a1a10, 0).setOrigin(0);

    this.add
      .text(24, 20, 'ព្រៃជ្រៅ', { fontFamily: FONTS.title, fontSize: '22px', color: CSS.gold, padding: { top: 10, bottom: 6 } })
      .setAlpha(0.9);
    this.weather = new WeatherOverlay(this);
    this.status = new StatusHud(this);
    this.questArrow = new QuestArrow(this);
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
    this.stealthTag = this.add
      .text(GAME_WIDTH / 2 - 182, GAME_HEIGHT - 42, '', {
        fontFamily: FONTS.ui,
        fontSize: '14px',
        fontStyle: '700',
        color: CSS.turquoise,
        backgroundColor: 'rgba(10,18,16,0.75)',
        padding: { left: 8, right: 8, top: 4, bottom: 4 },
      })
      .setOrigin(1, 1)
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
    this.storage = new StoragePanel(this);
    this.character = new CharacterPanel(this);
    this.map = new MapPanel(this);
    this.pointerG = this.add.graphics().setDepth(90);
    for (let i = 0; i < 3; i++) this.pointerT.push(this.add.text(0, 0, '', { fontFamily: FONTS.ui, fontSize: '12px', fontStyle: '700', color: '#f4a090', stroke: '#071210', strokeThickness: 3 }).setOrigin(0.5).setDepth(90).setVisible(false));
    this.journal = new JournalPanel(this);
    this.tabletView = new TabletView(this);
    this.toast = new Toast(this);
    this.savedText = this.add
      .text(GAME_WIDTH - 20, GAME_HEIGHT - 20, '', { fontFamily: FONTS.ui, fontSize: '13px', fontStyle: '600', color: CSS.textDim })
      .setOrigin(1, 1)
      .setAlpha(0);
    if (!getSettings().showHints) {
      this.hints.setVisible(false);
      this.status.setObjectivesVisible(false);
    }

    onSceneEvent(this, 'world:info', ({ seed }) => {
      this.minimap.setSeed(seed);
      this.map.setSeed(seed);
    });
    onSceneEvent(this, 'map:data', (d) => this.map.render(d));
    onSceneEvent(this, 'sidequests:changed', (v) => this.journal.renderSide(v.quests, v.memories));
    onSceneEvent(this, 'story:offer', (o) =>
      this.queueStory(
        () =>
          new StoryDialog(this, o.title, o.text, [
            { id: 'accept', label: 'Follow it', description: 'Begin this side story. It appears in your Journal (J) › Side stories.', enabled: true },
            { id: 'decline', label: 'Let it go', description: 'Decline. Nothing is lost, and the main journey is unaffected.', enabled: true },
          ], (id) => this.endStory(() => gameEvents.emit('story:answer', { id: o.id, accept: id === 'accept' }))),
      ),
    );
    onSceneEvent(this, 'story:choice', (c) =>
      this.queueStory(() => new StoryDialog(this, c.title, c.prompt, c.options, (id) => this.endStory(() => gameEvents.emit('story:choose', { id: c.id, option: id })))),
    );
    onSceneEvent(this, 'markers:pointers', (list) => {
      this.pointers = list;
    });
    onSceneEvent(this, 'structures:changed', (list) => this.minimap.setStructures(list));
    onSceneEvent(this, 'player:tick', (t) => {
      this.lastTick = t;
      this.minimap.update(t.x, t.y);
      if (this.modal) this.questArrow.setVisible(false);
      else this.questArrow.update(t.x, t.y);
      if (this.sprintTag.visible !== t.sprinting) this.sprintTag.setVisible(t.sprinting);
      this.drawPointers(t.x, t.y);
      const st = t.stealth === 'hidden' ? 'HIDDEN' : t.stealth === 'crouch' ? 'CROUCHING' : '';
      if (this.stealthTag.text !== st) this.stealthTag.setText(st).setVisible(st !== '');
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
      this.storage.setInventory(view);
    });
    onSceneEvent(this, 'storage:open', (v) => {
      if (this.dialog || this.panel.isOpen || this.crafting.isOpen || this.journal.isOpen) return;
      this.storage.open(v);
      if (this.view) this.storage.setInventory(this.view);
      this.syncModal();
    });
    onSceneEvent(this, 'storage:changed', (v) => this.storage.setChest(v));
    onSceneEvent(this, 'character:changed', (v) => {
      this.character.render(v);
      this.crafting.setKnowledge(v.knowledge);
    });
    onSceneEvent(this, 'storage:dismiss', () => {
      if (this.storage.isOpen) this.closeStorage();
    });
    onSceneEvent(this, 'outposts:changed', (list) => {
      this.minimap.setOutposts(list);
      this.journal.setOutposts(list);
    });
    onSceneEvent(this, 'survival:tick', (t) => this.status.updateSurvival(t));
    onSceneEvent(this, 'clock:tick', (c) => this.status.updateClock(c));
    onSceneEvent(this, 'effects:changed', (list) => this.status.updateEffects(list));
    onSceneEvent(this, 'weather:changed', ({ raining, label }) => {
      this.status.updateWeather(label, raining);
      this.weather.setRaining(raining);
    });
    onSceneEvent(this, 'quest:changed', (q) => this.journal.render(q));
    onSceneEvent(this, 'quest:target', (t) => this.questArrow.setTarget(t));
    onSceneEvent(this, 'tablet:read', (t) => {
      this.tabletView.show(t);
      this.syncModal();
    });
    onSceneEvent(this, 'objectives:changed', (list) => this.status.updateObjectives(list));
    onSceneEvent(this, 'craft:stations', (s) => this.crafting.setStations(s));
    onSceneEvent(this, 'ui:open-crafting', (tab) => {
      if (!this.dialog && !this.panel.isOpen && !this.storage.isOpen) {
        this.setCrafting(true);
        this.crafting.open(tab);
      }
    });
    onSceneEvent(this, 'placement:mode', (on) => {
      this.placing = on;
      if (on) this.toast.show('Click (or F) to build on a green spot · right-click / Esc to cancel', 'info');
    });
    onSceneEvent(this, 'game:saved', ({ auto }) => {
      this.tweens.killTweensOf(this.savedText);
      this.savedText.setText(auto ? 'Saved ✓' : 'Journey saved ✓').setAlpha(1);
      this.tweens.add({ targets: this.savedText, alpha: 0, delay: 1400, duration: 600 });
    });
    onSceneEvent(this, 'player:hurt', () => {
      this.tweens.killTweensOf(this.hurtFlash);
      this.hurtFlash.setAlpha(getSettings().reducedFlash ? 0.14 : 0.32);
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
      this.storyQueue.length = 0;
      this.story = null;
    });

    gameEvents.emit('ui:ready');
  }

  override update(time: number): void {
    if (this.closeTabletNextFrame) {
      this.closeTabletNextFrame = false;
      this.closeTablet();
    }
    this.weather.update(time);
    if (this.tabletView.isOpen !== this.modal && this.tabletView.isOpen) this.syncModal();
    if (!this.tabletView.isOpen && this.modal && !this.panel.isOpen && !this.crafting.isOpen && !this.journal.isOpen && !this.storage.isOpen && !this.character.isOpen && !this.map.isOpen && !this.story && !this.dialog) this.syncModal();
    if (!this.debugOn || time - this.lastDebugUpdate < 200) return;
    this.lastDebugUpdate = time;
    const t = this.lastTick;
    const fps = this.game.loop.actualFps.toFixed(0);
    this.debugText.setText(
      t
        ? `FPS ${fps}\nupdate ${(this.scene.get(SCENES.world) as unknown as { perfMs: number }).perfMs.toFixed(2)} ms\npos ${t.x.toFixed(0)}, ${t.y.toFixed(0)}\nspeed ${t.speed.toFixed(0)} px/s\nbus listeners ${gameEvents.listenerCount('player:tick')}`
        : `FPS ${fps}`,
    );
  }

  private onKey(event: KeyboardEvent): void {
    // A story moment must be answered; its buttons handle the keys.
    if (this.story) return;
    if (event.code === 'Escape') {
      if (this.dialog) this.dialog.cancel();
      else if (this.tabletView.isOpen) this.closeTablet();
      else if (this.storage.isOpen) this.closeStorage();
      else if (this.character.isOpen) this.setCharacter(false);
      else if (this.map.isOpen) this.setMap(false);
      else if (this.journal.isOpen) this.setJournal(false);
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
    if (this.tabletView.isOpen) {
      // Close on the next frame so the same key press can't reach the world.
      if (event.code === 'KeyE' || event.code === 'Enter' || event.code === 'Space') this.closeTabletNextFrame = true;
      return;
    }
    if (this.storage.isOpen) {
      // E closes the chest on the next frame so the same press can't reach the world.
      if (event.code === 'KeyE') this.time.delayedCall(0, () => this.closeStorage());
      return;
    }
    if (event.code === 'KeyM') {
      if (this.panel.isOpen) this.setPanel(false);
      if (this.crafting.isOpen) this.setCrafting(false);
      if (this.journal.isOpen) this.setJournal(false);
      if (this.character.isOpen) this.setCharacter(false);
      this.setMap(!this.map.isOpen);
      return;
    }
    if (this.map.isOpen) {
      const step = event.shiftKey ? 20 : 6;
      if (event.code === 'ArrowLeft' || event.code === 'KeyA') this.map.pan(-step, 0);
      else if (event.code === 'ArrowRight' || event.code === 'KeyD') this.map.pan(step, 0);
      else if (event.code === 'ArrowUp' || event.code === 'KeyW') this.map.pan(0, -step);
      else if (event.code === 'ArrowDown' || event.code === 'KeyS') this.map.pan(0, step);
      return;
    }
    if (event.code === 'KeyK') {
      if (this.map.isOpen) this.setMap(false);
      if (this.panel.isOpen) this.setPanel(false);
      if (this.crafting.isOpen) this.setCrafting(false);
      if (this.journal.isOpen) this.setJournal(false);
      this.setCharacter(!this.character.isOpen);
      return;
    }
    if (this.character.isOpen && /^Digit[1-6]$/.test(event.code)) return;
    if (this.journal.isOpen && (event.code === 'Tab' || event.code === 'Digit1' || event.code === 'Digit2')) {
      event.preventDefault();
      if (event.code === 'Tab') this.journal.nextTab();
      else this.journal.setTab(event.code === 'Digit1' ? 'main' : 'side');
      return;
    }
    if (event.code === 'KeyJ') {
      if (this.character.isOpen) this.setCharacter(false);
      if (this.panel.isOpen) this.setPanel(false);
      if (this.crafting.isOpen) this.setCrafting(false);
      this.setJournal(!this.journal.isOpen);
      return;
    }
    if (event.code === 'KeyI') {
      if (this.character.isOpen) this.setCharacter(false);
      if (this.crafting.isOpen) this.setCrafting(false);
      this.setPanel(!this.panel.isOpen);
      return;
    }
    if (event.code === 'Tab' && this.crafting.isOpen) {
      event.preventDefault();
      this.crafting.nextTab(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.code === 'KeyC') {
      if (this.panel.isOpen) this.setPanel(false);
      if (this.character.isOpen) this.setCharacter(false);
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

  private setJournal(open: boolean): void {
    if (open && this.lastTick) this.journal.refreshFrom(this.lastTick.x, this.lastTick.y);
    if (open) this.journal.open();
    else this.journal.close();
    this.syncModal();
  }

  private closeTablet(): void {
    this.tabletView.close();
    this.syncModal();
  }

  private queueStory(make: () => StoryDialog): void {
    this.storyQueue.push(make);
    if (!this.story) this.nextStory();
  }

  private nextStory(): void {
    const make = this.storyQueue.shift();
    if (!make) return;
    // Story moments wait for other panels to close.
    for (const close of [() => this.panel.isOpen && this.setPanel(false), () => this.crafting.isOpen && this.setCrafting(false), () => this.journal.isOpen && this.setJournal(false), () => this.map.isOpen && this.setMap(false), () => this.character.isOpen && this.setCharacter(false)]) close();
    this.story = make();
    gameEvents.emit('ui:story', true);
    this.syncModal();
  }

  private endStory(send: () => void): void {
    this.story = null;
    this.syncModal();
    send();
    if (this.storyQueue.length) this.time.delayedCall(200, () => this.nextStory());
    else gameEvents.emit('ui:story', false);
  }

  private setMap(open: boolean): void {
    if (open) this.map.open();
    else this.map.close();
    this.syncModal();
  }

  /** Edge pointers (with distance) toward the nearest markers while a compass is carried. */
  private drawPointers(px: number, py: number): void {
    const g = this.pointerG.clear();
    const show = !this.modal && this.pointers.length > 0;
    this.pointers.forEach((m, i) => {
      const t = this.pointerT[i];
      if (!t) return;
      const dx = (m.x - px) * 2;
      const dy = (m.y - py) * 2;
      const onScreen = Math.abs(dx) < GAME_WIDTH / 2 - 60 && Math.abs(dy) < GAME_HEIGHT / 2 - 90;
      if (!show || onScreen) {
        t.setVisible(false);
        return;
      }
      const len = Math.hypot(dx, dy) || 1;
      // Keep pointers clear of the HUD (top) and the prompt / hotbar (bottom).
      const k = Math.min((GAME_WIDTH / 2 - 70) / Math.abs(dx || 1e-6), (dy < 0 ? GAME_HEIGHT / 2 - 130 : GAME_HEIGHT / 2 - 190) / Math.abs(dy || 1e-6));
      const sx = GAME_WIDTH / 2 + dx * k;
      const sy = GAME_HEIGHT / 2 + dy * k;
      const ux = dx / len;
      const uy = dy / len;
      g.fillStyle(0xd9644a, 0.9).fillTriangle(sx + ux * 10, sy + uy * 10, sx - uy * 6, sy + ux * 6, sx + uy * 6, sy - ux * 6);
      t.setText(`${m.label} · ${Math.round(len / 2 / 32)} m`).setPosition(sx - ux * 22, sy - uy * 22).setVisible(true);
    });
    for (let i = this.pointers.length; i < this.pointerT.length; i++) this.pointerT[i]?.setVisible(false);
  }

  private setCharacter(open: boolean): void {
    if (open) this.character.open();
    else this.character.close();
    this.syncModal();
  }

  private closeStorage(): void {
    this.storage.close();
    gameEvents.emit('storage:close');
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
    const modal = this.panel.isOpen || this.crafting.isOpen || this.journal.isOpen || this.tabletView.isOpen || this.storage.isOpen || this.character.isOpen || this.map.isOpen || this.story !== null || this.dialog !== null;
    if (modal === this.modal) return;
    this.modal = modal;
    this.toast.setLow(modal);
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
