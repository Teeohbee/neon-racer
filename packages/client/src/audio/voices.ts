import { VIEW, type Camera } from "@neon/sim";

export interface AudibleCar {
  id: string;
  x: number;
  y: number;
  speed: number;
  isYou: boolean;
  drifting?: boolean;
  alive?: boolean;
}

export interface VoicePlan {
  id: string;
  isYou: boolean;
  pan: number;
  gain: number;
  freq: number;
  screech: number;
}

export const MAX_VOICES = 4;
const MAX_SPEED = 650;
const OFFSCREEN_MARGIN = 0.25;
const SCREECH_RANGE = 0.6;
const PAN_WIDTH = 0.8;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const SHIFTS = [0, 0.35, 0.7];
const GEAR_SPAN = [0.35, 0.35, 0.6];
const GEAR_BASE = [46, 58, 66];
const SHIFT_HYSTERESIS = 0.04;

export function engineGear(speed: number, prev = 0): number {
  const s = speed / MAX_SPEED;
  let gear = clamp(prev, 0, SHIFTS.length - 1);
  while (gear < SHIFTS.length - 1 && s > SHIFTS[gear + 1]! + SHIFT_HYSTERESIS) gear++;
  while (gear > 0 && s < SHIFTS[gear]! - SHIFT_HYSTERESIS) gear--;
  return gear;
}

export function engineFreq(speed: number, gear = engineGear(speed)): number {
  const s = clamp(speed / MAX_SPEED, 0, 1.3);
  const rev = clamp((s - SHIFTS[gear]!) / GEAR_SPAN[gear]!, -0.15, 1.2);
  return GEAR_BASE[gear]! + rev * 34 + s * 20;
}

export function screenPosition(car: { x: number; y: number }, camera: Camera): { nx: number; ny: number } {
  return {
    nx: (car.x - camera.x) / ((VIEW.width * camera.scale) / 2),
    ny: (car.y - camera.y) / ((VIEW.height * camera.scale) / 2),
  };
}

export const screenPan = (point: { x: number; y: number }, camera: Camera) => clamp(screenPosition(point, camera).nx, -1, 1) * PAN_WIDTH;

export function planVoices(cars: AudibleCar[], camera: Camera, gears: Map<string, number> = new Map(), max = MAX_VOICES): VoicePlan[] {
  const plans: (VoicePlan & { dist: number })[] = [];
  for (const car of cars) {
    if (car.alive === false) continue;
    const { nx, ny } = screenPosition(car, camera);
    const dist = Math.hypot(nx, ny / 1.2);
    const loudness = clamp(car.speed / 200, 0.35, 1);
    const gear = engineGear(car.speed, gears.get(car.id));
    gears.set(car.id, gear);
    const freq = engineFreq(car.speed, gear);
    const drift = car.drifting ? clamp((car.speed - 80) / 300, 0, 1) : 0;
    if (car.isYou) {
      plans.push({ id: car.id, isYou: true, pan: 0, gain: loudness, freq, screech: drift, dist: -1 });
      continue;
    }
    const edge = Math.max(Math.abs(nx), Math.abs(ny));
    if (edge > 1 + OFFSCREEN_MARGIN) continue;
    const proximity = clamp(1 - dist / 1.6, 0, 1);
    plans.push({
      id: car.id,
      isYou: false,
      pan: clamp(nx, -1, 1) * PAN_WIDTH,
      gain: loudness * (0.25 + 0.75 * proximity),
      freq,
      screech: dist < SCREECH_RANGE ? drift * proximity : 0,
      dist,
    });
  }
  plans.sort((a, b) => a.dist - b.dist);
  return plans.slice(0, max).map(({ dist: _dist, ...plan }) => plan);
}

export function diffVoices(active: Iterable<string>, plans: VoicePlan[]): { create: VoicePlan[]; update: VoicePlan[]; release: string[] } {
  const live = new Set(active);
  const wanted = new Set(plans.map((p) => p.id));
  return {
    create: plans.filter((p) => !live.has(p.id)),
    update: plans.filter((p) => live.has(p.id)),
    release: [...live].filter((id) => !wanted.has(id)),
  };
}
