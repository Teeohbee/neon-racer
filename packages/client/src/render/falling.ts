export const FALL = { duration: 0.6, spin: 2.5 * Math.PI, carry: 0.25 };

export interface FallStart {
  id: string;
  x: number;
  y: number;
  angle: number;
  color: number;
  vx: number;
  vy: number;
}

export interface FallPose {
  x: number;
  y: number;
  angle: number;
  scale: number;
  alpha: number;
  done: boolean;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function fallPose(start: FallStart, elapsed: number): FallPose {
  const p = clamp01(elapsed / FALL.duration);
  const carry = FALL.carry * FALL.duration * (1 - (1 - p) * (1 - p));
  return {
    x: start.x + start.vx * carry,
    y: start.y + start.vy * carry,
    angle: start.angle + FALL.spin * p * p,
    scale: 1 - p * p,
    alpha: 1 - p * Math.sqrt(p),
    done: p >= 1,
  };
}
