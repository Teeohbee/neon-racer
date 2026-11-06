import { TRACK_WIDTH } from "@neon/sim";
import { sideDepth, type GapSample } from "../features";

const HALF = TRACK_WIDTH / 2;
const LANE_MIN_DEPTH = 150;

export interface Lane {
  xs: number[];
  ys: number[];
  cum: number[];
  length: number;
}

export function laneOf(run: GapSample[], side: number): Lane[] {
  const lanes: Lane[] = [];
  let current: Lane | null = null;
  for (const p of run) {
    const depth = sideDepth(p, side);
    if (depth < LANE_MIN_DEPTH) {
      current = null;
      continue;
    }
    const off = side * (HALF + depth * 0.55);
    const x = p.x + p.nx * off;
    const y = p.y + p.ny * off;
    if (!current) {
      current = { xs: [], ys: [], cum: [], length: 0 };
      lanes.push(current);
    }
    const last = current.xs.length - 1;
    current.length += last >= 0 ? Math.hypot(x - current.xs[last]!, y - current.ys[last]!) : 0;
    current.xs.push(x);
    current.ys.push(y);
    current.cum.push(current.length);
  }
  return lanes.filter((l) => l.length > 200);
}

export function along(lane: Lane, d: number): [number, number, number] {
  const u = Math.max(0, Math.min(lane.length, d));
  let lo = 0;
  let hi = lane.cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lane.cum[mid]! <= u) lo = mid;
    else hi = mid;
  }
  const seg = lane.cum[hi]! - lane.cum[lo]! || 1;
  const k = (u - lane.cum[lo]!) / seg;
  const ax = lane.xs[lo]!;
  const ay = lane.ys[lo]!;
  const bx = lane.xs[hi]!;
  const by = lane.ys[hi]!;
  return [ax + (bx - ax) * k, ay + (by - ay) * k, Math.atan2(by - ay, bx - ax)];
}

