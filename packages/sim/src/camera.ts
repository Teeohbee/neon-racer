import { CAR_RADIUS } from "./car";

export const VIEW = { width: 1600, height: 1000 };
export const SUDDEN_DEATH_AT = 90;
const SUDDEN_DEATH_SPAN = 30;
const MIN_SCALE = 0.5;
const LOOK_AHEAD = 0.35;
const FOLLOW = 4;

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export function stepCamera(cam: Camera, leader: { x: number; y: number; vx: number; vy: number }, dt: number, scale: number): Camera {
  const k = 1 - Math.exp(-FOLLOW * dt);
  const tx = leader.x + leader.vx * LOOK_AHEAD;
  const ty = leader.y + leader.vy * LOOK_AHEAD;
  return { x: cam.x + (tx - cam.x) * k, y: cam.y + (ty - cam.y) * k, scale };
}

export function viewBounds(cam: Camera) {
  const hw = (VIEW.width * cam.scale) / 2;
  const hh = (VIEW.height * cam.scale) / 2;
  return { left: cam.x - hw, right: cam.x + hw, top: cam.y - hh, bottom: cam.y + hh };
}

export function isOutsideView(cam: Camera, x: number, y: number, margin = CAR_RADIUS): boolean {
  const b = viewBounds(cam);
  return x < b.left - margin || x > b.right + margin || y < b.top - margin || y > b.bottom + margin;
}

export function suddenDeathScale(raceTime: number): number {
  const t = Math.max(0, Math.min(1, (raceTime - SUDDEN_DEATH_AT) / SUDDEN_DEATH_SPAN));
  return 1 - (1 - MIN_SCALE) * t;
}
