import type { StructureDef } from '../data/schema';

/** Footprint for a rotation (a quarter turn swaps width and height). */
export function footprintOf(def: StructureDef, rot: 0 | 1): { w: number; h: number } {
  return rot === 1 && def.rotatable ? { w: def.footprint.h, h: def.footprint.w } : def.footprint;
}

/** Texture frame for a rotation. */
export function frameOf(def: StructureDef, rot: 0 | 1): string {
  return rot === 1 && def.rotatable ? `${def.sprite}_v` : def.sprite;
}
