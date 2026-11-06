export const BOOST_ATTACK = 0.08;
export const BOOST_TAIL = 0.45;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function boostLevel(level: number, on: boolean, dt: number): number {
  return clamp01(on ? level + dt / BOOST_ATTACK : level - dt / BOOST_TAIL);
}

export function hash01(a: number, b: number, c = 0): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function seedOf(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return h | 0;
}

export function flicker(t: number, seed: number, rate = 30): number {
  const x = t * rate;
  const step = Math.floor(x);
  const f = x - step;
  const a = hash01(step, seed);
  const b = hash01(step + 1, seed);
  return a + (b - a) * f * f * (3 - 2 * f);
}

export function glitchDensity(row: number, rows: number): number {
  const fade = clamp01(1 - row / rows);
  return row < 2 ? 0.9 : 0.8 * fade * fade;
}

export function rowTear(row: number, tick: number, cell: number): number {
  return hash01(row, tick, 11) < 0.22 ? (hash01(row, tick, 12) - 0.5) * 4 * cell : 0;
}
