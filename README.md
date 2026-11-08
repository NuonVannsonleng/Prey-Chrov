# ព្រៃជ្រៅ — Prey Chrov (The Deep Forest)

A 2D top-down survival adventure set in a fictional Cambodian jungle, built with **Phaser 3 + TypeScript + Vite**.
All art is generated in code as replaceable placeholders.

> Status: **Milestone 1** — game shell, menus, movement and a fixed test map. See [docs/MILESTONES.md](docs/MILESTONES.md).

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

## Controls (M1)

| Key | Action |
| --- | --- |
| W A S D | Move |
| Shift | Sprint |
| Esc | Pause / resume |
| H | Hide / show control hints |
| F3 | Debug overlay (FPS, position, collision boxes) |
| ↑ ↓ / Enter | Navigate menus |

## Project layout

```text
src/
  main.ts            Phaser game config
  config.ts          Tunables: resolution, speeds, camera, map
  textures.ts        Central catalog of generated texture keys/frames
  art/generate.ts    Canvas drawing of all placeholder art
  scenes/            Boot, Preload, Menu, World, UI, Pause
  entities/          Player
  systems/           Movement, GameEvents (typed bus), Save (slot inspection)
  world/             TestMap (fixed M1 layout), PropLayer (props, colliders, canopy fade)
  ui/components/     Button, ButtonList (keyboard navigation)
  utils/random.ts    Seeded PRNG + coordinate hash
  tests/             Vitest unit tests
scripts/smoke.mjs    Browser smoke test
docs/                Milestones and changelog
```

## Credits & notes

- Fonts: [Moul](https://fonts.google.com/specimen/Moul) and [Kantumruy Pro](https://fonts.google.com/specimen/Kantumruy+Pro) via Google Fonts (SIL Open Font License), with local Khmer fallbacks when offline.
- Folklore-inspired content in later milestones is a fictional game interpretation and will be flagged for review by Khmer speakers and cultural advisors.
