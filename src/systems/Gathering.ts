import Phaser from 'phaser';
import { DEPTH, GATHER, TEST_MAP } from '../config';
import type { GameData, ToolKind } from '../data/schema';
import { ResourceNode, type HitResult } from '../entities/ResourceNode';
import { TEX, type ResourceSprite } from '../textures';
import { hash2, mulberry32 } from '../utils/random';
import type { PropLayer } from '../world/PropLayer';
import type { Prop } from '../world/TestMap';
import type { ItemStack } from './Inventory';
import { rollLoot } from './Loot';

const CHIP_TINT: Record<ResourceSprite, number> = {
  tree: 0x8a6a44,
  bamboo: 0x9fbf5a,
  rock: 0x9aa0a2,
  bush: 0x5f9a4a,
};
const HP_BAR_MS = 1600;

/** Owns every gatherable node: hits, feedback, loot rolls and respawn timers (game time). */
export class Gathering {
  readonly nodes: ResourceNode[] = [];
  private readonly chips: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly hpBar: Phaser.GameObjects.Graphics;
  private hpBarNode: ResourceNode | null = null;
  private hpBarUntil = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    props: PropLayer,
    mapProps: readonly Prop[],
    private readonly data: GameData,
  ) {
    for (const p of mapProps) {
      if (!p.resource) continue;
      const def = data.resources.get(p.resource);
      if (!def) throw new Error(`Map references unknown resource "${p.resource}"`);
      this.nodes.push(new ResourceNode(scene, props, p, def));
    }
    this.chips = scene.add
      .particles(0, 0, TEX.chip, {
        emitting: false,
        speed: { min: 40, max: 95 },
        angle: { min: 200, max: 340 },
        gravityY: 260,
        lifespan: 420,
        scale: { start: 0.75, end: 0 },
      })
      .setDepth(DEPTH.floatingText - 1);
    this.hpBar = scene.add.graphics().setDepth(DEPTH.floatingText - 2).setVisible(false);
  }

  /**
   * Applies one hit. On depletion, rolls loot deterministically from (seed, node id, harvest count)
   * so the same node always yields the same drops for the same harvest.
   */
  hit(node: ResourceNode, tool: ToolKind, now: number, fromX: number): { result: HitResult; loot: ItemStack[] } {
    const result = node.hit(tool, GATHER.handDamage);
    if (result === 'ignored' || result === 'needs-tool') return { result, loot: [] };

    this.feedback(node, fromX, now);
    if (result !== 'depleted') return { result, loot: [] };

    node.respawnAt = now + node.def.respawnSeconds * 1000;
    if (node.def.sprite !== 'bush') this.scene.cameras.main.shake(70, 0.0015);

    const lootTable = this.data.loot.get(node.def.lootTable);
    if (!lootTable) return { result, loot: [] };
    const rng = mulberry32(hash2(node.prop.id, node.harvestCount, TEST_MAP.seed));
    return { result, loot: rollLoot(lootTable, rng) };
  }

  /** Regrows due nodes, unless the player is standing in the footprint (retried later). */
  update(now: number, playerX: number, playerY: number): void {
    for (const n of this.nodes) {
      if (!n.depleted || now < n.respawnAt) continue;
      if (n.overlaps(playerX, playerY - 5, 9, 7)) {
        n.respawnAt = now + GATHER.respawnRetryMs;
        continue;
      }
      n.respawn();
      this.scene.tweens.add({ targets: n.image, scaleX: { from: 0.85, to: 1 }, scaleY: { from: 0.6, to: 1 }, duration: 260, ease: 'Back.easeOut' });
    }
    if (this.hpBar.visible && (now > this.hpBarUntil || this.hpBarNode?.depleted)) {
      this.hpBar.setVisible(false);
      this.hpBarNode = null;
    }
  }

  private feedback(node: ResourceNode, fromX: number, now: number): void {
    const img = node.image;
    const baseX = node.prop.x;
    this.scene.tweens.killTweensOf(img);
    img.setPosition(baseX, node.prop.y).setScale(1);
    const dir = fromX < baseX ? 1 : -1;
    this.scene.tweens.add({ targets: img, x: { from: baseX + dir * 2.5, to: baseX }, duration: 110, ease: 'Sine.easeOut' });
    img.setTintFill(0xffffff);
    this.scene.time.delayedCall(55, () => img.clearTint());

    this.chips.setParticleTint(CHIP_TINT[node.def.sprite]);
    this.chips.explode(6, node.targetX, node.targetY - 4);

    this.hpBarNode = node;
    this.hpBarUntil = now + HP_BAR_MS;
    this.drawHpBar(node);
  }

  private drawHpBar(node: ResourceNode): void {
    const w = 22;
    const x = node.prop.x - w / 2;
    const y = node.prop.y - (node.def.sprite === 'tree' ? 50 : node.def.sprite === 'bamboo' ? 66 : 30);
    const frac = node.hp / node.def.hp;
    const g = this.hpBar;
    g.clear().setVisible(frac > 0);
    g.fillStyle(0x071210, 0.85).fillRect(x - 1, y - 1, w + 2, 5);
    g.fillStyle(frac > 0.5 ? 0x8ec26a : frac > 0.25 ? 0xe6b866 : 0xd9644a, 1).fillRect(x, y, Math.max(1, w * frac), 3);
  }
}
