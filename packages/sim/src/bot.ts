import { defaultCarParams, emptyInput, speedOf, type CarInput, type CarState } from "./car";
import { boostAt, dropAt, nearestOnTrack, pointAt, type Track } from "./track";
import { draftFactor } from "./slipstream";
import { BOOST_FACTOR } from "./world";

export type BotSkill = "easy" | "medium" | "hard";
export const BOT_SKILLS: BotSkill[] = ["easy", "medium", "hard"];

const TUNING: Record<BotSkill, { pace: number; cornering: number; wobble: number }> = {
  easy: { pace: 0.6, cornering: 0.7, wobble: 0.25 },
  medium: { pace: 0.8, cornering: 0.85, wobble: 0.1 },
  hard: { pace: 0.97, cornering: 1, wobble: 0.02 },
};

const STEER_DEADZONE = 0.04;
const DROP_CAUTION = 0.95;

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function botInput(car: CarState, track: Track, skill: BotSkill, rng: () => number, draft = 0): CarInput {
  const tune = TUNING[skill];
  const speed = speedOf(car);
  const { s } = nearestOnTrack(track, car.x, car.y);

  const nearDrop = [0, 200, 400].some((d) => dropAt(track, s + d + speed * 0.3));
  const [tx, ty] = pointAt(track, s + (nearDrop ? 90 + speed * 0.25 : 120 + speed * 0.35));
  const wanted = Math.atan2(ty - car.y, tx - car.x);
  const error = wrapAngle(wanted - car.angle) + (rng() - 0.5) * tune.wobble;

  let bend = 0;
  for (let d = 100; d <= 300 + speed * 0.6; d += 100) {
    const [, , a] = pointAt(track, s + d);
    const [, , b] = pointAt(track, s + d + 100);
    bend = Math.max(bend, Math.abs(wrapAngle(b - a)));
  }
  const surface = (boostAt(track, s) ? BOOST_FACTOR : 1) * (nearDrop ? DROP_CAUTION : 1) * draftFactor(draft);
  const target = defaultCarParams.maxSpeed * tune.pace * surface * Math.max(0.3, 1 - (bend * 1.6) / tune.cornering);

  return {
    ...emptyInput,
    left: error < -STEER_DEADZONE,
    right: error > STEER_DEADZONE,
    throttle: speed < target,
    brake: speed > target + 60,
  };
}
