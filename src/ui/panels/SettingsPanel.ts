import Phaser from 'phaser';
import { CSS, FONTS, GAME_HEIGHT, GAME_WIDTH } from '../../config';
import { ACTIONS, ACTION_LABELS, DEFAULT_KEYS, bindKey, getSettings, isBindable, keyLabel, updateSettings, type Action, type Settings } from '../../systems/Settings';
import { oncePerKeyEvent } from '../../utils/keys';
import { Button } from '../components/Button';
import { ButtonList } from '../components/ButtonList';

type VolumeKey = 'masterVolume' | 'sfxVolume' | 'ambienceVolume' | 'musicVolume';
type ToggleKey = 'reducedMotion' | 'reducedFlash' | 'highContrast' | 'largeText' | 'showHints';
type Row = { kind: 'volume'; key: VolumeKey; label: string } | { kind: 'toggle'; key: ToggleKey; label: string } | { kind: 'key'; action: Action };
type Tab = 'audio' | 'display' | 'controls';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'audio', label: 'Audio' },
  { id: 'display', label: 'Display & access' },
  { id: 'controls', label: 'Controls' },
];
const AUDIO: Row[] = [
  { kind: 'volume', key: 'masterVolume', label: 'Master volume' },
  { kind: 'volume', key: 'sfxVolume', label: 'Effects volume' },
  { kind: 'volume', key: 'ambienceVolume', label: 'Ambience volume' },
  { kind: 'volume', key: 'musicVolume', label: 'Music volume' },
];
const DISPLAY: Row[] = [
  { kind: 'toggle', key: 'reducedMotion', label: 'Reduced motion' },
  { kind: 'toggle', key: 'reducedFlash', label: 'Reduced flashes' },
  { kind: 'toggle', key: 'highContrast', label: 'High contrast' },
  { kind: 'toggle', key: 'largeText', label: 'Large text' },
  { kind: 'toggle', key: 'showHints', label: 'Show help on start' },
];
const CONTROLS: Row[] = ACTIONS.map((a) => ({ kind: 'key' as const, action: a }));

/**
 * Settings (main menu and pause): Audio · Display & accessibility · Controls. Everything applies
 * at once and persists separately from saves. Controls: pick an action, press its new key (Esc
 * cancels); a key already in use swaps with it, and reserved keys are refused with a reason.
 */
export class SettingsPanel {
  private readonly root: Phaser.GameObjects.Container;
  private readonly tabButtons: Button[] = [];
  private readonly rows = new Map<Tab, Array<{ row: Row; button: Button }>>();
  private readonly back: Button;
  private readonly reset: Button;
  private readonly note: Phaser.GameObjects.Text;
  private tab: Tab = 'audio';
  private list: ButtonList | null = null;
  private capturing: Action | null = null;
  private readonly captureHandler = oncePerKeyEvent((e: KeyboardEvent) => this.onCapture(e));

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onClose: () => void,
  ) {
    const cx = GAME_WIDTH / 2;
    const top = 70;
    const backdrop = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x040a09, 0.9).setOrigin(0).setInteractive();
    const title = scene.add.text(cx, top, 'Settings', { fontFamily: FONTS.ui, fontSize: '34px', fontStyle: '700', color: CSS.text }).setOrigin(0.5);
    this.note = scene.add.text(cx, top + 36, '', { fontFamily: FONTS.ui, fontSize: '14px', color: CSS.textDim }).setOrigin(0.5);
    const children: Phaser.GameObjects.GameObject[] = [backdrop, title, this.note];
    TABS.forEach((t, i) => {
      const b = new Button(scene, cx - 230 + i * 230, top + 84, { label: t.label, width: 210, height: 40, fontSize: 17, onActivate: () => this.setTab(t.id) });
      this.tabButtons.push(b);
      children.push(b);
    });
    const mk = (tab: Tab, rows: Row[], twoCols: boolean) => {
      const list: Array<{ row: Row; button: Button }> = [];
      rows.forEach((row, i) => {
        const col = twoCols ? (i < Math.ceil(rows.length / 2) ? 0 : 1) : 0;
        const r = twoCols ? i % Math.ceil(rows.length / 2) : i;
        const x = twoCols ? cx - 200 + col * 400 : cx;
        const y = top + 150 + r * (twoCols ? 42 : 54);
        const b = new Button(scene, x, y, { label: '', width: twoCols ? 380 : 440, height: twoCols ? 36 : 46, fontSize: twoCols ? 15 : 20, onActivate: () => this.change(row) });
        list.push({ row, button: b });
        children.push(b);
      });
      this.rows.set(tab, list);
    };
    mk('audio', AUDIO, false);
    mk('display', DISPLAY, false);
    mk('controls', CONTROLS, true);
    this.reset = new Button(scene, cx - 120, GAME_HEIGHT - 70, { label: 'Reset controls', width: 220, height: 42, fontSize: 17, onActivate: () => this.resetKeys() });
    this.back = new Button(scene, cx + 120, GAME_HEIGHT - 70, { label: 'Back', width: 220, height: 42, fontSize: 17, onActivate: () => this.close() });
    children.push(this.reset, this.back);
    this.root = scene.add.container(0, 0, children).setDepth(5000).setVisible(false);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.input.keyboard?.off('keydown', this.captureHandler));
    this.setTab('audio');
  }

  get isOpen(): boolean {
    return this.root.visible;
  }

  /** True while waiting for a key to bind (Esc then cancels the capture, not the panel). */
  get isCapturing(): boolean {
    return this.capturing !== null;
  }

  open(): void {
    this.root.setVisible(true);
    this.setTab(this.tab);
  }

  close(): void {
    if (!this.root.visible) return;
    if (this.capturing) {
      this.endCapture('Cancelled.');
      return;
    }
    this.root.setVisible(false);
    this.list?.destroy();
    this.list = null;
    this.onClose();
  }

  /** The button for a setting (tests and hints). */
  buttonFor(key: VolumeKey | ToggleKey | Action): Button | undefined {
    for (const list of this.rows.values()) {
      const hit = list.find(({ row }) => (row.kind === 'key' ? row.action === key : row.key === key));
      if (hit) return hit.button;
    }
    return undefined;
  }

  setTab(tab: Tab): void {
    this.tab = tab;
    for (const [t, list] of this.rows) for (const { button } of list) button.setVisible(t === tab);
    this.reset.setVisible(tab === 'controls');
    TABS.forEach((t, i) => this.tabButtons[i]?.setLabel(t.id === tab ? `▸ ${t.label} ◂` : t.label));
    this.note.setText(
      tab === 'controls'
        ? 'Choose an action, then press its new key. Esc cancels. Escape, Tab, 1–6, F3 and Ctrl/Alt are reserved.'
        : 'Enter / click to change · Esc to go back',
    );
    this.refresh();
    if (this.root.visible) this.rebuildList();
  }

  private rebuildList(): void {
    this.list?.destroy();
    const visible = (this.rows.get(this.tab) ?? []).map((r) => r.button);
    this.list = new ButtonList(this.scene, [...this.tabButtons, ...visible, ...(this.tab === 'controls' ? [this.reset] : []), this.back]);
  }

  private change(row: Row): void {
    const s = getSettings();
    if (row.kind === 'volume') updateSettings({ [row.key]: (Math.round(s[row.key] * 10 + 1) % 11) / 10 } as Partial<Settings>);
    else if (row.kind === 'toggle') updateSettings({ [row.key]: !s[row.key] } as Partial<Settings>);
    else this.beginCapture(row.action);
    this.refresh();
  }

  private beginCapture(action: Action): void {
    this.capturing = action;
    this.list?.destroy();
    this.list = null;
    this.note.setText(`Press the new key for "${ACTION_LABELS[action]}" (Esc cancels)`).setColor(CSS.gold);
    this.buttonFor(action)?.setLabel(`${ACTION_LABELS[action]}:  …`);
    // Listen from the next event on, so the Enter/click that chose the action isn't captured.
    this.scene.time.delayedCall(0, () => this.scene.input.keyboard?.on('keydown', this.captureHandler));
  }

  private onCapture(e: KeyboardEvent): void {
    if (!this.capturing) return;
    e.preventDefault();
    if (e.code === 'Escape') {
      this.endCapture('Cancelled.');
      return;
    }
    if (!isBindable(e.code)) {
      this.note.setText(`"${keyLabel(e.code)}" is reserved — choose another key (Esc cancels)`).setColor('#d9644a');
      return;
    }
    const action = this.capturing;
    bindKey(action, e.code);
    this.endCapture(`${ACTION_LABELS[action]} is now ${keyLabel(e.code)}.`);
  }

  private endCapture(message: string): void {
    this.capturing = null;
    this.scene.input.keyboard?.off('keydown', this.captureHandler);
    this.refresh();
    this.note.setText(message).setColor(CSS.textDim);
    this.scene.time.delayedCall(0, () => this.rebuildList());
  }

  private resetKeys(): void {
    updateSettings({ keys: { ...DEFAULT_KEYS } });
    this.note.setText('Controls reset to defaults.').setColor(CSS.textDim);
    this.refresh();
  }

  private refresh(): void {
    const s = getSettings();
    for (const list of this.rows.values()) {
      for (const { row, button } of list) {
        if (row.kind === 'volume') button.setLabel(`${row.label}:  ${Math.round(s[row.key] * 100)}%`);
        else if (row.kind === 'toggle') button.setLabel(`${row.label}:  ${s[row.key] ? 'On' : 'Off'}`);
        else if (this.capturing !== row.action) button.setLabel(`${ACTION_LABELS[row.action]}:  ${keyLabel(s.keys[row.action])}`);
      }
    }
  }
}
