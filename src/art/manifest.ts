import { TEX } from '../textures';

/** M22: the art manifest (Phaser-free so it is unit-tested). See docs/ART_PIPELINE.md. */
export interface ArtOverride {
  key: string;
  file: string;
}

const KNOWN_KEYS = new Set<string>(Object.values(TEX));
/** Plain relative file names only: no "..", no absolute or remote URLs. */
const SAFE_FILE = /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.png$/;

/** Validates a manifest. Unknown texture keys and unsafe paths are reported, never fatal. */
export function parseArtManifest(raw: unknown): { overrides: ArtOverride[]; problems: string[] } {
  const problems: string[] = [];
  const overrides: ArtOverride[] = [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { overrides, problems: ['manifest must be an object'] };
  const textures = (raw as Record<string, unknown>)['textures'];
  if (textures === undefined) return { overrides, problems };
  if (typeof textures !== 'object' || textures === null || Array.isArray(textures)) return { overrides, problems: ['"textures" must map texture keys to PNG files'] };
  for (const [key, file] of Object.entries(textures as Record<string, unknown>)) {
    if (!KNOWN_KEYS.has(key)) problems.push(`unknown texture "${key}"`);
    else if (typeof file !== 'string' || !SAFE_FILE.test(file) || file.split('/').includes('..')) problems.push(`"${key}": file must be a relative .png path`);
    else overrides.push({ key, file });
  }
  return { overrides, problems };
}
