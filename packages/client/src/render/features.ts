import { Graphics, type Texture } from "pixi.js";
import { BOOST_LENGTH, pointAt, TRACK_WIDTH, type Track } from "@neon/sim";
import { acrossTrack, edgeRuns, flat, offsetLoop, pick, trackPoints } from "./geometry";
import { FEATURE, UI } from "./palette";

const HALF = TRACK_WIDTH / 2;
const VOID_DEPTH = 300;
const VOID_TAPER = 260;
const TRACK_SPACING = 20;
const STRIPE_DEPTH = 14;
export const CHEVRONS = 4;
const CHEVRON_STEP = BOOST_LENGTH / CHEVRONS;
const DANGER_OVERHANG = 70;
const WAKE_STEPS = 6;
const WAKE_STEP = 45;

export function drawTrackSurface(g: Graphics, track: Track, grain: Texture, grainAlpha: number) {
  g.clear();
  const loop = flat(trackPoints(track));
  g.poly(loop, true).stroke({ width: TRACK_WIDTH, color: UI.road, join: "round" });
  g.poly(loop, true).stroke({ width: TRACK_WIDTH, texture: grain, textureSpace: "global", alpha: grainAlpha, join: "round" });
  for (const c of track.boosts) {
    const left: number[] = [];
    const right: number[] = [];
    for (let s = c - BOOST_LENGTH / 2; s <= c + BOOST_LENGTH / 2 + 0.1; s += BOOST_LENGTH / 8) {
      left.push(...acrossTrack(track, s, -HALF));
      right.unshift(...acrossTrack(track, s, HALF));
    }
    g.poly([...left, ...right], true).fill({ color: FEATURE.boostBase, alpha: 0.5 });
  }
}

function voidDepth(m: number, count: number, closed: boolean): number {
  if (closed) return VOID_DEPTH;
  const ramp = Math.min(1, (Math.min(m, count - 1 - m) * TRACK_SPACING) / VOID_TAPER);
  return VOID_DEPTH * ramp * ramp * (3 - 2 * ramp);
}

export interface GapSample {
  x: number;
  y: number;
  nx: number;
  ny: number;
  depth: number;
  sides: [left: number, right: number];
}

export const sideDepth = (p: GapSample, side: number) => p.sides[side < 0 ? 0 : 1];

const CURVE_SPAN = 3;
const CURVE_SMOOTH = 4;
const APEX_CLEARANCE = 40;

export function gapRuns(track: Track): GapSample[][] {
  const points = trackPoints(track);
  const n = points.length;
  const normals = offsetLoop(points, 1).map((v, i) => v - points[i >> 1]![i & 1]!);
  const turn = points.map((_, i) => {
    const [ax, ay] = points[(i - CURVE_SPAN + n) % n]!;
    const [bx, by] = points[i]!;
    const [cx, cy] = points[(i + CURVE_SPAN) % n]!;
    const d = Math.atan2(cy - by, cx - bx) - Math.atan2(by - ay, bx - ax);
    return Math.atan2(Math.sin(d), Math.cos(d)) / (CURVE_SPAN * TRACK_SPACING);
  });
  const capFor = (i: number, side: number) => {
    let cap = Infinity;
    for (let k = -CURVE_SMOOTH; k <= CURVE_SMOOTH; k++) {
      const c = turn[(i + k + n) % n]!;
      if (Math.sign(c) === side && c !== 0) cap = Math.min(cap, 1 / Math.abs(c) - HALF - APEX_CLEARANCE);
    }
    return Math.max(0, cap);
  };
  return edgeRuns(track)
    .filter((run) => run.drop)
    .map((run) =>
      run.indices.map((i, m) => {
        const depth = voidDepth(m, run.indices.length, run.closed);
        return {
          x: points[i]![0],
          y: points[i]![1],
          nx: normals[i * 2]!,
          ny: normals[i * 2 + 1]!,
          depth,
          sides: [Math.min(depth, capFor(i, -1)), Math.min(depth, capFor(i, 1))] as [number, number],
        };
      }),
    );
}

export function gapQuads(run: GapSample[], near: (p: GapSample) => number, far: (p: GapSample) => number): number[][] {
  const at = (p: GapSample, offset: number) => [p.x + p.nx * offset, p.y + p.ny * offset];
  const quads: number[][] = [];
  for (let m = 0; m + 1 < run.length; m++) {
    const a = run[m]!;
    const b = run[m + 1]!;
    quads.push([...at(a, near(a)), ...at(b, near(b)), ...at(b, far(b)), ...at(a, far(a))]);
  }
  return quads;
}

export function drawVoid(g: Graphics, track: Track) {
  g.clear();
  const points = trackPoints(track);
  const normals = offsetLoop(points, 1).map((v, i) => v - points[i >> 1]![i & 1]!);
  for (const run of edgeRuns(track)) {
    if (!run.drop) continue;
    const count = run.indices.length;
    for (const side of [-1, 1]) {
      const at = (m: number, offset: number): [number, number] => {
        const i = run.indices[m]!;
        const [x, y] = points[i]!;
        return [x + normals[i * 2]! * side * offset, y + normals[i * 2 + 1]! * side * offset];
      };
      for (const [from, to, alpha] of [[0, 1, 1], [1, 1.25, 0.5], [1.25, 1.45, 0.22]] as const) {
        for (let m = 0; m + 1 < count; m++) {
          const d0 = voidDepth(m, count, run.closed);
          const d1 = voidDepth(m + 1, count, run.closed);
          g.poly([...at(m, HALF + d0 * from), ...at(m + 1, HALF + d1 * from), ...at(m + 1, HALF + d1 * to), ...at(m, HALF + d0 * to)], true);
        }
        g.fill({ color: FEATURE.void, alpha });
      }
      [16, 38, 70, 115, 175].forEach((depth, k) => {
        const line: number[] = [];
        for (let m = 0; m < count; m++) if (voidDepth(m, count, run.closed) > depth + 10) line.push(...at(m, HALF + depth));
        if (line.length > 2) g.poly(line, false).stroke({ width: 3, color: FEATURE.cliff, alpha: 0.9 - k * 0.17, join: "round" });
      });
    }
  }
}

export function drawTrackEdges(g: Graphics, track: Track, neon: readonly [number, number] = [UI.edgeLeft, UI.edgeRight]) {
  g.clear();
  const points = trackPoints(track);
  const edges = [offsetLoop(points, -HALF), offsetLoop(points, HALF)];
  const inner = [offsetLoop(points, -(HALF - STRIPE_DEPTH)), offsetLoop(points, HALF - STRIPE_DEPTH)];
  for (const run of edgeRuns(track)) {
    edges.forEach((edge, k) => {
      const line = pick(edge, run.indices);
      const color = run.drop ? FEATURE.dropEdge : neon[k]!;
      const width = run.drop ? 6 : 4;
      g.poly(line, run.closed).stroke({ width: width * 4, color, alpha: run.drop ? 0.28 : 0.16, join: "round" });
      g.poly(line, run.closed).stroke({ width, color, join: "round" });
      if (!run.drop) return;
      const ins = inner[k]!;
      for (let m = 0; m + 2 < run.indices.length; m += 2) {
        const a = run.indices[m]!;
        const b = run.indices[m + 1]!;
        const c = run.indices[m + 2]!;
        g.poly([edge[a * 2]!, edge[a * 2 + 1]!, edge[b * 2]!, edge[b * 2 + 1]!, ins[c * 2]!, ins[c * 2 + 1]!, ins[b * 2]!, ins[b * 2 + 1]!], true).fill({
          color: FEATURE.dropStripe,
          alpha: 0.9,
        });
      }
    });
  }
}

export function drawBoostChevrons(layers: Graphics[], track: Track) {
  for (const g of layers) g.clear();
  for (const c of track.boosts) {
    layers.forEach((g, k) => {
      const back = c - BOOST_LENGTH / 2 + k * CHEVRON_STEP + 4;
      const tip = back + CHEVRON_STEP * 0.75;
      const [tx, ty] = pointAt(track, tip);
      const path = [...acrossTrack(track, back, -(HALF - 12)), tx, ty, ...acrossTrack(track, back, HALF - 12)];
      g.poly(path, false).stroke({ width: 9, color: FEATURE.boost, join: "miter", cap: "round" });
      g.poly(path, false).stroke({ width: 3, color: FEATURE.boostCore, join: "miter", cap: "round" });
    });
  }
}

export function chevronAlpha(k: number, t: number): number {
  const phase = (((t * 1.6 - k / CHEVRONS) % 1) + 1) % 1;
  return 0.3 + 0.7 * (1 - phase) * (1 - phase);
}

export function drawDangerLine(g: Graphics, track: Track | null, s: number | null | undefined, t: number) {
  g.clear();
  if (!track || s === null || s === undefined) return;
  const pulse = 0.75 + 0.25 * Math.sin(t * 9);
  for (let k = 0; k < WAKE_STEPS; k++) {
    const s0 = s - k * WAKE_STEP;
    const s1 = s0 - WAKE_STEP;
    const w = HALF + 20;
    g.poly([...acrossTrack(track, s0, -w), ...acrossTrack(track, s0, w), ...acrossTrack(track, s1, w), ...acrossTrack(track, s1, -w)], true).fill({
      color: FEATURE.danger,
      alpha: 0.2 * (1 - k / WAKE_STEPS) * pulse,
    });
  }
  const half = HALF + DANGER_OVERHANG;
  const [ax, ay] = acrossTrack(track, s, -half);
  const [bx, by] = acrossTrack(track, s, half);
  g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 26, color: FEATURE.danger, alpha: 0.25 * pulse, cap: "round" });
  g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 8, color: FEATURE.danger, cap: "round" });
  g.moveTo(ax, ay).lineTo(bx, by).stroke({ width: 2.5, color: FEATURE.dangerCore, alpha: pulse });
  for (let i = 0; i < 3; i++) {
    const u = (t * 0.9 + i / 3) % 1;
    const x = ax + (bx - ax) * u;
    const y = ay + (by - ay) * u;
    g.circle(x, y, 5).fill({ color: FEATURE.dangerCore, alpha: Math.sin(u * Math.PI) });
  }
  for (const [x, y] of [[ax, ay], [bx, by]] as const) {
    g.circle(x, y, 10).fill({ color: FEATURE.danger }).stroke({ width: 2.5, color: FEATURE.dangerCore });
  }
}
