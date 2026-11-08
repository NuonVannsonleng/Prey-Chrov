import { describe, expect, it } from 'vitest';
import { SAVE_KEY, SAVE_VERSION, describeSaveStatus, inspectSave, type KeyValueStorage } from '../systems/Save';

const store = (value: string | null): KeyValueStorage => ({
  getItem: (k) => (k === SAVE_KEY ? value : null),
});

describe('inspectSave', () => {
  it('reports none for an empty slot', () => {
    expect(inspectSave(store(null)).kind).toBe('none');
    expect(inspectSave(store('')).kind).toBe('none');
  });

  it('reports unavailable without storage or when storage throws', () => {
    expect(inspectSave(null).kind).toBe('unavailable');
    const throwing: KeyValueStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(inspectSave(throwing).kind).toBe('unavailable');
  });

  it.each([
    ['{not json', 'corrupt'],
    ['null', 'corrupt'],
    ['[]', 'corrupt'],
    ['42', 'corrupt'],
    ['{}', 'corrupt'],
    ['{"version":"1","savedAt":1}', 'corrupt'],
    ['{"version":1}', 'corrupt'],
    ['{"version":1,"savedAt":"yesterday"}', 'corrupt'],
    [`{"version":${SAVE_VERSION + 1},"savedAt":1}`, 'newer'],
    [`{"version":${SAVE_VERSION},"savedAt":1700000000000}`, 'valid'],
  ])('%s → %s', (raw, kind) => {
    expect(inspectSave(store(raw)).kind).toBe(kind);
  });

  it('always yields a player-facing description', () => {
    for (const raw of [null, '{bad', '{"version":99,"savedAt":1}']) {
      expect(describeSaveStatus(inspectSave(store(raw))).length).toBeGreaterThan(5);
    }
  });
});
