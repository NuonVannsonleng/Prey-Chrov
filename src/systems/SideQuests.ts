import type { SideQuestDef, SideQuestEffect } from '../data/schema';

export type SideStatus = 'available' | 'offered' | 'active' | 'declined' | 'done';

export interface SideQuestState {
  status: SideStatus;
  /** Index of the current step while active. */
  step: number;
  /** Progress counter for the current step (event steps). */
  count: number;
  /** Chosen option id once the final choice is made. */
  choice?: string;
}

export interface SideQuestView {
  id: string;
  title: string;
  status: SideStatus;
  steps: Array<{ text: string; done: boolean; progress?: string }>;
  outcome?: string;
}

export interface SideUpdate {
  /** A quest wants to be offered (UI shows Accept / Decline). */
  offer?: { id: string; title: string; text: string };
  /** A step finished; its memory text (if any) is unlocked. */
  memory?: { id: string; title: string; text: string };
  /** The final choice is ready (UI shows the options). */
  choice?: { id: string; title: string; prompt: string; options: Array<{ id: string; label: string; description: string; cost: Array<{ item: string; qty: number }> }> };
}

/**
 * Side stories (pure, saved). Quests are offered by an event, may be accepted or declined,
 * advance through event / state / choice steps, and finish exactly once — so rewards can't be
 * farmed by reloading: the state saves alongside the inventory that received them.
 */
export class SideQuestBook {
  readonly state = new Map<string, SideQuestState>();

  constructor(
    private readonly defs: readonly SideQuestDef[],
    saved?: Record<string, Partial<SideQuestState>>,
  ) {
    for (const d of defs) {
      const s = saved?.[d.id];
      const status: SideStatus = s && ['available', 'offered', 'active', 'declined', 'done'].includes(s.status as string) ? (s.status as SideStatus) : 'available';
      const step = Math.max(0, Math.min(d.steps.length - 1, Math.floor(Number(s?.step) || 0)));
      // An offer interrupted by a reload is simply offered again later.
      this.state.set(d.id, { status: status === 'offered' ? 'available' : status, step, count: Math.max(0, Math.floor(Number(s?.count) || 0)), choice: typeof s?.choice === 'string' ? s.choice : undefined });
    }
  }

  private def(id: string): SideQuestDef | undefined {
    return this.defs.find((d) => d.id === id);
  }

  /** An event happened in the world. Returns at most one offer and any memories / choices it caused. */
  notify(event: string, amount = 1): SideUpdate[] {
    const out: SideUpdate[] = [];
    for (const d of this.defs) {
      const s = this.state.get(d.id);
      if (!s) continue;
      if (s.status === 'available' && d.start.event === event && !out.some((u) => u.offer)) {
        s.status = 'offered';
        out.push({ offer: { id: d.id, title: d.title, text: d.offer } });
        continue;
      }
      if (s.status !== 'active') continue;
      const step = d.steps[s.step];
      if (step?.kind !== 'event' || step.event !== event) continue;
      s.count += amount;
      if (s.count >= (step.count ?? 1)) out.push(...this.advance(d, s));
    }
    return out;
  }

  /** State steps (e.g. "read 3 tablets") checked against the world; returns updates when met. */
  checkState(stat: (name: string) => number): SideUpdate[] {
    const out: SideUpdate[] = [];
    for (const d of this.defs) {
      const s = this.state.get(d.id);
      if (s?.status !== 'active') continue;
      const step = d.steps[s.step];
      if (step?.kind === 'state' && step.stat && stat(step.stat) >= (step.count ?? 1)) out.push(...this.advance(d, s));
    }
    return out;
  }

  answerOffer(id: string, accept: boolean): SideUpdate[] {
    const d = this.def(id);
    const s = this.state.get(id);
    if (!d || s?.status !== 'offered') return [];
    if (!accept) {
      s.status = 'declined';
      return [];
    }
    s.status = 'active';
    s.step = 0;
    s.count = 0;
    // A first step that is already a choice (or met state) is handled by the caller's next check.
    const first = d.steps[0];
    return first?.kind === 'choice' ? [this.choiceUpdate(d)] : [];
  }

  /** Makes the final choice. Returns the effects to apply, or null if not valid now. */
  choose(id: string, optionId: string): { effects: SideQuestEffect[]; result: string } | null {
    const d = this.def(id);
    const s = this.state.get(id);
    if (!d || s?.status !== 'active') return null;
    const step = d.steps[s.step];
    if (step?.kind !== 'choice') return null;
    const opt = step.options?.find((o) => o.id === optionId);
    if (!opt) return null;
    s.choice = opt.id;
    s.status = 'done';
    return { effects: opt.effects, result: opt.result };
  }

  /** The pending choice for an active quest sitting on a choice step (re-shown after a reload). */
  pendingChoice(): SideUpdate | null {
    for (const d of this.defs) {
      const s = this.state.get(d.id);
      if (s?.status === 'active' && d.steps[s.step]?.kind === 'choice') return this.choiceUpdate(d);
    }
    return null;
  }

  private choiceUpdate(d: SideQuestDef): SideUpdate {
    const s = this.state.get(d.id);
    const step = d.steps[s?.step ?? 0];
    return {
      choice: {
        id: d.id,
        title: d.title,
        prompt: step?.prompt ?? step?.text ?? '',
        options: (step?.options ?? []).map((o) => ({ id: o.id, label: o.label, description: o.description, cost: o.cost ?? [] })),
      },
    };
  }

  private advance(d: SideQuestDef, s: SideQuestState): SideUpdate[] {
    const out: SideUpdate[] = [];
    const step = d.steps[s.step];
    if (step?.memory) out.push({ memory: { id: `${d.id}#${s.step}`, title: d.title, text: step.memory } });
    s.step++;
    s.count = 0;
    const next = d.steps[s.step];
    if (!next) {
      s.status = 'done';
      s.step = d.steps.length - 1;
    } else if (next.kind === 'choice') out.push(this.choiceUpdate(d));
    return out;
  }

  /** Memories unlocked so far (every completed step that carries one). */
  memories(): Array<{ title: string; text: string }> {
    const out: Array<{ title: string; text: string }> = [];
    for (const d of this.defs) {
      const s = this.state.get(d.id);
      if (!s || s.status === 'available' || s.status === 'offered' || s.status === 'declined') continue;
      const reached = s.status === 'done' ? d.steps.length : s.step;
      for (let i = 0; i < reached; i++) {
        const m = d.steps[i]?.memory;
        if (m) out.push({ title: d.title, text: m });
      }
    }
    return out;
  }

  view(): SideQuestView[] {
    return this.defs.map((d) => {
      const s = this.state.get(d.id) ?? { status: 'available' as const, step: 0, count: 0 };
      const steps = d.steps.map((st, i) => {
        const done = s.status === 'done' || (s.status === 'active' && i < s.step);
        const current = s.status === 'active' && i === s.step;
        const progress = current && st.kind === 'event' && (st.count ?? 1) > 1 ? `${s.count}/${st.count}` : undefined;
        return { text: st.text, done, progress };
      });
      const chosen = s.choice ? d.steps[d.steps.length - 1]?.options?.find((o) => o.id === s.choice) : undefined;
      return { id: d.id, title: d.title, status: s.status, steps, outcome: chosen ? `${chosen.label}: ${chosen.result}` : undefined };
    });
  }

  serialize(): Record<string, SideQuestState> {
    const out: Record<string, SideQuestState> = {};
    for (const [k, v] of this.state) out[k] = { ...v };
    return out;
  }
}
