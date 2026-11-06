import { dropAt, pointAt, type Point, type Track } from "@neon/sim";

export function flat(points: Point[]): number[] {
  const out: number[] = [];
  for (const [x, y] of points) out.push(x, y);
  return out;
}

export function offsetLoop(points: Point[], offset: number): number[] {
  const n = points.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const [px, py] = points[(i - 1 + n) % n]!;
    const [nx, ny] = points[(i + 1) % n]!;
    const [x, y] = points[i]!;
    const len = Math.hypot(nx - px, ny - py) || 1;
    out.push(x - ((ny - py) / len) * offset, y + ((nx - px) / len) * offset);
  }
  return out;
}

export function trackPoints(track: Track): Point[] {
  return track.xs.map((x, i) => [x, track.ys[i]!]);
}

export interface EdgeRun {
  drop: boolean;
  indices: number[];
  closed: boolean;
}

export function edgeRuns(track: Track): EdgeRun[] {
  const n = track.xs.length;
  const flags = track.cum.slice(0, n).map((s) => dropAt(track, s));
  const start = flags.findIndex((f, i) => f !== flags[(i - 1 + n) % n]);
  if (start < 0) return [{ drop: flags[0] ?? false, indices: [...Array(n).keys()], closed: true }];
  const runs: EdgeRun[] = [];
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    const last = runs[runs.length - 1];
    if (last && last.drop === flags[i]) {
      last.indices.push(i);
      continue;
    }
    last?.indices.push(i);
    runs.push({ drop: flags[i]!, indices: [i], closed: false });
  }
  runs[runs.length - 1]!.indices.push(start);
  return runs;
}

export function pick(loop: number[], indices: number[]): number[] {
  const out: number[] = [];
  for (const i of indices) out.push(loop[i * 2]!, loop[i * 2 + 1]!);
  return out;
}

export function acrossTrack(track: Track, s: number, offset: number): Point {
  const [x, y, a] = pointAt(track, s);
  return [x - Math.sin(a) * offset, y + Math.cos(a) * offset];
}
