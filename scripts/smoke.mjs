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
const SEED = 4242;
const url = `http://localhost:4317/?debug&calm&seed=${SEED}`;

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
  check('reaching the Heart completes the current quest stage', (await evalW('return w.quest.stage;')) === 'done');
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
    evalW('const r = ui.crafting.rows.find((x) => x.recipe.id === arg); return { x: r.button.x, y: r.button.y };', recipeId);

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
