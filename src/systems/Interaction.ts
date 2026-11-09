import Phaser from 'phaser';
import { DEPTH, GATHER, TILE_SIZE } from '../config';
import type { ResourceNode } from '../entities/ResourceNode';
import { SHALLOW_TILES, TEX, WATER_TILES } from '../textures';
import type { Structure } from './Structures';
import type { HeartInstance, RootWall, RuinObject, ShrineInstance } from '../world/ChunkManager';

export type InteractTarget =
  | { kind: 'node'; node: ResourceNode; x: number; y: number }
  | { kind: 'water'; x: number; y: number }
  | { kind: 'structure'; structure: Structure; x: number; y: number }
  | { kind: 'shrine'; shrine: ShrineInstance; x: number; y: number }
  | { kind: 'ruin'; ruin: RuinObject; x: number; y: number }
  | { kind: 'heart'; heart: HeartInstance; x: number; y: number }
  | { kind: 'roots'; root: RootWall; x: number; y: number }
  | { kind: 'none'; x: number; y: number };

/** How strongly facing direction is preferred when choosing between nearby targets (px of distance). */
const FACING_BIAS = 14;

/**
 * Picks the best thing to interact with near the player (resource node or water edge)
 * and shows a ring under it. Reuses its target objects — no per-frame allocation.
 */
export class Interaction {
  private readonly nodeTarget: { kind: 'node'; node: ResourceNode; x: number; y: number };
  private readonly waterTarget = { kind: 'water' as const, x: 0, y: 0 };
  private structureTarget: { kind: 'structure'; structure: Structure; x: number; y: number } | null = null;
  private shrineTarget: { kind: 'shrine'; shrine: ShrineInstance; x: number; y: number } | null = null;
  private ruinTarget: { kind: 'ruin'; ruin: RuinObject; x: number; y: number } | null = null;
  private heartTarget: { kind: 'heart'; heart: HeartInstance; x: number; y: number } | null = null;
  private rootTarget: { kind: 'roots'; root: RootWall; x: number; y: number } | null = null;
  private readonly noTarget = { kind: 'none' as const, x: 0, y: 0 };
  private readonly ring: Phaser.GameObjects.Image;
  current: InteractTarget = this.noTarget;

  constructor(
    scene: Phaser.Scene,
    private readonly nodes: readonly ResourceNode[],
    /** Tile index lookup at a world position (chunk-aware). */
    private readonly tileAtWorld: (wx: number, wy: number) => number,
    private readonly structures: readonly Structure[],
    private readonly shrines: readonly ShrineInstance[] = [],
    private readonly ruins: readonly RuinObject[] = [],
    private readonly roots: readonly RootWall[] = [],
    private readonly heart: () => HeartInstance | null = () => null,
  ) {
    this.nodeTarget = { kind: 'node', node: null as unknown as ResourceNode, x: 0, y: 0 };
    this.ring = scene.add.image(0, 0, TEX.targetRing).setDepth(DEPTH.targetRing).setVisible(false);
    scene.tweens.add({ targets: this.ring, alpha: { from: 1, to: 0.45 }, duration: 600, yoyo: true, repeat: -1 });
  }

  /** px/py = player feet; fx/fy = unit facing vector. */
  update(px: number, py: number, fx: number, fy: number): InteractTarget {
    const cx = px;
    const cy = py - 8;
    let best: InteractTarget = this.noTarget;
    let bestScore = Infinity;

    for (const n of this.nodes) {
      if (n.depleted) continue;
      const dx = n.targetX - cx;
      const dy = n.targetY - cy;
      const d = Math.hypot(dx, dy);
      if (d > GATHER.reach) continue;
      const facing = d > 0 ? (dx * fx + dy * fy) / d : 1;
      const score = d - facing * FACING_BIAS;
      if (score < bestScore) {
        bestScore = score;
        this.nodeTarget.node = n;
        this.nodeTarget.x = n.targetX;
        this.nodeTarget.y = n.prop.y;
        best = this.nodeTarget;
      }
    }

    // Structures: use (cook, sleep, storage...) or, for walls and flags, repair / dismantle.
    // Overhead roofs are only targeted when nothing else is near (they cover everything).
    for (const st of this.structures) {
      const fw = st.rot === 1 && st.def.rotatable ? st.def.footprint.h : st.def.footprint.w;
      const fh = st.rot === 1 && st.def.rotatable ? st.def.footprint.w : st.def.footprint.h;
      const tx = st.x;
      const ty = st.y - Math.min(10, fh);
      const dx = tx - cx;
      const dy = ty - cy;
      const d = Math.hypot(dx, dy);
      if (d > GATHER.reach + fw / 2) continue;
      const facing = d > 0 ? (dx * fx + dy * fy) / d : 1;
      // Walls, flags and roofs (no E action) only win when nothing else is in reach.
      const score = st.def.interaction ? d - fw / 2 - facing * FACING_BIAS : d - facing * FACING_BIAS + (st.def.overhead ? 40 : 24);
      if (score < bestScore) {
        bestScore = score;
        this.structureTarget ??= { kind: 'structure', structure: st, x: 0, y: 0 };
        this.structureTarget.structure = st;
        this.structureTarget.x = st.x;
        this.structureTarget.y = st.y;
        best = this.structureTarget;
      }
    }

    for (const sh of this.shrines) {
      const dx = sh.x - cx;
      const dy = sh.y - 6 - cy;
      const d = Math.hypot(dx, dy);
      if (d > GATHER.reach + 12) continue;
      const facing = d > 0 ? (dx * fx + dy * fy) / d : 1;
      const score = d - 10 - facing * FACING_BIAS;
      if (score < bestScore) {
        bestScore = score;
        this.shrineTarget ??= { kind: 'shrine', shrine: sh, x: 0, y: 0 };
        this.shrineTarget.shrine = sh;
        this.shrineTarget.x = sh.x;
        this.shrineTarget.y = sh.y;
        best = this.shrineTarget;
      }
    }

    for (const ru of this.ruins) {
      const dx = ru.x - cx;
      const dy = ru.y - 6 - cy;
      const d = Math.hypot(dx, dy);
      if (d > GATHER.reach + 8) continue;
      const facing = d > 0 ? (dx * fx + dy * fy) / d : 1;
      const score = d - 8 - facing * FACING_BIAS;
      if (score < bestScore) {
        bestScore = score;
        this.ruinTarget ??= { kind: 'ruin', ruin: ru, x: 0, y: 0 };
        this.ruinTarget.ruin = ru;
        this.ruinTarget.x = ru.x;
        this.ruinTarget.y = ru.y;
        best = this.ruinTarget;
      }
    }

    // Heart Tree (large: measured from its trunk).
    const ht = this.heart();
    if (ht) {
      const dx = ht.x - cx;
      const dy = ht.y - 10 - cy;
      const d = Math.hypot(dx, dy);
      if (d <= GATHER.reach + 34) {
        const facing = d > 0 ? (dx * fx + dy * fy) / d : 1;
        const score = d - 34 - facing * FACING_BIAS;
        if (score < bestScore) {
          bestScore = score;
          this.heartTarget ??= { kind: 'heart', heart: ht, x: 0, y: 0 };
          this.heartTarget.heart = ht;
          this.heartTarget.x = ht.x;
          this.heartTarget.y = ht.y;
          best = this.heartTarget;
        }
      }
    }

    // Standing root walls only explain themselves (fire is the way through).
    for (const r of this.roots) {
      if (r.withered) continue;
      const dx = r.x - cx;
      const dy = r.y - 6 - cy;
      const d = Math.hypot(dx, dy);
      if (d > GATHER.reach + 6) continue;
      const facing = d > 0 ? (dx * fx + dy * fy) / d : 1;
      const score = d + 4 - facing * FACING_BIAS;
      if (score < bestScore) {
        bestScore = score;
        this.rootTarget ??= { kind: 'roots', root: r, x: 0, y: 0 };
        this.rootTarget.root = r;
        this.rootTarget.x = r.x;
        this.rootTarget.y = r.y;
        best = this.rootTarget;
      }
    }

    // Water: check tiles around the feet, nudged toward the facing direction.
    const tx0 = Math.floor((cx + fx * 10) / TILE_SIZE);
    const ty0 = Math.floor((py + fy * 10) / TILE_SIZE);
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const ttx = tx0 + ox;
        const tty = ty0 + oy;
        const index = this.tileAtWorld(ttx * TILE_SIZE + TILE_SIZE / 2, tty * TILE_SIZE + TILE_SIZE / 2);
        if (!WATER_TILES.includes(index) && !SHALLOW_TILES.includes(index)) continue;
        const tile = { pixelX: ttx * TILE_SIZE, pixelY: tty * TILE_SIZE };
        // Nearest point of the water tile to the player.
        const wx = Phaser.Math.Clamp(cx, tile.pixelX, tile.pixelX + TILE_SIZE);
        const wy = Phaser.Math.Clamp(py, tile.pixelY, tile.pixelY + TILE_SIZE);
        const dx = wx - cx;
        const dy = wy - py;
        const d = Math.hypot(dx, dy);
        if (d > GATHER.reach * 0.6) continue;
        const facing = d > 0 ? (dx * fx + dy * fy) / d : 1;
        const score = d - facing * FACING_BIAS + 6;
        if (score < bestScore) {
          bestScore = score;
          this.waterTarget.x = wx;
          this.waterTarget.y = wy;
          best = this.waterTarget;
        }
      }
    }

    this.current = best;
    if (best.kind === 'none') this.ring.setVisible(false);
    else this.ring.setVisible(true).setPosition(best.x, best.y - 2);
    return best;
  }

  hideRing(): void {
    this.ring.setVisible(false);
  }

  /** Node under a world point (for mouse clicks), if within reach of the player. */
  nodeAt(wx: number, wy: number, px: number, py: number): ResourceNode | null {
    for (const n of this.nodes) {
      if (n.depleted || !n.image.getBounds().contains(wx, wy)) continue;
      if (Math.hypot(n.targetX - px, n.targetY - (py - 8)) <= GATHER.reach + 6) return n;
    }
    return null;
  }
}
