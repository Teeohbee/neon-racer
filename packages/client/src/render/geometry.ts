import type { Point, Track } from "@neon/sim";

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
