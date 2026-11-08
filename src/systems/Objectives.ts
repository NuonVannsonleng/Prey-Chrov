import type { ObjectiveView } from './GameEvents';

/**
 * First-day tutorial checklist (teach through play). Steps complete from gameplay events,
 * in any order; the list persists in saves so a reload never re-locks the player.
 */
export const FIRST_DAY_STEPS: ReadonlyArray<{ id: string; text: string }> = [
  { id: 'gather', text: 'Gather wood and stone (hold E)' },
  { id: 'craft_axe', text: 'Craft a stone axe (C)' },
  { id: 'drink', text: 'Drink at the pond' },
  { id: 'campfire', text: 'Build a campfire (select kit, F)' },
  { id: 'shelter', text: 'Build a bamboo shelter' },
  { id: 'sleep', text: 'Sleep through the night' },
];

export class Objectives {
  private readonly done = new Set<string>();

  constructor(completed: readonly string[] = []) {
    for (const id of completed) if (FIRST_DAY_STEPS.some((s) => s.id === id)) this.done.add(id);
  }

  /** Returns true if this call completed the step. */
  complete(id: string): boolean {
    if (this.done.has(id) || !FIRST_DAY_STEPS.some((s) => s.id === id)) return false;
    this.done.add(id);
    return true;
  }

  isDone(id: string): boolean {
    return this.done.has(id);
  }

  get allDone(): boolean {
    return FIRST_DAY_STEPS.every((s) => this.done.has(s.id));
  }

  view(): ObjectiveView[] {
    return FIRST_DAY_STEPS.map((s) => ({ id: s.id, text: s.text, done: this.done.has(s.id) }));
  }

  serialize(): string[] {
    return [...this.done];
  }
}
