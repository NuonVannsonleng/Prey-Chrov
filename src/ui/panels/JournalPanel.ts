import Phaser from 'phaser';
import { CSS, FONTS, GAME_HEIGHT, GAME_WIDTH } from '../../config';
import { getGameData } from '../../data/gameData';
import type { TabletDef } from '../../data/schema';
import type { QuestView } from '../../systems/Quest';
import type { SideQuestView } from '../../systems/SideQuests';
import { Button } from '../components/Button';

const W = 1000;
const H = 600;

/**
 * Journal (J): main quest steps, the tablets read so far (Khmer + English titles and text),
 * and a short lore glossary with a clear fiction disclaimer.
 */
export class JournalPanel {
  private readonly root: Phaser.GameObjects.Container;
  private readonly questText: Phaser.GameObjects.Text;
  private questBody = '';
  private outpostLine = '';
  private readonly tabletTitles: Phaser.GameObjects.Text[] = [];
  private readonly tabletBodies: Phaser.GameObjects.Text[] = [];
  private readonly mainGroup: Phaser.GameObjects.GameObject[] = [];
  private readonly sideGroup: Phaser.GameObjects.GameObject[] = [];
  private readonly sideText: Phaser.GameObjects.Text;
  private readonly memText: Phaser.GameObjects.Text;
  private readonly tabButtons: Button[] = [];
  private tab: 'main' | 'side' = 'main';

  constructor(scene: Phaser.Scene) {
    const left = GAME_WIDTH / 2 - W / 2;
    const top = GAME_HEIGHT / 2 - H / 2;
    const backdrop = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x020605, 0.55).setOrigin(0).setInteractive();
    const panel = scene.add.graphics();
    panel.fillStyle(0x0b1411, 0.97).fillRoundedRect(left, top, W, H, 12);
    panel.lineStyle(1.5, 0x6e7268, 1).strokeRoundedRect(left, top, W, H, 12);
    const title = scene.add.text(left + 28, top + 18, 'Journal', { fontFamily: FONTS.ui, fontSize: '26px', fontStyle: '700', color: CSS.text });
    const close = scene.add
      .text(left + W - 28, top + 28, 'J / Esc to close', { fontFamily: FONTS.ui, fontSize: '13px', color: CSS.textDim })
      .setOrigin(1, 0);
    this.questText = scene.add.text(left + 28, top + 66, '', {
      fontFamily: FONTS.ui,
      fontSize: '15px',
      color: CSS.text,
      wordWrap: { width: 440 },
      lineSpacing: 5,
    });
    const tabletsHead = scene.add.text(left + 28, top + 220, 'Stone tablets', { fontFamily: FONTS.ui, fontSize: '17px', fontStyle: '700', color: CSS.gold });
    const children: Phaser.GameObjects.GameObject[] = [backdrop, panel, title, close, this.questText, tabletsHead];
    for (let i = 0; i < 5; i++) {
      const y = top + 250 + i * 66;
      const t = scene.add.text(left + 28, y, '', { fontFamily: FONTS.ui, fontSize: '14px', fontStyle: '700', color: CSS.turquoise });
      const b = scene.add.text(left + 28, y + 20, '', {
        fontFamily: FONTS.ui,
        fontSize: '13px',
        color: CSS.text,
        wordWrap: { width: 450 },
      });
      this.tabletTitles.push(t);
      this.tabletBodies.push(b);
      children.push(t, b);
    }
    const lore = getGameData().lore;
    const loreHead = scene.add.text(left + 520, top + 66, 'Lore glossary', { fontFamily: FONTS.ui, fontSize: '17px', fontStyle: '700', color: CSS.gold });
    const loreBody = scene.add.text(
      left + 520,
      top + 96,
      lore.entries.map((e) => `${e.term}${e.termKm ? ` · ${e.termKm}` : ''}\n${e.text}`).join('\n\n'),
      { fontFamily: FONTS.ui, fontSize: '13px', color: CSS.text, wordWrap: { width: 450 }, lineSpacing: 3 },
    );
    const disclaimer = scene.add.text(left + 520, top + H - 92, lore.disclaimer, {
      fontFamily: FONTS.ui,
      fontSize: '12px',
      fontStyle: 'italic',
      color: CSS.textDim,
      wordWrap: { width: 450 },
    });
    children.push(loreHead, loreBody, disclaimer);
    // Everything above belongs to the Main story tab.
    this.mainGroup.push(...children.slice(4));
    // Side stories tab: quests on the left, memories on the right.
    const sideHead = scene.add.text(left + 28, top + 66, 'Side stories', { fontFamily: FONTS.ui, fontSize: '17px', fontStyle: '700', color: CSS.gold });
    this.sideText = scene.add.text(left + 28, top + 96, '', { fontFamily: FONTS.ui, fontSize: '14px', color: CSS.text, wordWrap: { width: 450 }, lineSpacing: 4 });
    const memHead = scene.add.text(left + 520, top + 66, 'Memories', { fontFamily: FONTS.ui, fontSize: '17px', fontStyle: '700', color: CSS.gold });
    this.memText = scene.add.text(left + 520, top + 96, '', { fontFamily: FONTS.ui, fontSize: '14px', fontStyle: 'italic', color: CSS.text, wordWrap: { width: 450 }, lineSpacing: 4 });
    this.sideGroup.push(sideHead, this.sideText, memHead, this.memText);
    children.push(...this.sideGroup);
    const mkTab = (label: string, tab: 'main' | 'side', x: number) => {
      const b = new Button(scene, x, top + 34, { label, width: 150, height: 32, fontSize: 15, onActivate: () => this.setTab(tab) });
      this.tabButtons.push(b);
      children.push(b);
    };
    mkTab('Main story', 'main', left + 300);
    mkTab('Side stories', 'side', left + 460);
    this.root = scene.add.container(0, 0, children).setDepth(700).setVisible(false);
    this.setTab('main');
  }

  setTab(tab: 'main' | 'side'): void {
    this.tab = tab;
    for (const o of this.mainGroup) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(tab === 'main');
    for (const o of this.sideGroup) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(tab === 'side');
    this.tabButtons[0]?.setFocused(tab === 'main');
    this.tabButtons[1]?.setFocused(tab === 'side');
  }

  nextTab(): void {
    this.setTab(this.tab === 'main' ? 'side' : 'main');
  }

  get activeTab(): string {
    return this.tab;
  }

  /** Side stories: status, steps with progress, the outcome; memories in the order found. */
  renderSide(quests: readonly SideQuestView[], memories: ReadonlyArray<{ title: string; text: string }>): void {
    const label: Record<string, string> = { available: 'Not yet begun', offered: 'Offered', active: 'In progress', declined: 'Declined', done: 'Complete' };
    const blocks = quests
      .filter((q) => q.status !== 'available')
      .map((q) => {
        const lines = [`${q.title} — ${label[q.status] ?? q.status}`];
        if (q.status === 'active' || q.status === 'done') for (const s of q.steps) lines.push(`  ${s.done ? '✓' : '○'} ${s.text}${s.progress ? ` (${s.progress})` : ''}`);
        if (q.outcome) lines.push(`  → ${q.outcome}`);
        return lines.join('\n');
      });
    this.sideText.setText(blocks.length ? blocks.join('\n\n') : 'No side stories yet. They begin with things you do: a dream, a discovery, a solved ruin…');
    this.memText.setText(memories.length ? memories.map((m) => `“${m.text}”\n  — ${m.title}`).join('\n\n') : 'Memories you uncover will be kept here.');
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

  /** Outposts listed under the quest with distance and direction from the player. */
  setOutposts(list: ReadonlyArray<{ name: string; x: number; y: number }>, from?: { x: number; y: number }): void {
    this.lastOutposts = list;
    if (from) this.lastFrom = from;
    const f = this.lastFrom;
    this.outpostLine = list.length
      ? `\n\nOutposts: ${list
          .map((o) => {
            if (!f) return o.name;
            const dx = o.x - f.x;
            const dy = o.y - f.y;
            const m = Math.round(Math.hypot(dx, dy) / 32);
            return `${o.name} (${m} m ${compass(dx, dy)})`;
          })
          .join(' · ')}`
      : '';
    this.questText.setText(this.questBody + this.outpostLine);
  }

  private lastOutposts: ReadonlyArray<{ name: string; x: number; y: number }> = [];
  private lastFrom: { x: number; y: number } | null = null;

  /** Refresh distances when the journal opens. */
  refreshFrom(x: number, y: number): void {
    this.setOutposts(this.lastOutposts, { x, y });
  }

  render(q: QuestView): void {
    const steps = q.steps.map((s) => `${s.done ? '✓' : '○'}  ${s.text}${s.progress ? `  (${s.progress})` : ''}`).join('\n');
    this.questBody = `${q.title}${q.titleKm ? ` · ${q.titleKm}` : ''}\n${q.description}\n\n${steps}`;
    this.questText.setText(this.questBody + this.outpostLine);
    const byOrder = new Map<number, TabletDef>(q.tablets.map((t) => [t.order, t]));
    for (let i = 0; i < 5; i++) {
      const t = byOrder.get(i + 1);
      this.tabletTitles[i]?.setText(t ? `${i + 1}. ${t.titleKm} — ${t.titleEn}` : `${i + 1}. ? ? ?`).setColor(t ? CSS.turquoise : CSS.textDim);
      this.tabletBodies[i]?.setText(t ? t.text : 'Not yet found. Ruins on the minimap (◆) may hold it.');
    }
  }
}

function compass(dx: number, dy: number): string {
  if (Math.hypot(dx, dy) < 48) return 'here';
  const dirs = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
  const a = Math.atan2(dy, dx);
  return dirs[(Math.round(a / (Math.PI / 4)) + 8) % 8] ?? '';
}

/** Large modal shown when a tablet is read. */
export class TabletView {
  private readonly root: Phaser.GameObjects.Container;
  private readonly km: Phaser.GameObjects.Text;
  private readonly en: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const backdrop = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x020605, 0.6).setOrigin(0).setInteractive();
    const slab = scene.add.graphics();
    slab.fillStyle(0x4a4d47, 1).fillRoundedRect(cx - 300, cy - 200, 600, 400, 24);
    slab.lineStyle(3, 0x6e7268, 1).strokeRoundedRect(cx - 300, cy - 200, 600, 400, 24);
    slab.lineStyle(1, 0x4fc2b4, 0.6).strokeRoundedRect(cx - 284, cy - 184, 568, 368, 18);
    this.km = scene.add
      .text(cx, cy - 150, '', { fontFamily: FONTS.title, fontSize: '28px', color: CSS.gold, padding: { top: 14, bottom: 8 } })
      .setOrigin(0.5);
    this.en = scene.add.text(cx, cy - 95, '', { fontFamily: FONTS.ui, fontSize: '20px', fontStyle: '700', color: CSS.text }).setOrigin(0.5);
    this.body = scene.add
      .text(cx, cy + 10, '', {
        fontFamily: FONTS.ui,
        fontSize: '18px',
        color: '#f1ede2',
        align: 'center',
        wordWrap: { width: 500 },
        lineSpacing: 6,
      })
      .setOrigin(0.5);
    const hint = scene.add
      .text(cx, cy + 165, 'E / Esc / click to close · recorded in your journal (J)', { fontFamily: FONTS.ui, fontSize: '13px', color: CSS.textDim })
      .setOrigin(0.5);
    backdrop.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => this.close());
    this.root = scene.add.container(0, 0, [backdrop, slab, this.km, this.en, this.body, hint]).setDepth(800).setVisible(false);
  }

  get isOpen(): boolean {
    return this.root.visible;
  }

  show(t: TabletDef): void {
    this.km.setText(t.titleKm);
    this.en.setText(`Tablet ${t.order} · ${t.titleEn}`);
    this.body.setText(t.text);
    this.root.setVisible(true);
  }

  close(): void {
    this.root.setVisible(false);
  }
}
