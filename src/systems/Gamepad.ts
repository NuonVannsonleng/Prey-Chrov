import type { Action } from './Settings';
import type { InputState } from './VirtualInput';

/** Standard-layout button indices (Xbox names; PlayStation: A=✕, B=○, X=□, Y=△). */
export const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
  L3: 10,
  R3: 11,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
} as const;

export const STICK_DEAD_ZONE = 0.35;
/** Cursor speed at full stick, CSS px per second. */
export const CURSOR_SPEED = 900;

/** Buttons held for an action while playing (released when the button is). */
export const PLAY_HOLD: ReadonlyArray<[number, Action]> = [
  [PAD.A, 'interact'],
  [PAD.B, 'crouch'],
  [PAD.LT, 'sprint'],
];

/** Buttons that press an action once while playing. */
export const PLAY_TAP: ReadonlyArray<[number, Action | 'pause' | 'prev' | 'next']> = [
  [PAD.X, 'attack'],
  [PAD.RT, 'attack'],
  [PAD.Y, 'use'],
  [PAD.LB, 'prev'],
  [PAD.RB, 'next'],
  [PAD.UP, 'inventory'],
  [PAD.RIGHT, 'crafting'],
  [PAD.LEFT, 'journal'],
  [PAD.DOWN, 'map'],
  [PAD.BACK, 'character'],
  [PAD.START, 'pause'],
  [PAD.L3, 'dismantle'],
  [PAD.R3, 'rotate'],
];

/** The layout as players read it (Settings › Controller & touch, Player Guide). */
export const PAD_HELP: ReadonlyArray<[string, string]> = [
  ['Left stick', 'Move'],
  ['A / ✕', 'Gather · drink · use (hold)'],
  ['X / □  or  RT', 'Attack'],
  ['Y / △', 'Eat / place held item'],
  ['B / ○', 'Crouch (hold)'],
  ['LT', 'Sprint (hold)'],
  ['LB / RB', 'Previous / next hotbar slot'],
  ['D-pad ↑ → ← ↓', 'Inventory · Crafting · Journal · Map'],
  ['View / Select', 'Character'],
  ['Menu / Start', 'Pause'],
  ['R3 · L3', 'Rotate / repair · Dismantle'],
  ['In menus', 'Stick moves the cursor · A selects / drags · D-pad moves · B backs out · LB/RB switch tabs'],
];

export interface PadSnapshot {
  buttons: boolean[];
  axes: number[];
}

/** A snapshot from the browser's Gamepad object (analog triggers count from half-way). */
export function snapshotOf(pad: { buttons: ReadonlyArray<{ pressed: boolean; value: number }>; axes: ReadonlyArray<number> }): PadSnapshot {
  return {
    buttons: Array.from(pad.buttons, (b) => b.pressed || b.value > 0.5),
    axes: Array.from(pad.axes, (a) => (Number.isFinite(a) ? a : 0)),
  };
}

export interface PadFrame {
  /** Actions to hold this frame while playing. */
  hold: Set<Action>;
  /** Actions / commands pressed this frame. */
  taps: Array<Action | 'pause' | 'prev' | 'next'>;
  /** Left stick in play. */
  move: { x: number; y: number };
  /** Menus: cursor movement (stick, -1..1), keys tapped, and the select button edge. */
  cursor: { x: number; y: number };
  menuKeys: Array<{ code: string; shift?: boolean }>;
  select: 'press' | 'release' | null;
}

/**
 * Turns two pad snapshots into what to do this frame. Pure, so the mapping is unit-tested.
 * `blocked` holds buttons still down from before a mode change: they do nothing until released
 * (the press that opened a panel must not also act inside it, and vice versa).
 */
export function readPad(now: PadSnapshot, prev: PadSnapshot | null, state: InputState, blocked: Set<number>): PadFrame {
  const down = (i: number) => now.buttons[i] === true && !blocked.has(i);
  const edge = (i: number) => down(i) && prev?.buttons[i] !== true;
  const released = (i: number) => now.buttons[i] !== true && prev?.buttons[i] === true;
  const frame: PadFrame = { hold: new Set(), taps: [], move: { x: 0, y: 0 }, cursor: { x: 0, y: 0 }, menuKeys: [], select: null };
  for (let i = 0; i < Math.max(now.buttons.length, 16); i++) if (now.buttons[i] !== true) blocked.delete(i);

  const lx = now.axes[0] ?? 0;
  const ly = now.axes[1] ?? 0;
  if (state === 'play') {
    frame.move = { x: lx, y: ly };
    for (const [b, a] of PLAY_HOLD) if (down(b)) frame.hold.add(a);
    for (const [b, a] of PLAY_TAP) if (edge(b)) frame.taps.push(a);
    return frame;
  }
  // Menus and panels: either stick moves the cursor.
  const rx = now.axes[2] ?? 0;
  const ry = now.axes[3] ?? 0;
  const pick = Math.hypot(lx, ly) >= Math.hypot(rx, ry) ? [lx, ly] : [rx, ry];
  const [cx = 0, cy = 0] = pick;
  if (Math.hypot(cx, cy) > STICK_DEAD_ZONE) frame.cursor = { x: cx, y: cy };
  if (edge(PAD.UP)) frame.menuKeys.push({ code: 'ArrowUp' });
  if (edge(PAD.DOWN)) frame.menuKeys.push({ code: 'ArrowDown' });
  if (edge(PAD.LEFT)) frame.menuKeys.push({ code: 'ArrowLeft' });
  if (edge(PAD.RIGHT)) frame.menuKeys.push({ code: 'ArrowRight' });
  if (edge(PAD.B) || edge(PAD.START)) frame.menuKeys.push({ code: 'Escape' });
  if (edge(PAD.LB)) frame.menuKeys.push({ code: 'Tab', shift: true });
  if (edge(PAD.RB)) frame.menuKeys.push({ code: 'Tab' });
  if (edge(PAD.A)) frame.select = 'press';
  else if (released(PAD.A) && !blocked.has(PAD.A)) frame.select = 'release';
  return frame;
}
