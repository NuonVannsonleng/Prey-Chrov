import Phaser from 'phaser';
import { CSS, FONTS, GAME_HEIGHT, GAME_WIDTH } from '../../config';
import { itemDef } from '../../data/gameData';
import type { ItemStack } from '../../systems/Inventory';
import { RARITY_COLOR } from './ItemSlot';

const WIDTH = 240;

/** Item details shown while hovering a slot in the inventory panel. */
export class Tooltip extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly bodyText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    this.bg = scene.add.graphics();
    this.title = scene.add.text(12, 10, '', { fontFamily: FONTS.ui, fontSize: '17px', fontStyle: '700', color: CSS.text });
    this.bodyText = scene.add.text(12, 36, '', {
      fontFamily: FONTS.ui,
      fontSize: '14px',
      color: CSS.textDim,
      wordWrap: { width: WIDTH - 24 },
      lineSpacing: 3,
    });
    this.add([this.bg, this.title, this.bodyText]);
    this.setDepth(2000).setVisible(false);
    scene.add.existing(this);
  }

  showFor(stack: Readonly<ItemStack>, x: number, y: number): void {
    const def = itemDef(stack.item);
    this.title.setText(def.nameKm ? `${def.name}  ·  ${def.nameKm}` : def.name);
    const rarity = def.rarity === 'common' ? '' : `${def.rarity[0]?.toUpperCase()}${def.rarity.slice(1)} · `;
    const extra: string[] = [];
    if (def.food) extra.push(`Food +${def.food.hunger} · Water +${def.food.thirst}${def.food.health ? ` · Health ${def.food.health > 0 ? '+' : ''}${def.food.health}` : ''} (F to eat)`);
    if (def.tool && stack.durability !== undefined) extra.push(`Durability ${Math.ceil(stack.durability)} / ${def.tool.durability}`);
    if (def.light && stack.durability !== undefined) extra.push(`Burns ${Math.ceil(stack.durability)}s more in the dark`);
    if (def.places) extra.push('F to place');
    const tail = extra.length ? `\n${extra.join('\n')}` : '';
    this.bodyText.setText(`${def.description}\n\n${rarity}${stack.qty} / ${def.stackSize} in stack${tail}`);
    const h = this.bodyText.y + this.bodyText.height + 12;
    this.bg
      .clear()
      .fillStyle(0x08110f, 0.96)
      .fillRoundedRect(0, 0, WIDTH, h, 8)
      .lineStyle(1.5, RARITY_COLOR[def.rarity], 1)
      .strokeRoundedRect(0, 0, WIDTH, h, 8);
    this.setPosition(Math.min(x + 18, GAME_WIDTH - WIDTH - 8), Math.min(y + 18, GAME_HEIGHT - h - 8)).setVisible(true);
  }

  hide(): void {
    this.setVisible(false);
  }
}
