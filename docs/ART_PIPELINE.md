# Replacing the generated art with hand-drawn art

Every image in Prey Chrov is drawn in code at start-up into a set of textures, such as the player, trees, creatures, tiles and icons. Each texture is a sprite sheet with named frames. You can replace any texture with a hand-drawn PNG without touching the code. The game draws your PNG over the generated sheet, so every frame name, animation, hitbox and depth stays the same.

## 1. Export templates

```bash
npm run build
npm run art:templates      # needs Microsoft Edge or Google Chrome
```

This writes `art-templates/` with three kinds of file:

- `<texture>.png`: the current generated sheet, at its exact size.
- `<texture>.frames.json`: every frame's name and rectangle, such as `down-idle` at x 0, y 0, 32 × 32.
- `README.md`: a table of the textures with their sizes and frame counts.

Templates always show the code-generated art, even when `public/art` already replaces a texture. Run the export from the repository root.

## 2. Paint

- Keep the PNG the **same width and height**, with each frame in **the same rectangle**. Transparent pixels stay transparent in the game.
- Characters, creatures and props are anchored at the **bottom centre** of their frame (their feet). Keep that baseline, or sprites will float or sink.
- Ground tiles (`tex-tiles`) are 32 × 32 and must tile seamlessly with each other.
- Pixel art at 1× is expected (`roundPixels` is on). Draw at the template's size; don't upscale.

## 3. Install

Put your PNGs in `public/art/` and list them in `public/art/manifest.json`:

```json
{
  "textures": {
    "tex-player": "player.png",
    "tex-travelers": "people/travelers.png"
  }
}
```

The keys are texture names from `src/textures.ts` (`TEX`), the same names as the template files. Paths are relative to `public/art/` and must be `.png`.

Run `npm run dev` and reload. The browser console reports each texture it replaced (`[art] using hand-drawn art for …`).

## Rules and safety

- **Wrong size:** if a PNG doesn't match its texture, that texture is skipped and the console explains why (`… is 64×32; it must be 96×32`). The generated art stays.
- **Mistakes in the manifest:** unknown texture names and unsafe paths (`..`, absolute or remote URLs) are refused with a warning. Nothing else is affected.
- **Missing or failed files:** a missing PNG, missing manifest, offline load or blocked request keeps the generated art. The game never waits more than 3 seconds before opening the menu.
- **Shipping:** the shipped `manifest.json` is empty (`"textures": {}`), so the game makes no extra requests beyond that one file.
- **Licence:** only add art you have the rights to ship. Add a credit in `src/data/ending.json` (`credits`).
- **Cultural content:** art of Neak Ta shrines, Ap and Arak follows the same rules as the text. Neak Ta are guardians, never enemies. Ap and Arak are fictional interpretations. Don't depict literal religious practice. Have shrine and spirit art reviewed with the people in `docs/l10n/REVIEW_PACK.md`.

## Limits

- An override replaces the pixels of a sheet. It can't add frames or change sizes. New animation frames or larger sprites need a code change in `src/art/*` and `src/textures.ts`.
- Text, the HUD and the menus are drawn by Phaser text and graphics, not textures. Fonts are bundled separately.
