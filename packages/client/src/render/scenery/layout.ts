import { pointAt, TRACK_WIDTH, WORLD, type Track } from "@neon/sim";
import { gapRuns, type GapSample } from "../features";
import type { District } from "./districts";
import { buildField, type Field } from "./field";
import { pickOne, range, seeded, type Rng } from "./rng";

const HALF = TRACK_WIDTH / 2;
const MARGIN = 900;
const LAMP_OFFSET = 95;
const NEAR_TRACK_SHARE = 0.7;
const PYLON_OFFSET = 300;
const PYLON_STEP = 460;

export type ClutterKind = "ac" | "vent" | "block" | "dish";

export interface Plate {
  x: number;
  y: number;
  w: number;
  h: number;
  tint: number;
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

export interface Layout {
  plates: Plate[];
  lamps: Lamp[];
  billboards: Billboard[];
  clutter: Clutter[];
  helipads: Prop[];
  blinkers: Prop[];
  pylons: Prop[];
  cables: [number, number][];
  gaps: GapSample[][];
}

function plates(rng: Rng, district: District): Plate[] {
  const out: Plate[] = [];
  const split = (x: number, y: number, w: number, h: number, depth: number) => {
    if (depth > 7 || (w < 900 && h < 900 && rng() < 0.4) || (w < 380 && h < 380)) {
      out.push({ x, y, w, h, tint: pickOne(rng, district.deck.tints) });
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

function scatter(rng: Rng, track: Track, field: Field, count: number, clearance: number, gapMargin: number, tries = count * 12): Prop[] {
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
  let side = 1;
  for (let s = 0; s < track.length; s += district.props.lampSpacing) {
    side = -side;
    const [x, y, a] = pointAt(track, s);
    const lx = x - Math.sin(a) * side * (HALF + LAMP_OFFSET);
    const ly = y + Math.cos(a) * side * (HALF + LAMP_OFFSET);
    if (field.edgeDistance(lx, ly) < LAMP_OFFSET - 8 || field.nearGap(lx, ly, 80)) continue;
    out.push({ x: lx, y: ly, angle: Math.atan2(y - ly, x - lx), phase: 0, color: district.lamp });
  }
  return out;
}

function pylonLine(track: Track, field: Field): { pylons: Prop[]; cables: [number, number][] } {
  const pylons: Prop[] = [];
  const cables: [number, number][] = [];
  const clearOfRoad = (ax: number, ay: number, bx: number, by: number) => {
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
      if (field.edgeDistance(x, y) < PYLON_OFFSET - 20 || field.nearGap(x, y, 160)) {
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
  const { pylons, cables } = district.props.pylons ? pylonLine(track, field) : { pylons: [], cables: [] };
  return {
    plates: plates(rng, district),
    lamps: lamps(track, field, district),
    billboards: scatter(rng, track, field, district.props.billboards, 300, 160).map((p) => ({
      ...p,
      w: range(rng, 180, 260),
      h: range(rng, 60, 90),
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
  };
}
