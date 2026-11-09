import type { GameData, TabletDef } from '../data/schema';

export interface QuestView {
  title: string;
  titleKm?: string;
  description: string;
  steps: Array<{ text: string; done: boolean; progress?: string }>;
  /** Tablets read so far, in story order (unread ones are omitted). */
  tablets: TabletDef[];
  totalTablets: number;
  stage: 'tablets' | 'heart' | 'restore' | 'done';
}

const MAIN = 'the_five_tablets';

/**
 * Main quest state (pure): read key tablets in any order; after all five, seek the Heart of
 * the Forest. Reading is idempotent, so reloading or re-reading can never double-count.
 */
export class QuestLog {
  private readonly read = new Set<string>();
  heartReached: boolean;
  /** The offering at the Heart Tree was made (the ending was reached). */
  restored: boolean;

  constructor(
    private readonly data: GameData,
    tabletsRead: readonly string[] = [],
    heartReached = false,
    /** Tablets the world actually holds (normally 5); the quest never asks for more. */
    private readonly available = Infinity,
    restored = false,
  ) {
    for (const id of tabletsRead) if (data.tablets.some((t) => t.id === id)) this.read.add(id);
    this.heartReached = heartReached && this.read.size >= this.required;
    this.restored = restored && this.heartReached;
  }

  private get required(): number {
    const step = this.data.quests.get(MAIN)?.steps.find((s) => s.kind === 'collect_tablets');
    return Math.max(1, Math.min(step?.count ?? this.data.tablets.length, this.available));
  }

  get tabletsRead(): string[] {
    return this.data.tablets.filter((t) => this.read.has(t.id)).map((t) => t.id);
  }

  hasRead(id: string): boolean {
    return this.read.has(id);
  }

  get stage(): QuestView['stage'] {
    if (this.read.size < this.required) return 'tablets';
    if (!this.heartReached) return 'heart';
    return this.restored ? 'done' : 'restore';
  }

  /** The offering at the Heart Tree. Only valid once the Heart has been reached. */
  restore(): boolean {
    if (this.stage !== 'restore') return false;
    this.restored = true;
    return true;
  }

  /** Returns true if this was a new tablet. */
  readTablet(id: string): boolean {
    if (this.read.has(id) || !this.data.tablets.some((t) => t.id === id)) return false;
    this.read.add(id);
    return true;
  }

  reachHeart(): boolean {
    if (this.stage !== 'heart') return false;
    this.heartReached = true;
    return true;
  }

  view(): QuestView {
    const q = this.data.quests.get(MAIN);
    const req = this.required;
    const steps = (q?.steps ?? []).map((s) =>
      s.kind === 'collect_tablets'
        ? { text: s.text, done: this.read.size >= req, progress: `${Math.min(this.read.size, req)}/${req}` }
        : s.kind === 'reach_heart'
          ? { text: s.text, done: this.heartReached }
          : { text: s.text, done: this.restored },
    );
    return {
      title: q?.title ?? 'The Five Tablets',
      ...(q?.titleKm ? { titleKm: q.titleKm } : {}),
      description: q?.description ?? '',
      steps,
      tablets: this.data.tablets.filter((t) => this.read.has(t.id)),
      totalTablets: this.data.tablets.length,
      stage: this.stage,
    };
  }
}
