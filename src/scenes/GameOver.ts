import Phaser from 'phaser';
import { CSS, FONTS, GAME_HEIGHT, GAME_WIDTH, SCENES } from '../config';
import { describeSaveStatus, inspectSave } from '../systems/Save';
import { Button } from '../ui/components/Button';
import { ButtonList } from '../ui/components/ButtonList';

export interface GameOverData {
  day: number;
  time: string;
  cause: 'starvation' | 'dehydration' | 'injury' | 'wildlife' | 'spirit' | 'poison' | 'cold';
}

const CAUSE_TEXT: Record<GameOverData['cause'], string> = {
  starvation: 'Hunger took you. Berries and roasted bamboo shoots keep you fed.',
  dehydration: 'Thirst took you. Drink at the water often — it is always free.',
  injury: 'Your wounds were too much. Raw food can hurt; cook it at a campfire.',
  wildlife: 'An animal of the forest took you. Watch for the wind-up, then sidestep — or simply keep your distance.',
  spirit: 'The night took you. Spirits will not enter firelight: carry a torch and stay near your campfire.',
  cold: 'The monsoon chill took you. In the rain, stay close to a campfire or under your shelter to keep warm.',
  poison: 'Venom took you. Poison wears off with time — rest and keep your distance from vipers.',
};

/** Short death summary with restart options. Never deletes the save. */
export class GameOver extends Phaser.Scene {
  constructor() {
    super(SCENES.gameOver);
  }

  create(data: GameOverData): void {
    const cx = GAME_WIDTH / 2;
    this.input.enabled = true;
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0a0604, 1).setOrigin(0);
    this.add
      .text(cx, 150, 'The forest kept you', { fontFamily: FONTS.ui, fontSize: '44px', fontStyle: '700', color: CSS.text })
      .setOrigin(0.5);
    const daysCompleted = Math.max(0, (data?.day ?? 1) - 1);
    this.add
      .text(cx, 215, `You fell on day ${data?.day ?? 1} at ${data?.time ?? '--:--'}  ·  ${daysCompleted} full day${daysCompleted === 1 ? '' : 's'} survived`, {
        fontFamily: FONTS.ui,
        fontSize: '20px',
        color: CSS.gold,
      })
      .setOrigin(0.5);
    this.add
      .text(cx, 255, CAUSE_TEXT[data?.cause ?? 'injury'], { fontFamily: FONTS.ui, fontSize: '17px', color: CSS.textDim })
      .setOrigin(0.5);

    const save = inspectSave();
    const canLoad = save.kind === 'valid';
    const fresh = new Button(this, cx, 350, { label: 'New journey', width: 320, onActivate: () => this.go(SCENES.world, {}) });
    const load = new Button(this, cx, 420, {
      label: 'Load last sleep',
      width: 320,
      enabled: canLoad,
      onActivate: () => this.go(SCENES.world, { load: true }),
    });
    const menu = new Button(this, cx, 490, { label: 'Main menu', width: 320, onActivate: () => this.go(SCENES.menu) });
    this.add
      .text(cx, 535, canLoad ? describeSaveStatus(save) : 'No save to load — sleep in a shelter to save your journey.', {
        fontFamily: FONTS.ui,
        fontSize: '14px',
        color: CSS.textDim,
      })
      .setOrigin(0.5);
    new ButtonList(this, [fresh, load, menu]);
    this.cameras.main.fadeIn(600, 10, 6, 4);
  }

  private go(scene: string, data?: object): void {
    this.input.enabled = false;
    this.scene.start(scene, data);
  }
}
