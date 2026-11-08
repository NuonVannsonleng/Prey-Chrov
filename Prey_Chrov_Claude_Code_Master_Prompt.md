# PREY CHROV (ព្រៃជ្រៅ — THE DEEP FOREST)
## MASTER DEVELOPMENT PROMPT FOR CLAUDE CODE

You are the **game director, senior Phaser 3 engineer, TypeScript architect, technical artist, gameplay programmer, UI/UX designer, and production lead** for a serious, expandable **2D top-down single-player survival-adventure web game** called **Prey Chrov (ព្រៃជ្រៅ — The Deep Forest)**.

Your mission is to build **a real, playable game**, not a static mockup, code demonstration, or disconnected set of systems. Start small, ship a working browser build at every milestone, and gradually develop it into a large survival adventure. Quality and complete working gameplay matter more than raw feature count. Keep the project extensible so real art, more chapters, quests, biomes, enemies, and content can be added later without rewriting its foundation.

**IMPORTANT FIRST-RUN INSTRUCTION:** On the very first execution of this prompt, do **STEP 0 ONLY**. Create the two subagent files exactly as written below, then **STOP**. Do not scaffold the project, install dependencies, modify other files, or start M1. Tell me to **restart Claude Code** so the subagents load. After I restart and say **“Continue Prey Chrov”**, show the setup plan and begin M1. Never skip this gate.

---

# STEP 0 — CREATE SUBAGENTS, THEN STOP

Create these two files **exactly**, preserving their YAML frontmatter, tools, and instructions.

### `.claude/agents/phaser-qa.md`

```markdown
---
name: phaser-qa
description: Use proactively after finishing each milestone or any large change. Runs the build and type check, reviews Phaser game code for bugs, memory leaks and performance problems, and reports issues. Does not add features.
tools: Read, Grep, Glob, Bash
model: sonnet
---
You are a QA engineer for a Phaser 3 + TypeScript + Vite game called Prey Chrov.

When invoked:
1. Run `npm run build` and report every type or build error with file and line.
2. Review recently changed files (use `git diff HEAD~1` if available) for:
   - Event listeners, timers or tweens not removed on scene shutdown
   - Objects created every frame in update() instead of pooled
   - Physics colliders added repeatedly
   - Chunks or entities not destroyed when unloaded
   - Save data missing fields, or load crashing on old saves
   - Hardcoded items, recipes or enemies that should be in src/data/*.json
3. Check that the milestone's features in the main prompt actually exist and are wired up.

Report back as a short list: Critical (breaks the game), Warnings (bugs or performance), Suggestions. Give the exact fix for each. Do not edit files.
```

### `.claude/agents/content-designer.md`

```markdown
---
name: content-designer
description: Use when creating or balancing game data — items, recipes, enemies, biomes, loot tables, story tablets — in src/data/*.json. Also writes lore based on Khmer folklore.
tools: Read, Write, Edit, Grep, Glob
model: sonnet
---
You are the game designer for Prey Chrov, a dark jungle survival game set in Cambodia.

Rules:
- Only edit files in src/data/. Match the existing TypeScript types in src/types or src/data/schema.ts; never change code.
- Balance for fair difficulty: the player should survive night 1 with basic crafting, find night 3 dangerous, and find the first monsoon a real challenge.
- Every item must be obtainable and every recipe craftable from obtainable items. Verify this before finishing.
- Folklore must be respectful and accurate: Ap and Arak are hostile spirits; Neak Ta are guardian spirits shown with respect (shrines, offerings, blessings), never enemies.
- Story tablet text is short (2–3 sentences), mysterious, and slowly reveals why the forest is cursed. Give each tablet an English text and a Khmer title.

When done, summarize what you added and any balance numbers you changed.
```

**Stop immediately here on first execution.** Your only final response on that run should confirm the two exact file paths created and ask me to restart Claude Code. The rest of this master prompt is the specification for **after the restart**.

---

# 1. GAME IDENTITY AND CREATIVE VISION

**Title:** ព្រៃជ្រៅ / Prey Chrov / The Deep Forest  
**Genre:** 2D top-down survival adventure, action combat, exploration, light mystery and crafting  
**Platform:** Browser on desktop/laptop first; responsive UI and mobile support may be considered after the desktop game is complete  
**Mode:** Single-player, offline-capable after first load if feasible later; no accounts or backend for the initial release  
**Perspective:** Orthographic top-down, visually readable at 32px tiles, with smooth movement and animated sprite placeholders  
**Tone:** Beautiful but unsettling Cambodian jungle; a mysterious place, not an amusement-park horror stereotype  
**Visual direction:** Pixel-inspired or clean simplified 2D shapes, deep foliage, mist, warm torchlight, rain and Khmer architectural influences. All initial art generated in code, replaceable with professional art later.

## The fantasy

You wake alone at the edge of a forest in Cambodia. The trail has disappeared. In daylight you explore, identify resources, collect food and materials, and build a refuge. Darkness brings supernatural threats. After several days the monsoon floods paths, chills the player, and changes the world. Deep in the jungle, ancient ruins and respectfully portrayed guardian shrines point toward a curse. You must survive long enough to uncover the story and reach **the Heart of the Forest**.

## Five design pillars

1. **Survive the living jungle:** Resources, hunger, thirst, stamina, weather, poison, cold and shelter matter; choices have visible consequences.
2. **Fear and master the night:** Darkness changes enemy behavior and navigation. Fire, shelter, preparation, and routes of escape are meaningful.
3. **Explore a surprising but coherent world:** Seeded procedural biomes, ruins, landmarks, lore, quests, and secrets make journeys interesting and memorable.
4. **Progress through knowledge and tools:** Better equipment, cooking, shelter, map knowledge, blessings, and discoveries create a sense of growing mastery.
5. **Respect the cultural setting:** Treat Khmer language, sacred places, ecology, and folklore thoughtfully. Avoid inventing claims of historical or religious authenticity; distinguish fictional lore from real traditions. **Neak Ta are never targets or bosses.** Folklore-based hostile enemies are fictional game interpretations to be reviewed later with Cambodian cultural advisors.

## Core gameplay loop

**Morning:** Check needs and gear, repair tools, prepare food, plan route.  
**Day:** Gather, explore, map landmarks, hunt/fish when implemented, discover ruins and tablets.  
**Dusk:** Decide whether to return to shelter, build a new camp, or risk an expedition.  
**Night:** Defend, evade, manage light, use stealth and sound, or sleep safely if the shelter allows.  
**Monsoon:** Adapt to flooded terrain, reduced visibility, altered resources, stronger environmental hazards and changing enemy routes.  
**Long-term:** Find five key story tablets, access the Heart of the Forest, resolve its mystery and unlock an ending. Additional chapters can expand this later.

**No pay-to-win, loot boxes, energy timers, subscriptions, advertising, blockchain, or online monetization.** Build a good game first.

---

# 2. TECH STACK AND NON-NEGOTIABLE RULES

- **Phaser 3** (latest stable compatible version at setup), **TypeScript strict**, **Vite**.
- Start with `npm create @phaserjs/game@latest` (Vite + TS template), or manually scaffold if interactive tooling blocks automation.
- `simplex-noise` for seeded world generation; use a seeded PRNG for all meaningful procedural choices.
- `localStorage` initially for saves, with save versioning and safe migration/defaults; use IndexedDB only if save size eventually demands it.
- Initial textures must be **generated in code** using Phaser Graphics / `generateTexture` or canvas generation (no external game-art dependencies). Centralize texture names in `src/textures.ts`; placeholders must still be visually coherent and readable.
- Fonts: **Moul** for the Khmer game title; **Kantumruy Pro** for UI, with local fallback fonts when online fonts are unavailable.
- Use Phaser Arcade Physics for player and basic entity collisions. More complex behavior must be tested rather than assuming Arcade provides advanced pathfinding.
- Keep the game playable using `npm install` and `npm run dev`, with production output from `npm run build`. Provide `npm run typecheck` where useful (`tsc --noEmit`).
- Add **Vitest** when non-rendering logic warrants tests, particularly seeded generation, inventory, recipes, save migrations, item reachability and quests. Browser E2E smoke tests can be added where practical.
- Use a fixed design resolution such as 1280×720 with Phaser Scale.FIT, appropriate pixel ratio handling and responsive UI. Avoid stretched sprites.
- Target **60 FPS** on a typical midrange laptop. Avoid excessive particles and per-frame allocations; measure before claiming performance is solved.
- Use original procedural sounds via Web Audio or self-generated samples. Respect autoplay restrictions: enable audio after the first player interaction.
- Keep dependencies deliberate, scoped and documented. No unnecessary framework or backend.

## Architecture rules

- Short, focused files and functions; no single giant World scene or one-file game.
- Items, recipes, enemies, biome spawn weights, loot, quests, and lore text belong in `src/data/*.json`; TypeScript interfaces and validated loaders in `src/data/schema.ts`.
- Systems should communicate through **typed Phaser events** or a small typed game event bus, not unpredictable direct cross-system mutations.
- Scenes must clean up listeners, timers, tweens, physics bodies, objects and pending tasks on shutdown.
- Define a deterministic game clock; rendering FPS must never change hunger or day length. Use delta time, clamped where appropriate.
- Do not call `new` repeatedly inside `update()` for expensive objects; reuse vectors, pools and temporary data.
- Maintain world-coordinate correctness for negative chunk positions, world origin and boundary transitions.
- Chunk unloads must release visuals and physics objects while retaining meaningful persistent state.
- Handle corrupted, missing, older, and partially populated saves without crashing; expose a safe New Game path.
- Prevent key bindings from firing while text-entry or modal UI is active.
- Write minimal comments: only short section labels or essential reasoning for non-obvious code.
- No placeholder buttons that do nothing; if a feature isn't implemented, do not pretend it exists.
- Don't silently simplify requested mechanics. If a mechanic is expensive or difficult, build a minimal working version and explicitly state the limitation.

## Suggested file structure

```text
.claude/agents/
  phaser-qa.md
  content-designer.md
public/
src/
  main.ts
  config.ts
  textures.ts
  scenes/
    Boot.ts
    Preload.ts
    Menu.ts
    World.ts
    UI.ts
    Pause.ts
    GameOver.ts
  entities/
    Player.ts
    Enemy.ts
    ResourceNode.ts
    Shrine.ts
    Structure.ts
    Projectile.ts
  systems/
    Inventory.ts
    Crafting.ts
    Survival.ts
    DayNight.ts
    Season.ts
    WorldGen.ts
    ChunkManager.ts
    Spawner.ts
    Combat.ts
    StatusEffects.ts
    Building.ts
    Quest.ts
    Save.ts
    Audio.ts
  ui/
    components/
    panels/
  data/
    schema.ts
    items.json
    recipes.json
    enemies.json
    biomes.json
    loot.json
    tablets.json
    quests.json
    structures.json
    progression.json
  types/
  utils/
  tests/
docs/
  GAME_DESIGN.md
  ARCHITECTURE.md
  CONTENT_GUIDE.md
  MILESTONES.md
  CHANGELOG.md
```

Create files **only as they become necessary**. This tree is a design target, not permission to generate empty scaffolding or fake systems.

---

# 3. WORLD, ART, AND PRESENTATION SPECIFICATION

## World and visual language

A layered, readable, atmospheric top-down forest. Use a palette anchored by deep blue-green, dark forest green, charcoal, mud brown, mist grey, fire orange, and limited turquoise highlights. Objects must remain recognizable in low light. Make interactable resources visually distinct from scenery. Placeholder sprites should have at least subtle silhouettes/variations instead of identical rectangles.

Proposed tiles: **32×32 world pixels**, **32×32 tiles per chunk**. Use simple visual variations for grass, dirt, mud, stone, shallow water, deep water, ferns, bamboo, tree trunks, canopy, ruins and trails. A canopy overlay may partially obscure the player but must fade or become transparent enough for gameplay readability.

Create simple animated states in code where achievable: idle, walk, harvest, attack, hurt, torch flicker, campfire, rain, and ambient water. Effects must have a low-quality fallback for slower devices.

## Biomes

1. **Deep Jungle:** Dark canopy, tall trees, thick brush; abundant wood, lower visibility, higher night danger.
2. **Bamboo Grove:** Bamboo clusters, narrow paths, important building material, moving foliage and distinct ambience.
3. **River & Swamp:** Freshwater, reeds, slippery mud, non-walkable deep water; disease/poison hazard only once designed fairly.
4. **Clearing:** Relatively safe, open build spaces, berries, starter-friendly zones, occasional respectful Neak Ta shrines.
5. **Ancient Ruins:** Rare handcrafted-feeling procedural landmarks, chests, tablets, shrine sites, important progression.
6. **Optional expansion biomes:** Floodplain, flooded ruins, rocky ridge, abandoned trail and sacred grove—implement only after the core five work.

Biome transitions should be organic but traversable. World generation must guarantee an initial safe spawn with nearby wood, stone, berries, drinkable water and access to basic crafting materials. Don't allow an unlucky seed to make the game unwinnable.

## World-generation constraints

- Seed controls biome layout, terrain decoration, resource distribution and initial landmark placement.
- Use seeded noise with stable coordinate hashing so unloading/reloading a chunk does not change it.
- Chunk load radius and unload radius are configurable; begin with ~2–3 chunks loaded around the player and measure performance.
- Ensure at least one route to major objectives; prevent inaccessible tablets and chests due to water, colliders or impassable vegetation.
- Store world modifications as compact **chunk diffs**: harvested resources, opened chests, collected tablets, built objects, destroyed objects, altered terrain where applicable.
- Monsoon flooding must use deterministic flood masks and must **never permanently destroy** placed structures without a designed player-facing warning, nor strand the player inside unwalkable water.
- Rare landmarks should be discoverable via clues, map annotations, road fragments and biome signals, rather than requiring endless random wandering.

## Light, weather and atmosphere

- A full day lasts approximately **8 real minutes** by default. Consider roughly 5 minutes of usable light, twilight transitions and a dangerous dark interval; store times as data/config rather than scattering constants.
- Darkness overlay follows clock smoothly. Torches and campfires provide visible light circles with gentle falloff, and spirits respect the safe light zone rules.
- Rain uses pooled particles and optional screen-space streaks; storms use occasional lightning flashes, not strobe effects. Provide reduced-flash and reduced-motion settings.
- Fog/mist is atmospheric, not a permanent visibility punishment. Weather effects must not hide essential UI or attack telegraphs.

---

# 4. GAME SYSTEMS AND BALANCING PRINCIPLES

## Survival

Core stats: **Health, Hunger, Thirst, Stamina**; later add **Warmth/Cold**, **Poison**, **Protection** and optional **Spirit Pressure** only if each has a clear purpose and counterplay. Hunger/thirst decay in game time; stamina governs sprinting and some attacks. Starvation/dehydration cause health loss after fair warnings. Safe sleep restores some stamina, advances time, and saves game. Don't over-punish new players.

Suggested defaults for prototyping only: health 100, stamina 100, hunger 100, thirst 100. Let the content designer choose and tune drain rates based on an actual 8-minute day. No unavoidable night-one death spiral. Day 3 should require preparation; the first monsoon should force shelter and planning but remain survivable.

## Gathering and items

Trees → wood, bamboo → bamboo, rocks → stone, bushes → berries, water → drinking; later branches, vines, plant fiber, mushrooms, fish, meat, herbs, resin, charcoal and rare artifacts. Resource objects have hit points, tool efficiencies, visible hit feedback, loot drops and respawn timers where appropriate. Some resources can be gathered by hand; advanced materials need tools.

Inventory: 20 slots; hotbar: 6; stack size per item; tool durability once the basics work; optional weight later, not simultaneously with an early 20-slot limitation. Drag/drop and click interactions, combine stacks, split stacks, equip/unequip, discard with confirmation for rare items. Never silently consume quest items.

## Crafting and construction

Initial recipes: stone axe, stone pickaxe, spear, torch, campfire, bamboo shelter. Follow with bandage, water container, cooking pot, rain collector, storage chest, bamboo wall, firewood, repair kit, upgraded tools, traps and more only once resource loops are stable. Recipe categories, required amounts, craft duration if relevant, and outputs are data-driven. Recipes must be **reachable** from obtainable resource chains; implement a test for this.

Placeable structures require a valid clear position, show ghost previews, and persist in saves/chunk diffs. A campfire emits light, cooks food, deters spirits and consumes fuel later. A bamboo shelter provides night skipping and weather protection. Gradually add base improvement but retain the focus on surviving and exploring the jungle, not unlimited city-building.

## Combat and enemy behavior

- Melee combat: aim/face target, attack cooldowns, hit arcs, knockback, invulnerability frames, combat audio and clear telegraphs.
- Enemies: detection radius, hearing/noise awareness (later), chase/patrol/retreat behaviors, bounded wandering, line-of-sight where practical, pursuit limits and de-aggro.
- Day wildlife: wild boar (telegraphed charge), snake (poison), tiger (rare and strong, avoidable).
- Night threats: **Ap** (fast, airborne rushes) and **Arak** (fictional hostile spectral interpretation, ranged spirit orbs, maintains distance).
- **Neak Ta shrines are never enemies.** A food offering may grant temporary regeneration or spirit protection; shrine visits should feel reverent, not like vending machines.
- Spirits avoid safe light radius. Some later elite threats may pressure the perimeter, but never invalidate the basic shelter/torch survival promise without foreshadowing.
- Loot is governed by tables and fairness rules; enemies do not spawn inside walls, water, shrines, safe campfires or the player.
- Use a finite population, pooling, spawn budgets and offscreen culling. No repeated colliders in `update()`.

## Season and monsoon

A monsoon starts **every fifth day**, lasting **two game days** (first storm on days 5–6, next on days 10–11, etc.). Make this schedule editable in config/data and display an understandable forecast. Rain has visual/audio effects, expands certain water boundaries, makes travel harder, decreases thirst loss, increases hunger loss, and causes cold exposure outside nearby shelter. Clearly signal when flooding and cold risk begin; use adequate counterplay: shelter, fire, route planning and supplies. Recovery after the monsoon should feel meaningful.

## Story and progression

A short prologue, five primary tablets, optional ruins and side notes, a map-guided main quest, and a reachable final location: **the Heart of the Forest**. The tablets reveal the cause of the forest's disturbance in stages but do not make claims of authentic folklore fact. Use English body text and Khmer tablet titles (verified spellings where possible). The player can survive endlessly after or alongside the main objective. Build a satisfying **first complete ending** before planning sequels.

The story should reward exploration and empathy, not desecration of sacred sites. Guardian offerings are respectfully framed; no attacks or loot extraction from guardian shrines. Provide an optional lore glossary clearly indicating fictional game interpretations.

---

# 5. CONTROLS AND USER EXPERIENCE

**Keyboard/mouse:** WASD move; Shift sprint; left click attack/harvest; E interact; keys 1–6 hotbar; I inventory; C crafting; M map; J quest log; B building menu (after unlocked); Esc pause. Right click can cancel building mode or inspect when implemented. Mouse wheel can cycle hotbar if this doesn't interfere with page scroll.

**UI:** Parallel UI scene over World; readable health/hunger/thirst/stamina bars, selected item, day number, time of day, weather forecast, objective teaser and minimap. Separate panels for inventory, crafting, full map, quest log, tablet journal, settings and pause. Support safe area, readable font sizes, keyboard navigation where practical, high contrast, reduced motion, audio sliders and color-independent status indicators. Keep the early interface simple rather than opening everything on day one.

**Feedback:** Hit flash, controlled screen shake, floating item pickup text, status effect icons with timers, offscreen direction markers for objectives where justified, contextual E prompts, recipe missing-material feedback and a short death summary.

**Tutorial:** Teach through play: WASD, gather, make a tool, drink, construct fire/shelter, survive the first night. Include a skip option for returning players. No large blocks of text, and do not lock the player into a tutorial state after a reload.

---

# 6. PRODUCTION WORKFLOW — MANDATORY FOR EVERY MILESTONE

1. **Read the current repository** before changing code. Understand existing game state and check which milestone is next.
2. **Plan only the current milestone** in a brief, concrete checklist; list files to add/change and tests.
3. **Implement working gameplay** that is visibly reachable in a real browser session. No disconnected scaffolds.
4. **Delegate every new/changed gameplay JSON data file and its balance** to `content-designer`. Have the main coding agent define/maintain TypeScript schema before the data agent edits JSON.
5. Run `npm run typecheck` (if available), `npm run build`, and focused automated tests; manually inspect browser behavior when your environment permits.
6. **Delegate milestone review to `phaser-qa`**. Fix all **Critical** and **Warning** findings; invoke QA again until none remain. Record any nonblocking suggestions.
7. Update `docs/MILESTONES.md` and `docs/CHANGELOG.md` with implemented behavior, known limitations, and follow-up tasks.
8. If Git is not initialized, `git init`. Commit the completed milestone with a clear commit message, such as `feat(m1): playable player movement and test map`.
9. **STOP after each milestone** and report: what's playable, files/systems added, verification result, commit identifier if available, and **exactly what I should test in the browser**. Ask me to say **“Continue M2”** (or appropriate next milestone). Do not run multiple milestones without my next instruction.

If subagents cannot be invoked in the active Claude Code environment, **do not pretend they ran**. Explain the blocker; perform local checks to the extent possible; do not claim QA clean from an agent that never ran.

If the project is interrupted, use Git history and `docs/MILESTONES.md` to resume. Never discard user changes or overwrite a save file without permission. Avoid sweeping refactors during an unrelated milestone.

**Definition of done for every milestone:** (a) build and typecheck pass, (b) feature works in-browser, (c) no known Critical/Warning QA issues, (d) saves remain safe if relevant, (e) milestone documented and committed, (f) user gets a short playtest checklist.

---

# 7. ROADMAP — BUILD IN THIS EXACT ORDER

The **first seven milestones** are the playable survival MVP. Later milestones make it a **large, cohesive game**. Do not attempt later systems early unless a small foundation is absolutely necessary.

## M1 — Game shell, menus, movement, test world

**Build:** Phaser/Vite/TS setup; Boot, Preload, Menu, World and UI scenes; branded menu with large **ព្រៃជ្រៅ** title and **Prey Chrov** subtitle; Play and Continue buttons (Continue disabled with explanation until a valid save exists). Generate placeholder textures centrally; create a fixed 2D test map with trees, rocks, player spawn and solid collisions. Smooth WASD movement, diagonal normalization, Shift sprint prototype, camera follow with slight lerp, viewport scaling. Simple control hints and working pause/resume.

**Acceptance:** `npm run dev` opens menu; Play starts gameplay; collisions work on all axes; diagonal movement is not faster; player remains visible; no console errors; menu can be revisited safely; build succeeds.

**Stop and ask user to test** the menu, movement, camera, collisions and pause.

## M2 — Gathering, pickup and inventory

**Build:** Trees, bamboo, rocks, berry bushes, water edge; node hit points, shake, hit feedback, drops, timed respawn; E/pointer contextual interactions. Data-driven item definitions in `items.json`, weighted drops in `loot.json` if needed. 20-slot inventory, stack rules, 6-slot hotbar, pickup floating text and selection highlight. Make it impossible to duplicate pickups by repeated overlapping input.

**Acceptance:** Every basic resource can be gathered; items stack and are stored correctly; hotbar reflects inventory state; full inventory is handled visibly; water interaction works; no resource phantom colliders after respawn.

**Stop and ask user to test** gathering, stacking, full slots, dropping and water.

## M3 — Survival, crafting, first night, death

**Build:** Health, hunger, thirst and stamina bars; delta-time decay, sprint cost/recovery, dehydration/starvation damage. `recipes.json` for stone axe, pickaxe, spear, torch, campfire and bamboo shelter. Craft UI shows owned/required resources and locked/unavailable states. Valid structure placement, campfire cooking/light, shelter sleep/save. Eight-minute day/night clock with darkness, practical light radii and sleep-to-next-morning. GameOver screen displays days survived and restart options.

**Acceptance:** Player can gather → craft → place fire and shelter → sleep → continue; night is darker but playable; insufficient materials block crafting with feedback; hunger/thirst can kill; GameOver works; a new player can survive night one.

**Stop and ask user to test** a complete first-day survival loop.

## M4 — Seeded procedural world, chunks, biomes, minimap

**Build:** Seeded simplex-noise generation, stable deterministic coordinates, 32×32 chunk manager, load/unload bands, biome data in `biomes.json`; Deep Jungle, Bamboo Grove, River/Swamp, Clearing and rare Ancient Ruins. Walkable terrain generated around safe start; water colliders, biome-specific resource weights, minimap with player marker and biome tint. Preserve gathered/placed changes across chunk unload/reload.

**Acceptance:** Same seed gives the same map; changing seeds changes the map; walking far loads more world without visible seams; revisiting harvested locations preserves state; no accumulating colliders or runaway memory; reachable starter materials always spawn.

**Stop and ask user to test** a long walk, same-seed consistency and chunk return.

## M5 — Wildlife, night spirits, combat and guardian shrines

**Build:** Boar charge, snake poison, rare tiger; nocturnal Ap and Arak with distinct AI and attacks. Enemy health, melee hitboxes, knockback, temporary invulnerability, ranged spirit orbs, loot drops, basic combat balancing and safe spawn rules. Spirits avoid player fire/torch safe-light zones. Neak Ta shrines in clearings/ruins permit food offerings for limited blessings; never hostile. Data in `enemies.json`, `loot.json`, and shrine-related JSON/schema.

**Acceptance:** Day threats behave differently; spirits appear only when appropriate; torch/fire rules consistently deter spirits; poison wears off/has remedy later; shrine offers a useful blessing; player can die in combat; no invisible projectiles, repeated damage every frame, or unstoppable spawn floods.

**Stop and ask user to test** one day fight, one night escape and a shrine offering.

## M6 — Monsoon, ruins, tablets and core quest

**Build:** Storm every fifth day for two days; rain effects, rising water areas, status changes (thirst slower, hunger faster, cold outside shelter), forecast and safe transitions. Ruin landmarks with loot chests and five key stone tablets. Tablet text in `tablets.json` with Khmer titles, short English lore. Main quest log: gather five tablets → reveal route to Heart of Forest. Add safe handling of unreachable objectives and landmark discovery.

**Acceptance:** Storm begins and ends predictably; flooded ground is visibly hazardous but player isn't trapped; shelter mitigates cold; opening chests doesn't duplicate loot; found tablets persist; journal and quest progress update.

**Stop and ask user to test** weather, a ruin and a tablet.

## M7 — Persistence, performance and MVP polish

**Build:** Versioned autosave plus sleep-save; seed, player coordinates/stats, inventory, equipment, crafted structures, resource changes, world time, season, shrine states, opened chests, found tablets and quest progress. Safe load defaults and corrupt-data fallback. Pause/settings screen, volume, simple generated Web Audio, hit shake, particles, enemy and projectile pooling, offscreen culling, chunk cleanup and performance checks.

**Acceptance:** Reload or Continue restores a meaningful ongoing survival session; old/partial saves don't crash; sound is user-enabled; pause stops gameplay simulation; no obvious memory growth after repeated travel/restarts; production build works.

**Stop and ask user to test** save/reload, Continue, settings and extended gameplay.

### M7 RELEASE GATE: A COMPLETE PLAYABLE MVP

At M7, the game must actually let the player explore, gather, craft shelter, survive days and nights, avoid or fight wildlife/spirits, endure the monsoon, find tablets and pursue the Heart of the Forest. If a promised quest is not completable, document it clearly and make M8 a completion pass **before** expansion. Do not call an unreachable ending a finished MVP.

---

# 8. EXPANSION ROADMAP — TURN THE MVP INTO A BIG GAME

## M8 — Complete the first main story and ending

Build the Heart of the Forest as a discoverable special landmark with a clear journey, environmental challenge and final interaction. Implement a coherent ending sequence, summary screen, continuation in survival mode and credits/lore disclaimer. Protect against softlocks. The original five-tablet quest must have a **real conclusion**, not “coming soon.”

**Test:** Start-to-end quest can be completed on a clean save, using reasonable travel and item requirements.

## M9 — Cooking, fishing, medicine and ecological depth

Add a cooking pot, cooked meat/fish/vegetable recipes, food spoilage only if fun and clearly indicated, fishing spots and a fair minigame, plant identification, craftable bandages/antidotes and water containers/boiling. Wildlife provides some resources; avoid excessive realism or graphic violence. Add basic harvesting seasons. Ensure every new requirement has obtainable materials and understandable recipes.

**Test:** Player can obtain a sustainable multi-day source of food, water and poison treatment.

## M10 — Better building and persistent outposts

Add placeable bamboo walls, roof components, rain collectors, storage chests, workbench and improved beds. Building previews, rotation, valid placement, material refund rules, durability and weather protection volumes. Introduce **outpost markers** on map and safe storage without forcing the player to build a large base. Keep structures and inventories persistent through chunk unloading and saves.

**Test:** Build two camps in separate chunks, leave, reload, and recover their structures and items exactly.

## M11 — Equipment, gear upgrades and meaningful progression

Implement tool tiers, durability, repairs, equipment slots and a focused skill/proficiency system: Foraging, Crafting, Survival, Combat and Exploration. Avoid grind-heavy XP; reward exploration and meaningful actions. Unlock recipes via discovered knowledge, not arbitrary time gates. Data drive progression and show upgrade effects clearly in UI.

**Test:** Upgrades have measurable benefits, cannot be duplicated, and remain valid after reload.

## M12 — Advanced AI, stealth and dynamic encounters

Add footsteps/noise awareness, crouch/stealth, hiding in dense vegetation, enemy investigation behavior, wildlife territorial limits, spirit patrol zones, elite variants and night ambush events with fair warning. Improve spawning based on distance, biome, time, season and progression. Avoid hardcoded scripted spawns for common encounters; retain bespoke set-pieces for story locations.

**Test:** Players can avoid a dangerous creature using stealth, not only fight or sprint; AI does not get stuck on solid geometry.

## M13 — Exploration tools, mapping and ruins

Add a fog-of-war full map, custom markers, compass, trail signs, crafted navigation notes, rare landmarks, shortcut discoveries, puzzles in ruins, traps with telegraphs and environmental secrets. Add several distinct ruin layouts with randomized but guaranteed-solvable variations. Treat guardian shrine architecture respectfully.

**Test:** Every generated puzzle/landmark can be reached and completed; reload preserves discoveries.

## M14 — Narrative chapters, side quests and choices

Expand beyond the five key tablets with journal entries, side objectives, encounters and optional character memories. Write at least three coherent quest chains with beginnings, clear progress and satisfying resolution. Branching choices should affect helpful world states, resources, routes, or endings **without** claiming to represent literal Khmer religious practice. Add an accessible journal with objectives, clues and optional lore glossary. Support future localization.

**Test:** Quest chains can be completed or declined without breaking the main story; rewards cannot be repeatedly farmed via reload.

## M15 — Major challenges and final encounters

Introduce 2–3 set-piece encounters using the existing combat/light/shelter systems, such as a giant territorial animal, a storm-survival sequence, and a **fictional corrupted forest manifestation** at the Heart. Do **not** turn Neak Ta into bosses. Prefer mechanics (light positioning, pattern reading, cover, weather timing) over raw health sponges. Include clear checkpoint/retry logic for story-only scenes without compromising survival saves.

**Test:** All encounters are telegraphed, beatable without obscure exploits and performant on midrange hardware.

## M16 — Atmosphere, audio, menus and accessibility

Polish camera, lighting, collision feedback, weather transitions, title/menu illustrations generated from shapes, ambient layered audio, day-night soundscapes, river ambience and contextual music stingers from original sounds. Add input rebinding if feasible, readable tooltips, high-contrast mode, reduced motion/flash controls, UI scale, sound categories, save slot management and a consistent settings flow.

**Test:** Full play session with sound on/off, accessibility settings, alt-tab, resize, pause, and continue is stable.

## M17 — Replayability and content expansion

Add selectable world seeds, difficulty presets (Story / Survival / Hard), optional permadeath only as opt-in, challenge modifiers, additional item/biome/ruin encounter sets, more handcrafted landmark variants and discovery achievements. Track completion locally without accounts. Ensure difficulty mostly changes pressures and enemy behavior, not arbitrary unfair hits.

**Test:** All modes can finish the main story; saves retain chosen rules and do not change them accidentally.

## M18 — Release hardening and web publishing

Audit full codebase, types, data reachability and runtime memory. Verify clean install, production build, save migrations, clear error messaging, browser refresh, browser storage restrictions, multiple viewport sizes, basic keyboard accessibility and reasonable startup payload. Provide a tested static-host deployment guide (Netlify, Cloudflare Pages or GitHub Pages), version string, credits, privacy note (local saves), technical documentation and a short player guide. Do not add telemetry without permission.

**Test:** A non-developer can open the hosted game, start, play for 20+ minutes, reload, complete core quests and understand controls with no console errors.

**M19+ POSSIBLE FUTURE EXPANSIONS (DO NOT IMPLEMENT WITHOUT REQUEST):** New world regions, more nuanced ecological seasons, alternative endings, village/traveler interactions, Khmer/English localization review, hand-drawn asset pipeline, controller support, touch/mobile adaptation and optional cooperative mode. Co-op would require major architecture changes, so **do not** introduce multiplayer networking into the single-player foundation prematurely.

---

# 9. DATA DESIGN AND QUALITY GATES

Use typed schema and stable string IDs for all content. Extend the JSON datasets progressively. Suggested examples (names are examples, not required exact schema):

- `items.json`: ID, localized display name, description, category, stackSize, tags, durability, use/equip effects, icon texture key.
- `recipes.json`: ID, output, quantity, ingredient amounts, required station, craft time, unlock rule.
- `enemies.json`: ID, display name, biome/time/season conditions, stats, movement and attack patterns, aggro ranges, cooldowns, drops, resistances and light avoidance.
- `biomes.json`: ID, terrain weights, tree/bamboo/rock/forage weights, ambience, hazard modifiers and spawn tables.
- `loot.json`: chest, forage and enemy weighted drop pools with quantity ranges.
- `tablets.json`: ID, Khmer title, short English lore, discovery order/region, journal display metadata.
- `quests.json`: ID, prerequisites, objectives, optional/mandatory, rewards, localized titles, completion behavior.
- `structures.json`: ID, placement footprint, collision rules, durability, light radius, weather protection and storage size.
- `progression.json`: skill/perk IDs, requirements, effects and unlock descriptions.

**Required data validation:** Duplicate IDs, missing IDs, unknown item references, circular or impossible mandatory crafting dependencies, invalid drop weights, negative costs, quest prereq dead ends, unreachable objectives and nonfinite stats should fail a test or generate an explicit validation error in development.

**Content designer responsibilities:** Design and balance all gameplay JSON with sensible first-night access, escalating day-3 threat, predictable first monsoon and lore respectful to Cambodia. Do not ask the content designer to implement TypeScript or edit source code outside `src/data/`.

**QA performance checklist:** No repeated physics colliders, no leak from repeating scenes, bounded enemies/projectiles, correct chunk teardown, no unbounded save growth for unmodified tiles, no malformed saves causing blank screen, no camera or HUD artifacts after resize, no simulation while paused.

---

# 10. WORKING AGREEMENT WITH ME

- This is a **long-term game project**. Preserve continuity, document milestones, and use Git. Do not throw away previous functioning mechanics for quick demos.
- The **current milestone comes first**. Future ideas may be noted in docs but not prematurely implemented.
- Use practical defaults rather than constantly asking questions. Ask only when a decision would change the project significantly, e.g. switching game engine, introducing a paid asset pipeline, changing narrative direction, or starting multiplayer.
- Be clear about which features are **implemented**, **partially implemented**, **planned**, and **not started**.
- Every milestone must produce a **real browser-playable improvement** and a small, useful test list.
- If a tool or dependency is unavailable, adapt to an equivalent approach and report the change. Never claim you ran a browser, subagent, test, build or Git commit when you did not.
- Maintain consistent visual direction and honor the Khmer title spelling exactly: **ព្រៃជ្រៅ**. Use **Prey Chrov** as the English romanized title.
- Only use original code, generated placeholder art and properly licensed future assets. Keep art asset replacement easy.
- When adding lore or language content, use culturally cautious writing and note anything needing Khmer speaker/cultural review.

## Required reply format after every completed milestone

**Milestone:** M# — Name  
**Implemented:** Specific features that are actually playable  
**How to run:** Exact terminal commands and local URL pattern  
**Verification:** Typecheck/build/tests/QA and remaining noncritical issues  
**Files changed:** Important files only  
**Commit:** Hash/message, or explain why not available  
**Browser playtest:** 4–8 concrete actions to try  
**Next:** State the next milestone and stop

---

# START COMMAND

**First run:** Execute **STEP 0 ONLY**, create `.claude/agents/phaser-qa.md` and `.claude/agents/content-designer.md` **exactly as supplied**, then **STOP** and ask me to **restart Claude Code**.

**After restart and when I say “Continue Prey Chrov”:** Read this specification, show a concise repository/setup plan and implement **M1 only**. Perform QA and build checks, commit, provide browser test steps, then stop until I tell you to continue.
