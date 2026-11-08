# ព្រៃជ្រៅ — Prey Chrov (The Deep Forest)

A 2D top-down survival adventure set in a fictional Cambodian jungle, built with **Phaser 3 + TypeScript + Vite**.
All art is generated in code as replaceable placeholders.

> Status: **Milestone 2** — gathering, pickups and inventory on a fixed test map. See [docs/MILESTONES.md](docs/MILESTONES.md).

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
| `npm run smoke` | Headless browser smoke test of `dist/` using an installed Edge or Chrome (run `npm run build` first) |

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Shift | Sprint |
| E (hold) / Left click (hold) | Gather the highlighted tree, bamboo, boulder or bush · drink at water |
| 1–6 / Mouse wheel | Select hotbar slot |
| I | Inventory panel (drag to move, Shift+click to split, drag outside to drop) |
| Q / Ctrl+Q | Drop one / the whole selected stack (rare items ask first) |
| Esc | Close panel, otherwise pause / resume |
| H | Hide / show control hints |
| F3 | Debug overlay (FPS, position, collision boxes) |
| ↑ ↓ / Enter | Navigate menus |

## Project layout

```text
src/
  main.ts            Phaser game config
  config.ts          Tunables: resolution, speeds, camera, map
  textures.ts        Central catalog of generated texture keys/frames/icons (Phaser-free)
  art/               Canvas drawing of all placeholder art (generate, gathering, canvas helpers)
  data/              schema.ts (types + validator), gameData.ts (loader), items/loot/resources.json
  scenes/            Boot, Preload, Menu, World, UI, Pause
  entities/          Player, ResourceNode
  systems/           Movement, GameEvents, Save, Inventory, PlayerInventory, Loot, Gathering, Pickups, Interaction
  world/             TestMap (fixed test grove), PropLayer (scenery, colliders, canopy fade)
  ui/                FloatingText, components/ (Button, ItemSlot, Tooltip, Toast, ConfirmDialog), panels/ (Hotbar, InventoryPanel)
  utils/random.ts    Seeded PRNG + coordinate hash
  tests/             Vitest unit tests
scripts/smoke.mjs    Browser smoke test
docs/                Milestones and changelog
```

## Credits & notes

- Fonts: [Moul](https://fonts.google.com/specimen/Moul) and [Kantumruy Pro](https://fonts.google.com/specimen/Kantumruy+Pro) via Google Fonts (SIL Open Font License), with local Khmer fallbacks when offline.
- Khmer item names in `src/data/items.json` (`nameKm`) need review by a native speaker.
- Folklore-inspired content in later milestones is a fictional game interpretation and will be flagged for review by Khmer speakers and cultural advisors.
