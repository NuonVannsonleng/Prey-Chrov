import Phaser from 'phaser';
import { CSS, FONTS, GAME_HEIGHT, GAME_WIDTH } from '../../config';
import { getSettings, updateSettings, type Settings } from '../../systems/Settings';
import { Button } from '../components/Button';
import { ButtonList } from '../components/ButtonList';

type Row =
  | { kind: 'volume'; key: 'masterVolume' | 'sfxVolume' | 'ambienceVolume'; label: string }
  | { kind: 'toggle'; key: 'reducedMotion' | 'reducedFlash' | 'showHints'; label: string };

const ROWS: Row[] = [
  { kind: 'volume', key: 'masterVolume', label: 'Master volume' },
  { kind: 'volume', key: 'sfxVolume', label: 'Effects volume' },
  { kind: 'volume', key: 'ambienceVolume', label: 'Ambience volume' },
  { kind: 'toggle', key: 'reducedMotion', label: 'Reduced motion' },
  { kind: 'toggle', key: 'reducedFlash', label: 'Reduced flashes' },
  { kind: 'toggle', key: 'showHints', label: 'Show help on start' },
];

/**
 * Settings overlay (keyboard + mouse). Volumes step by 10% and wrap; toggles flip.
 * Changes apply immediately and persist (settings are separate from the game save).
 */
export class SettingsPanel {
  private readonly root: Phaser.GameObjects.Container;
  private readonly buttons: Button[] = [];
  private list: ButtonList | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onClose: () => void,
  ) {
    const cx = GAME_WIDTH / 2;
    const top = GAME_HEIGHT / 2 - 250;
    const backdrop = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x040a09, 0.85).setOrigin(0).setInteractive();
    const title = scene.add.text(cx, top, 'Settings', { fontFamily: FONTS.ui, fontSize: '36px', fontStyle: '700', color: CSS.text }).setOrigin(0.5);
    const note = scene.add
      .text(cx, top + 40, 'Enter / click to change · Esc to go back', { fontFamily: FONTS.ui, fontSize: '14px', color: CSS.textDim })
      .setOrigin(0.5);
    const children: Phaser.GameObjects.GameObject[] = [backdrop, title, note];
    ROWS.forEach((row, i) => {
      const b = new Button(scene, cx, top + 100 + i * 56, { label: '', width: 420, height: 46, onActivate: () => this.change(row) });
      this.buttons.push(b);
      children.push(b);
    });
    const back = new Button(scene, cx, top + 100 + ROWS.length * 56 + 14, { label: 'Back', width: 420, height: 46, onActivate: () => this.close() });
    this.buttons.push(back);
    children.push(back);
    this.root = scene.add.container(0, 0, children).setDepth(5000).setVisible(false);
    this.refresh();
  }

  get isOpen(): boolean {
    return this.root.visible;
  }

  open(): void {
    this.root.setVisible(true);
    this.refresh();
    this.list = new ButtonList(this.scene, this.buttons);
  }

  close(): void {
    if (!this.root.visible) return;
    this.root.setVisible(false);
    this.list?.destroy();
    this.list = null;
    this.onClose();
  }

  private change(row: Row): void {
    const s = getSettings();
    if (row.kind === 'volume') {
      const next = Math.round(s[row.key] * 10 + 1) % 11;
      updateSettings({ [row.key]: next / 10 } as Partial<Settings>);
    } else {
      updateSettings({ [row.key]: !s[row.key] } as Partial<Settings>);
    }
    this.refresh();
  }

  private refresh(): void {
    const s = getSettings();
    ROWS.forEach((row, i) => {
      const value = row.kind === 'volume' ? `${Math.round(s[row.key] * 100)}%` : s[row.key] ? 'On' : 'Off';
      this.buttons[i]?.setLabel(`${row.label}:  ${value}`);
    });
  }
}
