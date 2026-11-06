import { defaultCarParams, stepCar, type CarInput, type CarParams, type CarState } from "./car";
import { freezeOn, hazardSpeedFactor, pushOutOfBlocks, slowZoneAt, type Hazard } from "./hazards";
import { DRAFT_ACCEL, draftFactor } from "./slipstream";
import { boostAt, nearestOnTrack, TRACK_WIDTH, type Track } from "./track";

export const OFFROAD_FACTOR = 0.45;
export const BOOST_FACTOR = 1.4;
const BOOST_ACCEL = 900;

export interface StepContext {
  track: Track | null;
  hazards: Hazard[];
  now: number;
  params?: CarParams;
  carId?: string;
  draft?: number;
}

export function stepWorldCar(car: CarState, input: CarInput, dt: number, ctx: StepContext): { car: CarState; hazardHit: Hazard | null } {
  const frozen = ctx.carId ? freezeOn(ctx.carId, ctx.hazards, ctx.now) : undefined;
  if (frozen) return { car: { ...car, vx: 0, vy: 0 }, hazardHit: frozen };

  const at = ctx.track ? nearestOnTrack(ctx.track, car.x, car.y) : null;
  const onRoad = !at || at.dist <= TRACK_WIDTH / 2;
  const boosting = !!at && onRoad && boostAt(ctx.track!, at.s);
  const surface = onRoad ? (boosting ? BOOST_FACTOR : 1) : OFFROAD_FACTOR;
  const draft = ctx.draft ?? 0;
  const factor = surface * draftFactor(draft) * hazardSpeedFactor(ctx.hazards, car.x, car.y, ctx.now);
  let moved = stepCar(car, input, dt, ctx.params ?? defaultCarParams, factor);
  const push = (boosting ? BOOST_ACCEL : 0) + (input.throttle ? DRAFT_ACCEL * draft : 0);
  if (push > 0) {
    const fx = Math.cos(moved.angle);
    const fy = Math.sin(moved.angle);
    moved = { ...moved, vx: moved.vx + fx * push * dt, vy: moved.vy + fy * push * dt };
  }
  const { car: pushed, hit } = pushOutOfBlocks(moved, ctx.hazards, ctx.now);
  return { car: pushed, hazardHit: hit ?? slowZoneAt(ctx.hazards, pushed.x, pushed.y, ctx.now) ?? null };
}
