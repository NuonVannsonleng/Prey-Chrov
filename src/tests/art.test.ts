import { describe, expect, it } from 'vitest';
import { parseArtManifest } from '../art/manifest';
import { TEX } from '../textures';

describe('hand-drawn art manifest (M22)', () => {
  it('accepts known textures with relative PNG paths', () => {
    const r = parseArtManifest({ textures: { [TEX.player]: 'player.png', [TEX.tiles]: 'world/tiles_v2.png' } });
    expect(r.problems).toEqual([]);
    expect(r.overrides).toEqual([
      { key: TEX.player, file: 'player.png' },
      { key: TEX.tiles, file: 'world/tiles_v2.png' },
    ]);
  });

  it('an empty manifest (the shipped default) changes nothing', () => {
    expect(parseArtManifest({ textures: {} })).toEqual({ overrides: [], problems: [] });
    expect(parseArtManifest({})).toEqual({ overrides: [], problems: [] });
  });

  it('refuses unknown textures, unsafe or remote paths and junk — without throwing', () => {
    const r = parseArtManifest({
      textures: {
        'tex-dragon': 'dragon.png',
        [TEX.player]: '../secrets.png',
        [TEX.rock]: 'https://example.com/rock.png',
        [TEX.fern]: '/abs/fern.png',
        [TEX.bush]: 'bush.jpg',
        [TEX.icons]: 7,
      },
    });
    expect(r.overrides).toEqual([]);
    expect(r.problems).toHaveLength(6);
    for (const junk of [null, 3, 'x', [], { textures: [] }]) expect(() => parseArtManifest(junk)).not.toThrow();
  });
});
