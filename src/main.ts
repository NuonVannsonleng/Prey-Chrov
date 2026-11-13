import Phaser from 'phaser';
// Fonts ship with the game (SIL OFL): no third-party requests, and they work offline.
import '@fontsource/moul/400.css';
import '@fontsource/kantumruy-pro/400.css';
import '@fontsource/kantumruy-pro/600.css';
import '@fontsource/kantumruy-pro/700.css';
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

/**
 * A clear message instead of a silent freeze if something unexpected breaks at runtime.
 * Saves live in this browser and are untouched; reloading resumes from the last save.
 */
function showFatal(message: string): void {
  if (typeof document === 'undefined' || document.getElementById('fatal')) return;
  const box = document.createElement('div');
  box.id = 'fatal';
  box.setAttribute('role', 'alert');
  const text = document.createElement('div');
  text.textContent = `Something went wrong: ${message.slice(0, 200)}. Your saved journeys are kept in this browser — reloading continues from the last save.`;
  const reload = document.createElement('button');
  reload.textContent = 'Reload';
  reload.onclick = () => window.location.reload();
  const close = document.createElement('button');
  close.textContent = 'Dismiss';
  close.onclick = () => box.remove();
  box.append(text, reload, close);
  document.body.append(box);
}
window.addEventListener('error', (e) => showFatal(e.message || 'an error occurred'));
window.addEventListener('unhandledrejection', (e) => showFatal(String((e.reason as Error | undefined)?.message ?? e.reason ?? 'an error occurred')));

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
