import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { LIGHT_TEXTURE_SIZE, TEX } from '../textures';

export interface LightSource {
  x: number;
  y: number;
  radius: number;
  /** Warm glow strength 0..1 (fire/torch); 0 for the player's faint night vision. */
  warmth: number;
}

const MAX_LIGHTS = 24;
const NIGHT_COLOR = 0x050b16;

/**
 * Darkness overlay: a camera-sized RenderTexture filled with night colour each frame,
 * with soft holes erased at light positions, plus additive warm glows for fires.
 * Skips all work in daylight.
 */
export class Lighting {
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private readonly eraser: Phaser.GameObjects.Image;
  private readonly glows: Phaser.GameObjects.Image[] = [];
  private readonly lights: LightSource[] = [];
  private count = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    zoom: number,
  ) {
    const w = Math.ceil(GAME_WIDTH / zoom) + 8;
    const h = Math.ceil(GAME_HEIGHT / zoom) + 8;
    this.rt = scene.add.renderTexture(0, 0, w, h).setOrigin(0).setDepth(DEPTH.darkness).setVisible(false);
    this.eraser = scene.make.image({ x: 0, y: 0, key: TEX.light }, false);
    for (let i = 0; i < MAX_LIGHTS; i++) {
      this.lights.push({ x: 0, y: 0, radius: 0, warmth: 0 });
      this.glows.push(
        scene.add
          .image(0, 0, TEX.light)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(0xe8893a)
          .setDepth(DEPTH.darkness + 1)
          .setVisible(false),
      );
    }
  }

  /** Call once per frame before adding lights. */
  begin(): void {
    this.count = 0;
  }

  add(x: number, y: number, radius: number, warmth: number): void {
    const l = this.lights[this.count];
    if (!l || radius <= 0) return;
    l.x = x;
    l.y = y;
    l.radius = radius;
    l.warmth = warmth;
    this.count++;
  }

  /** Redraws the overlay for the given darkness (0 = day, 1 = black). */
  render(darkness: number, timeMs: number): void {
    const visible = darkness > 0.01;
    this.rt.setVisible(visible);
    if (!visible) {
      for (const g of this.glows) g.setVisible(false);
      return;
    }
    const view = this.scene.cameras.main.worldView;
    const ox = Math.floor(view.x) - 4;
    const oy = Math.floor(view.y) - 4;
    this.rt.setPosition(ox, oy);
    this.rt.clear();
    this.rt.fill(NIGHT_COLOR, darkness);

    for (let i = 0; i < this.glows.length; i++) {
      const glow = this.glows[i];
      const l = this.lights[i];
      if (!glow || !l || i >= this.count) {
        glow?.setVisible(false);
        continue;
      }
      const flicker = l.warmth > 0 ? 1 + Math.sin(timeMs / 90 + i * 1.7) * 0.025 + Math.sin(timeMs / 37 + i) * 0.015 : 1;
      const r = l.radius * flicker;
      this.eraser.setScale((r * 2) / LIGHT_TEXTURE_SIZE);
      this.rt.erase(this.eraser, l.x - ox, l.y - oy);
      if (l.warmth > 0) {
        glow
          .setVisible(true)
          .setPosition(l.x, l.y)
          .setScale((r * 1.4) / LIGHT_TEXTURE_SIZE)
          .setAlpha(0.22 * l.warmth * darkness);
      } else glow.setVisible(false);
    }
  }

  /** Current overlay alpha at a world point is not needed by gameplay; expose for tests/debug. */
  get visible(): boolean {
    return this.rt.visible;
  }
}
