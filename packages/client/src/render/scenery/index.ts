import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import type { Camera, Track } from "@neon/sim";
import { softLightTexture } from "../textures";
import type { WeatherConfig } from "../weather";
import { districtFor, type District } from "./districts";
import { buildLayout, scatter, type Billboard, type Layout } from "./layout";
import { range, seeded } from "./rng";
import { lighten, openSpots, SIGNATURES, type Parts, type Tower, type View } from "./signatures";
import { buildVoidScene, type VoidScene } from "./void";

const LAMP_HEIGHT = 0.05;
const BLINKER_HEIGHT = 0.08;
const BILLBOARD_HEIGHT = 0.11;
const PYLON_HEIGHT = 0.13;
const PYLON_BASE = 34;
const PYLON_TOP = 20;
const BLINK_GROUPS = 3;
const STEAM_PUFFS = 3;
const CULL = 400;
const CLUTTER_GLOW = 0.22;
const CABLE_GLOW = 0.4;
const PYLON_GLOW = 0.9;
const ROOF_GLOW = 0.28;
const SKYLIGHT_GLOW = 0.22;
const CABLE_SAG = 0.45;
const CABLE_STEPS = 10;

export interface SceneLight {
  x: number;
  y: number;
  size: number;
  color: number;
  alpha: number;
}

export interface SceneryLayers {
  deck: Container;
  tall: Container;
  glow: Container;
}

export interface Scenery {
  readonly active: boolean;
  setTrack(track: Track | null, name: string | null | undefined): void;
  update(camera: Camera, t: number, dt: number): void;
  lights(): SceneLight[];
  ambient(): number | null;
  weather(): WeatherConfig | null;
  edges(): readonly [number, number] | null;
  destroy(): void;
}

interface Built {
  layout: Layout;
  district: District;
  groups: Container[];
  lifted: { container: Container; height: number }[];
  sunk: { container: Container; depth: number }[];
  poles: Graphics;
  steam: { sprite: Sprite; x: number; y: number; phase: number }[];
  blinkGroups: Graphics[];
  billboards: { view: Container; bars: Graphics[]; scan: Graphics; data: Billboard }[];
  arcs: Graphics;
  arcFlash: { x: number; y: number; until: number } | null;
  nextArc: number;
  cables: Graphics;
  yardGlow: Graphics;
  yardArcs: Graphics;
  yardFlash: { x: number; y: number; until: number } | null;
  nextYardArc: number;
  voidScene: VoidScene;
  towers: Tower[];
  signatures: Parts[];
}

function drawClutter(g: Graphics, layout: Layout, district: District) {
  const c = district.deck.clutter;
  for (const p of layout.clutter) {
    const k = p.size;
    const rot = (u: number, v: number) => [p.x + Math.cos(p.angle) * u - Math.sin(p.angle) * v, p.y + Math.sin(p.angle) * u + Math.cos(p.angle) * v];
    const box = (w: number, h: number) => g.poly([...rot(-w / 2, -h / 2), ...rot(w / 2, -h / 2), ...rot(w / 2, h / 2), ...rot(-w / 2, h / 2)], true);
    if (p.kind === "ac") {
      box(60 * k, 40 * k).fill({ color: district.deck.seam }).stroke({ width: 2, color: c });
      g.circle(p.x, p.y, 13 * k).stroke({ width: 2, color: c });
    } else if (p.kind === "vent") {
      box(26 * k, 26 * k).fill({ color: c, alpha: 0.6 }).stroke({ width: 2, color: c });
    } else if (p.kind === "block") {
      box(110 * k, 70 * k).fill({ color: district.deck.seam }).stroke({ width: 3, color: c, alpha: 0.7 });
    } else {
      g.circle(p.x, p.y, 22 * k).stroke({ width: 3, color: c });
      g.moveTo(p.x, p.y).lineTo(...(rot(18 * k, 0) as [number, number])).stroke({ width: 2, color: c });
    }
  }
  for (const h of layout.helipads) {
    g.circle(h.x, h.y, 95).fill({ color: district.deck.seam }).stroke({ width: 5, color: c });
    g.circle(h.x, h.y, 70).stroke({ width: 2, color: c, alpha: 0.6 });
    g.moveTo(h.x - 22, h.y - 30).lineTo(h.x - 22, h.y + 30).moveTo(h.x + 22, h.y - 30).lineTo(h.x + 22, h.y + 30).moveTo(h.x - 22, h.y).lineTo(h.x + 22, h.y).stroke({ width: 7, color: c });
  }
}

function drawClutterGlow(g: Graphics, layout: Layout, color: number) {
  for (const p of layout.clutter) {
    if (p.kind !== "ac" && p.kind !== "block") continue;
    const [w, h] = p.kind === "ac" ? [60 * p.size, 40 * p.size] : [110 * p.size, 70 * p.size];
    const rot = (u: number, v: number) => [p.x + Math.cos(p.angle) * u - Math.sin(p.angle) * v, p.y + Math.sin(p.angle) * u + Math.cos(p.angle) * v];
    g.poly([...rot(-w / 2, -h / 2), ...rot(w / 2, -h / 2), ...rot(w / 2, h / 2), ...rot(-w / 2, h / 2)], true);
  }
  g.stroke({ width: 2, color, alpha: CLUTTER_GLOW });
  for (const h of layout.helipads) g.circle(h.x, h.y, 95);
  g.stroke({ width: 3, color, alpha: CLUTTER_GLOW * 1.4 });
  for (const p of layout.clutter) if (p.kind === "ac") g.circle(p.x + Math.cos(p.angle) * 24 * p.size, p.y + Math.sin(p.angle) * 24 * p.size, 2.5);
  g.fill({ color, alpha: 0.7 });
}

function buildBillboard(b: Billboard): { view: Container; bars: Graphics[]; scan: Graphics } {
  const view = new Container();
  view.position.set(b.x, b.y);
  view.rotation = b.angle;
  const frame = new Graphics();
  frame.rect(-b.w / 2, -b.h / 2, b.w, b.h).fill({ color: b.color, alpha: 0.16 }).stroke({ width: 4, color: b.color, alpha: 0.9 });
  view.addChild(frame);
  const bars = [0, 1, 2, 3].map((k) => {
    const bar = new Graphics();
    const y = -b.h / 2 + 10 + (k * (b.h - 20)) / 4;
    const len = (b.w - 24) * (0.4 + 0.6 * (((k * 7919 + Math.floor(b.phase * 100)) % 10) / 10));
    bar.rect(-b.w / 2 + 12, y, len, (b.h - 20) / 4 - 5).fill({ color: b.color, alpha: 0.75 });
    view.addChild(bar);
    return bar;
  });
  const scan = new Graphics();
  scan.rect(-2, -b.h / 2, 4, b.h).fill({ color: 0xffffff, alpha: 0.5 });
  view.addChild(scan);
  return { view, bars, scan };
}

export function createScenery(layers: SceneryLayers): Scenery {
  const soft: Texture = softLightTexture(64);
  let built: Built | null = null;
  let currentTrack: Track | null = null;
  let currentName: string | null = null;
  let camera: Camera = { x: 0, y: 0, scale: 1 };
  let time = 0;

  const clear = () => {
    if (!built) return;
    for (const g of built.groups) g.destroy({ children: true });
    built = null;
  };

  const build = (track: Track, name: string, district: District): Built => {
    const layout = buildLayout(track, name, district);
    const rng = seeded(`${name}:void`);

    const deck = new Container();
    deck.isRenderGroup = true;
    const plates = new Graphics();
    plates.rect(-2000, -2000, 10400, 8000).fill({ color: district.deck.seam });
    for (const p of layout.plates) plates.rect(p.x, p.y, p.w, p.h).fill({ color: p.tint });
    for (const p of layout.plates) plates.rect(p.x, p.y, p.w, p.h);
    plates.stroke({ width: 4, color: district.deck.clutter, alpha: 0.35 });
    for (const p of layout.plates) if (p.inner) plates.rect(p.inner.x, p.inner.y, p.inner.w, p.inner.h).fill({ color: p.inner.tint }).stroke({ width: 3, color: district.deck.clutter, alpha: 0.5 });
    const clutter = new Graphics();
    drawClutter(clutter, layout, district);
    deck.addChild(plates, clutter);
    layers.deck.addChild(deck);

    const tall = new Container();
    const poles = new Graphics();
    const pylonTops = new Container();
    pylonTops.isRenderGroup = true;
    const tops = new Graphics();
    for (const p of layout.pylons) {
      tops.rect(p.x - PYLON_TOP, p.y - PYLON_TOP, PYLON_TOP * 2, PYLON_TOP * 2).moveTo(p.x - PYLON_TOP, p.y - PYLON_TOP).lineTo(p.x + PYLON_TOP, p.y + PYLON_TOP).moveTo(p.x + PYLON_TOP, p.y - PYLON_TOP).lineTo(p.x - PYLON_TOP, p.y + PYLON_TOP);
      const c = Math.cos(p.angle + Math.PI / 2);
      const s = Math.sin(p.angle + Math.PI / 2);
      tops.moveTo(p.x - c * 46, p.y - s * 46).lineTo(p.x + c * 46, p.y + s * 46);
    }
    tops.stroke({ width: 3, color: district.deck.clutter });
    pylonTops.addChild(tops);
    const yardLit = new Graphics();
    for (const y of layout.yards) {
      const c = Math.cos(y.angle);
      const s = Math.sin(y.angle);
      const at = (u: number, v: number) => [y.x + c * u - s * v, y.y + s * u + c * v];
      yardLit.poly([...at(-y.w / 2, -y.h / 2), ...at(y.w / 2, -y.h / 2), ...at(y.w / 2, y.h / 2), ...at(-y.w / 2, y.h / 2)], true).fill({ color: district.deck.seam }).stroke({ width: 3, color: district.deck.clutter });
      for (const [bx, by] of y.boxes) {
        const bat = (u: number, v: number): [number, number] => [bx + c * u - s * v, by + s * u + c * v];
        yardLit.poly([...bat(-22, -16), ...bat(22, -16), ...bat(22, 16), ...bat(-22, 16)], true).fill({ color: district.deck.clutter, alpha: 0.7 }).stroke({ width: 2, color: district.deck.clutter });
        for (let f = -2; f <= 2; f++) yardLit.moveTo(...bat(f * 8, -16)).lineTo(...bat(f * 8, 16));
        yardLit.stroke({ width: 1, color: district.deck.seam });
      }
    }
    deck.addChild(yardLit);
    const steam: Built["steam"] = [];
    const steamLayer = new Container();
    for (const v of layout.clutter.filter((c) => c.kind === "vent")) {
      for (let k = 0; k < STEAM_PUFFS; k++) {
        const sprite = new Sprite(soft);
        sprite.anchor.set(0.5);
        sprite.tint = 0x9aa0b8;
        steamLayer.addChild(sprite);
        steam.push({ sprite, x: v.x, y: v.y, phase: v.phase + k / STEAM_PUFFS });
      }
    }
    tall.addChild(poles, steamLayer, pylonTops);
    layers.tall.addChild(tall);

    const glow = new Container();
    const voidScene = buildVoidScene(layout.gaps, district, rng, soft);
    glow.addChild(voidScene.root);
    const lamps = new Container();
    lamps.isRenderGroup = true;
    const heads = new Graphics();
    for (const l of layout.lamps) heads.circle(l.x, l.y, 7).fill({ color: l.color, alpha: 0.8 });
    lamps.addChild(heads);
    const blinkers = new Container();
    blinkers.isRenderGroup = true;
    const blinkGroups = Array.from({ length: BLINK_GROUPS }, () => new Graphics());
    layout.blinkers.forEach((b, k) => blinkGroups[k % BLINK_GROUPS]!.circle(b.x, b.y, 5));
    for (const p of layout.pylons) blinkGroups[0]!.circle(p.x, p.y, 4);
    blinkGroups.forEach((g) => g.fill({ color: district.blinker }));
    blinkers.addChild(...blinkGroups);
    const boards = new Container();
    boards.isRenderGroup = true;
    const billboards = layout.billboards.map((data) => {
      const b = buildBillboard(data);
      boards.addChild(b.view);
      return { ...b, data };
    });
    const pylonGlow = new Container();
    const topGlow = new Graphics(tops.context);
    topGlow.tint = district.accents[0]!;
    topGlow.alpha = PYLON_GLOW;
    const arcs = new Graphics();
    const insulators = new Graphics();
    for (const p of layout.pylons) {
      const c = Math.cos(p.angle + Math.PI / 2);
      const s = Math.sin(p.angle + Math.PI / 2);
      for (const off of [-40, 0, 40]) insulators.circle(p.x + c * off, p.y + s * off, 4);
    }
    insulators.fill({ color: district.accents[2]! });
    pylonGlow.addChild(topGlow, insulators, arcs);
    const cables = new Graphics();
    const clutterGlow = new Graphics();
    drawClutterGlow(clutterGlow, layout, district.accents[0]!);
    const roof = new Graphics();
    for (let k = 0; k < layout.roofLines.length; k += 4) roof.moveTo(layout.roofLines[k]!, layout.roofLines[k + 1]!).lineTo(layout.roofLines[k + 2]!, layout.roofLines[k + 3]!);
    roof.stroke({ width: 3, color: district.roofLight, alpha: ROOF_GLOW });
    for (const w of layout.skylights) roof.rect(w.x, w.y, w.w, w.h);
    roof.fill({ color: district.lamp, alpha: SKYLIGHT_GLOW });
    for (const w of layout.skylights) if (w.tint < 0.3) roof.rect(w.x, w.y, w.w, w.h);
    roof.fill({ color: district.accents[1]!, alpha: SKYLIGHT_GLOW });
    const yardGlow = new Graphics();
    for (const y of layout.yards) for (const [nx, ny] of y.nodes) yardGlow.circle(nx, ny, 3.5);
    yardGlow.fill({ color: district.accents[0]! });
    const yardArcs = new Graphics();
    const glowStatic = new Container();
    glowStatic.isRenderGroup = true;
    glowStatic.addChild(roof, clutterGlow, yardGlow);
    glow.addChild(glowStatic, yardArcs, cables);
    glow.addChild(lamps, blinkers, boards, pylonGlow);
    layers.glow.addChild(glow);

    const sigRng = seeded(`${name}:signature`);
    const kit = {
      track,
      layout,
      district,
      rng: sigRng,
      soft,
      near: (count: number, clearance: number, gapMargin: number) => scatter(sigRng, track, layout.field, count, clearance, gapMargin),
      open: (count: number, minSep: number, minClear: number) => openSpots(layout, count, minSep, minClear),
      clear: (x: number, y: number, margin: number) => layout.field.edgeDistance(x, y) > margin && !layout.field.nearGap(x, y, 20),
    };
    const signatures = (district.signatures ?? []).map((kind) => SIGNATURES[kind](kit));
    const sigLifted: { container: Container; height: number }[] = [];
    for (const parts of signatures) {
      for (const c of parts.deck ?? []) deck.addChild(c);
      const sigGlow = new Container();
      for (const c of parts.glow ?? []) sigGlow.addChild(c);
      glowStatic.addChildAt(sigGlow, 0);
      for (const c of parts.live ?? []) glow.addChild(c);
      for (const l of parts.lifted ?? []) {
        (l.layer === "tall" ? tall : glow).addChild(l.container);
        l.container.isRenderGroup = true;
        sigLifted.push(l);
      }
    }

    return {
      layout,
      district,
      groups: [deck, tall, glow],
      lifted: [
        { container: lamps, height: LAMP_HEIGHT },
        { container: blinkers, height: BLINKER_HEIGHT },
        { container: boards, height: BILLBOARD_HEIGHT },
        { container: pylonTops, height: PYLON_HEIGHT },
        { container: pylonGlow, height: PYLON_HEIGHT },
        ...sigLifted,
      ],
      towers: signatures.flatMap((parts) => parts.towers ?? []),
      signatures,
      sunk: voidScene.layers,
      poles,
      steam,
      blinkGroups,
      billboards,
      arcs,
      arcFlash: null,
      nextArc: 0,
      cables,
      yardGlow,
      yardArcs,
      yardFlash: null,
      nextYardArc: 0,
      voidScene,
    };
  };

  const scaleFor = (offset: number) => 1 / (1 - offset / camera.scale);

  const place = (c: Container, s: number) => {
    c.scale.set(s);
    c.position.set(camera.x * (1 - s), camera.y * (1 - s));
  };

  const project = (x: number, y: number, s: number): [number, number] => [camera.x + (x - camera.x) * s, camera.y + (y - camera.y) * s];

  const viewOf = (t: number, dt: number): View => ({ t, dt, inView, lift: (x, y, h) => project(x, y, scaleFor(h)) });

  const inView = (x: number, y: number) => {
    const hw = 800 * camera.scale + CULL;
    const hh = 500 * camera.scale + CULL;
    return Math.abs(x - camera.x) < hw && Math.abs(y - camera.y) < hh;
  };

  return {
    get active() {
      return built !== null;
    },

    setTrack(track, name) {
      const key = name ?? null;
      if (track === currentTrack && key === currentName) return;
      currentTrack = track;
      currentName = key;
      clear();
      const district = districtFor(key);
      if (track && key && district) built = build(track, key, district);
    },

    update(cam, t, dt) {
      if (!built) return;
      camera = cam;
      time = t;
      const b = built;
      for (const { container, height } of b.lifted) place(container, scaleFor(height));
      for (const { container, depth } of b.sunk) place(container, scaleFor(-depth));

      b.poles.clear();
      const sl = scaleFor(LAMP_HEIGHT);
      for (const l of b.layout.lamps) {
        if (!inView(l.x, l.y)) continue;
        const [hx, hy] = project(l.x, l.y, sl);
        b.poles.moveTo(l.x, l.y).lineTo(hx, hy);
      }
      const sb = scaleFor(BILLBOARD_HEIGHT);
      for (const bb of b.layout.billboards) {
        if (!inView(bb.x, bb.y)) continue;
        const [hx, hy] = project(bb.x, bb.y, sb);
        b.poles.moveTo(bb.x, bb.y).lineTo(hx, hy);
      }
      b.poles.stroke({ width: 4, color: b.district.deck.clutter, alpha: 0.9 });
      const sp = scaleFor(PYLON_HEIGHT);
      for (const p of b.layout.pylons) {
        if (!inView(p.x, p.y)) continue;
        for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
          const [tx, ty] = project(p.x + u * PYLON_TOP, p.y + v * PYLON_TOP, sp);
          b.poles.moveTo(p.x + u * PYLON_BASE, p.y + v * PYLON_BASE).lineTo(tx, ty);
        }
      }
      b.poles.stroke({ width: 2.5, color: b.district.deck.clutter, alpha: 0.85 });
      for (const tw of b.towers) {
        if (!inView(tw.x, tw.y)) continue;
        b.poles.moveTo(tw.x, tw.y).lineTo(...project(tw.x, tw.y, scaleFor(tw.height)));
      }
      b.poles.stroke({ width: 4, color: lighten(b.district.deck.clutter, 20), alpha: 0.9 });

      for (const s of b.steam) {
        const u = (t * 0.22 + s.phase) % 1;
        s.sprite.position.set(s.x + u * 70, s.y - u * 40);
        s.sprite.scale.set((30 + u * 70) / soft.width);
        s.sprite.alpha = Math.sin(u * Math.PI) * 0.22;
      }
      b.blinkGroups.forEach((g, k) => (g.alpha = Math.sin(t * 2.4 + k * 2.1) > 0.55 ? 0.9 : 0.12));
      for (const bb of b.billboards) {
        const flicker = Math.sin(t * 37 + bb.data.phase * 50) > 0.97 ? 0.3 : 1;
        bb.view.alpha = 0.65 * flicker;
        bb.bars.forEach((bar, k) => (bar.alpha = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2 + k * 0.9 + bb.data.phase * 6))));
        bb.scan.x = (((t * 0.6 + bb.data.phase) % 1) - 0.5) * bb.data.w;
      }

      if (b.layout.cables.length && t >= b.nextArc) {
        const rng = seeded(`${Math.floor(t * 10)}`);
        b.nextArc = t + range(rng, 0.3, 0.9);
        const [ia, ib] = b.layout.cables[Math.floor(rng() * b.layout.cables.length)]!;
        const pa = b.layout.pylons[ia]!;
        const pb = b.layout.pylons[ib]!;
        const k0 = range(rng, 0.2, 0.7);
        const x0 = pa.x + (pb.x - pa.x) * k0;
        const y0 = pa.y + (pb.y - pa.y) * k0;
        b.arcs.clear();
        b.arcs.moveTo(x0, y0);
        const x1 = pa.x + (pb.x - pa.x) * Math.min(1, k0 + 0.25);
        const y1 = pa.y + (pb.y - pa.y) * Math.min(1, k0 + 0.25);
        const bolt: number[] = [x0, y0];
        for (let j = 1; j < 12; j++) bolt.push(x0 + ((x1 - x0) * j) / 12 + range(rng, -36, 36), y0 + ((y1 - y0) * j) / 12 + range(rng, -36, 36));
        bolt.push(x1, y1);
        b.arcs.poly(bolt, false).stroke({ width: 7, color: b.district.accents[0]!, alpha: 0.45 });
        b.arcs.poly(bolt, false).stroke({ width: 2.5, color: b.district.accents[2]!, alpha: 1 });
        b.arcFlash = { x: x0, y: y0, until: t + 0.16 };
      }
      if (b.arcFlash && t > b.arcFlash.until) {
        b.arcs.clear();
        b.arcFlash = null;
      }
      b.cables.clear();
      for (const [ia, ib] of b.layout.cables) {
        const pa = b.layout.pylons[ia]!;
        const pb = b.layout.pylons[ib]!;
        if (!inView(pa.x, pa.y) && !inView(pb.x, pb.y) && !inView((pa.x + pb.x) / 2, (pa.y + pb.y) / 2)) continue;
        for (const off of [-40, 40]) {
          const ox = Math.cos(pa.angle + Math.PI / 2) * off;
          const oy = Math.sin(pa.angle + Math.PI / 2) * off;
          for (let j = 0; j <= CABLE_STEPS; j++) {
            const u = j / CABLE_STEPS;
            const h = PYLON_HEIGHT * (1 - CABLE_SAG * 4 * u * (1 - u));
            const [x, y] = project(pa.x + (pb.x - pa.x) * u + ox, pa.y + (pb.y - pa.y) * u + oy, scaleFor(h));
            if (j === 0) b.cables.moveTo(x, y);
            else b.cables.lineTo(x, y);
          }
        }
      }
      b.cables.stroke({ width: 1.6, color: b.district.accents[0]!, alpha: CABLE_GLOW });

      b.yardGlow.alpha = 0.55 + 0.45 * Math.abs(Math.sin(t * 47) * Math.sin(t * 2.3));
      if (b.layout.yards.length && t >= b.nextYardArc) {
        const rng = seeded(`yard${Math.floor(t * 20)}`);
        b.nextYardArc = t + range(rng, 0.2, 0.7);
        const visible = b.layout.yards.filter((y) => inView(y.x, y.y));
        const yard = visible[Math.floor(rng() * visible.length)];
        b.yardArcs.clear();
        if (yard && yard.nodes.length > 1) {
          const a = yard.nodes[Math.floor(rng() * yard.nodes.length)]!;
          const z = yard.nodes[Math.floor(rng() * yard.nodes.length)]!;
          b.yardArcs.moveTo(a[0], a[1]);
          for (let j = 1; j < 8; j++) b.yardArcs.lineTo(a[0] + ((z[0] - a[0]) * j) / 8 + range(rng, -10, 10), a[1] + ((z[1] - a[1]) * j) / 8 + range(rng, -10, 10));
          b.yardArcs.lineTo(z[0], z[1]).stroke({ width: 2.5, color: b.district.accents[2]!, alpha: 0.95 });
          b.yardFlash = { x: (a[0] + z[0]) / 2, y: (a[1] + z[1]) / 2, until: t + 0.1 };
        }
      }
      if (b.yardFlash && t > b.yardFlash.until) {
        b.yardArcs.clear();
        b.yardFlash = null;
      }
      const view = viewOf(t, dt);
      for (const parts of b.signatures) parts.update?.(view);
      b.voidScene.update(t, dt);
    },

    ambient() {
      return built?.district.ambient ?? null;
    },

    weather() {
      return built?.district.weather ?? null;
    },

    edges() {
      return built?.district.edges ?? null;
    },

    lights() {
      if (!built) return [];
      const b = built;
      const out: SceneLight[] = [];
      for (const l of b.layout.lamps) if (inView(l.x, l.y)) out.push({ x: l.x + Math.cos(l.angle) * 30, y: l.y + Math.sin(l.angle) * 30, size: 400, color: l.color, alpha: 0.62 });
      for (const bb of b.billboards) {
        if (inView(bb.data.x, bb.data.y)) out.push({ x: bb.data.x, y: bb.data.y, size: 700, color: bb.data.color, alpha: 0.75 * bb.view.alpha });
      }
      if (b.arcFlash) {
        const [x, y] = project(b.arcFlash.x, b.arcFlash.y, scaleFor(PYLON_HEIGHT));
        out.push({ x, y, size: 900, color: b.district.accents[2]!, alpha: 1 });
      }
      const sp = scaleFor(PYLON_HEIGHT);
      for (const p of b.layout.pylons) {
        if (!inView(p.x, p.y)) continue;
        const [x, y] = project(p.x, p.y, sp);
        out.push({ x, y, size: 260, color: b.district.accents[0]!, alpha: 0.45 });
      }
      for (const y of b.layout.yards) if (inView(y.x, y.y)) out.push({ x: y.x, y: y.y, size: 480, color: b.district.accents[0]!, alpha: 0.45 });
      if (b.yardFlash) out.push({ x: b.yardFlash.x, y: b.yardFlash.y, size: 600, color: b.district.accents[2]!, alpha: 1 });
      const view = viewOf(time, 0);
      for (const parts of b.signatures) parts.lights?.(out, view);
      for (const v of b.layout.clutter) if (v.kind === "ac" && inView(v.x, v.y) && v.phase < 0.3) out.push({ x: v.x, y: v.y, size: 120, color: b.district.accents[0]!, alpha: 0.25 + 0.1 * Math.sin(time * 3 + v.phase * 9) });
      return out;
    },

    destroy() {
      clear();
      soft.destroy(true);
    },
  };
}
