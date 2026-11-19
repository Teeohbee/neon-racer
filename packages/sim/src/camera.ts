import { CAR_RADIUS } from "./car";

export const VIEW = { width: 1600, height: 1000 };
export const SUDDEN_DEATH_AT = 90;
const SUDDEN_DEATH_SPAN = 30;
export const LINE_GAP = 1000;
const MIN_LINE_GAP = 350;
export const MAX_SCALE = 1.6;
export const FRAME_MARGIN = 200;
const LOOK_AHEAD = 0.35;
const FOLLOW = 4;
const FRAME_FOLLOW = 6;
const ZOOM_OUT = 4;
const ZOOM_IN = 1.5;

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

/**
 * Room kept around the leader: FRAME_MARGIN plus about what the eased camera trails a boosting leader by (speed / FRAME_FOLLOW).
 * With an even margin, the camera at full zoom-out left the leader a car length or two from the edge it was driving at.
 */
const LEADER_MARGIN = FRAME_MARGIN + 150;

export function frameTarget(leader: { x: number; y: number; vx: number; vy: number }, line: { x: number; y: number }): Camera {
  const ahead = { x: leader.x + leader.vx * LOOK_AHEAD, y: leader.y + leader.vy * LOOK_AHEAD, margin: LEADER_MARGIN };
  const fit = (points: { x: number; y: number; margin: number }[]) => {
    const left = Math.min(...points.map((p) => p.x - p.margin));
    const right = Math.max(...points.map((p) => p.x + p.margin));
    const top = Math.min(...points.map((p) => p.y - p.margin));
    const bottom = Math.max(...points.map((p) => p.y + p.margin));
    const scale = Math.max(1, (right - left) / VIEW.width, (bottom - top) / VIEW.height);
    return { x: (left + right) / 2, y: (top + bottom) / 2, scale };
  };
  const at = { ...leader, margin: LEADER_MARGIN };
  const end = { ...line, margin: FRAME_MARGIN };
  const wide = fit([at, ahead, end]);
  const target = wide.scale <= MAX_SCALE ? wide : fit([at, end]);
  return { ...target, scale: Math.min(MAX_SCALE, target.scale) };
}

export function frameCamera(cam: Camera, leader: { x: number; y: number; vx: number; vy: number }, line: { x: number; y: number }, dt: number): Camera {
  const target = frameTarget(leader, line);
  const k = 1 - Math.exp(-FRAME_FOLLOW * dt);
  const z = 1 - Math.exp(-(target.scale > cam.scale ? ZOOM_OUT : ZOOM_IN) * dt);
  return { x: cam.x + (target.x - cam.x) * k, y: cam.y + (target.y - cam.y) * k, scale: Math.min(MAX_SCALE, cam.scale + (target.scale - cam.scale) * z) };
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

export function lineGap(raceTime: number): number {
  const t = Math.max(0, Math.min(1, (raceTime - SUDDEN_DEATH_AT) / SUDDEN_DEATH_SPAN));
  return LINE_GAP - (LINE_GAP - MIN_LINE_GAP) * t;
}
