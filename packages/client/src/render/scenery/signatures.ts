import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import { pointAt, TRACK_WIDTH, WORLD, type Track } from "@neon/sim";
import { sideDepth } from "../features";
import type { District, SignatureKind } from "./districts";
import type { Layout, Prop } from "./layout";
import { pickOne, range, type Rng } from "./rng";

const HALF = TRACK_WIDTH / 2;
const CRANE_HEIGHT = 0.14;
const SPIRE_HEIGHT = 0.18;
const STACK_HEIGHT = 0.16;
const FLOOD_HEIGHT = 0.14;
const FLOOD_SPACING = 520;
const OVAL_PULL = 1800;
const FLOOD_OFFSET = 230;
const BOARD_HEIGHT = 0.11;
const STRING_HEIGHT = 0.05;
const DECK_GLOW_CLEAR = 60;
const OPEN_CAP = 1100;
const CENTRE_BIAS = 0.15;

export interface SceneLight {
  x: number;
  y: number;
  size: number;
  color: number;
  alpha: number;
}

export interface Tower {
  x: number;
  y: number;
  height: number;
}

export interface View {
  t: number;
  dt: number;
  inView(x: number, y: number): boolean;
  lift(x: number, y: number, height: number): [number, number];
}

export interface Parts {
  deck?: Container[];
  glow?: Container[];
  live?: Container[];
  reserve?(x: number, y: number): boolean;
  lifted?: { container: Container; height: number; layer: "tall" | "glow" }[];
  towers?: Tower[];
  update?(v: View): void;
  lights?(out: SceneLight[], v: View): void;
}

export interface Spot {
  x: number;
  y: number;
  clear: number;
}

export interface Kit {
  track: Track;
  layout: Layout;
  district: District;
  rng: Rng;
  soft: Texture;
  near(count: number, clearance: number, gapMargin: number): Prop[];
  open(count: number, minSep: number, minClear: number): Spot[];
  clear(x: number, y: number, margin: number): boolean;
}

export const lighten = (c: number, amt: number) => {
  const ch = (shift: number) => Math.max(0, Math.min(255, ((c >> shift) & 255) + amt)) << shift;
  return ch(16) | ch(8) | ch(0);
};

const poly = (g: Graphics, x: number, y: number, a: number, pts: number[]) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += 2) out.push(x + c * pts[i]! - s * pts[i + 1]!, y + s * pts[i]! + c * pts[i + 1]!);
  return g.poly(out, true);
};

const rect = (g: Graphics, x: number, y: number, a: number, w: number, h: number) => poly(g, x, y, a, [-w / 2, -h / 2, w / 2, -h / 2, w / 2, h / 2, -w / 2, h / 2]);

const local = (x: number, y: number, a: number, u: number, v: number): [number, number] => [x + Math.cos(a) * u - Math.sin(a) * v, y + Math.sin(a) * u + Math.cos(a) * v];

const square = (a: number) => Math.round(a / (Math.PI / 2)) * (Math.PI / 2);

const blink = (t: number, phase: number, rate = 2.2) => (Math.sin(t * rate + phase * 6.28) > 0.4 ? 1 : 0.15);

function groupsOf(n: number): Graphics[] {
  return Array.from({ length: n }, () => new Graphics());
}

function containers(kit: Kit): Parts {
  const stacks = new Graphics();
  const leds = new Graphics();
  const palette = [0x7a3a30, 0x2a5a8a, 0x2a7a6a, 0xa06a2a, 0x6a7a3a, 0x7a3a6a];
  const spots = kit.near(24, 250, 90);
  for (const p of spots) {
    const a = square(p.angle);
    const cols = Math.floor(range(kit.rng, 3, 7));
    const rows = Math.floor(range(kit.rng, 2, 4));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const [x, y] = local(p.x, p.y, a, (j - (rows - 1) / 2) * 68, (i - (cols - 1) / 2) * 30);
        const color = pickOne(kit.rng, palette);
        rect(stacks, x, y, a, 64, 26).fill({ color }).stroke({ width: 2, color: lighten(color, -30) });
        for (const u of [-20, 0, 20]) stacks.moveTo(...local(x, y, a, u, -12)).lineTo(...local(x, y, a, u, 12));
        stacks.stroke({ width: 1, color: lighten(color, 30), alpha: 0.6 });
        if (kit.rng() < 0.15) leds.circle(...local(x, y, a, 28, 8), 2.5);
      }
    }
  }
  leds.fill({ color: 0x40ff80 });
  return {
    deck: [stacks],
    glow: [leds],
    update: (v) => (leds.alpha = 0.5 + 0.5 * Math.sin(v.t * 3)),
    lights: (out, v) => spots.forEach((p) => v.inView(p.x, p.y) && out.push({ x: p.x, y: p.y, size: 420, color: kit.district.lamp, alpha: 0.45 })),
  };
}

function cranes(kit: Kit): Parts {
  const towers: Tower[] = [];
  const beams = new Graphics();
  const blinkers = new Graphics();
  const bases: [number, number][] = [];
  for (const run of kit.layout.gaps) {
    for (let m = 6; m < run.length - 6; m += 16) {
      const p = run[m]!;
      for (const side of [-1, 1]) {
        const d = sideDepth(p, side);
        if (d < 200) continue;
        const bx = p.x + p.nx * side * (HALF + d + 70);
        const by = p.y + p.ny * side * (HALF + d + 70);
        if (kit.layout.field.edgeDistance(bx, by) < 120 || bases.some(([x, y]) => Math.hypot(x - bx, y - by) < 260)) continue;
        bases.push([bx, by]);
        const tx = -p.ny * 36;
        const ty = p.nx * 36;
        towers.push({ x: bx + tx, y: by + ty, height: CRANE_HEIGHT }, { x: bx - tx, y: by - ty, height: CRANE_HEIGHT });
        const ex = bx - p.nx * side * d * 0.5;
        const ey = by - p.ny * side * d * 0.5;
        const back = [bx + p.nx * side * 70, by + p.ny * side * 70];
        beams.moveTo(bx + tx, by + ty).lineTo(bx - tx, by - ty).moveTo(back[0]!, back[1]!).lineTo(ex, ey);
        for (let k = 1; k < 6; k++) {
          const u = k / 6;
          const mx = back[0]! + (ex - back[0]!) * u;
          const my = back[1]! + (ey - back[1]!) * u;
          beams.moveTo(mx + tx * 0.25, my + ty * 0.25).lineTo(mx - tx * 0.25, my - ty * 0.25);
        }
        blinkers.circle(ex, ey, 5).circle(bx, by, 5);
      }
    }
  }
  beams.stroke({ width: 4, color: 0x9a8040, alpha: 0.9 });
  blinkers.fill({ color: 0xff2020 });
  const top = new Container();
  top.addChild(beams);
  const glow = new Container();
  glow.addChild(blinkers);
  return {
    towers,
    lifted: [
      { container: top, height: CRANE_HEIGHT, layer: "tall" },
      { container: glow, height: CRANE_HEIGHT, layer: "glow" },
    ],
    update: (v) => (blinkers.alpha = blink(v.t, 0, 2.6)),
    lights: (out, v) => bases.forEach(([x, y]) => v.inView(x, y) && out.push({ x, y, size: 420, color: kit.district.lamp, alpha: 0.5 })),
  };
}

function warehouses(kit: Kit): Parts {
  const ridges = new Graphics();
  const strips = new Graphics();
  for (const p of kit.layout.plates) {
    if (p.w * p.h < 160000 || kit.rng() < 0.45) continue;
    const horizontal = p.w > p.h;
    const span = horizontal ? p.h : p.w;
    for (let o = 20; o < span - 10; o += 26) {
      if (horizontal) ridges.moveTo(p.x + 8, p.y + o).lineTo(p.x + p.w - 8, p.y + o);
      else ridges.moveTo(p.x + o, p.y + 8).lineTo(p.x + o, p.y + p.h - 8);
    }
    for (const f of [1 / 3, 2 / 3]) {
      const [ax, ay, bx, by] = horizontal ? [p.x + 20, p.y + p.h * f, p.x + p.w - 20, p.y + p.h * f] : [p.x + p.w * f, p.y + 20, p.x + p.w * f, p.y + p.h - 20];
      if (kit.clear(ax, ay, DECK_GLOW_CLEAR) && kit.clear(bx, by, DECK_GLOW_CLEAR) && kit.clear((ax + bx) / 2, (ay + by) / 2, DECK_GLOW_CLEAR)) strips.moveTo(ax, ay).lineTo(bx, by);
    }
  }
  ridges.stroke({ width: 2, color: kit.district.deck.clutter, alpha: 0.5 });
  strips.stroke({ width: 4, color: kit.district.lamp, alpha: 0.3 });
  return { deck: [ridges], glow: [strips] };
}

function glassTowers(kit: Kit): Parts {
  const glass = new Graphics();
  const edges = new Graphics();
  const glints = new Graphics();
  for (const p of kit.layout.plates) {
    if (kit.rng() < 0.35) continue;
    for (let k = 1; k <= 3; k++) {
      const inset = Math.min(p.w, p.h) * 0.1 * k;
      glass.rect(p.x + inset, p.y + inset * 0.6, p.w - inset * 2, p.h - inset * 1.6).fill({ color: lighten(p.tint, k * 9) });
    }
    if (kit.clear(p.x, p.y, DECK_GLOW_CLEAR) && kit.clear(p.x + p.w, p.y, DECK_GLOW_CLEAR) && kit.clear(p.x, p.y + p.h, DECK_GLOW_CLEAR)) {
      edges.moveTo(p.x, p.y + p.h).lineTo(p.x, p.y).lineTo(p.x + p.w, p.y);
      const g = Math.min(p.w, p.h) * 0.3;
      glints.moveTo(p.x + g, p.y + 6).lineTo(p.x + 6, p.y + g).moveTo(p.x + g * 1.5, p.y + 6).lineTo(p.x + 6, p.y + g * 1.5);
    }
  }
  edges.stroke({ width: 3, color: kit.district.accents[2]!, alpha: 0.4 });
  glints.stroke({ width: 3, color: 0xffffff, alpha: 0.18 });
  return { deck: [glass], glow: [edges, glints] };
}

function helipadLights(kit: Kit): Parts {
  const rings = groupsOf(3);
  for (const h of kit.layout.helipads) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      rings[k % 3]!.circle(h.x + Math.cos(a) * 104, h.y + Math.sin(a) * 104, 4);
    }
  }
  rings.forEach((g) => g.fill({ color: kit.district.accents[1]! }));
  return {
    glow: rings,
    update: (v) => rings.forEach((g, k) => (g.alpha = Math.floor(v.t * 6) % 3 === k ? 1 : 0.2)),
    lights: (out, v) => kit.layout.helipads.forEach((h) => v.inView(h.x, h.y) && out.push({ x: h.x, y: h.y, size: 320, color: 0xffffff, alpha: 0.35 })),
  };
}

function logoBoards(kit: Kit): Parts {
  const boards = new Container();
  const spots = kit.near(7, 340, 160);
  for (const p of spots) {
    const g = new Graphics();
    g.position.set(p.x, p.y);
    g.rotation = p.angle;
    g.rect(-130, -50, 260, 100).fill({ color: 0x101018, alpha: 0.6 }).stroke({ width: 4, color: kit.district.accents[1]!, alpha: 0.9 });
    g.circle(-75, 0, 28).stroke({ width: 7, color: kit.district.accents[1]! });
    g.moveTo(-90, 12).lineTo(-75, -14).lineTo(-60, 12).stroke({ width: 5, color: kit.district.accents[0]! });
    for (let k = 0; k < 3; k++) g.rect(-25, -28 + k * 22, 130 - k * 30, 12).fill({ color: kit.district.accents[0]!, alpha: 0.7 });
    boards.addChild(g);
  }
  return {
    lifted: [{ container: boards, height: BOARD_HEIGHT, layer: "glow" }],
    update: (v) => boards.children.forEach((c, k) => (c.alpha = 0.7 + 0.3 * Math.sin(v.t * 1.2 + k))),
    lights: (out, v) => spots.forEach((p) => v.inView(p.x, p.y) && out.push({ x: p.x, y: p.y, size: 620, color: kit.district.accents[1]!, alpha: 0.5 })),
  };
}

function strings(kit: Kit, pairs: [number, number, number, number][], height: number): Parts {
  const towers: Tower[] = [];
  const wires = new Graphics();
  const bulbs = groupsOf(2);
  for (const [ax, ay, bx, by] of pairs) {
    towers.push({ x: ax, y: ay, height }, { x: bx, y: by, height });
    wires.moveTo(ax, ay).lineTo(bx, by);
    const n = Math.max(3, Math.round(Math.hypot(bx - ax, by - ay) / 22));
    for (let k = 1; k < n; k++) bulbs[k % 2]!.circle(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, 3.2);
  }
  wires.stroke({ width: 1.2, color: 0x6a5a50, alpha: 0.8 });
  bulbs[0]!.fill({ color: kit.district.accents[0]! });
  bulbs[1]!.fill({ color: kit.district.accents[1]! });
  const c = new Container();
  c.addChild(wires, ...bulbs);
  return {
    towers,
    lifted: [{ container: c, height, layer: "glow" }],
    update: (v) => bulbs.forEach((g, k) => (g.alpha = 0.6 + 0.4 * Math.sin(v.t * 3 + k * 2))),
    lights: (out, v) =>
      pairs.forEach(([ax, ay, bx, by]) => {
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        if (v.inView(mx, my)) out.push({ x: mx, y: my, size: 300, color: kit.district.lamp, alpha: 0.4 });
      }),
  };
}

function lanternStrings(kit: Kit): Parts {
  const pairs: [number, number, number, number][] = [];
  for (const p of kit.near(18, 150, 70)) {
    const len = range(kit.rng, 200, 320);
    const qx = p.x + Math.cos(p.angle) * len;
    const qy = p.y + Math.sin(p.angle) * len;
    if (kit.clear(qx, qy, 150) && kit.clear((p.x + qx) / 2, (p.y + qy) / 2, 130)) pairs.push([p.x, p.y, qx, qy]);
  }
  return strings(kit, pairs, STRING_HEIGHT);
}

function awnings(kit: Kit): Parts {
  const cloth = new Graphics();
  const fronts = new Graphics();
  const spots = kit.near(80, 130, 50);
  for (const p of spots) {
    const a = square(p.angle);
    const [c1, c2] = [pickOne(kit.rng, kit.district.accents), 0x2a2420];
    for (let k = 0; k < 6; k++) rect(cloth, ...local(p.x, p.y, a, -30 + k * 12, 0), a, 12, 30).fill({ color: k % 2 ? c2 : lighten(c1, -70) });
    fronts.moveTo(...local(p.x, p.y, a, -36, 16)).lineTo(...local(p.x, p.y, a, 36, 16));
  }
  fronts.stroke({ width: 3, color: kit.district.lamp, alpha: 0.5 });
  return {
    deck: [cloth],
    glow: [fronts],
    lights: (out, v) => spots.forEach((p, k) => k % 3 === 0 && v.inView(p.x, p.y) && out.push({ x: p.x, y: p.y, size: 200, color: kit.district.lamp, alpha: 0.45 })),
  };
}

function stallLanterns(kit: Kit): Parts {
  const lanterns = groupsOf(2);
  const cores = new Graphics();
  const spots = kit.near(44, 120, 40);
  spots.forEach((p, k) => {
    lanterns[k % 2]!.circle(p.x, p.y, 8);
    cores.circle(p.x, p.y, 3);
  });
  lanterns.forEach((g) => g.fill({ color: kit.district.accents[0]! }));
  cores.fill({ color: kit.district.accents[1]! });
  const c = new Container();
  c.addChild(...lanterns, cores);
  return {
    lifted: [{ container: c, height: STRING_HEIGHT, layer: "glow" }],
    update: (v) => lanterns.forEach((g, k) => (g.alpha = 0.75 + 0.25 * Math.sin(v.t * 5 + k * 3))),
    lights: (out, v) => spots.forEach((p, k) => k % 2 === 0 && v.inView(p.x, p.y) && out.push({ x: p.x, y: p.y, size: 170, color: kit.district.accents[0]!, alpha: 0.4 })),
  };
}

function plazas(kit: Kit): Parts {
  const paving = new Graphics();
  const tiles = groupsOf(4);
  const fountains = new Graphics();
  const pairs: [number, number, number, number][] = [];
  const spots = kit.open(2, 1400, 420).map((s) => ({ ...s, r: Math.min(s.clear - 140, 650) }));
  for (const s of spots) {
    paving.circle(s.x, s.y, s.r).fill({ color: lighten(kit.district.deck.base, 20) }).stroke({ width: 6, color: kit.district.deck.clutter });
    paving.circle(s.x, s.y, s.r * 0.55).stroke({ width: 3, color: kit.district.deck.clutter, alpha: 0.6 });
    for (let x = -s.r; x < s.r; x += 46) {
      for (let y = -s.r; y < s.r; y += 46) {
        const d = Math.hypot(x, y);
        if (d > s.r - 30 || d < 70) continue;
        tiles[Math.min(3, Math.floor((d / s.r) * 4))]!.rect(s.x + x - 16, s.y + y - 16, 32, 32);
      }
    }
    const poles = 14;
    for (let k = 0; k < poles; k++) {
      const a0 = (k / poles) * Math.PI * 2;
      const a1 = ((k + 1) / poles) * Math.PI * 2;
      pairs.push([s.x + Math.cos(a0) * (s.r + 20), s.y + Math.sin(a0) * (s.r + 20), s.x + Math.cos(a1) * (s.r + 20), s.y + Math.sin(a1) * (s.r + 20)]);
    }
  }
  tiles.forEach((g, k) => g.fill({ color: kit.district.accents[k % 2]!, alpha: 0.26 }));
  const lanterns = strings(kit, pairs, STRING_HEIGHT);
  return {
    reserve: (x, y) => spots.some((s) => Math.hypot(x - s.x, y - s.y) < s.r + 60),
    deck: [paving],
    glow: tiles,
    live: [fountains],
    towers: lanterns.towers!,
    lifted: lanterns.lifted!,
    update: (v) => {
      lanterns.update!(v);
      tiles.forEach((g, k) => (g.alpha = 0.25 + 0.75 * Math.max(0, Math.sin(v.t * 2 - k * 0.9))));
      fountains.clear();
      for (const s of spots) {
        fountains.circle(s.x, s.y, 46).stroke({ width: 4, color: 0x60e0ff, alpha: 0.8 });
        for (let k = 0; k < 3; k++) {
          const u = (v.t * 0.5 + k / 3) % 1;
          fountains.circle(s.x, s.y, 46 + u * 60).stroke({ width: 2, color: 0x60e0ff, alpha: 0.6 * (1 - u) });
        }
      }
    },
    lights: (out, v) => {
      lanterns.lights!(out, v);
      for (const s of spots) {
        if (!v.inView(s.x, s.y)) continue;
        out.push({ x: s.x, y: s.y, size: s.r * 2.4, color: kit.district.lamp, alpha: 0.5 }, { x: s.x, y: s.y, size: 320, color: 0x60e0ff, alpha: 0.45 });
      }
    },
  };
}

function domes(kit: Kit): Parts {
  const shells = new Graphics();
  const crowns = new Graphics();
  const trim = new Graphics();
  const finials = new Graphics();
  const spots = kit.near(24, 230, 120).map((p) => ({ ...p, r: range(kit.rng, 55, 110) }));
  for (const p of spots) {
    shells.circle(p.x, p.y, p.r).fill({ color: lighten(kit.district.deck.base, 18) });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      shells.moveTo(p.x + Math.cos(a) * p.r * 0.2, p.y + Math.sin(a) * p.r * 0.2).lineTo(p.x + Math.cos(a) * p.r, p.y + Math.sin(a) * p.r);
    }
    shells.stroke({ width: 2, color: kit.district.deck.clutter, alpha: 0.7 });
    crowns.circle(p.x, p.y, p.r * 0.35).fill({ color: lighten(kit.district.deck.base, 30) });
    trim.circle(p.x, p.y, p.r);
    finials.circle(p.x, p.y, 5);
  }
  trim.stroke({ width: 4, color: kit.district.accents[0]!, alpha: 0.55 });
  finials.fill({ color: kit.district.accents[0]! });
  const top = new Container();
  top.addChild(crowns);
  const tip = new Container();
  tip.addChild(finials);
  return {
    deck: [shells],
    glow: [trim],
    lifted: [
      { container: top, height: 0.04, layer: "tall" },
      { container: tip, height: 0.06, layer: "glow" },
    ],
    lights: (out, v) => spots.forEach((p) => v.inView(p.x, p.y) && out.push({ x: p.x, y: p.y, size: p.r * 3.2, color: kit.district.accents[0]!, alpha: 0.3 })),
  };
}

function spires(kit: Kit): Parts {
  const spots = kit.near(12, 280, 150);
  const beacons = new Graphics();
  spots.forEach((p) => beacons.circle(p.x, p.y, 7));
  beacons.fill({ color: kit.district.accents[0]! });
  const c = new Container();
  c.addChild(beacons);
  return {
    towers: spots.map((p) => ({ x: p.x, y: p.y, height: SPIRE_HEIGHT })),
    lifted: [{ container: c, height: SPIRE_HEIGHT, layer: "glow" }],
    update: (v) => (beacons.alpha = 0.55 + 0.45 * Math.sin(v.t * 2)),
    lights: (out, v) =>
      spots.forEach((p) => {
        if (!v.inView(p.x, p.y)) return;
        const [x, y] = v.lift(p.x, p.y, SPIRE_HEIGHT);
        out.push({ x, y, size: 340, color: kit.district.accents[0]!, alpha: 0.35 + 0.25 * Math.sin(v.t * 2) });
      }),
  };
}

function courtyards(kit: Kit): Parts {
  const lawns = new Graphics();
  const lamps = new Graphics();
  for (const p of kit.layout.plates) {
    if (p.w < 300 || p.h < 300 || kit.rng() < 0.7) continue;
    const ix = p.x + p.w * 0.22;
    const iy = p.y + p.h * 0.22;
    const iw = p.w * 0.56;
    const ih = p.h * 0.56;
    lawns.rect(ix, iy, iw, ih).fill({ color: 0x16301e }).stroke({ width: 6, color: 0x0e2414 });
    lawns.moveTo(ix + iw / 2, iy).lineTo(ix + iw / 2, iy + ih).moveTo(ix, iy + ih / 2).lineTo(ix + iw, iy + ih / 2).stroke({ width: 8, color: 0x3a3428 });
    for (const [cx, cy] of [[ix, iy], [ix + iw, iy], [ix, iy + ih], [ix + iw, iy + ih]] as const) if (kit.clear(cx, cy, DECK_GLOW_CLEAR)) lamps.circle(cx, cy, 4);
  }
  lamps.fill({ color: kit.district.accents[0]! });
  return { deck: [lawns], glow: [lamps] };
}

function furnaces(kit: Kit): Parts {
  const bodies = new Graphics();
  const grates = groupsOf(3);
  const spots = kit.near(14, 200, 80);
  spots.forEach((p, k) => {
    const a = square(p.angle);
    rect(bodies, p.x, p.y, a, 96, 64).fill({ color: 0x1e1814 }).stroke({ width: 3, color: kit.district.deck.clutter });
    for (let i = 0; i < 5; i++) rect(grates[k % 3]!, ...local(p.x, p.y, a, -32 + i * 16, 0), a, 9, 40);
  });
  grates.forEach((g) => g.fill({ color: kit.district.accents[0]! }));
  return {
    deck: [bodies],
    glow: grates,
    update: (v) => grates.forEach((g, k) => (g.alpha = 0.6 + 0.4 * Math.sin(v.t * 4 + k * 2) * Math.sin(v.t * 1.3 + k))),
    lights: (out, v) => spots.forEach((p, k) => v.inView(p.x, p.y) && out.push({ x: p.x, y: p.y, size: 440, color: kit.district.accents[0]!, alpha: 0.5 + 0.15 * Math.sin(v.t * 4 + k) })),
  };
}

function smokestacks(kit: Kit): Parts {
  const spots = kit.near(10, 280, 120);
  const rims = new Graphics();
  const embers = new Graphics();
  const puffs: { sprite: Sprite; x: number; y: number; phase: number }[] = [];
  const smoke = new Container();
  spots.forEach((p, k) => {
    rims.circle(p.x, p.y, 24).fill({ color: 0x14100e }).stroke({ width: 5, color: kit.district.deck.clutter });
    embers.circle(p.x, p.y, 14);
    for (let i = 0; i < 4; i++) {
      const sprite = new Sprite(kit.soft);
      sprite.anchor.set(0.5);
      sprite.tint = 0x6a5e56;
      smoke.addChild(sprite);
      puffs.push({ sprite, x: p.x, y: p.y, phase: k * 0.37 + i / 4 });
    }
  });
  embers.fill({ color: kit.district.accents[0]!, alpha: 0.7 });
  const top = new Container();
  top.addChild(rims, smoke);
  const glow = new Container();
  glow.addChild(embers);
  return {
    towers: spots.map((p) => ({ x: p.x, y: p.y, height: STACK_HEIGHT })),
    lifted: [
      { container: top, height: STACK_HEIGHT, layer: "tall" },
      { container: glow, height: STACK_HEIGHT, layer: "glow" },
    ],
    update: (v) => {
      embers.alpha = 0.6 + 0.4 * Math.sin(v.t * 6);
      for (const pf of puffs) {
        const u = (v.t * 0.18 + pf.phase) % 1;
        pf.sprite.position.set(pf.x + u * 160, pf.y - u * 60);
        pf.sprite.scale.set((40 + u * 140) / kit.soft.width);
        pf.sprite.alpha = Math.sin(u * Math.PI) * 0.35;
      }
    },
  };
}

function conveyors(kit: Kit): Parts {
  const belts = new Graphics();
  const slats = groupsOf(3);
  const lamps = new Graphics();
  for (const p of kit.near(12, 180, 80)) {
    const len = range(kit.rng, 280, 480);
    const ex = p.x + Math.cos(p.angle) * len;
    const ey = p.y + Math.sin(p.angle) * len;
    if (!kit.clear(ex, ey, 180) || !kit.clear((p.x + ex) / 2, (p.y + ey) / 2, 160)) continue;
    belts.moveTo(p.x, p.y).lineTo(ex, ey).stroke({ width: 24, color: 0x1a1614 }).moveTo(p.x, p.y).lineTo(ex, ey).stroke({ width: 26, color: kit.district.deck.clutter, alpha: 0.4 });
    const n = Math.floor(len / 20);
    for (let k = 0; k < n; k++) {
      const u = k / n;
      const [x, y] = [p.x + (ex - p.x) * u, p.y + (ey - p.y) * u];
      slats[k % 3]!.moveTo(...local(x, y, p.angle, 0, -10)).lineTo(...local(x, y, p.angle, 0, 10));
    }
    lamps.circle(p.x, p.y, 4).circle(ex, ey, 4);
  }
  slats.forEach((g) => g.stroke({ width: 3, color: kit.district.accents[2]!, alpha: 0.6 }));
  lamps.fill({ color: kit.district.accents[0]! });
  return {
    deck: [belts],
    glow: [...slats, lamps],
    update: (v) => slats.forEach((g, k) => (g.alpha = Math.floor(v.t * 8) % 3 === k ? 0.8 : 0.1)),
  };
}

function canopies(kit: Kit): Parts {
  const leaves = new Graphics();
  for (const p of kit.near(44, 150, 50)) {
    const n = Math.floor(range(kit.rng, 3, 7));
    for (let k = 0; k < n; k++) leaves.circle(p.x + range(kit.rng, -40, 40), p.y + range(kit.rng, -40, 40), range(kit.rng, 18, 40));
  }
  leaves.fill({ color: 0x24502e }).stroke({ width: 3, color: 0x3e7a48, alpha: 0.9 });
  return { deck: [leaves] };
}

function greenhouses(kit: Kit): Parts {
  const glass = new Graphics();
  const grids = groupsOf(2);
  const spots = kit.near(9, 250, 100).map((p, k) => ({ ...p, r: range(kit.rng, 70, 115), k }));
  for (const p of spots) {
    glass.circle(p.x, p.y, p.r).fill({ color: 0x1c2a26 });
    const g = grids[p.k % 2]!;
    for (const f of [0.35, 0.7, 1]) g.circle(p.x, p.y, p.r * f);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI;
      g.moveTo(p.x - Math.cos(a) * p.r, p.y - Math.sin(a) * p.r).lineTo(p.x + Math.cos(a) * p.r, p.y + Math.sin(a) * p.r);
    }
  }
  grids.forEach((g, k) => g.stroke({ width: 2.5, color: kit.district.accents[k]!, alpha: 0.5 }));
  return {
    deck: [glass],
    glow: grids,
    update: (v) => grids.forEach((g, k) => (g.alpha = 0.7 + 0.3 * Math.sin(v.t * 0.8 + k * 2))),
    lights: (out, v) => spots.forEach((p) => v.inView(p.x, p.y) && out.push({ x: p.x, y: p.y, size: p.r * 4, color: kit.district.accents[p.k % 2]!, alpha: 0.5 })),
  };
}

function pond(kit: Kit): Parts {
  const water = new Graphics();
  const ripples = new Graphics();
  const spots = kit.open(1, 0, 400).map((s) => ({ ...s, r: Math.min(s.clear - 160, 380) }));
  for (const s of spots) {
    water.circle(s.x, s.y, s.r).fill({ color: 0x08201e }).stroke({ width: 8, color: 0x1e3a2a });
    for (let k = 0; k < 14; k++) water.circle(s.x + range(kit.rng, -0.7, 0.7) * s.r, s.y + range(kit.rng, -0.7, 0.7) * s.r, range(kit.rng, 6, 12));
    water.fill({ color: 0x1e5a2a });
  }
  return {
    reserve: (x, y) => spots.some((s) => Math.hypot(x - s.x, y - s.y) < s.r + 40),
    deck: [water],
    live: [ripples],
    update: (v) => {
      ripples.clear();
      for (const s of spots) {
        for (let k = 0; k < 3; k++) {
          const u = (v.t * 0.15 + k / 3) % 1;
          ripples.circle(s.x + Math.sin(k * 2.4) * s.r * 0.3, s.y + Math.cos(k * 1.7) * s.r * 0.3, 20 + u * s.r * 0.4).stroke({ width: 2, color: 0x80ffe0, alpha: 0.35 * (1 - u) });
        }
      }
    },
    lights: (out, v) => spots.forEach((s) => v.inView(s.x, s.y) && out.push({ x: s.x, y: s.y, size: s.r * 2.2, color: 0x40d0b0, alpha: 0.3 })),
  };
}

interface Oval {
  x: number;
  y: number;
  angle: number;
  rx: number;
  ry: number;
}

function fitOval(kit: Kit, margin: number, maxRx: number): Oval | null {
  const field = kit.layout.field;
  const fits = (o: Oval) => {
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2;
      const [x, y] = local(o.x, o.y, o.angle, Math.cos(a) * o.rx, Math.sin(a) * o.ry);
      if (x < 100 || y < 100 || x > WORLD.width - 100 || y > WORLD.height - 100) return false;
      if (field.edgeDistance(x, y) < margin || field.nearGap(x, y, 60)) return false;
    }
    return true;
  };
  const n = kit.track.xs.length;
  const cx = kit.track.xs.reduce((a, b) => a + b, 0) / n;
  const cy = kit.track.ys.reduce((a, b) => a + b, 0) / n;
  const score = (o: Oval) => o.rx * o.ry * Math.exp(-Math.hypot(o.x - cx, o.y - cy) / OVAL_PULL);
  let best: Oval | null = null;
  for (const c of kit.open(60, 0, margin + 150)) {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI;
      for (const ratio of [1.3, 1.7, 2.2, 2.8]) {
        let lo = 0;
        let hi = maxRx / ratio;
        for (let k = 0; k < 9; k++) {
          const mid = (lo + hi) / 2;
          if (fits({ x: c.x, y: c.y, angle, rx: mid * ratio, ry: mid })) lo = mid;
          else hi = mid;
        }
        const o = { x: c.x, y: c.y, angle, rx: lo * ratio, ry: lo };
        if (lo > 200 && (!best || score(o) > score(best))) best = o;
      }
    }
  }
  return best;
}

function stadium(kit: Kit): Parts {
  const oval = fitOval(kit, 170, 1500);
  if (!oval || oval.ry < 220) return {};
  const { x: sx, y: sy, angle, rx, ry } = oval;
  const at = (u: number, v: number) => local(sx, sy, angle, u, v);
  const placed = () => {
    const c = new Container();
    c.position.set(sx, sy);
    c.rotation = angle;
    return c;
  };
  const bowl = new Graphics();
  bowl.ellipse(0, 0, rx, ry).fill({ color: 0x24262e }).stroke({ width: 10, color: kit.district.deck.clutter });
  for (const f of [0.93, 0.86, 0.79, 0.72]) bowl.ellipse(0, 0, rx * f, ry * f).stroke({ width: 2, color: kit.district.deck.clutter, alpha: 0.6 });
  bowl.ellipse(0, 0, rx * 0.66, ry * 0.66).fill({ color: 0x12301a });
  const pw = rx * 0.95;
  const ph = ry * 0.85;
  bowl.rect(-pw / 2, -ph / 2, pw, ph).fill({ color: 0x18401f });
  const lines = new Graphics();
  lines.rect(-pw / 2, -ph / 2, pw, ph).moveTo(0, -ph / 2).lineTo(0, ph / 2).stroke({ width: 4, color: 0xe8ffe8, alpha: 0.5 });
  lines.circle(0, 0, ph * 0.2).stroke({ width: 4, color: 0xe8ffe8, alpha: 0.5 });
  for (const side of [-1, 1]) lines.rect(side > 0 ? pw / 2 - pw * 0.14 : -pw / 2, -ph * 0.28, pw * 0.14, ph * 0.56).stroke({ width: 4, color: 0xe8ffe8, alpha: 0.5 });
  const crowd = groupsOf(4);
  const count = Math.round((rx * ry) / 260);
  for (let k = 0; k < count; k++) {
    const a = kit.rng() * Math.PI * 2;
    const f = range(kit.rng, 0.7, 0.97);
    crowd[k % 4]!.circle(Math.cos(a) * rx * f, Math.sin(a) * ry * f, 2);
  }
  crowd.forEach((g, k) => g.fill({ color: [0xffffff, kit.district.accents[1]!, kit.district.accents[2]!, 0xffe0a0][k]!, alpha: 0.7 }));
  const rim = new Graphics();
  for (let k = 0; k < 24; k++) {
    const pts: number[] = [];
    for (let j = 0; j <= 6; j++) {
      const a = ((k + (j / 6) * 0.9) / 24) * Math.PI * 2;
      pts.push(Math.cos(a) * rx, Math.sin(a) * ry);
    }
    rim.poly(pts, false).stroke({ width: 8, color: kit.district.accents[1 + (k % 2)]!, alpha: 0.6 });
  }
  const deck = placed();
  deck.addChild(bowl);
  const glow = placed();
  glow.addChild(lines, rim, ...crowd);
  const flashes = new Graphics();
  const live = placed();
  live.addChild(flashes);

  const towers: Tower[] = [];
  const banks = new Graphics();
  const pools: [number, number][] = [];
  for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4, 0, Math.PI]) {
    const [tx, ty] = at(Math.cos(a) * (rx + 30), Math.sin(a) * (ry + 30));
    towers.push({ x: tx, y: ty, height: FLOOD_HEIGHT });
    rect(banks, tx, ty, Math.atan2(sy - ty, sx - tx) + Math.PI / 2, 56, 18).fill({ color: 0xffffff });
    pools.push(at(Math.cos(a) * rx * 0.4, Math.sin(a) * ry * 0.4));
  }
  const bankLayer = new Container();
  bankLayer.addChild(banks);
  const screens = new Container();
  const screenBars: Graphics[] = [];
  for (const side of [-1, 1]) {
    const [x, y] = at(side * rx * 0.83, 0);
    const screen = new Container();
    screen.position.set(x, y);
    screen.rotation = angle + Math.PI / 2;
    const frame = new Graphics();
    frame.rect(-140, -45, 280, 90).fill({ color: 0x08080c }).stroke({ width: 5, color: 0xffffff, alpha: 0.85 });
    const bars = new Graphics();
    for (let k = 0; k < 5; k++) bars.rect(-130 + k * 52, -34, 44, 68).fill({ color: kit.district.accents[1 + (k % 2)]!, alpha: 0.8 });
    screen.addChild(frame, bars);
    screenBars.push(bars);
    screens.addChild(screen);
  }
  const view = (v: View) => v.inView(sx, sy) || v.inView(...at(rx, 0)) || v.inView(...at(-rx, 0));
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  return {
    reserve: (x, y) => {
      const u = (x - sx) * ca + (y - sy) * sa;
      const v = -(x - sx) * sa + (y - sy) * ca;
      return (u / (rx + 90)) ** 2 + (v / (ry + 90)) ** 2 < 1;
    },
    deck: [deck],
    glow: [glow],
    live: [live],
    towers,
    lifted: [
      { container: bankLayer, height: FLOOD_HEIGHT, layer: "glow" },
      { container: screens, height: 0.08, layer: "glow" },
    ],
    update: (v) => {
      crowd.forEach((g, k) => (g.alpha = 0.4 + 0.6 * Math.max(0, Math.sin(v.t * 4 + k * 1.6))));
      screenBars.forEach((b, k) => (b.x = ((v.t * 40 + k * 60) % 52) - 26));
      flashes.clear();
      if (!view(v)) return;
      for (let k = 0; k < 8; k++) {
        const a = Math.random() * Math.PI * 2;
        const f = 0.72 + Math.random() * 0.24;
        flashes.circle(Math.cos(a) * rx * f, Math.sin(a) * ry * f, 4);
      }
      flashes.fill({ color: 0xffffff });
    },
    lights: (out, v) => {
      if (!view(v)) return;
      for (const [x, y] of pools) out.push({ x, y, size: Math.max(rx, ry) * 1.3, color: 0xf4f8ff, alpha: 0.5 });
    },
  };
}

function floodlights(kit: Kit): Parts {
  const towers: Tower[] = [];
  const banks = new Graphics();
  const pools: [number, number][] = [];
  let side = 1;
  for (let s = 0; s < kit.track.length; s += FLOOD_SPACING) {
    side = -side;
    const [cx, cy, a] = pointAt(kit.track, s);
    const nx = -Math.sin(a) * side;
    const ny = Math.cos(a) * side;
    const x = cx + nx * (HALF + FLOOD_OFFSET);
    const y = cy + ny * (HALF + FLOOD_OFFSET);
    if (kit.layout.field.edgeDistance(x, y) < FLOOD_OFFSET - 10 || kit.layout.field.nearGap(x, y, 80)) continue;
    towers.push({ x, y, height: FLOOD_HEIGHT });
    rect(banks, x, y, a, 50, 16).fill({ color: 0xffffff });
    pools.push([cx + nx * 30, cy + ny * 30]);
  }
  const layer = new Container();
  layer.addChild(banks);
  return {
    towers,
    lifted: [{ container: layer, height: FLOOD_HEIGHT, layer: "glow" }],
    lights: (out, v) => pools.forEach(([x, y]) => v.inView(x, y) && out.push({ x, y, size: 760, color: 0xf4f8ff, alpha: 0.42 })),
  };
}

export const SIGNATURES: Record<SignatureKind, (kit: Kit) => Parts> = {
  containers,
  cranes,
  warehouses,
  glassTowers,
  helipadLights,
  logoBoards,
  plazas,
  lanternStrings,
  awnings,
  stallLanterns,
  domes,
  spires,
  courtyards,
  furnaces,
  smokestacks,
  conveyors,
  canopies,
  greenhouses,
  pond,
  stadium,
  floodlights,
};

export function openSpots(layout: Layout, count: number, minSep: number, minClear: number): Spot[] {
  const candidates: Spot[] = [];
  for (let x = 250; x < WORLD.width - 250; x += 160) {
    for (let y = 250; y < WORLD.height - 250; y += 160) {
      const clear = Math.min(layout.field.edgeDistance(x, y), Math.min(x, y, WORLD.width - x, WORLD.height - y) + 150);
      if (clear >= minClear && !layout.field.nearGap(x, y, 120)) candidates.push({ x, y, clear });
    }
  }
  const score = (s: Spot) => Math.min(s.clear, OPEN_CAP) - Math.hypot(s.x - WORLD.width / 2, s.y - WORLD.height / 2) * CENTRE_BIAS;
  candidates.sort((a, b) => score(b) - score(a));
  const out: Spot[] = [];
  for (const c of candidates) {
    if (out.length >= count) break;
    if (out.every((o) => Math.hypot(o.x - c.x, o.y - c.y) >= minSep)) out.push(c);
  }
  return out;
}
