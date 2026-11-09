# Changelog

## 0.10.0 — M10: Building and persistent outposts (2026-11-09)

### Added
- Workbench, plus bamboo walls (rotate with R, snap together), thatch roofs (weather protection), storage chests (12 slots, safe and persistent), rain collectors (clean rainwater), bamboo beds (better sleep) and outpost flags (map markers, no new spawns nearby).
- Monsoon weathering with broken states, R to repair and X twice to dismantle (refunds half).
- Outposts on the minimap and in the journal (distance and direction).
- Structures keep their id, rotation, durability, chest contents, water and name through chunk unloads and saves.

### Fixed
- Restoring a save deduplicates structures by id, so a roof over a chest no longer drops the chest.

## 0.9.0 — M9: Cooking, fishing, medicine and ecology (2026-11-09)

### Added
- Fishing with a bamboo rod: a fair timing minigame at deep water (E, Space or click to pull).
- Bamboo tubes: fill at water, boil at the campfire, and get the tube back after use.
- Cooking pot station: jungle stew, fish and leaf soup, bitter root brew (antidote).
- Medicine: leaf bandage (+25 health) and the antidote (cures poison).
- Healing leaf and bitter root herbs, identified on first harvest (saved).
- Harvest seasons: the monsoon brings more shoots and herbs and fewer berries.
- Crafting tabs (Tools & light, Building, Food & water, Medicine) with Tab / Shift+Tab.

### Fixed
- A cooking pot no longer counts as a campfire for the first-day checklist or the minimap.
- Tubes are never lost when the inventory is full.

## 0.8.0 — M8: The Heart of the Forest and the first ending (2026-11-09)

### Added
- The Heart glade: the Heart Tree inside a closed ring of ancient roots that wither back from fire (a campfire or a held torch).
- The offering at the Heart Tree (all five tablets, held food, two spirit dust) completes the main quest.
- Ending scene: epilogue, journey summary, credits with the fiction disclaimer, Continue surviving or Main menu.
- Journey stats (kills, crafted, built, gathered) are tracked and saved; spirits are calmer after the ending.

### Fixed
- Softlock: you can no longer be trapped inside the root ring.
- The ending can no longer fire a choice twice, and it says when the save failed instead of silently starting over.
- Button rows support Left/Right and ignore key repeat.

## 0.7.0 — M7: Persistence, performance and MVP polish (2026-11-09)

### Added
- Autosave every minute and on pause, blur or a hidden tab, plus the sleep save, with a "Saved ✓" indicator.
- Settings: three volumes, reduced motion, reduced flashes, show help. They persist separately from the save.
- Procedural Web Audio effects and ambience, enabled after the first input.
- An update-time measure in F3, plus a performance smoke check.
- Smoke checks for a corrupt save, a v1 migration, settings and autosave.

### Fixed (QA follow-ups)
- Ambience is ducked while paused and silenced when leaving the world.
- A suspended AudioContext resumes on the next click or key.
- Thunder is no longer clipped; the spirit cue plays when a spirit appears.
- Autosave skips near-death moments (low health or a hostile close by) and warns once if storage fails.
- Removed a stray autosave-timer reset.
- **Depth sorting:** objects at negative y (north of the origin) drew under the ground. World objects now use a bounded `ySort()` depth band.
- Loading a save made while pressed flush against a solid no longer moves you back to spawn.

## 0.6.0 — M6: Monsoon, ruins, tablets and core quest (2026-11-09)

### Added
- Monsoon every 5th day for 2 days, with a forecast, rain overlay, soft lightning, gloom and rain-adjusted hunger and thirst.
- Warmth and cold exposure: shelter and campfires keep you warm, and zero warmth slowly costs health.
- Deterministic, walkable-only flooding that rises through the monsoon and recedes after.
- Ruin chests (each opens once, with seeded loot) and five key stone tablets in the five ruins nearest spawn.
- Main quest "The Five Tablets" leading to the Heart of the Forest, with an edge arrow and distance.
- Journal (J) with quest, tablets and a lore glossary with a fiction disclaimer.
- The M5 data was reviewed by the content-designer stand-in: tiger spawns are rarer, and the Ap/Arak descriptions now say they are hostile fictional interpretations.

### QA
- Run by a stand-in for `phaser-qa`: **1 Critical, 4 Warnings**. All five are fixed:
  - **Critical:** pressing E to close a tablet re-opened it, and Space swung a weapon. Gameplay keys are now ignored while any panel is open, and the tablet closes on the next frame. A smoke test covers it.
  1. Re-flooding hitched. It is now queued, one chunk per frame.
  2. Floods popped in and out. They now ramp smoothly.
  3. The quest could be unwinnable if fewer than five tablet ruins existed. The required count now follows the tablets that actually exist.
  4. Flooded shallows did not animate.
- Suggestion applied: no "monsoon breaks" toast when loading mid-monsoon.


## 0.5.0 — M5: Wildlife, night spirits, combat and guardian shrines (2026-11-09)

### Added
- Wild boar, pit viper and tiger by day; Ap and Arak at night. Each has a distinct behaviour and every attack is telegraphed.
- A finite, pooled encounter system: an off-screen spawn ring, data weights, a gentle night 1 that ramps up later, no spawns in light, water, solids or near shrines, despawning when far away, and spirits fading at dawn.
- Spirits respect firelight: campfires and held torches push them out, cancel their rushes and fizzle their orbs.
- Melee combat with arcs, reach, knockback, i-frames and weapon wear. Creatures drop loot, and raw meat can be cooked.
- Poison, blessing and spirit-ward status effects, shown on the HUD and saved.
- Neak Ta spirit-house shrines: an offering gives a blessing and ward, then the shrine rests about 20 hours. Shrines are never hostile.
- `?calm` debug flag for automated tests.

### QA
- Round 1, by a stand-in for `phaser-qa`: **0 Critical, 6 Warnings**. All six are fixed:
  1. A reused orb could hit while invisible behind a stale fade tween.
  2. Vipers could miss a player standing still.
  3. Knockback was overwritten while chasing.
  4. Clicks attacked instead of gathering whenever a creature was nearby.
  5. Warded spirits could finish a wind-up.
  6. Sleep froze effect timers.
- Suggestions applied:
  - Light deterrence now matches the visible radius.
  - Wounded creatures really retreat.
  - The spear description was outdated.
  - Shrine updates no longer allocate per frame.
  - Creatures and orbs are cleared on death.
- Deferred: moving AI distances, body sizes and status labels into data.
- **Note:** the M5 data was written directly, because the content-designer agent hit an API limit, and is flagged for review.


## 0.4.0 — M4: Seeded procedural world, chunks, biomes, minimap (2026-11-09)

### Added
- An endless seeded world built from simplex noise. It has five data-driven biomes, rivers with shallow fords, swamp ponds, and rare ancient ruins with gated walls.
- The spawn area is safe and always has a starter pond and every basic material. `?seed=N` picks a world, and the pause menu shows the seed.
- Chunk streaming:
  - 32×32-tile chunks; radius 1 is loaded and radius 2 unloaded, with one build per frame.
  - One collider per chunk, and everything is released on unload.
  - Node diffs persist across unloads and saves.
- New tiles (mud, stone floor, animated walkable shallows, jungle floor) and scenery (big trees, reeds, ruin pieces).
- Minimap with biome colours, plus player, structure and ruin markers and the biome name.
- Save v2 with the seed and node keys. v1 saves migrate (structures and ground items are returned to the player).

### QA
- Run by a stand-in for `phaser-qa`: **0 Critical, 3 Warnings**. All three are fixed:
  1. Chunk generation could hitch frames (8.6 ms per chunk). A water grid is now computed once per chunk, the ruin lookup checks a single cell, and the cache key is numeric. A chunk now takes 0.95 ms.
  2. v1 saves lost ground items. They now come back through `refundItems`.
  3. Refunded kits and saved pickups could be lost when the ground pool was full. They now go to the inventory first, then the ground, and any loss is counted and reported.
- Suggestions applied:
  - Ruin walls continue across chunk seams.
  - Ruin gateways are reserved so props can't block them.
  - Minimap lookups happen once per chunk run instead of per pixel.
  - Node diffs are capped at 3000; depleted states are never dropped.
  - Water minimap colours live in one place.
- Deferred: moving `starterProps` and the scenery solid/footprint data into JSON.


## 0.3.0 — M3: Survival, crafting, first night, death (2026-11-09)

### Added
- Survival stats (health, food, water, stamina) with warnings, starvation/dehydration damage, regen, and sprint exhaustion; all rates are in `survival.json`.
- An 8-minute game-time day/night clock. Darkness overlay with player, torch and campfire lights; torches burn while held in the dark.
- Crafting panel (C) with owned/required counts and station locks. Recipes: stone axe, pickaxe, spear, torch, campfire, bamboo shelter, and roasted bamboo shoot (cooked at a campfire).
- Tools speed up matching nodes and lose durability.
- F eats or places the held item; raw shoots cost a little health.
- Build mode with a valid/invalid ghost. Campfires are a cooking and light station; the bamboo shelter is for sleeping.
- Sleeping from dusk skips to morning and saves.
- Continue restores the session: clock, stats, inventory with durability, structures, node diffs, ground items and objectives. Sanitizing removes unknown items and refunds unknown structures as kits. New journey asks before replacing a save.
- GameOver screen with day, time, cause and a tip, plus New journey, Load last sleep and Main menu.
- First-day checklist (teach-through-play), saved and hideable.

### Fixed
- Phaser re-dispatches queued key events within a frame, so scene keydown handlers now process each DOM event once.
- Quick key taps were lost by `Key.JustDown`. F and E now use keydown events.
- Rare items had the same border colour as the selected slot.

### QA
- Round 1, by a stand-in for `phaser-qa` (Sonnet with its instructions word for word): **0 Critical, 4 Warnings**. All four are fixed:
  1. Sleep or death could soft-lock behind a running camera fade; fades are now forced.
  2. Keys pressed during sleep or death fired after waking; they're now discarded.
  3. A save without a clock loaded at midnight; it now keeps the start hour.
  4. Per-frame allocations in placement and station checks were removed.
- Suggestions applied:
  - Final stats show before the death fade.
  - Food isn't eaten when it can't help.
  - Off-screen lights are culled.
  - Duplicate or unknown structures in a save are deduplicated or refunded as kits.
  - The spawn point stays clear of buildings, and placement leaves wider gaps so nothing can trap the player.
  - The axe objective and the campfire flame are driven by data, not hardcoded ids.


## 0.2.0 — M2: Gathering, pickup and inventory (2026-11-09)

### Added
- Data-driven content in `src/data/`:
  - `items.json` (8 items), `loot.json` (4 tables) and `resources.json` (4 node types), with typed schema and validation in `schema.ts`.
  - Validation errors show on screen at boot.
  - The content-designer role authored the data, using a stand-in agent with the `content-designer` instructions.
- Gatherable jungle trees, bamboo clumps, boulders and berry bushes:
  - HP, hit shake/flash/chips, an HP bar and a swing pose.
  - Depleted visuals (stump, cut stubs, rubble, picked bush).
  - Loot rolls are deterministic.
  - Respawn runs on game time and waits while the player is in the way.
- Pooled ground pickups with magnet, exactly-once collection, floating "+N Item" text and full-inventory handling.
- A pond and stream with animated solid water, a walkable shore, and drinking (E).
- Contextual target ring and an "E — Verb Name" prompt; hold E or the mouse to repeat.
- 20-slot inventory whose first 6 slots are the hotbar:
  - Stack limits per item; move, merge or swap; split; drop.
  - HUD hotbar (1–6, mouse wheel, click).
  - Inventory panel (I) with drag and drop and tooltips.
  - Q / Ctrl+Q drop; rare items need confirmation.
  - Dropped items stay put until you step away.
- Input routing: Esc closes the dialog, then the panel, then pauses. World ignores gameplay input while a modal is open.
- Tests: 53 unit tests (inventory, data validation and reachability, loot) and 48 headless-browser smoke checks.

### QA
- First pass, run by a stand-in for `phaser-qa` (Sonnet with its instructions word for word): **0 Critical, 4 Warnings**. All four are fixed:
  1. A rare-item drop could hit a slot that changed while the confirm dialog was open. Drop requests now carry the item id, and the panel ignores pointer input while a dialog is open.
  2. Harvest loot could be lost if the pickup pool was exhausted. The pool now grows to a 400 cap, then merges into the nearest same-item ground stack. Loot that still has nowhere to go goes to the inventory, and a node can't be harvested when the ground is saturated.
  3. The hotbar "full" flash re-rendered stale contents. It now uses the latest view.
  4. Pickups scanned the tween list every frame. They now use a `settleAt` timestamp.
- Applied suggestion: dragging onto a full same-item stack now swaps the stacks.
- Second pass (verification): all four warnings confirmed fixed, **0 Critical, 0 Warnings**. Both of its suggestions were applied: nearest-stack merge, and refusing harvests when the ground is saturated.

### Known limitations
- Drinking has no stat effect until thirst lands in M3.
- Gathering is by hand only (tools come in M3), and selected hotbar items can't be used yet.
- Nothing from M2 is saved; returning to the menu resets the grove.
- Khmer item names (ឈើ, ឫស្សី, ថ្ម, ស្លឹក) need native-speaker review.

## 0.1.0 — M1: Game shell, menus, movement, test world (2026-11-08)

### Added
- Phaser 3.90 + TypeScript strict + Vite project with `dev`, `build`, `preview`, `typecheck`, `test`, `smoke` scripts.
- Boot / Preload / Menu / World / UI / Pause scenes.
- Menu with the ព្រៃជ្រៅ title (Moul), Prey Chrov subtitle, Play, and Continue disabled with an explanation; keyboard + mouse navigation.
- Code-generated placeholder art: tiles, animated 4-direction explorer, trees with fading canopies, rocks, ferns, vignette, menu backdrop.
- Fixed 60×40 test grove with solid trees/rocks, trail, clear spawn and world bounds.
- Smoothed WASD movement with diagonal normalization, Shift sprint prototype, camera follow with lerp, Scale.FIT 1280×720.
- HUD control hints (H), sprint indicator, F3 debug overlay with physics view.
- Pause via Esc / window blur / hidden tab; Resume and Main Menu.
- Typed game event bus with scene-scoped auto-cleanup; safe save-slot inspection.
- 27 Vitest unit tests; 21-check headless browser smoke test (`scripts/smoke.mjs`).
- Claude Code subagents `phaser-qa` and `content-designer` in `.claude/agents/`.

### QA
- Ran the `phaser-qa` instructions with a stand-in general-purpose agent (Sonnet), because the `phaser-qa` agent wasn't loaded in this Claude Code session. Result: **0 Critical, 0 Warnings**.
- Suggestions applied:
  - Release key captures when World shuts down.
  - Buttons activate only when the press started on the button.
  - Removed unused camera deadzone config.
  - Reset the debug refresh timer when the UI scene restarts.
- Suggestion deferred: the `?debug` query exposes `window.__preyChrov` in production builds. Restrict or remove it before release (M18).
