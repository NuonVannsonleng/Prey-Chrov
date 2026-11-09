import type { GameData, TabletDef } from '../data/schema';

export interface QuestView {
  title: string;
  titleKm?: string;
  description: string;
  steps: Array<{ text: string; done: boolean; progress?: string }>;
  /** Tablets read so far, in story order (unread ones are omitted). */
  tablets: TabletDef[];
  totalTablets: number;
  stage: 'tablets' | 'heart' | 'done';
}

const MAIN = 'the_five_tablets';

/**
 * Main quest state (pure): read key tablets in any order; after all five, seek the Heart of
 * the Forest. Reading is idempotent, so reloading or re-reading can never double-count.
 */
export class QuestLog {
  private readonly read = new Set<string>();
  heartReached: boolean;

  constructor(
    private readonly data: GameData,
    tabletsRead: readonly string[] = [],
    heartReached = false,
  ) {
    for (const id of tabletsRead) if (data.tablets.some((t) => t.id === id)) this.read.add(id);
    this.heartReached = heartReached && this.read.size >= this.required;
  }

  private get required(): number {
    const step = this.data.quests.get(MAIN)?.steps.find((s) => s.kind === 'collect_tablets');
    return step?.count ?? this.data.tablets.length;
  }

  get tabletsRead(): string[] {
    return this.data.tablets.filter((t) => this.read.has(t.id)).map((t) => t.id);
  }

  hasRead(id: string): boolean {
    return this.read.has(id);
  }

  get stage(): QuestView['stage'] {
    if (this.read.size < this.required) return 'tablets';
    return this.heartReached ? 'done' : 'heart';
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
        : { text: s.text, done: this.heartReached },
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
