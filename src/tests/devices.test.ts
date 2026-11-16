import { describe, expect, it } from 'vitest';
import { PAD, PAD_HELP, PLAY_HOLD, PLAY_TAP, readPad, snapshotOf, type PadSnapshot } from '../systems/Gamepad';
import { ACTIONS, parseSettings } from '../systems/Settings';
import { isHeld, keyCodeOf, releaseAllKeys, setMoveKeys } from '../systems/VirtualInput';

const pad = (pressed: number[] = [], axes: number[] = [0, 0, 0, 0]): PadSnapshot => ({
  buttons: Array.from({ length: 17 }, (_, i) => pressed.includes(i)),
  axes,
});

describe('controller mapping', () => {
  it('every mapped action is a real, bindable action and the layout is documented', () => {
    for (const [, a] of PLAY_HOLD) expect(ACTIONS).toContain(a);
    for (const [, a] of PLAY_TAP) if (!['pause', 'prev', 'next'].includes(a)) expect(ACTIONS).toContain(a);
    const buttons = [...PLAY_HOLD, ...PLAY_TAP].map(([b]) => b);
    expect(new Set(buttons).size).toBe(buttons.length);
    expect(PAD_HELP.length).toBeGreaterThanOrEqual(10);
  });

  it('play: stick moves, A holds interact, X attacks once per press', () => {
    const blocked = new Set<number>();
    const f1 = readPad(pad([PAD.A, PAD.X], [0.9, 0, 0, 0]), null, 'play', blocked);
    expect(f1.move.x).toBeCloseTo(0.9);
    expect([...f1.hold]).toEqual(['interact']);
    expect(f1.taps).toEqual(['attack']);
    const f2 = readPad(pad([PAD.A, PAD.X]), pad([PAD.A, PAD.X]), 'play', blocked);
    expect([...f2.hold]).toEqual(['interact']);
    expect(f2.taps).toEqual([]);
  });

  it('a button held through a mode change does nothing until it is released', () => {
    const blocked = new Set<number>([PAD.UP, PAD.A]);
    const f = readPad(pad([PAD.UP, PAD.A]), null, 'panel', blocked);
    expect(f.menuKeys).toEqual([]);
    expect(f.select).toBeNull();
    readPad(pad([]), pad([PAD.UP, PAD.A]), 'panel', blocked);
    expect(blocked.size).toBe(0);
    expect(readPad(pad([PAD.UP]), pad([]), 'panel', blocked).menuKeys).toEqual([{ code: 'ArrowUp' }]);
  });

  it('menus: stick drives the cursor, A selects, B backs out, bumpers switch tabs', () => {
    const blocked = new Set<number>();
    const f = readPad(pad([PAD.A, PAD.B, PAD.RB], [0, 0, 0.1, -0.8]), null, 'screen', blocked);
    expect(f.cursor.y).toBeCloseTo(-0.8);
    expect(f.select).toBe('press');
    expect(f.menuKeys).toEqual([{ code: 'Escape' }, { code: 'Tab' }]);
    expect(readPad(pad([]), pad([PAD.A]), 'screen', blocked).select).toBe('release');
    expect(readPad(pad([], [0.2, 0.1, 0, 0]), null, 'screen', blocked).cursor).toEqual({ x: 0, y: 0 });
  });

  it('analog triggers count from half-way; junk axes read as centred', () => {
    const s = snapshotOf({ buttons: [{ pressed: false, value: 0.7 }, { pressed: false, value: 0.2 }], axes: [Number.NaN, 0.5] });
    expect(s.buttons).toEqual([true, false]);
    expect(s.axes).toEqual([0, 0.5]);
  });
});

describe('virtual keys', () => {
  const codes = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' };
  it('8-way stick: straight, diagonal and dead zone', () => {
    setMoveKeys(codes, 1, 0, 0.3);
    expect(['KeyD', 'KeyW', 'KeyS', 'KeyA'].map(isHeld)).toEqual([true, false, false, false]);
    setMoveKeys(codes, -0.7, -0.7, 0.3);
    expect(['KeyA', 'KeyW', 'KeyD', 'KeyS'].map(isHeld)).toEqual([true, true, false, false]);
    setMoveKeys(codes, 0, 0.95, 0.3);
    expect(['KeyS', 'KeyA', 'KeyW'].map(isHeld)).toEqual([true, false, false]);
    setMoveKeys(codes, 0.1, 0.1, 0.3);
    expect(['KeyW', 'KeyA', 'KeyS', 'KeyD'].some(isHeld)).toBe(false);
    releaseAllKeys();
  });

  it('legacy key codes for the keys Phaser listens to', () => {
    expect(keyCodeOf('KeyE')).toBe(69);
    expect(keyCodeOf('Digit7')).toBe(55);
    expect(keyCodeOf('Space')).toBe(32);
    expect(keyCodeOf('Escape')).toBe(27);
    expect(keyCodeOf('ArrowDown')).toBe(40);
  });

  it('touch setting: Auto by default, junk falls back', () => {
    expect(parseSettings(null).touchControls).toBe('auto');
    expect(parseSettings(JSON.stringify({ touchControls: 'on' })).touchControls).toBe('on');
    expect(parseSettings(JSON.stringify({ touchControls: 'sideways' })).touchControls).toBe('auto');
  });
});
