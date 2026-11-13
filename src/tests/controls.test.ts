import { describe, expect, it } from 'vitest';
import { SAVE_KEY, SAVE_SLOTS, currentSlot, deleteSlot, readSave, setCurrentSlot, slotKey, type KeyValueStorage } from '../systems/Save';
import { ACTIONS, DEFAULT_KEYS, bindKey, fontPx, getSettings, isBindable, keyFor, keyLabel, parseSettings, updateSettings } from '../systems/Settings';
import { codeToKeyCode } from '../utils/keys';

describe('key bindings', () => {
  it('defaults are unique and bindable', () => {
    const codes = ACTIONS.map((a) => DEFAULT_KEYS[a]);
    expect(new Set(codes).size).toBe(ACTIONS.length);
    for (const c of codes) expect(isBindable(c)).toBe(true);
    expect(DEFAULT_KEYS.crouch).not.toMatch(/Control/);
  });

  it('reserves Escape, Tab, hotbar digits, F3 and modifiers', () => {
    for (const c of ['Escape', 'Tab', 'Digit1', 'Digit6', 'F3', 'ControlLeft', 'AltLeft', 'MetaLeft', 'Enter']) expect(isBindable(c)).toBe(false);
    for (const c of ['KeyG', 'Digit7', 'Digit0', 'Space', 'ArrowUp', 'Semicolon']) expect(isBindable(c)).toBe(true);
  });

  it('parses stored bindings, dropping invalid and clashing ones', () => {
    const s = parseSettings(JSON.stringify({ keys: { interact: 'KeyG', use: 'Escape', map: 'KeyN' } }));
    expect(s.keys.interact).toBe('KeyG');
    expect(s.keys.use).toBe(DEFAULT_KEYS.use);
    expect(s.keys.map).toBe('KeyN');
    const clash = parseSettings(JSON.stringify({ keys: { interact: 'KeyQ' } }));
    expect(new Set(Object.values(clash.keys)).size).toBe(ACTIONS.length);
    expect(clash.keys.interact).toBe(DEFAULT_KEYS.interact);
    expect(parseSettings(JSON.stringify({ keys: 'nope' })).keys).toEqual(DEFAULT_KEYS);
  });

  it('bindKey swaps on conflict and refuses reserved keys', () => {
    updateSettings({ keys: { ...DEFAULT_KEYS } });
    expect(bindKey('interact', 'KeyG')).toBe(true);
    expect(keyFor('interact')).toBe('KeyG');
    expect(bindKey('interact', 'KeyQ')).toBe(true);
    expect(keyFor('interact')).toBe('KeyQ');
    expect(keyFor('drop')).toBe('KeyG');
    expect(bindKey('drop', 'Escape')).toBe(false);
    expect(new Set(Object.values(getSettings().keys)).size).toBe(ACTIONS.length);
    updateSettings({ keys: { ...DEFAULT_KEYS } });
  });

  it('labels and keyCodes', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('ShiftLeft')).toBe('Shift');
    expect(codeToKeyCode('KeyA')).toBe(65);
    expect(codeToKeyCode('Digit7')).toBe(55);
    expect(codeToKeyCode('Space')).toBe(32);
    expect(codeToKeyCode('ArrowLeft')).toBe(37);
    for (const a of ACTIONS) expect(codeToKeyCode(DEFAULT_KEYS[a])).toBeGreaterThan(0);
  });

  it('large text scales fonts', () => {
    updateSettings({ largeText: false });
    expect(fontPx(15)).toBe('15px');
    updateSettings({ largeText: true });
    expect(fontPx(15)).toBe('18px');
    updateSettings({ largeText: false });
  });

  it('new settings fields fall back safely', () => {
    const s = parseSettings(JSON.stringify({ musicVolume: 9, highContrast: 'x', largeText: true }));
    expect(s.musicVolume).toBe(1);
    expect(s.highContrast).toBe(false);
    expect(s.largeText).toBe(true);
  });
});

describe('save slots', () => {
  const mem = (): KeyValueStorage & { m: Map<string, string> } => {
    const m = new Map<string, string>();
    return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
  };

  it('slot 1 keeps the original key; others are suffixed', () => {
    expect(slotKey(1)).toBe(SAVE_KEY);
    expect(slotKey(2)).toBe(`${SAVE_KEY}.2`);
    expect(SAVE_SLOTS).toBe(3);
  });

  it('remembers the current slot and rejects out-of-range values', () => {
    const s = mem();
    expect(currentSlot(s)).toBe(1);
    setCurrentSlot(3, s);
    expect(currentSlot(s)).toBe(3);
    s.m.set('preychrov.slot', '9');
    expect(currentSlot(s)).toBe(1);
    s.m.set('preychrov.slot', 'abc');
    expect(currentSlot(s)).toBe(1);
  });

  it('reads the chosen slot and deletes only that slot', () => {
    const s = mem();
    s.m.set(slotKey(2), '{"broken"');
    expect('error' in readSave(s, 2)).toBe(true);
    expect('error' in readSave(s, 1) && (readSave(s, 1) as { error: { kind: string } }).error.kind).toBe('none');
    s.m.set(slotKey(1), 'x');
    expect(deleteSlot(2, s)).toBe(true);
    expect(s.m.has(slotKey(2))).toBe(false);
    expect(s.m.has(slotKey(1))).toBe(true);
    expect(deleteSlot(1, { getItem: () => null })).toBe(false);
  });
});
