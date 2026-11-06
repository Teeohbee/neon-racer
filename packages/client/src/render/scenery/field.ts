import { dropAt, TRACK_WIDTH, type Track } from "@neon/sim";

const CELL = 160;
const GAP_REACH = TRACK_WIDTH / 2 + 320;

export interface Field {
  edgeDistance(x: number, y: number): number;
  nearGap(x: number, y: number, margin: number): boolean;
}

export function buildField(track: Track): Field {
  const n = track.xs.length;
  const drop = track.cum.slice(0, n).map((s) => dropAt(track, s));
  const cells = new Map<string, number[]>();
  const key = (cx: number, cy: number) => `${cx},${cy}`;
  for (let i = 0; i < n; i++) {
    const k = key(Math.floor(track.xs[i]! / CELL), Math.floor(track.ys[i]! / CELL));
    const list = cells.get(k);
    if (list) list.push(i);
    else cells.set(k, [i]);
  }

  const nearest = (x: number, y: number, reach: number): { i: number; d: number } => {
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    const rings = Math.ceil(reach / CELL);
    let best = { i: -1, d: Infinity };
    for (let dx = -rings; dx <= rings; dx++) {
      for (let dy = -rings; dy <= rings; dy++) {
        for (const i of cells.get(key(cx + dx, cy + dy)) ?? []) {
          const d = Math.hypot(track.xs[i]! - x, track.ys[i]! - y);
          if (d < best.d) best = { i, d };
        }
      }
    }
    return best;
  };

  return {
    edgeDistance(x, y) {
      return nearest(x, y, 900).d - TRACK_WIDTH / 2;
    },
    nearGap(x, y, margin) {
      const reach = GAP_REACH + margin;
      const cx = Math.floor(x / CELL);
      const cy = Math.floor(y / CELL);
      const rings = Math.ceil(reach / CELL);
      for (let dx = -rings; dx <= rings; dx++) {
        for (let dy = -rings; dy <= rings; dy++) {
          for (const i of cells.get(key(cx + dx, cy + dy)) ?? []) {
            if (drop[i] && Math.hypot(track.xs[i]! - x, track.ys[i]! - y) < reach) return true;
          }
        }
      }
      return false;
    },
  };
}
