import Phaser from 'phaser';
import { BUILD, CHUNK_TILES, STATION_REACH, TILE_SIZE, ySort } from '../config';
import type { Station, StructureDef } from '../data/schema';
import { TEX } from '../textures';
import type { PropLayer } from '../world/PropLayer';
import { chunkOf } from '../world/WorldGen';
import type { SavedStructure } from './Save';

/** A placed structure. Visual fields are null while its chunk is unloaded. */
export interface Structure {
  def: StructureDef;
  x: number;
  y: number;
  image: Phaser.GameObjects.Image | null;
  flame: Phaser.GameObjects.Sprite | null;
  zone: Phaser.GameObjects.Zone | null;
}

const FLAME_ANIM = 'campfire-flame';

export interface PlacementWorld {
  isDeepWater(wx: number, wy: number): boolean;
  isLoaded(cx: number, cy: number): boolean;
}

/**
 * Placed campfires and shelters. Records persist for the whole session (and saves);
 * visuals/colliders exist only while their chunk is loaded (`list` = materialized ones).
 */
export class Structures {
  readonly records: Structure[] = [];
  /** Materialized structures (in loaded chunks). Shared with Interaction. */
  readonly list: Structure[] = [];
  private readonly rect = new Phaser.Geom.Rectangle();
  /** World point that must stay free of buildings (the fallback player spawn). */
  keepClear: { x: number; y: number } | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly props: PropLayer,
    private readonly world: PlacementWorld,
    private readonly defs: ReadonlyMap<string, StructureDef>,
  ) {
    if (!scene.anims.exists(FLAME_ANIM)) {
      scene.anims.create({
        key: FLAME_ANIM,
        frames: [0, 1, 2, 1].map((f) => ({ key: TEX.flame, frame: f })),
        frameRate: 9,
        repeat: -1,
      });
    }
  }

  def(type: string): StructureDef | undefined {
    return this.defs.get(type);
  }

  /** Adds a structure record (no validation) and materializes it if its chunk is loaded. */
  place(type: string, x: number, y: number): Structure | null {
    const def = this.defs.get(type);
    if (!def) return null;
    const s: Structure = { def, x: Math.round(x), y: Math.round(y), image: null, flame: null, zone: null };
    this.records.push(s);
    if (this.world.isLoaded(chunkOf(Math.floor(s.x / TILE_SIZE)), chunkOf(Math.floor(s.y / TILE_SIZE)))) this.materialize(s);
    return s;
  }

  hasAt(x: number, y: number): boolean {
    return this.records.some((s) => s.x === Math.round(x) && s.y === Math.round(y));
  }

  /** Chunk loaded: create visuals for its structures. */
  loadChunk(cx: number, cy: number): void {
    for (const s of this.records) if (!s.image && this.inChunk(s, cx, cy)) this.materialize(s);
  }

  /** Chunk unloaded: release visuals and colliders, keep the record. */
  unloadChunk(cx: number, cy: number): void {
    for (const s of this.records) if (s.image && this.inChunk(s, cx, cy)) this.dematerialize(s);
  }

  private inChunk(s: Structure, cx: number, cy: number): boolean {
    const span = CHUNK_TILES * TILE_SIZE;
    return Math.floor(s.x / span) === cx && Math.floor(s.y / span) === cy;
  }

  private materialize(s: Structure): void {
    const { def, x, y } = s;
    s.image = this.scene.add.image(x, y, TEX.structures, def.sprite).setOrigin(0.5, 1).setDepth(ySort(y));
    if (def.solid) s.zone = this.props.addSolid(x, y, def.footprint);
    if (def.interaction === 'cook' && def.lightRadius > 0) {
      s.flame = this.scene.add.sprite(x, y - 7, TEX.flame, 0).setOrigin(0.5, 1).setDepth(ySort(y + 0.5));
      s.flame.play(FLAME_ANIM);
    }
    this.list.push(s);
  }

  private dematerialize(s: Structure): void {
    s.image?.destroy();
    s.flame?.destroy();
    if (s.zone) this.props.removeSolid(s.zone);
    s.image = null;
    s.flame = null;
    s.zone = null;
    const i = this.list.indexOf(s);
    if (i >= 0) this.list.splice(i, 1);
  }

  /**
   * Whether a structure fits at (x, y): within reach, not on deep water, not overlapping any
   * solid (trees, rocks, structures), the player, or the spawn point; padded so a structure
   * can never leave a gap narrower than the player.
   */
  canPlace(type: string, x: number, y: number, playerX: number, playerY: number, playerBody: Phaser.Geom.Rectangle): boolean {
    const def = this.defs.get(type);
    if (!def) return false;
    if (Math.hypot(x - playerX, y - playerY) > BUILD.reach) return false;
    const { w, h } = def.footprint;
    const left = x - w / 2;
    const top = y - h;
    for (const [cx, cy] of [
      [left, top],
      [left + w, top],
      [left, y],
      [left + w, y],
      [x, y - h / 2],
    ] as const) {
      if (this.world.isDeepWater(cx, cy)) return false;
    }
    const pad = 8;
    if (this.scene.physics.overlapRect(left - pad, top - pad, w + pad * 2, h + pad * 2, false, true).length > 0) return false;
    this.rect.setTo(left - pad, top - pad, w + pad * 2, h + pad * 2);
    if (Phaser.Geom.Intersects.RectangleToRectangle(this.rect, playerBody)) return false;
    if (this.keepClear && Math.abs(this.keepClear.x - x) < w / 2 + 16 && Math.abs(this.keepClear.y - (y - h / 2)) < h / 2 + 16) return false;
    for (const s of this.records) if (Math.abs(s.x - x) < (w + s.def.footprint.w) / 2 && Math.abs(s.y - y) < TILE_SIZE) return false;
    return true;
  }

  /** Stations within reach of the player (e.g. a campfire for cooking recipes). */
  stationsNear(px: number, py: number, out: Set<Station>): Set<Station> {
    out.clear();
    for (const s of this.list) {
      if (s.def.station && Math.hypot(s.x - px, s.y - py) <= STATION_REACH) out.add(s.def.station);
    }
    return out;
  }

  serialize(): SavedStructure[] {
    return this.records.map((s) => ({ type: s.def.id, x: s.x, y: s.y }));
  }
}
