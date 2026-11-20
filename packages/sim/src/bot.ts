import { defaultCarParams, emptyInput, speedOf, type CarInput, type CarState } from "./car";
import { boostAt, dropAt, nearestOnTrack, pointAt, type Track } from "./track";
import { draftFactor } from "./slipstream";
import { BOOST_FACTOR } from "./world";

export type BotSkill = "easy" | "medium" | "hard";
export const BOT_SKILLS: BotSkill[] = ["easy", "medium", "hard"];

/** How a bot races: its pace, and how often it takes each risk. Appetites are chances from 0 to 1. */
export interface DrivingStyle {
  /** Share of the car's top speed it aims for on a straight. */
  pace: number;
  /** How hard it dares to take bends: higher carries more speed in. */
  cornering: number;
  /** Random steering noise. */
  wobble: number;
  /** Chance, each stretch of road, of skipping the usual caution near a drop and cutting along its edge. */
  dropNerve: number;
  /** Chance, each stretch of road, of going into the bends ahead too hot. */
  commit: number;
  /** Chance, each stretch of road, of chasing the slipstream of a car ahead. */
  hunt: number;
  /** Chance, each stretch of road, of carrying boost speed into the next bend instead of braking. */
  greed: number;
  /** Lapses per second: a moment of lifting off and not steering. */
  lapse: number;
}

const NO_RISKS = { dropNerve: 0, commit: 0, hunt: 0, greed: 0, lapse: 0 };

export const BOT_STYLES: Record<BotSkill, DrivingStyle> = {
  easy: { pace: 0.6, cornering: 0.7, wobble: 0.25, ...NO_RISKS },
  medium: { pace: 0.8, cornering: 0.85, wobble: 0.1, ...NO_RISKS },
  hard: { pace: 0.97, cornering: 1, wobble: 0.02, ...NO_RISKS },
};

/** What a bot has decided for the stretch of road it's on, so a risk is taken or not for a while, not flipped every tick. */
export interface BotMind {
  stretch: number;
  brave: boolean;
}

export const newBotMind = (): BotMind => ({ stretch: Number.NaN, brave: false });

/** How far a bot drives before it decides again whether to take each risk. */
const STRETCH = 400;

// A risk it has no appetite for costs no roll, so styles without risks drive exactly as they always have.
const roll = (chance: number, rng: () => number) => chance > 0 && rng() < chance;

function decide(mind: BotMind, s: number, style: DrivingStyle, rng: () => number): void {
  const stretch = Math.floor(s / STRETCH);
  if (stretch === mind.stretch) return;
  mind.stretch = stretch;
  mind.brave = roll(style.dropNerve, rng);
}

export interface BotContext {
  /** How far into a slipstream the car is, from 0 to 1. */
  draft?: number;
  /** The car's last known distance along the track, so a crossing doesn't confuse it. */
  near?: number;
  /** Its decisions so far. Without one it takes no risks. */
  mind?: BotMind;
}

const STEER_DEADZONE = 0.04;
const DROP_CAUTION = 0.95;
// Edging along a drop: how far ahead it aims, and how much faster it takes the bend. Survive it and it's well up the road.
const EDGE_LOOK = 200;
const EDGE_LOOK_SPEED = 0.5;
const EDGE_CORNERING = 1.25;

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function botInput(car: CarState, track: Track, style: DrivingStyle, rng: () => number, { draft = 0, near, mind }: BotContext = {}): CarInput {
  const speed = speedOf(car);
  const { s } = nearestOnTrack(track, car.x, car.y, near);
  if (mind) decide(mind, s, style, rng);

  const dropAhead = [0, 200, 400].some((d) => dropAt(track, s + d + speed * 0.3));
  // Brave near a drop: no extra care, and a longer look ahead that cuts the corner along the edge.
  const edging = dropAhead && !!mind?.brave;
  const nearDrop = dropAhead && !edging;
  const lookAhead = edging ? EDGE_LOOK + speed * EDGE_LOOK_SPEED : nearDrop ? 90 + speed * 0.25 : 120 + speed * 0.35;
  const [tx, ty] = pointAt(track, s + lookAhead);
  const wanted = Math.atan2(ty - car.y, tx - car.x);
  const error = wrapAngle(wanted - car.angle) + (rng() - 0.5) * style.wobble;

  let bend = 0;
  for (let d = 100; d <= 300 + speed * 0.6; d += 100) {
    const [, , a] = pointAt(track, s + d);
    const [, , b] = pointAt(track, s + d + 100);
    bend = Math.max(bend, Math.abs(wrapAngle(b - a)));
  }
  const surface = (boostAt(track, s) ? BOOST_FACTOR : 1) * (nearDrop ? DROP_CAUTION : 1) * draftFactor(draft);
  const target = defaultCarParams.maxSpeed * style.pace * surface * Math.max(0.3, 1 - (bend * 1.6) / (style.cornering * (edging ? EDGE_CORNERING : 1)));

  return {
    ...emptyInput,
    left: error < -STEER_DEADZONE,
    right: error > STEER_DEADZONE,
    throttle: speed < target,
    brake: speed > target + 60,
  };
}
