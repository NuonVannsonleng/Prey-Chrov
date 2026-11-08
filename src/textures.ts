/** Central catalog of generated texture keys, frame names and sizes (Phaser-free so logic/tests can import it). */

/** Every generated texture key lives here so real art can replace them later. */
export const TEX = {
  tiles: 'tex-tiles',
  player: 'tex-player',
  trunk: 'tex-trunk',
  canopy: 'tex-canopy',
  rock: 'tex-rock',
  fern: 'tex-fern',
  bamboo: 'tex-bamboo',
  bush: 'tex-bush',
  depleted: 'tex-depleted',
  icons: 'tex-icons',
  chip: 'tex-chip',
  targetRing: 'tex-target-ring',
  structures: 'tex-structures',
  light: 'tex-light',
  flame: 'tex-flame',
  scenery: 'tex-scenery',
  minimap: 'tex-minimap',
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
  shore: 7,
  waterA: 8,
  waterB: 9,
  mud: 10,
  stoneFloor: 11,
  shallowsA: 12,
  shallowsB: 13,
  jungleFloor: 14,
} as const;
export const TILE_COUNT = 15;
/** Solid (deep) water. */
export const WATER_TILES: readonly number[] = [TILE.waterA, TILE.waterB];
/** Walkable shallow water (slows the player; drinkable). */
export const SHALLOW_TILES: readonly number[] = [TILE.shallowsA, TILE.shallowsB];

/** Ground tile keys biomes.json may use, mapped to tile indices. */
export const GROUND_TILE = {
  grass: TILE.grassA,
  grass_alt: TILE.grassB,
  grass_flowers: TILE.grassFlowers,
  moss: TILE.moss,
  leaf_litter: TILE.leafLitter,
  mud: TILE.mud,
  stone_floor: TILE.stoneFloor,
  jungle_floor: TILE.jungleFloor,
  path: TILE.path,
} as const;
export type GroundTileKey = keyof typeof GROUND_TILE;
export const GROUND_TILE_KEYS = Object.keys(GROUND_TILE) as GroundTileKey[];

/** Non-gatherable scenery sprites biomes.json may scatter (frames inside TEX.scenery). */
export const SCENERY_SPRITES = ['fern', 'big_tree', 'reeds', 'ruin_wall', 'ruin_pillar', 'ruin_rubble', 'ruin_altar'] as const;
export type ScenerySprite = (typeof SCENERY_SPRITES)[number];

export const PLAYER_DIRS = ['down', 'up', 'side'] as const;
export type PlayerDir = (typeof PLAYER_DIRS)[number];
export const PLAYER_POSES = ['idle', 'breathe', 'stepA', 'stepB', 'act'] as const;
export type PlayerPose = (typeof PLAYER_POSES)[number];
export const PLAYER_FRAME = 32;

export const TRUNK_VARIANTS = 3;
export const CANOPY_VARIANTS = 3;
export const ROCK_VARIANTS = 3;
export const FERN_VARIANTS = 3;
export const BAMBOO_VARIANTS = 2;
export const CANOPY_SIZE = { w: 112, h: 100 } as const;
export const TRUNK_SIZE = { w: 28, h: 46 } as const;
export const ROCK_SIZE = { w: 32, h: 26 } as const;
export const FERN_SIZE = { w: 26, h: 20 } as const;
export const BAMBOO_SIZE = { w: 36, h: 64 } as const;
export const BUSH_SIZE = { w: 30, h: 24 } as const;
export const DEPLETED_SIZE = { w: 32, h: 20 } as const;
export const ICON_SIZE = 16;

/** Bush frames: full of berries vs. picked. */
export const BUSH_FRAME = { full: 0, picked: 1 } as const;

/** Visual kinds a resource node can use (resources.json `sprite`). */
export const RESOURCE_SPRITES = ['tree', 'bamboo', 'rock', 'bush'] as const;
export type ResourceSprite = (typeof RESOURCE_SPRITES)[number];

/** Depleted-state frames inside TEX.depleted, one per resource sprite. */
export const DEPLETED_FRAME: Record<ResourceSprite, number> = { tree: 0, bamboo: 1, rock: 2, bush: 3 };

/** Item icon frames inside TEX.icons (items.json `icon`). */
export const ICON_KEYS = [
  'wood',
  'stick',
  'bamboo',
  'stone',
  'flint',
  'berries',
  'fiber',
  'leaf',
  'stone_axe',
  'stone_pickaxe',
  'spear',
  'torch',
  'campfire',
  'shelter',
  'bamboo_shoot',
  'roasted_shoot',
] as const;
export type IconKey = (typeof ICON_KEYS)[number];

/** Placeable structure visuals (structures.json `sprite`), frames inside TEX.structures. */
export const STRUCTURE_SPRITES = ['campfire', 'shelter'] as const;
export type StructureSprite = (typeof STRUCTURE_SPRITES)[number];
export const STRUCTURE_FRAME: Record<StructureSprite, { x: number; w: number; h: number }> = {
  campfire: { x: 0, w: 32, h: 28 },
  shelter: { x: 32, w: 72, h: 60 },
};
export const LIGHT_TEXTURE_SIZE = 256;

export function playerFrameName(dir: PlayerDir, pose: PlayerPose): string {
  return `${dir}-${pose}`;
}
