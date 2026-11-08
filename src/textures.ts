/** Central catalog of generated texture keys, frame names and sizes (Phaser-free so logic/tests can import it). */

/** Every generated texture key lives here so real art can replace them later. */
export const TEX = {
  tiles: 'tex-tiles',
  player: 'tex-player',
  trunk: 'tex-trunk',
  canopy: 'tex-canopy',
  rock: 'tex-rock',
  fern: 'tex-fern',
  vignette: 'tex-vignette',
  menuBg: 'tex-menu-bg',
  glow: 'tex-glow',
} as const;

/** Tile indices inside TEX.tiles (used directly as tilemap data). */
export const TILE = {
  grassA: 0,
  grassB: 1,
  grassFlowers: 2,
  moss: 3,
  path: 4,
  pathEdge: 5,
  leafLitter: 6,
} as const;
export const TILE_COUNT = 7;

export const PLAYER_DIRS = ['down', 'up', 'side'] as const;
export type PlayerDir = (typeof PLAYER_DIRS)[number];
export const PLAYER_POSES = ['idle', 'breathe', 'stepA', 'stepB'] as const;
export type PlayerPose = (typeof PLAYER_POSES)[number];
export const PLAYER_FRAME = 32;

export const TRUNK_VARIANTS = 3;
export const CANOPY_VARIANTS = 3;
export const ROCK_VARIANTS = 3;
export const FERN_VARIANTS = 3;
export const CANOPY_SIZE = { w: 112, h: 100 } as const;
export const TRUNK_SIZE = { w: 28, h: 46 } as const;
export const ROCK_SIZE = { w: 32, h: 26 } as const;
export const FERN_SIZE = { w: 26, h: 20 } as const;

export function playerFrameName(dir: PlayerDir, pose: PlayerPose): string {
  return `${dir}-${pose}`;
}

