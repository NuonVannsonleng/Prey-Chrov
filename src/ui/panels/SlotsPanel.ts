import Phaser from 'phaser';
import { CSS, FONTS, GAME_HEIGHT, GAME_WIDTH } from '../../config';
import { CAN_LOAD_SAVES, SAVE_SLOTS, currentSlot, deleteSlot, describeSaveStatus, inspectSave, setCurrentSlot, type SaveStatus } from '../../systems/Save';
import { Button } from '../components/Button';
import { ButtonList } from '../components/ButtonList';
import { ConfirmDialog } from '../components/ConfirmDialog';

/**
 * Journeys (M16): three save slots. Each row loads its journey (or starts a new one in an empty
 * slot) and can delete it after a confirmation. Slot 1 is the original save, so older saves
 * appear there.
 */
export class SlotsPanel {
  private readonly root: Phaser.GameObjects.Container;
  private readonly rows: Array<{ main: Button; del: Button; info: Phaser.GameObjects.Text }> = [];
  private readonly back: Button;
  private list: ButtonList | null = null;
  private dialog: ConfirmDialog | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    /** load: continue the slot's journey; otherwise start a new one in it. */
    private readonly onChoose: (slot: number, load: boolean) => void,
    private readonly onClose: () => void,
  ) {
    const cx = GAME_WIDTH / 2;
    const top = 150;
    const backdrop = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x040a09, 0.9).setOrigin(0).setInteractive();
    const title = scene.add.text(cx, top - 40, 'Journeys', { fontFamily: FONTS.ui, fontSize: '34px', fontStyle: '700', color: CSS.text }).setOrigin(0.5);
    const note = scene.add
      .text(cx, top, 'Each slot keeps its own journey. Saving happens when you sleep and at safe moments.', { fontFamily: FONTS.ui, fontSize: '15px', color: CSS.textDim })
      .setOrigin(0.5);
    const children: Phaser.GameObjects.GameObject[] = [backdrop, title, note];
    for (let slot = 1; slot <= SAVE_SLOTS; slot++) {
      const y = top + 80 + (slot - 1) * 110;
      const main = new Button(scene, cx - 90, y, { label: '', width: 380, height: 50, fontSize: 19, onActivate: () => this.choose(slot) });
      const del = new Button(scene, cx + 210, y, { label: 'Delete', width: 150, height: 50, fontSize: 18, onActivate: () => this.confirmDelete(slot) });
      const info = scene.add.text(cx - 270, y + 32, '', { fontFamily: FONTS.ui, fontSize: '14px', color: CSS.textDim }).setOrigin(0, 0);
      this.rows.push({ main, del, info });
      children.push(main, del, info);
    }
    this.back = new Button(scene, cx, top + 420, { label: 'Back', width: 220, height: 44, fontSize: 18, onActivate: () => this.close() });
    children.push(this.back);
    this.root = scene.add.container(0, 0, children).setDepth(5000).setVisible(false);
  }

  get isOpen(): boolean {
    return this.root.visible;
  }

  open(): void {
    this.root.setVisible(true);
    this.refresh();
  }

  /** Esc: closes a delete confirmation first, then the panel. */
  close(): void {
    if (!this.root.visible) return;
    if (this.dialog) {
      this.dialog.cancel();
      return;
    }
    this.root.setVisible(false);
    this.list?.destroy();
    this.list = null;
    this.onClose();
  }

  /** The row buttons for a slot (tests). */
  rowFor(slot: number): { main: Button; del: Button } | undefined {
    return this.rows[slot - 1];
  }

  private status(slot: number): SaveStatus {
    return inspectSave(undefined, undefined, slot);
  }

  private choose(slot: number): void {
    const s = this.status(slot);
    const load = CAN_LOAD_SAVES && s.kind === 'valid';
    // A slot holding an unreadable save is not silently overwritten: delete it first.
    if (!load && s.kind !== 'none') return;
    setCurrentSlot(slot);
    this.onChoose(slot, load);
  }

  private confirmDelete(slot: number): void {
    if (this.dialog || this.status(slot).kind === 'none') return;
    this.list?.destroy();
    this.list = null;
    const s = this.status(slot);
    this.dialog = new ConfirmDialog(
      this.scene,
      `Delete the journey in slot ${slot}${s.kind === 'valid' ? ` (day ${s.day})` : ''}?\nThis cannot be undone.`,
      'Delete',
      (ok) => {
        this.dialog = null;
        if (ok && !deleteSlot(slot)) this.rows[slot - 1]?.info.setText('Could not delete — browser storage is unavailable.').setColor(CSS.danger);
        else this.refresh();
        if (!ok || this.list === null) this.rebuildList();
      },
      6000,
    );
  }

  private refresh(): void {
    const active = currentSlot();
    this.rows.forEach(({ main, del, info }, i) => {
      const slot = i + 1;
      const s = this.status(slot);
      const mark = slot === active ? '  (current)' : '';
      if (s.kind === 'valid' && CAN_LOAD_SAVES) main.setLabel(`Slot ${slot}: continue day ${s.day}${mark}`).setEnabled(true);
      else if (s.kind === 'none') main.setLabel(`Slot ${slot}: start a new journey${mark}`).setEnabled(true);
      else main.setLabel(`Slot ${slot}: unavailable${mark}`).setEnabled(false);
      del.setEnabled(s.kind !== 'none' && s.kind !== 'unavailable');
      info.setText(s.kind === 'none' ? 'Empty' : describeSaveStatus(s)).setColor(CSS.textDim);
    });
    this.rebuildList();
  }

  private rebuildList(): void {
    if (!this.root.visible) return;
    this.list?.destroy();
    const buttons: Button[] = [];
    for (const r of this.rows) buttons.push(r.main, r.del);
    buttons.push(this.back);
    this.list = new ButtonList(this.scene, buttons);
  }
}
