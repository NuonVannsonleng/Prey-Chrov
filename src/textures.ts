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
  creatures: 'tex-creatures',
  shrine: 'tex-shrine',
  orb: 'tex-orb',
  status: 'tex-status',
  chest: 'tex-chest',
  tablet: 'tex-tablet',
  rain: 'tex-rain',
  arrow: 'tex-arrow',
  heartTree: 'tex-heart-tree',
  roots: 'tex-roots',
  herbs: 'tex-herbs',
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
export const RESOURCE_SPRITES = ['tree', 'bamboo', 'rock', 'bush', 'herb_leaf', 'herb_root'] as const;
export type ResourceSprite = (typeof RESOURCE_SPRITES)[number];

/** Depleted-state frames inside TEX.depleted, one per resource sprite. */
export const DEPLETED_FRAME: Record<ResourceSprite, number> = { tree: 0, bamboo: 1, rock: 2, bush: 3, herb_leaf: 3, herb_root: 3 };

/** Herb plants (M9): frames inside TEX.herbs. Herbs swap to a picked frame like bushes. */
export const HERB_SIZE = { w: 22, h: 18 } as const;
export const HERB_FRAME = { leafFull: 0, leafPicked: 1, rootFull: 2, rootPicked: 3 } as const;

/** Sprites that stay in place and swap to a picked frame instead of leaving a stump. */
export const SWAP_SPRITES: Partial<Record<ResourceSprite, { tex: string; full: number; picked: number }>> = {
  bush: { tex: TEX.bush, full: BUSH_FRAME.full, picked: BUSH_FRAME.picked },
  herb_leaf: { tex: TEX.herbs, full: HERB_FRAME.leafFull, picked: HERB_FRAME.leafPicked },
  herb_root: { tex: TEX.herbs, full: HERB_FRAME.rootFull, picked: HERB_FRAME.rootPicked },
};

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
  'meat_raw',
  'meat_cooked',
  'hide',
  'fang',
  'spirit_dust',
  'fish_raw',
  'fish_cooked',
  'fishing_rod',
  'tube_empty',
  'tube_water',
  'tube_boiled',
  'healing_leaf',
  'bitter_root',
  'bandage',
  'antidote',
  'stew',
  'pot',
  'wall',
  'roof',
  'chest',
  'collector',
  'workbench',
  'bed',
  'flag',
  'rain_water',
  'flint_axe',
  'flint_pickaxe',
  'fang_spear',
  'hide_vest',
  'leaf_cape',
  'bark_sandals',
] as const;
export type IconKey = (typeof ICON_KEYS)[number];

/** Placeable structure visuals (structures.json `sprite`), frames inside TEX.structures. */
export const STRUCTURE_SPRITES = ['campfire', 'shelter', 'pot', 'wall', 'roof', 'chest', 'collector', 'workbench', 'bed', 'flag'] as const;
export type StructureSprite = (typeof STRUCTURE_SPRITES)[number];
/** Frames inside TEX.structures; rotatable sprites add a '<sprite>_v' frame. */
export const STRUCTURE_FRAME: Record<StructureSprite | 'wall_v', { x: number; w: number; h: number }> = {
  campfire: { x: 0, w: 32, h: 28 },
  shelter: { x: 32, w: 72, h: 60 },
  pot: { x: 104, w: 28, h: 28 },
  wall: { x: 132, w: 34, h: 30 },
  wall_v: { x: 166, w: 12, h: 46 },
  roof: { x: 178, w: 76, h: 50 },
  chest: { x: 254, w: 26, h: 22 },
  collector: { x: 280, w: 26, h: 34 },
  workbench: { x: 306, w: 36, h: 26 },
  bed: { x: 342, w: 44, h: 24 },
  flag: { x: 386, w: 16, h: 38 },
};
export const LIGHT_TEXTURE_SIZE = 256;

/** Creature visuals (enemies.json `sprite`); frames "<sprite>-<0..4>" inside TEX.creatures. */
export const CREATURE_SPRITES = ['boar', 'snake', 'tiger', 'ap', 'arak'] as const;
export type CreatureSprite = (typeof CREATURE_SPRITES)[number];
/** 0 idle, 1 move A, 2 move B, 3 telegraph, 4 attack. */
export const CREATURE_FRAMES = 5;
export const CREATURE_POSE = { idle: 0, moveA: 1, moveB: 2, telegraph: 3, attack: 4 } as const;

export function playerFrameName(dir: PlayerDir, pose: PlayerPose): string {
  return `${dir}-${pose}`;
}
