import type { AdvancedBloomFilter } from "pixi-filters";

export const SWELL = { attack: 0.05, release: 0.4, scale: 1.4, brightness: 0.35, threshold: 0.12, impactFrom: 0.5, off: 0.002 };

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

export const kickTarget = (target: number, amount: number) => Math.max(target, clamp01(amount));

export const impactSwell = (strength: number) => clamp01((strength - SWELL.impactFrom) / (1 - SWELL.impactFrom));

export function stepTarget(target: number, dt: number): number {
  const next = target * Math.exp(-dt / SWELL.release);
  return next < SWELL.off ? 0 : next;
}

export function stepLevel(level: number, target: number, dt: number): number {
  if (level >= target) return target;
  return target + (level - target) * Math.exp(-dt / SWELL.attack);
}

export function createBloomSwell(bloom: AdvancedBloomFilter) {
  const base = { bloomScale: bloom.bloomScale, brightness: bloom.brightness, threshold: bloom.threshold };
  let target = 0;
  let level = 0;

  return {
    kick(amount: number) {
      target = kickTarget(target, amount);
    },
    update(dt: number) {
      if (target === 0 && level === 0) return;
      level = stepLevel(level, target, dt);
      target = stepTarget(target, dt);
      bloom.bloomScale = base.bloomScale + SWELL.scale * level;
      bloom.brightness = base.brightness + SWELL.brightness * level;
      bloom.threshold = base.threshold - SWELL.threshold * level;
    },
  };
}
