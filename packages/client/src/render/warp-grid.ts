import { Container, Graphics } from "pixi.js";
import { MAX_SCALE, VIEW, type Camera } from "@neon/sim";
import { createField, drag, heat, push, REST, shift, SPRING, stepField } from "./warp-math";
import type { CarView } from "./types";

export const WARP = {
  spacing: 50,
  margin: 2,
  kick: 650,
  impact: 0.6,
  reach: 160,
  reachGrow: 260,
  boostKick: 0.35,
  wakeFrom: 350,
  wakeTo: 850,
  wakeGain: 2.4,
  wakeBoost: 1.6,
  wakeRadius: 90,
};

const LEVELS = [0.06, 0.25, 0.55] as const;
const STYLES = [
  { width: 1.2, color: 0x2a4dff, alpha: 0.3 },
  { width: 1.6, color: 0x3d8bff, alpha: 0.55 },
  { width: 2.2, color: 0x5fd8ff, alpha: 0.8 },
  { width: 2.8, color: 0xc8f6ff, alpha: 1 },
];

const COLS = Math.ceil((VIEW.width * MAX_SCALE) / WARP.spacing) + WARP.margin * 2 + 1;
const ROWS = Math.ceil((VIEW.height * MAX_SCALE) / WARP.spacing) + WARP.margin * 2 + 1;

interface CarMark {
  boosting: boolean;
  frame: number;
}

export interface WarpGrid {
  readonly view: Container;
  shockwave(x: number, y: number, strength: number): void;
  update(camera: Camera, cars: CarView[], dt: number): void;
  destroy(): void;
}

const levelOf = (h: number) => (h >= LEVELS[2] ? 3 : h >= LEVELS[1] ? 2 : h >= LEVELS[0] ? 1 : 0);

export function createWarpGrid(): WarpGrid {
  const S = WARP.spacing;
  const view = new Container();
  const layers = STYLES.map(() => new Graphics());
  view.addChild(...layers);
  const field = createField(COLS, ROWS, S);
  const marks = new Map<string, CarMark>();
  let originI = 0;
  let originJ = 0;
  let placed = false;
  let acc = 0;
  let frame = 0;
  let awake = true;
  const drawn = new Float64Array(4).fill(NaN);

  const recentre = (camera: Camera) => {
    const ci = Math.floor(camera.x / S) - (COLS >> 1);
    const cj = Math.floor(camera.y / S) - (ROWS >> 1);
    if (!placed) {
      originI = ci;
      originJ = cj;
      placed = true;
      return;
    }
    if (ci === originI && cj === originJ) return;
    shift(field, ci - originI, cj - originJ);
    originI = ci;
    originJ = cj;
  };

  const wake = (car: CarView, dt: number) => {
    const k = Math.min(1, (car.speed - WARP.wakeFrom) / (WARP.wakeTo - WARP.wakeFrom));
    if (k <= 0) return;
    const gain = WARP.wakeGain * k * car.speed * dt * (car.boosting ? WARP.wakeBoost : 1);
    drag(field, car.x - originI * S, car.y - originJ * S, Math.cos(car.angle) * gain, Math.sin(car.angle) * gain, WARP.wakeRadius);
    awake = true;
  };

  const shockwave = (x: number, y: number, strength: number) => {
    if (!placed || strength === 0) return;
    push(field, x - originI * S, y - originJ * S, strength * WARP.kick, WARP.reach + WARP.reachGrow * Math.min(1, Math.abs(strength)));
    awake = true;
  };

  const draw = (camera: Camera) => {
    const hw = (VIEW.width * camera.scale) / 2 + S;
    const hh = (VIEW.height * camera.scale) / 2 + S;
    const i0 = Math.max(0, Math.floor((camera.x - hw) / S) - originI);
    const i1 = Math.min(COLS - 1, Math.ceil((camera.x + hw) / S) - originI);
    const j0 = Math.max(0, Math.floor((camera.y - hh) / S) - originJ);
    const j1 = Math.min(ROWS - 1, Math.ceil((camera.y + hh) / S) - originJ);
    const same = drawn[0] === originI + i0 && drawn[1] === originI + i1 && drawn[2] === originJ + j0 && drawn[3] === originJ + j1;
    if (!awake && same) return;
    drawn[0] = originI + i0;
    drawn[1] = originI + i1;
    drawn[2] = originJ + j0;
    drawn[3] = originJ + j1;
    for (const g of layers) g.clear();
    const { dx, dy } = field;
    const bx = originI * S;
    const by = originJ * S;
    for (let j = j0; j <= j1; j++) {
      let last = -1;
      for (let i = i0; i < i1; i++) {
        const a = j * COLS + i;
        const ax = bx + i * S + dx[a]!;
        const ay = by + j * S + dy[a]!;
        const ex = ax + S + dx[a + 1]! - dx[a]!;
        const ey = ay + dy[a + 1]! - dy[a]!;
        const level = levelOf(heat(ax, ay, ex, ey, S));
        const g = layers[level]!;
        if (level !== last) g.moveTo(ax, ay);
        g.lineTo(ex, ey);
        last = level;
      }
    }
    for (let i = i0; i <= i1; i++) {
      let last = -1;
      for (let j = j0; j < j1; j++) {
        const a = j * COLS + i;
        const b = a + COLS;
        const ax = bx + i * S + dx[a]!;
        const ay = by + j * S + dy[a]!;
        const ex = ax + dx[b]! - dx[a]!;
        const ey = ay + S + dy[b]! - dy[a]!;
        const level = levelOf(heat(ax, ay, ex, ey, S));
        const g = layers[level]!;
        if (level !== last) g.moveTo(ax, ay);
        g.lineTo(ex, ey);
        last = level;
      }
    }
    for (let k = 0; k < layers.length; k++) layers[k]!.stroke(STYLES[k]!);
  };

  return {
    view,
    shockwave,
    update(camera, cars, dt) {
      recentre(camera);
      frame++;
      for (const car of cars) {
        let mark = marks.get(car.id);
        if (!mark) {
          mark = { boosting: car.boosting, frame };
          marks.set(car.id, mark);
        }
        mark.frame = frame;
        const live = car.alive && !car.frozen;
        if (live && car.boosting && !mark.boosting) shockwave(car.x, car.y, WARP.boostKick);
        mark.boosting = live && car.boosting;
        if (live) wake(car, dt);
      }
      for (const [id, mark] of marks) if (mark.frame !== frame) marks.delete(id);

      acc = Math.min(acc + dt, SPRING.step * SPRING.maxSteps);
      let peak = 0;
      while (acc >= SPRING.step) {
        acc -= SPRING.step;
        peak = Math.max(peak, stepField(field, SPRING.step));
      }
      awake ||= peak > REST;
      draw(camera);
      awake = peak > REST;
    },
    destroy() {
      view.destroy({ children: true });
      marks.clear();
    },
  };
}
