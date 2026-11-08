// Headless browser smoke test: builds nothing, serves ./dist via `vite preview`,
// drives the real game in an installed Edge/Chrome and checks M1 acceptance criteria.
// Usage: npm run build && npm run smoke
import { mkdirSync } from 'node:fs';
import { preview } from 'vite';
import { chromium } from 'playwright-core';

const OUT = 'smoke-output';
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const server = await preview({ preview: { port: 4317, strictPort: true }, logLevel: 'silent' });
const url = 'http://localhost:4317/?debug';

let browser;
for (const channel of ['msedge', 'chrome']) {
  try {
    browser = await chromium.launch({ channel, headless: true });
    break;
  } catch {
    /* try next */
  }
}
if (!browser) {
  console.error('No Edge/Chrome found for smoke test.');
  await server.close();
  process.exit(2);
}

const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('response', (r) => {
  if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

const sleep = (ms) => page.waitForTimeout(ms);
const sceneActive = (key) => page.evaluate((k) => window.__preyChrov.scene.isActive(k), key);
const waitScene = (key, timeout = 8000) =>
  page.waitForFunction((k) => window.__preyChrov?.scene?.isActive(k), key, { timeout }).then(
    () => true,
    () => false,
  );
const clickGame = async (gx, gy) => {
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box.x + (gx / 1280) * box.width, box.y + (gy / 720) * box.height);
};
const player = () =>
  page.evaluate(() => {
    const p = window.__preyChrov.scene.getScene('World').player;
    return { x: p.x, y: p.y, vx: p.body.velocity.x, vy: p.body.velocity.y };
  });
const hold = async (keys, ms, sampleSpeed = false) => {
  for (const k of keys) await page.keyboard.down(k);
  let maxSpeed = 0;
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await sleep(50);
    if (sampleSpeed) {
      const p = await player();
      maxSpeed = Math.max(maxSpeed, Math.hypot(p.vx, p.vy));
    }
  }
  for (const k of keys) await page.keyboard.up(k);
  await sleep(250);
  return maxSpeed;
};
const teleport = (x, y) =>
  page.evaluate(
    ([x, y]) => {
      const p = window.__preyChrov.scene.getScene('World').player;
      p.body.reset(x, y);
    },
    [x, y],
  );

try {
  await page.goto(url);
  check('menu opens', await waitScene('Menu', 15000));
  await sleep(900);
  await page.screenshot({ path: `${OUT}/01-menu.png` });

  const contDisabled = await page.evaluate(() => {
    const menu = window.__preyChrov.scene.getScene('Menu');
    const buttons = menu.children.list.filter((o) => typeof o.activate === 'function');
    return buttons.length === 2 && buttons[0].enabled === true && buttons[1].enabled === false;
  });
  check('Play enabled, Continue disabled without save', contDisabled);

  await clickGame(640, 430);
  check('Play starts World + UI', (await waitScene('World')) && (await waitScene('UI')));
  await sleep(600);
  await page.screenshot({ path: `${OUT}/02-world.png` });

  const start = await player();
  await hold(['KeyD'], 700);
  const afterRight = await player();
  check('D moves right', afterRight.x > start.x + 40, `dx=${(afterRight.x - start.x).toFixed(1)}`);
  await hold(['KeyA'], 700);
  await hold(['KeyS'], 500);
  await hold(['KeyW'], 500);

  const straight = await hold(['KeyA'], 900, true);
  const diag = await hold(['KeyW', 'KeyD'], 900, true);
  check('diagonal not faster than straight', diag <= straight + 0.5, `straight=${straight.toFixed(1)} diag=${diag.toFixed(1)}`);
  const sprint = await hold(['ShiftLeft', 'KeyS'], 900, true);
  check('Shift sprint is faster', sprint > straight * 1.4, `sprint=${sprint.toFixed(1)}`);

  // Collisions on all four sides of an interior tree/rock.
  const solid = await page.evaluate(() => {
    const w = window.__preyChrov.scene.getScene('World');
    const zones = w.props.solids.getChildren();
    const z = zones.find((o) => o.x > 200 && o.x < 1700 && o.y > 200 && o.y < 1100) ?? zones[0];
    return { x: z.x, y: z.y, w: z.body.width, h: z.body.height };
  });
  const dirs = [
    { name: 'left→right', from: [solid.x - 40, solid.y + 9], key: 'KeyD', blocked: (p) => p.x < solid.x },
    { name: 'right→left', from: [solid.x + 40, solid.y + 9], key: 'KeyA', blocked: (p) => p.x > solid.x },
    { name: 'top→down', from: [solid.x, solid.y - 30], key: 'KeyS', blocked: (p) => p.y < solid.y + 5 },
    { name: 'bottom→up', from: [solid.x, solid.y + 40], key: 'KeyW', blocked: (p) => p.y > solid.y },
  ];
  for (const d of dirs) {
    await teleport(d.from[0], d.from[1]);
    await sleep(120);
    await hold([d.key], 800);
    const p = await player();
    check(`collision ${d.name}`, d.blocked(p), `player=${p.x.toFixed(1)},${p.y.toFixed(1)} solid=${solid.x.toFixed(1)},${solid.y.toFixed(1)}`);
  }

  const cam = await page.evaluate(() => {
    const w = window.__preyChrov.scene.getScene('World');
    const view = w.cameras.main.worldView;
    const p = w.player;
    return view.contains(p.x, p.y - 16);
  });
  check('player inside camera view', cam);

  await page.keyboard.press('F3');
  await sleep(400);
  await page.screenshot({ path: `${OUT}/03-debug.png` });
  await page.keyboard.press('F3');

  await page.keyboard.press('Escape');
  check('Esc opens pause', await waitScene('Pause', 3000));
  const paused = await page.evaluate(() => window.__preyChrov.scene.isPaused('World'));
  check('World simulation paused', paused);
  const pPaused1 = await player();
  await page.keyboard.down('KeyD');
  await sleep(400);
  await page.keyboard.up('KeyD');
  const pPaused2 = await player();
  check('no movement while paused', pPaused1.x === pPaused2.x);
  await page.screenshot({ path: `${OUT}/04-pause.png` });
  await sleep(250);
  await page.keyboard.press('Escape');
  await sleep(300);
  check('Esc resumes', (await sceneActive('World')) && !(await sceneActive('Pause')));
  await hold(['KeyS'], 300);
  const afterResume = await player();
  await sleep(300);
  const settled = await player();
  check('no stuck keys after resume', Math.abs(settled.vx) < 1 && Math.abs(settled.vy) < 1 && afterResume.y >= pPaused2.y);

  // Menu round trips: listener counts must stay flat.
  const counts = [];
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('Escape');
    await waitScene('Pause', 3000);
    await sleep(200);
    await clickGame(640, 400);
    const menuOk = await waitScene('Menu');
    await sleep(500);
    await clickGame(640, 430);
    const worldOk = await waitScene('World');
    await sleep(500);
    counts.push(
      await page.evaluate(() => {
        const g = window.__preyChrov;
        const kb = g.scene.getScene('World').input.keyboard;
        return {
          ok: true,
          blur: g.events.listenerCount('blur'),
          hidden: g.events.listenerCount('hidden'),
          esc: kb.listenerCount('keydown-ESC'),
          keys: kb.keys.filter(Boolean).length,
          bodies: g.scene.getScene('World').physics.world.staticBodies.size,
          displayList: g.scene.getScene('World').children.list.length,
        };
      }),
    );
    check(`menu round trip ${i + 1}`, menuOk && worldOk);
  }
  const first = JSON.stringify(counts[0]);
  check('no listener/object growth across restarts', counts.every((c) => JSON.stringify(c) === first), first);

  check('no console errors', errors.length === 0, errors.slice(0, 5).join(' | '));
} catch (e) {
  check('smoke run completed', false, String(e));
} finally {
  await browser.close();
  await server.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots in ./${OUT}/`);
process.exit(failed.length ? 1 : 0);
