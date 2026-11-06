import { Application, Container, Graphics, Rectangle, Text, TilingSprite } from "pixi.js";
import { AdvancedBloomFilter } from "pixi-filters";
import { pointAt, TRACK_WIDTH, VIEW, WORLD, type Camera, type Hazard, type Point, type Track } from "@neon/sim";
import { flat, offsetLoop } from "./geometry";
import { chevronAlpha, CHEVRONS, drawBoostChevrons, drawDangerLine, drawTrackEdges, drawTrackSurface, drawVoid } from "./features";
import { createBoostFx } from "./boost-fx";
import { drawHologram } from "./hologram";
import { calm, falloff, hit, release, settle, shakeCamera } from "./impact";
import { createLighting } from "./lighting";
import { createReflections } from "./reflections";
import { createScenery } from "./scenery";
import { createWeather } from "./weather";
import { HAZARD_COLORS, LIGHT, UI } from "./palette";
import { drawSlipstream } from "./slipstream";
import { grainTexture } from "./textures";
import type { AimView, CarView, FrameView, Renderer, SketchView } from "./types";

const TRAIL_LIFE = 1.4;
const TRAIL_STEP = 7;
const TRAIL_BUCKETS = 6;
const HAZARD_FADE = 0.6;
const CAR_LENGTH = 40;
const CAR_WIDTH = 20;
const ICE_RING = 38;
const GROUND_MARGIN = 3000;
const DEFAULT_EDGES: readonly [number, number] = [UI.edgeLeft, UI.edgeRight];

interface TrailPoint {
  x: number;
  y: number;
  t: number;
}

interface TrailRun {
  sides: [TrailPoint[], TrailPoint[]];
}

interface CarTrails {
  runs: TrailRun[];
  active: TrailRun | null;
  color: number;
}

interface CarSprite {
  root: Container;
  body: Graphics;
  ice: Graphics;
  tail: Graphics;
  you: Graphics;
  label: Text;
  color: number;
  name: string;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: number;
}

interface Fit {
  base: number;
  sw: number;
  sh: number;
  vx: number;
  vy: number;
  vw: number;
  vh: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function fitView(app: Application): Fit {
  const sw = app.screen.width;
  const sh = app.screen.height;
  const base = Math.min(sw / VIEW.width, sh / VIEW.height);
  const vw = VIEW.width * base;
  const vh = VIEW.height * base;
  return { base, sw, sh, vw, vh, vx: (sw - vw) / 2, vy: (sh - vh) / 2 };
}

function drawRoadSurface(g: Graphics, points: Point[], fill: { color: number; alpha: number }) {
  if (points.length < 3) return;
  g.poly(flat(points), true).stroke({ width: TRACK_WIDTH, color: fill.color, alpha: fill.alpha, join: "round" });
}

function drawRoadEdges(g: Graphics, points: Point[], edgeWidth: number, edges: [number, number], edgeAlpha = 1) {
  if (points.length < 3) return;
  const sides = [offsetLoop(points, -TRACK_WIDTH / 2), offsetLoop(points, TRACK_WIDTH / 2)];
  sides.forEach((side, k) => {
    const color = edges[k]!;
    g.poly(side, true).stroke({ width: edgeWidth * 4, color, alpha: 0.16 * edgeAlpha, join: "round" });
    g.poly(side, true).stroke({ width: edgeWidth, color, alpha: edgeAlpha, join: "round" });
  });
}

function drawTrackMarkings(g: Graphics, track: Track) {
  for (let s = 200; s < track.length - 100; s += 400) {
    const [x, y, a] = pointAt(track, s);
    const c = Math.cos(a);
    const n = Math.sin(a);
    const tip: Point = [x + c * 18, y + n * 18];
    g.moveTo(x - c * 10 - n * 22, y - n * 10 + c * 22)
      .lineTo(tip[0], tip[1])
      .lineTo(x - c * 10 + n * 22, y - n * 10 - c * 22)
      .stroke({ width: 3, color: UI.roadMark, alpha: 0.9, cap: "round", join: "round" });
  }

  const [sx, sy, sa] = pointAt(track, 0);
  const tx = Math.cos(sa);
  const ty = Math.sin(sa);
  const nx = -ty;
  const ny = tx;
  const cells = 10;
  const cell = TRACK_WIDTH / cells;
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < cells; i++) {
      if ((i + row) % 2) continue;
      const along = (row - 1) * cell;
      const across = -TRACK_WIDTH / 2 + i * cell;
      const ox = sx + tx * along + nx * across;
      const oy = sy + ty * along + ny * across;
      g.poly([ox, oy, ox + tx * cell, oy + ty * cell, ox + tx * cell + nx * cell, oy + ty * cell + ny * cell, ox + nx * cell, oy + ny * cell], true).fill({ color: UI.startLine, alpha: 0.85 });
    }
  }
  g.moveTo(sx - nx * TRACK_WIDTH * 0.5, sy - ny * TRACK_WIDTH * 0.5)
    .lineTo(sx + nx * TRACK_WIDTH * 0.5, sy + ny * TRACK_WIDTH * 0.5)
    .stroke({ width: 3, color: UI.startLine });
}

function drawGrid(g: Graphics) {
  g.rect(-GROUND_MARGIN, -GROUND_MARGIN, WORLD.width + GROUND_MARGIN * 2, WORLD.height + GROUND_MARGIN * 2).fill({ color: UI.ground });
  const minor = 100;
  for (let x = 0; x <= WORLD.width; x += minor) {
    g.moveTo(x, 0).lineTo(x, WORLD.height);
  }
  for (let y = 0; y <= WORLD.height; y += minor) {
    g.moveTo(0, y).lineTo(WORLD.width, y);
  }
  g.stroke({ width: 1.5, color: UI.grid, alpha: 0.55 });
  for (let x = 0; x <= WORLD.width; x += 500) g.moveTo(x, 0).lineTo(x, WORLD.height);
  for (let y = 0; y <= WORLD.height; y += 500) g.moveTo(0, y).lineTo(WORLD.width, y);
  g.stroke({ width: 2.5, color: UI.gridMajor, alpha: 0.6 });
  g.rect(0, 0, WORLD.width, WORLD.height).stroke({ width: 8, color: UI.worldFrame, alpha: 0.5 });
}

function dashedCircle(g: Graphics, x: number, y: number, r: number, phase: number) {
  const dashes = Math.max(8, Math.round((Math.PI * 2 * r) / 28));
  const step = (Math.PI * 2) / dashes;
  for (let i = 0; i < dashes; i++) {
    const a0 = phase + i * step;
    g.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r).arc(x, y, r, a0, a0 + step * 0.55);
  }
}

function drawCarBody(g: Graphics) {
  const hl = CAR_LENGTH / 2;
  const hw = CAR_WIDTH / 2;
  g.roundRect(-hl, -hw, CAR_LENGTH, CAR_WIDTH, 6).fill({ color: 0xffffff, alpha: 0.18 }).stroke({ width: 3, color: 0xffffff });
  g.moveTo(hl - 13, -hw + 3).lineTo(hl - 9, 0).lineTo(hl - 13, hw - 3).stroke({ width: 2.5, color: 0xffffff, join: "round" });
  g.moveTo(-hl + 5, -hw + 4).lineTo(-hl + 5, hw - 4).stroke({ width: 2, color: 0xffffff, alpha: 0.7 });
  g.circle(hl - 2, -hw + 4, 2.2).circle(hl - 2, hw - 4, 2.2).fill({ color: 0xffffff });
}

function drawIce(g: Graphics) {
  g.circle(0, 0, ICE_RING).fill({ color: UI.ice, alpha: 0.18 }).stroke({ width: 3, color: UI.ice, alpha: 0.9 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.moveTo(Math.cos(a) * (ICE_RING - 8), Math.sin(a) * (ICE_RING - 8)).lineTo(Math.cos(a) * (ICE_RING + 9), Math.sin(a) * (ICE_RING + 9));
  }
  g.stroke({ width: 2, color: UI.ice, alpha: 0.8 });
}

function drawTailLamps(g: Graphics) {
  const x = -CAR_LENGTH / 2 - 1;
  const hw = CAR_WIDTH / 2;
  g.roundRect(x - 2, -hw + 2, 4, 6, 1.5).roundRect(x - 2, hw - 8, 4, 6, 1.5).fill({ color: LIGHT.tail });
}

function drawYou(g: Graphics) {
  g.moveTo(-9, -10).lineTo(0, 0).lineTo(9, -10).stroke({ width: 3, color: 0xffffff, join: "round", cap: "round" });
}

export function createRenderer(app: Application): Renderer {
  const root = new Container();
  const litLayer = new Container();
  const fxRoot = new Container();
  const fxLayer = new Container();
  const labelLayer = new Container();
  const letterbox = new Graphics();

  const bloom = new AdvancedBloomFilter({ threshold: 0.3, bloomScale: 1.25, brightness: 1, blur: 5, quality: 4 });
  fxRoot.filters = [bloom];
  fxRoot.filterArea = new Rectangle(0, 0, app.screen.width, app.screen.height);

  const grid = new Graphics();
  drawGrid(grid);
  const roadG = new Graphics();
  const grainTex = grainTexture();
  const grain = new TilingSprite({ texture: grainTex, width: WORLD.width + GROUND_MARGIN * 2, height: WORLD.height + GROUND_MARGIN * 2 });
  grain.position.set(-GROUND_MARGIN, -GROUND_MARGIN);
  grain.alpha = UI.grain;
  const trailsG = new Graphics();
  const hazardZoneG = new Graphics();
  grainTex.source.addressMode = "repeat";
  const voidG = new Graphics();
  const sceneryDeck = new Container();
  const sceneryTall = new Container();
  const sceneryGlow = new Container();
  const scenery = createScenery({ deck: sceneryDeck, tall: sceneryTall, glow: sceneryGlow });
  litLayer.addChild(grid, sceneryDeck, grain, voidG, sceneryTall, roadG, trailsG, hazardZoneG);
  const lighting = createLighting(app);

  const edgesG = new Graphics();
  const hazardG = new Graphics();
  const sketchG = new Graphics();
  const carsLayer = new Container();
  const slipstreamG = new Graphics();
  const aimG = new Graphics();
  const sparksG = new Graphics();
  const boostLayers = Array.from({ length: CHEVRONS }, () => new Graphics());
  const dangerG = new Graphics();
  const boostFx = createBoostFx({ length: CAR_LENGTH, width: CAR_WIDTH });
  fxLayer.addChild(sceneryGlow, edgesG, ...boostLayers, dangerG, hazardG, sketchG, slipstreamG, boostFx.view, carsLayer, aimG, sparksG);
  const reflections = createReflections();
  fxLayer.addChildAt(reflections.view, 0);
  fxRoot.addChild(fxLayer);
  const weather = createWeather();
  root.addChild(litLayer, lighting.view, fxRoot, weather.view, labelLayer, letterbox);
  app.stage.addChild(root);

  const cars = new Map<string, CarSprite>();
  const trails = new Map<string, CarTrails>();
  let sparks: Spark[] = [];
  let currentTrack: Track | null = null;
  let currentEdges: readonly [number, number] = DEFAULT_EDGES;
  let camera: Camera = { x: WORLD.width / 2, y: WORLD.height / 2, scale: 1 };
  let lastFitKey = "";
  let lastTime = performance.now();
  let jolt = calm();

  const applyCamera = (fit: Fit) => {
    const zoom = fit.base / camera.scale;
    for (const layer of [litLayer, fxLayer, labelLayer]) {
      layer.scale.set(zoom);
      layer.position.set(fit.sw / 2 - camera.x * zoom, fit.sh / 2 - camera.y * zoom);
    }
  };

  const updateLetterbox = (fit: Fit) => {
    const key = `${fit.sw}x${fit.sh}`;
    if (key === lastFitKey) return;
    lastFitKey = key;
    fxRoot.filterArea = new Rectangle(0, 0, fit.sw, fit.sh);
    letterbox.clear();
    const { vx, vy, vw, vh, sw, sh } = fit;
    if (vy > 0) letterbox.rect(0, 0, sw, vy).rect(0, vy + vh, sw, sh - vy - vh);
    if (vx > 0) letterbox.rect(0, vy, vx, vh).rect(vx + vw, vy, sw - vx - vw, vh);
    letterbox.fill({ color: UI.letterbox });
    letterbox.rect(vx, vy, vw, vh).stroke({ width: 1, color: UI.viewFrame, alpha: 0.8 });
  };

  const spriteFor = (car: CarView): CarSprite => {
    let sprite = cars.get(car.id);
    if (!sprite) {
      const spriteRoot = new Container();
      const body = new Graphics();
      drawCarBody(body);
      const ice = new Graphics();
      drawIce(ice);
      const tail = new Graphics();
      drawTailLamps(tail);
      const you = new Graphics();
      drawYou(you);
      spriteRoot.addChild(ice, body, tail, you);
      carsLayer.addChild(spriteRoot);
      const label = new Text({ text: car.name, style: { fontFamily: "ui-monospace, Menlo, monospace", fontSize: 15, fill: car.color, fontWeight: "600" } });
      label.anchor.set(0.5, 1);
      labelLayer.addChild(label);
      sprite = { root: spriteRoot, body, ice, tail, you, label, color: car.color, name: car.name };
      cars.set(car.id, sprite);
    }
    if (sprite.name !== car.name) {
      sprite.label.text = car.name;
      sprite.name = car.name;
    }
    if (sprite.color !== car.color) {
      sprite.label.style.fill = car.color;
      sprite.color = car.color;
    }
    return sprite;
  };

  const updateCars = (views: CarView[], t: number) => {
    const seen = new Set<string>();
    const ui = camera.scale;
    for (const car of views) {
      seen.add(car.id);
      const sprite = spriteFor(car);
      const visible = car.alive;
      sprite.root.visible = visible;
      sprite.label.visible = visible;
      if (!visible) continue;
      sprite.root.position.set(car.x, car.y);
      sprite.body.rotation = car.angle;
      sprite.body.tint = car.frozen ? UI.ice : car.color;
      sprite.body.alpha = car.frozen ? 0.85 : 1;
      sprite.ice.visible = car.frozen;
      sprite.tail.visible = !car.frozen;
      sprite.tail.rotation = car.angle;
      sprite.tail.alpha = 0.3 + 0.7 * lighting.brakeOf(car.id);
      sprite.ice.rotation = t * 0.6;
      sprite.you.visible = car.isYou;
      sprite.you.tint = car.color;
      sprite.you.scale.set(ui);
      sprite.you.position.set(0, -(30 + 4 * Math.sin(t * 5)) * ui);
      sprite.label.scale.set(ui);
      sprite.label.position.set(car.x, car.y - (car.isYou ? 44 : 26) * ui);
    }
    for (const [id, sprite] of cars) {
      if (seen.has(id)) continue;
      sprite.root.destroy({ children: true });
      sprite.label.destroy();
      cars.delete(id);
    }
  };

  const updateTrails = (views: CarView[], t: number) => {
    for (const car of views) {
      let entry = trails.get(car.id);
      if (!entry) {
        entry = { runs: [], active: null, color: car.color };
        trails.set(car.id, entry);
      }
      entry.color = car.color;
      if (!car.drifting || !car.alive || car.frozen) {
        entry.active = null;
        continue;
      }
      if (!entry.active) {
        entry.active = { sides: [[], []] };
        entry.runs.push(entry.active);
      }
      const c = Math.cos(car.angle);
      const s = Math.sin(car.angle);
      const rx = car.x - c * (CAR_LENGTH / 2 - 6);
      const ry = car.y - s * (CAR_LENGTH / 2 - 6);
      const half = CAR_WIDTH / 2 - 2;
      const wheels: [number, number][] = [
        [rx + s * half, ry - c * half],
        [rx - s * half, ry + c * half],
      ];
      entry.active.sides.forEach((side, k) => {
        const [wx, wy] = wheels[k]!;
        const last = side[side.length - 1];
        if (!last || Math.hypot(wx - last.x, wy - last.y) >= TRAIL_STEP) side.push({ x: wx, y: wy, t });
      });
    }

    trailsG.clear();
    for (const [id, entry] of trails) {
      for (const run of entry.runs) {
        for (const side of run.sides) {
          while (side.length && t - side[0]!.t > TRAIL_LIFE) side.shift();
          strokeTrail(side, entry.color, t);
        }
      }
      entry.runs = entry.runs.filter((run) => run === entry.active || run.sides[0].length > 0);
      if (!entry.runs.length && !views.some((v) => v.id === id)) trails.delete(id);
    }
  };

  const strokeTrail = (side: TrailPoint[], color: number, t: number) => {
    if (side.length < 2) return;
    const bucketOf = (p: TrailPoint) => Math.ceil(clamp01(1 - (t - p.t) / TRAIL_LIFE) * TRAIL_BUCKETS);
    let bucket = bucketOf(side[1]!);
    trailsG.moveTo(side[0]!.x, side[0]!.y);
    for (let i = 1; i < side.length; i++) {
      const p = side[i]!;
      const b = bucketOf(p);
      if (b !== bucket) {
        trailsG.stroke({ width: 4, color, alpha: (bucket / TRAIL_BUCKETS) * 0.6, cap: "round", join: "round" });
        const prev = side[i - 1]!;
        trailsG.moveTo(prev.x, prev.y);
        bucket = b;
      }
      trailsG.lineTo(p.x, p.y);
    }
    trailsG.stroke({ width: 4, color, alpha: (bucket / TRAIL_BUCKETS) * 0.6, cap: "round", join: "round" });
  };

  const drawHazard = (h: Hazard, now: number, carsById: Map<string, CarView>) => {
    const color = HAZARD_COLORS[h.kind];
    const target = h.targetId ? carsById.get(h.targetId) : undefined;
    const x = target?.x ?? h.x;
    const y = target?.y ?? h.y;
    const fade = clamp01((h.expiresAt - now) / HAZARD_FADE);
    const radius = h.kind === "freeze" ? ICE_RING + 8 : h.radius;

    if (now < h.armsAt) {
      drawHologram({ line: hazardG, zone: hazardZoneG }, h, x, y, radius, color, now);
      return;
    }

    if (h.kind === "block") {
      const sides = 8;
      const pts: number[] = [];
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2 + Math.PI / sides;
        pts.push(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
      }
      hazardZoneG.poly(pts, true).fill({ color, alpha: 0.45 * fade });
      hazardG.poly(pts, true).stroke({ width: 6, color, alpha: fade, join: "round" });
      hazardG.poly(pts.map((v, i) => (i % 2 ? y + (v - y) * 0.6 : x + (v - x) * 0.6)), true).stroke({ width: 3, color, alpha: 0.7 * fade });
      return;
    }

    if (h.kind === "slow") {
      hazardZoneG.circle(x, y, radius).fill({ color, alpha: 0.25 * fade });
      hazardG.circle(x, y, radius).stroke({ width: 3, color, alpha: 0.65 * fade });
      const ripple = (now * 0.8) % 1;
      hazardG.circle(x, y, radius * ripple).stroke({ width: 2, color, alpha: 0.5 * (1 - ripple) * fade });
      return;
    }

    hazardZoneG.circle(x, y, radius).fill({ color: UI.ice, alpha: 0.3 * fade });
    hazardG.circle(x, y, radius).stroke({ width: 5, color, alpha: fade });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + now;
      hazardG.moveTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius).lineTo(x + Math.cos(a) * (radius + 14), y + Math.sin(a) * (radius + 14));
    }
    hazardG.stroke({ width: 3, color, alpha: fade, cap: "round" });
  };

  const drawSketch = (sketch: SketchView | undefined) => {
    sketchG.clear();
    if (!sketch) return;
    const px = camera.scale;
    if (sketch.preview && sketch.preview.length >= 3) {
      const color = sketch.valid ? UI.valid : UI.invalid;
      drawRoadSurface(sketchG, sketch.preview, { color, alpha: 0.12 });
      drawRoadEdges(sketchG, sketch.preview, 3 * px, [color, color], 0.9);
    }
    if (sketch.points.length >= 2) {
      const pts = flat(sketch.points);
      sketchG.poly(pts, false).stroke({ width: 10 * px, color: UI.sketchStroke, alpha: 0.15, join: "round", cap: "round" });
      sketchG.poly(pts, false).stroke({ width: 2.5 * px, color: UI.sketchStroke, alpha: 0.95, join: "round", cap: "round" });
    }
    const first = sketch.points[0];
    if (first) sketchG.circle(first[0], first[1], 6 * px).fill({ color: UI.sketchStroke });
  };

  const drawAim = (aim: AimView | null | undefined, now: number) => {
    aimG.clear();
    if (!aim) return;
    const color = HAZARD_COLORS[aim.kind];
    const alpha = aim.ready ? 0.9 : 0.3;
    const px = camera.scale;
    if (aim.ready) aimG.circle(aim.x, aim.y, aim.radius).stroke({ width: 3 * px, color, alpha });
    else dashedCircle(aimG, aim.x, aim.y, aim.radius, now);
    if (!aim.ready) aimG.stroke({ width: 3 * px, color, alpha });
    const arm = 12 * px;
    aimG.moveTo(aim.x - arm, aim.y).lineTo(aim.x + arm, aim.y).moveTo(aim.x, aim.y - arm).lineTo(aim.x, aim.y + arm).stroke({ width: 2 * px, color, alpha });
  };

  const updateSparks = (dt: number) => {
    sparksG.clear();
    sparks = sparks.filter((p) => (p.life -= dt) > 0);
    for (const p of sparks) {
      const drag = Math.exp(-3 * dt);
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      sparksG.moveTo(p.x, p.y).lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04).stroke({ width: 3, color: p.color, alpha: p.life / p.max, cap: "round" });
    }
  };

  return {
    render(frame: FrameView) {
      const wall = performance.now();
      const dt = Math.min(0.1, (wall - lastTime) / 1000);
      lastTime = wall;
      const t = wall / 1000;
      const halted = jolt.stop > 0;
      jolt = settle(jolt, dt);
      if (halted) return;

      camera = shakeCamera(frame.camera, jolt.trauma, t);
      const fit = fitView(app);
      updateLetterbox(fit);
      applyCamera(fit);

      scenery.setTrack(frame.track, frame.trackName);
      const edges = scenery.edges() ?? DEFAULT_EDGES;
      if (frame.track !== currentTrack || edges !== currentEdges) {
        currentTrack = frame.track;
        currentEdges = edges;
        if (currentTrack) {
          drawTrackSurface(roadG, currentTrack, grainTex, UI.grain);
          drawTrackMarkings(roadG, currentTrack);
          drawVoid(voidG, currentTrack);
          drawTrackEdges(edgesG, currentTrack, edges);
          drawBoostChevrons(boostLayers, currentTrack);
        } else {
          for (const g of [roadG, voidG, edgesG, ...boostLayers]) g.clear();
        }
      }

      const carsById = new Map(frame.cars.map((c) => [c.id, c]));
      hazardG.clear();
      hazardZoneG.clear();
      for (const h of frame.hazards) drawHazard(h, frame.now, carsById);

      updateTrails(frame.cars, t);
      boostFx.update(frame.cars, t, dt);
      updateCars(frame.cars, t);
      drawSlipstream(slipstreamG, frame.cars, t);
      drawSketch(frame.sketch);
      drawAim(frame.aim, t);
      updateSparks(dt);
      grid.visible = !scenery.active;
      scenery.update(camera, t, dt);
      const skyFlashes = weather.update(frame.sketch ? null : scenery.weather(), { x: fit.vx, y: fit.vy, w: fit.vw, h: fit.vh, zoom: fit.base / camera.scale }, camera, t, { seed: frame.trackName ?? "", now: frame.now });
      boostLayers.forEach((g, k) => (g.alpha = chevronAlpha(k, t)));
      drawDangerLine(dangerG, frame.track, frame.dangerLine, t);
      const extraLights = scenery.lights();
      for (const f of skyFlashes) {
        const zoom = fit.base / camera.scale;
        extraLights.push({ x: camera.x + (f.x - fit.sw / 2) / zoom, y: camera.y + (f.y - fit.sh / 2) / zoom, size: 1400 * camera.scale, color: f.color, alpha: 0.55 * f.alpha });
      }
      reflections.update({ wet: !frame.sketch && scenery.weather()?.rain === true, track: frame.track, edges, cars: frame.cars, lights: extraLights, brakeOf: lighting.brakeOf, t });
      lighting.update({ edges, ambient: scenery.ambient(), extra: extraLights, dangerLine: frame.dangerLine ?? null, t, camera, base: fit.base, sw: fit.sw, sh: fit.sh, track: frame.track, cars: frame.cars, hazards: frame.hazards, now: frame.now, aim: frame.aim, bright: frame.sketch !== undefined, dt });
      jolt = release(jolt);
    },

    screenToWorld(px: number, py: number): Point {
      const fit = fitView(app);
      const zoom = fit.base / camera.scale;
      return [camera.x + (px - fit.sw / 2) / zoom, camera.y + (py - fit.sh / 2) / zoom];
    },

    burst(x: number, y: number, color: number) {
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2;
        const speed = 180 + Math.random() * 420;
        const max = 0.35 + Math.random() * 0.35;
        sparks.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: max, max, color });
      }
      lighting.flash(x, y, color);
    },

    impact(x: number, y: number, strength: number) {
      jolt = hit(jolt, strength * falloff(x - camera.x, y - camera.y, (VIEW.width * camera.scale) / 2));
    },

    destroy() {
      app.stage.removeChild(root);
      fxRoot.filters = [];
      bloom.destroy();
      scenery.destroy();
      weather.destroy();
      lighting.destroy();
      reflections.destroy();
      boostFx.destroy();
      root.destroy({ children: true });
      grainTex.destroy(true);
      cars.clear();
      trails.clear();
      sparks = [];
    },
  };
}
