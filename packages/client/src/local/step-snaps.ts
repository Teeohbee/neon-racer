import type { ServerMsg } from "@neon/sim";
import { blendSnaps, type Sampled } from "../net/interpolation";

type Snap = Extract<ServerMsg, { t: "snap" }>;

/**
 * Local play's last two Room snapshots, one tick apart, for drawing between them by how far the
 * frame is into the next tick. Online play waits for late snapshots; here the Room runs in the
 * same page, so nothing is late and the race is drawn under one tick behind the sim.
 */
export class StepSnaps {
  private prev: Snap | null = null;
  private cur: Snap | null = null;

  push(snap: Snap): void {
    this.prev = this.cur;
    this.cur = snap;
  }

  clear(): void {
    this.prev = null;
    this.cur = null;
  }

  latest(): Snap | undefined {
    return this.cur ?? undefined;
  }

  /** What to draw `t` (0..1) of the way into the next tick. */
  sample(t: number): Sampled | null {
    return this.cur ? blendSnaps(this.prev ?? this.cur, this.cur, t) : null;
  }

  /** The Room's phase clock at what's drawn. */
  time(t: number): number {
    const { prev, cur } = this;
    if (!cur) return 0;
    if (!prev || prev.phase !== cur.phase) return cur.now;
    return prev.now + (cur.now - prev.now) * t;
  }
}
