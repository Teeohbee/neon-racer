import { CAR_RADIUS } from "@neon/sim";

export const SHAVE_NEAR = CAR_RADIUS * 2 * 5;
export const SHAVE_CLEAR = SHAVE_NEAR * 3;
const LEAD_HOLD = 1.5;
const LEAD_GAP = 6;
const SHAVE_GAP = 8;

export interface Racer {
  id: string;
  gap: number;
}

export type WatchEvent = { kind: "lead"; id: string } | { kind: "shave"; id: string };

export function signedGap(s: number, line: number, length: number): number {
  const ahead = (((s - line) % length) + length) % length;
  return ahead > length / 2 ? ahead - length : ahead;
}

export class RaceWatch {
  private leader: string | null = null;
  private candidate: string | null = null;
  private candidateSince = 0;
  private lastLeadAt = -Infinity;
  private near = new Set<string>();
  private lastShave = new Map<string, number>();

  update(racers: Racer[], t: number): WatchEvent[] {
    const events: WatchEvent[] = [];
    const ids = new Set(racers.map((r) => r.id));
    for (const id of this.near) if (!ids.has(id)) this.near.delete(id);
    for (const r of racers) {
      if (r.gap >= 0 && r.gap < SHAVE_NEAR) this.near.add(r.id);
      else if (r.gap > SHAVE_CLEAR && this.near.delete(r.id) && t - (this.lastShave.get(r.id) ?? -Infinity) >= SHAVE_GAP) {
        this.lastShave.set(r.id, t);
        events.push({ kind: "shave", id: r.id });
      }
    }
    if (racers.length < 2) return events;
    const top = racers.reduce((best, r) => (r.gap > best.gap ? r : best)).id;
    if (top === this.leader) {
      this.candidate = null;
      return events;
    }
    if (top !== this.candidate) {
      this.candidate = top;
      this.candidateSince = t;
    }
    if (t - this.candidateSince < LEAD_HOLD) return events;
    const announce = this.leader !== null && t - this.lastLeadAt >= LEAD_GAP;
    this.leader = top;
    this.candidate = null;
    if (announce) {
      this.lastLeadAt = t;
      events.push({ kind: "lead", id: top });
    }
    return events;
  }

  reset(): void {
    this.leader = null;
    this.candidate = null;
    this.lastLeadAt = -Infinity;
    this.near.clear();
    this.lastShave.clear();
  }
}
