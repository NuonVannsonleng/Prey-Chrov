import { describe, expect, it } from 'vitest';
import { PLAYER } from '../config';
import { RAW_GAME_DATA } from '../data/gameData';
import { DataValidationError, validateGameData, type RawGameData } from '../data/schema';

const data = validateGameData(RAW_GAME_DATA);
const sp = data.setpieces;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('set pieces are telegraphed and beatable', () => {
  it('every strike can be walked out of during its warning', () => {
    // Distance walkable during the warning must exceed the strike radius with room to spare.
    expect((sp.storm.warningMs / 1000) * PLAYER.walkSpeed).toBeGreaterThan(sp.storm.radius * 2);
    expect((sp.blight.warningMs / 1000) * PLAYER.walkSpeed).toBeGreaterThan(sp.blight.radius * 2);
    expect(sp.storm.strikeIntervalMs).toBeGreaterThan(sp.storm.warningMs);
  });

  it('the Old Tusker winds up visibly, is armoured, and its stun window allows several hits', () => {
    const boss = data.enemies.get(sp.tusker.enemy);
    expect(boss?.boss).toBe(true);
    expect(boss?.telegraphMs).toBeGreaterThanOrEqual(800);
    expect(boss?.spawn.weight).toBe(0); // set piece only, never a random spawn
    const hitsPerStun = sp.tusker.stunMs / data.combat.attackCooldownMs;
    expect(hitsPerStun).toBeGreaterThanOrEqual(3);
    // With a plain stone spear: stunned hits only, no health sponge (at most ~3 stuns).
    const spear = data.items.get('spear')?.tool?.damage ?? 1;
    const stunsNeeded = Math.ceil((boss?.hp ?? 0) / (spear * sp.tusker.vulnerableMultiplier * Math.floor(hitsPerStun)));
    expect(stunsNeeded).toBeLessThanOrEqual(3);
    // Armour: chipping it down without stuns would take far longer (no cheap exploit).
    expect((boss?.hp ?? 0) / sp.tusker.armouredDamage).toBeGreaterThan(40);
  });

  it('the blight is beaten with light, not damage, and retries are a checkpoint', () => {
    expect(sp.blight.cores).toBeGreaterThanOrEqual(2);
    expect(sp.blight.retryHealth).toBeGreaterThan(0.3);
    expect(data.items.get('torch')?.light).toBeDefined();
  });

  it('the validator refuses untelegraphed tuning', () => {
    const raw = clone(RAW_GAME_DATA) as RawGameData & { setpieces: { storm: Record<string, number> } };
    raw.setpieces.storm['warningMs'] = 200;
    try {
      validateGameData(raw);
      expect.unreachable();
    } catch (e) {
      expect((e as DataValidationError).problems.join(' ')).toMatch(/telegraphed/);
    }
  });
});
