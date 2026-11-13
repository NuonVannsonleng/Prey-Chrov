# Prey Chrov: Technical Overview

For developers working on the game. To play, see [PLAYER_GUIDE.md](PLAYER_GUIDE.md). To publish, see [DEPLOYMENT.md](DEPLOYMENT.md).

## Stack

| Layer | Choice |
| --- | --- |
| Engine | Phaser 3.90 (Arcade physics, WebGL with Canvas fallback) |
| Language | TypeScript 5.9, `strict` |
| Build | Vite 8: relative `base`, Phaser split into its own chunk, `__APP_VERSION__` from `package.json` |
| Tests | Vitest unit tests (Node). Browser smoke and soak tests use `playwright-core` with an installed Edge or Chrome |
| Fonts | `@fontsource/moul`, `@fontsource/kantumruy-pro` (SIL OFL 1.1), bundled with the game |
| Runtime dependencies | `phaser`, `simplex-noise` and the two font packages. There are no network services. |

## Layout

```text
src/
  main.ts          Game config, audio wiring, high-contrast palette, friendly runtime-error banner
  config.ts        Resolution, tunables, palette (CSS), APP_VERSION, DEBUG_HOOKS
  textures.ts      Catalogue of generated texture keys and frames (Phaser-free)
  art/             Canvas drawing for every sprite, icon and tile (no image files)
  data/            *.json game content + schema.ts (types + validator) + gameData.ts (loader)
  scenes/          Boot → Preload → Menu → World (+ UI overlay) · Pause · GameOver · Ending
  entities/        Player, Enemy, ResourceNode
  systems/         Game rules. Pure modules where possible (Survival, Progression, Perception,
                   Fishing, SideQuests, Rules, Records, Save…) so they are unit tested
  world/           WorldGen (seeded noise world), ChunkManager (streaming), PropLayer, RuinPlan
  ui/              Components (Button, ButtonList, dialogs, Toast, Tooltip) and panels
  utils/           Seeded PRNG and hashing; keyboard helpers (held keys by physical code)
  tests/           Unit tests
scripts/
  smoke.mjs        ~250 browser checks against dist/
  soak.mjs         Long automated play session (SOAK_MINUTES); errors, heap, display list, bodies, update time
```

## Scenes and events

- **World** runs the simulation. **UI** is a separate overlay scene, and the two talk only through the typed event bus `gameEvents` (`src/systems/GameEvents.ts`).
  - Scene-scoped subscriptions use `onSceneEvent`, which unsubscribes on shutdown.
  - The World scene instance is reused between journeys. Per-journey state is reset in `resetFlags()` / `create()`.
- **Pause** stops World and UI. Losing window focus or hiding the tab opens it.
- **Ending** shows the epilogue, a journey summary, credits and the version. **GameOver** shows the cause of death and restart options.

## Content data

- All content lives in `src/data/*.json`:
  - items, recipes, structures, resources, loot, biomes, enemies, encounters, survival, season
  - tablets, quests, lore, ending, shrines, fishing, progression, stealth
  - side quests, set pieces, difficulty, achievements
- `validateGameData()` checks the content at startup and in the unit tests. A broken data file shows a readable error screen instead of a blank page. It checks for:
  - duplicate or unknown IDs
  - item references
  - weights and costs
  - reachability: every item can be gathered or crafted
  - quest dead ends
  - fairness rules: telegraph lengths, stun windows, difficulty bounds of 0.4–2
- Fiction and culture rules:
  - Neak Ta are never enemies.
  - Ap and Arak are fictional hostile interpretations.
  - Khmer text is flagged for native-speaker review.

## Saves

- Saves are written to `localStorage` by `src/systems/Save.ts`. There are three slots: `preychrov.save` (slot 1, the original key), `preychrov.save.2` and `preychrov.save.3`.
- `SAVE_VERSION` is 2. `parseSave` is defensive: every field has a fallback, so a damaged or partial save never blank-screens.
  - v1 saves (M3 era) go through `MIGRATIONS`.
  - Newer-version saves are refused with a message.
- Later fields are optional and default safely:
  - M8–M16 progress
  - M17 `rules`. A missing value means legacy Survival rules and content generation 1, so old worlds keep their landmarks.
- Saving is skipped while the player is in danger, so an autosave can't trap a reload in a lost fight.
- Settings (`preychrov.settings`) and records (`preychrov.records`) are stored separately from journeys.

## Determinism

- The world is generated from the seed with `hash2`/`mulberry32` and simplex noise.
- Chunk props have stable keys (`cx,cy:index`). Later features are appended after vegetation, so older saves' resource diffs still line up.
- The content generation (`rules.content`) gates new landmark kinds.

## Input and accessibility

- Bindings are stored as `KeyboardEvent.code` values.
  - Held actions use `HeldKeys`, which tracks physical keys, so bindings behave the same on any keyboard layout.
  - Presses go through `oncePerKeyEvent`, which works around Phaser re-dispatching key events.
- Escape, Tab, 1–6, F3 and Ctrl/Alt/Meta combinations are reserved.
- `keyText()` rewrites default key letters in hints for rebound actions.
- High contrast swaps the `CSS` palette and lightens nights. Large text scales fonts through `fontPx()`. The HUD rebuilds after either changes.
- Every menu works with the keyboard (`ButtonList`: arrows/WASD/Tab, Enter/Space).

## Debugging

- `?debug` exposes `window.__preyChrov` (the Phaser game) and `window.__preyAudio`. F3 toggles the debug overlay.
- `?seed=N` picks the world.
- `?calm` turns off creatures and set pieces, and `?nostory` turns off side-story offers. These are test aids and only work together with `?debug`.

## Quality gates

```bash
npm run typecheck && npm test && npm run build && npm run smoke
SOAK_MINUTES=20 npm run soak   # before a release
```

Budgets checked by the tests:

- World update under 8 ms on average (headless)
- listener counts flat across menu round trips
- at most 16 pooled creatures
- no console errors
- the soak run keeps the heap and display list bounded

## Adding content

1. Add or change entries in the right `src/data/*.json`. Use stable snake_case IDs.
2. Run `npm test`. The validator explains any problem.
3. For new art, add a draw function in `src/art/` and register its frames in `textures.ts`.
4. Note any Khmer or cultural text for native-speaker review in `docs/MILESTONES.md`.
