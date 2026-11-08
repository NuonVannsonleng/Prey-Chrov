import Phaser from 'phaser';
import { CSS, FONT_LOAD_TIMEOUT_MS, SCENES } from '../config';

/** Waits (briefly) for web fonts so Phaser text renders with Moul / Kantumruy Pro. */
export class Boot extends Phaser.Scene {
  constructor() {
    super(SCENES.boot);
  }

  create(): void {
    const label = this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'Loading…', { fontFamily: 'sans-serif', fontSize: '20px', color: CSS.textDim })
      .setOrigin(0.5);

    void loadFonts().then(() => {
      label.destroy();
      if (this.scene.isActive()) this.scene.start(SCENES.preload);
    });
  }
}

async function loadFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  const loads = Promise.all([
    document.fonts.load('96px "Moul"', 'ព្រៃជ្រៅ'),
    document.fonts.load('24px "Kantumruy Pro"', 'Prey Chrov ព្រៃ'),
    document.fonts.load('600 24px "Kantumruy Pro"', 'Prey Chrov'),
  ]).then(
    () => undefined,
    () => undefined,
  );
  const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, FONT_LOAD_TIMEOUT_MS));
  await Promise.race([loads, timeout]);
}
