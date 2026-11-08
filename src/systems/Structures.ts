import Phaser from 'phaser';
import { BUILD, STATION_REACH, TILE_SIZE } from '../config';
import type { Station, StructureDef } from '../data/schema';
import { TEX, WATER_TILES } from '../textures';
import type { PropLayer } from '../world/PropLayer';
import type { SavedStructure } from './Save';

export interface Structure {
  def: StructureDef;
  x: number;
  y: number;
  image: Phaser.GameObjects.Image;
  flame: Phaser.GameObjects.Sprite | null;
}

const FLAME_ANIM = 'campfire-flame';

/** Placed campfires and shelters: creation, placement rules, station lookup and lights. */
export class Structures {
  readonly list: Structure[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly props: PropLayer,
    private readonly ground: Phaser.Tilemaps.TilemapLayer,
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

  /** Creates a structure without validation (used by placement after checks, and by save loading). */
  place(type: string, x: number, y: number): Structure | null {
    const def = this.defs.get(type);
    if (!def) return null;
    x = Math.round(x);
    y = Math.round(y);
    const image = this.scene.add.image(x, y, TEX.structures, def.sprite).setOrigin(0.5, 1).setDepth(y);
    if (def.solid) this.props.addSolid(x, y, def.footprint);
    let flame: Phaser.GameObjects.Sprite | null = null;
    if (def.sprite === 'campfire') {
      flame = this.scene.add.sprite(x, y - 7, TEX.flame, 0).setOrigin(0.5, 1).setDepth(y + 0.5);
      flame.play(FLAME_ANIM);
    }
    const s = { def, x, y, image, flame };
    this.list.push(s);
    return s;
  }

  /**
   * Whether a structure fits at (x, y): within reach, inside the world, not on water,
   * not overlapping any solid (trees, rocks, structures) or the player.
   */
  canPlace(type: string, x: number, y: number, playerX: number, playerY: number, playerBody: Phaser.Geom.Rectangle): boolean {
    const def = this.defs.get(type);
    if (!def) return false;
    if (Math.hypot(x - playerX, y - playerY) > BUILD.reach) return false;
    const { w, h } = def.footprint;
    const left = x - w / 2;
    const top = y - h;
    const bounds = this.scene.physics.world.bounds;
    if (left < bounds.x + 4 || top < bounds.y + 4 || left + w > bounds.right - 4 || y > bounds.bottom - 4) return false;
    for (const [cx, cy] of [
      [left, top],
      [left + w, top],
      [left, y],
      [left + w, y],
      [x, y - h / 2],
    ] as const) {
      const tile = this.ground.getTileAtWorldXY(cx, cy);
      if (!tile || WATER_TILES.includes(tile.index)) return false;
    }
    // Keep a small margin around the footprint so structures never trap the player.
    const pad = 4;
    const hits = this.scene.physics.overlapRect(left - pad, top - pad, w + pad * 2, h + pad * 2, false, true);
    if (hits.length > 0) return false;
    const rect = new Phaser.Geom.Rectangle(left - pad, top - pad, w + pad * 2, h + pad * 2);
    if (Phaser.Geom.Intersects.RectangleToRectangle(rect, playerBody)) return false;
    // Large structures also must not sit right on top of each other visually.
    for (const s of this.list) if (Math.abs(s.x - x) < (w + s.def.footprint.w) / 2 && Math.abs(s.y - y) < TILE_SIZE) return false;
    return true;
  }

  /** Stations within reach of the player (e.g. a campfire for cooking recipes). */
  stationsNear(px: number, py: number, out: Set<Station>): Set<Station> {
    out.clear();
    for (const s of this.list) {
      if (s.def.interaction === 'cook' && Math.hypot(s.x - px, s.y - py) <= STATION_REACH) out.add('campfire');
    }
    return out;
  }

  serialize(): SavedStructure[] {
    return this.list.map((s) => ({ type: s.def.id, x: s.x, y: s.y }));
  }
}
