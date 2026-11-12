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

const PORT = Number(process.env.SMOKE_PORT ?? 4317);
const server = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'silent' });
const SEED = 4242;
// nostory: side stories stay quiet until the M14 block switches them on.
const url = `http://localhost:${PORT}/?debug&calm&nostory&seed=${SEED}`;

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
    return buttons.length >= 2 && buttons[0].enabled === true && buttons[1].enabled === false;
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
    const p = w.player;
    const z = zones.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
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
        'const list = w.gathering.nodes.filter((n) => n.def.id === arg && !n.depleted);' +
        'list.sort((a, b) => Math.hypot(a.prop.x - p.x, a.prop.y - p.y) - Math.hypot(b.prop.x - p.x, b.prop.y - p.y));' +
        'const n = list[0];' +
        'return { idx: n.prop.key, x: n.prop.x, y: n.prop.y };',
      resId,
    );
  const nodeState = (idx) =>
    evalW('const n = w.gathering.nodes.find((x) => x.prop.key === arg); if (!n) return null; return { depleted: n.depleted, hp: n.hp, body: n.zone.body.enable };', idx);
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
  await evalW('w.gathering.nodes.find((x) => x.prop.key === arg).respawnAt = 0;', tree.idx);
  await sleep(300);
  const respawned = await nodeState(tree.idx);
  check('tree respawns with its collider', !respawned.depleted && respawned.body, JSON.stringify(respawned));
  await teleport(tree.x - 40, tree.y + 3);
  await sleep(100);
  await hold(['KeyD'], 700);
  check('respawned tree blocks movement again', (await player()).x < tree.x);
  await teleport(tree.x - 140, tree.y + 40);
  await evalW('for (const n of w.gathering.nodes) if (n.depleted) n.respawnAt = 0;');
  await sleep(300);
  const bodiesAfter = await evalW('const set = w.physics.world.staticBodies; let bad = 0; for (const n of w.chunks.nodes) { const live = set.contains(n.zone.body); if (n.depleted && n.def.sprite !== "bush" ? live : !live) bad++; } return { bad, nodes: w.chunks.nodes.length };');
  check('every node collider is live exactly when it should be after respawn cycles', bodiesAfter.bad === 0, JSON.stringify({ bodiesBefore, bodiesAfter }));

  const hotbarMatches = await evalW(
    'for (let i = 0; i < 6; i++) {' +
      'const a = w.inventory.inventory.get(i); const b = ui.hotbar.slots[i].item;' +
      'if ((a ? a.item : null) !== (b ? b.item : null) || (a ? a.qty : 0) !== (b ? b.qty : 0)) return false;' +
      '} return true;',
  );
  check('hotbar reflects inventory', hotbarMatches);

  // Water: stand on the shore above the pond, face it, press E.
  await teleport(8 * 32 + 16, 2 * 32 + 24);
  await sleep(100);
  await hold(['KeyS'], 600);
  const waterTarget = await evalW('return w.interaction.current.kind;');
  await hold(['KeyE'], 250);
  const drank = await evalW('return w.children.list.some((o) => o.type === "Text" && o.visible && o.text === "Fresh water");');
  check('water edge offers drinking', waterTarget === 'water', waterTarget);
  check('drinking works', drank);
  await page.screenshot({ path: OUT + '/06-water.png' });

  // Exactly-once pickup.
  await teleport(16, 30);
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

  // QA follow-ups: stale drop requests are ignored; ground items are never lost when the pool is full.
  const slot0Now = await evalW('return w.inventory.inventory.get(0);');
  await evalW('w.inventory.handle({ type: "drop", slot: 0, item: "not_this_item", qty: 1 });');
  const slot0After = await evalW('return w.inventory.inventory.get(0);');
  check('drop request for a changed slot is ignored', JSON.stringify(slot0Now) === JSON.stringify(slot0After));
  const spawned = await evalW(
    'let ok = 0; for (let i = 0; i < 450; i++) if (w.pickups.spawn("stone", 1, 900, 30, w.now, 0, 20)) ok++;' +
      'let total = 0; for (const p of w.pickups.pool) if (p.active && p.item === "stone" && p.image.x > 850) total += p.qty;' +
      'return { ok, total, active: w.pickups.activeCount, pool: w.pickups.pool.length };',
  );
  check('pickup pool caps out and merges instead of losing items', spawned.ok === 450 && spawned.total === 450 && spawned.pool <= 400, JSON.stringify(spawned));
  await evalW('for (const p of w.pickups.pool) if (p.active && p.image.x > 850) { p.active = false; p.image.setVisible(false); }');

  // ---------- M4: seeded world, chunks, biomes, minimap ----------
  const chunkSig = () => evalW('const c = w.gen.generateChunk(3, -2); return JSON.stringify(c).length + ":" + c.props.length + ":" + c.tiles.flat().join("").length;');
  const sigBefore = await chunkSig();
  check('world uses the requested seed', (await evalW('return w.seed;')) === SEED);
  check('minimap shows the biome name', (await evalW('return ui.minimap.label.text;')).length > 3, await evalW('return ui.minimap.label.text;'));
  await page.screenshot({ path: OUT + '/15-world-spawn.png' });

  // Harvest a node near spawn, walk far away (its chunk unloads), come back: still harvested.
  await teleport(16, 30);
  await sleep(150);
  const homeBush = await nearestNode('berry_bush');
  await gatherAt(homeBush, 1100);
  await sleep(300);
  check('home bush harvested', (await nodeState(homeBush.idx))?.depleted === true);
  const stats = () => evalW('return { chunks: w.chunks.loadedCount, nodes: w.chunks.nodes.length, bodies: w.physics.world.staticBodies.size, colliders: w.physics.world.colliders.length, display: w.children.list.length, canopies: w.props.canopyCount };');
  const startStats = await stats();
  let maxStats = { ...startStats };
  const biomesSeen = new Set();
  for (let i = 1; i <= 14; i++) {
    await teleport(16 + i * 900, 30 + (i % 3) * 400);
    await sleep(160);
    const st = await stats();
    for (const k of Object.keys(st)) maxStats[k] = Math.max(maxStats[k], st[k]);
    biomesSeen.add(await evalW('return w.gen.biomeAt(Math.floor(w.player.x / 32), Math.floor(w.player.y / 32));'));
  }
  await page.screenshot({ path: OUT + '/16-world-far.png' });
  check('far walk keeps chunk count bounded', maxStats.chunks <= 25, JSON.stringify(maxStats));
  check('far walk keeps bodies/colliders/display bounded', maxStats.bodies < 1500 && maxStats.colliders < 40 && maxStats.display < 6000, JSON.stringify(maxStats));
  check('far walk crosses several biomes', biomesSeen.size >= 2, [...biomesSeen].join(','));
  await teleport(16, 30);
  await sleep(400);
  const backState = await nodeState(homeBush.idx);
  check('harvested node stays harvested after its chunk unloads and reloads', backState?.depleted === true, JSON.stringify(backState));
  const endStats = await stats();
  check('returning home restores similar object counts (no accumulation)', endStats.bodies <= startStats.bodies + 40 && endStats.colliders <= startStats.colliders + 2, JSON.stringify({ startStats, endStats }));
  // Negative coordinates load fine.
  await teleport(-2500, -1800);
  await sleep(300);
  check('negative world coordinates stream in', (await evalW('return w.chunks.isLoaded(Math.floor(w.player.x / 1024), Math.floor(w.player.y / 1024));')) === true);
  await teleport(16, 30);
  await sleep(300);
  check('chunk generation is deterministic for the seed', (await chunkSig()) === sigBefore);

  // ---------- M5: wildlife, spirits, combat, shrines ----------
  const setHourM5 = (h) => evalW('const c = w.clock; c.totalSeconds = (c.dayNumber - 1) * 480 + arg * 20;', h);
  const hp = () => evalW('return w.survival.stats.health;');
  const setHealth = (v) => evalW('w.survival.stats.health = arg; w.playerInvulnUntil = 0;', v);
  const spawnNear = (id, dx, dy) => evalW('const p = w.player; const e = w.encounters.spawnAt(arg[0], p.x + arg[1], p.y + arg[2], w.now); return e ? w.encounters.enemies.indexOf(e) : -1;', [id, dx, dy]);
  const enemy = (i) => evalW('const e = w.encounters.enemies[arg]; return e && e.active ? { hp: e.hp, state: e.aiState, x: e.x, y: e.y } : null;', i);
  const clearEnemies = () => evalW('w.encounters.clear(); w.projectiles.clear();');
  await setHourM5(10);
  await teleport(16, 30);
  await sleep(200);
  check('natural spawning off for the test (calm)', (await evalW('return w.encounters.enabled;')) === false);

  // Boar: telegraphed charge hurts; one hit per charge (i-frames).
  await setHealth(100);
  const boar = await spawnNear('wild_boar', 110, 0);
  let sawTelegraph = false;
  for (let i = 0; i < 40; i++) {
    const st = await enemy(boar);
    if (st?.state === 'telegraph') sawTelegraph = true;
    if ((await hp()) < 100) break;
    await sleep(100);
  }
  await page.screenshot({ path: OUT + '/17-boar.png' });
  const afterBoar = await hp();
  check('boar telegraphs before charging', sawTelegraph);
  check('boar charge damages the player once', afterBoar < 100 && afterBoar >= 100 - 2 * 12, 'health=' + afterBoar.toFixed(1));

  // Fight back with a spear (Space attacks the facing direction).
  await evalW('w.inventory.inventory.restore([{ item: "spear", qty: 1, durability: 60 }]); w.inventory.selected = 0; w.inventory.broadcast();');
  const meat0 = await count('raw_meat');
  let killed = false;
  for (let i = 0; i < 40 && !killed; i++) {
    const st = await enemy(boar);
    if (!st) {
      killed = true;
      break;
    }
    await evalW('const p = w.player; const e = w.encounters.enemies[arg]; p.body.reset(e.x - 26, e.y); p.facingVec.x = 1; p.facingVec.y = 0; w.playerInvulnUntil = w.now + 5000;', boar);
    await page.keyboard.press('Space');
    await sleep(450);
  }
  await sleep(1200);
  check('spear attacks kill the boar', killed);
  check('boar drops meat (collected)', (await count('raw_meat')) > meat0, 'meat=' + (await count('raw_meat')));
  const spearAfter = await evalW('return w.inventory.inventory.get(0);');
  check('weapon wears on hits', !!spearAfter && spearAfter.durability < 60, JSON.stringify(spearAfter));

  // Viper: bite poisons, poison wears off.
  await clearEnemies();
  await setHealth(100);
  await teleport(16, 30);
  const viper = await spawnNear('pit_viper', 30, 0);
  let poisoned = false;
  for (let i = 0; i < 40 && !poisoned; i++) {
    poisoned = await evalW('return w.effects.has("poison");');
    if (!poisoned) await sleep(100);
  }
  check('viper bite poisons', poisoned);
  await clearEnemies();
  await page.screenshot({ path: OUT + '/18-poison.png' });
  await sleep(8500);
  check('poison wears off', !(await evalW('return w.effects.has("poison");')));
  void viper;

  // Night: spirits avoid campfire light; Arak orbs fizzle in light.
  await clearEnemies();
  await setHourM5(23);
  await setHealth(100);
  await teleport(16 + 1300, 30);
  await sleep(400);
  await evalW('const p = w.player; w.structures.place("campfire", p.x + 40, p.y + 4);');
  await sleep(300);
  await evalW('const p = w.player; const fire = w.structures.records[w.structures.records.length - 1]; p.body.reset(fire.x, fire.y + 26);');
  await sleep(200);
  const apIdx = await spawnNear('ap', 30, -10);
  const arakIdx = await spawnNear('arak', 150, 0);
  await sleep(5000);
  const apState = await enemy(apIdx);
  const fireDist = await evalW('const e = w.encounters.enemies[arg]; const f = w.structures.records[w.structures.records.length - 1]; return Math.hypot(e.x - f.x, e.cy - (f.y - 8));', apIdx);
  await page.screenshot({ path: OUT + '/19-night-fire.png' });
  check('spirits are pushed out of firelight', !!apState && fireDist > 100, 'distance=' + Math.round(fireDist));
  check('standing in firelight keeps the player safe from spirits', (await hp()) >= 99.5, 'health=' + (await hp()).toFixed(1));
  void arakIdx;

  // Away from light, an Ap attacks.
  await clearEnemies();
  await teleport(16 + 600, 30);
  await sleep(400);
  await setHealth(100);
  await spawnNear('ap', 100, 0);
  for (let i = 0; i < 60 && (await hp()) >= 100; i++) await sleep(100);
  check('in the dark without light, an Ap attacks', (await hp()) < 100, 'health=' + (await hp()).toFixed(1));

  // Dawn: spirits fade away.
  const fadeIdx = await spawnNear('ap', 120, 0);
  await setHourM5(9);
  await sleep(2200);
  check('spirits fade at dawn', (await enemy(fadeIdx)) === null);

  // Neak Ta shrine near spawn: offering grants a blessing and spirit ward; resting afterwards.
  await clearEnemies();
  await teleport(16, 30);
  await sleep(300);
  const shrine = await evalW('const s = w.chunks.shrines[0]; return s ? { key: s.key, x: s.x, y: s.y } : null;');
  check('a Neak Ta shrine stands near spawn', !!shrine, JSON.stringify(shrine));
  if (shrine) {
    await evalW('w.inventory.inventory.restore([{ item: "berries", qty: 2 }]); w.inventory.selected = 0; w.inventory.broadcast();');
    await teleport(shrine.x, shrine.y + 24);
    await sleep(200);
    await hold(['KeyW'], 80);
    const prompt = await evalW('return ui.prompt.text;');
    await page.keyboard.press('KeyE');
    await sleep(300);
    const fx = await evalW('return { blessing: w.effects.has("blessing"), ward: w.effects.has("ward"), berries: w.inventory.inventory.count("berries") };');
    await page.screenshot({ path: OUT + '/20-shrine.png' });
    check('shrine offering grants blessing + spirit ward and uses one food', /Neak Ta/.test(prompt) && fx.blessing && fx.ward && fx.berries === 1, JSON.stringify({ prompt, fx }));
    await page.keyboard.press('KeyE');
    await sleep(300);
    check('shrine rests after an offering (no repeat farming)', (await evalW('return w.inventory.inventory.count("berries");')) === 1);
    await setHourM5(23);
    await teleport(16 + 600, 30);
    await sleep(300);
    await setHealth(100);
    await spawnNear('ap', 90, 0);
    await sleep(4000);
    check('spirit ward keeps spirits from attacking', (await hp()) >= 99.5, 'health=' + (await hp()).toFixed(1));
    await clearEnemies();
    await evalW('w.effects.clear("ward"); w.effects.clear("blessing");');
  }

  // Population caps: gentle first night, more on night 3, bounded.
  const caps = await evalW('const f = (d) => w.encounters.cap(true, { playerX: 16, playerY: 30, darkness: 0.8, day: d, spiritWard: false }); return [f(1), f(3), f(30)];');
  check('night population: gentle on night 1, larger by night 3, capped', caps[0] <= 2 && caps[1] > caps[0] && caps[2] <= 6, JSON.stringify(caps));
  await evalW('w.encounters.enabled = true;');
  await sleep(9000);
  const alive = await evalW('return w.encounters.aliveCount;');
  check('natural spawning respects the cap', alive <= caps[2], 'alive=' + alive);
  await evalW('w.encounters.enabled = false; w.encounters.clear(); w.projectiles.clear();');
  await setHourM5(10);
  await setHealth(100);
  await teleport(16, 30);
  await sleep(300);

  // ---------- M6: monsoon, ruins, tablets, quest ----------
  const setDayHour = (d, h) => evalW('w.clock.totalSeconds = (arg[0] - 1) * 480 + arg[1] * 20; w.nextWeatherAt = 0;', [d, h]);
  await setDayHour(1, 9);
  await sleep(700);
  const forecast1 = await evalW('return ui.status.weatherText.text;');
  check('forecast shows days until the monsoon', /Monsoon in 4 days/.test(forecast1), forecast1);

  // Monsoon: rain, gloom, warmth drains when exposed, shelter restores it.
  await teleport(16 + 900, 30);
  await sleep(300);
  await setDayHour(5, 12);
  await sleep(800);
  const rain = await evalW('return { raining: ui.weather.raining, label: ui.status.weatherText.text, flood: w.chunks.flood };');
  check('monsoon starts on day 5 (rain + forecast label + flood level)', rain.raining && /Monsoon — day 1/.test(rain.label) && rain.flood > 0, JSON.stringify(rain));
  await evalW('w.survival.stats.warmth = 100;');
  await sleep(3000);
  const drops = await evalW('return ui.weather.rain.getAliveParticleCount();');
  check('rain streaks are falling', drops > 60, 'alive=' + drops);
  const warmExposed = await evalW('return w.survival.stats.warmth;');
  check('exposed in the rain, warmth drops', warmExposed < 99, 'warmth=' + warmExposed.toFixed(1));
  await page.screenshot({ path: OUT + '/21-monsoon.png' });
  await evalW('const p = w.player; w.structures.place("bamboo_shelter", p.x, p.y - 30);');
  await sleep(2500);
  const warmSheltered = await evalW('return w.survival.stats.warmth;');
  check('under a shelter, warmth recovers', warmSheltered > warmExposed, warmExposed.toFixed(1) + '→' + warmSheltered.toFixed(1));
  const floodSafe = await evalW(
    'let n = 0; let solid = 0; for (const c of w.chunks.loaded.values()) for (const [t] of c.flooded) { n++; if (t.collides) solid++; } return { n, solid };',
  );
  check('flooded ground is walkable shallows (never solid)', floodSafe.solid === 0, JSON.stringify(floodSafe));

  // Ruins: chest loot once; tablet → journal + quest.
  await setDayHour(2, 10);
  await sleep(600);
  const site = await evalW('const s = w.gen.tabletSites()[0]; return { x: s.tx * 32 + 16, y: s.ty * 32 + 16 };');
  await teleport(site.x, site.y + 4 * 32);
  await sleep(1200);
  const chest = await evalW('const p = w.player; const c = w.chunks.ruins.filter((r) => r.kind === "chest").sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]; return c ? { key: c.key, x: c.x, y: c.y } : null;');
  check('ruin chest exists at a tablet ruin', !!chest);
  if (chest) {
    await teleport(chest.x, chest.y + 22);
    await sleep(200);
    await hold(['KeyW'], 80);
    const itemsBefore = await evalW('return w.inventory.inventory.snapshot().reduce((n, s) => n + (s ? s.qty : 0), 0) + w.pickups.activeCount;');
    await page.keyboard.press('KeyE');
    await sleep(1500);
    const opened = await evalW('return w.openedChests.has(arg);', chest.key);
    const itemsAfter = await evalW('return w.inventory.inventory.snapshot().reduce((n, s) => n + (s ? s.qty : 0), 0);');
    check('opening a chest gives loot', opened && itemsAfter > 0, 'before=' + itemsBefore + ' after=' + itemsAfter);
    await page.keyboard.press('KeyE');
    await sleep(1200);
    const itemsAgain = await evalW('return w.inventory.inventory.snapshot().reduce((n, s) => n + (s ? s.qty : 0), 0);');
    check('a chest never gives loot twice', itemsAgain === itemsAfter, itemsAfter + '→' + itemsAgain);
    await page.screenshot({ path: OUT + '/22-ruin-chest.png' });
  }
  const tab = await evalW('const t = w.chunks.ruins.find((r) => r.kind === "tablet"); return t ? { id: t.id, x: t.x, y: t.y } : null;');
  check('the ruin holds a key tablet', !!tab, JSON.stringify(tab));
  if (tab) {
    await teleport(tab.x, tab.y + 22);
    await sleep(200);
    await hold(['KeyW'], 80);
    await page.keyboard.press('KeyE');
    await sleep(400);
    const read = await evalW('return { open: ui.tabletView.isOpen, km: ui.tabletView.km.text, read: w.quest.tabletsRead.length, modal: w.modalOpen };');
    await page.screenshot({ path: OUT + '/23-tablet.png' });
    check('reading a tablet shows its text and records it', read.open && read.km.length > 0 && read.read === 1 && read.modal, JSON.stringify(read));
    await page.keyboard.press('Escape');
    await sleep(300);
    await page.keyboard.press('KeyE');
    await sleep(400);
    const reopened = await evalW('return ui.tabletView.isOpen;');
    await page.keyboard.press('KeyE');
    await sleep(600);
    check('E reads a tablet and E closes it (no re-open loop)', reopened && !(await evalW('return ui.tabletView.isOpen || w.modalOpen;')));
    await page.keyboard.press('KeyJ');
    await sleep(300);
    const journal = await evalW('return { open: ui.journal.isOpen, quest: ui.journal.questText.text, t1: ui.journal.tabletTitles[0].text };');
    await page.screenshot({ path: OUT + '/24-journal.png' });
    check('journal shows quest progress and the tablet', journal.open && /1\/5/.test(journal.quest), JSON.stringify(journal).slice(0, 200));
    await page.keyboard.press('Escape');
    await sleep(200);
    check('Esc closes journal without pausing', !(await evalW('return ui.journal.isOpen || w.modalOpen;')) && !(await sceneActive('Pause')));
  }
  const arrow = await evalW('return { visible: ui.questArrow.arrow.visible, label: ui.questArrow.label.text };');
  await teleport(16, 30);
  await sleep(1300);
  const arrowHome = await evalW('return { visible: ui.questArrow.arrow.visible, label: ui.questArrow.label.text };');
  check('objective arrow points to the next tablet from afar', arrowHome.visible && /tablet/i.test(arrowHome.label), JSON.stringify({ arrow, arrowHome }));

  // All five → the Heart is revealed and reachable.
  await evalW('for (const t of w.gameData.tablets) w.quest.readTablet(t.id); w.nextQuestTargetAt = 0;');
  await sleep(1300);
  const heartTarget = await evalW('return ui.questArrow.label.text;');
  check('after five tablets the arrow leads to the Heart of the Forest', /Heart/.test(heartTarget), heartTarget);
  const heart = await evalW('const h = w.gen.heartSite(); return { x: h.tx * 32 + 16, y: h.ty * 32 + 16 };');
  await teleport(heart.x, heart.y + 40);
  await sleep(1500);
  check('reaching the Heart glade advances the quest to the offering', (await evalW('return w.quest.stage;')) === 'restore');
  // Restore a calm state for later checks.
  await evalW('w.quest = new w.quest.constructor(w.gameData, ["tablet_1"], false); w.nextQuestTargetAt = 0;');
  await setDayHour(1, 10);
  await evalW('w.survival.stats.warmth = 100; w.survival.stats.health = 100;');
  await teleport(16, 30);
  await sleep(800);

  // ---------- M3: survival, crafting, structures, night, sleep/save, death ----------
  const toPageXY = async (gx, gy) => {
    const box = await page.locator('canvas').boundingBox();
    return { x: box.x + (gx / 1280) * box.width, y: box.y + (gy / 720) * box.height };
  };
  const worldToScreen = (wx, wy) =>
    evalW('const c = w.cameras.main; return { x: (arg[0] - c.worldView.x) * c.zoom, y: (arg[1] - c.worldView.y) * c.zoom };', [wx, wy]);
  const clickWorld = async (wx, wy) => {
    const sc = await worldToScreen(wx, wy);
    const pp = await toPageXY(sc.x, sc.y);
    await page.mouse.move(pp.x, pp.y);
    await sleep(80);
    await page.mouse.click(pp.x, pp.y);
  };
  const survival = () => evalW('return { ...w.survival.stats };');
  const hasItem = (id) => evalW('return w.inventory.inventory.count(arg);', id);
  const setHour = (h) => evalW('const c = w.clock; c.totalSeconds = (c.dayNumber - 1) * 480 + arg * 20;', h);
  const craftRowButton = (recipeId) =>
    evalW('ui.crafting.showRecipe(arg); const r = ui.crafting.rows.find((x) => x.recipe.id === arg); return { x: r.button.x, y: r.button.y };', recipeId);

  await teleport(16, 30);
  await evalW('w.inventory.inventory.restore([]); w.inventory.selected = 0; w.inventory.broadcast();');
  await sleep(150);
  const hud = await evalW('return !!ui.status && ui.status.bars.length >= 4 && ui.status.bars[0].value.text !== "";');
  check('survival bars shown', hud);

  // Crafting blocked without materials, then succeeds.
  await page.keyboard.press('KeyC');
  await sleep(250);
  const axeBtn = await craftRowButton('stone_axe');
  let pt = await toPageXY(axeBtn.x, axeBtn.y);
  await page.mouse.click(pt.x, pt.y);
  await sleep(200);
  const blockedToast = await evalW('return ui.toast.text.text;');
  check('crafting without materials is blocked with feedback', /Missing materials/.test(blockedToast) && (await hasItem('stone_axe')) === 0, blockedToast);
  await page.screenshot({ path: OUT + '/10-crafting.png' });
  await evalW('w.inventory.add("stone", 3); w.inventory.add("wood", 2); w.inventory.add("plant_fiber", 2);');
  await sleep(150);
  await page.mouse.click(pt.x, pt.y);
  await sleep(200);
  const axeStack = await evalW('return w.inventory.inventory.snapshot().find((x) => x && x.item === "stone_axe");');
  check('stone axe crafted with full durability', !!axeStack && axeStack.durability === 100, JSON.stringify(axeStack));
  check('ingredients consumed', (await hasItem('stone')) === 0 && (await hasItem('wood')) === 0);
  await page.keyboard.press('KeyC');
  await sleep(150);

  // Axe chops faster and wears.
  const axeSlot = await evalW('return w.inventory.inventory.snapshot().findIndex((x) => x && x.item === "stone_axe");');
  await evalW('w.inventory.inventory.move(arg, 0); w.inventory.selected = 0; w.inventory.broadcast();', axeSlot);
  const tree2 = await nearestNode('jungle_tree');
  await gatherAt(tree2, 800);
  const axeAfter = await evalW('return w.inventory.inventory.get(0);');
  const treeState2 = await nodeState(tree2.idx);
  const axeDiag = await evalW('return { modal: w.modalOpen, ui: ui.modal, craft: ui.crafting.isOpen, panel: ui.panel.isOpen, building: w.building.active, busy: w.busy, target: w.interaction.current.kind, sel: w.inventory.selected, p: [w.player.x, w.player.y] };');
  check('axe fells a tree in a few hits and wears', treeState2.depleted && axeAfter && axeAfter.durability < 100, JSON.stringify({ treeState2, axeAfter, axeDiag, tree2 }));

  // Eating raw food: hunger up, small health penalty.
  await evalW('w.survival.stats.hunger = 50; w.survival.stats.health = 80; w.inventory.add("bamboo_shoot", 1);');
  const shootSlot = await evalW('return w.inventory.inventory.snapshot().findIndex((x) => x && x.item === "bamboo_shoot");');
  await evalW('w.inventory.inventory.move(arg, 1); w.inventory.broadcast();', shootSlot);
  await page.keyboard.press('Digit2');
  await page.keyboard.press('KeyF');
  await sleep(150);
  const afterEat = await survival();
  check('eating raw bamboo shoot: +food, -health', afterEat.hunger > 55 && afterEat.health < 80, JSON.stringify(afterEat));

  // Sprinting drains stamina.
  await teleport(16, 30);
  await hold(['ShiftLeft', 'KeyD'], 1200);
  const afterSprint = await survival();
  check('sprinting drains stamina', afterSprint.stamina < 95, 'stamina=' + afterSprint.stamina.toFixed(1));

  // Drinking raises thirst.
  await evalW('w.survival.stats.thirst = 30;');
  await teleport(8 * 32 + 16, 2 * 32 + 24);
  await hold(['KeyS'], 600);
  await hold(['KeyE'], 200);
  check('drinking restores thirst', (await survival()).thirst > 60, 'thirst=' + (await survival()).thirst.toFixed(1));

  // Placement: invalid on water / trees, valid on clear ground; campfire then shelter.
  const invalid = await evalW(
    'const r = new Phaser.Geom.Rectangle(0, 0, 1, 1); const t = w.gathering.nodes.find((n) => n.def.sprite === "tree" && !n.depleted);' +
      'return { water: w.structures.canPlace("campfire", 8 * 32 + 16, 6 * 32 + 16, 8 * 32 + 16, 3 * 32, r), tree: w.structures.canPlace("campfire", t.prop.x, t.prop.y, t.prop.x, t.prop.y + 40, r) };',
  );
  check('placement rejects water and trees', invalid.water === false && invalid.tree === false, JSON.stringify(invalid));
  await teleport(16, 30);
  await sleep(100);
  await evalW('w.inventory.add("campfire_kit", 1); w.inventory.add("bamboo_shelter_kit", 1);');
  const kitSlot = await evalW('return w.inventory.inventory.snapshot().findIndex((x) => x && x.item === "campfire_kit");');
  await evalW('w.inventory.inventory.move(arg, 2); w.inventory.broadcast();', kitSlot);
  await page.keyboard.press('Digit3');
  await page.keyboard.press('KeyF');
  await sleep(150);
  const pl = await player();
  await clickWorld(pl.x + 46, pl.y + 2);
  await sleep(200);
  const fires = await evalW('return w.structures.list.filter((s) => s.def.id === "campfire").length;');
  check('campfire placed with a valid click', fires >= 1 && (await hasItem('campfire_kit')) === 0, 'fires=' + fires);
  await page.screenshot({ path: OUT + '/11-campfire.png' });

  // Cooking at the campfire via E → crafting panel → roast.
  await evalW('w.inventory.add("bamboo_shoot", 1);');
  await teleport(pl.x + 16, pl.y + 2);
  await sleep(150);
  await hold(['KeyD'], 80);
  const cookPrompt = await evalW('return ui.prompt.text;');
  await page.keyboard.press('KeyE');
  await sleep(250);
  const craftOpen = await evalW('return ui.crafting.isOpen;');
  const roastBtn = await craftRowButton('roasted_bamboo_shoot');
  pt = await toPageXY(roastBtn.x, roastBtn.y);
  await page.mouse.click(pt.x, pt.y);
  await sleep(200);
  check('E at campfire opens cooking; roasting works', /Cook/.test(cookPrompt) && craftOpen && (await hasItem('roasted_bamboo_shoot')) === 1, cookPrompt);
  await page.keyboard.press('Escape');
  await sleep(150);

  // Shelter: place, too early to sleep at day, then sleep at night → next morning + save.
  const shelterSlot = await evalW('return w.inventory.inventory.snapshot().findIndex((x) => x && x.item === "bamboo_shelter_kit");');
  await evalW('w.inventory.inventory.move(arg, 3); w.inventory.broadcast();', shelterSlot);
  await teleport(16, -40);
  await sleep(100);
  await page.keyboard.press('Digit4');
  await page.keyboard.press('KeyF');
  await sleep(100);
  const pl2 = await player();
  await clickWorld(pl2.x, pl2.y - 50);
  await sleep(200);
  const shelters = await evalW('return w.structures.list.filter((s) => s.def.id === "bamboo_shelter").map((s) => ({ x: s.x, y: s.y }));');
  check('bamboo shelter placed', shelters.some((sh) => Math.abs(sh.x - 16) < 80), JSON.stringify(shelters));
  await setHour(12);
  await hold(['KeyW'], 200);
  await page.keyboard.press('KeyE');
  await sleep(200);
  check('cannot sleep during the day', /Too early/.test(await evalW('return ui.toast.text.text;')));
  await setHour(23);
  await sleep(300);
  check('night is dark (lighting overlay on)', await evalW('return w.lighting.visible;'));
  await page.screenshot({ path: OUT + '/12-night.png' });
  await evalW('w.inventory.add("torch", 1); const i = w.inventory.inventory.snapshot().findIndex((x) => x && x.item === "torch"); w.inventory.inventory.move(i, 4); w.inventory.broadcast();');
  await page.keyboard.press('Digit5');
  await sleep(1300);
  const torch = await evalW('return w.inventory.inventory.get(4);');
  check('held torch burns in the dark', !!torch && torch.durability < 170, JSON.stringify(torch));
  await page.screenshot({ path: OUT + '/13-torch.png' });
  const dayBefore = await evalW('return w.clock.dayNumber;');
  await page.keyboard.press('KeyE');
  await sleep(2600);
  const afterSleep = await evalW('return { day: w.clock.dayNumber, hour: w.clock.hour, saved: localStorage.getItem("preychrov.save") !== null };');
  check('sleeping skips to morning and saves', afterSleep.day === dayBefore + 1 && Math.abs(afterSleep.hour - 6) < 0.2 && afterSleep.saved, JSON.stringify(afterSleep));

  // Continue restores the session after a reload.
  const beforeReload = await evalW('return { day: w.clock.dayNumber, roast: w.inventory.inventory.count("roasted_bamboo_shoot"), axe: w.inventory.inventory.count("stone_axe"), structures: w.structures.list.length };');
  await page.reload();
  await waitScene('Menu', 15000);
  await sleep(800);
  const contEnabled = await page.evaluate(() => {
    const m = window.__preyChrov.scene.getScene('Menu');
    const b = m.children.list.filter((o) => typeof o.activate === 'function');
    return b.some((x) => x.text?.text === 'Continue' || (x.list && x.list.some((t) => t.text === 'Continue' && x.enabled)));
  });
  check('menu offers Continue after saving', contEnabled);
  await clickGame(640, 500);
  await waitScene('World');
  await sleep(700);
  const afterLoad = await evalW('return { day: w.clock.dayNumber, roast: w.inventory.inventory.count("roasted_bamboo_shoot"), axe: w.inventory.inventory.count("stone_axe"), structures: w.structures.list.length };');
  check('Continue restores day, inventory and structures', JSON.stringify(afterLoad) === JSON.stringify(beforeReload), JSON.stringify({ beforeReload, afterLoad }));
  check('Continue restores the same seed and world', (await evalW('return w.seed;')) === SEED && (await chunkSig()) === sigBefore);
  const m6Saved = await evalW('return { tablets: w.quest.tabletsRead.length, chests: w.openedChests.size };');
  check('Continue restores read tablets and opened chests', m6Saved.tablets >= 1 && m6Saved.chests >= 1, JSON.stringify(m6Saved));

  // Corrupt save never blank-screens: menu shows it as damaged.
  // (checked in unit tests; here we verify death → GameOver instead)
  await evalW('w.survival.stats.thirst = 0; w.survival.stats.hunger = 0; w.survival.stats.health = 0.5;');
  const died = await waitScene('GameOver', 12000);
  await sleep(700);
  await page.screenshot({ path: OUT + '/14-gameover.png' });
  check('starvation/dehydration can kill → GameOver', died);
  await clickGame(640, 350);
  check('GameOver → New journey restarts on day 1', (await waitScene('World')) && (await evalW('return w.clock.dayNumber;')) === 1);
  await sleep(500);
  await page.evaluate(() => localStorage.clear());

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
    await clickGame(640, 460);
    const menuOk = await waitScene('Menu');
    await sleep(500);
    await clickGame(640, 430);
    await sleep(300);
    // Pausing autosaves, so the menu now asks before starting a new journey.
    if (await page.evaluate(() => window.__preyChrov.scene.getScene('Menu').dialog !== null)) await clickGame(640 - 100, 360 + 45);
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

  // ---------- M7: persistence, settings, audio, performance ----------
  const evalW7 = (fnBody, arg) =>
    page.evaluate(
      ({ fnBody, arg }) => {
        const w = window.__preyChrov.scene.getScene('World');
        const ui = window.__preyChrov.scene.getScene('UI');
        return new Function('w', 'ui', 'arg', fnBody)(w, ui, arg);
      },
      { fnBody, arg },
    );
  await waitScene('World');
  await sleep(600);
  check('audio unlocks after the first input (autoplay-safe)', await page.evaluate(() => window.__preyAudio?.enabled === true));
  const perf = await evalW7('return w.perfMs;');
  check('World update stays cheap (< 8 ms average, headless)', perf < 8, perf.toFixed(2) + ' ms');

  await page.evaluate(() => localStorage.removeItem('preychrov.save'));
  await page.keyboard.press('Escape');
  await waitScene('Pause', 3000);
  await sleep(300);
  check('pausing autosaves the journey', await page.evaluate(() => localStorage.getItem('preychrov.save') !== null));
  await clickGame(640, 395);
  await sleep(300);
  const flashBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("preychrov.settings") || "{}").reducedFlash === true);
  await page.evaluate(() => window.__preyChrov.scene.getScene('Pause').settings.buttons[4].activate());
  await sleep(150);
  const flashAfter = await page.evaluate(() => JSON.parse(localStorage.getItem("preychrov.settings") || "{}").reducedFlash === true);
  await page.screenshot({ path: OUT + '/25-settings.png' });
  check("settings panel changes and persists a setting", flashBefore !== flashAfter);
  await page.evaluate(() => window.__preyChrov.scene.getScene('Pause').settings.buttons[4].activate());
  await page.keyboard.press('Escape');
  await sleep(250);
  await page.keyboard.press('Escape');
  await sleep(300);
  check('Esc backs out of settings, then resumes', (await sceneActive('World')) && !(await sceneActive('Pause')));

  // A corrupt save never blank-screens: the menu explains it and New journey still works.
  // (Reloading from the World autosaves on page hide, so corrupt the slot while on the menu.)
  await page.reload();
  await waitScene('Menu', 15000);
  await page.evaluate(() => localStorage.setItem('preychrov.save', '{broken'));
  await page.evaluate(() => window.__preyChrov.scene.getScene('Menu').scene.restart());
  await sleep(900);
  const menuText = await page.evaluate(() => window.__preyChrov.scene.getScene('Menu').children.list.filter((o) => o.type === 'Text').map((o) => o.text).join(' | '));
  check('corrupt save: menu explains it, Continue disabled', /damaged/.test(menuText), menuText.slice(0, 160));
  await clickGame(640, 430);
  check('corrupt save: Play still starts a journey', await waitScene('World'));
  await sleep(500);

  // An M3-era v1 save migrates: stats/inventory/day kept, structures refunded as kits.
  await page.reload();
  await waitScene('Menu', 15000);
  await page.evaluate(() =>
    localStorage.setItem(
      'preychrov.save',
      JSON.stringify({
        version: 1,
        savedAt: 1700000000000,
        clockSeconds: 1000,
        player: { x: 500, y: 400, health: 77, hunger: 60, thirst: 55, stamina: 90 },
        inventory: [{ item: 'wood', qty: 7 }, { item: 'stone_axe', qty: 1, durability: 40 }],
        selected: 0,
        structures: [{ type: 'campfire', x: 10, y: 20 }],
        nodes: [{ id: 3, hp: 0, depleted: true, respawnInMs: 10, harvests: 1 }],
        pickups: [{ item: 'stick', qty: 2, x: 1, y: 1 }],
        objectives: ['gather'],
      }),
    ),
  );
  await page.evaluate(() => window.__preyChrov.scene.getScene('Menu').scene.restart());
  await sleep(900);
  await clickGame(640, 500);
  const migrated = await waitScene('World');
  await sleep(700);
  const m = await evalW7('return { day: w.clock.dayNumber, hp: Math.round(w.survival.stats.health), wood: w.inventory.inventory.count("wood"), kits: w.inventory.inventory.count("campfire_kit"), sticks: w.inventory.inventory.count("stick") };');
  check('old v1 save migrates and loads (day, stats, items, refunded kit)', migrated && m.day === 3 && m.hp === 77 && m.wood === 7 && m.kits === 1 && m.sticks === 2, JSON.stringify(m));
  // ---------- M8: the Heart Tree, the offering and the ending ----------
  const setClock = (d, h) => evalW7('w.clock.totalSeconds = (arg[0] - 1) * 480 + arg[1] * 20; w.nextWeatherAt = 0;', [d, h]);
  // (M15: the blight at the Heart is tested in its own block; here the offering itself is under test.)
  await evalW7('w.setFlags.blightCleared = true; w.encounters.clear(); w.survival.stats.health = 100; w.survival.stats.warmth = 100; w.survival.stats.hunger = 50; for (const t of w.gameData.tablets) w.quest.readTablet(t.id); w.nextQuestTargetAt = 0;');
  const hs = await evalW7('const h = w.gen.heartSite(); return { x: h.tx * 32 + 16, y: h.ty * 32 + 16 };');
  await setClock(3, 12);
  await teleport(hs.x, hs.y + 8 * 32);
  await sleep(2500);
  const ring = await evalW7(
    'const set = w.physics.world.staticBodies; return { roots: w.chunks.roots.length, heart: !!w.chunks.heart, stage: w.quest.stage, solid: w.chunks.roots.filter((r) => set.contains(r.zone.body)).length };',
  );
  check('the Heart glade holds the tree inside a closed ring of solid roots', ring.heart && ring.roots >= 20 && ring.solid === ring.roots && ring.stage === 'restore', JSON.stringify(ring));
  await page.screenshot({ path: OUT + '/27-heart-day.png' });
  await hold(['KeyW'], 1800);
  const blocked = await player();
  check('by day the standing roots block the way to the Heart Tree', Math.hypot(blocked.x - hs.x, blocked.y - hs.y) > 5.4 * 32, JSON.stringify({ blocked, hs }));
  // Diagonal approach must be sealed too (ring steps leave no gap).
  await teleport(hs.x + 6 * 32, hs.y + 6 * 32);
  await sleep(300);
  await hold(['KeyW', 'KeyA'], 1800);
  const diagRoot = await player();
  check("the root ring has no diagonal gap", Math.hypot(diagRoot.x - hs.x, diagRoot.y - hs.y) > 5.2 * 32, JSON.stringify(diagRoot));

  // Never trapped: standing inside the ring by day with no fire (e.g. an old save) lets you walk out.
  await teleport(hs.x, hs.y + 3 * 32);
  await sleep(500);
  await hold(['KeyS'], 2200);
  const escaped = await player();
  check('inside the ring by day without fire, the roots let you out (no softlock)', Math.hypot(escaped.x - hs.x, escaped.y - hs.y) > 7 * 32, JSON.stringify(escaped));
  await sleep(3500);
  const resealed = await evalW7('const set = w.physics.world.staticBodies; return w.chunks.roots.filter((r) => set.contains(r.zone.body)).length === w.chunks.roots.length;');
  check('once you leave, the ring closes again', resealed);

  // Night + a held torch: the roots shrink from the light and the way opens.
  await setClock(3, 22);
  await evalW7(
    'const inv = w.inventory.inventory; const s = inv.snapshot().map(() => null); s[0] = { item: "torch", qty: 1, durability: 170 }; s[1] = { item: "cooked_meat", qty: 2 }; s[2] = { item: "spirit_dust", qty: 3 }; inv.restore(s); w.inventory.selected = 0; w.inventory.broadcast();',
  );
  await teleport(hs.x, hs.y + 8 * 32);
  await sleep(900);
  await hold(['KeyW'], 2600);
  const lit = await evalW7('const p = w.player; return { withered: w.chunks.roots.filter((r) => r.withered).length, d: Math.hypot(p.x - arg.x, p.y - arg.y), target: w.interaction.current.kind };', hs);
  await page.screenshot({ path: OUT + '/28-roots-wither.png' });
  check('torchlight withers the roots and opens a path to the tree', lit.withered > 0 && lit.d < 3 * 32, JSON.stringify(lit));
  check('the Heart Tree is the interaction target up close', lit.target === 'heart', lit.target);
  // Holding the torch (not food) is refused with a hint.
  await page.keyboard.press('KeyE');
  await sleep(300);
  check('an offering needs held food and spirit dust', (await evalW7('return w.quest.stage;')) === 'restore');
  await evalW7('w.inventory.selected = 1; w.inventory.broadcast();');
  // Torch put away inside the ring: the roots must not regrow and trap the player.
  await sleep(3800);
  const ringOpen = await evalW7('return w.chunks.roots.filter((r) => r.withered).length;');
  check('roots never regrow while the player is inside the ring', ringOpen >= lit.withered, JSON.stringify({ ringOpen, before: lit.withered }));
  await page.keyboard.press('KeyE');
  const ended = await waitScene('Ending', 9000);
  check('the offering renews the promise and the ending plays', ended, '');
  await sleep(1500);
  await page.screenshot({ path: OUT + '/29-ending.png' });
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Space');
    await sleep(250);
  }
  await sleep(1900);
  const endText = await page.evaluate(() => window.__preyChrov.scene.getScene('Ending').children.list.filter((o) => o.type === 'Text' && o.visible).map((o) => o.text).join(' | '));
  await page.screenshot({ path: OUT + '/30-ending-summary.png' });
  check('Space presses that skip the epilogue never pick a button by accident', await sceneActive('Ending'));
  check('the ending shows a journey summary and credits with the fiction disclaimer', /Days survived/.test(endText) && /Stone tablets read: 5/.test(endText) && /work of fiction/.test(endText), endText.slice(0, 200));
  await page.evaluate(() => window.__preyChrov.scene.getScene('Ending').children.list.filter((o) => typeof o.activate === 'function')[0].activate());
  check('Continue surviving returns to the world', await waitScene('World', 9000));
  await sleep(1500);
  const afterEnd = await evalW7('const h = w.chunks.heart; return { stage: w.quest.stage, calmed: w.encounters.calmed, frame: h ? Number(h.image.frame.name) : -1, open: w.chunks.roots.every((r) => r.withered), dust: w.inventory.inventory.count("spirit_dust"), meat: w.inventory.inventory.count("cooked_meat") };');
  check('after the ending: quest done, tree restored, roots open, spirits calmed', afterEnd.stage === 'done' && afterEnd.calmed && afterEnd.frame === 1 && afterEnd.open, JSON.stringify(afterEnd));
  check('the offering consumed one food and two spirit dust', afterEnd.dust === 1 && afterEnd.meat === 1, JSON.stringify(afterEnd));

  // M7 QA: ambience is silenced while paused.
  await page.keyboard.press('Escape');
  await waitScene('Pause', 3000);
  await sleep(200);
  const duckedPaused = await page.evaluate(() => window.__preyAudio.ducked === true);
  await page.keyboard.press('Escape');
  await sleep(300);
  const duckedResumed = await page.evaluate(() => window.__preyAudio.ducked === true);
  check('pause silences the ambience; resume restores it', duckedPaused && !duckedResumed, JSON.stringify({ duckedPaused, duckedResumed }));

  // ---------- M9: cooking, fishing, medicine and ecological depth ----------
  await setClock(4, 10);
  await evalW7('w.encounters.clear(); w.survival.stats.health = 60; w.survival.stats.hunger = 50; w.survival.stats.thirst = 50;');
  // Find a deep-water tile near spawn with walkable land just south of it.
  const shore = await evalW7(`
    const c = w.chunks; const s = w.spawn;
    for (let r = 2; r < 30; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const tx = Math.floor(s.x / 32) + dx, ty = Math.floor(s.y / 32) + dy;
      const wx = tx * 32 + 16, wy = ty * 32 + 16;
      if (!c.isDeepWater(wx, wy)) continue;
      if (c.isDeepWater(wx, wy + 32) || c.isShallow(wx, wy + 32)) continue;
      const lx = wx, ly = ty * 32 + 32 + 12;
      if (w.physics.overlapRect(lx - 8, ly - 11, 16, 11, false, true).length) continue;
      return { x: lx, y: ly };
    }
    return null;`);
  check('a fishable shore exists near spawn', !!shore, JSON.stringify(shore));
  await evalW7(
    'const inv = w.inventory.inventory; const s = inv.snapshot().map(() => null); s[0] = { item: "fishing_rod", qty: 1, durability: 40 }; s[1] = { item: "bamboo_tube", qty: 2 }; s[2] = { item: "bitter_root", qty: 4 }; s[3] = { item: "healing_leaf", qty: 3 }; s[4] = { item: "plant_fiber", qty: 4 }; s[6] = { item: "campfire_kit", qty: 1 }; s[7] = { item: "cooking_pot_kit", qty: 1 }; inv.restore(s); w.inventory.selected = 0; w.inventory.broadcast();',
  );
  await teleport(shore.x, shore.y);
  await sleep(400);
  await hold(['KeyW'], 120);
  await sleep(150);
  const castPrompt = await evalW7('return ui.prompt.text;');
  check('holding a rod at deep water offers to cast', /Cast your line/.test(castPrompt), castPrompt);
  await page.keyboard.press('KeyE');
  await sleep(200);
  check('E casts the line and waits for a bite', (await evalW7('return w.fishing.phase;')) === 'waiting');
  await evalW7('w.fishing.biteAt = w.now;');
  await sleep(250);
  await page.screenshot({ path: OUT + '/31-fishing-bite.png' });
  const fish0 = await evalW7('return w.inventory.inventory.count("raw_fish");');
  // Put the marker on the zone centre, then pull in the same tick.
  await page.evaluate(() => {
    const w = window.__preyChrov.scene.getScene('World');
    const f = w.fishing;
    const cps = w.gameData.fishing.markerCyclesPerSecond;
    f.biteStart = w.now - (f.zoneCenter / 2 / cps) * 1000;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', key: 'e' }));
  });
  await sleep(900);
  const caught = await evalW7('const r = w.inventory.inventory.get(0); return { fish: w.inventory.inventory.count("raw_fish"), phase: w.fishing.phase, rod: r && r.durability };');
  check('pulling while the marker is in the green catches a fish (rod wears by 1)', caught.fish > fish0 && caught.phase === 'idle' && caught.rod === 39, JSON.stringify({ fish0, caught }));
  await page.keyboard.press('KeyE');
  await sleep(150);
  await page.keyboard.press('KeyE');
  await sleep(300);
  const early = await evalW7('const r = w.inventory.inventory.get(0); return { phase: w.fishing.phase, fish: w.inventory.inventory.count("raw_fish"), rod: r && r.durability };');
  check('pulling before a bite fails fairly (no fish, no rod wear, session ends)', early.phase === 'idle' && early.fish === caught.fish && early.rod === 39, JSON.stringify(early));
  // Mouse players: a left click pulls the line.
  await sleep(600);
  await page.keyboard.press('KeyE');
  await sleep(200);
  await evalW7('w.fishing.biteAt = w.now;');
  await sleep(150);
  const clickPt = await page.evaluate(() => {
    const w = window.__preyChrov.scene.getScene('World');
    const f = w.fishing;
    f.biteStart = w.now - (f.zoneCenter / 2 / w.gameData.fishing.markerCyclesPerSecond) * 1000;
    return true;
  });
  await clickGame(640, 200);
  await sleep(900);
  const clicked = await evalW7('return { fish: w.inventory.inventory.count("raw_fish"), phase: w.fishing.phase };');
  check('a mouse click pulls the line too', clickPt && clicked.fish > early.fish && clicked.phase === 'idle', JSON.stringify(clicked));

  // Water container.
  await evalW7('w.inventory.selected = 1; w.inventory.broadcast(); w.nextActAt = 0;');
  await sleep(700);
  const fillPrompt = await evalW7('return ui.prompt.text;');
  await page.keyboard.press('KeyE');
  await sleep(300);
  const tubes = await evalW7('const i = w.inventory.inventory; return { empty: i.count("bamboo_tube"), water: i.count("water_tube") };');
  check('a held bamboo tube fills at water', /Fill/.test(fillPrompt) && tubes.empty === 1 && tubes.water === 1, JSON.stringify({ fillPrompt, tubes }));

  // Campfire + cooking pot: stations, boiling, cooking, medicine.
  await evalW7('const p = w.player; w.structures.place("campfire", p.x - 40, p.y + 70); w.structures.place("cooking_pot", p.x + 40, p.y + 70); w.emitStructures();');
  await teleport(shore.x, shore.y + 60);
  await sleep(500);
  const st9 = await evalW7('return [...w.stations].sort().join(",");');
  check('a cooking pot is a crafting station next to the campfire', st9 === 'campfire,pot', st9);
  const craft = (id) => evalW7('ui.crafting.showRecipe(arg); ui.crafting.rows.find((r) => r.recipe.id === arg).button.activate();', id);
  await page.keyboard.press('KeyC');
  await sleep(200);
  await craft('boiled_water');
  await craft('cooked_fish');
  await sleep(100);
  await evalW7('ui.crafting.showRecipe("antidote");');
  await sleep(150);
  await page.screenshot({ path: OUT + '/32-crafting-medicine.png' });
  await craft('antidote');
  await craft('bandage');
  await sleep(150);
  const made = await evalW7('const i = w.inventory.inventory; return { boiled: i.count("boiled_water"), fish: i.count("cooked_fish"), antidote: i.count("antidote"), bandage: i.count("bandage"), tab: ui.crafting.activeTab };');
  check('boil water and grill fish at the campfire; brew an antidote at the pot; bind a bandage', made.fish >= 1 && made.antidote === 1 && made.bandage === 1, JSON.stringify(made));
  check('crafting is split into category tabs', made.tab === 'medicine');
  await page.keyboard.press('Escape');
  await sleep(200);

  // Antidote cures poison and gives the tube back; bandage heals.
  const slotOf = (id) => evalW7('return w.inventory.inventory.snapshot().findIndex((s) => s && s.item === arg);', id);
  await evalW7('w.effects.apply("poison", 60, { dps: 0.05 }); w.nextEffectsEmitAt = 0;');
  const aSlot = await slotOf('antidote');
  await evalW7('w.inventory.inventory.move(arg, 5); w.inventory.selected = 5; w.inventory.broadcast();', aSlot);
  const tubesBefore = await evalW7('return w.inventory.inventory.count("bamboo_tube");');
  await page.keyboard.press('KeyF');
  await sleep(250);
  const cured = await evalW7('return { poisoned: w.effects.has("poison"), tubes: w.inventory.inventory.count("bamboo_tube") };');
  check('the antidote cures poison and returns the bamboo tube', !cured.poisoned && cured.tubes === tubesBefore + 1, JSON.stringify(cured));
  const bSlot = await slotOf('bandage');
  await evalW7('w.inventory.inventory.move(arg, 5); w.inventory.selected = 5; w.inventory.broadcast();', bSlot);
  const hp0 = await evalW7('return w.survival.stats.health;');
  await page.keyboard.press('KeyF');
  await sleep(250);
  const hp1 = await evalW7('return w.survival.stats.health;');
  check('a bandage heals', hp1 >= hp0 + 20, JSON.stringify({ hp0, hp1 }));

  // Plant identification.
  const herb = await evalW7(`
    const list = w.chunks.nodes.filter((n) => n.def.id === 'healing_herb' && !n.depleted);
    if (list.length < 2) return null;
    const before = w.nodeLabel(list[0]);
    w.knownPlants.delete('healing_herb');
    const unknown = w.nodeLabel(list[0]);
    w.nextActAt = 0;
    w.gather(list[0]);
    return { before, unknown, known: w.knownPlants.has('healing_herb'), after: w.nodeLabel(list[1]), toast: ui.toast.text.text };`);
  check('unknown herbs are identified by gathering one', !!herb && /Unknown herb/.test(herb.unknown) && herb.known && /Healing Leaf/.test(herb.after) && /Identified/.test(herb.toast), JSON.stringify(herb));
  await evalW7('w.save();');
  const savedPlants = await page.evaluate(() => JSON.parse(localStorage.getItem('preychrov.save')).knownPlants);
  check('identified plants are saved', Array.isArray(savedPlants) && savedPlants.includes('healing_herb'), JSON.stringify(savedPlants));

  // ---------- M10: building, storage and persistent outposts ----------
  await setClock(5, 10);
  await evalW7('w.encounters.clear(); w.survival.stats.health = 100;');
  // A clear building spot near spawn: no solids within a generous box.
  const findClear = (near) =>
    evalW7(
      `const c = w.chunks;
      for (let r = 0; r < 40; r++) for (let a = 0; a < 16; a++) {
        const x = Math.round(arg.x + Math.cos(a / 16 * Math.PI * 2) * r * 32), y = Math.round(arg.y + Math.sin(a / 16 * Math.PI * 2) * r * 32);
        if (w.physics.overlapRect(x - 110, y - 90, 220, 150, false, true).length) continue;
        let wet = false;
        for (let dy = -96; dy <= 64 && !wet; dy += 16) for (let dx = -112; dx <= 112 && !wet; dx += 16) if (c.isDeepWater(x + dx, y + dy) || c.isShallow(x + dx, y + dy)) wet = true;
        if (wet) continue;
        if (w.structures.records.some((s) => Math.hypot(s.x - x, s.y - y) < 260)) continue;
        return { x, y };
      }
      return null;`,
      near,
    );
  const spawn10 = await evalW7('return { x: w.spawn.x, y: w.spawn.y };');
  const campA = await findClear({ x: spawn10.x + 260, y: spawn10.y - 260 });
  check('found a clear spot for camp A', !!campA, JSON.stringify(campA));
  await teleport(campA.x, campA.y);
  await sleep(500);
  await evalW7(
    'const inv = w.inventory.inventory; const s = inv.snapshot().map(() => null); s[0] = { item: "bamboo_wall_kit", qty: 4 }; s[1] = { item: "storage_chest_kit", qty: 2 }; s[2] = { item: "outpost_flag_kit", qty: 2 }; s[3] = { item: "thatch_roof_kit", qty: 1 }; s[4] = { item: "rain_collector_kit", qty: 1 }; s[5] = { item: "bamboo_bed_kit", qty: 1 }; s[6] = { item: "wood", qty: 7 }; s[7] = { item: "stone_axe", qty: 1, durability: 33 }; s[8] = { item: "bamboo", qty: 5 }; s[9] = { item: "workbench_kit", qty: 1 }; s[10] = { item: "berries", qty: 4 }; inv.restore(s); w.inventory.selected = 0; w.inventory.broadcast();',
  );
  // Real placement: F starts placing a wall, R rotates it, a click to the right places it (snapped).
  await page.keyboard.press('KeyF');
  await sleep(150);
  await page.keyboard.press('KeyR');
  await sleep(100);
  const rotated = await evalW7('return { active: w.building.active, rot: w.building.rot, frame: w.building.ghost.frame.name };');
  check('R rotates a wall during placement', rotated.active && rotated.rot === 1 && rotated.frame === 'wall_v', JSON.stringify(rotated));
  await page.mouse.move(640 + 120, 360 - 10);
  await sleep(200);
  const ghost = await evalW7('return { x: w.building.x, y: w.building.y, valid: w.building.valid };');
  await clickGame(640 + 120, 360 - 10);
  await sleep(250);
  const wallPlaced = await evalW7('const s = w.structures.records.find((r) => r.def.id === "bamboo_wall"); return s ? { x: s.x, y: s.y, rot: s.rot } : null;');
  check('walls snap to the grid and place rotated', !!wallPlaced && wallPlaced.rot === 1 && wallPlaced.x % 8 === 0 && wallPlaced.y % 8 === 0, JSON.stringify({ ghost, wallPlaced }));
  await page.keyboard.press('Escape');
  await sleep(150);
  // The rest of camp A (direct placement keeps the test independent of terrain).
  await evalW7(`
    const s = w.structures, a = arg;
    s.place('storage_chest', a.x - 60, a.y - 30);
    s.place('outpost_flag', a.x + 70, a.y - 40, { name: 'Outpost 1' });
    s.place('thatch_roof', a.x - 60, a.y - 10);
    s.place('rain_collector', a.x + 40, a.y + 40, { water: 0 });
    s.place('bamboo_bed', a.x - 30, a.y + 50);
    s.place('workbench', a.x + 80, a.y + 20);
    w.emitStructures(); w.emitOutposts();`, campA);
  await sleep(300);
  // Open the chest with E and store by clicking slots.
  await teleport(campA.x - 60, campA.y - 8);
  await sleep(300);
  await hold(['KeyW'], 80);
  await sleep(150);
  const chestPrompt = await evalW7('return ui.prompt.text;');
  await page.keyboard.press('KeyE');
  await sleep(250);
  const storageOpen = await evalW7('return { open: ui.storage.isOpen, modal: w.modalOpen };');
  check('E at a chest opens the storage panel', /Open the storage chest/.test(chestPrompt) && storageOpen.open && storageOpen.modal, JSON.stringify({ chestPrompt, storageOpen }));
  const clickSlot = async (which, i) => {
    const pos = await evalW7('const s = (arg[0] === "chest" ? ui.storage.chestSlots : ui.storage.playerSlots)[arg[1]]; return { x: s.x, y: s.y };', [which, i]);
    const p = await toPageXY(pos.x, pos.y);
    await page.mouse.click(p.x, p.y);
    await sleep(150);
  };
  await clickSlot('player', 6); // wood
  await clickSlot('player', 7); // stone axe (with durability)
  await page.screenshot({ path: OUT + '/33-storage.png' });
  await clickSlot('chest', 0); // take the wood back out…
  await clickSlot('player', 6); // …and store it again
  const chestA = await evalW7('const c = w.structures.records.find((r) => r.def.id === "storage_chest"); return c.storage.snapshot();');
  check('clicking stacks moves them between pack and chest (durability kept)', chestA.some((s) => s && s.item === 'wood' && s.qty === 7) && chestA.some((s) => s && s.item === 'stone_axe' && s.durability === 33), JSON.stringify(chestA));
  await page.keyboard.press('Escape');
  await sleep(200);
  check('Esc closes the storage panel', !(await evalW7('return ui.storage.isOpen || w.modalOpen;')));

  // Weathering: a monsoon day breaks an unroofed wall; the roofed chest area is protected; collector fills.
  await evalW7('w.weather.monsoon = true; w.weatherStructures(80);');
  const weathered = await evalW7(`
    const r = w.structures.records;
    const wall = r.find((s) => s.def.id === 'bamboo_wall'), col = r.find((s) => s.def.id === 'rain_collector'), roof = r.find((s) => s.def.id === 'thatch_roof');
    return { wall: wall.durability, broken: w.structures.isBroken(wall), solid: !!wall.zone, water: col.water, roof: roof.durability };`);
  check('the monsoon weathers an unroofed wall until it breaks (no longer solid); collectors fill', weathered.broken && !weathered.solid && weathered.water === 4 && weathered.roof === 16, JSON.stringify(weathered));
  await evalW7('w.weather.monsoon = false; const wall = w.structures.records.find((s) => s.def.id === "bamboo_wall"); w.repairStructure(wall);');
  const repaired = await evalW7('const wall = w.structures.records.find((s) => s.def.id === "bamboo_wall"); return { d: wall.durability, solid: !!wall.zone, bamboo: w.inventory.inventory.count("bamboo") };');
  check('R repairs a structure for one of its main material', repaired.d === 72 && repaired.solid && repaired.bamboo === 4, JSON.stringify(repaired));
  // Rainwater into a tube.
  await evalW7('w.inventory.inventory.add("bamboo_tube", 1); const i = w.inventory.inventory.snapshot().findIndex((s) => s && s.item === "bamboo_tube"); w.inventory.selected = i; w.inventory.broadcast(); const col = w.structures.records.find((s) => s.def.id === "rain_collector"); w.collectRain(col);');
  check('a rain collector fills a held tube with clean rainwater', (await evalW7('return w.inventory.inventory.count("rain_water");')) === 1);
  // Dismantle needs X twice and refunds about half.
  const benchRefund = await evalW7(`
    const b = w.structures.records.find((s) => s.def.id === 'workbench');
    const wood0 = w.inventory.inventory.count('wood');
    w.dismantle(b); const armed = w.structures.records.includes(b);
    w.dismantle(b); const gone = !w.structures.records.includes(b);
    return { armed, gone, wood: w.inventory.inventory.count('wood') - wood0 };`);
  check('X twice dismantles a structure and refunds about half its materials', benchRefund.armed && benchRefund.gone && benchRefund.wood === 3, JSON.stringify(benchRefund));

  // Camp B in a different chunk.
  const campB = await findClear({ x: campA.x + 1500, y: campA.y + 300 });
  check('found a clear spot for camp B (another chunk)', !!campB && Math.floor(campB.x / 1024) !== Math.floor(campA.x / 1024), JSON.stringify(campB));
  await teleport(campB.x, campB.y);
  await sleep(800);
  await evalW7(`
    const s = w.structures, b = arg;
    const chest = s.place('storage_chest', b.x, b.y - 20);
    chest.storage.add('berries', 4); chest.storage.add('rain_water', 1);
    s.place('outpost_flag', b.x + 50, b.y, { name: 'Outpost 2' });
    s.place('bamboo_wall', b.x - 48, b.y + 32, { rot: 1, durability: 40 });
    s.place('bamboo_wall', b.x - 48, b.y + 72, { durability: 0 });
    // A roof centred exactly on the chest's anchor (QA: must survive reload).
    s.place('thatch_roof', b.x, b.y - 20);
    w.emitStructures(); w.emitOutposts();`, campB);
  await sleep(300);
  const outposts = await evalW7('return { map: ui.minimap.outposts.length, journal: ui.journal.outpostLine };');
  check('outposts appear on the minimap and in the journal', outposts.map === 2 && /Outpost 1/.test(outposts.journal) && /Outpost 2/.test(outposts.journal), JSON.stringify(outposts));
  check('no creatures spawn near an outpost flag', (await evalW7('return w.outpostDistance(arg.x, arg.y) < 600 && !w.encounters.validSpot(w.gameData.enemies.get("wild_boar"), arg.x + 200, arg.y);', campB)) === true);

  // Leave both camps (their chunks unload), save, reload and Continue.
  const camps = () =>
    evalW7(`return w.structures.records.filter((s) => s.uid).map((s) => ({ type: s.def.id, x: s.x, y: s.y, rot: s.rot, uid: s.uid, d: s.durability, water: s.water, name: s.name, storage: s.storage ? JSON.stringify(s.storage.snapshot()) : null })).sort((a, b) => a.uid - b.uid);`);
  await teleport(campA.x - 6000, campA.y + 4000);
  await sleep(1500);
  const unloaded = await evalW7('return w.structures.list.filter((s) => s.def.id === "storage_chest").length;');
  check('walking away unloads both camps (records stay)', unloaded === 0);
  const before10 = await camps();
  await evalW7('w.save();');
  await page.reload();
  await waitScene('Menu', 15000);
  await sleep(800);
  await clickGame(640, 500);
  await waitScene('World');
  await sleep(900);
  const after10 = await camps();
  check('reload recovers both camps exactly: structures, rotation, weathering, chest items, water, outpost names', JSON.stringify(after10) === JSON.stringify(before10) && before10.length >= 9, JSON.stringify({ n: before10.length, diff: JSON.stringify(after10) === JSON.stringify(before10) ? '' : JSON.stringify(after10).slice(0, 400) }));
  await teleport(campB.x, campB.y + 40);
  await sleep(1200);
  const campBLive = await evalW7('return w.structures.list.filter((s) => Math.hypot(s.x - arg.x, s.y - arg.y) < 200).map((s) => s.def.id).sort().join(",");', campB);
  check('returning to camp B rebuilds it in the world (roof on the chest anchor kept)', campBLive === 'bamboo_wall,bamboo_wall,outpost_flag,storage_chest,thatch_roof', campBLive);
  const brokenWall = await evalW7('const wl = w.structures.list.find((s) => s.def.id === "bamboo_wall" && s.durability === 0); return wl ? { solid: !!wl.zone, broken: w.structures.isBroken(wl) } : null;');
  check('a broken wall stays non-solid after reload', !!brokenWall && brokenWall.broken && !brokenWall.solid, JSON.stringify(brokenWall));
  const chestB = await evalW7('const c = w.structures.list.find((s) => s.def.id === "storage_chest" && Math.hypot(s.x - arg.x, s.y - arg.y) < 200); return c ? c.storage.count("berries") : -1;', campB);
  check('the chest under the roof kept its items', chestB === 4, String(chestB));
  await page.screenshot({ path: OUT + '/34-camp-b.png' });
  await teleport(campA.x, campA.y + 20);
  await sleep(1200);
  await page.screenshot({ path: OUT + '/35-camp-a.png' });

  // ---------- M11: equipment, gear upgrades and progression ----------
  await setClock(6, 10);
  await evalW7('w.encounters.clear(); w.survival.stats.health = 100;');
  const home11 = await findClear({ x: spawn10.x - 300, y: spawn10.y + 300 });
  await teleport(home11.x, home11.y);
  await sleep(500);
  await evalW7(
    'const inv = w.inventory.inventory; const s = inv.snapshot().map(() => null); s[0] = { item: "hide", qty: 4 }; s[1] = { item: "plant_fiber", qty: 12 }; s[2] = { item: "flint", qty: 4 }; s[3] = { item: "wood", qty: 4 }; s[4] = { item: "tiger_fang", qty: 1 }; s[5] = { item: "bamboo", qty: 4 }; inv.restore(s); w.inventory.selected = 0; w.inventory.broadcast(); w.progression.knowledge.delete("flint_working"); w.progression.xp.crafting = 0; w.applyProgressionEffects(); w.nextKnowledgeAt = 0; w.nextWeatherAt = 0;',
  );
  await evalW7('w.structures.place("workbench", w.player.x + 40, w.player.y - 30); w.emitStructures();');
  await sleep(1400);
  const know = await evalW7('return [...w.progression.knowledge].sort().join(",");');
  check('owning a hide and a tiger fang teaches tanning and fang craft (knowledge, not time)', /fang_craft/.test(know) && /tanning/.test(know) && !/flint_working/.test(know), know);
  await page.keyboard.press('KeyC');
  await sleep(200);
  await evalW7('ui.crafting.showRecipe("flint_axe");');
  await sleep(150);
  await page.screenshot({ path: OUT + '/36-gear-tab.png' });
  const lockedText = await evalW7('const r = ui.crafting.rows.find((r) => r.recipe.id === "flint_axe"); return r.name.text + " | " + r.needs.text;');
  await craft('flint_axe');
  const lockedAxe = await evalW7('return w.inventory.inventory.count("flint_axe");');
  check('an unlearned recipe is shown locked with its hint and cannot be crafted', /learn Flint working/.test(lockedText) && lockedAxe === 0, lockedText);
  // Reaching Crafting 1 teaches flint working; crafted tools gain the crafting durability bonus.
  await evalW7('w.progression.xp.crafting = w.gameData.progression.levels[0]; w.applyProgressionEffects(); w.checkKnowledge();');
  await craft('flint_axe');
  await craft('hide_vest');
  await sleep(150);
  const made11 = await evalW7('const i = w.inventory.inventory; const a = i.snapshot().find((s) => s && s.item === "flint_axe"); return { axe: a && a.durability, vest: i.count("hide_vest"), wear: w.fx.toolWear };');
  check('Crafting 1 unlocks flint tools (full 160 durability) and tools wear 10% slower', made11.axe === 160 && made11.vest === 1 && Math.abs(made11.wear - 0.9) < 1e-9, JSON.stringify(made11));
  await page.keyboard.press('Escape');
  await sleep(150);
  // Wear the vest (F) and take a hit.
  const vestSlot = await slotOf('hide_vest');
  await evalW7('w.inventory.inventory.move(arg, 5); w.inventory.selected = 5; w.inventory.broadcast();', vestSlot);
  await page.keyboard.press('KeyF');
  await sleep(200);
  const hit = await evalW7('const h0 = w.survival.stats.health; w.playerInvulnUntil = 0; w.hurtPlayer(12, "wildlife", w.player.x + 20, w.player.y); return { worn: w.equipment.body && w.equipment.body.item, lost: Math.round((h0 - w.survival.stats.health) * 10) / 10, pack: w.inventory.inventory.count("hide_vest") };');
  check('F wears the hide vest; it measurably reduces damage (12 → 9)', hit.worn === 'hide_vest' && hit.lost === 9 && hit.pack === 0, JSON.stringify(hit));
  // Repair a worn tool at the workbench (R) for one flint.
  const flintSlot = await slotOf('flint_axe');
  await evalW7('w.inventory.inventory.move(arg, 4); w.inventory.selected = 4; w.inventory.inventory.setDurability(4, 20); w.inventory.broadcast();', flintSlot);
  const flint0 = await evalW7('return w.inventory.inventory.count("flint");');
  await evalW7('w.repairHeldTool();');
  const rep11 = await evalW7('return { d: w.inventory.inventory.get(4).durability, flint: w.inventory.inventory.count("flint") };');
  check('R at the workbench repairs a held tool by half its durability for one main material', rep11.d === 100 && rep11.flint === flint0 - 1, JSON.stringify({ flint0, rep11 }));
  // No grind: repeats are capped per day.
  const repeats = await evalW7('let n = 0; for (let i = 0; i < 10; i++) if (w.grant("defeat", null)) n++; return n;');
  check('repeat XP is capped per in-game day (no grinding)', repeats <= 3, String(repeats));
  // Character panel.
  await page.keyboard.press('KeyK');
  await sleep(250);
  const charText = await evalW7('return { open: ui.character.isOpen, gear: ui.character.gearText.body.text, skills: ui.character.skillsText.text };');
  await page.screenshot({ path: OUT + '/37-character.png' });
  check('K shows worn gear and the five skills', charText.open && /Hide Vest/.test(charText.gear) && /Exploration/.test(charText.skills), JSON.stringify(charText).slice(0, 200));
  await page.keyboard.press('KeyK');
  await sleep(150);
  // Reload keeps everything and nothing can be re-earned.
  const prog = () => evalW7('return JSON.stringify({ p: w.progression.serialize(), body: w.equipment.body, axe: w.inventory.inventory.snapshot().find((s) => s && s.item === "flint_axe") });');
  const prog0 = await prog();
  await evalW7('w.save();');
  await page.reload();
  await waitScene('Menu', 15000);
  await sleep(800);
  await clickGame(640, 500);
  await waitScene('World');
  await sleep(900);
  const prog1 = await prog();
  const p0 = JSON.parse(prog0);
  const p1 = JSON.parse(prog1);
  check('reload keeps skills, knowledge, worn gear and upgraded tool durability', JSON.stringify(p0.p.xp) === JSON.stringify(p1.p.xp) && JSON.stringify(p0.p.knowledge) === JSON.stringify(p1.p.knowledge) && p1.body && p1.body.item === 'hide_vest' && p1.axe && p1.axe.durability === 100, prog1.slice(0, 300));
  const again = await evalW7('return w.grant("craft_first", "flint_axe") || w.grant("craft_first", "hide_vest");');
  check('one-time XP cannot be earned again after a reload', again === false);

  // ---------- M12: stealth, awareness and dynamic encounters ----------
  await setClock(7, 11);
  await evalW7('w.encounters.clear(); w.survival.stats.health = 100; w.inventory.inventory.restore([]); w.inventory.broadcast();');
  // A bush to hide in, with open ground to its east for the tiger.
  const hide = await evalW7(`
    const bushes = w.chunks.nodes.filter((n) => n.def.sprite === 'bush');
    for (const b of bushes) {
      const x = b.prop.x, y = b.prop.y + 14;
      if (w.physics.overlapRect(x - 8, y - 11, 16, 11, false, true).length) continue;
      if (w.physics.overlapRect(x + 120, y - 30, 60, 40, false, true).length) continue;
      if (w.chunks.isDeepWater(x + 140, y) || w.chunks.isDeepWater(x + 70, y)) continue;
      return { x, y };
    }
    return null;`);
  check('found a bush with open ground beside it', !!hide, JSON.stringify(hide));
  await teleport(hide.x, hide.y);
  await sleep(400);
  await page.keyboard.down('KeyZ');
  await sleep(500);
  const tigerId = await evalW7('const e = w.encounters.spawnAt("tiger", arg.x + 140, arg.y, w.now); return w.encounters.enemies.indexOf(e);', hide);
  const tigerState = () => evalW7('const e = w.encounters.enemies[arg]; return { state: e.aiState, aw: Math.round(e.awareness * 100) / 100, d: Math.round(Math.hypot(e.x - w.player.x, e.y - w.player.y)), hidden: w.hidden, noise: w.noise };', tigerId);
  // Keep the tiger roughly in place (it wanders) so the test measures perception, not luck.
  const pinTiger = () => evalW7('const e = w.encounters.enemies[arg[0]]; if (e.aiState === "wander") { e.body.reset(arg[1].x + 140, arg[1].y); }', [tigerId, hide]);
  let maxAw = 0;
  for (let i = 0; i < 12; i++) {
    await pinTiger();
    await sleep(250);
    const s = await tigerState();
    maxAw = Math.max(maxAw, s.aw);
  }
  const hiddenState = await tigerState();
  await page.screenshot({ path: OUT + '/38-hidden.png' });
  check('crouched and still in a bush, a tiger 140 px away never notices you', hiddenState.hidden && maxAw < 1 && hiddenState.state !== 'chase' && hiddenState.state !== 'telegraph', JSON.stringify({ hiddenState, maxAw }));
  await page.keyboard.up('KeyZ');
  // Now step out into the open (away from the bush) and walk about: it spots you.
  await evalW7('const e = w.encounters.enemies[arg]; e.awareness = 0; e.body.reset(arg2.x + 200, arg2.y);'.replace('arg2', 'arg[1]').replace('arg2', 'arg[1]').replace('enemies[arg]', 'enemies[arg[0]]'), [tigerId, hide]);
  await teleport(hide.x + 60, hide.y);
  await sleep(200);
  let spotted = null;
  for (let i = 0; i < 16 && !spotted; i++) {
    await hold([i % 2 ? 'KeyW' : 'KeyS'], 200);
    const s = await tigerState();
    if (s.state === 'chase' || s.state === 'telegraph' || s.aw >= 1) spotted = s;
  }
  check('walking in the open at the same distance gets you spotted ("!")', !!spotted && spotted.hidden === false, JSON.stringify(spotted));
  await evalW7('w.encounters.clear();');
  // Noise: sprint > walk > crouch.
  const noiseOf = async (keys) => {
    for (const k of keys) await page.keyboard.down(k);
    await sleep(350);
    const n = await evalW7('return w.noise;');
    for (const k of keys) await page.keyboard.up(k);
    await sleep(200);
    return n;
  };
  const nCrouch = await noiseOf(['KeyZ', 'KeyD']);
  const nWalk = await noiseOf(['KeyA']);
  const nSprint = await noiseOf(['ShiftLeft', 'KeyD']);
  check('footstep noise: crouch < walk < sprint', nCrouch < nWalk && nWalk < nSprint, JSON.stringify({ nCrouch, nWalk, nSprint }));
  // Investigation: a boar just out of sight hears you working and comes to look ("?").
  const invId = await evalW7(`
    const p = w.player;
    const e = w.encounters.spawnAt('wild_boar', p.x + 165, p.y, w.now);
    return w.encounters.enemies.indexOf(e);`);
  let sawInvestigate = false;
  for (let i = 0; i < 10 && !sawInvestigate; i++) {
    await evalW7('w.player.swing(w.player.x + 10, w.player.y, w.now, 300); const e = w.encounters.enemies[arg]; if (e.aiState === "wander") e.body.reset(w.player.x + 165, w.player.y);', invId);
    await sleep(150);
    sawInvestigate = (await evalW7('return w.encounters.enemies[arg].aiState;', invId)) === 'investigate';
  }
  await page.screenshot({ path: OUT + '/39-investigate.png' });
  check('a creature that only hears you comes to investigate ("?") before attacking', sawInvestigate);
  await evalW7('w.encounters.clear();');
  // Not stuck on solid geometry: a boar chasing into a wall either goes around or gives up.
  const stuck = await evalW7(`
    const p = w.player;
    const wx = Math.round((p.x + 60) / 8) * 8;
    for (const dy of [-48, -16, 16, 48]) w.structures.place('bamboo_wall', wx, Math.round((p.y + dy) / 8) * 8, { rot: 1 });
    const e = w.encounters.spawnAt('wild_boar', p.x + 110, p.y, w.now);
    e.awareness = 1; e.aiState = 'chase';
    return { id: w.encounters.enemies.indexOf(e), x: e.x, y: e.y };`);
  const track = [];
  for (let i = 0; i < 14; i++) {
    await sleep(300);
    track.push(await evalW7('const e = w.encounters.enemies[arg]; return { x: e.x, y: e.y, s: e.aiState, a: e.active };', stuck.id));
  }
  const stuckMoved = Math.max(...track.map((t) => Math.hypot(t.x - stuck.x, t.y - stuck.y)));
  const states = [...new Set(track.map((t) => t.s))].join(',');
  check('AI does not stay pinned against solid geometry (goes around or gives up)', stuckMoved > 24 || /wander|return|investigate/.test(states), JSON.stringify({ stuckMoved: Math.round(stuckMoved), states }));
  await evalW7('w.encounters.clear(); for (const s of w.structures.records.filter((r) => r.def.id === "bamboo_wall" && Math.hypot(r.x - w.player.x, r.y - w.player.y) < 120)) w.structures.remove(s); w.emitStructures();');
  // Territory: wildlife beyond its territory gives up and heads home.
  const terr = await evalW7(`
    const p = w.player;
    const e = w.encounters.spawnAt('wild_boar', p.x + 100, p.y, w.now);
    e.homeX = e.x + 900; e.awareness = 1; e.aiState = 'chase';
    return w.encounters.enemies.indexOf(e);`);
  await sleep(400);
  check('wildlife outside its territory gives up and returns home', (await evalW7('return w.encounters.enemies[arg].aiState;', terr)) === 'return');
  await evalW7('w.encounters.clear();');
  // Elites.
  const elite = await evalW7('const e = w.encounters.spawnAt("wild_boar", w.player.x + 300, w.player.y, w.now, true); const r = { hp: e.hp, base: e.def.hp, tint: e.tintTopLeft, scale: e.scaleX }; w.encounters.clear(); return r;');
  check('elite variants are tougher and visibly marked', elite.hp > elite.base && elite.scale > 1 && elite.tint !== 0xffffff, JSON.stringify(elite));
  // Night ambush with fair warning; spirits patrol.
  await setClock(7, 22);
  await sleep(600);
  const ambBefore = await evalW7('return w.encounters.aliveCount;');
  // (This world finished the story earlier; restored Hearts calm the night, so lift that for the test.)
  await evalW7('w.quest.restored = false;');
  await evalW7('w.startAmbushWarning();');
  await sleep(200);
  const warnText = await evalW7('return ui.toast.text.text;');
  const ambEarly = await evalW7('return w.encounters.aliveCount;');
  await evalW7('w.ambushAt = w.now + 50;');
  await sleep(600);
  const amb = await evalW7('const p = w.player; const act = w.encounters.enemies.filter((e) => e.active); return { n: w.encounters.aliveCount, minD: Math.min(...act.map((e) => Math.hypot(e.x - p.x, e.y - p.y))), lightShy: act.every((e) => e.def.avoidsLight), d0: act.map((e) => Math.hypot(e.x - p.x, e.y - p.y)) };');
  await sleep(1500);
  const ambLater = await evalW7('const p = w.player; return w.encounters.enemies.filter((e) => e.active).map((e) => Math.hypot(e.x - p.x, e.y - p.y));');
  check('ambushers are light-shy spirits that close in on where you are', amb.lightShy && ambLater.length > 0 && Math.min(...ambLater) < Math.min(...amb.d0), JSON.stringify({ d0: amb.d0.map(Math.round), later: ambLater.map(Math.round) }));
  const noAmbushAfterHeart = await evalW7('w.quest.restored = true; return w.ambushAllowed(w.player.x, w.player.y);');
  check('no ambushes once the Heart is restored', noAmbushAfterHeart === false);
  check('night ambush: a warning first (nothing yet), then creatures on a ring around you', /something is circling/.test(warnText) && ambEarly === ambBefore && amb.n > ambBefore && amb.minD >= 250, JSON.stringify({ warnText, ambBefore, ambEarly, amb }));
  await evalW7('w.encounters.clear();');
  const patrol = await evalW7('const e = w.encounters.spawnAt("ap", w.player.x + 400, w.player.y, w.now); return w.encounters.enemies.indexOf(e);');
  const pa0 = await evalW7('const e = w.encounters.enemies[arg]; return { x: e.x, y: e.y };', patrol);
  await sleep(2000);
  const pa1 = await evalW7('const e = w.encounters.enemies[arg]; return { x: e.x, y: e.y, hx: e.homeX, hy: e.homeY, s: e.aiState };', patrol);
  check('spirits patrol a loop around where they appeared', Math.hypot(pa1.x - pa0.x, pa1.y - pa0.y) > 15 && Math.hypot(pa1.x - pa1.hx, pa1.y - pa1.hy) < 180, JSON.stringify({ pa0, pa1 }));
  await evalW7('w.encounters.clear();');
  await setClock(7, 11);

  // ---------- M13: exploration tools, mapping and ruins ----------
  await setClock(8, 10);
  await evalW7('w.encounters.clear(); w.survival.stats.health = 100; w.inventory.inventory.restore([]); w.inventory.broadcast();');
  const home13 = await evalW7('return { x: w.player.x, y: w.player.y };');
  const explored0 = await evalW7('return w.explored.size;');
  check('fog of war: the ground you have walked is recorded', explored0 > 0, String(explored0));
  // Full map: open, add a marker by clicking, remove it by clicking again.
  await page.keyboard.press('KeyM');
  await sleep(400);
  const mapOpen = await evalW7('return ui.map.isOpen && w.modalOpen;');
  await page.screenshot({ path: OUT + '/40-map.png' });
  const mk = await evalW7('return ui.map.worldToScreen(w.player.x + 2000, w.player.y - 1200);');
  await clickGame(mk.x, mk.y);
  await sleep(250);
  const added = await evalW7('return w.markers.length;');
  await clickGame(mk.x, mk.y);
  await sleep(250);
  const removed = await evalW7('return w.markers.length;');
  check('M opens the map; clicking adds a marker and clicking it again removes it', mapOpen && added === 1 && removed === 0, JSON.stringify({ mapOpen, added, removed }));
  await clickGame(mk.x, mk.y);
  await sleep(200);
  await page.keyboard.press('KeyM');
  await sleep(200);
  // Navigation note (F) and compass pointers.
  await evalW7('w.inventory.add("nav_note", 1); w.inventory.add("compass", 1); const i = w.inventory.inventory.snapshot().findIndex((s) => s && s.item === "nav_note"); w.inventory.inventory.move(i, 0); w.inventory.selected = 0; w.inventory.broadcast();');
  await page.keyboard.press('KeyF');
  await sleep(300);
  const note = await evalW7('const m = w.markers.find((x) => x.kind === "note"); return m ? m.text : null;');
  check('a navigation note marks where you stand with the place and day', !!note && /day/.test(note), String(note));
  await evalW7('w.nextWeatherAt = 0;');
  await sleep(700);
  const ptr = await evalW7('return { n: ui.pointers.length, vis: ui.pointerT.some((t) => t.visible), text: ui.pointerT.map((t) => t.text).join("|") };');
  check('carrying a compass points the way to far markers on screen', ptr.n >= 1 && ptr.vis && /m/.test(ptr.text), JSON.stringify(ptr));

  // A ruin puzzle end to end (lamps or plates), then the reliquary.
  const ruin13 = await evalW7(`
    const t = { x: Math.floor(w.player.x / 32), y: Math.floor(w.player.y / 32) };
    const sites = w.gen.ruinsNear(t.x, t.y, 700).sort((a, b) => Math.hypot(a.tx - t.x, a.ty - t.y) - Math.hypot(b.tx - t.x, b.ty - t.y));
    const s = sites[0];
    const key = s.tx + ',' + s.ty;
    const plan = w.planFor(key);
    return { tx: s.tx, ty: s.ty, key, puzzle: plan.puzzle, layout: plan.layout, order: plan.order, traps: plan.traps };`);
  await teleport(ruin13.tx * 32 + 16, (ruin13.ty + 9) * 32 + 16);
  await sleep(1500);
  const feats = await evalW7('return w.chunks.features.filter((f) => f.ruin === arg).map((f) => ({ kind: f.kind, fid: f.fid, x: f.x, y: f.y, key: f.key }));', ruin13.key);
  check('a ruin holds its puzzle pieces and a sealed reliquary (' + ruin13.layout + ', ' + ruin13.puzzle + ')', feats.some((f) => f.kind === 'reliquary') && feats.some((f) => f.kind === (ruin13.puzzle === 'lamps' ? 'lamp' : 'plate')), JSON.stringify(feats.map((f) => f.kind)));
  const sealed = await evalW7('const r = w.chunks.features.find((f) => f.ruin === arg && f.kind === "reliquary"); w.useFeature(r); return w.openedChests.has("reliquary@" + arg);', ruin13.key);
  if (ruin13.puzzle === 'lamps') {
    // A wrong first lamp resets; the order on the glyph stone solves it.
    const wrong = ruin13.order[1];
    await evalW7('const f = w.chunks.features.find((x) => x.ruin === arg[0] && x.kind === "lamp" && x.fid === arg[1]); w.useFeature(f);', [ruin13.key, wrong]);
    const reset = await evalW7('return { prog: (w.lampProgress.get(arg) || []).length, toast: ui.toast.text.text };', ruin13.key);
    const glyph = await evalW7('const g = w.chunks.features.find((x) => x.ruin === arg && x.kind === "glyph"); w.useFeature(g); return ui.toast.text.text;', ruin13.key);
    for (const sym of ruin13.order) await evalW7('const f = w.chunks.features.find((x) => x.ruin === arg[0] && x.kind === "lamp" && x.fid === arg[1]); w.useFeature(f);', [ruin13.key, sym]);
    check('lamps: a wrong order resets; the glyph stone gives the order that solves it', reset.prog === 0 && /order was wrong/.test(reset.toast) && /then/.test(glyph), JSON.stringify({ reset, glyph }));
  } else {
    // Step on every plate within the time window.
    const plates = feats.filter((f) => f.kind === 'plate');
    for (const p of plates) {
      await teleport(p.x, p.y + 2);
      await sleep(260);
    }
  }
  await sleep(200);
  const solved = await evalW7('return w.found.puzzles.has(arg);', ruin13.key);
  await page.screenshot({ path: OUT + '/41-ruin-solved.png' });
  const opened = await evalW7('const r = w.chunks.features.find((f) => f.ruin === arg && f.kind === "reliquary"); w.useFeature(r); return w.openedChests.has("reliquary@" + arg);', ruin13.key);
  check('solving the puzzle unseals the reliquary (sealed before, opens after)', !sealed && solved && opened, JSON.stringify({ sealed, solved, opened }));

  // Spike traps telegraph, then hurt only while up.
  const trapRuin = await evalW7(`
    const t = { x: Math.floor(w.player.x / 32), y: Math.floor(w.player.y / 32) };
    const s = w.gen.ruinsNear(t.x, t.y, 2500).find((r) => w.planFor(r.tx + ',' + r.ty).traps);
    return s ? { tx: s.tx, ty: s.ty, key: s.tx + ',' + s.ty } : null;`);
  if (trapRuin) {
    await teleport(trapRuin.tx * 32 + 16, (trapRuin.ty + 11) * 32 + 16);
    await sleep(1500);
    const trapTest = await evalW7(`
      const tr = w.chunks.features.find((f) => f.ruin === arg && f.kind === 'trap');
      if (!tr) return null;
      w.survival.stats.health = 100;
      w.player.body.reset(tr.x, tr.y + 2);
      return { x: tr.x, y: tr.y };`, trapRuin.key);
    const phases = new Set();
    let hurt = false;
    for (let i = 0; i < 24 && trapTest; i++) {
      await evalW7('w.player.body.reset(arg.x, arg.y + 2);', trapTest);
      await sleep(150);
      const s = await evalW7('const tr = w.chunks.features.find((f) => f.kind === "trap" && Math.abs(f.x - arg.x) < 1); return { f: tr.image.frame.name, hp: w.survival.stats.health };', trapTest);
      phases.add(s.f);
      if (s.hp < 100) hurt = true;
    }
    check('spike traps cycle down → warn (glint) → up, and hurt only while up', !!trapTest && phases.has('trap_warn') && phases.has('trap_up') && phases.has('trap_down') && hurt, JSON.stringify({ phases: [...phases], hurt }));
    await evalW7('w.survival.stats.health = 100;');
  } else check('spike traps exist in some ruin nearby', false, 'no trap ruin within range');

  // A hidden cache in loose stones.
  const secretRuin = await evalW7(`
    const t = { x: Math.floor(w.player.x / 32), y: Math.floor(w.player.y / 32) };
    const s = w.gen.ruinsNear(t.x, t.y, 2500).find((r) => w.planFor(r.tx + ',' + r.ty).features.some((f) => f.kind === 'secret'));
    return s ? { tx: s.tx, ty: s.ty, key: s.tx + ',' + s.ty } : null;`);
  if (secretRuin) {
    await teleport(secretRuin.tx * 32 + 16, (secretRuin.ty + 11) * 32 + 16);
    await sleep(1500);
    const cache = await evalW7('const f = w.chunks.features.find((x) => x.ruin === arg && x.kind === "secret"); if (!f) return null; const before = w.pickups.activeCount; w.useFeature(f); return { found: w.openedChests.has("secret@" + f.key), loot: w.pickups.activeCount - before, frame: f.image.frame.name };', secretRuin.key);
    await sleep(100);
    check('loose stones hide a one-time cache', !!cache && cache.found && cache.loot > 0, JSON.stringify(cache));
  } else check('a ruin with a hidden cache exists nearby', false, 'none in range');

  // A landmark: walk up to it to discover it.
  const lm13 = await evalW7(`
    const t = { x: Math.floor(w.player.x / 32), y: Math.floor(w.player.y / 32) };
    let best = null;
    for (let cy = -4; cy <= 4; cy++) for (let cx = -4; cx <= 4; cx++) {
      const l = w.gen.landmarkInCell(Math.floor(t.x / 128) + cx, Math.floor(t.y / 128) + cy);
      if (l && (!best || Math.hypot(l.tx - t.x, l.ty - t.y) < Math.hypot(best.tx - t.x, best.ty - t.y))) best = l;
    }
    return best;`);
  await teleport(lm13.tx * 32 + 16, (lm13.ty + 3) * 32 + 16);
  await sleep(1500);
  await evalW7('w.nextWeatherAt = 0;');
  await sleep(700);
  const lmFound = await evalW7('return { n: w.found.landmarks.size, toast: ui.toast.text.text, live: w.chunks.landmarks.length };');
  await page.screenshot({ path: OUT + '/42-landmark.png' });
  check('walking up to a rare landmark discovers it (toast + map)', lmFound.n >= 1 && lmFound.live >= 1, JSON.stringify(lmFound));

  // A river shortcut (stepping stones).
  const step13 = await evalW7(`
    const t = { x: Math.floor(w.player.x / 32), y: Math.floor(w.player.y / 32) };
    for (let r = 0; r < 260; r += 1) for (let ty = t.y - r; ty <= t.y + r; ty += Math.max(1, 2 * r)) for (let tx = t.x - r; tx <= t.x + r; tx++) if (w.gen.steppingAt(tx, ty)) return { tx, ty };
    return null;`);
  if (step13) {
    await teleport(step13.tx * 32 + 16, step13.ty * 32 + 20);
    await sleep(1200);
    await evalW7('w.player.body.reset(arg.tx * 32 + 16, arg.ty * 32 + 20); w.nextWeatherAt = 0;', step13);
    await sleep(700);
    const sc = await evalW7('return w.found.shortcuts.size;');
    await page.screenshot({ path: OUT + '/43-stepping-stones.png' });
    check('crossing hidden stepping stones discovers a river shortcut', sc >= 1, JSON.stringify({ step13, sc }));
  } else check('a stepping-stone shortcut exists within range', false, 'none found');

  // Trail sign on the map.
  await evalW7('w.structures.place("trail_sign", w.player.x + 40, w.player.y + 40); w.emitStructures();');
  const md = await evalW7('return w.mapData();');
  check('the map lists outposts, ruins, landmarks, shortcuts, trail signs and markers', md.ruins.length >= 1 && md.landmarks.length >= 1 && md.signs.length >= 1 && md.markers.length >= 2, JSON.stringify({ r: md.ruins.length, l: md.landmarks.length, s: md.shortcuts.length, signs: md.signs.length, m: md.markers.length }));

  // Reload preserves discoveries.
  const ex0 = await evalW7('return JSON.stringify({ e: w.explored.size, r: [...w.found.ruins].sort(), l: [...w.found.landmarks].sort(), s: [...w.found.shortcuts].sort(), p: [...w.found.puzzles].sort(), m: w.markers, rel: w.openedChests.has("reliquary@" + arg) });', ruin13.key);
  await evalW7('w.save();');
  await page.reload();
  await waitScene('Menu', 15000);
  await sleep(800);
  await clickGame(640, 500);
  await waitScene('World');
  await sleep(900);
  const ex1 = await evalW7('return JSON.stringify({ e: w.explored.size, r: [...w.found.ruins].sort(), l: [...w.found.landmarks].sort(), s: [...w.found.shortcuts].sort(), p: [...w.found.puzzles].sort(), m: w.markers, rel: w.openedChests.has("reliquary@" + arg) });', ruin13.key);
  check('reload preserves the explored map, discoveries, solved puzzles, opened reliquaries and markers', ex0 === ex1, ex1.slice(0, 200));
  await teleport(home13.x, home13.y);
  await sleep(800);

  // ---------- M14: side stories, memories and choices ----------
  await setClock(9, 10);
  await evalW7('w.storiesEnabled = true; w.encounters.clear(); w.sideQuests = new w.sideQuests.constructor(w.gameData.sidequests); w.storyFlags.clear(); w.endingLines = []; w.emitSideQuests();');
  const storyOpen = () => evalW7('return { open: ui.story !== null, modal: w.modalOpen };');
  // Ash and Timber: offered after sleeping; accepted with Enter (focus starts on "Follow it").
  await evalW7('w.storyEvent("sleep");');
  await sleep(400);
  const storyOffer = await storyOpen();
  await page.screenshot({ path: OUT + '/44-story-storyOffer.png' });
  await page.keyboard.press('Escape');
  await sleep(200);
  const storyStill = await storyOpen();
  await page.keyboard.press('Enter');
  await sleep(300);
  const ash = await evalW7('return w.sideQuests.state.get("ash_and_timber");');
  check('a side story is offered after an event; Esc cannot skip it; Enter accepts', storyOffer.open && storyOffer.modal && storyStill.open && ash.status === 'active', JSON.stringify({ storyOffer, storyStill, ash }));
  await evalW7('w.storyEvent("landmark"); w.storyEvent("outpost");');
  await sleep(400);
  const atChoice = await evalW7('return { open: ui.story !== null, mem: w.sideQuests.memories().length };');
  await page.screenshot({ path: OUT + '/45-story-choice.png' });
  const explored14 = await evalW7('return w.explored.size;');
  await page.keyboard.press('ArrowDown');
  await sleep(100);
  await page.keyboard.press('Enter');
  await sleep(400);
  const ashDone = await evalW7('return { s: w.sideQuests.state.get("ash_and_timber"), explored: w.explored.size, lines: w.endingLines.length };');
  check('steps unlock memories, then a final choice; "Let it rest" reveals the map and adds an epilogue line', atChoice.open && atChoice.mem === 2 && ashDone.s.status === 'done' && ashDone.s.choice === 'rest' && ashDone.explored > explored14 && ashDone.lines === 1, JSON.stringify({ atChoice, ashDone, explored14 }));
  // The River's Secret: declined.
  await evalW7('w.storyEvent("shortcut");');
  await sleep(400);
  await page.keyboard.press('ArrowDown');
  await sleep(100);
  await page.keyboard.press('Enter');
  await sleep(400);
  const riverRes = await evalW7('return { s: w.sideQuests.state.get("rivers_secret").status, toast: ui.toast.text.text };');
  check('a side story can be declined (main journey unaffected)', riverRes.s === 'declined' && /main journey is unaffected/.test(riverRes.toast), JSON.stringify(riverRes));
  // Embers in the Stone: spirits + tablets (already read) → keep the ember.
  await evalW7('w.storyEvent("puzzle");');
  await sleep(400);
  await page.keyboard.press('Enter');
  await sleep(300);
  await evalW7('w.storyEvent("spirit_defeat"); w.storyEvent("spirit_defeat"); w.nextWeatherAt = 0;');
  await sleep(900);
  const emberChoice = await storyOpen();
  await page.keyboard.press('ArrowDown');
  await sleep(100);
  await page.keyboard.press('Enter');
  await sleep(400);
  const emberRes = await evalW7('return { s: w.sideQuests.state.get("embers_in_stone"), lantern: w.inventory.inventory.count("ember_lantern"), lines: w.endingLines.length };');
  check('state steps (tablets read) advance on their own; the ember lantern is granted once', emberChoice.open && emberRes.s.status === 'done' && emberRes.s.choice === 'lantern' && emberRes.lantern === 1 && emberRes.lines === 2, JSON.stringify({ emberChoice, emberRes }));
  // Journal: Side stories tab with steps, outcomes and memories.
  await page.keyboard.press('KeyJ');
  await sleep(200);
  await page.keyboard.press('Digit2');
  await sleep(200);
  const jtext = await evalW7('return { tab: ui.journal.activeTab, side: ui.journal.sideText.text, mem: ui.journal.memText.text };');
  await page.screenshot({ path: OUT + '/46-journal-side.png' });
  check('the journal has a Side stories tab with progress, outcomes and memories', jtext.tab === 'side' && /Ash and Timber — Complete/.test(jtext.side) && /Declined/.test(jtext.side) && /woodcutter|camp/.test(jtext.mem), JSON.stringify(jtext).slice(0, 220));
  await page.keyboard.press('KeyJ');
  await sleep(200);
  // Reload: nothing can be earned twice; the main story is untouched.
  await evalW7('w.save();');
  await page.reload();
  await waitScene('Menu', 15000);
  await sleep(800);
  await clickGame(640, 500);
  await waitScene('World');
  await sleep(1200);
  const after14 = await evalW7('w.storiesEnabled = true; w.storyEvent("sleep"); w.storyEvent("puzzle"); return { lantern: w.inventory.inventory.count("ember_lantern"), again: w.sideQuests.choose("embers_in_stone", "lantern"), status: [...w.sideQuests.state.values()].map((s) => s.status).join(","), main: w.quest.stage, lines: w.endingLines.length };');
  await sleep(2800);
  const noDialog = await evalW7('return ui.story === null;');
  check('after a reload no story can be re-offered or re-rewarded; the main story is untouched', after14.lantern === 1 && after14.again === null && after14.status === 'done,declined,done' && noDialog && after14.lines === 2 && after14.main === 'done', JSON.stringify({ after14, noDialog }));

  // ---------- M15: set pieces — the Old Tusker, the Great Storm, the Blight ----------
  await setClock(9, 11);
  await evalW7('w.storiesEnabled = false; w.setPiecesEnabled = true; w.encounters.clear(); w.survival.stats.health = 100; w.survival.stats.warmth = 100; w.setFlags.tuskerDefeated = false; w.tusker = null;');
  // The Old Tusker: rumour + map marker, then it wakes near its ground.
  const tuskLair = await evalW7('return w.lairSite();');
  await teleport(tuskLair.x + 420, tuskLair.y);
  await sleep(1500);
  const tusk0 = await evalW7('const e = w.tusker; return e ? { hp: e.hp, max: e.maxHp, boss: e.def.boss, scale: e.scaleX, marker: w.markers.some((m) => /Tusker/.test(m.text)) } : null;');
  check('the Old Tusker wakes near its ground (rumour marked on the map)', !!tusk0 && tusk0.boss && tusk0.scale > 1.5 && tusk0.marker, JSON.stringify(tusk0));
  const armoured = await evalW7('const e = w.tusker; const h0 = e.hp; e.invulnUntil = 0; e.takeHit(10, e.x - 20, e.y, 0, 0, w.now); return { lost: h0 - e.hp, armoured: e.lastArmoured };');
  check('blades glance off its hide while it is not dazed (armour)', armoured.lost === 1 && armoured.armoured, JSON.stringify(armoured));
  // Lure a charge into a solid: a wall right in its path.
  const stun = await evalW7(`
    const e = w.tusker;
    const x = Math.round((e.x + 70) / 8) * 8, y = Math.round(e.y / 8) * 8;
    for (const dy of [-32, 0, 32]) w.structures.place('bamboo_wall', x, y + dy, { rot: 1 });
    e.body.reset(x - 70, y);
    e.dirX = 1; e.dirY = 0; e.aiState = 'attack'; e.stateUntil = w.now + 900; e.chargeStartedAt = w.now - 200;
    e.body.setVelocity(360, 0);
    return { x, y };`);
  await sleep(500);
  const dazed = await evalW7('const e = w.tusker; return { state: e.aiState, marker: e.marker.text };');
  await page.screenshot({ path: OUT + '/47-tusker-dazed.png' });
  const stunStrike = await evalW7('const e = w.tusker; const h0 = e.hp; e.invulnUntil = 0; e.takeHit(4, e.x - 20, e.y, 0, 0, w.now); return { lost: h0 - e.hp };');
  check('a charge into something solid leaves it dazed (✶), and then blows land in full', dazed.state === 'stunned' && dazed.marker === '✶' && stunStrike.lost === 12, JSON.stringify({ dazed, stunStrike }));
  // Finish it with a real swing while dazed.
  const fell = await evalW7(`
    const e = w.tusker;
    e.hp = 2; e.aiState = 'stunned'; e.stateUntil = w.now + 2000; e.invulnUntil = 0;
    w.player.body.reset(e.x - 30, e.y + 4);
    w.nextAttackAt = 0;
    w.attack(e.x, e.cy);
    return { defeated: w.setFlags.tuskerDefeated, tusk: w.pickups.activeCount };`);
  await sleep(1200);
  const tuskItem = await evalW7('return { inv: w.inventory.inventory.count("great_tusk"), ground: w.pickups.serialize().filter((p) => p.item === "great_tusk").length, bar: ui.bossBar.visible };');
  check('defeating it is recorded once and drops the Great Tusk (boss bar closes)', fell.defeated && tuskItem.inv + tuskItem.ground === 1 && !tuskItem.bar, JSON.stringify({ fell, tuskItem }));
  await evalW7('for (const s of w.structures.records.filter((r) => r.def.id === "bamboo_wall" && Math.hypot(r.x - arg.x, r.y - arg.y) < 80)) w.structures.remove(s); w.emitStructures();', stun);

  // The Great Storm: warning first, then telegraphed strikes that shelter protects from.
  await evalW7('w.encounters.clear(); w.survival.stats.health = 100; w.setFlags.stormDone = false; w.storm.phase = "none";');
  await setClock(10, 22);
  await sleep(900);
  const stormWarn = await evalW7('return { phase: w.storm.phase, toast: ui.toast.text.text };');
  await evalW7('w.storm.until = w.now;');
  await sleep(1400);
  const tele = await evalW7('return w.strikes.map((s) => ({ d: Math.round(Math.hypot(s.x - w.player.x, s.y - w.player.y)), warn: Math.round(s.at - w.now) }));');
  await page.screenshot({ path: OUT + '/48-storm-telegraph.png' });
  await sleep(1800);
  const hitExposed = await evalW7('return w.survival.stats.health;');
  check('the storm warns first, then marks each strike on the ground before it lands (exposed: it hurts)', stormWarn.phase === 'warning' && /storm breaks/.test(stormWarn.toast) && hitExposed < 100, JSON.stringify({ stormWarn, tele, hitExposed }));
  await evalW7('w.survival.stats.health = 100; w.structures.place("bamboo_shelter", w.player.x, w.player.y + 10); w.emitStructures(); w.strikes.length = 0; w.storm.nextStrikeAt = w.now;');
  await sleep(300);
  const farStrikes = await evalW7('return w.strikes.map((s) => Math.round(Math.hypot(s.x - w.player.x, s.y - w.player.y)));');
  await sleep(1800);
  const hpSheltered = await evalW7('return w.survival.stats.health;');
  check('under shelter, strikes land away from you', farStrikes.length > 0 && farStrikes.every((d) => d > 150) && hpSheltered >= 99, JSON.stringify({ farStrikes, hpSheltered }));
  await evalW7('w.storm.until = w.now;');
  await sleep(500);
  const stormOver = await evalW7('return { phase: w.storm.phase, done: w.setFlags.stormDone };');
  check('the storm passes and is recorded (it never repeats)', stormOver.phase === 'none' && stormOver.done, JSON.stringify(stormOver));

  // The Blight at the Heart: burn the cores with fire; falling is a checkpoint retry, not a death.
  await setClock(10, 11);
  await evalW7(`
    w.encounters.clear(); w.survival.stats.health = 100;
    w.quest = new w.quest.constructor(w.gameData, w.gameData.tablets.map((t) => t.id), true, 5, false);
    w.setFlags.blightCleared = false; w.blight.active = false; w.blight.cores = [];
    const inv = w.inventory.inventory; const s = inv.snapshot().map(() => null); s[0] = { item: 'torch', qty: 1, durability: 170 }; inv.restore(s); w.inventory.selected = 0; w.inventory.broadcast();`);
  const hs15 = await evalW7('const h = w.gen.heartSite(); return { x: h.tx * 32 + 16, y: h.ty * 32 + 16 };');
  await teleport(hs15.x, hs15.y + 3 * 32);
  await sleep(1800);
  const bl0 = await evalW7('return { active: w.blight.active, cores: w.blight.cores.length, bar: ui.bossBar.visible, name: ui.bossName.text };');
  await page.screenshot({ path: OUT + '/49-blight.png' });
  check('entering the ring wakes the blight (three cores, a bar with what to do)', bl0.active && bl0.cores === 3 && bl0.bar && /Blight/.test(bl0.name), JSON.stringify(bl0));
  const blCore = await evalW7('return w.blight.cores[0];');
  await teleport(blCore.x, blCore.y + 26);
  await sleep(1300);
  const burning = await evalW7('return Math.round(w.blight.cores[0].burn * 10) / 10;');
  let blSlam = null;
  for (let i = 0; i < 20 && !blSlam; i++) {
    blSlam = await evalW7('const s = w.strikes.find((x) => x.kind === "blight"); return s ? { warn: Math.round(s.at - w.now), d: Math.round(Math.hypot(s.x - w.player.x, s.y - w.player.y)) } : null;');
    if (!blSlam) await sleep(150);
  }
  check('holding fire to a core burns it; the blight answers with telegraphed slams', burning > 0.5 && !!blSlam && blSlam.warn >= 500 && blSlam.d < 40, JSON.stringify({ burning, blSlam }));
  // Falling to it returns you to the glade edge with your progress (no Game Over, no save change).
  const saveBefore = await page.evaluate(() => localStorage.getItem('preychrov.save'));
  await evalW7('w.blight.cores[0].burn = 99; w.lastBlightHitAt = w.now; w.survival.stats.health = 0;');
  await sleep(500);
  const blRetry = await evalW7('return { scene: w.scene.isActive(), hp: Math.round(w.survival.stats.health), d: Math.round(Math.hypot(w.player.x - arg.x, w.player.y - arg.y)), kept: w.blight.cores[0].burn >= 99, cores: w.blight.cores.length };', hs15);
  const saveAfter = await page.evaluate(() => localStorage.getItem('preychrov.save'));
  check('falling to the blight is a checkpoint retry: back at the glade edge, burned cores kept, save untouched', blRetry.scene && blRetry.hp === 60 && blRetry.d > 280 && blRetry.kept && saveBefore === saveAfter, JSON.stringify(blRetry));
  const blightBlocked = await evalW7('w.offerAtHeart(); return ui.toast.text.text;');
  await evalW7('for (const c of w.blight.cores) c.burn = 99; w.blight.active = true;');
  await sleep(400);
  const blCleared = await evalW7('return { blCleared: w.setFlags.blightCleared, active: w.blight.active, bar: ui.bossBar.visible };');
  const blAllowed = await evalW7('w.offerAtHeart(); return ui.toast.text.text;');
  check('the offering waits for the blight to be cleared, then is allowed', /blight chokes/i.test(blightBlocked) && blCleared.blCleared && !blCleared.active && !blCleared.bar && !/blight/i.test(blAllowed), JSON.stringify({ blightBlocked, blCleared, blAllowed }));
  const perf15 = await evalW7('return w.perfMs;');
  check('set pieces keep World update cheap (< 8 ms average)', perf15 < 8, perf15.toFixed(2) + ' ms');
  await evalW7('w.quest = new w.quest.constructor(w.gameData, w.gameData.tablets.map((t) => t.id), true, 5, true); w.setPiecesEnabled = false;');

  // QA: the world holds still under a story dialog; dying with one open never freezes input later.
  await evalW7('w.storiesEnabled = true; w.sideQuests = new w.sideQuests.constructor(w.gameData.sidequests); w.encounters.clear(); w.survival.stats.health = 100;');
  await evalW7('w.storyEvent("sleep");');
  await sleep(300);
  const frozen0 = await evalW7('return { now: w.now, hunger: w.survival.stats.hunger, open: w.storyOpen };');
  await sleep(800);
  const frozen1 = await evalW7('return { now: w.now, hunger: w.survival.stats.hunger, open: w.storyOpen };');
  check('the world holds still while a story moment is on screen', frozen0.open && frozen0.now === frozen1.now && frozen0.hunger === frozen1.hunger, JSON.stringify({ frozen0, frozen1 }));
  await evalW7('w.storyOpen = false; w.survival.stats.thirst = 0; w.survival.stats.hunger = 0; w.survival.stats.health = 0.5;');
  const died14 = await waitScene('GameOver', 12000);
  await sleep(700);
  await clickGame(640, 350);
  await waitScene('World');
  await sleep(900);
  await page.keyboard.press('KeyJ');
  await sleep(250);
  const inputOk = await evalW7('return { story: ui.story, journal: ui.journal.isOpen };');
  await page.keyboard.press('KeyJ');
  check('dying with a story dialog open does not freeze input in the next game', died14 && inputOk.story === null && inputOk.journal === true, JSON.stringify(inputOk));

  await page.evaluate(() => localStorage.clear());

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
