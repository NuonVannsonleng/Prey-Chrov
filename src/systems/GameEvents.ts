import Phaser from 'phaser';
import type { ItemStack } from './Inventory';

export interface PlayerTick {
  x: number;
  y: number;
  speed: number;
  sprinting: boolean;
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
  'ui:open-crafting': void;
  /** World entered/left structure placement mode; UI routes Esc to cancel it. */
  'placement:mode': boolean;
  'placement:cancel': void;
  'objectives:changed': ObjectiveView[];
  /** World seed, sent when the UI is ready (minimap uses its own generator with this seed). */
  'world:info': { seed: number };
  /** Placed structure positions (minimap markers). */
  'structures:changed': Array<{ x: number; y: number; kind: string }>;
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
