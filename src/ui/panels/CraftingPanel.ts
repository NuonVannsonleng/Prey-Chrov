import Phaser from 'phaser';
import { CSS, FONTS, GAME_HEIGHT, GAME_WIDTH } from '../../config';
import { getGameData, itemDef } from '../../data/gameData';
import type { RecipeCategory, RecipeDef } from '../../data/schema';
import { gameEvents, type InventoryView } from '../../systems/GameEvents';
import { TEX } from '../../textures';
import { Button } from '../components/Button';

const ROW_H = 58;
const W = 640;

/** Recipe tabs (keeps the panel on screen as the recipe list grows). */
const TABS: Array<{ id: string; label: string; categories: RecipeCategory[] }> = [
  { id: 'tools', label: 'Tools & light', categories: ['tools', 'light'] },
  { id: 'building', label: 'Building', categories: ['building'] },
  { id: 'food', label: 'Food & water', categories: ['food'] },
  { id: 'medicine', label: 'Medicine', categories: ['medicine'] },
];
const STATION_NAMES: Record<string, string> = { campfire: 'a campfire', pot: 'a cooking pot' };

interface Row {
  recipe: RecipeDef;
  tab: string;
  parts: [Phaser.GameObjects.Image, Phaser.GameObjects.Text, Phaser.GameObjects.Text, Button, Phaser.GameObjects.Rectangle];
  name: Phaser.GameObjects.Text;
  needs: Phaser.GameObjects.Text;
  button: Button;
}

/**
 * Crafting panel (C). Shows every recipe with owned/required counts per ingredient,
 * locked station requirements, and a Craft button that is disabled until craftable.
 * The World performs the actual craft; this panel only displays and requests.
 */
export class CraftingPanel {
  private readonly root: Phaser.GameObjects.Container;
  private readonly rows: Row[] = [];
  private view: InventoryView | null = null;
  private stations = new Set<string>();
  private tab = 'tools';
  private readonly tabButtons: Array<{ id: string; button: Button }> = [];
  private top = 0;

  constructor(scene: Phaser.Scene) {
    const recipes = [...getGameData().recipes.values()];
    const tabOf = (r: RecipeDef) => TABS.find((t) => t.categories.includes(r.category))?.id ?? 'tools';
    const maxRows = Math.max(...TABS.map((t) => recipes.filter((r) => tabOf(r) === t.id).length));
    const h = 140 + maxRows * ROW_H + 30;
    const left = GAME_WIDTH / 2 - W / 2;
    const top = Math.max(16, GAME_HEIGHT / 2 - h / 2 - 10);

    const backdrop = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x020605, 0.45).setOrigin(0).setInteractive();
    const panel = scene.add.graphics();
    panel.fillStyle(0x0a1513, 0.97).fillRoundedRect(left, top, W, h, 12);
    panel.lineStyle(1.5, 0x4b6a5c, 1).strokeRoundedRect(left, top, W, h, 12);
    const title = scene.add.text(left + 24, top + 18, 'Crafting', { fontFamily: FONTS.ui, fontSize: '24px', fontStyle: '700', color: CSS.text });
    const help = scene.add
      .text(left + W - 24, top + 26, 'C / Esc to close', { fontFamily: FONTS.ui, fontSize: '13px', color: CSS.textDim })
      .setOrigin(1, 0);
    this.root = scene.add.container(0, 0, [backdrop, panel, title, help]).setDepth(600);
    this.top = top;
    const tabHint = scene.add
      .text(left + W - 24, top + 46, 'Tab: next category', { fontFamily: FONTS.ui, fontSize: '12px', color: CSS.textDim })
      .setOrigin(1, 0);
    this.root.add(tabHint);
    TABS.forEach((t, i) => {
      const button = new Button(scene, left + 24 + 70 + i * 148, top + 92, { label: t.label, width: 140, height: 32, fontSize: 16, onActivate: () => this.setTab(t.id) });
      this.tabButtons.push({ id: t.id, button });
      this.root.add(button);
    });

    recipes.forEach((recipe) => {
      const y = 0;
      const out = itemDef(recipe.output);
      const icon = scene.add.image(left + 44, y + ROW_H / 2 - 4, TEX.icons, out.icon).setScale(2);
      const name = scene.add.text(left + 72, y + 4, '', { fontFamily: FONTS.ui, fontSize: '17px', fontStyle: '700', color: CSS.text });
      const needs = scene.add.text(left + 72, y + 27, '', { fontFamily: FONTS.ui, fontSize: '13px', color: CSS.textDim });
      const button = new Button(scene, left + W - 84, y + ROW_H / 2 - 4, {
        label: 'Craft',
        width: 120,
        height: 38,
        onActivate: () => gameEvents.emit('craft:request', { recipe: recipe.id }),
      });
      const sep = scene.add.rectangle(left + 20, y + ROW_H - 4, W - 40, 1, 0x1e3029).setOrigin(0);
      this.root.add([icon, name, needs, button, sep]);
      this.rows.push({ recipe, tab: tabOf(recipe), parts: [icon, name, needs, button, sep], name, needs, button });
    });
    this.root.setVisible(false);
  }

  get isOpen(): boolean {
    return this.root.visible;
  }

  /** Opens on a tab (e.g. food at a campfire), or the last one used. */
  open(tab?: string): void {
    this.root.setVisible(true);
    this.setTab(tab ?? this.tab);
  }

  /** Cycles tabs (Tab / Shift+Tab while open). */
  nextTab(dir = 1): void {
    const i = TABS.findIndex((t) => t.id === this.tab);
    this.setTab(TABS[(i + dir + TABS.length) % TABS.length]?.id ?? 'tools');
  }

  /** Shows the tab containing a recipe. */
  showRecipe(recipeId: string): void {
    const row = this.rows.find((r) => r.recipe.id === recipeId);
    if (row) this.setTab(row.tab);
  }

  get activeTab(): string {
    return this.tab;
  }

  private setTab(id: string): void {
    this.tab = id;
    let i = 0;
    for (const row of this.rows) {
      const on = row.tab === id;
      for (const part of row.parts) part.setVisible(on);
      if (!on) continue;
      const y = this.top + 128 + i * ROW_H;
      const [icon, name, needs, button, sep] = row.parts;
      icon.setY(y + ROW_H / 2 - 4);
      name.setY(y + 4);
      needs.setY(y + 27);
      button.setY(y + ROW_H / 2 - 4);
      sep.setY(y + ROW_H - 4);
      i++;
    }
    for (const t of this.tabButtons) t.button.setFocused(t.id === id);
    this.refresh();
  }

  close(): void {
    this.root.setVisible(false);
  }

  setInventory(view: InventoryView): void {
    this.view = view;
    if (this.isOpen) this.refresh();
  }

  setStations(stations: readonly string[]): void {
    this.stations = new Set(stations);
    if (this.isOpen) this.refresh();
  }

  private count(item: string): number {
    let n = 0;
    for (const s of this.view?.slots ?? []) if (s && s.item === item) n += s.qty;
    return n;
  }

  private refresh(): void {
    for (const row of this.rows) {
      const r = row.recipe;
      const out = itemDef(r.output);
      const stationOk = r.station === 'none' || this.stations.has(r.station);
      const parts = r.ingredients.map((g) => {
        const have = this.count(g.item);
        return `${itemDef(g.item).name} ${Math.min(have, 999)}/${g.qty}${have >= g.qty ? ' ✓' : ' ✗'}`;
      });
      const enough = r.ingredients.every((g) => this.count(g.item) >= g.qty);
      const lock = stationOk ? '' : `   🔒 needs ${STATION_NAMES[r.station] ?? r.station} nearby`;
      row.name.setText(`${out.name}${r.qty > 1 ? ` ×${r.qty}` : ''}${lock}`).setColor(stationOk ? CSS.text : CSS.textDim);
      row.needs.setText(parts.join('    ')).setColor(enough ? '#8ec26a' : CSS.textDim);
      // Stays clickable so a blocked craft explains itself (missing materials / station).
      row.button.setAlpha(enough && stationOk ? 1 : 0.5);
    }
  }
}
