import { defaultCarParams, emptyInput, speedOf, type CarInput, type CarState } from "./car";
import { boostAt, dropAt, nearestOnTrack, pointAt, type Track } from "./track";
import { draftFactor } from "./slipstream";
import { BOOST_FACTOR } from "./world";

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
  /** Chance, each stretch of road, of attacking the bends ahead: cutting the apex with more speed. */
  commit: number;
  /** Lapses per second: half a second of keeping the foot down and not steering. */
  lapse: number;
}

/** One of the six named bots. Every bot in every Room is a Runner, and each drives in its own style. */
export interface Runner {
  name: string;
  style: DrivingStyle;
}

// All about as quick as each other: what sets them apart is which risks they take, and how often.
export const RUNNERS: readonly Runner[] = [
  // Late braker: attacks the bends.
  { name: "Bolt", style: { pace: 0.97, cornering: 1, wobble: 0.02, dropNerve: 0.1, commit: 0.5, lapse: 0.02 } },
  // Raw pace, but loses concentration.
  { name: "Glitch", style: { pace: 1, cornering: 1, wobble: 0.02, dropNerve: 0.1, commit: 0.2, lapse: 0.06 } },
  // Smooth and careful: rarely quickest, rarely out.
  { name: "Nova", style: { pace: 0.96, cornering: 1, wobble: 0.02, dropNerve: 0.03, commit: 0.1, lapse: 0.01 } },
  // All-rounder: a bit of everything.
  { name: "Pixel", style: { pace: 0.97, cornering: 1, wobble: 0.02, dropNerve: 0.15, commit: 0.25, lapse: 0.03 } },
  // Drop-edge daredevil.
  { name: "Sprocket", style: { pace: 0.97, cornering: 1, wobble: 0.02, dropNerve: 0.25, commit: 0.15, lapse: 0.02 } },
  // Flat out everywhere.
  { name: "Turbo", style: { pace: 0.99, cornering: 1, wobble: 0.02, dropNerve: 0.15, commit: 0.35, lapse: 0.04 } },
];

export const runnerNamed = (name: string): Runner | undefined => RUNNERS.find((r) => r.name === name);

/** What a bot has decided for the stretch of road it's on, so a risk is taken or not for a while, not flipped every tick. */
export interface BotMind {
  stretch: number;
  brave: boolean;
  hot: boolean;
  /** Ticks left of a lapse in concentration. */
  lapse: number;
}

export const newBotMind = (): BotMind => ({ stretch: Number.NaN, brave: false, hot: false, lapse: 0 });

/** How far a bot drives before it decides again whether to take each risk. */
const STRETCH = 400;

// A risk it has no appetite for costs no roll.
const roll = (chance: number, rng: () => number) => chance > 0 && rng() < chance;

// With the line breathing down its neck, any Runner gets desperate: it makes the pass, or makes a mistake.
const PRESSED_NERVE = 0.5;
const PRESSED_COMMIT = 0.7;

function decide(mind: BotMind, s: number, style: DrivingStyle, rng: () => number, pressed: boolean): void {
  const stretch = Math.floor(s / STRETCH);
  if (stretch === mind.stretch) return;
  mind.stretch = stretch;
  mind.brave = roll(pressed ? Math.max(style.dropNerve, PRESSED_NERVE) : style.dropNerve, rng);
  mind.hot = roll(pressed ? Math.max(style.commit, PRESSED_COMMIT) : style.commit, rng);
}

export interface BotContext {
  /** How far into a slipstream the car is, from 0 to 1. */
  draft?: number;
  /** The car's last known distance along the track, so a crossing doesn't confuse it. */
  near?: number;
  /** Its decisions so far. Without one it takes no risks. */
  mind?: BotMind;
  /** The elimination line is close behind it. */
  pressed?: boolean;
}

const STEER_DEADZONE = 0.04;
// Bots are asked for an input once per 60 Hz tick; a lapse lasts half a second.
const TICKS_PER_SECOND = 60;
const LAPSE_TICKS = 30;
const DROP_CAUTION = 0.95;
// Edging along a drop: how far ahead it aims, and how much faster it takes the bend. Survive it and it's well up the road.
const EDGE_LOOK = 200;
const EDGE_LOOK_SPEED = 0.5;
const EDGE_CORNERING = 1.25;
// Going in hot: it aims further ahead, cutting the apex, and carries more speed in. Quicker on average,
// but now and then it clips the grass and loses half its speed.
const HOT_CORNERING = 1.3;
const HOT_LOOK = 1.5;

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function botInput(car: CarState, track: Track, style: DrivingStyle, rng: () => number, { draft = 0, near, mind, pressed = false }: BotContext = {}): CarInput {
  const speed = speedOf(car);
  const { s } = nearestOnTrack(track, car.x, car.y, near);
  if (mind) {
    decide(mind, s, style, rng, pressed);
    if (mind.lapse === 0 && roll(style.lapse / TICKS_PER_SECOND, rng)) mind.lapse = LAPSE_TICKS;
    // A lapse: foot down and not steering, so it runs straight on wherever the road goes.
    if (mind.lapse > 0) {
      mind.lapse--;
      return { ...emptyInput, throttle: true };
    }
  }

  const dropAhead = [0, 200, 400].some((d) => dropAt(track, s + d + speed * 0.3));
  // Brave near a drop: no extra care, and a longer look ahead that cuts the corner along the edge.
  const edging = dropAhead && !!mind?.brave;
  const nearDrop = dropAhead && !edging;
  const lookAhead = edging ? EDGE_LOOK + speed * EDGE_LOOK_SPEED : nearDrop ? 90 + speed * 0.25 : (120 + speed * 0.35) * (mind?.hot ? HOT_LOOK : 1);
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
  const target = defaultCarParams.maxSpeed * style.pace * surface * Math.max(0.3, 1 - (bend * 1.6) / (style.cornering * (edging ? EDGE_CORNERING : 1) * (mind?.hot ? HOT_CORNERING : 1)));

  return {
    ...emptyInput,
    left: error < -STEER_DEADZONE,
    right: error > STEER_DEADZONE,
    throttle: speed < target,
    brake: speed > target + 60,
  };
}
