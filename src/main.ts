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
import { InputDevices } from './systems/InputDevices';

/**
 * A clear message instead of a silent freeze if something unexpected breaks at runtime.
 * Saves live in this browser and are untouched; reloading resumes from the last save.
 */
let fatalDismissed = false;
function showFatal(message: string): void {
  // Once per page load: a repeating error must not bring the banner back after Dismiss.
  if (typeof document === 'undefined' || fatalDismissed || document.getElementById('fatal')) return;
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
  close.onclick = () => {
    fatalDismissed = true;
    box.remove();
    // Give the keyboard back to the game (Space/Enter must not press a banner button later).
    document.querySelector('canvas')?.focus();
  };
  // Keys pressed on the banner never reach its buttons by accident while playing.
  box.addEventListener('keydown', (e) => e.key !== 'Tab' && e.key !== 'Enter' && e.preventDefault());
  box.append(text, reload, close);
  document.body.append(box);
}

/** Browser noise that is not the game's fault: never alarm players with it. */
const BENIGN_ERROR = /ResizeObserver loop|^Script error\.?$/i;
window.addEventListener('error', (e) => {
  if (BENIGN_ERROR.test(e.message || '')) return;
  // Cross-origin / extension errors carry no error object or come from another origin.
  if (!e.error && !e.filename) return;
  if (e.filename && !e.filename.startsWith(window.location.origin)) return;
  showFatal(e.message || 'an error occurred');
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason as { name?: string; message?: string; stack?: string } | undefined;
  if (r?.name === 'AbortError' || r?.name === 'NotAllowedError') return;
  if (r?.stack && /(chrome|moz|safari)-extension:\/\//.test(r.stack)) return;
  showFatal(String(r?.message ?? e.reason ?? 'an error occurred'));
});

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

// M19: controllers and on-screen touch controls (they press the bound keys; scenes are unaware).
new InputDevices(game);

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
