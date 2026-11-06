import { LIGHT } from "./palette";
import type { CarView } from "./types";

export interface Glint {
  x: number;
  y: number;
  width: number;
  length: number;
  color: number;
  alpha: number;
}

export interface GlintSource {
  x: number;
  y: number;
  size: number;
  color: number;
  alpha: number;
}

const TOP_SPEED = 650;
const MIN_LIGHT_ALPHA = 0.05;
const SIDES = [-1, 1] as const;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const createGlints = (count: number): Glint[] => Array.from({ length: count }, () => ({ x: 0, y: 0, width: 0, length: 0, color: 0, alpha: 0 }));

function put(out: Glint[], n: number, x: number, y: number, width: number, length: number, color: number, alpha: number): number {
  const g = out[n];
  if (!g) return n;
  g.x = x;
  g.y = y;
  g.width = width;
  g.length = length;
  g.color = color;
  g.alpha = alpha;
  return n + 1;
}

export function collectGlints(out: Glint[], cars: readonly CarView[], lights: readonly GlintSource[], brakeOf: (id: string) => number): number {
  let n = 0;
  for (const car of cars) {
    if (!car.alive) continue;
    if (car.frozen) {
      n = put(out, n, car.x, car.y, 50, 120, LIGHT.frozen, 0.3);
      continue;
    }
    const c = Math.cos(car.angle);
    const s = Math.sin(car.angle);
    const speed = clamp(car.speed / TOP_SPEED, 0, 1);
    const brake = brakeOf(car.id);
    n = put(out, n, car.x, car.y, 34, 90, car.color, 0.22);
    for (const side of SIDES) {
      n = put(out, n, car.x + c * 18 - s * side * 6, car.y + s * 18 + c * side * 6, 10, 70, LIGHT.headlight, 0.3 + 0.2 * speed);
      n = put(out, n, car.x - c * 21 - s * side * 7, car.y - s * 21 + c * side * 7, 9, 60 + 60 * brake, LIGHT.tail, 0.18 + 0.4 * brake);
    }
  }
  for (const l of lights) {
    if (l.alpha < MIN_LIGHT_ALPHA) continue;
    n = put(out, n, l.x, l.y, clamp(l.size * 0.12, 12, 90), l.size * 0.55, l.color, Math.min(1, l.alpha) * 0.3);
  }
  return n;
}
