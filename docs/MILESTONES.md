# Milestones

Status legend: **Done** · **In progress** · **Not started**

| # | Name | Status |
| --- | --- | --- |
| M1 | Game shell, menus, movement, test world | Done |
| M2 | Gathering, pickup and inventory | Done |
| M3 | Survival, crafting, first night, death | Done |
| M4 | Seeded procedural world, chunks, biomes, minimap | Done |
| M5 | Wildlife, night spirits, combat and guardian shrines | Done |
| M6 | Monsoon, ruins, tablets and core quest | Done |
| M7 | Persistence, performance and MVP polish | Done |
| M8 | Complete the first main story and ending | Done |
| M9 | Cooking, fishing, medicine and ecological depth | Done |
| M10 | Better building and persistent outposts | Done |
| M11 | Equipment, gear upgrades and meaningful progression | Done |
| M12 | Advanced AI, stealth and dynamic encounters | Done |

---

## M12 — Advanced AI, stealth and dynamic encounters

### Implemented (playable)

- **Crouch (hold Z):** move at 55% speed with no sprinting, quietly, and be harder to see. A CROUCHING tag shows above the hotbar.
  - Z is used rather than Ctrl because Ctrl+W, Ctrl+S and Ctrl+D are browser shortcuts (close tab, save page, bookmark).
- **Footstep noise:** every frame the player makes a noise radius.

  | Activity | Noise radius |
  | --- | --- |
  | Standing still | 0 |
  | Crouch-walking | 40 px |
  | Walking | 120 px |
  | Sprinting | 240 px |
  | Gathering, attacking or other actions | 170 px |

  Each creature hears it scaled by its hearing: vipers hear less, tigers more.
- **Hiding in dense vegetation:** standing still or crouching within reach of a bush, a standing bamboo clump, ferns or reeds makes you **HIDDEN**. You show slightly translucent, and sight against you drops to 30%. Crouching in the open gives 70%. At night animals see 70% as far, but spirits don't.
- **Awareness and investigation:** each creature has an awareness meter.
  - Seeing you raises it fastest, more so when close. Hearing you raises it more slowly. Otherwise it fades.
  - From 35% it **investigates** the last place it sensed you, with a "?" over it. At 100% it is **alerted**, with a red "!", and only then hunts and attacks.
  - Lose it (hide, slip away) and it falls back to searching, then gives up.
  - Hitting a creature always alerts it.
- **Wildlife territories:** boars (300 px), vipers (120 px) and tigers (420 px) keep to the area where they appeared. Past it they give up the chase and walk home.
- **Spirit patrols:** Ap and Arak patrol a slow loop around where they appeared, instead of drifting at random.
- **Not stuck on geometry:**
  - Every half second a walker that tried to move but barely did sidesteps along a perpendicular.
  - After about 2.6 s of being blocked it gives up the chase. A creature that can't get home makes its current spot its new home.
  - Fliers ignore solids.
- **Elite variants:** from day 4, an 8% chance that grows 1.5% per day up to 30%.
  - Elites are golden-tinted, slightly larger, with 1.7× health and 1.25× damage.
  - They drop a second share of loot.
- **Night ambushes with fair warning:** from day 3, at most one roll per night (35%). The roll is saved, so a reload never re-rolls it. There are no ambushes at an outpost, in your own light, in the Heart glade, or after the Heart is restored.
  - First comes a warning: a sound and "The insects fall silent… something is circling. You have a few moments (6s)."
  - Six seconds later 2–3 light-shy spirits appear on a ring 300–380 px away. They are never in light, water, solids, or near shrines or outposts.
  - Ambushers know roughly where you are but must still find you, so you can still find light or hide.
- **Smarter spawning:** spawns now depend on distance, biome, time, season and progression.
  - **Distance:** populations near home are ×0.6, the mid jungle ×1, and beyond 140 tiles ×1.3.
  - **Biome:** per-biome weights and night danger, as before.
  - **Time:** day and night tables.
  - **Season:** monsoon nights weight spirits ×1.5.
  - **Progression:** the night cap grows with days survived, and the elite chance grows with days.
  - Common encounters stay fully systemic. The Heart glade and the ruins remain bespoke places with no scripted common spawns.
- **Data-driven:** all of the above lives in `stealth.json`, plus `hearing`, `territory` and `patrolRadius` in `enemies.json`. The validator enforces fairness: crouch is quieter than walking, which is quieter than sprinting, and the ambush warning is at least 3 s.

### Verification

- `npm run typecheck` and `npm run build` pass.
- `npm test`: 164 unit tests. New ones cover:
  - noise ordering
  - a tiger 140 px away spots a walking player but never one hiding still in cover
  - sneaking gets closer than walking before being noticed
  - awareness decay
  - night sight
  - the elite chance curve
  - distance danger
  - the ambush warning being at least 3 s
- `npm run smoke`: 192 browser checks. The M12 ones:
  - crouched and still in a bush, a tiger 140 px away never notices you (HIDDEN shown)
  - walking in the open at the same distance gets you spotted
  - noise: crouch < walk < sprint
  - a creature that only hears you investigates ("?")
  - a boar chasing into a wall goes around or gives up
  - wildlife beyond its territory heads home
  - elites are tougher and marked
  - a night ambush gives its warning first, then spawns light-shy spirits that close in on you
  - no ambushes after the Heart is restored
  - spirits patrol a loop
- QA stand-in review: build, 164 tests and 190/190 smoke passed, with no Critical findings. Fixed afterwards:
  - **Warnings:**
    - ambushers walked toward the world origin, not toward you
    - "once per night" rolled twice (the day number changes at midnight) and was re-rolled on reload
    - ambushes ignored your light, the Heart glade and a restored Heart, and could pick tigers
    - "?" and "!" markers lingered when a spirit was pushed out of light or faded at dawn
    - stuck detection counted a creature standing still at its search point, and an unreachable home caused an endless walk
    - creatures heading home ignored being hit
  - **Suggestions:**
    - depleted bamboo and tiny herbs no longer count as cover
    - the max-hp value is kept per spawn
    - markers are destroyed with their creature
    - cover cleanup on chunk unload is a single pass
    - the "open ground" smoke check really leaves the bush
  - Re-verified with the full smoke run (192/192).

### Known limitations

- Line of sight ignores obstacles; sight is a radius, not a cone, and is reduced by cover, crouching and night.
- Pathing is local steering (sidestep and give up), not full pathfinding.
- One crouch binding (hold Z). Rebinding comes with the M16 settings pass.

---

## M11 — Equipment, gear upgrades and meaningful progression

### Implemented (playable)

- **Tool tiers:** each tier-2 tool beats its stone counterpart on durability and damage. They are made at the workbench and listed on the Tools tab.
  - **Flint axe:** 160 durability, damage 3.
  - **Flint pickaxe:** 150 durability, damage 3.
  - **Fang spear:** damage 6.
- **Repairs:** hold a worn tool and press **R at the workbench**. It restores half the tool's durability, up to its maximum, for one of its main material (flint for flint tools; bamboo for the fang spear, so a repair never costs a rare fang). Structures keep their own R repair from M10.
- **Equipment slots (body, feet):**

  | Item | Slot | Effect |
  | --- | --- | --- |
  | **Hide vest** | Body | Takes 25% off every hit (minimum 1) |
  | **Leaf rain cape** | Body | Halves warmth lost in the rain |
  | **Bark sandals** | Feet | +6% speed, and mud and shallows slow you half as much |

  Body is a real choice between the vest and the cape. F wears a piece of gear (swapping out what you had on). The **Character panel (K)** shows worn gear with its exact effects; click a piece to take it off.
- **Skills:** Foraging, Crafting, Survival, Combat and Exploration, each up to level 3 (3, 8 and 15 XP).

  | Skill | Effect per level |
  | --- | --- |
  | Foraging | +10% chance of an extra harvest |
  | Crafting | -10% wear on your tools |
  | Survival | -6% hunger and thirst drain |
  | Combat | +1 melee damage |
  | Exploration | +4% walking speed |

- **No grind.** Every XP source is either a **one-time first** or a **small repeat capped per in-game day**, and the data validator enforces it.
  - One-time firsts include a new kind of harvest, an identified plant, a new recipe or structure, a new foe, a tablet, a ruin chest, a new biome, an outpost, a shrine, each of your first nights survived and each monsoon day endured.
  - Capped repeats are steady gathering, crafting, cooking and fights won.
  - Firsts and caps are saved, so a reload never earns anything twice.
  - Level-ups show a toast that names the new effect.
- **Knowledge, not time gates:** recipes unlock through what you discover. A toast names what you learned and what is now craftable.

  | Knowledge | Learned by | Unlocks |
  | --- | --- | --- |
  | Tanning | Owning a hide | Hide vest |
  | Fang craft | Owning a tiger fang | Fang spear |
  | Flint working | Crafting level 1 | Flint tools |
  | Leaf weaving | Survival level 1 | Rain cape |
  | Trail craft | Exploration level 1 | Sandals |

  Knowledge counts items in your pack, your chests and your worn gear. Locked recipes appear in the crafting tabs with a 🔒 and say exactly how to learn them.
- **UI:** the Gear tab, the Character panel (K) showing each skill's per-level effect and **what it gives you now**, tooltips for wearable gear, and toasts that drop above the hotbar while a panel covers the top of the screen.

### Verification

- `npm run typecheck` and `npm run build` pass.
- `npm test`: 156 unit tests. New ones cover:
  - one-time awards surviving a save round trip
  - daily caps surviving a reload and resetting the next day
  - level thresholds
  - every source being unique or capped
  - every skill changing a game number
  - tier-2 tools beating stone ones
  - gear effects
  - knowledge triggers and saving
- `npm run smoke`: 180 browser checks. The M11 ones:
  - owning a hide or fang teaches tanning or fang craft
  - a locked recipe shows its hint and can't be crafted
  - Crafting 1 unlocks flint tools (full durability, 10% slower wear)
  - F wears the vest, and a 12-damage hit costs 9
  - R at the workbench repairs a tool for 1 flint
  - repeat XP is capped
  - K shows gear and skills
  - **reload keeps skills, knowledge, worn gear and tool durability**
  - one-time XP can't be re-earned after a reload
- QA stand-in review: build, 156 tests and 180/180 smoke passed, with no Critical findings. Fixed afterwards:
  - **Warnings:**
    - the Crafting bonus showed tools above 100% ("176 / 160") and let repairs exceed the maximum; it now slows wear instead, and repairs cap at the item's maximum
    - repairing the fang spear cost a rare tiger fang; it now costs bamboo
    - knowledge ignored chests and worn gear
    - the spawn biome gave free Exploration XP, and night XP never ended; it now covers the first week only
    - the Character panel didn't show current totals
    - tier-2 tools were hidden on the Gear tab
  - **Suggestions:**
    - skill effects and feet gear are cached instead of recomputed every frame
    - R at a workbench repairs a held tool only when one is worn
    - dead code was removed
  - Re-verified with the full smoke run (180/180).

### Known limitations

- Levels stop at 3 per skill: progression is intentionally short and flat.
- Two gear slots (body, feet). There are no head or hand slots yet.

---

## M10 — Better building and persistent outposts

### Implemented (playable)

- **Workbench** (6 wood, 2 stone, 2 fibre): a station for the advanced builds. E at it opens crafting on the Building tab.
- **New structures:**

  | Structure | Cost | What it does |
  | --- | --- | --- |
  | **Bamboo wall** (×2) | 3 bamboo, 1 fibre | **Rotatable with R** during placement. Snaps to an 8 px grid and sits flush against other walls. |
  | **Thatch roof** | 4 bamboo, 6 leaves, 2 fibre | A weather protection volume (radius 56): keeps you warm and dry and protects structures beneath from weathering. Drawn above you, and fades while you stand under it. |
  | **Storage chest** | 6 wood, 2 bamboo, 2 fibre | **Safe storage** with 12 slots. Click a stack to move it, or use **Take all**. Contents (including tool durability) persist when you walk away and through saves. |
  | **Rain collector** | 4 bamboo, 4 leaves, 2 fibre | Fills by one unit per hour of monsoon rain (holds 4). Hold a bamboo tube and press E for clean **rainwater**, which also stands in for boiled water in pot recipes. |
  | **Bamboo bed** | 6 bamboo, 4 leaves, 1 hide | Sleeping here heals an extra 25 and warms you fully. |
  | **Outpost flag** | 3 sticks, 2 fibre, 2 leaves (workbench) | Names the camp ("Outpost 1"…). It shows on the minimap, pinned to the edge with a pointer when far away, and in the journal with distance and direction. **No new creatures appear within 600 px of a flag**, so even a single flag and chest make a safe camp. Up to 4 outposts, at least 1200 px apart, so a flag is a camp rather than something you carry around. |

- **Placement:**
  - The preview ghost is tinted valid or invalid.
  - R rotates walls.
  - Walls snap to the grid.
  - Roofs may stand over anything except other roofs.
  - Everything else keeps an 8 px walking gap and stays off water, the player and the spawn point.
- **Durability and weathering:** walls, roofs, beds and rain collectors have durability measured in hours of monsoon rain.
  - Each rainy hour wears structures that aren't under a roof (measured from the centre of the roof). Roofs always wear.
  - A structure that reaches 0 is **broken**: faded, not solid and not usable.
  - **R** repairs it fully for one of its main material once it is below 75%, never while someone stands in its footprint.
  - Chests, campfires, pots, shelters and flags never weather.
- **Refund rules (X, pressed twice to confirm):**
  - Dismantling returns half of each ingredient, rounded down, with at least 1 of the main material.
  - A chest must be emptied first, so nothing can be lost.
- **Prompts** show the use, durability % and the R/X actions, for example `E — Open the storage chest · X — Dismantle`.
- **Persistence:** every structure has a stable id, and stores its rotation, durability, chest contents, collector water and outpost name. These survive chunk unloading and save/reload. Older saves (type/x/y only) still load.

### Verification

- `npm run typecheck` and `npm run build` pass.
- `npm test`: 148 unit tests. New ones cover:
  - kit reachability
  - workbench gating
  - rotation frames and footprints
  - structure fields surviving `parseSave`, with junk sanitised
  - old structure records loading
- `npm run smoke`: 171 browser checks. The M10 ones, which **include the roadmap test**:
  - R rotates a wall
  - snapped, rotated placement by click
  - E opens the chest panel; clicking stacks moves them (durability kept); Esc closes it
  - monsoon weathering breaks an unroofed wall (no longer solid) while collectors fill
  - R repairs for 1 bamboo
  - rainwater fills a tube
  - X twice dismantles a structure and refunds half
  - camp B in another chunk
  - outposts on the minimap and in the journal
  - no spawns near a flag
  - walking away unloads both camps
  - **save → reload → Continue recovers all 11 structures exactly**: type, position, rotation, durability, chest contents, water and names
  - camp B rebuilds when you return, with a **roof placed on the chest's exact anchor** and the chest's items intact
  - a broken wall stays non-solid after reload
- QA stand-in review: build, 148 tests and 169/169 smoke passed. Fixed afterwards:
  - **Critical:** a reload could silently drop a structure that shared another's position, such as a roof centred on a chest, and with it the chest's items. Restoring now deduplicates by stable id.
  - **Warnings:**
    - flags worked as a cheap portable "no spawns" bubble; they now need the workbench and are limited to 4 outposts at least 1200 px apart, and the text now says "no new creatures"
    - roof protection was measured from the roof's base, not its centre
    - walls took the E target away from bushes next to them
    - every wall that broke showed its own toast; now there is one summary
    - a repair could close a wall on top of the player or a creature
    - the repair prompt showed at 99%
    - outpost names could repeat
    - the chest panel had a fixed size
    - the chest panel stayed open after being knocked away or dying
    - removed chest items were not counted in the old-save notice
    - `collectItem` was not validated
    - the roof ghost was drawn at the wrong depth
  - **Suggestion:** walls now snap to an 8 px grid for cleaner corners.
  - Re-verified with the full smoke run (171/171).

### Known limitations

- Existing creatures can still walk into an outpost; only new spawns are blocked there.
- One rotation axis: walls are horizontal or vertical, with no diagonals.
- Moving stacks in the chest is click-only: there is no drag, shift-click or half-stack yet.

---

## M9 — Cooking, fishing, medicine and ecological depth

### Implemented (playable)

- **Fishing:**
  - Craft a **bamboo fishing rod** (2 bamboo, 3 plant fibre, 1 stick). Hold it and press **E** at the edge of deep water (any pond or river) to cast.
  - A bobber floats on the water; after 1.5–4 s a fish bites ("!", a splash and a hint).
  - A timing bar appears above you: press **E or Space** while the sweeping marker is inside the green zone.
  - Fair by design: the zone is 30% of the bar and the marker passes through it at least twice in the 2.6 s window. `fishing.json` refuses unfair tuning.
  - Pulling too early or outside the zone, or waiting too long, loses the fish with a clear message. Walking away or putting the rod down stops fishing.
  - A catch or a miss wears the rod by 1 (40 uses). Pulling early costs nothing.
- **Water containers and boiling:**
  - **Bamboo tubes** (2 bamboo → 2 tubes): hold one and press E at any water to fill it.
  - River water can be drunk anywhere (F). Boiling it at a campfire gives **boiled water**, which quenches more thirst, heals a little, and is the base for soups and medicine.
  - Drinking or eating from a tube gives the empty tube back.
- **Cooking pot:** a new placeable station (5 stone, 2 wood, 2 fibre). E opens crafting on the food tab.
  - **Jungle stew:** bamboo shoot, berries, boiled water.
  - **Fish and leaf soup:** fish, healing leaf, boiled water.
  - **Bitter root brew** (antidote).
  - The campfire still roasts shoots and meat, grills fish and boils water.
- **Medicine:**
  - **Leaf bandage** (2 healing leaves, 2 fibre): +25 health.
  - **Bitter root brew** (2 bitter root, boiled water, at the pot): cures poison (viper bites), +5 health, and gives the tube back.
  - Using medicine you don't need is refused, so nothing is wasted.
- **Plant identification:** two new herbs grow across the biomes and near spawn:
  - **healing leaf:** broad, pale-veined leaves
  - **bitter root:** purple stems over a knobbly root

  Both show as "Unknown herb" until you gather one. The first harvest identifies the plant and explains its use, and identifications are saved.
- **Harvest seasons:**
  - During the monsoon, bamboo clumps yield twice the shoots, healing herbs yield more, and berry bushes yield half. The monsoon announcement says so.
  - This is data-driven (`seasonal` in resources.json).
- **Wildlife:** boars and tigers still provide meat and hide. There is no graphic violence: creatures fade or fall with a simple message.
- **Crafting panel tabs:** Tools & light · Building · Food & water · Medicine. Click a tab or press Tab / Shift+Tab. Locked recipes say which station they need ("needs a cooking pot nearby").
- **Food spoilage:** intentionally not added. It wasn't clearly fun at this scale, and the roadmap makes it optional.

### Verification

- `npm run typecheck` and `npm run build` pass.
- `npm test`: 141 unit tests. New ones cover:
  - the fishing state machine (timings, early, miss and catch)
  - **fairness for any zone position**
  - rejecting unfair tuning
  - seasonal yields
  - reachability of every new item
  - a **sustainability budget**: a day needs at most 4 grilled fish and 4 boiled-water tubes, and a rod lasts 3 or more days of that
  - every catch yields a fish
- `npm run smoke`: 153 browser checks. The M9 ones:
  - a fishable shore exists near spawn
  - the rod prompt, casting and waiting
  - pulling in the green catches a fish and wears the rod by 1
  - pulling early fails without a fish or rod wear
  - a mouse click pulls the line
  - a tube fills at water
  - the pot is a station next to the campfire
  - boiling, grilling, brewing the antidote and binding a bandage
  - the tabs
  - the antidote cures poison and returns the tube
  - the bandage heals
  - an unknown herb is identified by gathering one, and the identification is saved
- QA stand-in review: build, 141 tests and 152/152 smoke passed, with no Critical findings. Fixed afterwards:
  - **Near-critical:** placing a cooking pot ticked off the "build a campfire" objective, and the minimap coloured pots as fires.
  - **Warnings:**
    - mouse players could not pull the line, and a click mid-session could attack instead
    - an early pull cost rod wear
    - the station key allocated every frame
    - a returned or filled tube could be lost when both the inventory and the ground pool were full
    - in the dry season, about half of bamboo clumps gave no shoot, and seasons were not explained
    - drinks at full thirst said "not hungry"
  - **Suggestions:**
    - attacking with a rod no longer wears it
    - "You reel in your line" now shows when fishing is cancelled
    - the fishing bar is hidden during the death fade
  - Re-verified with the full smoke run (153/153).

### Known limitations

- No food spoilage: it is left out on purpose because the roadmap allows it only if fun.
- The fishing timing is fixed; an "easier timing" accessibility option is planned for the M16 settings pass.
- New Khmer text (ត្រីអាំង, "grilled fish") needs native-speaker review like the rest.

---

## M8 — Complete the first main story and ending

### Implemented (playable)

- **The Heart of the Forest glade** (about 220 tiles from spawn, fixed per seed, always on dry land and clear of ruins):
  - a 9-tile glade of moss and leaf litter with no random props
  - the **Heart Tree** at its centre: a huge generated tree with a dim teal hollow; it glows once restored
  - a closed **ring of ancient roots** (radius 6 tiles) that blocks the way in, with no diagonal gaps
- **Environmental challenge: fire opens the way.** Roots wither back from firelight: a campfire placed beside them, or a held torch. They regrow a few seconds after the light leaves, but never while you stand in the gap and never while you are inside the ring (no trapping). The quest arrow and journal guide you, and the roots themselves explain "They seem to shrink from fire."
- **The final interaction (E at the Heart Tree):**
  - fewer than five tablets read → "The great tree does not answer yet."
  - without held food and two spirit dust (from Ap and Arak, or ruin chests) → a clear hint about what's needed
  - otherwise one food and two spirit dust are offered, the promise is renewed, the tree lights up and the game saves
- **Ending sequence:** five epilogue lines (auto-advance; Space, Enter, E or a click to skip), then a **summary** (days survived, tablets read, creatures faced, things crafted, structures built, resources gathered), **credits with the fiction disclaimer** and two buttons. The buttons appear after a short beat so skip presses can't choose one by accident.
- **Continuation in survival mode:** "Continue surviving" reloads the saved world:
  - the quest is complete and the roots stay open
  - the Heart Tree stays lit
  - night spirits are calmer (night population halved)
  - "Main menu" returns to the title
- Journey stats are tracked and saved (older saves default to zero).

### Verification

- `npm run typecheck`, `npm run build` pass; `npm test`: 131 unit tests (quest stage flow through `restore`, save round-trip of `restored`/stats, depth bands).
- `npm run smoke`: 139 browser checks. The M8 ones:
  - the glade holds the tree inside a closed ring of solid roots
  - by day the roots block a straight and a diagonal approach
  - a torch at night withers the roots and opens a path; the Heart Tree becomes the target
  - an offering without held food is refused
  - the offering plays the ending; skip presses never pick a button; the summary and credits show the fiction disclaimer
  - Continue surviving returns to the world with the quest done, the tree restored, the roots open and the spirits calmed; exactly one food and two spirit dust were consumed
  - pausing silences the ambience; resuming restores it
  - inside the ring by day without fire, the roots let you out; once you leave, the ring closes again
  - roots never regrow while you are inside the ring
- QA stand-in review: build, 131 tests and 136/136 smoke passed. **Critical, fixed:** you could be trapped inside the root ring (torch burnt out, dawn, or an M7 save made near the Heart). Now the roots stand aside while you are inside the ring, nothing regrows near it, and a held torch counts as fire by day as well. **Warnings, fixed:** the ending buttons could fire twice during the fade-out; "Continue surviving" silently began a new journey when the save had failed (it now explains this and offers only the main menu); the regrow guard did not match the root footprint. The fourth Warning (world-gen changes near the Heart for older saves) is documented below. **Suggestions, fixed:** Left/Right navigation and key-repeat protection for button rows; gathered stats ignore lost loot. Re-verified with the full smoke run (139/139).

### Release gate (M8)

The five-tablet quest now has a real conclusion: find the tablets, travel to the Heart, open the roots with fire, make the offering, watch the ending and credits, then keep playing in the same world.

### Known limitations

- Older saves: placing the glade moved the Heart site for some seeds and changed a few prop positions in the chunks around it, so harvest records saved there before M8 may land on different props. This has no effect on the quest.
- One ending (alternative endings are M19+ only on request).
- The ending text and Khmer title still need review by native Khmer speakers and cultural advisors.

---

## M7 — Persistence, performance and MVP polish

### Implemented (playable)

- **Saving:**
  - Versioned save (v2) with the sleep save plus an **autosave** every minute of play and whenever the game pauses (Esc, alt-tab, hidden tab, or quitting to the menu from pause). A small "Saved ✓" indicator confirms it.
  - The save covers the seed, player position and stats (health, food, water, stamina, warmth), the inventory with durability, the selected hotbar slot (equipment), structures, resource-node diffs, world time (the season is derived from it), status effects, shrine offering times, opened chests, tablets read, Heart progress and the first-day checklist.
- **Safe loading:**
  - Corrupt saves show "damaged" on the menu, with Continue disabled and New journey still working.
  - Newer saves are refused with a message.
  - Partial saves fall back to defaults field by field.
  - v1 saves migrate. Unknown items and structures are removed or refunded with a notice.
- **Settings** (pause menu and main menu):
  - Master, effects and ambience volume (10% steps).
  - **Reduced motion:** no screen shake, fewer rain streaks.
  - **Reduced flashes:** no lightning flash, softer hurt flash.
  - **Show help on start.**
  - Settings persist separately from the save and are parsed safely.
- **Procedural audio** (Web Audio, no asset files):
  - Effects: chopping, stone, leaves, pickup, craft, build, swing, hit, hurt, drink, eat, stone chest, tablet hum, shrine bell, thunder, UI clicks.
  - Ambience layers (day wind, night insects, rain, campfire crackle) crossfade from game state.
  - The AudioContext is created only after the first click or key, so it is autoplay-safe.
  - Identical sounds are rate-limited.
- **Performance:**
  - Creatures (max 16), spirit orbs (32) and pickups (cap 400) are pooled.
  - Far creatures are culled (despawned).
  - Chunks stream and release everything on unload.
  - Re-flooding is spread across frames.
  - The cost of `World.update` is measured and shown in F3; smoke asserts under 8 ms average in headless Edge.
- **Polish:** hit shake (respects reduced motion), chips, floating text, red hurt flash, toasts placed below the forecast.

### Verification

- `npm run typecheck` and `npm run build` pass.
- `npm test`: 130 unit tests, including settings parsing and the save migrations.
- `npm run smoke`: 123 browser checks (`SMOKE_PORT` picks the port). The M7 ones:
  - audio unlocks after input
  - World update under 8 ms
  - pausing autosaves
  - the settings panel changes and persists a value, and Esc backs out, then resumes
  - a corrupt save is explained on the menu and New journey still works
  - a v1 save migrates through Continue (day, health, items, refunded kit)
- Across the earlier checks: Continue restores a session; there's no growth across Menu ↔ World restarts or a long chunk walk; the production build is served.
- QA stand-in review: no Critical findings. Two Warnings were fixed after it: ambience kept playing while paused or in menus (now ducked on pause and silenced on leaving the world), and a suspended AudioContext was never resumed (now every click or key revives it). Suggestions fixed too: a stray autosave-timer reset, autosaves into a near-death fight (now skipped at low health or with a hostile close by), a silent autosave failure (now one warning), an unused spirit cue (now plays when a spirit appears) and clipped thunder.
- Found while building M8 and fixed before the M8 commit: objects north of the world origin (negative y) were depth-sorted **under the ground layer** — player, trees, structures and creatures disappeared there. All world objects now use a bounded `ySort()` depth.

### Release gate (M7)

You can explore an endless seeded jungle, gather, craft tools, a campfire and a shelter, and survive days and nights. You can avoid or fight wildlife and night spirits (firelight keeps spirits away) and endure the monsoon's floods and cold. Ruins hold chests and the five tablets, and reading them reveals the Heart of the Forest, which you can travel to and reach. **The Heart's finale (final interaction, ending and credits) is M8**, the completion pass. Until then the game says plainly that the Heart's story continues in the next chapter.

### Known limitations

- One save slot (slot management is M16).
- No input rebinding yet (M16).

---

## M6 — Monsoon, ruins, tablets and core quest

### Implemented (playable)

- **Monsoon schedule** (`season.json`): it starts on day 5 and repeats every 5 days for 2 days (days 5–6, 10–11, 15–16…).
  - A forecast line under the clock reads, for example, "Monsoon in 4 days", "Monsoon tomorrow — prepare…" and "Monsoon — day 1 of 2".
  - A toast warns when the rain breaks.
- **Rain:**
  - Screen-space streaks (pooled particles) with a cool gloom tint.
  - Rare soft lightning: a single gentle fade every 18–42 s, never a strobe.
  - Daytime is darker (+0.2), but the clock phase still follows daylight.
- **Weather effects:**
  - Thirst drains at ×0.5 (rain is everywhere) and hunger at ×1.4.
  - **Warmth** drops while you're exposed in the rain, about 6 game hours from full to empty.
  - It recovers under a bamboo shelter (within 70 px) or by a campfire.
  - At zero warmth you slowly lose health. A warmth bar with Cold/FREEZING tags appears during the monsoon, and GameOver names cold as a cause.
- **Floods:**
  - A deterministic flood mask rises through the monsoon and recedes over the next morning.
  - River banks (up to about 2.3× the river width) and swamp lowlands turn into **walkable shallows** that slow you.
  - Floods never create deep water, never touch the spawn clearing or ruin courtyards, and never damage structures, so you can't be trapped.
- **Ruins:**
  - Every ruin courtyard has two stone chests.
  - Each chest opens once; its loot is seeded by the world seed and the chest's key, so it can't be duplicated or re-rolled by reloading.
  - The **five ruins nearest spawn** each hold a **key stone tablet** before the altar. Those ruins are always reachable (tested), and they show on the minimap as ◆.
- **Tablets** (`tablets.json`, content-designer stand-in): Khmer and English titles plus 2–3 sentences each. Together they slowly reveal a broken promise to the forest's guardians. Reading one shows a stone-slab view and records it.
- **Main quest** (`quests.json`): "The Five Tablets":
  - Read the five tablets in any order; reading is idempotent.
  - That reveals the way to the **Heart of the Forest**, a deterministic site about 220 tiles from spawn on dry land.
  - An edge-of-screen arrow, with the target's name and distance, points to the nearest unread tablet, then to the Heart.
  - Reaching the Heart completes this stage. The Heart's finale is M8, and the game says so honestly.
- **Journal (J):** quest steps with progress, the tablets read (unread ones show "? ? ?" with a hint), and a lore glossary (Neak Ta, Ap, Arak, prasat, krama) with a clear fiction disclaimer (`lore.json`).
- **Saves:** warmth, opened chests, tablets read and Heart progress. Old saves default these safely.

### Verification

- `npm run typecheck` and `npm run build` pass.
- `npm test`: 128 unit tests. New ones cover:
  - the schedule (5, 6, 10, 11, 15, 16) and forecast countdown
  - flood rise and recede, and floods never hitting spawn, ruins or water
  - cold, including a prepared player taking no cold damage
  - idempotent quest reading and restoring
  - five tablet ruins and a dry Heart site for several seeds
  - every tablet prop actually generated
- `npm run smoke`: 114 browser checks. The M6 ones:
  - the forecast countdown
  - the monsoon starting with rain streaks, label and flood
  - warmth dropping when exposed and recovering under a shelter
  - flooded tiles never being solid
  - a chest giving loot once
  - a tablet showing its text and recording 1/5
  - the journal showing progress, and Esc closing it without pausing
  - the arrow pointing to the next tablet, then the Heart
  - reaching the Heart completing the stage
  - Continue restoring tablets and opened chests
  - E reading a tablet and E closing it with no re-open loop
- QA: a stand-in for `phaser-qa` found 1 Critical (tablet close re-open loop) and 4 Warnings, all fixed. Details in CHANGELOG.

### Known limitations

- The Heart of the Forest is a target location only; its landmark, final interaction and ending are M8.
- Creatures don't change routes in floods; walkers simply wade.
- No audio yet for rain or thunder (M7).
- Tablet titles, quest and lore Khmer need native-speaker review.

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
