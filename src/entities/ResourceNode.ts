import Phaser from 'phaser';
import type { ResourceDef, ToolKind } from '../data/schema';
import { DEPLETED_FRAME, SWAP_SPRITES, TEX } from '../textures';
import { FOOTPRINT, type Canopy, type PropLayer } from '../world/PropLayer';
import { ySort } from '../config';

export type HitResult = 'ignored' | 'hit' | 'depleted' | 'needs-tool';

/** Where a node sits; `key` is stable across chunk reloads and saves ("cx,cy:index"). */
export interface PlacedProp {
  key: string;
  x: number;
  y: number;
  variant: number;
  canopyVariant: number;
}

/** A gatherable world object: tree, bamboo, boulder or berry bush. Reuses one body for its whole life. */
export class ResourceNode {
  readonly def: ResourceDef;
  readonly prop: PlacedProp;
  readonly image: Phaser.GameObjects.Image;
  private readonly stump: Phaser.GameObjects.Image | null;
  private readonly zone: Phaser.GameObjects.Zone;
  private readonly canopy: Canopy | null;
  private readonly world: Phaser.Physics.Arcade.World;
  hp: number;
  depleted = false;
  /** Game-time ms when this node regrows (valid while depleted). */
  respawnAt = 0;
  /** Times this node has been fully harvested; seeds deterministic loot. */
  harvestCount = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly props: PropLayer,
    prop: PlacedProp,
    def: ResourceDef,
  ) {
    this.def = def;
    this.prop = prop;
    this.hp = def.hp;
    this.world = scene.physics.world;
    const { x, y } = prop;

    switch (def.sprite) {
      case 'tree':
        this.image = scene.add.image(x, y, TEX.trunk, prop.variant % 3);
        break;
      case 'rock':
        this.image = scene.add.image(x, y, TEX.rock, prop.variant % 3);
        break;
      case 'bamboo':
        this.image = scene.add.image(x, y, TEX.bamboo, prop.variant % 2);
        break;
      default: {
        const swap = SWAP_SPRITES[def.sprite];
        this.image = scene.add.image(x, y, swap?.tex ?? TEX.bush, swap?.full ?? 0);
      }
    }
    this.image.setOrigin(0.5, 1).setDepth(ySort(y));

    // Bushes swap frames instead of showing a separate stump.
    this.stump =
      SWAP_SPRITES[def.sprite]
        ? null
        : scene.add
            .image(x, y + 2, TEX.depleted, DEPLETED_FRAME[def.sprite])
            .setOrigin(0.5, 1)
            .setDepth(ySort(y - 1))
            .setVisible(false);

    this.zone = props.addSolid(x, y, FOOTPRINT[def.sprite]);
    this.canopy = def.sprite === 'tree' ? props.addCanopy(x, y, prop.canopyVariant % 3) : null;
  }

  /** Point the player aims at (roughly the visual centre of the base). */
  get targetX(): number {
    return this.prop.x;
  }

  get targetY(): number {
    return this.prop.y - 8;
  }

  get label(): string {
    return `${this.def.verb} ${this.def.name}`;
  }

  hit(tool: ToolKind, baseDamage: number): HitResult {
    if (this.depleted) return 'ignored';
    const mult = this.def.toolMultipliers[tool] ?? 0;
    if (mult <= 0) return 'needs-tool';
    this.hp = Math.max(0, this.hp - baseDamage * mult);
    if (this.hp > 0) return 'hit';
    this.setDepleted(true);
    this.harvestCount++;
    return 'depleted';
  }

  /** True if a rectangle around the player's feet overlaps this node's footprint. */
  overlaps(px: number, py: number, halfW: number, halfH: number): boolean {
    const fp = FOOTPRINT[this.def.sprite];
    return Math.abs(px - this.prop.x) < fp.w / 2 + halfW && Math.abs(py - (this.prop.y - fp.h / 2)) < fp.h / 2 + halfH;
  }

  /** Restores a depleted state (from a save or a chunk reload). */
  forceDepleted(respawnAt: number): void {
    this.hp = 0;
    this.respawnAt = respawnAt;
    this.setDepleted(true);
  }

  respawn(): void {
    this.hp = this.def.hp;
    this.setDepleted(false);
  }

  /** Releases visuals and the physics body (chunk unload). */
  destroy(): void {
    this.image.scene?.tweens.killTweensOf(this.image);
    this.image.destroy();
    this.stump?.destroy();
    if (this.canopy) this.props.removeCanopy(this.canopy);
    this.props.removeSolid(this.zone);
  }

  private setDepleted(depleted: boolean): void {
    this.depleted = depleted;
    const swap = SWAP_SPRITES[this.def.sprite];
    if (swap) {
      this.image.setFrame(depleted ? swap.picked : swap.full);
    } else {
      this.image.setVisible(!depleted);
      this.stump?.setVisible(depleted);
    }
    this.image.clearTint().setAlpha(1);
    if (this.canopy) this.canopy.image.setVisible(!depleted).setAlpha(1);
    const body = this.zone.body as Phaser.Physics.Arcade.StaticBody | null;
    if (!body) return;
    // Bushes stay solid when picked; everything else becomes walkable.
    if (swap) return;
    if (depleted) this.world.disableBody(body);
    else this.world.add(body);
  }
}
