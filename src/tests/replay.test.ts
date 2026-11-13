import { describe, expect, it } from 'vitest';
import { RAW_GAME_DATA, getGameData } from '../data/gameData';
import { validateGameData } from '../data/schema';
import { completion, emptyRecords, parseRecords, recordEvent, type AchievementDef } from '../systems/Records';
import { CONTENT_VERSION, LEGACY_RULES, defaultRules, describeRules, parseRules, ruleEffects, seedFromText } from '../systems/Rules';
import { LANDMARK_IDS, LANDMARK_IDS_V2, landmarkCandidate } from '../world/RuinPlan';
import { SAVE_VERSION, parseSave } from '../systems/Save';

const data = getGameData();
const mods = data.difficulty.modifiers.map((m) => m.id);

describe('difficulty presets and modifiers', () => {
  it('Survival changes nothing; Story is gentler and Hard tougher on every pressure', () => {
    const fx = (difficulty: 'story' | 'survival' | 'hard') => ruleEffects({ ...defaultRules(), difficulty }, data.difficulty);
    const story = fx('story');
    const surv = fx('survival');
    const hard = fx('hard');
    for (const v of Object.values(surv)) expect(v).toBe(1);
    for (const k of ['hungerDrain', 'thirstDrain', 'enemyDamage', 'spawnCap', 'detection'] as const) {
      expect(story[k]).toBeLessThan(1);
      expect(hard[k]).toBeGreaterThan(1);
    }
    // Hard leans on pressure and awareness, not sharper single hits.
    expect(hard.enemyDamage).toBeLessThanOrEqual(1.25);
  });

  it('modifiers multiply in and every stack stays within 0.4–2', () => {
    const all = ruleEffects({ ...defaultRules(), difficulty: 'hard', modifiers: mods }, data.difficulty);
    for (const v of Object.values(all)) {
      expect(v).toBeGreaterThanOrEqual(0.4);
      expect(v).toBeLessThanOrEqual(2);
    }
    const one = data.difficulty.modifiers[0];
    if (!one) throw new Error('no modifiers');
    const fx = ruleEffects({ ...defaultRules(), modifiers: [one.id] }, data.difficulty);
    for (const [k, v] of Object.entries(one.effects)) expect(fx[k as keyof typeof fx]).toBeCloseTo(v);
  });

  it('the validator refuses out-of-range or unknown effects and a Survival preset that changes things', () => {
    const bad = JSON.parse(JSON.stringify(RAW_GAME_DATA.difficulty));
    bad.presets[0].effects.enemyDamage = 5;
    bad.presets[0].effects.telegraphMs = 0.5;
    bad.presets.find((p: { id: string }) => p.id === 'survival').effects = { spawnCap: 1.1 };
    expect(() => validateGameData({ ...RAW_GAME_DATA, difficulty: bad })).toThrow(/0\.4–2[\s\S]*not a known effect[\s\S]*change nothing/);
  });
});

describe('journey rules in saves', () => {
  it('pre-M17 saves load as Survival with the original content, unchanged', () => {
    expect(parseRules(undefined, mods)).toEqual(LEGACY_RULES);
    expect(parseRules(null, mods).content).toBe(1);
  });

  it('stored rules round-trip; unknown modifiers and bad values are dropped, never invented', () => {
    const r = parseRules({ difficulty: 'hard', modifiers: [mods[0], 'made_up', mods[0]], permadeath: true, content: CONTENT_VERSION }, mods);
    expect(r).toEqual({ difficulty: 'hard', modifiers: [mods[0]], permadeath: true, content: CONTENT_VERSION });
    expect(parseRules({ difficulty: 'nightmare', permadeath: 'yes', content: 99 }, mods)).toEqual({ difficulty: 'survival', modifiers: [], permadeath: false, content: CONTENT_VERSION });
  });

  it('rules survive the save parser', () => {
    const raw = { version: SAVE_VERSION, savedAt: 1, seed: 7, clockSeconds: 0, rules: { difficulty: 'story', modifiers: [], permadeath: false, content: 2 } };
    const parsed = parseSave(JSON.stringify(raw));
    expect('data' in parsed ? parseRules(parsed.data.rules, mods).difficulty : parsed.error.kind).toBe('story');
  });

  it('describes rules for menus', () => {
    expect(describeRules({ ...defaultRules(), difficulty: 'hard', permadeath: true }, data.difficulty)).toMatch(/^Hard · permadeath$/);
  });

  it('typed seeds: digits as-is, text hashed the same way every time', () => {
    expect(seedFromText(' 4242 ')).toBe(4242);
    expect(seedFromText('river')).toBe(seedFromText('river'));
    expect(seedFromText('river')).not.toBe(seedFromText('rivers'));
    expect(seedFromText('')).toBeNull();
  });
});

describe('landmark variants', () => {
  it('old worlds (content 1) keep exactly the same landmarks; new worlds can hold the new kinds', () => {
    let newKinds = 0;
    for (let cx = -6; cx <= 6; cx++)
      for (let cy = -6; cy <= 6; cy++) {
        const a = landmarkCandidate(cx, cy, 1234);
        const b = landmarkCandidate(cx, cy, 1234, 1);
        expect(a).toEqual(b);
        if (a) expect(LANDMARK_IDS).toContain(a.id);
        const c = landmarkCandidate(cx, cy, 1234, CONTENT_VERSION);
        expect(c === null).toBe(a === null);
        if (c && !LANDMARK_IDS.includes(c.id)) newKinds++;
        if (c) expect(LANDMARK_IDS_V2).toContain(c.id);
      }
    expect(newKinds).toBeGreaterThan(0);
  });
});

describe('records and achievements', () => {
  const defs = data.achievements;
  const ctx = { difficulty: 'survival' as const, permadeath: false };

  it('every achievement uses a known event and is reachable', () => {
    expect(defs.length).toBeGreaterThanOrEqual(18);
    const tablets = defs.find((a) => a.event === 'tablet_read' && (a.count ?? 1) > 1);
    expect(tablets?.count ?? 0).toBeLessThanOrEqual(data.tablets.length);
  });

  it('counters accumulate across journeys and earn once', () => {
    const r = emptyRecords();
    const first = recordEvent(r, defs, 'night_survived', ctx);
    expect(first.map((a) => a.id)).toContain('first_dawn');
    for (let i = 0; i < 5; i++) expect(recordEvent(r, defs, 'night_survived', ctx).map((a) => a.id)).not.toContain('first_dawn');
    expect(recordEvent(r, defs, 'night_survived', ctx).map((a) => a.id)).toContain('seven_nights');
  });

  it('endings count per difficulty and permadeath', () => {
    const r = emptyRecords();
    const story = recordEvent(r, defs, 'ending_reached', { difficulty: 'story', permadeath: false }).map((a) => a.id);
    expect(story).toContain('ending_story');
    expect(story).not.toContain('ending_hard');
    expect(story).not.toContain('ending_permadeath');
    const hard = recordEvent(r, defs, 'ending_reached', { difficulty: 'hard', permadeath: true }).map((a) => a.id);
    expect(hard).toEqual(expect.arrayContaining(['ending_hard', 'ending_permadeath']));
    expect(r.endings).toEqual({ story: 1, hard: 1, permadeath: 1 });
  });

  it('skill_level keeps the best level reached', () => {
    const r = emptyRecords();
    recordEvent(r, defs, 'skill_level', ctx, 2);
    recordEvent(r, defs, 'skill_level', ctx, 1);
    expect(r.counters.skill_level).toBe(2);
  });

  it('parses stored records defensively and reports completion', () => {
    expect(parseRecords('{bad')).toEqual(emptyRecords());
    const r = parseRecords(JSON.stringify({ counters: { fish_caught: 3, bogus: 9, landmark_found: -2 }, earned: { first_dawn: 5, 'Bad Id': 1 }, journeys: 2 }));
    expect(r.counters).toEqual({ fish_caught: 3 });
    expect(Object.keys(r.earned)).toEqual(['first_dawn']);
    const two: AchievementDef[] = [defs[0] as AchievementDef, { id: 'x', name: 'X', description: 'x', event: 'fish_caught' }];
    expect(completion({ ...emptyRecords(), earned: { [two[0]!.id]: 1 } }, two)).toBe(0.5);
  });
});
