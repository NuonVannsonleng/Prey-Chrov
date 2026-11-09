import Phaser from 'phaser';
import { CHUNKS, CHUNK_TILES, DEPTH, TILE_SIZE } from '../config';
import type { GameData } from '../data/schema';
import { ResourceNode } from '../entities/ResourceNode';
import { SCENERY_FOOTPRINT } from '../art/world';
import type { SavedNode } from '../systems/Save';
import { SHALLOW_TILES, TEX, TILE, WATER_TILES, type ScenerySprite } from '../textures';
import type { Canopy, PropLayer } from './PropLayer';
import { SOLID_SCENERY, chunkKey, chunkOf, type WorldGen } from './WorldGen';

const MAX_STATES = 3000;

/** Persistent per-node state kept while its chunk is unloaded (compact diff). */
interface NodeState {
  hp: number;
  depleted: boolean;
  respawnAt: number;
  harvests: number;
}

export interface ShrineInstance {
  key: string;
  x: number;
  y: number;
  image: Phaser.GameObjects.Image;
}

const SHRINE_FOOTPRINT = { w: 20, h: 10 };

interface LoadedChunk {
  key: string;
  cx: number;
  cy: number;
  tilemap: Phaser.Tilemaps.Tilemap;
  layer: Phaser.Tilemaps.TilemapLayer;
  collider: Phaser.Physics.Arcade.Collider;
  animated: Phaser.Tilemaps.Tile[];
  images: Phaser.GameObjects.GameObject[];
  zones: Phaser.GameObjects.Zone[];
  canopies: Canopy[];
  nodes: ResourceNode[];
  shrines: ShrineInstance[];
}

/**
 * Streams the seeded world around the player in CHUNK_TILES² chunks. Loading builds a
 * tilemap layer (with one player collider), scenery and resource nodes; unloading destroys
 * all of it and keeps only node diffs. The player's own chunk is built immediately, the
 * rest at most CHUNKS.buildsPerFrame per frame.
 */
export class ChunkManager {
  /** Live list of loaded resource nodes (shared with Gathering and Interaction). */
  readonly nodes: ResourceNode[] = [];
  /** Live list of loaded Neak Ta shrines (shared with Interaction and Encounters). */
  readonly shrines: ShrineInstance[] = [];
  private readonly loaded = new Map<string, LoadedChunk>();
  private readonly states = new Map<string, NodeState>();
  private readonly pending: Array<[number, number]> = [];
  private lastCx = Number.NaN;
  private lastCy = Number.NaN;
  onLoad: ((cx: number, cy: number) => void) | null = null;
  onUnload: ((cx: number, cy: number) => void) | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly gen: WorldGen,
    private readonly props: PropLayer,
    private readonly data: GameData,
    private readonly player: Phaser.GameObjects.GameObject,
  ) {}

  get loadedCount(): number {
    return this.loaded.size;
  }

  isLoaded(cx: number, cy: number): boolean {
    return this.loaded.has(chunkKey(cx, cy));
  }

  /** Tile index at a world position (live tile when loaded, else from the generator). */
  tileAtWorld(wx: number, wy: number): number {
    const tx = Math.floor(wx / TILE_SIZE);
    const ty = Math.floor(wy / TILE_SIZE);
    const c = this.loaded.get(chunkKey(chunkOf(tx), chunkOf(ty)));
    const t = c?.layer.getTileAt(tx - c.cx * CHUNK_TILES, ty - c.cy * CHUNK_TILES);
    if (t) return t.index === TILE.waterB ? TILE.waterA : t.index === TILE.shallowsB ? TILE.shallowsA : t.index;
    return this.gen.tileAt(tx, ty);
  }

  isDeepWater(wx: number, wy: number): boolean {
    return WATER_TILES.includes(this.tileAtWorld(wx, wy));
  }

  isShallow(wx: number, wy: number): boolean {
    return SHALLOW_TILES.includes(this.tileAtWorld(wx, wy));
  }

  /** Keeps the area around (px, py) loaded; call every frame. */
  update(px: number, py: number, now: number): void {
    const cx = chunkOf(Math.floor(px / TILE_SIZE));
    const cy = chunkOf(Math.floor(py / TILE_SIZE));
    if (cx !== this.lastCx || cy !== this.lastCy) {
      this.lastCx = cx;
      this.lastCy = cy;
      this.queueAround(cx, cy, now);
      this.unloadFar(cx, cy);
    }
    for (let i = 0; i < CHUNKS.buildsPerFrame && this.pending.length; i++) {
      const next = this.pending.shift();
      if (next && !this.isLoaded(next[0], next[1])) this.load(next[0], next[1], now);
    }
  }

  /** Loads everything within the load radius right now (scene start, after teleports/loads). */
  loadAllAround(px: number, py: number, now: number): void {
    const cx = chunkOf(Math.floor(px / TILE_SIZE));
    const cy = chunkOf(Math.floor(py / TILE_SIZE));
    this.lastCx = cx;
    this.lastCy = cy;
    this.unloadFar(cx, cy);
    const r = CHUNKS.loadRadius;
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (!this.isLoaded(x, y)) this.load(x, y, now);
    this.pending.length = 0;
  }

  private queueAround(cx: number, cy: number, now: number): void {
    if (!this.isLoaded(cx, cy)) this.load(cx, cy, now);
    this.pending.length = 0;
    const r = CHUNKS.loadRadius;
    const list: Array<[number, number]> = [];
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (!this.isLoaded(x, y)) list.push([x, y]);
    list.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));
    this.pending.push(...list);
  }

  private unloadFar(cx: number, cy: number): void {
    for (const c of [...this.loaded.values()]) {
      if (Math.max(Math.abs(c.cx - cx), Math.abs(c.cy - cy)) > CHUNKS.unloadRadius) this.unload(c);
    }
  }

  private load(cx: number, cy: number, now: number): void {
    const key = chunkKey(cx, cy);
    const data = this.gen.generateChunk(cx, cy);
    const tilemap = this.scene.make.tilemap({ data: data.tiles, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const tileset = tilemap.addTilesetImage('ground', TEX.tiles, TILE_SIZE, TILE_SIZE, 0, 0);
    const layer = tileset ? tilemap.createLayer(0, tileset, cx * CHUNK_TILES * TILE_SIZE, cy * CHUNK_TILES * TILE_SIZE) : null;
    if (!layer) throw new Error(`Chunk ${key} failed to build`);
    layer.setDepth(DEPTH.ground);
    layer.setCollision([TILE.waterA, TILE.waterB]);
    const collider = this.scene.physics.add.collider(this.player, layer);
    const animated = layer.filterTiles((t: Phaser.Tilemaps.Tile) => t.index === TILE.waterA || t.index === TILE.shallowsA);

    const chunk: LoadedChunk = { key, cx, cy, tilemap, layer, collider, animated, images: [], zones: [], canopies: [], nodes: [], shrines: [] };
    for (const p of data.props) {
      if (p.kind === 'resource') {
        const def = this.data.resources.get(p.id);
        if (!def) continue;
        const node = new ResourceNode(this.scene, this.props, p, def);
        const st = this.states.get(p.key);
        if (st) {
          node.harvestCount = st.harvests;
          if (st.depleted && now < st.respawnAt) node.forceDepleted(st.respawnAt);
          else if (!st.depleted) node.hp = Math.max(1, Math.min(def.hp, st.hp));
        }
        chunk.nodes.push(node);
        this.nodes.push(node);
      } else if (p.kind === 'shrine') {
        const image = this.scene.add.image(p.x, p.y, TEX.shrine, 0).setOrigin(0.5, 1).setDepth(p.y);
        chunk.images.push(image);
        chunk.zones.push(this.props.addSolid(p.x, p.y, SHRINE_FOOTPRINT));
        const shrine = { key: p.key, x: p.x, y: p.y, image };
        chunk.shrines.push(shrine);
        this.shrines.push(shrine);
      } else {
        this.addScenery(chunk, p.id as ScenerySprite, p.x, p.y, p.variant, p.canopyVariant);
      }
    }
    this.loaded.set(key, chunk);
    this.onLoad?.(cx, cy);
  }

  private addScenery(chunk: LoadedChunk, id: ScenerySprite, x: number, y: number, variant: number, canopyVariant: number): void {
    const flip = variant % 2 === 1;
    const img = this.scene.add.image(x, y, TEX.scenery, id).setOrigin(0.5, 1).setDepth(y).setFlipX(flip && !id.startsWith('ruin'));
    chunk.images.push(img);
    if (SOLID_SCENERY.has(id)) {
      const fp = SCENERY_FOOTPRINT[id];
      if (fp) chunk.zones.push(this.props.addSolid(x, y, fp));
    }
    if (id === 'big_tree') chunk.canopies.push(this.props.addCanopy(x, y, canopyVariant % 3, 1.35, 72));
  }

  private unload(c: LoadedChunk): void {
    for (const n of c.nodes) {
      const fresh = !n.depleted && n.hp >= n.def.hp && n.harvestCount === 0;
      if (fresh) this.states.delete(n.prop.key);
      else this.states.set(n.prop.key, { hp: n.hp, depleted: n.depleted, respawnAt: n.respawnAt, harvests: n.harvestCount });
      this.capStates();
      n.destroy();
      const i = this.nodes.indexOf(n);
      if (i >= 0) this.nodes.splice(i, 1);
    }
    for (const s of c.shrines) {
      const i = this.shrines.indexOf(s);
      if (i >= 0) this.shrines.splice(i, 1);
    }
    for (const img of c.images) img.destroy();
    for (const z of c.zones) this.props.removeSolid(z);
    for (const cp of c.canopies) this.props.removeCanopy(cp);
    c.collider.destroy();
    c.tilemap.destroy();
    this.loaded.delete(c.key);
    this.onUnload?.(c.cx, c.cy);
  }

  /**
   * Keeps saves bounded on very long games: beyond MAX_STATES, the oldest entries for nodes that
   * have fully regrown are dropped (only their loot-seed history is lost; never a depleted state).
   */
  private capStates(): void {
    if (this.states.size <= MAX_STATES) return;
    for (const [key, s] of this.states) {
      if (this.states.size <= MAX_STATES) break;
      if (!s.depleted) this.states.delete(key);
    }
  }

  /** Two-frame water/shallows animation for loaded chunks (index swap keeps collision flags). */
  animateWater(): void {
    for (const c of this.loaded.values()) {
      for (const t of c.animated) {
        if (t.index === TILE.waterA) t.index = TILE.waterB;
        else if (t.index === TILE.waterB) t.index = TILE.waterA;
        else if (t.index === TILE.shallowsA) t.index = TILE.shallowsB;
        else if (t.index === TILE.shallowsB) t.index = TILE.shallowsA;
      }
    }
  }

  /** All non-fresh node states (loaded and unloaded) for saving. respawnInMs is relative to `now`. */
  serializeNodes(now: number): SavedNode[] {
    const out = new Map<string, SavedNode>();
    for (const [key, s] of this.states) {
      out.set(key, { key, hp: s.hp, depleted: s.depleted, respawnInMs: s.depleted ? Math.max(0, s.respawnAt - now) : 0, harvests: s.harvests });
    }
    for (const n of this.nodes) {
      const key = n.prop.key;
      if (!n.depleted && n.hp >= n.def.hp && n.harvestCount === 0) {
        out.delete(key);
        continue;
      }
      out.set(key, {
        key,
        hp: n.hp,
        depleted: n.depleted,
        respawnInMs: n.depleted ? Math.max(0, n.respawnAt - now) : 0,
        harvests: n.harvestCount,
      });
    }
    return [...out.values()];
  }

  /** Seeds node diffs from a save (call before chunks load). */
  restoreNodes(saved: readonly SavedNode[], now: number): void {
    this.states.clear();
    for (const s of saved) {
      this.states.set(s.key, { hp: s.hp, depleted: s.depleted, respawnAt: now + s.respawnInMs, harvests: s.harvests });
    }
  }

  /**
   * Drops all references without touching game objects. Use on scene shutdown, where Phaser
   * has already destroyed the display list and physics world.
   */
  forget(): void {
    this.loaded.clear();
    this.nodes.length = 0;
    this.shrines.length = 0;
    this.pending.length = 0;
  }

  get stateCount(): number {
    return this.states.size;
  }
}
