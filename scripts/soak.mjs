// Long-session soak test: plays the built game like a restless player for SOAK_MINUTES (default 3;
// the M18 release check uses 20) and watches for errors, leaks and slowdowns.
// It walks, gathers, attacks, opens panels, pauses, answers story moments, travels far (chunk
// streaming), runs the clock through days, nights and the monsoon, dies and starts again, and
// reloads mid-session to continue from the save.
// Usage: npm run build && npm run soak        (SOAK_MINUTES=20 npm run soak for the full run)
import { mkdirSync, writeFileSync } from 'node:fs';
import { preview } from 'vite';
import { chromium } from 'playwright-core';

const MINUTES = Number(process.env.SOAK_MINUTES ?? 3);
const PORT = Number(process.env.SOAK_PORT ?? 4327);
const OUT = 'smoke-output';
mkdirSync(OUT, { recursive: true });

const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'silent' });
let browser;
for (const channel of ['msedge', 'chrome']) {
  try {
    browser = await chromium.launch({ channel, headless: true, args: ['--enable-precise-memory-info'] });
    break;
  } catch {
    /* try next */
  }
}
if (!browser) {
  console.error('No Edge/Chrome found for the soak test.');
  await server.close();
  process.exit(2);
}
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
page.on('response', (r) => r.status() >= 400 && errors.push(`http ${r.status()}: ${r.url()}`));

const sleep = (ms) => page.waitForTimeout(ms);
const active = (k) => page.evaluate((key) => window.__preyChrov?.scene.isActive(key) === true, k);
const until = async (fn, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(150);
  }
  return false;
};
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];

/** From the menu: keyboard only — Continue if there is a save, otherwise setup → Begin. */
async function enterWorld() {
  await until(() => active('Menu'));
  await sleep(500);
  await page.keyboard.press('Enter');
  await sleep(300);
  if (await page.evaluate(() => window.__preyChrov.scene.getScene('Menu').journeyPanel?.isOpen === true)) {
    await page.keyboard.press('ArrowUp');
    await sleep(100);
    await page.keyboard.press('Enter');
  }
  return until(() => active('World'));
}

const sample = () =>
  page.evaluate(() => {
    const g = window.__preyChrov;
    const w = g.scene.getScene('World');
    const on = g.scene.isActive('World');
    const mem = performance.memory;
    return {
      heapMB: mem ? Math.round((mem.usedJSHeapSize / 1048576) * 10) / 10 : null,
      world: on,
      display: on ? w.children.list.length : null,
      staticBodies: on ? w.physics.world.staticBodies.size : null,
      bodies: on ? w.physics.world.bodies.size : null,
      tweens: on ? w.tweens.getTweens().length : null,
      timers: on ? w.time.getAllEvents?.().length ?? null : null,
      enemies: on ? w.encounters.aliveCount : null,
      perfMs: on ? Math.round(w.perfMs * 100) / 100 : null,
      fps: Math.round(g.loop.actualFps),
      day: on ? w.clock.dayNumber : null,
    };
  });

console.log(`Soak: ${MINUTES} minute(s)…`);
await page.goto(`http://localhost:${PORT}/?debug&seed=777`);
await page.evaluate(() => localStorage.clear());
await page.reload();
if (!(await enterWorld())) {
  console.error('Could not start a journey.');
  process.exit(1);
}

const start = Date.now();
const endAt = start + MINUTES * 60_000;
const samples = [];
let deaths = 0;
let reloads = 0;
let nextSample = Date.now() + 20_000;
let nextTravel = Date.now() + 15_000;
let nextTopUp = Date.now() + 45_000;
const reloadAt = start + (MINUTES * 60_000) / 2;
let reloaded = false;

while (Date.now() < endAt) {
  // Death → Game Over → New journey (keyboard).
  if (await active('GameOver')) {
    deaths++;
    await sleep(800);
    await page.keyboard.press('Enter');
    await until(() => active('World'));
    continue;
  }
  if (await active('Ending')) {
    await sleep(2000);
    await page.keyboard.press('Enter');
    await until(() => active('World') || active('Menu'));
    if (await active('Menu')) await enterWorld();
    continue;
  }
  if (!(await active('World'))) {
    if (await active('Menu')) await enterWorld();
    else if (await active('Pause')) await page.keyboard.press('Escape');
    await sleep(300);
    continue;
  }
  // Story moments must be answered: take the focused (first available) option.
  if (await page.evaluate(() => window.__preyChrov.scene.getScene('UI').story != null)) {
    await sleep(400);
    await page.keyboard.press('Enter');
    await sleep(300);
    continue;
  }
  const act = pick(['walk', 'walk', 'walk', 'gather', 'attack', 'panel', 'pause', 'sprint']);
  if (act === 'walk' || act === 'sprint') {
    const keys = [pick(['KeyW', 'KeyS', 'KeyA', 'KeyD']), ...(Math.random() < 0.4 ? [pick(['KeyW', 'KeyS', 'KeyA', 'KeyD'])] : [])];
    if (act === 'sprint') keys.push('ShiftLeft');
    for (const k of keys) await page.keyboard.down(k);
    await sleep(rnd(400, 1800));
    for (const k of keys) await page.keyboard.up(k);
  } else if (act === 'gather') {
    await page.keyboard.down('KeyE');
    await sleep(rnd(600, 1600));
    await page.keyboard.up('KeyE');
  } else if (act === 'attack') {
    await page.keyboard.press('Space');
    await sleep(300);
  } else if (act === 'panel') {
    const k = pick(['KeyI', 'KeyC', 'KeyJ', 'KeyM', 'KeyK']);
    await page.keyboard.press(k);
    await sleep(rnd(300, 900));
    await page.keyboard.press('Escape');
    await sleep(200);
  } else if (act === 'pause') {
    await page.keyboard.press('Escape');
    await sleep(400);
    if (await active('Pause')) await page.keyboard.press('Escape');
    await sleep(300);
  }
  if (Date.now() >= nextTravel) {
    nextTravel = Date.now() + 15_000;
    // Travel far (chunk streaming) and move the clock on two hours (days, nights, monsoon).
    await page.evaluate(([dx, dy]) => {
      const w = window.__preyChrov.scene.getScene('World');
      if (!w.scene.isActive() || w.busy) return;
      w.player.body.reset(w.player.x + dx, w.player.y + dy);
      w.clock.totalSeconds += 40;
      w.nextWeatherAt = 0;
    }, [rnd(-2400, 2400), rnd(-2400, 2400)]);
  }
  if (Date.now() >= nextTopUp) {
    nextTopUp = Date.now() + 45_000;
    // A real player eats and drinks; keep most sessions long enough to matter.
    await page.evaluate(() => {
      const w = window.__preyChrov.scene.getScene('World');
      if (!w.scene.isActive() || w.busy) return;
      const s = w.survival.stats;
      s.hunger = Math.max(s.hunger, 70);
      s.thirst = Math.max(s.thirst, 70);
    });
  }
  if (!reloaded && Date.now() >= reloadAt) {
    reloaded = true;
    reloads++;
    // Mid-session refresh: pausing autosaves, then the journey continues from the save.
    await page.keyboard.press('Escape');
    await sleep(500);
    await page.reload();
    await enterWorld();
  }
  if (Date.now() >= nextSample) {
    nextSample = Date.now() + 60_000;
    const s = { t: Math.round((Date.now() - start) / 1000), ...(await sample()) };
    samples.push(s);
    console.log(JSON.stringify(s));
  }
}

const last = { t: Math.round((Date.now() - start) / 1000), ...(await sample()) };
samples.push(last);
const worldSamples = samples.filter((s) => s.world);
const warm = worldSamples[Math.min(1, worldSamples.length - 1)] ?? last;
const heapOk = worldSamples.every((s) => s.heapMB === null || warm.heapMB === null || s.heapMB < Math.max(warm.heapMB * 2, warm.heapMB + 80));
const displayOk = worldSamples.every((s) => s.display < Math.max(warm.display * 3, warm.display + 400));
const bodiesOk = worldSamples.every((s) => s.bodies <= 64);
const perfOk = worldSamples.every((s) => s.perfMs < 8);
const report = { minutes: MINUTES, deaths, reloads, errors: errors.slice(0, 10), heapOk, displayOk, bodiesOk, perfOk, samples };
writeFileSync(`${OUT}/soak.json`, JSON.stringify(report, null, 2));
const ok = errors.length === 0 && heapOk && displayOk && bodiesOk && perfOk;
console.log(`\nSoak ${ok ? 'PASSED' : 'FAILED'}: ${MINUTES} min, ${deaths} death(s), ${reloads} reload(s), ${errors.length} error(s); heap ${heapOk ? 'stable' : 'GROWING'}, display list ${displayOk ? 'bounded' : 'GROWING'}, bodies ${bodiesOk ? 'bounded' : 'HIGH'}, update ${perfOk ? '< 8 ms' : 'SLOW'}. Report: ${OUT}/soak.json`);
await browser.close();
await server.close();
process.exit(ok ? 0 : 1);
