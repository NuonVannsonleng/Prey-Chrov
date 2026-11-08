import Phaser from 'phaser';
import { DEBUG_HOOKS, GAME_HEIGHT, GAME_WIDTH } from './config';
import { Boot } from './scenes/Boot';
import { Menu } from './scenes/Menu';
import { Pause } from './scenes/Pause';
import { Preload } from './scenes/Preload';
import { UI } from './scenes/UI';
import { World } from './scenes/World';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#070d0c',
  roundPixels: true,
  antialias: true,
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false, fps: 60, fixedStep: true },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: { keyboard: true, mouse: true, touch: true },
  disableContextMenu: true,
  scene: [Boot, Preload, Menu, World, UI, Pause],
});

if (DEBUG_HOOKS) {
  (window as unknown as { __preyChrov: Phaser.Game }).__preyChrov = game;
}
