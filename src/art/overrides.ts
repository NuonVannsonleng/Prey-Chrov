import Phaser from 'phaser';
import { parseArtManifest } from './manifest';

/**
 * M22: hand-drawn art pipeline. Every texture in the game is generated in code into a canvas with
 * named frames. An artist can replace any of them with a PNG of the *same size and layout*: list it
 * in `public/art/manifest.json` and its pixels are drawn over the generated canvas at start-up, so
 * every frame name, animation and hitbox keeps working. `npm run art:templates` exports the current
 * generated art (PNG + frame list) to start from. See docs/ART_PIPELINE.md.
 */

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

/**
 * Applies the overrides listed in `<base>manifest.json` (relative to the page, so it works under a
 * sub-path). Missing manifest, offline or bad entries: the generated art stays and a warning is
 * logged. Once `signal` aborts (start-up moved on), late results are ignored. Never throws.
 */
export async function applyArtOverrides(scene: Phaser.Scene, base = 'art/', signal?: AbortSignal): Promise<{ applied: string[]; skipped: string[] }> {
  const applied: string[] = [];
  const skipped: string[] = [];
  let raw: unknown;
  try {
    const res = await fetch(`${base}manifest.json`, { cache: 'no-cache', signal });
    if (!res.ok) return { applied, skipped };
    raw = await res.json();
  } catch {
    return { applied, skipped };
  }
  const { overrides, problems } = parseArtManifest(raw);
  for (const p of problems) {
    console.warn(`[art] ${p}`);
    skipped.push(p);
  }
  await Promise.all(
    overrides.map(async ({ key, file }) => {
      try {
        const img = await loadImage(`${base}${file}`);
        // Too late (the game already started with the generated art): don't swap art mid-play.
        if (signal?.aborted) throw new Error('arrived too late');
        const tex = scene.textures.get(key);
        if (!(tex instanceof Phaser.Textures.CanvasTexture)) throw new Error('not a generated canvas texture');
        if (img.naturalWidth !== tex.width || img.naturalHeight !== tex.height) {
          throw new Error(`${file} is ${img.naturalWidth}×${img.naturalHeight}; it must be ${tex.width}×${tex.height} (export a template with npm run art:templates)`);
        }
        const ctx = tex.getContext();
        ctx.clearRect(0, 0, tex.width, tex.height);
        ctx.drawImage(img, 0, 0);
        tex.refresh();
        applied.push(key);
      } catch (err) {
        console.warn(`[art] ${key}: ${(err as Error).message} — keeping the generated art`);
        skipped.push(key);
      }
    }),
  );
  return { applied, skipped };
}
