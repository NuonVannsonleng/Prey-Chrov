# Milestones

Status legend: **Done** · **In progress** · **Not started**

| # | Name | Status |
| --- | --- | --- |
| M1 | Game shell, menus, movement, test world | Done — awaiting playtest approval |
| M2 | Gathering, pickup and inventory | Not started |
| M3 | Survival, crafting, first night, death | Not started |
| M4 | Seeded procedural world, chunks, biomes, minimap | Not started |
| M5 | Wildlife, night spirits, combat and guardian shrines | Not started |
| M6 | Monsoon, ruins, tablets and core quest | Not started |
| M7 | Persistence, performance and MVP polish | Not started |

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
