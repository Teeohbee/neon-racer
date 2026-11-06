import { Container, Graphics, GraphicsContext } from "pixi.js";
import { boostAt, nearestOnTrack, TRACK_WIDTH, type Track } from "@neon/sim";
import { boostLevel, flicker, seedOf } from "./fx-math";
import type { CarView } from "./types";

const GHOSTS = 5;
const GHOST_GAP = 0.035;
const GHOST_ALPHA = 0.5;
const FLAME_MIN = 14;
const FLAME_RANGE = 26;
const FLAME_HALF = 4.5;

interface Pose {
  x: number;
  y: number;
  angle: number;
  level: number;
}

interface BoostCar {
  level: number;
  seed: number;
  poses: Pose[];
  head: number;
  sampledAt: number;
  ghosts: Graphics[];
}

export interface BoostFx {
  readonly view: Container;
  update(cars: CarView[], t: number, dt: number): void;
  destroy(): void;
}

export function onBoostPad(track: Track, x: number, y: number): boolean {
  const near = nearestOnTrack(track, x, y);
  return near.dist <= TRACK_WIDTH / 2 && boostAt(track, near.s);
}

function ghostContext(length: number, width: number): GraphicsContext {
  const hl = length / 2;
  const hw = width / 2;
  return new GraphicsContext()
    .roundRect(-hl, -hw, length, width, 6)
    .fill({ color: 0xffffff, alpha: 0.25 })
    .stroke({ width: 2.5, color: 0xffffff })
    .moveTo(hl - 13, -hw + 3)
    .lineTo(hl - 9, 0)
    .lineTo(hl - 13, hw - 3)
    .stroke({ width: 2, color: 0xffffff, join: "round" });
}

export function createBoostFx(car: { length: number; width: number }): BoostFx {
  const view = new Container();
  const ghostLayer = new Container();
  const flameG = new Graphics();
  view.addChild(ghostLayer, flameG);
  const ghostShape = ghostContext(car.length, car.width);
  const states = new Map<string, BoostCar>();

  const stateFor = (c: CarView): BoostCar => {
    let s = states.get(c.id);
    if (!s) {
      const ghosts = Array.from({ length: GHOSTS }, () => new Graphics(ghostShape));
      ghostLayer.addChild(...ghosts);
      const poses = Array.from({ length: GHOSTS + 1 }, () => ({ x: c.x, y: c.y, angle: c.angle, level: 0 }));
      s = { level: 0, seed: seedOf(c.id), poses, head: 0, sampledAt: -Infinity, ghosts };
      states.set(c.id, s);
    }
    return s;
  };

  const drawFlame = (c: CarView, s: BoostCar, t: number) => {
    const cos = Math.cos(c.angle);
    const sin = Math.sin(c.angle);
    const rx = c.x - cos * (car.length / 2);
    const ry = c.y - sin * (car.length / 2);
    for (const side of [-1, 1]) {
      const nx = rx - sin * side * (car.width / 4);
      const ny = ry + cos * side * (car.width / 4);
      const len = s.level * (FLAME_MIN + FLAME_RANGE * flicker(t, s.seed + side));
      const half = FLAME_HALF * (0.8 + 0.4 * flicker(t, s.seed - side, 45));
      const tip = (k: number): [number, number] => [nx - cos * len * k, ny - sin * len * k];
      const flame = (k: number, w: number) => {
        const [tx, ty] = tip(k);
        flameG.poly([nx - sin * half * w, ny + cos * half * w, tx, ty, nx + sin * half * w, ny - cos * half * w], true);
      };
      flame(1.25, 2);
      flameG.fill({ color: c.color, alpha: 0.25 * s.level });
      flame(1, 1);
      flameG.fill({ color: c.color, alpha: 0.9 * s.level });
      flame(0.5, 0.5);
      flameG.fill({ color: 0xffffff, alpha: s.level });
    }
  };

  const placeGhosts = (c: CarView, s: BoostCar) => {
    const n = s.poses.length;
    s.ghosts.forEach((g, k) => {
      const pose = s.poses[(s.head - 1 - k + n * 2) % n]!;
      const alpha = pose.level * GHOST_ALPHA * (1 - (k + 1) / (GHOSTS + 1));
      g.visible = alpha > 0.01;
      if (!g.visible) return;
      g.position.set(pose.x, pose.y);
      g.rotation = pose.angle;
      g.tint = c.color;
      g.alpha = alpha;
    });
  };

  return {
    view,
    update(cars, t, dt) {
      flameG.clear();
      const seen = new Set<string>();
      for (const c of cars) {
        seen.add(c.id);
        const s = stateFor(c);
        const live = c.alive && !c.frozen;
        s.level = live ? boostLevel(s.level, c.boosting, dt) : 0;
        if (t - s.sampledAt >= GHOST_GAP) {
          s.sampledAt = t;
          const pose = s.poses[s.head]!;
          pose.x = c.x;
          pose.y = c.y;
          pose.angle = c.angle;
          pose.level = s.level;
          s.head = (s.head + 1) % s.poses.length;
        }
        if (!live) {
          for (const g of s.ghosts) g.visible = false;
          continue;
        }
        placeGhosts(c, s);
        if (s.level > 0.01) drawFlame(c, s, t);
      }
      for (const [id, s] of states) {
        if (seen.has(id)) continue;
        for (const g of s.ghosts) g.destroy();
        states.delete(id);
      }
    },
    destroy() {
      view.destroy({ children: true });
      ghostShape.destroy();
      states.clear();
    },
  };
}
