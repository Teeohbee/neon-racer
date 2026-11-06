import { Container, Graphics, GraphicsContext, Sprite, type Texture } from "pixi.js";
import { TRACK_WIDTH } from "@neon/sim";
import { gapQuads, type GapSample } from "../features";
import type { District } from "./districts";
import { range, type Rng } from "./rng";

const HALF = TRACK_WIDTH / 2;
export const STREET_DEPTH = 0.3;
const SLICE_DEPTHS = [0, 0.05, 0.1, 0.15, 0.2, 0.25];
const PIER_DEPTH = 0.12;
const BRIDGE_DEPTH = 0.17;
const BRIDGE_EVERY = 26;
const QUAY_EVERY = 3;
const LANE_MIN_DEPTH = 150;

interface Lane {
  xs: number[];
  ys: number[];
  cum: number[];
  length: number;
}

interface Mover {
  lane: Lane;
  u: number;
  speed: number;
  parts: Sprite[] | Container;
}

export interface VoidScene {
  root: Container;
  layers: { container: Container; depth: number }[];
  update(t: number, dt: number): void;
  lights: { x: number; y: number; size: number; color: number; alpha: number }[];
}

const lerpColor = (a: number, b: number, k: number) => {
  const ch = (shift: number) => Math.round(((a >> shift) & 255) * (1 - k) + ((b >> shift) & 255) * k) << shift;
  return ch(16) | ch(8) | ch(0);
};

function laneOf(run: GapSample[], side: number): Lane[] {
  const lanes: Lane[] = [];
  let current: Lane | null = null;
  for (const p of run) {
    if (p.depth < LANE_MIN_DEPTH) {
      current = null;
      continue;
    }
    const off = side * (HALF + p.depth * 0.55);
    const x = p.x + p.nx * off;
    const y = p.y + p.ny * off;
    if (!current) {
      current = { xs: [], ys: [], cum: [], length: 0 };
      lanes.push(current);
    }
    const last = current.xs.length - 1;
    current.length += last >= 0 ? Math.hypot(x - current.xs[last]!, y - current.ys[last]!) : 0;
    current.xs.push(x);
    current.ys.push(y);
    current.cum.push(current.length);
  }
  return lanes.filter((l) => l.length > 200);
}

function along(lane: Lane, d: number): [number, number, number] {
  const u = Math.max(0, Math.min(lane.length, d));
  let lo = 0;
  let hi = lane.cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (lane.cum[mid]! <= u) lo = mid;
    else hi = mid;
  }
  const seg = lane.cum[hi]! - lane.cum[lo]! || 1;
  const k = (u - lane.cum[lo]!) / seg;
  const ax = lane.xs[lo]!;
  const ay = lane.ys[lo]!;
  const bx = lane.xs[hi]!;
  const by = lane.ys[hi]!;
  return [ax + (bx - ax) * k, ay + (by - ay) * k, Math.atan2(by - ay, bx - ax)];
}

export function buildVoidScene(gaps: GapSample[][], district: District, rng: Rng, soft: Texture): VoidScene {
  const root = new Container();
  const mask = new Graphics();
  const scene = new Container();
  root.addChild(mask, scene);
  scene.mask = mask;

  const footprint = new GraphicsContext();
  for (const run of gaps) {
    for (const quad of gapQuads(run, () => HALF - 2, (d) => HALF + d)) mask.poly(quad, true);
    for (const quad of gapQuads(run, () => -(HALF - 2), (d) => -(HALF + d))) mask.poly(quad, true);
    for (const quad of gapQuads(run, (d) => -(HALF + d) - 1, (d) => HALF + d + 1)) footprint.poly(quad, true);
  }
  mask.fill({ color: 0xffffff });
  footprint.fill({ color: 0xffffff });

  const layers: { container: Container; depth: number }[] = [];
  SLICE_DEPTHS.forEach((depth, k) => {
    const container = new Container();
    const slice = new Graphics(footprint);
    slice.tint = lerpColor(district.wall.top, district.wall.bottom, k / SLICE_DEPTHS.length);
    container.addChild(slice);
    if (k > 0 && k < SLICE_DEPTHS.length - 1) {
      const windows = new Graphics();
      for (const run of gaps) {
        for (let m = 0; m < run.length; m += 2) {
          const p = run[m]!;
          if (p.depth < 60 || rng() < 0.55) continue;
          for (const side of [-1, 1]) {
            const off = side * (HALF + p.depth - 10);
            windows.rect(p.x + p.nx * off - 3, p.y + p.ny * off - 3, 6, 6);
          }
        }
      }
      windows.fill({ color: district.wall.windows, alpha: 0.35 - k * 0.05 });
      container.addChild(windows);
    }
    scene.addChild(container);
    layers.push({ container, depth });
  });

  const floor = new Container();
  const floorFill = new Graphics(footprint);
  floorFill.tint = district.floorColor;
  floor.addChild(floorFill);
  scene.addChild(floor);
  layers.push({ container: floor, depth: STREET_DEPTH });

  const piersTop = new Container();
  const piers = new Graphics();
  for (const run of gaps) {
    for (let m = 3; m < run.length - 3; m += 8) {
      const p = run[m]!;
      const tx = -p.ny;
      const ty = p.nx;
      const a = [p.x - p.nx * (HALF - 14), p.y - p.ny * (HALF - 14)];
      const b = [p.x + p.nx * (HALF - 14), p.y + p.ny * (HALF - 14)];
      piers.poly([a[0]! - tx * 12, a[1]! - ty * 12, b[0]! - tx * 12, b[1]! - ty * 12, b[0]! + tx * 12, b[1]! + ty * 12, a[0]! + tx * 12, a[1]! + ty * 12], true);
    }
  }
  piers.fill({ color: district.wall.top });
  const pierBase = new Graphics(piers.context);
  pierBase.tint = 0x777777;
  floor.addChild(pierBase);
  piersTop.addChild(piers);
  scene.addChild(piersTop);
  layers.push({ container: piersTop, depth: PIER_DEPTH });

  const lanes = gaps.flatMap((run) => [...laneOf(run, -1), ...laneOf(run, 1)]);
  const movers: Mover[] = [];
  const lights: VoidScene["lights"] = [];
  const animate: ((t: number, dt: number) => void)[] = [];

  if (district.props.traffic) {
    const lines = new Graphics();
    for (const lane of lanes) {
      for (let d = 0; d < lane.length; d += 60) {
        const [x0, y0] = along(lane, d);
        const [x1, y1] = along(lane, d + 26);
        lines.moveTo(x0, y0).lineTo(x1, y1);
      }
      const count = Math.max(1, Math.floor(lane.length / 380));
      for (let k = 0; k < count; k++) {
        const dir = rng() < 0.5 ? 1 : -1;
        const head = new Sprite(soft);
        const tail = new Sprite(soft);
        for (const s of [head, tail]) {
          s.anchor.set(0.5);
          floor.addChild(s);
        }
        head.tint = 0xfff2d8;
        tail.tint = 0xff3040;
        movers.push({ lane, u: rng() * lane.length, speed: dir * range(rng, 160, 260), parts: [head, tail] });
      }
    }
    lines.stroke({ width: 3, color: 0x3a3f50, alpha: 0.6 });
    floor.addChildAt(lines, 1);
    animate.push((_t, dt) => {
      for (const m of movers) {
        if (!Array.isArray(m.parts)) continue;
        m.u = (((m.u + m.speed * dt) % m.lane.length) + m.lane.length) % m.lane.length;
        const [x, y, a] = along(m.lane, m.u);
        const dir = Math.sign(m.speed);
        const [head, tail] = m.parts as [Sprite, Sprite];
        head.position.set(x + Math.cos(a) * dir * 16, y + Math.sin(a) * dir * 16);
        tail.position.set(x - Math.cos(a) * dir * 16, y - Math.sin(a) * dir * 16);
        for (const s of [head, tail]) {
          s.rotation = a;
          s.scale.set(70 / soft.width, 22 / soft.width);
          s.alpha = 0.75;
        }
      }
    });
  }

  if (district.floor === "water") {
    const ripples = [new Graphics(), new Graphics(), new Graphics()];
    const reflections: Sprite[] = [];
    for (const run of gaps) {
      for (let m = 0; m < run.length; m++) {
        const p = run[m]!;
        if (p.depth < 70) continue;
        for (const side of [-1, 1]) {
          const tx = -p.ny;
          const ty = p.nx;
          for (let r = 0; r < 1; r++) {
            const off = side * (HALF + range(rng, 20, p.depth - 20));
            const x = p.x + p.nx * off;
            const y = p.y + p.ny * off;
            const len = range(rng, 10, 26);
            ripples[Math.floor(rng() * 3)]!.moveTo(x - tx * len, y - ty * len).lineTo(x + tx * len, y + ty * len);
          }
          if (m % 3 === 0 && rng() < 0.7) {
            const off = side * (HALF + range(rng, 30, p.depth - 30));
            const s = new Sprite(soft);
            s.anchor.set(0.5);
            s.position.set(p.x + p.nx * off, p.y + p.ny * off);
            s.rotation = Math.atan2(ty, tx);
            s.scale.set(range(rng, 60, 140) / soft.width, range(rng, 10, 18) / soft.width);
            s.tint = district.accents[Math.floor(rng() * 2)]!;
            reflections.push(s);
          }
        }
      }
    }
    ripples.forEach((g) => {
      g.stroke({ width: 2, color: 0x2a8a9a, alpha: 0.35 });
      floor.addChild(g);
    });
    for (const s of reflections) floor.addChild(s);

    const moored = new Graphics();
    const boatLights = new Graphics();
    const hull = (g: Graphics, x: number, y: number, a: number, len: number, wid: number) => {
      const c = Math.cos(a);
      const s = Math.sin(a);
      const pt = (u: number, v: number) => [x + c * u - s * v, y + s * u + c * v];
      g.poly([...pt(len / 2, 0), ...pt(len / 4, wid / 2), ...pt(-len / 2, wid / 2), ...pt(-len / 2, -wid / 2), ...pt(len / 4, -wid / 2)], true);
    };
    const docked: [number, number][] = [];
    for (const run of gaps) {
      for (let m = 4; m < run.length - 4; m += 12) {
        const p = run[m]!;
        if (p.depth < 200) continue;
        for (const side of [-1, 1]) {
          if (rng() < 0.4) continue;
          const off = side * (HALF + p.depth - 34);
          const x = p.x + p.nx * off;
          const y = p.y + p.ny * off;
          if (docked.some(([dx, dy]) => Math.hypot(dx - x, dy - y) < 120)) continue;
          docked.push([x, y]);
          const a = Math.atan2(p.nx, -p.ny);
          hull(moored, x, y, a, 64, 20);
          boatLights.circle(x, y, 3);
        }
      }
    }
    moored.fill({ color: 0x1c2a34 }).stroke({ width: 2, color: 0x3a5a66 });
    boatLights.fill({ color: 0xffd090, alpha: 0.9 });
    floor.addChild(moored, boatLights);

    const quay = new Graphics();
    for (const run of gaps) {
      for (let m = 0; m < run.length; m += QUAY_EVERY) {
        const p = run[m]!;
        if (p.depth < 120) continue;
        for (const side of [-1, 1]) {
          const off = side * (HALF + p.depth - 8);
          const x = p.x + p.nx * off;
          const y = p.y + p.ny * off;
          const color = (m / QUAY_EVERY) % 2 ? 0xffc070 : district.accents[1]!;
          quay.circle(x, y, 3).fill({ color });
          const r = new Sprite(soft);
          r.anchor.set(0.5);
          r.position.set(x - p.nx * side * 34, y - p.ny * side * 34);
          r.rotation = Math.atan2(p.ny, p.nx);
          r.scale.set(70 / soft.width, 9 / soft.width);
          r.tint = color;
          reflections.push(r);
          floor.addChild(r);
        }
      }
    }
    floor.addChild(quay);

    if (district.props.bridges) {
      const bridgeLayer = new Container();
      const bridges = new Graphics();
      const bridgeLights = new Graphics();
      for (const run of gaps) {
        for (let m = BRIDGE_EVERY / 2; m < run.length - 4; m += BRIDGE_EVERY) {
          const p = run[m]!;
          if (p.depth < 180) continue;
          const tx = -p.ny;
          const ty = p.nx;
          const reach = HALF + p.depth + 4;
          const a = [p.x - p.nx * reach, p.y - p.ny * reach];
          const b = [p.x + p.nx * reach, p.y + p.ny * reach];
          bridges.poly([a[0]! - tx * 17, a[1]! - ty * 17, b[0]! - tx * 17, b[1]! - ty * 17, b[0]! + tx * 17, b[1]! + ty * 17, a[0]! + tx * 17, a[1]! + ty * 17], true);
          for (let k = 0; k <= 10; k++) {
            const u = -reach + (2 * reach * k) / 10;
            if (Math.abs(u) < HALF) continue;
            for (const side of [-1, 1]) bridgeLights.circle(p.x + p.nx * u + tx * side * 15, p.y + p.ny * u + ty * side * 15, 2.5);
          }
        }
      }
      bridges.fill({ color: 0x18161f }).stroke({ width: 3, color: 0x352f40 });
      bridgeLights.fill({ color: 0xffd4a0, alpha: 0.95 });
      bridgeLayer.addChild(bridges, bridgeLights);
      scene.addChild(bridgeLayer);
      layers.push({ container: bridgeLayer, depth: BRIDGE_DEPTH });
    }

    for (const lane of lanes) {
      if (rng() < 0.35) continue;
      const boat = new Container();
      const body = new Graphics();
      hull(body, 0, 0, 0, 80, 26);
      body.fill({ color: 0x22323c }).stroke({ width: 2, color: 0x4a7a86 });
      body.circle(30, 0, 3).fill({ color: 0xffffff }).circle(-36, 0, 3).fill({ color: 0xff3a5a });
      boat.addChild(body);
      floor.addChild(boat);
      movers.push({ lane, u: rng() * lane.length, speed: range(rng, 40, 70) * (rng() < 0.5 ? 1 : -1), parts: boat });
    }

    animate.push((t, dt) => {
      ripples.forEach((g, k) => (g.alpha = 0.35 + 0.65 * Math.max(0, Math.sin(t * 1.7 + k * 2.1))));
      reflections.forEach((s, k) => (s.alpha = 0.22 + 0.12 * Math.sin(t * 2.3 + k)));
      for (const m of movers) {
        if (Array.isArray(m.parts)) continue;
        m.u += m.speed * dt;
        if (m.u < 0 || m.u > m.lane.length) {
          m.speed = -m.speed;
          m.u = Math.max(0, Math.min(m.lane.length, m.u));
        }
        const [x, y, a] = along(m.lane, m.u);
        m.parts.position.set(x, y);
        m.parts.rotation = m.speed > 0 ? a : a + Math.PI;
      }
    });
  }

  if (district.floor === "yard") {
    const yard = new Graphics();
    const bushings = new Graphics();
    const nodes: [number, number][] = [];
    for (const run of gaps) {
      for (let m = 2; m < run.length - 2; m += 5) {
        const p = run[m]!;
        if (p.depth < 140) continue;
        for (const side of [-1, 1]) {
          if (rng() < 0.35) continue;
          const off = side * (HALF + range(rng, 60, p.depth - 60));
          const x = p.x + p.nx * off;
          const y = p.y + p.ny * off;
          const a = Math.atan2(p.ny, p.nx);
          const c = Math.cos(a);
          const s = Math.sin(a);
          const pt = (u: number, v: number) => [x + c * u - s * v, y + s * u + c * v];
          yard.poly([...pt(-26, -20), ...pt(26, -20), ...pt(26, 20), ...pt(-26, 20)], true);
          for (let f = -1; f <= 1; f++) {
            const [bx, by] = pt(f * 14, -26);
            bushings.circle(bx!, by!, 3.5);
            nodes.push([bx!, by!]);
          }
        }
      }
    }
    yard.fill({ color: 0x1e2434 }).stroke({ width: 2, color: 0x3c4a6a });
    bushings.fill({ color: district.accents[0]!, alpha: 0.9 });
    const arcs = new Graphics();
    floor.addChild(yard, bushings, arcs);
    let nextArc = 0;
    animate.push((t) => {
      bushings.alpha = 0.6 + 0.4 * Math.sin(t * 50) * Math.sin(t * 3.1);
      if (t < nextArc) return;
      nextArc = t + range(rng, 0.06, 0.18);
      arcs.clear();
      for (let k = 0; k < 2 && nodes.length > 1; k++) {
        const a = nodes[Math.floor(rng() * nodes.length)]!;
        const b = nodes.find((n) => n !== a && Math.hypot(n[0] - a[0], n[1] - a[1]) < 60 && rng() < 0.5);
        if (!b) continue;
        arcs.moveTo(a[0], a[1]);
        for (let j = 1; j < 6; j++) {
          const k2 = j / 6;
          arcs.lineTo(a[0] + (b[0] - a[0]) * k2 + range(rng, -6, 6), a[1] + (b[1] - a[1]) * k2 + range(rng, -6, 6));
        }
        arcs.lineTo(b[0], b[1]);
      }
      arcs.stroke({ width: 2, color: district.accents[2]!, alpha: 0.9 });
    });
  }

  return {
    root,
    layers,
    lights,
    update(t, dt) {
      for (const fn of animate) fn(t, dt);
    },
  };
}
