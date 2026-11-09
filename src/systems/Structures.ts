import Phaser from 'phaser';
import { BUILD, CHUNK_TILES, DEPTH, STATION_REACH, TILE_SIZE, ySort } from '../config';
import { itemStackSize } from '../data/gameData';
import { Inventory, type ItemStack } from './Inventory';
import type { Station, StructureDef } from '../data/schema';
import { TEX } from '../textures';
import type { PropLayer } from '../world/PropLayer';
import { chunkOf } from '../world/WorldGen';
import type { SavedStructure } from './Save';

/** A placed structure. Visual fields are null while its chunk is unloaded. */
export interface Structure {
  def: StructureDef;
  /** Stable id (saved): chests and outposts are addressed by it. */
  uid: number;
  x: number;
  y: number;
  /** 0 = as drawn, 1 = rotated a quarter turn (rotatable structures). */
  rot: 0 | 1;
  /** Remaining game hours of weathering (only for defs with durability). 0 = broken. */
  durability: number;
  /** Chest contents; kept while the chunk is unloaded and saved. */
  storage: Inventory | null;
  /** Rain collector: units of water held. */
  water: number;
  /** Outpost name. */
  name: string | null;
  image: Phaser.GameObjects.Image | null;
  flame: Phaser.GameObjects.Sprite | null;
  zone: Phaser.GameObjects.Zone | null;
}

const FLAME_ANIM = 'campfire-flame';

export interface PlaceOptions {
  rot?: 0 | 1;
  uid?: number;
  durability?: number;
  storage?: ReadonlyArray<Readonly<ItemStack> | null>;
  water?: number;
  name?: string | null;
}

export { footprintOf, frameOf } from './structureShape';
import { footprintOf, frameOf } from './structureShape';

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
  private nextUid = 1;
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
  place(type: string, x: number, y: number, opts: PlaceOptions = {}): Structure | null {
    const def = this.defs.get(type);
    if (!def) return null;
    const uid = opts.uid !== undefined && opts.uid > 0 && !this.records.some((r) => r.uid === opts.uid) ? opts.uid : this.nextUid;
    this.nextUid = Math.max(this.nextUid, uid + 1);
    let storage: Inventory | null = null;
    if (def.storageSlots) {
      storage = new Inventory(itemStackSize, def.storageSlots);
      if (opts.storage) storage.restore(opts.storage);
    }
    const max = def.durability ?? 0;
    const s: Structure = {
      def,
      uid,
      x: Math.round(x),
      y: Math.round(y),
      rot: def.rotatable && opts.rot === 1 ? 1 : 0,
      durability: max > 0 ? Math.max(0, Math.min(max, opts.durability ?? max)) : 0,
      storage,
      water: Math.max(0, Math.min(def.rainCapacity ?? 0, Math.floor(opts.water ?? 0))),
      name: def.outpost ? (opts.name ?? null) : null,
      image: null,
      flame: null,
      zone: null,
    };
    this.records.push(s);
    if (this.world.isLoaded(chunkOf(Math.floor(s.x / TILE_SIZE)), chunkOf(Math.floor(s.y / TILE_SIZE)))) this.materialize(s);
    return s;
  }

  /** Already restored? By uid when the save has one (a roof may share a chest's anchor), else by type + position. */
  hasSaved(type: string, x: number, y: number, uid?: number): boolean {
    if (uid !== undefined && uid > 0) return this.records.some((s) => s.uid === uid);
    return this.records.some((s) => s.def.id === type && s.x === Math.round(x) && s.y === Math.round(y));
  }

  /** Centre of a structure's footprint (roof protection is measured from here). */
  centerY(s: Structure): number {
    return s.y - footprintOf(s.def, s.rot).h / 2;
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

  /** Broken = weathered to nothing: not solid, not usable, drawn faded until repaired. */
  isBroken(s: Structure): boolean {
    return (s.def.durability ?? 0) > 0 && s.durability <= 0;
  }

  private materialize(s: Structure): void {
    const { def, x, y } = s;
    const depth = def.overhead ? DEPTH.canopy + ySort(y) - DEPTH.actors : ySort(y);
    s.image = this.scene.add.image(x, y, TEX.structures, frameOf(def, s.rot)).setOrigin(0.5, 1).setDepth(depth);
    if (def.solid && !this.isBroken(s)) s.zone = this.props.addSolid(x, y, footprintOf(def, s.rot));
    this.styleBroken(s);
    if (def.interaction === 'cook' && def.lightRadius > 0) {
      s.flame = this.scene.add.sprite(x, y - 7, TEX.flame, 0).setOrigin(0.5, 1).setDepth(ySort(y + 0.5));
      s.flame.play(FLAME_ANIM);
    }
    this.list.push(s);
  }

  /** Re-applies the broken look / collider after durability changes. */
  refresh(s: Structure): void {
    if (!s.image) return;
    const broken = this.isBroken(s);
    if (s.def.solid && broken && s.zone) {
      this.props.removeSolid(s.zone);
      s.zone = null;
    } else if (s.def.solid && !broken && !s.zone) s.zone = this.props.addSolid(s.x, s.y, footprintOf(s.def, s.rot));
    this.styleBroken(s);
  }

  private styleBroken(s: Structure): void {
    if (!s.image) return;
    if (this.isBroken(s)) s.image.setTint(0x8d978f).setAlpha(0.55);
    else s.image.clearTint().setAlpha(1);
  }

  /** Removes a structure entirely (dismantled). */
  remove(s: Structure): void {
    if (s.image) this.dematerialize(s);
    const i = this.records.indexOf(s);
    if (i >= 0) this.records.splice(i, 1);
  }

  byUid(uid: number): Structure | undefined {
    return this.records.find((r) => r.uid === uid);
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
  canPlace(type: string, x: number, y: number, playerX: number, playerY: number, playerBody: Phaser.Geom.Rectangle, rot: 0 | 1 = 0): boolean {
    const def = this.defs.get(type);
    if (!def) return false;
    if (Math.hypot(x - playerX, y - playerY) > BUILD.reach) return false;
    const { w, h } = footprintOf(def, rot);
    const left = x - w / 2;
    const top = y - h;
    // Overhead structures (roofs) stand over anything; they only must not overlap each other.
    if (def.overhead) {
      for (const s of this.records) {
        if (!s.def.overhead) continue;
        const f = footprintOf(s.def, s.rot);
        if (Math.abs(s.x - x) < (w + f.w) / 2 - 1 && Math.abs(s.y - h / 2 - (y - f.h / 2)) < (h + f.h) / 2 - 1) return false;
      }
      return !this.world.isDeepWater(x, y - h / 2);
    }
    for (const [cx, cy] of [
      [left, top],
      [left + w, top],
      [left, y],
      [left + w, y],
      [x, y - h / 2],
    ] as const) {
      if (this.world.isDeepWater(cx, cy)) return false;
    }
    // Snapping structures (walls) may sit flush against others; everything else keeps a gap the
    // player can always pass through.
    const pad = def.snap ? -1 : 8;
    if (this.scene.physics.overlapRect(left - pad, top - pad, w + pad * 2, h + pad * 2, false, true).length > 0) return false;
    this.rect.setTo(left - Math.max(pad, 0), top - Math.max(pad, 0), w + Math.max(pad, 0) * 2, h + Math.max(pad, 0) * 2);
    if (Phaser.Geom.Intersects.RectangleToRectangle(this.rect, playerBody)) return false;
    if (this.keepClear && Math.abs(this.keepClear.x - x) < w / 2 + 16 && Math.abs(this.keepClear.y - (y - h / 2)) < h / 2 + 16) return false;
    for (const s of this.records) {
      if (s.def.overhead) continue;
      const f = footprintOf(s.def, s.rot);
      if (Math.abs(s.x - x) < (w + f.w) / 2 - 1 && Math.abs(s.y - f.h / 2 - (y - h / 2)) < (h + f.h) / 2 - 1) return false;
    }
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
    return this.records.map((s) => {
      const out: SavedStructure = { type: s.def.id, x: s.x, y: s.y, uid: s.uid };
      if (s.rot) out.rot = 1;
      if (s.def.durability) out.durability = s.durability;
      if (s.storage) out.storage = s.storage.snapshot();
      if (s.def.rainCapacity) out.water = s.water;
      if (s.name) out.name = s.name;
      return out;
    });
  }
}
