import { defaultCarParams, emptyInput, speedOf, type CarInput, type CarState } from "./car";
import { nearestOnTrack, pointAt, type Track } from "./track";

export type BotSkill = "easy" | "medium" | "hard";
export const BOT_SKILLS: BotSkill[] = ["easy", "medium", "hard"];

const TUNING: Record<BotSkill, { pace: number; cornering: number; wobble: number }> = {
  easy: { pace: 0.6, cornering: 0.7, wobble: 0.25 },
  medium: { pace: 0.8, cornering: 0.85, wobble: 0.1 },
  hard: { pace: 0.97, cornering: 1, wobble: 0.02 },
};

const STEER_DEADZONE = 0.04;

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function botInput(car: CarState, track: Track, skill: BotSkill, rng: () => number): CarInput {
  const tune = TUNING[skill];
  const speed = speedOf(car);
  const { s } = nearestOnTrack(track, car.x, car.y);

  const [tx, ty] = pointAt(track, s + 120 + speed * 0.35);
  const wanted = Math.atan2(ty - car.y, tx - car.x);
  const error = wrapAngle(wanted - car.angle) + (rng() - 0.5) * tune.wobble;

  let bend = 0;
  for (let d = 100; d <= 300 + speed * 0.6; d += 100) {
    const [, , a] = pointAt(track, s + d);
    const [, , b] = pointAt(track, s + d + 100);
    bend = Math.max(bend, Math.abs(wrapAngle(b - a)));
  }
  const target = defaultCarParams.maxSpeed * tune.pace * Math.max(0.3, 1 - (bend * 1.6) / tune.cornering);

  return {
    ...emptyInput,
    left: error < -STEER_DEADZONE,
    right: error > STEER_DEADZONE,
    throttle: speed < target,
    brake: speed > target + 60,
  };
}
