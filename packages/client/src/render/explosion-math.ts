export const DEBRIS = { count: 150, drag: 2.4, gravity: 140, speedMin: 120, speedMax: 1050, lifeMin: 0.55, lifeMax: 1.5, streak: 0.035, hot: 0.3 };
export const RING = { life: 0.6, radius: 380, width: 16, flash: 0.18, flashRadius: 90 };
export const FALL_POP = 0.4;

export interface Debris {
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  life: Float32Array;
  max: Float32Array;
}

export function createDebris(size: number): Debris {
  return { x: new Float32Array(size), y: new Float32Array(size), vx: new Float32Array(size), vy: new Float32Array(size), life: new Float32Array(size), max: new Float32Array(size) };
}

export const launchSpeed = (r: number) => DEBRIS.speedMin + (DEBRIS.speedMax - DEBRIS.speedMin) * r * r;

export function stepDebris(d: Debris, from: number, to: number, dt: number): number {
  const keep = Math.exp(-DEBRIS.drag * dt);
  let live = 0;
  for (let k = from; k < to; k++) {
    if (d.life[k]! <= 0) continue;
    const life = d.life[k]! - dt;
    d.life[k] = life;
    if (life <= 0) continue;
    live++;
    d.vx[k] = d.vx[k]! * keep;
    d.vy[k] = d.vy[k]! * keep + DEBRIS.gravity * dt;
    d.x[k] = d.x[k]! + d.vx[k]! * dt;
    d.y[k] = d.y[k]! + d.vy[k]! * dt;
  }
  return live;
}

const ease = (p: number) => 1 - (1 - p) * (1 - p) * (1 - p);

export const ringRadius = (age: number, scale: number) => RING.radius * scale * ease(Math.min(1, age / RING.life));

export const ringAlpha = (age: number) => {
  const p = Math.min(1, age / RING.life);
  return Math.pow(1 - p, 1.5);
};

export const ringWidth = (age: number, scale: number) => 2 + RING.width * scale * (1 - Math.min(1, age / RING.life));

export const flashAlpha = (age: number) => Math.max(0, 1 - age / RING.flash);
