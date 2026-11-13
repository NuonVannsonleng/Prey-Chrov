import Phaser from 'phaser';
import { DEBUG_HOOKS, GAME_HEIGHT, GAME_WIDTH, applyContrast } from './config';
import { Boot } from './scenes/Boot';
import { Ending } from './scenes/Ending';
import { GameOver } from './scenes/GameOver';
import { Menu } from './scenes/Menu';
import { Pause } from './scenes/Pause';
import { Preload } from './scenes/Preload';
import { UI } from './scenes/UI';
import { World } from './scenes/World';
import { audio } from './systems/Audio';
import { getSettings, onSettings } from './systems/Settings';
import { gameEvents } from './systems/GameEvents';

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
  scene: [Boot, Preload, Menu, World, UI, Pause, GameOver, Ending],
});

// Procedural audio: unlocked by the first click/key (autoplay policy), fed by typed events.
audio.install();
gameEvents.on('sfx', (id) => audio.play(id));
gameEvents.on('ambience', (levels) => audio.setAmbience(levels));
gameEvents.on('audio:duck', (on) => audio.duck(on));
gameEvents.on('music', (id) => audio.stinger(id));
// High contrast recolours text before scenes build their UI, and again whenever it changes.
applyContrast(getSettings().highContrast);
onSettings((s) => applyContrast(s.highContrast));

if (DEBUG_HOOKS) {
  (window as unknown as { __preyChrov: Phaser.Game; __preyAudio: typeof audio }).__preyChrov = game;
  (window as unknown as { __preyAudio: typeof audio }).__preyAudio = audio;
}
