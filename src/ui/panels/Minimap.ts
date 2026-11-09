import Phaser from 'phaser';
import { CHUNK_TILES, CSS, FONTS, GAME_WIDTH, MINIMAP, TILE_SIZE } from '../../config';
import { getGameData } from '../../data/gameData';
import { TEX } from '../../textures';
import { WorldGen, chunkKey } from '../../world/WorldGen';

const CACHE_LIMIT = 400;

/**
 * Top-right minimap rendered from the same seeded generator as the world (pure function of
 * seed + coordinates), so it needs no tile data from the World scene. Colours are cached per
 * chunk at minimap resolution; a redraw only composes cached cells.
 */
export class Minimap {
  private gen: WorldGen | null = null;
  private readonly tex: Phaser.Textures.CanvasTexture;
  private readonly image: Phaser.GameObjects.Image;
  private readonly markers: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly cache = new Map<string, Uint8ClampedArray>();
  private readonly imageData: ImageData;
  private structures: Array<{ x: number; y: number; kind: string }> = [];
  private lastTx = Number.NaN;
  private lastTy = Number.NaN;
  private lastBiome = '';
  private readonly left: number;
  private readonly top: number;

  constructor(scene: Phaser.Scene) {
    const size = MINIMAP.size;
    this.left = GAME_WIDTH - size - 18;
    this.top = 18;
    if (scene.textures.exists(TEX.minimap)) scene.textures.remove(TEX.minimap);
    const tex = scene.textures.createCanvas(TEX.minimap, size, size);
    if (!tex) throw new Error('minimap canvas failed');
    this.tex = tex;
    this.imageData = tex.getContext().createImageData(size, size);
    scene.add.rectangle(this.left - 3, this.top - 3, size + 6, size + 6, 0x08110f, 0.9).setOrigin(0).setStrokeStyle(1.5, 0x4b6a5c);
    this.image = scene.add.image(this.left, this.top, TEX.minimap).setOrigin(0);
    this.markers = scene.add.graphics();
    this.label = scene.add
      .text(this.left + size / 2, this.top + size + 8, '', { fontFamily: FONTS.ui, fontSize: '13px', fontStyle: '600', color: CSS.text })
      .setOrigin(0.5, 0);
    this.image.setVisible(false);
  }

  setSeed(seed: number): void {
    this.gen = new WorldGen(seed, getGameData().biomes);
    this.cache.clear();
    this.lastTx = Number.NaN;
    this.image.setVisible(true);
  }

  setStructures(list: Array<{ x: number; y: number; kind: string }>): void {
    this.structures = list;
    this.lastTx = Number.NaN;
  }

  setVisible(v: boolean): void {
    this.image.setVisible(v && this.gen !== null);
    this.markers.setVisible(v);
    this.label.setVisible(v);
  }

  /** Call with the player's world position; redraws only after moving a few tiles. */
  update(px: number, py: number): void {
    const gen = this.gen;
    if (!gen) return;
    const tx = Math.floor(px / TILE_SIZE);
    const ty = Math.floor(py / TILE_SIZE);
    if (Math.abs(tx - this.lastTx) < MINIMAP.redrawTiles && Math.abs(ty - this.lastTy) < MINIMAP.redrawTiles) return;
    this.lastTx = tx;
    this.lastTy = ty;
    this.redraw(gen, tx, ty);
    const biome = gen.biome(gen.biomeAt(tx, ty));
    const name = biome.nameKm ? `${biome.name} · ${biome.nameKm}` : biome.name;
    if (name !== this.lastBiome) {
      this.lastBiome = name;
      this.label.setText(name);
    }
  }

  private cellColors(gen: WorldGen, cx: number, cy: number): Uint8ClampedArray {
    const key = chunkKey(cx, cy);
    const hit = this.cache.get(key);
    if (hit) return hit;
    const n = CHUNK_TILES / MINIMAP.tilesPerPixel;
    const out = new Uint8ClampedArray(n * n * 3);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const hex = gen.minimapColor(cx * CHUNK_TILES + i * MINIMAP.tilesPerPixel, cy * CHUNK_TILES + j * MINIMAP.tilesPerPixel);
        const v = parseInt(hex.slice(1), 16);
        const o = (j * n + i) * 3;
        out[o] = (v >> 16) & 0xff;
        out[o + 1] = (v >> 8) & 0xff;
        out[o + 2] = v & 0xff;
      }
    }
    if (this.cache.size >= CACHE_LIMIT) this.cache.clear();
    this.cache.set(key, out);
    return out;
  }

  private redraw(gen: WorldGen, ptx: number, pty: number): void {
    const size = MINIMAP.size;
    const tpp = MINIMAP.tilesPerPixel;
    const n = CHUNK_TILES / tpp;
    // Align the origin to the pixel grid so cached cells line up.
    const ox = Math.floor((ptx - (size / 2) * tpp) / tpp) * tpp;
    const oy = Math.floor((pty - (size / 2) * tpp) / tpp) * tpp;
    const d = this.imageData.data;
    for (let j = 0; j < size; j++) {
      const ty = oy + j * tpp;
      const cy = Math.floor(ty / CHUNK_TILES);
      const ly = (ty - cy * CHUNK_TILES) / tpp;
      let runCx = Number.NaN;
      let cell: Uint8ClampedArray = new Uint8ClampedArray(0);
      for (let i = 0; i < size; i++) {
        const tx = ox + i * tpp;
        const cx = Math.floor(tx / CHUNK_TILES);
        const lx = (tx - cx * CHUNK_TILES) / tpp;
        if (cx !== runCx) {
          runCx = cx;
          cell = this.cellColors(gen, cx, cy);
        }
        const s = (ly * n + lx) * 3;
        const o = (j * size + i) * 4;
        d[o] = cell[s] ?? 0;
        d[o + 1] = cell[s + 1] ?? 0;
        d[o + 2] = cell[s + 2] ?? 0;
        d[o + 3] = 255;
      }
    }
    this.tex.getContext().putImageData(this.imageData, 0, 0);
    this.tex.refresh();

    // Markers: ruins (landmarks), structures, player.
    const g = this.markers.clear();
    const toScreen = (wtx: number, wty: number) => [this.left + (wtx - ox) / tpp, this.top + (wty - oy) / tpp] as const;
    const inside = (x: number, y: number) => x >= this.left + 2 && y >= this.top + 2 && x <= this.left + size - 2 && y <= this.top + size - 2;
    for (const r of gen.ruinsNear(ptx, pty, size * tpp)) {
      const [x, y] = toScreen(r.tx, r.ty);
      if (!inside(x, y)) continue;
      g.fillStyle(0xc58be0, 1).fillTriangle(x, y - 4, x + 4, y, x, y + 4).fillTriangle(x, y - 4, x - 4, y, x, y + 4);
    }
    for (const s of this.structures) {
      const [x, y] = toScreen(s.x / TILE_SIZE, s.y / TILE_SIZE);
      if (!inside(x, y)) continue;
      g.fillStyle(s.kind === 'cook' ? 0xe8893a : 0x8ec26a, 1).fillRect(x - 2, y - 2, 4, 4);
    }
    const [px, py] = toScreen(ptx, pty);
    g.fillStyle(0xffffff, 1).fillCircle(px, py, 3);
    g.lineStyle(1.5, 0x071210, 1).strokeCircle(px, py, 3);
  }
}
