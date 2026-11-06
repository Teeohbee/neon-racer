import { CAR_RADIUS, type CarState } from "./car";

export type HazardKind = "block" | "slow" | "freeze";

export interface Hazard {
  id: number;
  kind: HazardKind;
  x: number;
  y: number;
  radius: number;
  owner: string;
  armsAt: number;
  expiresAt: number;
  targetId?: string;
}

export const HAZARD_KINDS: HazardKind[] = ["block", "slow", "freeze"];

export const HAZARD_SPECS: Record<HazardKind, { radius: number; duration: number; cooldown: number }> = {
  block: { radius: 70, duration: 4, cooldown: 6 },
  slow: { radius: 120, duration: 5, cooldown: 5 },
  freeze: { radius: 150, duration: 1.2, cooldown: 9 },
};

export const ARM_DELAY = 0.6;
export const SLOW_FACTOR = 0.4;

const isLive = (h: Hazard, now: number) => now >= h.armsAt && now < h.expiresAt;

export function placeHazard(
  kind: HazardKind,
  x: number,
  y: number,
  owner: string,
  now: number,
  id: number,
  targets: { id: string; x: number; y: number }[],
): Hazard | null {
  const spec = HAZARD_SPECS[kind];
  const hazard: Hazard = { id, kind, x, y, radius: spec.radius, owner, armsAt: now + ARM_DELAY, expiresAt: now + ARM_DELAY + spec.duration };
  if (kind !== "freeze") return hazard;
  let best: { id: string; d: number } | null = null;
  for (const t of targets) {
    const d = Math.hypot(t.x - x, t.y - y);
    if (d <= spec.radius && (!best || d < best.d)) best = { id: t.id, d };
  }
  return best ? { ...hazard, targetId: best.id } : null;
}

export function hazardSpeedFactor(hazards: Hazard[], x: number, y: number, now: number): number {
  return hazards.some((h) => h.kind === "slow" && isLive(h, now) && Math.hypot(x - h.x, y - h.y) <= h.radius) ? SLOW_FACTOR : 1;
}

export function slowZoneAt(hazards: Hazard[], x: number, y: number, now: number): Hazard | undefined {
  return hazards.find((h) => h.kind === "slow" && isLive(h, now) && Math.hypot(x - h.x, y - h.y) <= h.radius);
}

export function freezeOn(carId: string, hazards: Hazard[], now: number): Hazard | undefined {
  return hazards.find((h) => h.kind === "freeze" && h.targetId === carId && isLive(h, now));
}

export function isFrozen(carId: string, hazards: Hazard[], now: number): boolean {
  return freezeOn(carId, hazards, now) !== undefined;
}

export function pushOutOfBlocks(car: CarState, hazards: Hazard[], now: number): { car: CarState; hit: Hazard | null } {
  let hit: Hazard | null = null;
  let next = car;
  for (const h of hazards) {
    if (h.kind !== "block" || !isLive(h, now)) continue;
    const dx = next.x - h.x;
    const dy = next.y - h.y;
    const d = Math.hypot(dx, dy);
    const min = h.radius + CAR_RADIUS;
    if (d >= min) continue;
    const nx = d > 0 ? dx / d : 1;
    const ny = d > 0 ? dy / d : 0;
    const vn = next.vx * nx + next.vy * ny;
    const bounce = vn < 0 ? -1.5 * vn : 0;
    next = { ...next, x: h.x + nx * min, y: h.y + ny * min, vx: next.vx + nx * bounce, vy: next.vy + ny * bounce };
    hit = h;
  }
  return { car: next, hit };
}

export function pruneHazards(hazards: Hazard[], now: number): Hazard[] {
  return hazards.filter((h) => now < h.expiresAt);
}

export function touchingHazard(carId: string, car: { x: number; y: number }, hazards: Hazard[], now: number): Hazard | undefined {
  return (
    freezeOn(carId, hazards, now) ??
    hazards.find((h) => {
      if (!isLive(h, now)) return false;
      const d = Math.hypot(car.x - h.x, car.y - h.y);
      return (h.kind === "slow" && d <= h.radius) || (h.kind === "block" && d <= h.radius + CAR_RADIUS + 4);
    })
  );
}
