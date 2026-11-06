import { Application, Container, Graphics, RenderTexture, Sprite, Texture } from "pixi.js";
import { pointAt, TRACK_WIDTH, type Camera, type Hazard, type Track } from "@neon/sim";
import { acrossTrack, edgeRuns, offsetLoop, pick, trackPoints } from "./geometry";
import { HAZARD_COLORS, LIGHT, UI } from "./palette";
import { coneLightTexture, softLightTexture } from "./textures";
import type { AimView, CarView } from "./types";

const RESOLUTION = 0.5;
const FLASH_LIFE = 0.45;
const HAZARD_FADE = 0.6;
const SPILL_STEPS = 9;

interface Flash {
  x: number;
  y: number;
  color: number;
  life: number;
}

interface CarLightState {
  speed: number;
  brake: number;
}

export interface LightFrame {
  camera: Camera;
  base: number;
  sw: number;
  sh: number;
  track: Track | null;
  cars: CarView[];
  hazards: Hazard[];
  now: number;
  aim: AimView | null | undefined;
  bright: boolean;
  dt: number;
  t: number;
  dangerLine: number | null;
  extra: readonly { x: number; y: number; size: number; color: number; alpha: number }[];
}

export interface Lighting {
  readonly view: Sprite;
  update(frame: LightFrame): void;
  flash(x: number, y: number, color: number): void;
  brakeOf(id: string): number;
  destroy(): void;
}

const toRgb = (c: number): [number, number, number] => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function drawEdgeSpill(g: Graphics, track: Track) {
  g.clear();
  const points = trackPoints(track);
  const sides: [number[], number][] = [
    [offsetLoop(points, -TRACK_WIDTH / 2), UI.edgeLeft],
    [offsetLoop(points, TRACK_WIDTH / 2), UI.edgeRight],
  ];
  for (const run of edgeRuns(track)) {
    for (const [side, neon] of sides) {
      const line = pick(side, run.indices);
      const color = run.drop ? LIGHT.drop : neon;
      for (let i = 0; i < SPILL_STEPS; i++) {
        g.poly(line, run.closed).stroke({ width: 12 + (200 * (i + 1)) / SPILL_STEPS, color, alpha: run.drop ? 0.07 : 0.045, join: "round" });
      }
    }
  }
}

export function createLighting(app: Application): Lighting {
  const soft = softLightTexture();
  const cone = coneLightTexture();
  let rt = RenderTexture.create({ width: 2, height: 2 });
  const view = new Sprite(rt);
  view.blendMode = "multiply";

  const root = new Container();
  const world = new Container();
  root.addChild(world);
  const spill = new Graphics();
  spill.blendMode = "add";
  const dynamic = new Container();
  world.addChild(spill, dynamic);

  const pool: Sprite[] = [];
  let used = 0;
  let currentTrack: Track | null = null;
  let flashes: Flash[] = [];
  const carState = new Map<string, CarLightState>();
  const ambient = toRgb(LIGHT.ambient);
  const bright = toRgb(LIGHT.ambientBright);
  const clearColor: [number, number, number, number] = [0, 0, 0, 1];

  const light = (texture: Texture, x: number, y: number, size: number, color: number, alpha: number, rotation = 0, anchorX = 0.5) => {
    if (alpha <= 0.01) return;
    let s = pool[used];
    if (!s) {
      s = new Sprite(texture);
      s.blendMode = "add";
      pool.push(s);
      dynamic.addChild(s);
    }
    used++;
    s.visible = true;
    s.texture = texture;
    s.anchor.set(anchorX, 0.5);
    s.position.set(x, y);
    s.rotation = rotation;
    s.scale.set(size / texture.width);
    s.tint = color;
    s.alpha = Math.min(1, alpha);
  };

  const carLights = (car: CarView, dt: number) => {
    let state = carState.get(car.id);
    if (!state) {
      state = { speed: car.speed, brake: 0 };
      carState.set(car.id, state);
    }
    if (dt > 0) {
      const decel = (state.speed - car.speed) / dt;
      const target = decel > 120 && car.speed > 5 ? 1 : 0;
      state.brake += (target - state.brake) * Math.min(1, dt * (target ? 20 : 6));
      state.speed = car.speed;
    }
    if (!car.alive) return;

    const c = Math.cos(car.angle);
    const s = Math.sin(car.angle);
    if (car.frozen) {
      light(soft, car.x, car.y, 340, LIGHT.frozen, 1);
      return;
    }
    light(soft, car.x, car.y, 260, car.color, 0.6);
    light(soft, car.x, car.y, 110, car.color, 0.5);
    const speedFrac = clamp01(car.speed / 650);
    const reach = 300 + 160 * speedFrac;
    const hx = car.x + c * 16;
    const hy = car.y + s * 16;
    for (const side of [-1, 1]) {
      light(cone, hx - s * side * 6, hy + c * side * 6, reach, LIGHT.headlight, 0.8 + 0.2 * speedFrac, car.angle, 0);
    }
    light(soft, hx + c * 6, hy + s * 6, 70, LIGHT.headlight, 0.8);
    const rx = car.x - c * 22;
    const ry = car.y - s * 22;
    light(soft, rx, ry, 80 + 120 * state.brake, LIGHT.tail, 0.5 + 0.5 * state.brake);
    if (state.brake > 0.05) light(soft, rx - c * 30, ry - s * 30, 150, LIGHT.tail, state.brake);
  };

  const hazardLights = (h: Hazard, now: number, carsById: Map<string, CarView>) => {
    const color = h.kind === "freeze" ? LIGHT.frozen : HAZARD_COLORS[h.kind];
    const target = h.targetId ? carsById.get(h.targetId) : undefined;
    const x = target?.x ?? h.x;
    const y = target?.y ?? h.y;
    const radius = h.kind === "freeze" ? 120 : h.radius;
    if (now < h.armsAt) {
      light(soft, x, y, radius * 3, color, 0.4 + 0.25 * Math.sin(now * 14));
      return;
    }
    const fade = clamp01((h.expiresAt - now) / HAZARD_FADE);
    const pulse = 0.8 + 0.2 * Math.sin(now * 5 + h.id);
    light(soft, x, y, radius * 3.6, color, fade * pulse);
    light(soft, x, y, radius * 1.6, color, 0.6 * fade * pulse);
  };

  return {
    view,

    update(frame) {
      const rw = Math.max(2, Math.ceil(frame.sw * RESOLUTION));
      const rh = Math.max(2, Math.ceil(frame.sh * RESOLUTION));
      if (rt.width !== rw || rt.height !== rh) {
        rt.destroy(true);
        rt = RenderTexture.create({ width: rw, height: rh });
        view.texture = rt;
      }
      view.scale.set(frame.sw / rw, frame.sh / rh);

      const zoom = (frame.base / frame.camera.scale) * RESOLUTION;
      world.scale.set(zoom);
      world.position.set(rw / 2 - frame.camera.x * zoom, rh / 2 - frame.camera.y * zoom);

      if (frame.track !== currentTrack) {
        currentTrack = frame.track;
        if (currentTrack) drawEdgeSpill(spill, currentTrack);
        else spill.clear();
      }

      used = 0;
      if (currentTrack) {
        const [sx, sy] = pointAt(currentTrack, 0);
        light(soft, sx, sy, TRACK_WIDTH * 2.4, LIGHT.startLine, 0.55);
        for (const c of currentTrack.boosts) {
          const [bx, by] = pointAt(currentTrack, c);
          light(soft, bx, by, 420, LIGHT.boost, 0.6 + 0.25 * Math.sin(frame.t * 6 + c));
        }
        if (frame.dangerLine !== null) {
          const pulse = 0.85 + 0.15 * Math.sin(frame.t * 9);
          const [dx, dy] = pointAt(currentTrack, frame.dangerLine);
          light(soft, dx, dy, 620, LIGHT.danger, pulse);
          for (const side of [-1, 1]) {
            const [ex, ey] = acrossTrack(currentTrack, frame.dangerLine, side * (TRACK_WIDTH / 2 + 70));
            light(soft, ex, ey, 220, LIGHT.danger, pulse);
          }
        }
      }
      for (const l of frame.extra) light(soft, l.x, l.y, l.size, l.color, l.alpha);
      const carsById = new Map(frame.cars.map((c) => [c.id, c]));
      for (const h of frame.hazards) hazardLights(h, frame.now, carsById);
      for (const car of frame.cars) carLights(car, frame.dt);
      for (const id of carState.keys()) if (!carsById.has(id)) carState.delete(id);
      if (frame.aim) light(soft, frame.aim.x, frame.aim.y, frame.aim.radius * 2.6, HAZARD_COLORS[frame.aim.kind], frame.aim.ready ? 0.35 : 0.12);

      flashes = flashes.filter((f) => (f.life -= frame.dt) > 0);
      for (const f of flashes) {
        const k = f.life / FLASH_LIFE;
        light(soft, f.x, f.y, 700 * (1.4 - 0.4 * k), f.color, Math.min(1, k * 1.5));
        light(soft, f.x, f.y, 260, 0xffffff, k);
      }
      for (let i = used; i < pool.length; i++) pool[i]!.visible = false;

      const amb = frame.bright ? bright : ambient;
      clearColor[0] = amb[0];
      clearColor[1] = amb[1];
      clearColor[2] = amb[2];
      app.renderer.render({ container: root, target: rt, clear: true, clearColor });
    },

    brakeOf(id) {
      return carState.get(id)?.brake ?? 0;
    },

    flash(x, y, color) {
      flashes.push({ x, y, color, life: FLASH_LIFE });
    },

    destroy() {
      root.destroy({ children: true });
      view.destroy();
      rt.destroy(true);
      soft.destroy(true);
      cone.destroy(true);
      carState.clear();
    },
  };
}
