import Phaser from 'phaser';
import { CSS, FONTS, GAME_HEIGHT, GAME_WIDTH } from '../../config';
import { getGameData } from '../../data/gameData';
import { gameEvents, type MapData } from '../../systems/GameEvents';
import { WorldGen } from '../../world/WorldGen';

const CELLS = 132;
const SCALE = 3.9;
const CELL_TILES = 8;
const CELL_PX = CELL_TILES * 32;
const MAP_KEY = 'map-canvas';
const FOG = [11, 20, 17] as const;

/**
 * Full map (M): explored ground only (fog of war elsewhere), with your position, outposts,
 * ruins (gold once solved), landmarks, river shortcuts, shrines, trail signs, the Heart once
 * revealed, and your own markers. Drag to pan; click to add a marker or remove one.
 */
export class MapPanel {
  private readonly root: Phaser.GameObjects.Container;
  private readonly tex: Phaser.Textures.CanvasTexture;
  private readonly image: Phaser.GameObjects.Image;
  private readonly marks: Phaser.GameObjects.Graphics;
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private readonly coords: Phaser.GameObjects.Text;
  private gen: WorldGen | null = null;
  private data: MapData | null = null;
  private readonly colorCache = new Map<string, [number, number, number]>();
  private panX = 0;
  private panY = 0;
  private dragFrom: { x: number; y: number; panX: number; panY: number } | null = null;
  private dragged = false;
  private readonly left: number;
  private readonly top: number;
  private readonly imageData: ImageData;

  constructor(scene: Phaser.Scene) {
    const size = CELLS * SCALE;
    this.left = GAME_WIDTH / 2 - size / 2;
    this.top = GAME_HEIGHT / 2 - size / 2 + 14;
    const backdrop = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x020605, 0.6).setOrigin(0).setInteractive();
    const panel = scene.add.graphics();
    panel.fillStyle(0x0a1513, 0.97).fillRoundedRect(this.left - 220, this.top - 60, size + 440, size + 90, 12);
    panel.lineStyle(1.5, 0x4b6a5c, 1).strokeRoundedRect(this.left - 220, this.top - 60, size + 440, size + 90, 12);
    const title = scene.add.text(this.left - 196, this.top - 44, 'Map', { fontFamily: FONTS.ui, fontSize: '24px', fontStyle: '700', color: CSS.text });
    const help = scene.add
      .text(this.left + size + 196, this.top - 38, 'Drag to pan · click to add / remove a marker · M / Esc to close', { fontFamily: FONTS.ui, fontSize: '13px', color: CSS.textDim })
      .setOrigin(1, 0);
    const legendLines = ['● You', '⚑ Outpost', '◆ Ruin (gold: solved)', '▲ Landmark', '≈ River shortcut', '• Shrine (Neak Ta)', '▸ Trail sign', '● Heart of the Forest (teal)', '● Markers (red) / notes (gold)', '', 'Dark = unexplored'];
    const legend = scene.add.text(this.left - 196, this.top + 10, legendLines.join('\n'), { fontFamily: FONTS.ui, fontSize: '13px', color: CSS.text, lineSpacing: 6 });
    this.coords = scene.add.text(this.left + size + 24, this.top + 10, '', { fontFamily: FONTS.ui, fontSize: '13px', color: CSS.textDim, wordWrap: { width: 170 }, lineSpacing: 4 });
    this.tex = (scene.textures.exists(MAP_KEY) ? scene.textures.get(MAP_KEY) : scene.textures.createCanvas(MAP_KEY, CELLS, CELLS)) as Phaser.Textures.CanvasTexture;
    this.imageData = this.tex.getContext().createImageData(CELLS, CELLS);
    this.image = scene.add.image(this.left, this.top, MAP_KEY).setOrigin(0).setScale(SCALE).setInteractive({ useHandCursor: true });
    this.marks = scene.add.graphics();
    for (let i = 0; i < 40; i++) {
      this.labels.push(scene.add.text(0, 0, '', { fontFamily: FONTS.ui, fontSize: '11px', color: '#f1ede2', stroke: '#071210', strokeThickness: 3 }).setVisible(false));
    }
    this.root = scene.add.container(0, 0, [backdrop, panel, title, help, legend, this.coords, this.image, this.marks, ...this.labels]).setDepth(660).setVisible(false);
    this.image.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => {
      this.dragFrom = { x: p.x, y: p.y, panX: this.panX, panY: this.panY };
      this.dragged = false;
    });
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (!this.isOpen || !this.dragFrom || !p.isDown) return;
      const dx = (p.x - this.dragFrom.x) / SCALE;
      const dy = (p.y - this.dragFrom.y) / SCALE;
      if (Math.hypot(dx, dy) > 2) this.dragged = true;
      this.panX = this.dragFrom.panX - Math.round(dx);
      this.panY = this.dragFrom.panY - Math.round(dy);
      this.draw();
    });
    this.image.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      if (this.dragFrom && !this.dragged) {
        const w = this.screenToWorld(p.x, p.y);
        if (w) gameEvents.emit('map:marker', w);
      }
      this.dragFrom = null;
    });
    scene.input.on(Phaser.Input.Events.POINTER_UP, () => {
      this.dragFrom = null;
    });
  }

  get isOpen(): boolean {
    return this.root.visible;
  }

  setSeed(seed: number): void {
    this.gen = new WorldGen(seed, getGameData().biomes);
    this.colorCache.clear();
  }

  open(): void {
    this.panX = 0;
    this.panY = 0;
    this.root.setVisible(true);
    gameEvents.emit('map:request');
  }

  close(): void {
    this.root.setVisible(false);
    this.dragFrom = null;
  }

  pan(dx: number, dy: number): void {
    this.panX += dx;
    this.panY += dy;
    this.draw();
  }

  render(data: MapData): void {
    this.data = data;
    if (this.isOpen) this.draw();
  }

  /** Top-left cell of the view. */
  private origin(): { cx: number; cy: number } {
    const p = this.data?.player ?? { x: 0, y: 0 };
    return { cx: Math.floor(p.x / CELL_PX) - CELLS / 2 + this.panX, cy: Math.floor(p.y / CELL_PX) - CELLS / 2 + this.panY };
  }

  /** Screen point to world px (for markers), or null outside the map. */
  screenToWorld(sx: number, sy: number): { x: number; y: number } | null {
    const o = this.origin();
    const cx = (sx - this.left) / SCALE;
    const cy = (sy - this.top) / SCALE;
    if (cx < 0 || cy < 0 || cx >= CELLS || cy >= CELLS) return null;
    return { x: (o.cx + cx) * CELL_PX, y: (o.cy + cy) * CELL_PX };
  }

  /** World px to screen point (tests). */
  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const o = this.origin();
    return { x: this.left + (wx / CELL_PX - o.cx) * SCALE, y: this.top + (wy / CELL_PX - o.cy) * SCALE };
  }

  private cellColor(cx: number, cy: number, key: string): [number, number, number] {
    let c = this.colorCache.get(key);
    if (!c) {
      const hex = this.gen?.minimapColor(cx * CELL_TILES + 4, cy * CELL_TILES + 4) ?? '#333344';
      c = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
      this.colorCache.set(key, c);
    }
    return c;
  }

  private draw(): void {
    const data = this.data;
    if (!data) return;
    const o = this.origin();
    const d = this.imageData.data;
    for (let i = 0; i < CELLS * CELLS; i++) {
      d[i * 4] = FOG[0];
      d[i * 4 + 1] = FOG[1];
      d[i * 4 + 2] = FOG[2];
      d[i * 4 + 3] = 255;
    }
    for (const key of data.explored) {
      const comma = key.indexOf(',');
      const cx = Number(key.slice(0, comma));
      const cy = Number(key.slice(comma + 1));
      const x = cx - o.cx;
      const y = cy - o.cy;
      if (x < 0 || y < 0 || x >= CELLS || y >= CELLS) continue;
      const c = this.cellColor(cx, cy, key);
      const i = (y * CELLS + x) * 4;
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
    }
    this.tex.getContext().putImageData(this.imageData, 0, 0);
    this.tex.refresh();

    const g = this.marks.clear();
    let label = 0;
    const size = CELLS * SCALE;
    const toScreen = (wx: number, wy: number) => [this.left + (wx / CELL_PX - o.cx) * SCALE, this.top + (wy / CELL_PX - o.cy) * SCALE] as const;
    const inside = (x: number, y: number) => x >= this.left && y >= this.top && x <= this.left + size && y <= this.top + size;
    const text = (x: number, y: number, s: string, color: string) => {
      const t = this.labels[label++];
      if (t) t.setText(s).setColor(color).setPosition(x + 6, y - 7).setVisible(true);
    };
    for (const r of data.ruins) {
      const [x, y] = toScreen(r.x, r.y);
      if (!inside(x, y)) continue;
      g.fillStyle(r.solved ? 0xe6b866 : 0xc58be0, 1).fillTriangle(x, y - 5, x + 5, y, x, y + 5).fillTriangle(x, y - 5, x - 5, y, x, y + 5);
    }
    for (const s of data.shrines) {
      const [x, y] = toScreen(s.x, s.y);
      if (inside(x, y)) g.fillStyle(0xe6b866, 1).fillCircle(x, y, 2.5);
    }
    for (const s of data.signs) {
      const [x, y] = toScreen(s.x, s.y);
      if (inside(x, y)) g.fillStyle(0xa87048, 1).fillTriangle(x - 3, y - 3, x + 4, y, x - 3, y + 3);
    }
    for (const s of data.shortcuts) {
      const [x, y] = toScreen(s.x, s.y);
      if (!inside(x, y)) continue;
      g.lineStyle(2, 0x9ae0f0, 1).lineBetween(x - 5, y - 2, x + 5, y - 2).lineBetween(x - 5, y + 2, x + 5, y + 2);
    }
    for (const l of data.landmarks) {
      const [x, y] = toScreen(l.x, l.y);
      if (!inside(x, y)) continue;
      g.fillStyle(0x8ec26a, 1).fillTriangle(x, y - 6, x + 5, y + 4, x - 5, y + 4);
      text(x, y, l.name, '#cfe8b8');
    }
    for (const op of data.outposts) {
      const [x, y] = toScreen(op.x, op.y);
      if (!inside(x, y)) continue;
      g.fillStyle(0x071210, 1).fillRect(x - 1, y - 8, 2, 9);
      g.fillStyle(0xe6b866, 1).fillTriangle(x + 1, y - 8, x + 7, y - 6, x + 1, y - 4);
      text(x, y, op.name, '#ffd27a');
    }
    if (data.heart) {
      const [x, y] = toScreen(data.heart.x, data.heart.y);
      if (inside(x, y)) {
        g.fillStyle(0x4fc2b4, 1).fillCircle(x, y, 4);
        text(x, y, 'Heart of the Forest', '#a0ffe6');
      }
    }
    for (const m of data.markers) {
      const [x, y] = toScreen(m.x, m.y);
      if (!inside(x, y)) continue;
      g.fillStyle(m.kind === 'note' ? 0xe6b866 : 0xd9644a, 1).fillCircle(x, y - 4, 3.5).fillTriangle(x - 3, y - 3, x + 3, y - 3, x, y + 2);
      if (m.text) text(x, y, m.text, m.kind === 'note' ? '#ffd27a' : '#f4a090');
    }
    const [px, py] = toScreen(data.player.x, data.player.y);
    if (inside(px, py)) {
      g.fillStyle(0xffffff, 1).fillCircle(px, py, 4);
      g.lineStyle(1.5, 0x071210, 1).strokeCircle(px, py, 4);
    }
    for (let i = label; i < this.labels.length; i++) this.labels[i]?.setVisible(false);
    this.coords.setText(
      [
        `Explored: ${data.explored.length} areas`,
        `Ruins found: ${data.ruins.length} (${data.ruins.filter((r) => r.solved).length} solved)`,
        `Landmarks: ${data.landmarks.length}`,
        `Shortcuts: ${data.shortcuts.length}`,
        `Markers: ${data.markers.length} / 30`,
        '',
        'Carry a compass and your nearest markers point the way on screen.',
      ].join('\n'),
    );
  }
}
