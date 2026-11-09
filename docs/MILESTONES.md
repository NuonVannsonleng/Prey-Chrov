# Milestones

Status legend: **Done** · **In progress** · **Not started**

| # | Name | Status |
| --- | --- | --- |
| M1 | Game shell, menus, movement, test world | Done |
| M2 | Gathering, pickup and inventory | Done |
| M3 | Survival, crafting, first night, death | Done |
| M4 | Seeded procedural world, chunks, biomes, minimap | Done |
| M5 | Wildlife, night spirits, combat and guardian shrines | Done |
| M6 | Monsoon, ruins, tablets and core quest | Not started |
| M7 | Persistence, performance and MVP polish | Not started |

---

## M5 — Wildlife, night spirits, combat and guardian shrines

### Implemented (playable)

- **Creatures** (`enemies.json`), each with a readable behaviour and a visible wind-up pose before every attack:
  - **Wild boar** (day): wanders, paws the ground about 0.7 s, then charges in a straight locked line, so you can sidestep. It flees when badly hurt.
  - **Pit viper** (day, grass and swamp): rears up, then strikes and **poisons** you (1.2/s for 7 s). Poison refreshes rather than stacks, and wears off.
  - **Tiger** (rare, from day 3, deep jungle and ruins): circles, then pounces. It hits hard, gives up the chase if you run far enough, and retreats when wounded.
  - **Ap** (night, flier): orbits, then rushes at you through the air, ignoring trees and water.
  - **Arak** (night, from day 2): keeps its distance and throws slow violet spirit orbs.
- **Firelight promise:**
  - Spirits never enter campfire light or a held torch's light; they get pushed out and their wind-ups are cancelled.
  - Ap won't rush into light, and orbs fizzle in it.
  - Standing by your fire at night is safe.
- **Encounters** (`encounters.json`):
  - The population is finite and pooled (at most 16 creature objects), spawning off-screen 430–560 px away.
  - Spawning is weighted by time of day, first-appearance day, biome and per-type caps.
  - Night 1 allows at most 2 creatures; each day adds 1.5 more, up to 6, scaled by the local biome's night danger.
  - Creatures never spawn in water, solids, firelight or within 180 px of a shrine.
  - Creatures far away despawn, and spirits fade away at dawn.
  - All walking creatures share one collider.
- **Combat** (`combat.json`):
  - **Space** or **left-click** near a creature swings toward the aim point. A tree or rock under the cursor still gathers.
  - Damage comes from the held tool (the spear does 4 and reaches 16 px further).
  - The swing covers a 110° arc, with knockback and 200 ms creature i-frames. Weapons wear on hits.
  - When hit, you get 700 ms i-frames, knockback, a blink, a small shake and the red flash.
  - Creature loot: raw meat (cook it at the campfire), hide, tiger fang (rare) and spirit dust.
- **Neak Ta shrines** (`shrines.json`):
  - Small spirit houses: one always stands near spawn, and occasional ones appear in clearings.
  - Holding food and pressing **E** leaves an offering, which grants a **blessing** (+4 health per hour) and a **spirit ward** (spirits won't attack) for about 7 hours.
  - Afterwards the shrine rests with fresh flowers for about 20 hours, so it can't be farmed.
  - Shrines are never hostile or lootable, and creatures never spawn near them.
- **Status row** under the stat bars shows each effect's icon, name and seconds left: Poisoned, Blessed, Warded.
- **GameOver** now names wildlife, spirits and poison as causes, with fair tips.
- Saves include active effects and shrine offering times.

### Verification

- `npm run typecheck` and `npm run build` pass.
- `npm test`: 117 unit tests. New ones cover poison duration and refresh, blessing regen, effect save round-trips, the swing arc, data fairness (every attack telegraphed, spirits night-only and light-averse, the player outruns everything, no one-shot kills, night 1 ≤ 2 and night 3 higher) and shrines never being hostile.
- `npm run smoke`: 97 browser checks. The M5 ones:
  - the boar telegraphs and its charge hits once
  - a spear kills the boar, it drops meat, and the spear wears
  - a viper poisons you and the poison wears off
  - spirits are pushed out of firelight and the player stays unhurt there
  - an Ap attacks in the dark
  - spirits fade at dawn
  - the shrine blessing and ward, the shrine resting, and the ward stopping attacks
  - the population caps
- QA: see CHANGELOG.

### Known limitations

- The M5 creature, encounter, combat and shrine data was written directly, because the content-designer agent hit an API usage limit. It still needs a content-designer balance review.
- Some AI tuning (wind-up distances, body sizes) and status labels are in code, not data.
- No hearing/stealth yet (M12) and no ranged player weapons.
- Spirits ignore line of sight; light is the only deterrent.
- Khmer names ជ្រូកព្រៃ, ខ្លា, អាប, អារក្ស and សាច់ឆៅ need native-speaker review.

---

## M4 — Seeded procedural world, chunks, biomes, minimap

### Implemented (playable)

- **Endless seeded world** (`world/WorldGen.ts`). Every tile and prop is a pure function of (seed, tile coordinates), so revisiting or regenerating a chunk gives the same result, with negative coordinates included.
  - **Noise fields:** moisture, vegetation, rivers, fords and swamp ponds.
  - **Biomes:** five, defined in `biomes.json` by the content-designer stand-in, each with ground mixes, prop densities, a minimap colour, ambience and a night-danger factor (used in M5):
    - Forest Clearing: open, berries, the start biome.
    - Deep Jungle: dense trees, ancient big trees, dark floor.
    - Bamboo Grove.
    - River & Swamp: mud, reeds, ponds.
    - Ancient Ruins: rare.
  - **Rivers** have walkable shallow fords, so they never wall off the world. Shallows slow you to 60% and you can drink from them; mud slows you to 85%.
  - **Ancient ruins:** at most one per 5×5-chunk cell. Each is a stone courtyard with a broken ring wall that always has four gateways, corner pillars and a central altar.
- **Safe spawn:** tile (0,0) is always a clearing with no rivers, a starter pond 8 tiles away, and guaranteed trees, boulders, berry bushes and bamboo within about 10 tiles, so no seed can be unwinnable.
- **Streaming** (`world/ChunkManager.ts`):
  - 32×32-tile chunks; the 3×3 around the player stay loaded, and chunks unload beyond a radius of 2 (hysteresis).
  - Your own chunk builds immediately; the rest build one per frame.
  - Each chunk has its own tilemap layer and exactly one player collider.
  - Unloading destroys the tilemap, collider, scenery, solids, canopies and nodes.
  - **Node diffs** (HP, depleted, respawn time, harvest count) persist while a chunk is unloaded, and are saved.
- **Placement rules:** solid props never sit on chunk edge tiles (ruins excepted) and always leave a free 3×3 neighbourhood, so neighbouring chunks can't trap the player.
- **Structures** persist as records and only exist as objects while their chunk is loaded.
- **Minimap** (top right):
  - Biome colours come from the same generator, cached per chunk.
  - Markers: the player, your campfires and shelters, and ruin landmarks (purple diamonds), which help you find rare ruins.
  - The current biome's name (and Khmer name) shows below it.
- **Seed:** each new journey gets a random seed, `?seed=N` picks one, and the pause menu shows the current seed.
- **Save v2:** stores the seed and string node keys. v1 saves (from the old fixed test grove) migrate: stats, inventory, clock and objectives are kept, placed structures come back as kits, and you start at the new world's spawn.

### Verification

- `npm run typecheck` and `npm run build` pass.
- `npm test`: 107 unit tests, including the world-generation suite:
  - determinism for positive and negative chunks
  - different seeds giving different worlds
  - safe spawn with every material and water, for 5 seeds
  - no solids on chunk edges or water, no adjacent solids
  - a flood fill from spawn over 224×224 tiles reaching at least 95% of dry land, including every ruin courtyard
  - at least 4 biomes within a radius of 300 tiles
  - the v1 → v2 save migration
- `npm run smoke`: 79 browser checks. The M4 ones:
  - the URL seed is used, and the minimap shows the biome name
  - a far walk of 14 jumps × 900 px keeps loaded chunks ≤ 25 and bodies, colliders and display objects bounded
  - several biomes are crossed
  - a harvested bush near spawn is still harvested after its chunk unloads and reloads
  - object counts don't accumulate
  - negative coordinates stream in
  - the same chunk signature for the seed, also after reload and Continue
- QA: a stand-in for `phaser-qa` found 0 Critical and 3 Warnings, all fixed (chunk generation 8.6 → 0.95 ms). Details in CHANGELOG.

### Known limitations

- No full map yet (M13); the minimap covers about 300×300 tiles around you with no fog of war.
- Ground ruins exist as landmarks only. Chests, tablets and quests arrive in M6.
- Ground items (pickups) are global, not chunked. They're capped at 400 and kept when far away.
- Biome transitions are noise-based patches without blended edge tiles.
- Khmer biome names need native-speaker review.

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
