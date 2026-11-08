import { describe, expect, it } from 'vitest';
import { TEST_MAP, TILE_SIZE } from '../config';
import { buildTestMap } from '../world/TestMap';

describe('buildTestMap', () => {
  const map = buildTestMap();
  const solids = map.props.filter((p) => p.kind !== 'fern');

  it('is deterministic', () => {
    expect(buildTestMap()).toEqual(map);
  });

  it('has the configured dimensions', () => {
    expect(map.ground).toHaveLength(TEST_MAP.heightTiles);
    for (const row of map.ground) expect(row).toHaveLength(TEST_MAP.widthTiles);
  });

  it('keeps every prop inside the world', () => {
    const w = map.widthTiles * TILE_SIZE;
    const h = map.heightTiles * TILE_SIZE;
    for (const p of map.props) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(w);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(h);
    }
  });

  it('keeps the spawn clear of solid props', () => {
    const clear = (TEST_MAP.spawnClearRadiusTiles - 1) * TILE_SIZE;
    for (const p of solids) {
      expect(Math.hypot(p.x - map.spawn.x, p.y - map.spawn.y)).toBeGreaterThan(clear);
    }
  });

  it('spaces solid props so the player can always pass between them', () => {
    for (let i = 0; i < solids.length; i++) {
      for (let j = i + 1; j < solids.length; j++) {
        const a = solids[i]!;
        const b = solids[j]!;
        // Footprints are <= 24px wide; player body is 14px. Keep >= 40px between centres.
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(40);
      }
    }
  });

  it('contains trees and rocks to collide with', () => {
    expect(solids.filter((p) => p.kind === 'tree').length).toBeGreaterThan(50);
    expect(solids.filter((p) => p.kind === 'rock').length).toBeGreaterThan(5);
  });
});
