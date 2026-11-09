export type Point = [number, number];

export const TRACK_WIDTH = 150;
export const WORLD = { width: 6400, height: 4000 };
const SPACING = 20;

export type FeatureSpec = { kind: "drop"; at: Point; span: number } | { kind: "boost"; at: Point } | { kind: "bridge"; at: Point; span: number };

export const BOOST_LENGTH = 160;
const FALL_MARGIN = 8;

export interface Track {
  xs: number[];
  ys: number[];
  cum: number[];
  length: number;
  drops: [from: number, to: number][];
  boosts: number[];
  bridges: [from: number, to: number][];
}

export interface Crossing {
  x: number;
  y: number;
  a: number;
  b: number;
  angle: number;
}

export function ovalPoints(cx: number, cy: number, rx: number, ry: number, n = 96): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return [cx + Math.cos(t) * rx, cy + Math.sin(t) * ry];
  });
}

function dedupe(points: Point[], minGap: number): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= minGap) out.push(p);
  }
  return out;
}

function chaikinClosed(points: Point[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
    out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  return out;
}

function resampleClosed(points: Point[], spacing: number): Point[] {
  const segLengths = points.map((p, i) => {
    const q = points[(i + 1) % points.length]!;
    return Math.hypot(q[0] - p[0], q[1] - p[1]);
  });
  const total = segLengths.reduce((a, b) => a + b, 0);
  const count = Math.max(3, Math.round(total / spacing));
  const step = total / count;
  const out: Point[] = [];
  let seg = 0;
  let segStart = 0;
  for (let k = 0; k < count; k++) {
    const target = k * step;
    while (segStart + segLengths[seg]! < target) segStart += segLengths[seg++]!;
    const a = points[seg]!;
    const b = points[(seg + 1) % points.length]!;
    const t = segLengths[seg]! > 0 ? (target - segStart) / segLengths[seg]! : 0;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

function trimOvershoot(points: Point[]): Point[] {
  if (points.length < 10) return points;
  const [sx, sy] = points[0]!;
  let best = points.length - 1;
  let bestDist = Infinity;
  for (let i = Math.floor(points.length * 0.6); i < points.length; i++) {
    const d = Math.hypot(points[i]![0] - sx, points[i]![1] - sy);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return bestDist < TRACK_WIDTH * 1.5 ? points.slice(0, best + 1) : points;
}

function averageClosed(points: Point[], radius: number): Point[] {
  const n = points.length;
  return points.map((_, i) => {
    let x = 0;
    let y = 0;
    for (let k = -radius; k <= radius; k++) {
      const p = points[(i + k + n) % n]!;
      x += p[0];
      y += p[1];
    }
    return [x / (radius * 2 + 1), y / (radius * 2 + 1)];
  });
}

export function smoothLoop(raw: Point[]): Point[] {
  let points = trimOvershoot(dedupe(raw, 6));
  if (points.length < 3) return points;
  points = resampleClosed(points, SPACING * 2);
  if (points.length >= 12) for (let i = 0; i < 2; i++) points = averageClosed(points, 2);
  for (let i = 0; i < 3; i++) points = chaikinClosed(points);
  return resampleClosed(points, SPACING);
}

export function buildTrack(raw: Point[], features: FeatureSpec[] = []): Track {
  const points = smoothLoop(raw);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const cum = [0];
  for (let i = 1; i <= xs.length; i++) {
    const j = i % xs.length;
    cum.push(cum[i - 1]! + Math.hypot(xs[j]! - xs[i - 1]!, ys[j]! - ys[i - 1]!));
  }
  const length = cum.pop()!;
  const track: Track = { xs, ys, cum, length, drops: [], boosts: [], bridges: [] };
  const wrap = (v: number) => ((v % length) + length) % length;
  const passes = features.some((f) => f.kind === "bridge") ? crossings(track).flatMap((c) => [c.a, c.b]) : [];
  for (const f of features) {
    const s = nearestOnTrack(track, f.at[0], f.at[1]).s;
    if (f.kind === "drop") track.drops.push([wrap(s - f.span / 2), wrap(s + f.span / 2)]);
    else if (f.kind === "boost") track.boosts.push(s);
    else {
      const centre = passes.reduce<number | null>((best, p) => (best === null || arcGap(p, s, length) < arcGap(best, s, length) ? p : best), null) ?? s;
      track.bridges.push([wrap(centre - f.span / 2), wrap(centre + f.span / 2)]);
    }
  }
  return track;
}

const arcGap = (a: number, b: number, length: number) => {
  const d = (((a - b) % length) + length) % length;
  return Math.min(d, length - d);
};

export function crossings(track: Track): Crossing[] {
  const { xs, ys, cum } = track;
  const n = xs.length;
  const found: Crossing[] = [];
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    const [ax, ay, bx, by] = [xs[i]!, ys[i]!, xs[i2]!, ys[i2]!];
    for (let j = i + 2; j < n; j++) {
      const j2 = (j + 1) % n;
      if (j2 === i) continue;
      const [cx, cy, dx, dy] = [xs[j]!, ys[j]!, xs[j2]!, ys[j2]!];
      const rx = bx - ax;
      const ry = by - ay;
      const sx = dx - cx;
      const sy = dy - cy;
      const den = rx * sy - ry * sx;
      if (den === 0) continue;
      const t = ((cx - ax) * sy - (cy - ay) * sx) / den;
      const u = ((cx - ax) * ry - (cy - ay) * rx) / den;
      if (t < 0 || t >= 1 || u < 0 || u >= 1) continue;
      const cos = Math.abs(rx * sx + ry * sy) / (Math.hypot(rx, ry) * Math.hypot(sx, sy));
      found.push({ x: ax + rx * t, y: ay + ry * t, a: cum[i]! + Math.hypot(rx, ry) * t, b: cum[j]! + Math.hypot(sx, sy) * u, angle: Math.acos(Math.min(1, cos)) });
    }
  }
  return found;
}

const forwardGap = (from: number, to: number, length: number) => (((to - from) % length) + length) % length;

export function dropAt(track: Track, s: number): boolean {
  return track.drops.some(([from, to]) => forwardGap(from, s, track.length) <= forwardGap(from, to, track.length));
}

export function bridgeAt(track: Track, s: number): boolean {
  return track.bridges.some(([from, to]) => forwardGap(from, s, track.length) <= forwardGap(from, to, track.length));
}

export function boostAt(track: Track, s: number): boolean {
  return track.boosts.some((c) => {
    const d = forwardGap(c, s, track.length);
    return Math.min(d, track.length - d) <= BOOST_LENGTH / 2;
  });
}

export function fellOff(track: Track, x: number, y: number): boolean {
  return fellOffAt(track, nearestOnTrack(track, x, y));
}

export function fellOffAt(track: Track, at: Projection): boolean {
  return at.dist > TRACK_WIDTH / 2 + FALL_MARGIN && dropAt(track, at.s);
}

export interface Projection {
  dist: number;
  s: number;
  tx: number;
  ty: number;
}

const LOCAL_WINDOW = 400;

export function nearestOnTrack(track: Track, x: number, y: number, near?: number): Projection {
  const n = track.xs.length;
  if (near !== undefined) {
    const span = Math.ceil(LOCAL_WINDOW / (track.length / n)) + 1;
    const centre = segmentAt(track, near);
    const local = nearestAmong(track, x, y, centre - span, centre + span);
    if (local.dist <= TRACK_WIDTH) return local;
  }
  return nearestAmong(track, x, y, 0, n - 1);
}

function segmentAt(track: Track, s: number): number {
  const target = ((s % track.length) + track.length) % track.length;
  let lo = 0;
  let hi = track.cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (track.cum[mid]! <= target) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function nearestAmong(track: Track, x: number, y: number, first: number, last: number): Projection {
  const n = track.xs.length;
  let best: Projection = { dist: Infinity, s: 0, tx: 1, ty: 0 };
  for (let k = first; k <= last; k++) {
    const i = ((k % n) + n) % n;
    const ax = track.xs[i]!;
    const ay = track.ys[i]!;
    const j = (i + 1) % n;
    const dx = track.xs[j]! - ax;
    const dy = track.ys[j]! - ay;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    const px = ax + dx * t;
    const py = ay + dy * t;
    const dist = Math.hypot(x - px, y - py);
    if (dist < best.dist) {
      const len = Math.sqrt(len2);
      best = { dist, s: track.cum[i]! + len * t, tx: dx / len, ty: dy / len };
    }
  }
  return best;
}

export function isOnRoad(track: Track, x: number, y: number): boolean {
  return nearestOnTrack(track, x, y).dist <= TRACK_WIDTH / 2;
}

export function pointAt(track: Track, s: number): [x: number, y: number, angle: number] {
  const n = track.xs.length;
  const wrapped = ((s % track.length) + track.length) % track.length;
  let i = 0;
  while (i < n - 1 && track.cum[i + 1]! <= wrapped) i++;
  const j = (i + 1) % n;
  const segLen = (i === n - 1 ? track.length : track.cum[j]!) - track.cum[i]!;
  const t = segLen > 0 ? (wrapped - track.cum[i]!) / segLen : 0;
  const ax = track.xs[i]!;
  const ay = track.ys[i]!;
  const bx = track.xs[j]!;
  const by = track.ys[j]!;
  return [ax + (bx - ax) * t, ay + (by - ay) * t, Math.atan2(by - ay, bx - ax)];
}

export interface ProgressState {
  s: number;
  progress: number;
}

export function advanceProgress(prev: ProgressState, s: number, length: number, maxStep: number): ProgressState {
  let delta = s - prev.s;
  if (delta < -length / 2) delta += length;
  if (delta > length / 2) delta -= length;
  return { s, progress: Math.abs(delta) > maxStep ? prev.progress : prev.progress + delta };
}

export interface GridSlot {
  x: number;
  y: number;
  angle: number;
  s: number;
  back: number;
}

export function gridSlots(track: Track, count: number, anchor = 0): GridSlot[] {
  return Array.from({ length: count }, (_, k) => {
    const row = Math.floor(k / 2);
    const side = k % 2 === 0 ? -1 : 1;
    const back = -60 - row * 70 - (side > 0 ? 25 : 0);
    const s = (((anchor + back) % track.length) + track.length) % track.length;
    const [x, y, angle] = pointAt(track, s);
    const lateral = side * TRACK_WIDTH * 0.22;
    return { x: x - Math.sin(angle) * lateral, y: y + Math.cos(angle) * lateral, angle, s, back };
  });
}
