import type { Camera } from "@neon/sim";

export const SHAKE ={ max: 12, decay: 1.8, freq: 23 };
export const HIT_STOP = { threshold: 0.55, min: 0.05, max: 0.08, cooldown: 0.4 };
export const IMPACT = { eliminated: 0.6, eliminatedYou: 0.9, block: 0.8, car: 0.7 };

export interface ImpactState {
  trauma: number;
  stop: number;
  queued: number;
  cooldown: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const calm = (): ImpactState => ({ trauma: 0, stop: 0, queued: 0, cooldown: 0 });

export function falloff(dx: number, dy: number, reach: number): number {
  return 1 - 0.5 * clamp01(Math.hypot(dx, dy) / reach);
}

export function hit(state: ImpactState, strength: number): ImpactState {
  const s = clamp01(strength);
  const trauma = Math.min(1, state.trauma + s);
  if (s < HIT_STOP.threshold || state.cooldown > 0 || state.stop > 0) return { ...state, trauma };
  const stop = HIT_STOP.min + (HIT_STOP.max - HIT_STOP.min) * ((s - HIT_STOP.threshold) / (1 - HIT_STOP.threshold));
  return { ...state, trauma, queued: Math.max(state.queued, stop) };
}

export function release(state: ImpactState): ImpactState {
  if (state.queued <= 0) return state;
  return { ...state, stop: state.queued, queued: 0, cooldown: state.queued + HIT_STOP.cooldown };
}

export function settle(state: ImpactState, dt: number): ImpactState {
  const held = Math.min(state.stop, dt);
  return {
    ...state,
    trauma: Math.max(0, state.trauma - SHAKE.decay * (dt - held)),
    stop: state.stop - held,
    cooldown: Math.max(0, state.cooldown - dt),
  };
}

const wobble = (t: number, axis: number) =>
  (Math.sin(t * SHAKE.freq * (1 + axis * 0.31) + axis * 1.7) + Math.sin(t * SHAKE.freq * 1.93 * (1 + axis * 0.17) + axis * 4.1)) / 2;

export function shake(trauma: number, t: number): [number, number] {
  const amp = trauma * trauma * SHAKE.max;
  return [amp * wobble(t, 0), amp * wobble(t, 1)];
}

export function shakeCamera(camera: Camera, trauma: number, t: number): Camera {
  if (trauma <= 0) return camera;
  const [dx, dy] = shake(trauma, t);
  return { ...camera, x: camera.x + dx * camera.scale, y: camera.y + dy * camera.scale };
}
