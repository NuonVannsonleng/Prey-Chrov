export const SAVE_KEY = 'preychrov.save';
export const SAVE_VERSION = 1;
/** Loading game state is not implemented yet (sleep-save in M3, full persistence in M7). */
export const CAN_LOAD_SAVES = false;

export type SaveStatus =
  | { kind: 'none' }
  | { kind: 'valid'; version: number; savedAt: number }
  | { kind: 'corrupt'; reason: string }
  | { kind: 'newer'; version: number }
  | { kind: 'unavailable' };

/** Minimal storage surface so tests can inject a fake. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
}

function defaultStorage(): KeyValueStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Inspects the save slot without trusting its contents. Never throws.
 * A save is only "valid" if it has a known version and the required header fields.
 */
export function inspectSave(storage: KeyValueStorage | null = defaultStorage()): SaveStatus {
  if (!storage) return { kind: 'unavailable' };
  let raw: string | null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return { kind: 'unavailable' };
  }
  if (raw === null || raw === '') return { kind: 'none' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: 'corrupt', reason: 'not valid JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { kind: 'corrupt', reason: 'not an object' };
  }
  const record = parsed as Record<string, unknown>;
  const version = record['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { kind: 'corrupt', reason: 'missing version' };
  }
  if (version > SAVE_VERSION) return { kind: 'newer', version };
  const savedAt = record['savedAt'];
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) {
    return { kind: 'corrupt', reason: 'missing timestamp' };
  }
  return { kind: 'valid', version, savedAt };
}

/** Player-facing explanation for why Continue is unavailable. */
export function describeSaveStatus(status: SaveStatus): string {
  switch (status.kind) {
    case 'none':
      return 'No saved journey yet.';
    case 'corrupt':
      return 'The saved journey is damaged and cannot be loaded.';
    case 'newer':
      return 'This save was made by a newer version of the game.';
    case 'unavailable':
      return 'Browser storage is unavailable, so saves cannot be read.';
    case 'valid':
      return `Saved ${new Date(status.savedAt).toLocaleString()}`;
  }
}
