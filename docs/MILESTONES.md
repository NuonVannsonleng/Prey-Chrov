# Milestones

Status legend: **Done** · **In progress** · **Not started**

| # | Name | Status |
| --- | --- | --- |
| M1 | Game shell, menus, movement, test world | Done |
| M2 | Gathering, pickup and inventory | Done |
| M3 | Survival, crafting, first night, death | Done |
| M4 | Seeded procedural world, chunks, biomes, minimap | Not started |
| M5 | Wildlife, night spirits, combat and guardian shrines | Not started |
| M6 | Monsoon, ruins, tablets and core quest | Not started |
| M7 | Persistence, performance and MVP polish | Not started |

---

## M3 — Survival, crafting, first night, death

### Implemented (playable)

- **Survival stats** (`systems/Survival.ts`, tuned in `data/survival.json`):
  - Health, food (hunger), water (thirst) and stamina drain per game hour, so frame rate never changes them.
  - The HUD warns at 30, with a toast and a red tag next to the bar.
  - At 0, starvation or dehydration costs health, with a red screen flash and a toast.
  - Health regenerates while food and water are both 20 or more.
  - Sprinting drains stamina. Hitting 0 makes you "Exhausted" until stamina recovers to 20.
- **Eight-minute day** (`systems/Clock.ts`): 1 game hour is 20 s and the game starts at 07:00. The HUD clock shows the day number, time and phase.
- **Darkness** follows a keyframe curve in data: light from about 05:30 to 20:30, then a dark 0.78 night. There's a faint light around the player, held torches light 120 px, and campfires light 155 px with a warm flicker (`systems/Lighting.ts`).
- **Crafting (C):**
  - Recipes: stone axe, stone pickaxe, spear, torch, campfire kit, bamboo shelter kit, and roasted bamboo shoot (cooked at a campfire).
  - The panel shows owned/required counts per ingredient (✓/✗) and a 🔒 when a campfire is needed.
  - Blocked crafts explain why: missing materials, a station needed, or no room.
  - Crafting is atomic and rolls back if the output doesn't fit.
- **Tools:**
  - A held axe or pickaxe is used automatically when it beats bare hands (an axe fells a tree in 2 hits instead of 7).
  - Every hit costs 1 durability, shown as a bar on the slot. Tools break with a message.
  - The spear can be crafted, but it says plainly that combat comes later.
- **Food (F):** berries (small food and water); raw bamboo shoots (+10 food, −3 health); roasted shoots (+40 food, +4 health). Bamboo clumps now drop shoots.
- **Structures:**
  - Select a kit and press **F** to show a tinted ghost within 90 px.
  - It's red on water, trees, rocks, other structures, the player or the world edge; click or press F to build.
  - Right-click or Esc cancels.
  - Campfire: a solid light source and cooking station; **E** there opens cooking.
  - Bamboo shelter: **E** sleeps between 18:30 and 04:30.
- **Sleep and save:**
  - Sleeping fades to the next 06:00 and costs some food and water (it never kills).
  - It restores stamina and heals 15.
  - The game clock jumps, so respawns progress overnight, and the journey is **saved**.
- **Continue (menu)** loads the save:
  - Restored: clock, stats, inventory (with durability), selected slot, structures, depleted or damaged nodes (as a compact diff), ground items, and objectives.
  - Corrupt, partial or newer saves never crash. Partial fields fall back to defaults, and unknown items are removed with a notice.
  - **New journey** asks before replacing a save; the old save stays until you next sleep.
- **GameOver:** shows the day, time and cause with a tip, plus New journey, Load last sleep and Main menu. The save is never deleted.
- **First-day checklist:** gather, craft an axe, drink, campfire, shelter, sleep. It completes from actual gameplay and is saved; H hides it.

### Verification

- `npm run typecheck` and `npm run build` pass.
- `npm test`: 89 unit tests. They cover the clock and darkness, survival drain, death, stamina and food, atomic crafting with station and rollback, durability, save parse/sanitize/migration paths, data validation and crafting reachability, and that night 1 is survivable with no food or water.
- `npm run smoke`: 68 browser checks. The M3 ones:
  - HUD bars present
  - blocked craft with feedback, then a successful axe craft at full durability
  - the axe fells a tree and wears
  - eating a raw shoot (food up, health down)
  - sprint draining stamina
  - drinking restoring water
  - placement rejecting water and trees
  - placing a campfire, then cooking through E
  - placing a shelter
  - no sleeping during the day
  - darkness at 23:00, and a torch burning
  - sleeping to 06:00 on day 2, which saves
  - reload → Continue restoring day, inventory and structures
  - dehydration → GameOver → New journey on day 1
- QA: a stand-in for `phaser-qa` found 0 Critical and 4 Warnings, all fixed; details in CHANGELOG.

### Known limitations

- Only sleep saves. Full autosave and save-on-quit come in M7.
- Campfires never run out of fuel. Fuel is planned later; the spec says "consumes fuel later".
- The spear has no target until wildlife and combat in M5.
- The tutorial checklist text is in code (`systems/Objectives.ts`), not data. Quests move to `quests.json` in M6.
- Darkness is a full-screen overlay; there's no shadow casting.
- Khmer names `ពិល` (torch), `លំពែង` (spear) and `ទំពាំងឫស្សី` (bamboo shoot) need native-speaker review.

---

## M2 — Gathering, pickup and inventory

### Implemented (playable)

- **Data-driven content** (`src/data/`): `items.json` (8 items), `loot.json` (4 tables), `resources.json` (4 node types), authored by the content-designer role. `schema.ts` defines the types and a validator that rejects:
  - duplicate or non-snake_case ids
  - unknown item, loot-table, icon or sprite references
  - zero or negative weights, and min > max ranges
  - non-finite or negative stats, and stack sizes outside 1–999
  - tables that drop nothing

  Bad data shows the list of problems on screen at boot instead of a blank page.
- **Resource nodes** on the test grove:
  - jungle trees (7 HP)
  - bamboo clumps (5 HP)
  - boulders (9 HP)
  - berry bushes (2 HP)
  
  Hold **E** or the **left mouse button** to gather; one hit every 0.35 s by hand. The player shows a reach/swing pose.
- **Hit feedback:** the node shakes and flashes, coloured chips fly, and a small HP bar appears. Felling a tree or breaking a rock adds a small screen shake.
- **Depletion:**
  - Trees leave stumps, bamboo leaves cut stubs, and boulders leave rubble. All three become walkable because their static body is removed from the physics world.
  - Bushes switch to a picked sprite and stay solid.
  - Canopies disappear with their tree.
- **Respawn** runs on game-time timers (180–400 s by type), so it freezes while paused. A respawn waits if the player is standing in the footprint. The same body is re-added, so the static body count stays constant (verified).
- **Loot:** guaranteed and weighted rolls. The RNG is seeded by (map seed, node id, harvest count), so loot is deterministic and won't be re-rollable by reloading later.
- **Pickups:**
  - Pooled (120 to start, growing to a 400 cap); no physics bodies, so no phantom colliders. Past the cap, new drops merge into an existing ground stack of the same item, and harvest loot that still cannot be placed goes straight into the inventory.
  - They pop out of the node, bob, and are pulled toward the player within 44 px.
  - A floating "+3 Wood" style label shows on collection.
  - A `claimed` flag set before the collect tween means each pickup is added exactly once.
  - Partial adds keep the remainder on the ground.
- **Full inventory:** pickups stay on the ground, a red "Inventory full" label appears over the player, a top toast explains what to do, and the hotbar flashes red.
- **Water:** a pond and a stream with two-frame animated water. Deep water is solid; the muddy shore is walkable. **E** at the edge drinks, showing "Fresh water" and emitting `player:drank`.
- **Interaction targeting:** the nearest node or water tile in reach wins, with a bias toward the direction you're facing. A dashed ring marks the target, and a prompt reads like "E — Chop Jungle Tree".
- **Inventory model:** 20 slots; the first 6 are the hotbar. Each item has its own stack limit. Adding tops up partial stacks first and returns any overflow, so nothing is lost or invented. Also supports move (merge up to the limit, otherwise swap), split half, and remove.
- **Hotbar HUD:** 6 slots with icons, counts and key numbers, plus a selection highlight and the selected item's name. Select with **1–6**, the **mouse wheel** or a click.
- **Inventory panel (I):**
  - Modal: World ignores movement and gathering while it's open.
  - Hotbar row above a 7×2 backpack.
  - Drag to move, merge or swap; **Shift+click** to split; drag outside the panel to drop.
  - Hover tooltips show name, Khmer name, description, rarity and stack.
- **Dropping:**
  - **Q** drops one of the selected item; **Ctrl+Q** drops the whole stack.
  - Rare items (flint) open a Drop/Keep confirmation.
  - Dropped items land in front of you and are only collectable after you step away, so they aren't instantly sucked back.
- **Input routing:** UI owns **Esc**. It closes the dialog, then the panel, and only then pauses. World ignores gameplay input while a modal is open.

### Verification

- `npm run typecheck` and `npm run build`: pass.
- `npm test`: 53 unit tests (inventory rules, data validation and reachability, test-map resources, deterministic and weighted loot, plus the M1 tests).
- `npm run smoke`: 48 checks in headless Edge. They include:
  - gathering all four node types and collecting the drops
  - the stump being walkable, and the respawned tree blocking movement again
  - a stable static-body count
  - the hotbar mirroring the inventory
  - drinking water
  - exactly-once pickup
  - the full-inventory pickup staying on the ground with a warning, then collecting once space frees
  - Q drop without instant re-pickup, then re-pickup after stepping away
  - the panel blocking movement, and drag-moving a stack
  - Esc closing the panel without pausing
  - rare-drop confirmation (Esc keeps, Drop drops)
  - a stale drop request (slot changed) being ignored
  - pool exhaustion merging instead of losing items
  - all M1 checks and zero console errors
- QA: two passes by a stand-in for `phaser-qa` (Sonnet with its instructions word for word). Round 1 found 0 Critical and 4 Warnings; all fixed. Round 2 found 0 Critical and 0 Warnings. Details in CHANGELOG.

### Known limitations

- Drinking has no stat effect until thirst exists (M3).
- Gathering is by hand only; tool multipliers are in data and take effect when tools arrive in M3.
- Holding a hotbar item does nothing yet. There's no equip/use until tools and food consumption (M3).
- Gathered nodes, ground items and the inventory aren't saved. Returning to the menu resets the grove (saves in M3/M7).
- Pickups never despawn. At the 400-stack cap with no same-item stack to merge into, a player drop shows "Too many items on the ground here" and the item stays in the inventory.
- There's no "drop with confirmation" for non-rare stacks; only rare items ask.
- Khmer `nameKm` values (ឈើ, ឫស្សី, ថ្ម, ស្លឹក) need native-speaker review.

### Follow-ups

- M3: thirst listens to `player:drank`, berries become edible, recipes use these materials, and tools apply `toolMultipliers`.

---

## M1 — Game shell, menus, movement, test world

### Implemented (playable)

- **Stack:** Phaser 3.90.0, TypeScript strict, Vite 8, Vitest; `dev`, `build`, `preview`, `typecheck`, `test`, `smoke` scripts.
- **Scenes:** Boot (waits ≤2.5 s for Moul / Kantumruy Pro, falls back to local Khmer fonts), Preload (generates all art), Menu, World, UI (parallel HUD), Pause.
- **Menu:** generated jungle-at-night backdrop with temple silhouette and fireflies, large **ព្រៃជ្រៅ** title in Moul, *Prey Chrov / The Deep Forest* subtitle. **Play** starts the game. **Continue** is disabled and states why (no save / damaged save / newer version / storage unavailable). Mouse and keyboard (↑/↓/W/S/Tab, Enter/Space) navigation.
- **Generated placeholder art** (`src/textures.ts` catalog, `src/art/generate.ts` drawing): grass/moss/leaf-litter/trail tiles, 4-direction explorer with idle/breathe/walk frames and a krama scarf, 3 trunk, 3 canopy, 3 rock and 3 fern variants, vignette, menu backdrop.
- **Test grove:** fixed 60×40-tile (1920×1280 px) map with a winding trail and branch, tree clusters, rock outcrops, scattered trees, ferns and a dense tree border. Spawn clearing is guaranteed empty. Solid footprints on trunks and rocks, plus world bounds.
- **Movement:** WASD with diagonal normalization (diagonal = straight speed, verified), frame-rate-independent velocity smoothing, Shift sprint ×1.65 (prototype, no stamina yet), 4-direction walk/idle animations, sprint animates faster.
- **Camera:** follows with lerp 0.12, zoom 2, bounded to the map, rounded pixels; Scale.FIT at 1280×720.
- **Readability:** Y-sorted depth for player/trunks/rocks/ferns; canopies fade to 32% when the player walks beneath them.
- **HUD:** title badge, control hints (toggle **H**), sprint tag, **F3** debug overlay (FPS, position, speed, event-bus listener count, physics bodies).
- **Pause:** **Esc**, window blur or tab hide pauses World + UI. Pause menu has **Resume** (or Esc) and **Main Menu**. Input is reset on resume so no keys stick.
- **Cleanup:** scene-scoped subscriptions on the typed event bus auto-unsubscribe; World removes game/keyboard listeners and keys on shutdown and stops UI. Repeated Menu ↔ World trips are verified not to grow listeners, keys, bodies or display objects.

### Verification

- `npm run typecheck`, `npm run build`: pass.
- `npm test`: 27 unit tests (movement, save inspection, test-map determinism/bounds/spawn/spacing).
- `npm run smoke`: 21 automated browser checks in headless Edge (menu, Continue disabled, Play, WASD, diagonal = straight speed, sprint, collisions from all 4 sides, camera keeps player in view, pause stops simulation, resume without stuck keys, 3 menu round trips with stable counts, zero console errors).
- QA: see CHANGELOG for the QA pass result.

### Known limitations

- No gameplay data JSON yet (no items/recipes/enemies in M1), so `content-designer` had nothing to do this milestone.
- Continue cannot become enabled yet: loading is not implemented (`CAN_LOAD_SAVES = false`); sleep-save arrives in M3 and full persistence in M7.
- Sprint has no stamina cost until M3.
- Test grove is hand-shaped and fixed; it will be replaced by seeded chunked generation in M4.
- Canvas renders at 1280×720 and is CSS-scaled with FIT, so very large windows look slightly soft.
- Google Fonts need network on first load; offline falls back to system Khmer fonts (Khmer UI / Leelawadee UI on Windows).

### Follow-ups

- M2: resource nodes, `items.json`/`loot.json` (via content-designer), inventory + hotbar.
- Consider moving `PLAYER`/`CAMERA` tuning to data once balancing starts.
