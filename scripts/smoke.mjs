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

  // ---------- M2: gathering, pickups, inventory ----------
  const evalW = (fnBody, arg) =>
    page.evaluate(
      ({ fnBody, arg }) => {
        const w = window.__preyChrov.scene.getScene('World');
        const ui = window.__preyChrov.scene.getScene('UI');
        return new Function('w', 'ui', 'arg', fnBody)(w, ui, arg);
      },
      { fnBody, arg },
    );
  const count = (id) => evalW('return w.inventory.inventory.count(arg);', id);
  const nearestNode = (resId) =>
    evalW(
      'const p = w.player;' +
        'const list = w.gathering.nodes.filter((n) => n.def.id === arg && !n.depleted && n.prop.y > 200);' +
        'list.sort((a, b) => Math.hypot(a.prop.x - p.x, a.prop.y - p.y) - Math.hypot(b.prop.x - p.x, b.prop.y - p.y));' +
        'const n = list[0];' +
        'return { idx: w.gathering.nodes.indexOf(n), x: n.prop.x, y: n.prop.y };',
      resId,
    );
  const nodeState = (idx) =>
    evalW('const n = w.gathering.nodes[arg]; return { depleted: n.depleted, hp: n.hp, body: n.zone.body.enable };', idx);
  const staticBodies = () => evalW('return w.physics.world.staticBodies.size;');
  const gatherAt = async (node, holdMs) => {
    await teleport(node.x, node.y + 14);
    await sleep(100);
    await hold(['KeyW'], 60);
    return hold(['KeyE'], holdMs);
  };

  const bodiesBefore = await staticBodies();
  const bush = await nearestNode('berry_bush');
  const berries0 = await count('berries');
  await gatherAt(bush, 1100);
  await sleep(1200);
  check('berry bush can be picked', (await nodeState(bush.idx)).depleted, 'berries ' + berries0 + '→' + (await count('berries')));
  check('berries collected into inventory', (await count('berries')) >= berries0 + 2);

  const tree = await nearestNode('jungle_tree');
  const wood0 = await count('wood');
  await gatherAt(tree, 3300);
  await sleep(1300);
  const treeState = await nodeState(tree.idx);
  check('tree can be chopped down', treeState.depleted && !treeState.body, JSON.stringify(treeState));
  check('wood collected and stacked', (await count('wood')) >= wood0 + 3, 'wood=' + (await count('wood')));
  await page.screenshot({ path: OUT + '/05-gathered.png' });

  const bamboo = await nearestNode('bamboo_clump');
  const bamboo0 = await count('bamboo');
  await gatherAt(bamboo, 2600);
  await sleep(1300);
  check('bamboo can be cut', (await count('bamboo')) >= bamboo0 + 2, 'bamboo=' + (await count('bamboo')));

  const rock = await nearestNode('boulder');
  const stone0 = await count('stone');
  await gatherAt(rock, 4200);
  await sleep(1300);
  check('boulder can be broken', (await count('stone')) >= stone0 + 2, 'stone=' + (await count('stone')));

  // Walk through the stump, then force a respawn and make sure the collider is back exactly once.
  await teleport(tree.x - 40, tree.y + 3);
  await sleep(100);
  await hold(['KeyD'], 700);
  check('stump is walkable (no phantom collider)', (await player()).x > tree.x + 5);
  await teleport(tree.x - 120, tree.y + 3);
  await evalW('w.gathering.nodes[arg].respawnAt = 0;', tree.idx);
  await sleep(300);
  const respawned = await nodeState(tree.idx);
  check('tree respawns with its collider', !respawned.depleted && respawned.body, JSON.stringify(respawned));
  await teleport(tree.x - 40, tree.y + 3);
  await sleep(100);
  await hold(['KeyD'], 700);
  check('respawned tree blocks movement again', (await player()).x < tree.x);
  await teleport(1700, 300);
  await evalW('for (const n of w.gathering.nodes) if (n.depleted) n.respawnAt = 0;');
  await sleep(300);
  const bodiesAfter = await staticBodies();
  check('static body count unchanged after deplete/respawn cycles', bodiesAfter === bodiesBefore, bodiesBefore + '→' + bodiesAfter);

  const hotbarMatches = await evalW(
    'for (let i = 0; i < 6; i++) {' +
      'const a = w.inventory.inventory.get(i); const b = ui.hotbar.slots[i].item;' +
      'if ((a ? a.item : null) !== (b ? b.item : null) || (a ? a.qty : 0) !== (b ? b.qty : 0)) return false;' +
      '} return true;',
  );
  check('hotbar reflects inventory', hotbarMatches);

  // Water: stand on the shore above the pond, face it, press E.
  await teleport(22 * 32 + 16, 23 * 32 + 24);
  await sleep(100);
  await hold(['KeyS'], 600);
  const waterTarget = await evalW('return w.interaction.current.kind;');
  await hold(['KeyE'], 250);
  const drank = await evalW('return w.children.list.some((o) => o.type === "Text" && o.visible && o.text === "Fresh water");');
  check('water edge offers drinking', waterTarget === 'water', waterTarget);
  check('drinking works', drank);
  await page.screenshot({ path: OUT + '/06-water.png' });

  // Exactly-once pickup.
  await teleport(30 * 32 + 16, 20 * 32 + 30);
  await sleep(150);
  const sticks0 = await count('stick');
  await evalW('const p = w.player; w.pickups.spawn("stick", 5, p.x, p.y - 6, w.now, 0, 0);');
  await sleep(1000);
  const sticks1 = await count('stick');
  await sleep(800);
  check('pickup collected exactly once', sticks1 === sticks0 + 5 && (await count('stick')) === sticks1, sticks0 + '→' + sticks1);

  // Full inventory: pickup stays on the ground with a visible warning, then collects once space frees.
  await evalW('w.inventory.add("stone", 999);');
  const stoneFull = await count('stone');
  const activeBefore = await evalW('return w.pickups.activeCount;');
  await evalW('const p = w.player; w.pickups.spawn("stone", 2, p.x, p.y - 6, w.now, 0, 0);');
  await sleep(900);
  const toastText = await evalW('return ui.toast.text.alpha > 0 ? ui.toast.text.text : "";');
  const activeNow = await evalW('return w.pickups.activeCount;');
  check('full inventory leaves pickup on ground', (await count('stone')) === stoneFull && activeNow === activeBefore + 1);
  check('full inventory is announced', /Inventory full/.test(toastText), toastText);
  await page.screenshot({ path: OUT + '/07-full.png' });
  await evalW('w.inventory.inventory.remove("stone", 999); w.inventory.broadcast();');
  await sleep(900);
  check('pickup collects once space frees', (await count('stone')) === 2, 'stone=' + (await count('stone')));

  // Drop with Q; dropped items wait until the player steps away.
  await page.keyboard.press('Digit1');
  const slot0 = await evalW('return w.inventory.inventory.get(0);');
  await page.keyboard.press('KeyQ');
  await sleep(200);
  check('Q drops one item', (await count(slot0.item)) === slot0.qty - 1, slot0.item + ' ' + slot0.qty + '→' + (await count(slot0.item)));
  await sleep(2000);
  check('dropped item is not instantly re-collected', (await count(slot0.item)) === slot0.qty - 1);
  const here = await player();
  await teleport(here.x - 90, here.y);
  await sleep(200);
  await teleport(here.x, here.y);
  await sleep(900);
  check('dropped item can be picked up again', (await count(slot0.item)) === slot0.qty);

  // Inventory panel: modal, blocks movement, drag to move, Esc closes without pausing.
  await page.keyboard.press('KeyI');
  await sleep(200);
  const before = await player();
  await hold(['KeyD'], 400);
  const after = await player();
  const panelModal = await evalW('return ui.panel.isOpen && w.modalOpen;');
  check('inventory panel opens and blocks movement', panelModal && Math.abs(after.x - before.x) < 2);
  const toPage = async (gx, gy) => {
    const box = await page.locator('canvas').boundingBox();
    return { x: box.x + (gx / 1280) * box.width, y: box.y + (gy / 720) * box.height };
  };
  const s0 = await evalW('const s = ui.panel.slots[0]; return { x: s.x, y: s.y };');
  const s12 = await evalW('const s = ui.panel.slots[12]; return { x: s.x, y: s.y };');
  const item0 = await evalW('return w.inventory.inventory.get(0);');
  const pa = await toPage(s0.x, s0.y);
  const pb = await toPage(s12.x, s12.y);
  await page.mouse.move(pa.x, pa.y);
  await page.mouse.down();
  await page.mouse.move((pa.x + pb.x) / 2, (pa.y + pb.y) / 2, { steps: 4 });
  await page.mouse.move(pb.x, pb.y, { steps: 4 });
  await page.mouse.up();
  await sleep(200);
  await page.screenshot({ path: OUT + '/08-inventory.png' });
  const moved = await evalW('return w.inventory.inventory.get(12);');
  check('drag moves a stack between slots', !!moved && moved.item === item0.item && moved.qty === item0.qty, JSON.stringify(moved));
  await evalW('w.inventory.inventory.move(12, 0); w.inventory.broadcast();');
  await page.keyboard.press('Escape');
  await sleep(250);
  const stillOpen = await evalW('return ui.panel.isOpen || w.modalOpen;');
  check('Esc closes the panel without pausing', !stillOpen && (await sceneActive('World')) && !(await sceneActive('Pause')));

  // Rare item drop needs confirmation.
  await evalW(
    'w.inventory.add("flint", 2); const inv = w.inventory.inventory;' +
      'for (let i = 0; i < inv.size; i++) if (inv.get(i) && inv.get(i).item === "flint") { inv.move(i, 5); break; }' +
      'w.inventory.broadcast();',
  );
  await page.keyboard.press('Digit6');
  await sleep(100);
  await page.keyboard.press('KeyQ');
  await sleep(200);
  const dialogOpen = await evalW('return ui.dialog !== null;');
  await page.screenshot({ path: OUT + '/09-rare-confirm.png' });
  await page.keyboard.press('Escape');
  await sleep(200);
  const dialogClosed = await evalW('return ui.dialog === null;');
  check('rare drop asks for confirmation; Esc keeps the item', dialogOpen && dialogClosed && (await count('flint')) === 2);
  await page.keyboard.press('KeyQ');
  await sleep(200);
  await clickGame(640 - 100, 360 + 45);
  await sleep(250);
  check('confirming drops the rare item', (await count('flint')) === 1);
  await page.keyboard.press('Digit1');

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
