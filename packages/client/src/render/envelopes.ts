export const PULSE = { boost: 0.45, eliminated: 1 } as const;
export const PULSE_TIME = 0.32;
export const MAX_SPLIT = 7;
export const VIGNETTE_MAX = 0.7;

const ATTACK = 0.12;
const RELEASE = 0.35;
const OFF = 0.002;

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

export const kickPulse = (amount: number, strength: number) => Math.max(amount, clamp01(strength));

export const stepPulse = (amount: number, dt: number) => Math.max(0, amount - dt / PULSE_TIME);

export const splitOffset = (amount: number) => MAX_SPLIT * amount * amount;

export interface VignetteState {
  level: number;
  phase: number;
}

export const VIGNETTE_IDLE: VignetteState = { level: 0, phase: 0 };

export const vignetteRate = (level: number) => 1.2 + 3.3 * level;

export function stepVignette(state: VignetteState, target: number, dt: number): VignetteState {
  const goal = clamp01(target);
  const tau = goal > state.level ? ATTACK : RELEASE;
  const next = goal + (state.level - goal) * Math.exp(-dt / tau);
  const level = next < OFF && goal === 0 ? 0 : next;
  const phase = level === 0 ? 0 : (state.phase + dt * vignetteRate(level)) % 1;
  return { level, phase };
}

export function vignetteAlpha({ level, phase }: VignetteState): number {
  if (level === 0) return 0;
  const beat = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2);
  return VIGNETTE_MAX * level * (0.55 + 0.45 * beat);
}
