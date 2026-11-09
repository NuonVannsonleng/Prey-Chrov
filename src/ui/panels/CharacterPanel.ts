import Phaser from 'phaser';
import { CSS, FONTS, GAME_HEIGHT, GAME_WIDTH } from '../../config';
import { getGameData, itemDef } from '../../data/gameData';
import { gameEvents, type CharacterView } from '../../systems/GameEvents';
import { ItemSlot } from '../components/ItemSlot';

const W = 760;
const H = 500;

/**
 * Character (K): worn gear (click to take off), the five skills with level, progress and what
 * each level gives, and the knowledge learned so far (which unlocks recipes).
 */
export class CharacterPanel {
  private readonly root: Phaser.GameObjects.Container;
  private readonly gearSlots: Record<'body' | 'feet', ItemSlot>;
  private readonly gearText: Record<'body' | 'feet', Phaser.GameObjects.Text>;
  private readonly skillsText: Phaser.GameObjects.Text;
  private readonly knowledgeText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    const left = GAME_WIDTH / 2 - W / 2;
    const top = GAME_HEIGHT / 2 - H / 2 - 10;
    const backdrop = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x020605, 0.5).setOrigin(0).setInteractive();
    const panel = scene.add.graphics();
    panel.fillStyle(0x0a1513, 0.97).fillRoundedRect(left, top, W, H, 12);
    panel.lineStyle(1.5, 0x4b6a5c, 1).strokeRoundedRect(left, top, W, H, 12);
    const title = scene.add.text(left + 24, top + 18, 'Character', { fontFamily: FONTS.ui, fontSize: '24px', fontStyle: '700', color: CSS.text });
    const help = scene.add
      .text(left + W - 24, top + 26, 'Click worn gear to take it off · K / Esc to close', { fontFamily: FONTS.ui, fontSize: '13px', color: CSS.textDim })
      .setOrigin(1, 0);
    const gearHead = scene.add.text(left + 24, top + 66, 'Worn gear', { fontFamily: FONTS.ui, fontSize: '16px', fontStyle: '700', color: CSS.gold });
    const children: Phaser.GameObjects.GameObject[] = [backdrop, panel, title, help, gearHead];
    const mk = (slot: 'body' | 'feet', i: number) => {
      const y = top + 120 + i * 74;
      const s = new ItemSlot(scene, left + 56, y, 56, i);
      s.setInteractive({ useHandCursor: true });
      s.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        if (s.item) gameEvents.emit('equipment:unequip', slot);
      });
      const t = scene.add.text(left + 96, y - 22, '', { fontFamily: FONTS.ui, fontSize: '14px', color: CSS.text, wordWrap: { width: 200 }, lineSpacing: 2 });
      children.push(s, t);
      return { s, t };
    };
    const body = mk('body', 0);
    const feet = mk('feet', 1);
    this.gearSlots = { body: body.s, feet: feet.s };
    this.gearText = { body: body.t, feet: feet.t };
    const skillsHead = scene.add.text(left + 330, top + 66, 'Skills', { fontFamily: FONTS.ui, fontSize: '16px', fontStyle: '700', color: CSS.gold });
    this.skillsText = scene.add.text(left + 330, top + 94, '', { fontFamily: FONTS.ui, fontSize: '14px', color: CSS.text, wordWrap: { width: 400 }, lineSpacing: 4 });
    const note = scene.add.text(left + 330, top + H - 150, 'Skills grow from new discoveries — a new recipe, a new foe, a tablet, a new land, your first nights — plus a little each day from steady work. Repeating the same thing never grinds levels.', {
      fontFamily: FONTS.ui,
      fontSize: '12px',
      fontStyle: 'italic',
      color: CSS.textDim,
      wordWrap: { width: 400 },
    });
    const knowHead = scene.add.text(left + 24, top + 290, 'Knowledge', { fontFamily: FONTS.ui, fontSize: '16px', fontStyle: '700', color: CSS.gold });
    this.knowledgeText = scene.add.text(left + 24, top + 318, '', { fontFamily: FONTS.ui, fontSize: '13px', color: CSS.text, wordWrap: { width: 280 }, lineSpacing: 3 });
    children.push(skillsHead, this.skillsText, note, knowHead, this.knowledgeText);
    this.root = scene.add.container(0, 0, children).setDepth(640).setVisible(false);
  }

  get isOpen(): boolean {
    return this.root.visible;
  }

  open(): void {
    this.root.setVisible(true);
  }

  close(): void {
    this.root.setVisible(false);
  }

  render(v: CharacterView): void {
    for (const slot of ['body', 'feet'] as const) {
      const e = v.equipment[slot];
      this.gearSlots[slot].setStack(e);
      const label = slot === 'body' ? 'Body' : 'Feet';
      if (!e) {
        this.gearText[slot].setText(`${label}: nothing\n(F on gear to wear it)`).setColor(CSS.textDim);
        continue;
      }
      const g = itemDef(e.item).gear;
      const bits = [
        g?.damageReduction ? `-${Math.round(g.damageReduction * 100)}% damage taken` : '',
        g?.rainWarmth !== undefined ? `-${Math.round((1 - g.rainWarmth) * 100)}% warmth lost in rain` : '',
        g?.speed ? `+${Math.round(g.speed * 100)}% speed` : '',
        g?.terrain !== undefined ? `mud/shallows slow you ${Math.round((1 - g.terrain) * 100)}% less` : '',
      ].filter(Boolean);
      this.gearText[slot].setText(`${label}: ${itemDef(e.item).name}\n${bits.join(' · ')}`).setColor(CSS.text);
    }
    this.skillsText.setText(
      v.skills
        .map((s) => `${s.name}  ·  level ${s.level}  ·  ${s.toNext === null ? 'max' : `${s.toNext} XP to next`}\n   ${s.effect} — ${s.now}`)
        .join('\n'),
    );
    const all = getGameData().progression.knowledge;
    this.knowledgeText.setText(all.map((k) => (v.knowledge.includes(k.id) ? `✓ ${k.name}` : `○ ${k.name} — ${k.hint}`)).join('\n'));
  }
}
