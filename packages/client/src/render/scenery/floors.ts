import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import { TRACK_WIDTH } from "@neon/sim";
import { sideDepth, type GapSample } from "../features";
import type { District, FloorExtra } from "./districts";
import { along, type Lane } from "./lanes";
import { pickOne, range, type Rng } from "./rng";

const HALF = TRACK_WIDTH / 2;

export interface FloorKit {
  floor: Container;
  scene: Container;
  layers: { container: Container; depth: number }[];
  gaps: GapSample[][];
  lanes: Lane[];
  district: District;
  rng: Rng;
  soft: Texture;
}

type Animate = ((t: number, dt: number) => void) | null;

const poly = (g: Graphics, x: number, y: number, a: number, pts: number[]) => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const out: number[] = [];
  for (let i = 0; i < pts.length; i += 2) out.push(x + c * pts[i]! - s * pts[i + 1]!, y + s * pts[i]! + c * pts[i + 1]!);
  return g.poly(out, true);
};

const rect = (g: Graphics, x: number, y: number, a: number, w: number, h: number) => poly(g, x, y, a, [-w / 2, -h / 2, w / 2, -h / 2, w / 2, h / 2, -w / 2, h / 2]);

function eachBand(gaps: GapSample[][], step: number, fn: (p: GapSample, side: number, depth: number, m: number) => void) {
  for (const run of gaps) {
    for (let m = 0; m < run.length; m += step) {
      const p = run[m]!;
      for (const side of [-1, 1]) {
        const d = sideDepth(p, side);
        if (d > 40) fn(p, side, d, m);
      }
    }
  }
}

const at = (p: GapSample, side: number, offset: number): [number, number] => [p.x + p.nx * side * (HALF + offset), p.y + p.ny * side * (HALF + offset)];

function twinkle(groups: Graphics[], base: number, speed: number): Animate {
  return (t) => groups.forEach((g, k) => (g.alpha = base + (1 - base) * Math.max(0, Math.sin(t * speed + k * 2.1))));
}

function stretched(kit: FloorKit, x: number, y: number, a: number, len: number, wid: number, color: number, alpha: number) {
  const s = new Sprite(kit.soft);
  s.anchor.set(0.5);
  s.position.set(x, y);
  s.rotation = a;
  s.scale.set(len / kit.soft.width, wid / kit.soft.width);
  s.tint = color;
  s.alpha = alpha;
  kit.floor.addChild(s);
  return s;
}

function ships(kit: FloorKit): Animate {
  const hulls = new Graphics();
  const cargo = new Graphics();
  const lights = new Graphics();
  for (const lane of kit.lanes) {
    if (lane.length < 420) continue;
    const [x, y, a] = along(lane, lane.length * range(kit.rng, 0.3, 0.7));
    poly(hulls, x, y, a, [150, 0, 110, 32, -140, 32, -140, -32, 110, -32]).fill({ color: 0x1a2228 }).stroke({ width: 3, color: 0x3a4a52 });
    rect(hulls, x - Math.cos(a) * 112, y - Math.sin(a) * 112, a, 30, 50).fill({ color: 0x2a343a });
    for (let i = 0; i < 6; i++) {
      for (let j = -1; j <= 1; j++) {
        const u = -80 + i * 30;
        rect(cargo, x + Math.cos(a) * u - Math.sin(a) * j * 18, y + Math.sin(a) * u + Math.cos(a) * j * 18, a, 26, 15).fill({ color: pickOne(kit.rng, [0x6a2a24, 0x1e4466, 0x1e5a50, 0x7a5020]) });
      }
    }
    for (let u = -130; u <= 130; u += 26) for (const v of [-30, 30]) lights.circle(x + Math.cos(a) * u - Math.sin(a) * v, y + Math.sin(a) * u + Math.cos(a) * v, 2.2);
    stretched(kit, x, y + 40, a, 300, 24, kit.district.accents[1]!, 0.18);
  }
  lights.fill({ color: 0xffc080, alpha: 0.9 });
  kit.floor.addChild(hulls, cargo, lights);
  return (t) => (lights.alpha = 0.75 + 0.25 * Math.sin(t * 1.3));
}

function buoys(kit: FloorKit): Animate {
  const groups = [new Graphics(), new Graphics()];
  for (const lane of kit.lanes) {
    for (let d = 80, k = 0; d < lane.length; d += 260, k++) {
      const [x, y, a] = along(lane, d);
      const off = k % 2 ? 46 : -46;
      const bx = x - Math.sin(a) * off;
      const by = y + Math.cos(a) * off;
      groups[k % 2]!.circle(bx, by, 5);
      stretched(kit, bx, by + 14, Math.PI / 2, 30, 6, k % 2 ? 0x30ff60 : 0xff3030, 0.3);
    }
  }
  groups[0]!.fill({ color: 0xff3030 });
  groups[1]!.fill({ color: 0x30ff60 });
  kit.floor.addChild(...groups);
  return (t) => groups.forEach((g, k) => (g.alpha = Math.sin(t * 2.5 + k * Math.PI) > 0.2 ? 1 : 0.2));
}

function tiles(kit: FloorKit): Animate {
  const plain = new Graphics();
  const leds = [new Graphics(), new Graphics(), new Graphics()];
  eachBand(kit.gaps, 2, (p, side, d) => {
    const a = Math.atan2(p.ny, p.nx);
    for (let off = 24; off < d - 16; off += 40) {
      const [x, y] = at(p, side, off);
      if (kit.rng() < 0.3) rect(leds[Math.floor(kit.rng() * 3)]!, x, y, a, 30, 30);
      else rect(plain, x, y, a, 30, 30);
    }
  });
  plain.fill({ color: 0x241824 });
  leds.forEach((g, k) => g.fill({ color: kit.district.accents[k % 2]!, alpha: 0.55 }));
  kit.floor.addChild(plain, ...leds);
  return twinkle(leds, 0.2, 1.6);
}

function crowd(kit: FloorKit): Animate {
  const groups = [new Graphics(), new Graphics(), new Graphics()];
  const colors = [0xfff0d0, 0xffffff, kit.district.accents[1]!];
  eachBand(kit.gaps, 1, (p, side, d) => {
    for (let i = 0; i < 4; i++) {
      const [x, y] = at(p, side, range(kit.rng, 14, d - 14));
      groups[Math.floor(kit.rng() * 3)]!.circle(x + range(kit.rng, -8, 8), y + range(kit.rng, -8, 8), 1.8);
    }
  });
  groups.forEach((g, k) => g.fill({ color: colors[k]!, alpha: 0.8 }));
  kit.floor.addChild(...groups);
  return twinkle(groups, 0.3, 3.3);
}

function stalls(kit: FloorKit): Animate {
  const fronts = new Graphics();
  const bulbs = [new Graphics(), new Graphics()];
  const wires = new Graphics();
  for (const lane of kit.lanes) {
    for (let d = 30; d < lane.length; d += 70) {
      const [x, y, a] = along(lane, d);
      for (const side of [-1, 1]) {
        const sx = x - Math.sin(a) * side * 48;
        const sy = y + Math.cos(a) * side * 48;
        rect(fronts, sx, sy, a, 36, 20).fill({ color: pickOne(kit.rng, kit.district.accents), alpha: 0.28 });
      }
      if (Math.round(d / 70) % 2 === 0) {
        const ax = x - Math.sin(a) * 90;
        const ay = y + Math.cos(a) * 90;
        const bx = x + Math.sin(a) * 90;
        const by = y - Math.cos(a) * 90;
        wires.moveTo(ax, ay).lineTo(bx, by);
        for (let k = 0; k <= 8; k++) bulbs[k % 2]!.circle(ax + ((bx - ax) * k) / 8, ay + ((by - ay) * k) / 8, 2.5);
      }
    }
  }
  wires.stroke({ width: 1, color: 0x5a4a3a, alpha: 0.8 });
  bulbs[0]!.fill({ color: kit.district.accents[1]!, alpha: 0.7 });
  bulbs[1]!.fill({ color: kit.district.accents[0]!, alpha: 0.7 });
  kit.floor.addChild(fronts, wires, ...bulbs);
  return twinkle(bulbs, 0.5, 4);
}

function lava(kit: FloorKit): Animate {
  const bed = new Graphics();
  const flow = [new Graphics(), new Graphics(), new Graphics()];
  const crust = new Graphics();
  for (const lane of kit.lanes) {
    const pts: number[] = [];
    for (let d = 0; d <= lane.length; d += 20) pts.push(...along(lane, d).slice(0, 2));
    bed.poly(pts, false).stroke({ width: 90, color: 0x6a1404, alpha: 0.6, join: "round" });
    bed.poly(pts, false).stroke({ width: 44, color: 0xc84008, alpha: 0.5, join: "round" });
    bed.poly(pts, false).stroke({ width: 12, color: 0xffa040, alpha: 0.45, join: "round" });
    for (let d = 0, k = 0; d < lane.length - 30; d += 30, k++) {
      const [x0, y0] = along(lane, d);
      const [x1, y1] = along(lane, d + 18);
      flow[k % 3]!.moveTo(x0, y0).lineTo(x1, y1);
      if (kit.rng() < 0.3) {
        const [cx, cy, a] = along(lane, d + 10);
        const off = range(kit.rng, -30, 30);
        poly(crust, cx - Math.sin(a) * off, cy + Math.cos(a) * off, a + range(kit.rng, -0.5, 0.5), [-14, -8, 10, -10, 16, 4, -6, 10]);
      }
    }
  }
  flow.forEach((g) => g.stroke({ width: 6, color: 0xffd080, alpha: 0.55, cap: "round" }));
  crust.fill({ color: 0x2a0a04, alpha: 0.85 });
  kit.floor.addChild(bed, ...flow, crust);
  return (t) => {
    flow.forEach((g, k) => (g.alpha = 0.15 + 0.85 * Math.max(0, Math.sin(t * 3 - k * 2.1))));
    bed.alpha = 0.85 + 0.15 * Math.sin(t * 1.7);
  };
}

function paths(kit: FloorKit): Animate {
  const ground = new Graphics();
  const lamps = new Graphics();
  for (const lane of kit.lanes) {
    const pts: number[] = [];
    for (let d = 0; d <= lane.length; d += 20) pts.push(...along(lane, d).slice(0, 2));
    ground.poly(pts, false).stroke({ width: 16, color: 0x3a3a2a, join: "round" });
    for (let d = 40, k = 0; d < lane.length; d += 90, k++) {
      const [x, y, a] = along(lane, d);
      const off = k % 2 ? 14 : -14;
      lamps.circle(x - Math.sin(a) * off, y + Math.cos(a) * off, 2.8);
    }
  }
  lamps.fill({ color: 0xffe8a0 });
  kit.floor.addChild(ground, lamps);
  return null;
}

function trees(kit: FloorKit): Animate {
  const canopy = new Graphics();
  eachBand(kit.gaps, 2, (p, side, d) => {
    if (kit.rng() < 0.4) return;
    const off = kit.rng() < 0.5 ? range(kit.rng, 14, d * 0.4) : range(kit.rng, d * 0.7, d - 12);
    const [x, y] = at(p, side, off);
    canopy.circle(x, y, range(kit.rng, 10, 22));
  });
  canopy.fill({ color: 0x0e2c16 }).stroke({ width: 2, color: 0x1e4a26 });
  kit.floor.addChildAt(canopy, 1);
  return null;
}

function kiosks(kit: FloorKit): Animate {
  const roofs = new Graphics();
  const lights = new Graphics();
  for (const lane of kit.lanes) {
    for (let d = 60; d < lane.length; d += 180) {
      const [x, y, a] = along(lane, d);
      const color = pickOne(kit.rng, kit.district.accents);
      rect(roofs, x, y, a, 40, 28).fill({ color, alpha: 0.6 });
      lights.circle(x, y, 4);
    }
  }
  lights.fill({ color: 0xffffff });
  kit.floor.addChild(roofs, lights);
  return null;
}

function gardens(kit: FloorKit): Animate {
  const hedges = new Graphics();
  const lanterns = new Graphics();
  for (const run of kit.gaps) {
    for (const side of [-1, 1]) {
      const pts: number[] = [];
      run.forEach((p, m) => {
        const d = sideDepth(p, side);
        if (d < 80) return;
        pts.push(...at(p, side, d - 22));
        if (m % 4 === 0) lanterns.circle(...at(p, side, d - 40), 3);
      });
      if (pts.length > 4) hedges.poly(pts, false).stroke({ width: 18, color: 0x14301c, join: "round" });
    }
  }
  lanterns.fill({ color: kit.district.accents[0]! });
  kit.floor.addChild(hedges, lanterns);
  return (t) => (lanterns.alpha = 0.7 + 0.3 * Math.sin(t * 2));
}

export const FLOOR_EXTRAS: Record<FloorExtra, (kit: FloorKit) => Animate> = { ships, buoys, tiles, crowd, stalls, lava, paths, trees, kiosks, gardens };
