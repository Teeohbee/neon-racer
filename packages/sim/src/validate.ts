import { ovalPoints, smoothLoop, TRACK_WIDTH, WORLD, type Point } from "./track";

export type TrackProblem = "too-few-points" | "too-short" | "too-tight" | "overlapping" | "out-of-bounds";

const MIN_RAW_POINTS = 10;
const MIN_LENGTH = 6000;
const MIN_RADIUS = 80;
const CURVE_WINDOW = 4;
const OVERLAP_GAP = TRACK_WIDTH * 1.1;
const OVERLAP_ARC = TRACK_WIDTH * 3;

function loopLength(points: Point[]): number {
  return points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length]!;
    return sum + Math.hypot(q[0] - p[0], q[1] - p[1]);
  }, 0);
}

function heading(a: Point, b: Point): number {
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}

function isTooTight(points: Point[], spacing: number): boolean {
  const n = points.length;
  const at = (i: number) => points[((i % n) + n) % n]!;
  for (let i = 0; i < n; i++) {
    let turn = Math.abs(heading(at(i), at(i + CURVE_WINDOW)) - heading(at(i - CURVE_WINDOW), at(i)));
    if (turn > Math.PI) turn = Math.PI * 2 - turn;
    if (turn > 0 && (CURVE_WINDOW * spacing) / turn < MIN_RADIUS) return true;
  }
  return false;
}

function isOverlapping(points: Point[], spacing: number): boolean {
  const n = points.length;
  const minSteps = Math.ceil(OVERLAP_ARC / spacing);
  for (let i = 0; i < n; i++) {
    const [ax, ay] = points[i]!;
    for (let j = i + minSteps + 1; j < n; j++) {
      if (n - (j - i) <= minSteps) break;
      const dx = points[j]![0] - ax;
      if (dx >= OVERLAP_GAP || dx <= -OVERLAP_GAP) continue;
      const dy = points[j]![1] - ay;
      if (dy >= OVERLAP_GAP || dy <= -OVERLAP_GAP) continue;
      if (dx * dx + dy * dy < OVERLAP_GAP * OVERLAP_GAP) return true;
    }
  }
  return false;
}

function isOutOfBounds(points: Point[]): boolean {
  const half = TRACK_WIDTH / 2;
  return points.some(([x, y]) => x < half || y < half || x > WORLD.width - half || y > WORLD.height - half);
}

export function validateDrawing(raw: Point[]): TrackProblem[] {
  const points = smoothLoop(raw);
  if (raw.length < MIN_RAW_POINTS || points.length < 3) return ["too-few-points"];
  const length = loopLength(points);
  const spacing = length / points.length;
  const problems: TrackProblem[] = [];
  if (length < MIN_LENGTH) problems.push("too-short");
  if (isTooTight(points, spacing)) problems.push("too-tight");
  if (isOverlapping(points, spacing)) problems.push("overlapping");
  if (isOutOfBounds(points)) problems.push("out-of-bounds");
  return problems;
}

const DESCRIPTIONS: Record<TrackProblem, string> = {
  "too-few-points": "Keep drawing - that's not enough of a track yet",
  "too-short": "Track is too short - draw a bigger loop",
  "too-tight": "A bend is too tight - smooth out the sharp corners",
  overlapping: "The road crosses or runs too close to itself - spread it out",
  "out-of-bounds": "The track runs off the edge - keep it inside the arena",
};

export function describeProblem(problem: TrackProblem): string {
  return DESCRIPTIONS[problem];
}

const RANDOM_ATTEMPTS = 50;
const RANDOM_SAMPLES = 160;
const HARMONICS = [2, 3, 4, 5];

function randomLoop(rng: () => number): Point[] {
  const cx = WORLD.width / 2;
  const cy = WORLD.height / 2;
  const rx = cx - TRACK_WIDTH * 1.5;
  const ry = cy - TRACK_WIDTH * 1.5;
  const waves = HARMONICS.map((k) => ({ k, amp: (rng() * 0.6) / (k - 1), phase: rng() * Math.PI * 2 }));
  const spin = rng() * Math.PI * 2;
  const radii = Array.from({ length: RANDOM_SAMPLES }, (_, i) => {
    const t = (i / RANDOM_SAMPLES) * Math.PI * 2;
    return 1 + waves.reduce((sum, w) => sum + w.amp * Math.cos(w.k * t + w.phase), 0);
  });
  const peak = Math.max(...radii);
  return radii.map((r, i) => {
    const t = (i / RANDOM_SAMPLES) * Math.PI * 2 + spin;
    return [cx + Math.cos(t) * (r / peak) * rx, cy + Math.sin(t) * (r / peak) * ry];
  });
}

export function randomTrackPoints(rng: () => number): Point[] {
  for (let attempt = 0; attempt < RANDOM_ATTEMPTS; attempt++) {
    const points = randomLoop(rng);
    if (validateDrawing(points).length === 0) return points;
  }
  return ovalPoints(WORLD.width / 2, WORLD.height / 2, WORLD.width * 0.35, WORLD.height * 0.35);
}
