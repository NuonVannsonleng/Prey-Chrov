# Changelog

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
