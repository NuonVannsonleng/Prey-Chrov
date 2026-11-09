import Phaser from 'phaser';
import type { ItemStack } from './Inventory';
import type { QuestView } from './Quest';
import type { TabletDef } from '../data/schema';
import type { AmbienceLevels, SfxId } from './Audio';

/** A storage chest's contents (World → UI). */
export interface StorageView {
  uid: number;
  title: string;
  slots: ReadonlyArray<Readonly<ItemStack> | null>;
}

export interface CharacterView {
  equipment: { body: Readonly<ItemStack> | null; feet: Readonly<ItemStack> | null };
  skills: Array<{ id: string; name: string; level: number; xp: number; toNext: number | null; effect: string; now: string }>;
  knowledge: string[];
}

export interface MapData {
  seed: number;
  player: { x: number; y: number };
  /** Explored 8-tile cells as "cx,cy". */
  explored: string[];
  markers: Array<{ x: number; y: number; kind: 'pin' | 'note'; text: string }>;
  outposts: Array<{ x: number; y: number; name: string }>;
  ruins: Array<{ x: number; y: number; solved: boolean }>;
  landmarks: Array<{ x: number; y: number; name: string }>;
  shortcuts: Array<{ x: number; y: number }>;
  shrines: Array<{ x: number; y: number }>;
  signs: Array<{ x: number; y: number }>;
  heart: { x: number; y: number } | null;
}

export interface OutpostInfo {
  name: string;
  x: number;
  y: number;
}

export interface PlayerTick {
  x: number;
  y: number;
  speed: number;
  sprinting: boolean;
  /** M12: '' | 'crouch' | 'hidden'. */
  stealth: string;
}

export interface InventoryView {
  slots: ReadonlyArray<Readonly<ItemStack> | null>;
  selected: number;
}

/** UI → World requests; World owns the inventory and answers with 'inventory:changed'. */
export type InventoryRequest =
  | { type: 'move'; from: number; to: number }
  | { type: 'split'; slot: number }
  | { type: 'drop'; slot: number; item: string; qty: number }
  | { type: 'select'; slot: number };

export type ToastTone = 'info' | 'warn';

/** Every cross-system event and its payload. Add new events here first. */
export interface GameEventMap {
  'player:tick': PlayerTick;
  'debug:toggle': boolean;
  /** UI asks World to pause (Esc with no panel open). */
  'game:pause-request': void;
  /** UI finished creating; World replies with current state. */
  'ui:ready': void;
  /** A modal panel (inventory, dialog) opened or closed; World ignores gameplay input while open. */
  'ui:modal': boolean;
  'inventory:changed': InventoryView;
  'inventory:request': InventoryRequest;
  /** Contextual interaction prompt, '' when nothing is in reach. */
  'interact:prompt': string;
  'toast': { text: string; tone: ToastTone };
  /** A pickup was in reach but the inventory had no room for it. */
  'inventory:full': void;
  /** Player drank water. */
  'player:drank': void;
  'survival:tick': SurvivalTick;
  'clock:tick': ClockTick;
  /** Health dropped from hunger/thirst/food; UI flashes red. */
  'player:hurt': void;
  'craft:request': { recipe: string };
  /** Crafting stations within reach changed (e.g. near a campfire). */
  'craft:stations': string[];
  /** UI should open the crafting panel (E at a campfire). */
  /** Open crafting on a tab ('food' at a campfire or pot, 'building' at a workbench). */
  'ui:open-crafting': string;
  /** Storage chests (M10). */
  'storage:open': StorageView;
  'storage:changed': StorageView;
  /** Move a stack between chest and pack; slot -1 from 'chest' = take all. */
  'storage:move': { uid: number; from: 'chest' | 'player'; slot: number };
  'storage:close': void;
  /** World → UI: the chest can no longer be used (moved away, died, dismantled). */
  'storage:dismiss': void;
  /** M11: worn gear, skills and knowledge for the character panel and crafting locks. */
  'character:changed': CharacterView;
  'equipment:unequip': 'body' | 'feet';
  /** M13 full map: UI asks, World answers with everything discovered. */
  'map:request': void;
  'map:data': MapData;
  /** Add a custom marker at a world point, or remove the one nearest it. */
  'map:marker': { x: number; y: number };
  /** Compass: up to three nearest markers to point at on screen ([] = none / no compass). */
  'markers:pointers': Array<{ x: number; y: number; label: string }>;
  /** Outpost flags for the minimap and journal. */
  'outposts:changed': OutpostInfo[];
  /** World entered/left structure placement mode; UI routes Esc to cancel it. */
  'placement:mode': boolean;
  'placement:cancel': void;
  'objectives:changed': ObjectiveView[];
  /** World seed, sent when the UI is ready (minimap uses its own generator with this seed). */
  'world:info': { seed: number };
  /** Placed structure positions (minimap markers). */
  'structures:changed': Array<{ x: number; y: number; kind: string }>;
  /** Active status effects (sent about once a second). */
  'effects:changed': Array<{ id: string; remaining: number }>;
  /** Weather/forecast line and rain state (sent when it changes). */
  'weather:changed': { raining: boolean; label: string; flood: number };
  'quest:changed': QuestView;
  /** Current objective location (world px) for the edge arrow, or null when none. */
  'quest:target': { x: number; y: number; label: string } | null;
  /** A key tablet was read: show its text. */
  'tablet:read': TabletDef;
  /** One-shot sound effect (procedural audio). */
  'sfx': SfxId;
  /** Ambience mix levels 0..1 (sent a few times a second). */
  'ambience': AmbienceLevels;
  /** Pause/menus: silence ambience loops. */
  'audio:duck': boolean;
  /** The game was saved (autosave, pause or sleep). */
  'game:saved': { auto: boolean };
}

export interface SurvivalTick {
  health: number;
  hunger: number;
  thirst: number;
  stamina: number;
  maxHealth: number;
  maxHunger: number;
  maxThirst: number;
  maxStamina: number;
  hungry: boolean;
  thirsty: boolean;
  exhausted: boolean;
  warmth: number;
  cold: boolean;
  raining: boolean;
}

export interface ClockTick {
  day: number;
  label: string;
  phase: string;
  darkness: number;
}

export interface ObjectiveView {
  id: string;
  text: string;
  done: boolean;
}

type Handler<T> = [T] extends [void] ? () => void : (payload: T) => void;

/** Small typed wrapper over a Phaser EventEmitter shared by all scenes. */
class TypedEventBus {
  private readonly emitter = new Phaser.Events.EventEmitter();

  on<K extends keyof GameEventMap>(event: K, fn: Handler<GameEventMap[K]>, context?: unknown): void {
    this.emitter.on(event, fn, context);
  }

  off<K extends keyof GameEventMap>(event: K, fn: Handler<GameEventMap[K]>, context?: unknown): void {
    this.emitter.off(event, fn, context);
  }

  emit<K extends keyof GameEventMap>(
    event: K,
    ...payload: [GameEventMap[K]] extends [void] ? [] : [GameEventMap[K]]
  ): void {
    this.emitter.emit(event, ...payload);
  }

  listenerCount(event: keyof GameEventMap): number {
    return this.emitter.listenerCount(event);
  }
}

export const gameEvents = new TypedEventBus();

/** Subscribes for the lifetime of a scene; auto-unsubscribes on shutdown/destroy. */
export function onSceneEvent<K extends keyof GameEventMap>(
  scene: Phaser.Scene,
  event: K,
  fn: Handler<GameEventMap[K]>,
): void {
  gameEvents.on(event, fn, scene);
  const cleanup = () => {
    gameEvents.off(event, fn, scene);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    scene.events.off(Phaser.Scenes.Events.DESTROY, cleanup);
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
  scene.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
}
