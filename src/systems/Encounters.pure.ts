/** Elite chance for a day (grows with days survived, capped). Pure. */
export function eliteChance(cfg: { minDay: number; chance: number; perDay: number; max: number }, day: number): number {
  if (day < cfg.minDay) return 0;
  return Math.min(cfg.max, cfg.chance + (day - cfg.minDay) * cfg.perDay);
}

/** Population multiplier by distance from spawn: gentle near home, harsher in the far jungle. Pure. */
export function distanceDanger(table: ReadonlyArray<{ tiles: number; mult: number }>, distTiles: number): number {
  for (const t of table) if (distTiles <= t.tiles) return t.mult;
  return table[table.length - 1]?.mult ?? 1;
}
