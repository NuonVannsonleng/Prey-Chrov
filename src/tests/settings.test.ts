import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from '../systems/Settings';

describe('parseSettings', () => {
  it('falls back to defaults for missing or corrupt data', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('[1,2]')).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps volumes and keeps valid fields', () => {
    const s = parseSettings(JSON.stringify({ masterVolume: 3, sfxVolume: -1, ambienceVolume: 0.25, reducedFlash: true, showHints: 'yes' }));
    expect(s.masterVolume).toBe(1);
    expect(s.sfxVolume).toBe(0);
    expect(s.ambienceVolume).toBe(0.25);
    expect(s.reducedFlash).toBe(true);
    expect(s.showHints).toBe(DEFAULT_SETTINGS.showHints);
  });
});
