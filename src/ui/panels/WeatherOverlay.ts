import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../../config';
import { TEX } from '../../textures';

/**
 * Screen-space rain: pooled particle streaks, a cool gloom tint, and rare soft lightning
 * (a single gentle fade, never a strobe). Costs nothing when it isn't raining.
 */
export class WeatherOverlay {
  private readonly rain: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly gloom: Phaser.GameObjects.Rectangle;
  private readonly flash: Phaser.GameObjects.Rectangle;
  private raining = false;
  private nextFlashAt = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.gloom = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x203040, 0).setOrigin(0);
    this.rain = scene.add.particles(0, 0, TEX.rain, {
      x: { min: -60, max: GAME_WIDTH + 60 },
      y: -20,
      speedY: { min: 620, max: 820 },
      speedX: { min: -120, max: -80 },
      lifespan: 1100,
      quantity: 3,
      frequency: 14,
      alpha: { start: 0.55, end: 0.15 },
      scaleY: { min: 0.8, max: 1.3 },
      maxAliveParticles: 260,
      emitting: false,
    });
    this.flash = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xdde8ff, 0).setOrigin(0);
  }

  setRaining(raining: boolean): void {
    if (raining === this.raining) return;
    this.raining = raining;
    if (raining) this.rain.start();
    else this.rain.stop();
    this.scene.tweens.killTweensOf(this.gloom);
    this.scene.tweens.add({ targets: this.gloom, alpha: raining ? 0.16 : 0, duration: 1500 });
    this.nextFlashAt = this.scene.time.now + 12000;
  }

  update(time: number): void {
    if (!this.raining || time < this.nextFlashAt) return;
    this.nextFlashAt = time + 18000 + Math.random() * 24000;
    this.scene.tweens.killTweensOf(this.flash);
    this.flash.setAlpha(0.16);
    this.scene.tweens.add({ targets: this.flash, alpha: 0, duration: 700, ease: 'Sine.easeOut' });
  }
}
