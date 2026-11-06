import { defaultCarParams, stepCar, type CarInput, type CarParams, type CarState } from "./car";
import { freezeOn, hazardSpeedFactor, pushOutOfBlocks, slowZoneAt, type Hazard } from "./hazards";
import { isOnRoad, type Track } from "./track";

export const OFFROAD_FACTOR = 0.45;

export interface StepContext {
  track: Track | null;
  hazards: Hazard[];
  now: number;
  params?: CarParams;
  carId?: string;
}

export function stepWorldCar(car: CarState, input: CarInput, dt: number, ctx: StepContext): { car: CarState; hazardHit: Hazard | null } {
  const frozen = ctx.carId ? freezeOn(ctx.carId, ctx.hazards, ctx.now) : undefined;
  if (frozen) return { car: { ...car, vx: 0, vy: 0 }, hazardHit: frozen };

  const surface = !ctx.track || isOnRoad(ctx.track, car.x, car.y) ? 1 : OFFROAD_FACTOR;
  const factor = surface * hazardSpeedFactor(ctx.hazards, car.x, car.y, ctx.now);
  const moved = stepCar(car, input, dt, ctx.params ?? defaultCarParams, factor);
  const { car: pushed, hit } = pushOutOfBlocks(moved, ctx.hazards, ctx.now);
  return { car: pushed, hazardHit: hit ?? slowZoneAt(ctx.hazards, pushed.x, pushed.y, ctx.now) ?? null };
}
