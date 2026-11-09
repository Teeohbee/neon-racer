import { nearestOnTrack, type Track } from "@neon/sim";
import { hash01 } from "./fx-math";

export const GLITCH_RATE = 30;
export const HACK_TIME = 0.4;
export const HACK_HOLD = 0.08;
export const HACK_GLYPH_TIME = 0.3;
export const HACK_WORDS = ["> INJECT", "> EXPLOIT"] as const;
export const TYPE_RATE = 60;
export const SIGNAL_TIME = 0.8;
export const SIGNAL_HOLD = 0.3;
export const SPLIT_TIME = 0.35;
export const CARD = { in: 0.06, out: 0.55 };
export const TRANSITION_TIME = 0.35;
export const GLITCH = { phase: 0.8, matchEnd: 1 } as const;
export const LEADER_GAP = { min: 4, max: 10 };
export const NOISE = "▓▒░█▚▞▙▟#%&@$/\\<>|_01";

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
const noise = Array.from(NOISE);

export const glitchTick = (t: number) => Math.floor(t * GLITCH_RATE) % 1000;

export function burstLevel(age: number, duration: number, hold = 0): number {
  if (!(age >= 0) || age >= duration) return 0;
  if (age <= hold) return 1;
  const k = 1 - (age - hold) / (duration - hold);
  return k * k;
}

export const hackLevel = (age: number) => burstLevel(age, HACK_TIME, HACK_HOLD);

export const hackWord = (seed: number) => HACK_WORDS[hash01(seed, 0, 53) < 0.5 ? 0 : 1];

export function typed(word: string, age: number): string {
  if (!(age >= 0) || age >= HACK_GLYPH_TIME) return "";
  const shown = Math.min(word.length, Math.ceil(age * TYPE_RATE) + 1);
  return shown < word.length ? `${word.slice(0, shown)}_` : word;
}

export interface SignalFrame {
  corrupt: number;
  split: number;
  card: number;
}

export const SIGNAL_CLEAR: SignalFrame = { corrupt: 0, split: 0, card: 0 };

export function signalLoss(age: number, tick: number): SignalFrame {
  if (!(age >= 0) || age >= SIGNAL_TIME) return SIGNAL_CLEAR;
  const corrupt = burstLevel(age, SIGNAL_TIME, SIGNAL_HOLD);
  const split = burstLevel(age, SPLIT_TIME, 0.04);
  if (age < CARD.in) return { corrupt, split, card: 0 };
  if (age < CARD.out) return { corrupt, split, card: 1 };
  const fade = 1 - (age - CARD.out) / (SIGNAL_TIME - CARD.out);
  return { corrupt, split, card: hash01(tick, 0, 59) < fade ? fade : 0 };
}

export interface Transition {
  age: number;
  strength: number;
  duration: number;
}

export const transitionLevel = ({ age, strength, duration }: Transition) => strength * burstLevel(age, duration, duration * 0.25);

export function kickTransition(current: Transition | null, strength: number, duration = TRANSITION_TIME): Transition | null {
  const next = { age: 0, strength: clamp01(strength), duration: Math.max(0.05, Number.isFinite(duration) ? duration : TRANSITION_TIME) };
  if (next.strength === 0) return current;
  if (current && transitionLevel(current) > next.strength) return current;
  return next;
}

export function stepTransition(current: Transition | null, dt: number): Transition | null {
  if (!current) return null;
  const age = current.age + dt;
  return age >= current.duration ? null : { ...current, age };
}

export interface LeaderGlitch {
  wait: number;
  frames: number;
}

const leaderGap = (rng: () => number) => LEADER_GAP.min + (LEADER_GAP.max - LEADER_GAP.min) * rng();

export const leaderIdle = (rng: () => number): LeaderGlitch => ({ wait: leaderGap(rng), frames: 0 });

export function stepLeader(state: LeaderGlitch, dt: number, rng: () => number): LeaderGlitch {
  if (state.frames > 1) return { wait: 0, frames: state.frames - 1 };
  if (state.frames === 1) return leaderIdle(rng);
  const wait = state.wait - dt;
  if (wait > 0) return { wait, frames: 0 };
  return { wait: 0, frames: rng() < 0.5 ? 1 : 2 };
}

export function corruptName(name: string, seed: number): string {
  return Array.from(name, (ch, i) => (ch === " " ? ch : noise[Math.floor(hash01(i, seed, 61) * noise.length)]!)).join("");
}

export function leaderOf(cars: readonly { id: string; x: number; y: number; alive: boolean; s?: number }[], track: Track | null, line: number | null | undefined): string | null {
  if (!track || line === null || line === undefined) return null;
  const L = track.length;
  let best: string | null = null;
  let lead = -1;
  for (const c of cars) {
    if (!c.alive) continue;
    const ahead = (((c.s ?? nearestOnTrack(track, c.x, c.y).s) - line) % L + L) % L;
    if (ahead > lead) {
      lead = ahead;
      best = c.id;
    }
  }
  return best;
}
