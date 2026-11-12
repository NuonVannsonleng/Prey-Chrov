import { describe, expect, it } from 'vitest';
import { RAW_GAME_DATA } from '../data/gameData';
import { DataValidationError, reachableItems, validateGameData, type RawGameData } from '../data/schema';
import { QuestLog } from '../systems/Quest';
import { SideQuestBook } from '../systems/SideQuests';

const data = validateGameData(RAW_GAME_DATA);
const defs = data.sidequests;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Drives one chain to its choice using its own data (events and state steps). */
function playToChoice(book: SideQuestBook, id: string): void {
  const def = defs.find((d) => d.id === id);
  if (!def) throw new Error(id);
  for (const s of def.steps) {
    if (s.kind === 'event') for (let i = 0; i < (s.count ?? 1); i++) book.notify(s.event ?? '');
    else if (s.kind === 'state') book.checkState((stat) => (stat === s.stat ? (s.count ?? 1) : 0));
  }
}

describe('side story data', () => {
  it('at least three coherent chains, each with a start, progress steps and a final choice', () => {
    expect(defs.length).toBeGreaterThanOrEqual(3);
    for (const d of defs) {
      expect(d.steps.length).toBeGreaterThanOrEqual(3);
      expect(d.steps[d.steps.length - 1]?.kind).toBe('choice');
      expect(d.steps.slice(0, -1).every((s) => s.kind !== 'choice')).toBe(true);
      const opts = d.steps[d.steps.length - 1]?.options ?? [];
      expect(opts.length).toBeGreaterThanOrEqual(2);
      expect(opts.some((o) => !o.cost?.length), `${d.id} has a free option`).toBe(true);
      expect(opts.every((o) => o.effects.some((e) => e.type === 'ending')), `${d.id} options change the ending`).toBe(true);
    }
    expect(defs.some((d) => d.kind === 'memories')).toBe(true);
  });

  it('rewards are reachable and the validator rejects a choice with no free option', () => {
    const r = reachableItems(data);
    expect(r.has('ember_lantern')).toBe(true);
    const raw = clone(RAW_GAME_DATA) as RawGameData & { sidequests: Array<{ steps: Array<{ options?: Array<{ cost?: unknown[] }> }> }> };
    const opts = raw.sidequests[1]?.steps[2]?.options ?? [];
    for (const o of opts) o.cost = [{ item: 'wood', qty: 1 }];
    try {
      validateGameData(raw);
      expect.unreachable();
    } catch (e) {
      expect((e as DataValidationError).problems.join(' ')).toMatch(/no cost/);
    }
  });
});

describe('side story flow', () => {
  it('an event offers a chain once; declining ends it without side effects', () => {
    const book = new SideQuestBook(defs);
    const id = defs[0]?.id ?? '';
    const ev = defs[0]?.start.event ?? '';
    const ups = book.notify(ev);
    expect(ups.some((u) => u.offer?.id === id)).toBe(true);
    book.answerOffer(id, false);
    expect(book.state.get(id)?.status).toBe('declined');
    expect(book.notify(ev).some((u) => u.offer?.id === id)).toBe(false);
    expect(book.memories()).toEqual([]);
  });

  it('accepted chains progress through their steps, unlock memories, and end in a choice', () => {
    for (const d of defs) {
      const book = new SideQuestBook(defs);
      book.notify(d.start.event);
      book.answerOffer(d.id, true);
      playToChoice(book, d.id);
      expect(book.pendingChoice()?.choice?.id).toBe(d.id);
      expect(book.memories().length).toBeGreaterThan(0);
      const res = book.choose(d.id, d.steps[d.steps.length - 1]?.options?.[0]?.id ?? '');
      expect(res?.effects.length).toBeGreaterThan(0);
      expect(book.state.get(d.id)?.status).toBe('done');
    }
  });

  it('rewards cannot be farmed: a finished chain never pays out again, even after a save/load', () => {
    const d = defs[2];
    if (!d) throw new Error('need 3 chains');
    const book = new SideQuestBook(defs);
    book.notify(d.start.event);
    book.answerOffer(d.id, true);
    playToChoice(book, d.id);
    const opt = d.steps[d.steps.length - 1]?.options?.[1]?.id ?? '';
    expect(book.choose(d.id, opt)).not.toBeNull();
    expect(book.choose(d.id, opt)).toBeNull();
    const reloaded = new SideQuestBook(defs, clone(book.serialize()));
    expect(reloaded.choose(d.id, opt)).toBeNull();
    expect(reloaded.notify(d.start.event).some((u) => u.offer?.id === d.id)).toBe(false);
    playToChoice(reloaded, d.id);
    expect(reloaded.pendingChoice()).toBeNull();
  });

  it('a reload mid-chain keeps progress; an unanswered offer is offered again later', () => {
    const d = defs[1];
    if (!d) throw new Error('need chains');
    const book = new SideQuestBook(defs);
    book.notify(d.start.event);
    const offered = new SideQuestBook(defs, clone(book.serialize()));
    expect(offered.state.get(d.id)?.status).toBe('available');
    expect(offered.notify(d.start.event).some((u) => u.offer?.id === d.id)).toBe(true);
    offered.answerOffer(d.id, true);
    offered.notify(d.steps[0]?.event ?? '');
    const mid = new SideQuestBook(defs, clone(offered.serialize()));
    expect(mid.state.get(d.id)).toMatchObject({ status: 'active', step: 0, count: 1 });
  });

  it('side stories never touch the main quest', () => {
    const q = new QuestLog(data);
    const book = new SideQuestBook(defs);
    for (const d of defs) {
      book.notify(d.start.event);
      book.answerOffer(d.id, false);
    }
    expect(q.stage).toBe('tablets');
    for (const t of data.tablets) q.readTablet(t.id);
    expect(q.reachHeart()).toBe(true);
    expect(q.restore()).toBe(true);
    expect(q.stage).toBe('done');
  });
});
