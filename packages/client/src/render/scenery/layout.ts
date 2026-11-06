import { pointAt, TRACK_WIDTH, WORLD, type Track } from "@neon/sim";
import { gapRuns, type GapSample } from "../features";
import type { District } from "./districts";
import { buildField, type Field } from "./field";
import { pickOne, range, seeded, type Rng } from "./rng";

const HALF = TRACK_WIDTH / 2;
const MARGIN = 900;
const LAMP_OFFSET = 95;
const NEAR_TRACK_SHARE = 0.8;
const ROOF_CLEAR = 70;
const ROOF_LIT_SHARE = 0.7;
const SKYLIGHT_SHARE = 0.55;
const PENTHOUSE_SHARE = 0.4;
const PYLON_OFFSET = 430;
const PYLON_STEP = 380;
const DEFAULT_BLOCK = { leaf: 640, min: 280, stop: 0.45, inset: [12, 34] as [number, number] };

export type ClutterKind = "ac" | "vent" | "block" | "dish";

export interface Plate {
  x: number;
  y: number;
  w: number;
  h: number;
  tint: number;
}

export interface Building extends Plate {
  inner: Plate | null;
}

export interface Prop {
  x: number;
  y: number;
  angle: number;
  phase: number;
}

export interface Clutter extends Prop {
  kind: ClutterKind;
  size: number;
}

export interface Billboard extends Prop {
  w: number;
  h: number;
  color: number;
}

export interface Lamp extends Prop {
  color: number;
}

export interface Yard {
  x: number;
  y: number;
  angle: number;
  w: number;
  h: number;
  boxes: [number, number][];
  nodes: [number, number][];
}

export interface Layout {
  plates: Building[];
  roofLines: number[];
  skylights: Plate[];
  yards: Yard[];
  lamps: Lamp[];
  billboards: Billboard[];
  clutter: Clutter[];
  helipads: Prop[];
  blinkers: Prop[];
  pylons: Prop[];
  cables: [number, number][];
  gaps: GapSample[][];
  field: Field;
}

function plates(rng: Rng, district: District): Building[] {
  const out: Building[] = [];
  const split = (x: number, y: number, w: number, h: number, depth: number) => {
    const block = district.block ?? DEFAULT_BLOCK;
    if (depth > 11 || (w < block.leaf && h < block.leaf && rng() < block.stop) || (w < block.min && h < block.min)) {
      const inset = range(rng, block.inset[0], block.inset[1]);
      const bx = x + inset;
      const by = y + inset;
      const bw = w - inset * 2;
      const bh = h - inset * 2;
      const tint = pickOne(rng, district.deck.tints);
      const inner =
        rng() < PENTHOUSE_SHARE
          ? { x: bx + bw * range(rng, 0.15, 0.4), y: by + bh * range(rng, 0.15, 0.4), w: bw * range(rng, 0.3, 0.45), h: bh * range(rng, 0.3, 0.45), tint: pickOne(rng, district.deck.tints) }
          : null;
      out.push({ x: bx, y: by, w: bw, h: bh, tint, inner });
      return;
    }
    if (w > h) {
      const cut = Math.round(range(rng, 0.3, 0.7) * w);
      split(x, y, cut, h, depth + 1);
      split(x + cut, y, w - cut, h, depth + 1);
    } else {
      const cut = Math.round(range(rng, 0.3, 0.7) * h);
      split(x, y, w, cut, depth + 1);
      split(x, y + cut, w, h - cut, depth + 1);
    }
  };
  split(-MARGIN, -MARGIN, WORLD.width + MARGIN * 2, WORLD.height + MARGIN * 2, 0);
  return out;
}

function roofDetails(rng: Rng, field: Field, list: Plate[]): { roofLines: number[]; skylights: Plate[] } {
  const roofLines: number[] = [];
  const skylights: Plate[] = [];
  const clear = (x: number, y: number) => field.edgeDistance(x, y) > ROOF_CLEAR && !field.nearGap(x, y, 30);
  for (const p of list) {
    if (rng() < ROOF_LIT_SHARE) {
      const inset = 6;
      const corners: [number, number][] = [
        [p.x + inset, p.y + inset],
        [p.x + p.w - inset, p.y + inset],
        [p.x + p.w - inset, p.y + p.h - inset],
        [p.x + inset, p.y + p.h - inset],
      ];
      for (let k = 0; k < 4; k++) {
        const [ax, ay] = corners[k]!;
        const [bx, by] = corners[(k + 1) % 4]!;
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 60));
        for (let j = 0; j < steps; j++) {
          const x0 = ax + ((bx - ax) * j) / steps;
          const y0 = ay + ((by - ay) * j) / steps;
          const x1 = ax + ((bx - ax) * (j + 1)) / steps;
          const y1 = ay + ((by - ay) * (j + 1)) / steps;
          if (clear(x0, y0) && clear(x1, y1)) roofLines.push(x0, y0, x1, y1);
        }
      }
    }
    if (rng() < SKYLIGHT_SHARE && p.w > 200 && p.h > 200) {
      const cols = Math.floor(range(rng, 2, Math.min(9, p.w / 50)));
      const rows = Math.floor(range(rng, 2, Math.min(6, p.h / 40)));
      const cx = p.x + range(rng, 0.3, 0.7) * p.w;
      const cy = p.y + range(rng, 0.3, 0.7) * p.h;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = cx + (i - cols / 2) * 36;
          const y = cy + (j - rows / 2) * 26;
          if (rng() < 0.35) continue;
          if (clear(x, y) && clear(x + 26, y + 16)) skylights.push({ x, y, w: 26, h: 16, tint: rng() });
        }
      }
    }
  }
  return { roofLines, skylights };
}

function yards(rng: Rng, track: Track, field: Field, count: number): Yard[] {
  return scatter(rng, track, field, count, 230, 140).map((p) => {
    const w = range(rng, 220, 320);
    const h = range(rng, 140, 200);
    const c = Math.cos(p.angle);
    const s = Math.sin(p.angle);
    const at = (u: number, v: number): [number, number] => [p.x + c * u - s * v, p.y + s * u + c * v];
    const boxes: [number, number][] = [];
    const nodes: [number, number][] = [];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        if (rng() < 0.2) continue;
        const u = (i - 1) * (w / 3.2);
        const v = (j - 0.5) * (h / 2.2);
        boxes.push(at(u, v));
        for (let f = -1; f <= 1; f++) nodes.push(at(u + f * 12, v - 24));
      }
    }
    return { x: p.x, y: p.y, angle: p.angle, w, h, boxes, nodes };
  });
}

export function scatter(rng: Rng, track: Track, field: Field, count: number, clearance: number, gapMargin: number, tries = count * 12): Prop[] {
  const out: Prop[] = [];
  for (let k = 0; k < tries && out.length < count; k++) {
    let x = range(rng, -300, WORLD.width + 300);
    let y = range(rng, -300, WORLD.height + 300);
    if (rng() < NEAR_TRACK_SHARE) {
      const [cx, cy, a] = pointAt(track, rng() * track.length);
      const off = (rng() < 0.5 ? -1 : 1) * (HALF + clearance + range(rng, 0, 380));
      x = cx - Math.sin(a) * off;
      y = cy + Math.cos(a) * off;
    }
    if (field.edgeDistance(x, y) < clearance || field.nearGap(x, y, gapMargin)) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.y - y) < clearance * 0.8)) continue;
    out.push({ x, y, angle: rng() * Math.PI * 2, phase: rng() });
  }
  return out;
}

function lamps(track: Track, field: Field, district: District): Lamp[] {
  const out: Lamp[] = [];
  let k = 0;
  for (let s = 0; s < track.length; s += district.props.lampSpacing / 2) {
    const side = k++ % 2 ? 1 : -1;
    const [x, y, a] = pointAt(track, s);
    const lx = x - Math.sin(a) * side * (HALF + LAMP_OFFSET);
    const ly = y + Math.cos(a) * side * (HALF + LAMP_OFFSET);
    if (field.edgeDistance(lx, ly) < LAMP_OFFSET - 8 || field.nearGap(lx, ly, 80)) continue;
    out.push({ x: lx, y: ly, angle: Math.atan2(y - ly, x - lx), phase: 0, color: district.lamp });
  }
  return out;
}

function pylonLine(track: Track, field: Field, crossing: boolean): { pylons: Prop[]; cables: [number, number][] } {
  const pylons: Prop[] = [];
  const cables: [number, number][] = [];
  const clearOfRoad = (ax: number, ay: number, bx: number, by: number) => {
    if (crossing) return Math.hypot(bx - ax, by - ay) < PYLON_STEP * 2.2;
    for (let t = 0; t <= 1; t += 0.05) if (field.edgeDistance(ax + (bx - ax) * t, ay + (by - ay) * t) < 110) return false;
    return true;
  };
  for (const side of [-1, 1]) {
    let prev = -1;
    let first = -1;
    for (let s = side > 0 ? 0 : PYLON_STEP / 2; s < track.length; s += PYLON_STEP) {
      const [cx, cy, a] = pointAt(track, s);
      const x = cx - Math.sin(a) * side * (HALF + PYLON_OFFSET);
      const y = cy + Math.cos(a) * side * (HALF + PYLON_OFFSET);
      if (field.edgeDistance(x, y) < PYLON_OFFSET - 20 || field.nearGap(x, y, 60)) {
        prev = -1;
        continue;
      }
      pylons.push({ x, y, angle: a, phase: (s / track.length) % 1 });
      const here = pylons.length - 1;
      if (first < 0) first = here;
      if (prev >= 0 && clearOfRoad(pylons[prev]!.x, pylons[prev]!.y, x, y)) cables.push([prev, here]);
      prev = here;
    }
    if (prev >= 0 && first >= 0 && prev !== first && clearOfRoad(pylons[prev]!.x, pylons[prev]!.y, pylons[first]!.x, pylons[first]!.y)) cables.push([prev, first]);
  }
  return { pylons, cables };
}

export function buildLayout(track: Track, name: string, district: District): Layout {
  const rng = seeded(name);
  const field = buildField(track);
  const clutterKinds: ClutterKind[] = ["ac", "ac", "vent", "vent", "block", "dish"];
  const { pylons, cables } = district.props.pylons ? pylonLine(track, field, district.props.crossCables) : { pylons: [], cables: [] };
  const plateList = plates(rng, district);
  if (district.props.crossCables) {
    for (let k = 0; k < pylons.length; k++) {
      const a = pylons[k]!;
      let best = -1;
      let bestD = Infinity;
      pylons.forEach((b, j) => {
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (j !== k && d > 500 && d < 1300 && d < bestD && field.edgeDistance((a.x + b.x) / 2, (a.y + b.y) / 2) < 60) {
          best = j;
          bestD = d;
        }
      });
      if (best > k && rng() < 0.6) cables.push([k, best]);
    }
  }
  return {
    plates: plateList,
    ...roofDetails(rng, field, plateList),
    yards: yards(rng, track, field, district.props.yards),
    lamps: lamps(track, field, district),
    billboards: scatter(rng, track, field, district.props.billboards, 300, 160).map((p) => ({
      ...p,
      w: range(rng, 240, 340),
      h: range(rng, 80, 120),
      color: pickOne(rng, district.accents),
    })),
    clutter: scatter(rng, track, field, district.props.clutter, 150, 60).map((p) => ({
      ...p,
      angle: Math.round(p.angle / (Math.PI / 2)) * (Math.PI / 2),
      kind: pickOne(rng, clutterKinds),
      size: range(rng, 0.8, 1.4),
    })),
    helipads: scatter(rng, track, field, district.props.helipads, 320, 160),
    blinkers: scatter(rng, track, field, district.props.blinkers, 160, 40),
    pylons,
    cables,
    gaps: gapRuns(track),
    field,
  };
}
