# ព្រៃជ្រៅ — Prey Chrov (The Deep Forest)

A 2D top-down survival adventure set in a fictional Cambodian jungle, built with **Phaser 3 + TypeScript + Vite**.
All art and sound are generated in code. There are no image or audio files, no accounts and no tracking.

> **Version 0.18.0: all milestones (M1–M18) complete.**
>
> - Survive days, nights, creatures, Ap and Arak spirits, and the monsoon.
> - Read the five stone tablets and renew the promise at the Heart of the Forest.
> - Face the Old Tusker, the Great Storm and the Blight.
> - Follow side stories whose choices shape the world and the ending.
> - Build camps and outposts; cook, fish and brew medicine; grow five skills; sneak and hide.
> - Map the forest, find landmarks and solve ruin puzzles.
> - Each new journey has its own seed, difficulty (Story / Survival / Hard), challenge modifiers and opt-in permadeath.
> - Three save slots, local achievements, rebindable controls, high contrast and large text.

**Play:** run it locally (below), or host it as a static site ([docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)).
**New players:** see the [Player Guide](docs/PLAYER_GUIDE.md).

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run preview` | Serve the production build (http://localhost:4173) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests |
| `npm run smoke` | Headless browser checks of `dist/` using an installed Edge or Chrome (run `npm run build` first) |
| `npm run soak` | Long automated play session watching errors, memory and speed (`SOAK_MINUTES=20` for the release run) |

URL options: `?seed=1234` picks a world. `?debug` exposes debug hooks; F3 toggles the overlay.

## Controls

These are the default keys. Every action except Esc, Tab, 1–6 and F3 can be rebound in **Settings › Controls**, and the in-game hints follow your bindings.

| Key | Action |
| --- | --- |
| W A S D | Move |
| Shift | Sprint |
| E (hold) / Left click (hold) | Gather the highlighted tree, bamboo, boulder or bush · drink at water · cook at a campfire · sleep in a shelter |
| Space / Left click near a creature | Attack (held spear/tool damage; spear reaches further) |
| F | Eat the held food, or place the held campfire / shelter kit (click or F to build, right-click / Esc to cancel) |
| C | Crafting panel |
| J | Journal: main quest, side stories, stone tablets read, lore glossary |
| 1–6 / Mouse wheel | Select hotbar slot |
| I | Inventory panel (drag to move, Shift+click to split, drag outside to drop) |
| Q / Ctrl+Q | Drop one / the whole selected stack (rare items ask first) |
| Esc | Close dialog / panel / build mode, otherwise pause / resume |
| H | Hide / show control hints and the first-day checklist |
| R / X | Rotate a held wall or repair (R) · dismantle a structure (X, twice) |
| Z (hold) | Crouch: quieter, and hidden in bushes |
| K / M | Character (gear, skills) / full map |
| F3 | Debug overlay (FPS, position, collision boxes) |
| ↑ ↓ / Tab / Enter | Navigate menus (every menu works without a mouse) |

## Documentation

- [Player Guide](docs/PLAYER_GUIDE.md): how to play, in a few minutes
- [Deployment](docs/DEPLOYMENT.md): GitHub Pages, Netlify, Cloudflare Pages
- [Privacy](docs/PRIVACY.md): what is stored (only in your browser) and how to delete it
- [Technical overview](docs/TECHNICAL.md): architecture, data, saves, tests
- [Milestones](docs/MILESTONES.md) and [Changelog](docs/CHANGELOG.md)

## Project layout

```text
src/
  main.ts            Phaser game config, audio wiring, runtime-error banner
  config.ts          Tunables: resolution, speeds, camera, palette, version
  textures.ts        Catalogue of generated texture keys/frames/icons (Phaser-free)
  art/               Canvas drawing of all art (no image files)
  data/              *.json game content, schema.ts (types + validator), gameData.ts (loader)
  scenes/            Boot, Preload, Menu, World, UI, Pause, GameOver, Ending
  entities/          Player, Enemy, ResourceNode
  systems/           Survival, crafting, encounters, stealth, progression, quests, saves, settings, rules, records…
  world/             WorldGen (seeded world), ChunkManager (streaming), PropLayer, RuinPlan
  ui/                Components (Button, ButtonList, dialogs, Toast, Tooltip) and panels
  utils/             Seeded PRNG + hashing, keyboard helpers
  tests/             Vitest unit tests
scripts/             smoke.mjs (browser checks), soak.mjs (long session)
docs/                Guides, milestones and changelog
```

## Credits & notes

- Code, art and sound are generated for this project. Fonts are [Moul](https://fonts.google.com/specimen/Moul) and [Kantumruy Pro](https://fonts.google.com/specimen/Kantumruy+Pro) (SIL Open Font License 1.1), bundled through Fontsource, so no font requests leave the game.
- **This is a work of fiction.** Its folklore-inspired creatures and places are creative interpretations, not authoritative descriptions of Khmer religion or culture. Neak Ta appear only as guardian spirits, never as enemies.
- **Needs review by Khmer speakers and cultural advisors:**
  - Khmer names (`nameKm` in `src/data/items.json`) and the tablet titles
  - the shrine and offering wording
  - the flavour text flagged in [docs/MILESTONES.md](docs/MILESTONES.md)
- No telemetry, analytics or cookies: see [docs/PRIVACY.md](docs/PRIVACY.md).
