export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
export const TILE_SIZE = 32;

export const SCENES = {
  boot: 'Boot',
  preload: 'Preload',
  menu: 'Menu',
  world: 'World',
  ui: 'UI',
  pause: 'Pause',
} as const;

export const FONTS = {
  title: "'Moul', 'Khmer OS Muol Light', 'Khmer OS Muol', 'Khmer UI', 'Leelawadee UI', serif",
  ui: "'Kantumruy Pro', 'Khmer UI', 'Leelawadee UI', 'Segoe UI', system-ui, sans-serif",
} as const;

export const FONT_LOAD_TIMEOUT_MS = 2500;

export const PALETTE = {
  deepBlueGreen: 0x0d2a2c,
  forest: 0x1b3a24,
  forestDark: 0x10241a,
  charcoal: 0x14181a,
  mud: 0x5a4330,
  mist: 0xa9b5b0,
  fire: 0xe8893a,
  turquoise: 0x4fc2b4,
  gold: 0xe6b866,
  text: 0xe8e4d8,
  textDim: 0x8d978f,
} as const;

export const CSS = {
  text: '#e8e4d8',
  textDim: '#8d978f',
  gold: '#e6b866',
  fire: '#e8893a',
  turquoise: '#4fc2b4',
  danger: '#d9644a',
} as const;

export const PLAYER = {
  walkSpeed: 150,
  sprintMultiplier: 1.65,
  /** Exponential smoothing rate (1/s) toward target velocity; higher = snappier. */
  acceleration: 14,
  deceleration: 18,
  body: { width: 14, height: 10, offsetX: 9, offsetY: 21 },
  walkFrameRate: 8,
  sprintFrameRate: 13,
} as const;

export const CAMERA = {
  lerp: 0.12,
  zoom: 2,
} as const;

export const TEST_MAP = {
  widthTiles: 60,
  heightTiles: 40,
  seed: 20240611,
  spawnTileX: 30,
  spawnTileY: 20,
  spawnClearRadiusTiles: 5,
} as const;

export const CANOPY = {
  fadedAlpha: 0.32,
  fadeRatePerSecond: 6,
} as const;

/** Only enable test hooks (window.__preyChrov) during dev or with ?debug in the URL. */
export const DEBUG_HOOKS =
  import.meta.env.DEV ||
  (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug'));

export const GATHER = {
  /** Max distance (px) from the player's centre to a node's interaction point. */
  reach: 38,
  hitCooldownMs: 350,
  handDamage: 1,
  /** How long the act pose shows after a swing. */
  swingMs: 180,
  /** Retry delay if the player stands where a node wants to respawn. */
  respawnRetryMs: 2000,
} as const;

export const PICKUP = {
  poolSize: 250,
  magnetRadius: 44,
  collectRadius: 12,
  magnetSpeed: 220,
  /** Freshly dropped items can't be re-collected for this long. */
  dropDelayMs: 1400,
  fullWarnCooldownMs: 1600,
  scatter: 14,
} as const;

export const WATER = {
  frameMs: 700,
  drinkCooldownMs: 600,
} as const;

export const DEPTH = {
  ground: -1,
  targetRing: 0.5,
  canopy: 100000,
  floatingText: 150000,
  debug: 200000,
} as const;
