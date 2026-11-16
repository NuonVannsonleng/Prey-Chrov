import { describe, expect, it } from 'vitest';
import { RAW_GAME_DATA, getGameData } from '../data/gameData';
import { validateGameData } from '../data/schema';
import { emptyTravelers, missingFor, nextVisitDay, parseTravelers, placePhrase, visitorOn } from '../systems/Travelers';
import { SAVE_VERSION, parseSave } from '../systems/Save';

const data = getGameData();
const cfg = data.travelers;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('traveler visits', () => {
  it('follow the seed: same world, same visitors; none before the first visit day', () => {
    for (const seed of [1, 4242, 99991]) {
      for (let d = 1; d < cfg.firstVisitDay; d++) expect(visitorOn(seed, d, cfg)).toBeNull();
      const days: number[] = [];
      let prev = '';
      for (let d = 1; d <= 60; d++) {
        const a = visitorOn(seed, d, cfg);
        expect(a?.id).toBe(visitorOn(seed, d, cfg)?.id);
        if (!a) continue;
        days.push(d);
        // Never the same traveler twice in a row.
        expect(a.id).not.toBe(prev);
        prev = a.id;
      }
      expect(days[0]).toBe(cfg.firstVisitDay);
      for (let i = 1; i < days.length; i++) {
        const gap = (days[i] as number) - (days[i - 1] as number);
        expect(gap).toBeGreaterThanOrEqual(cfg.gapDays[0]);
        expect(gap).toBeLessThanOrEqual(cfg.gapDays[1]);
      }
      expect(nextVisitDay(seed, 1, cfg)).toBe(cfg.firstVisitDay);
    }
  });

  it('every traveler turns up across a long journey in some world', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) for (let d = 1; d <= 40; d++) seen.add(visitorOn(seed, d, cfg)?.id ?? '');
    for (const t of cfg.travelers) expect(seen).toContain(t.id);
  });

  it('the river trader can reach passage trust within a reasonable journey', () => {
    const trader = cfg.travelers.find((t) => t.id === cfg.passage.traveler);
    expect(trader).toBeDefined();
    // Each visit allows each trade once, so trust grows by up to the trade count per visit.
    expect((trader?.trades.length ?? 0) * 2).toBeGreaterThanOrEqual(cfg.passage.trust);
  });
});

describe('traveler state in saves', () => {
  it('round-trips and drops junk without throwing', () => {
    const ok = parseTravelers({ met: ['mapmaker', 'ghost', 'mapmaker'], trust: { river_trader: 2, ghost: 5, mapmaker: -1 }, visit: { day: 4, traveler: 'mapmaker', x: 10, y: 20, traded: [cfg.travelers.find((t) => t.id === 'mapmaker')?.trades[0]?.id, 'nope'], rumorTold: true }, departed: false }, cfg);
    expect(ok.met).toEqual(['mapmaker']);
    expect(ok.trust).toEqual({ river_trader: 2 });
    expect(ok.visit?.traded.length).toBe(1);
    expect(ok.visit?.rumorTold).toBe(true);
    for (const junk of [null, 7, 'x', [], { visit: { day: -1, traveler: 'mapmaker', x: 0, y: 0 } }, { visit: { day: 2, traveler: 'mapmaker', x: Number.NaN, y: 0 } }]) {
      const s = parseTravelers(junk, cfg);
      expect(s.visit).toBeNull();
    }
    expect(parseTravelers(undefined, cfg)).toEqual(emptyTravelers());
  });

  it('survives the save parser (older saves simply have none)', () => {
    const raw = { version: SAVE_VERSION, savedAt: 1, seed: 7, clockSeconds: 0, travelers: { met: ['river_trader'], trust: { river_trader: 1 }, visit: null } };
    const parsed = parseSave(JSON.stringify(raw));
    expect('data' in parsed ? parseTravelers(parsed.data.travelers, cfg).trust['river_trader'] : -1).toBe(1);
  });
});

describe('trades and news', () => {
  it('missingFor reports exactly what is short', () => {
    const count = (i: string) => (i === 'hide' ? 1 : 5);
    expect(missingFor([{ item: 'hide', qty: 2 }, { item: 'stone', qty: 3 }], count)).toEqual([{ item: 'hide', qty: 1 }]);
  });

  it('news gives a distance and compass direction', () => {
    expect(placePhrase(0, -32 * 120)).toBe('about 120 m to the north');
    expect(placePhrase(32 * 50, 32 * 50)).toMatch(/to the south-east$/);
    expect(placePhrase(1, 0)).toBe('about 10 m to the east');
  });

  it('the validator refuses selling quest items or tools, endless trade loops and a missing passage', () => {
    const bad = clone(RAW_GAME_DATA.travelers) as { travelers: Array<{ trades: Array<{ give: unknown; get: unknown }> }>; passage: Record<string, unknown> };
    const t0 = bad.travelers[0];
    const t1 = bad.travelers[1];
    if (!t0?.trades[0] || !t1?.trades[0]) throw new Error('fixture');
    t0.trades[0].get = [{ item: 'spirit_dust', qty: 1 }];
    t1.trades[0] = { ...t1.trades[0], give: [{ item: 'stone', qty: 1 }], get: [{ item: 'wood', qty: 2 }] } as never;
    bad.travelers[2]?.trades.splice(0, 1, { id: 'loop', label: 'x', description: 'x', give: [{ item: 'wood', qty: 1 }], get: [{ item: 'stone', qty: 1 }] } as never);
    bad.passage['traveler'] = 'nobody';
    expect(() => validateGameData({ ...RAW_GAME_DATA, travelers: bad })).toThrow(/never sells spirit_dust[\s\S]*more (stone|wood)[\s\S]*passage\.traveler/);
  });

  it('the shipped trades are valid and every traveler has news or stories', () => {
    for (const t of cfg.travelers) {
      expect(t.trades.length).toBeGreaterThan(0);
      expect(t.stories.length + (t.rumor ? 1 : 0)).toBeGreaterThan(0);
    }
    expect(data.ending.river.epilogueRestored.length).toBeGreaterThanOrEqual(3);
  });
});
