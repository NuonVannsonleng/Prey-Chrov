# Changelog

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
