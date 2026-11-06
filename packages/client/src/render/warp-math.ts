export const SPRING = { stiffness: 260, anchor: 18, damping: 3.5, step: 1 / 60, maxSteps: 3, limit: 0.9 };
export const REST = 0.02;

export interface Field {
  cols: number;
  rows: number;
  spacing: number;
  dx: Float32Array;
  dy: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  scratch: Float32Array;
}

export function createField(cols: number, rows: number, spacing: number): Field {
  const n = cols * rows;
  return { cols, rows, spacing, dx: new Float32Array(n), dy: new Float32Array(n), vx: new Float32Array(n), vy: new Float32Array(n), scratch: new Float32Array(n) };
}

export function falloff(dist: number, radius: number): number {
  if (radius <= 0 || dist >= radius) return 0;
  const q = dist / radius;
  const k = 1 - q * q;
  return k * k;
}

export function decay(rate: number, dt: number): number {
  return Math.exp(-rate * dt);
}

export function stepField(f: Field, h: number, p = SPRING): number {
  const { cols, rows, dx, dy, vx, vy } = f;
  const keep = decay(p.damping, h);
  const cap = p.limit * f.spacing;
  let peak = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      const x = dx[k]!;
      const y = dy[k]!;
      let lx = -4 * x;
      let ly = -4 * y;
      if (i > 0) (lx += dx[k - 1]!), (ly += dy[k - 1]!);
      if (i < cols - 1) (lx += dx[k + 1]!), (ly += dy[k + 1]!);
      if (j > 0) (lx += dx[k - cols]!), (ly += dy[k - cols]!);
      if (j < rows - 1) (lx += dx[k + cols]!), (ly += dy[k + cols]!);
      vx[k] = (vx[k]! + (p.stiffness * lx - p.anchor * x) * h) * keep;
      vy[k] = (vy[k]! + (p.stiffness * ly - p.anchor * y) * h) * keep;
    }
  }
  for (let k = 0; k < cols * rows; k++) {
    const x = Math.max(-cap, Math.min(cap, dx[k]! + vx[k]! * h));
    const y = Math.max(-cap, Math.min(cap, dy[k]! + vy[k]! * h));
    dx[k] = x;
    dy[k] = y;
    peak = Math.max(peak, Math.abs(x), Math.abs(y), Math.abs(vx[k]!) * h, Math.abs(vy[k]!) * h);
  }
  return peak;
}

export function push(f: Field, x: number, y: number, strength: number, radius: number): void {
  const { cols, rows, spacing, vx, vy } = f;
  const i0 = Math.max(0, Math.ceil((x - radius) / spacing));
  const i1 = Math.min(cols - 1, Math.floor((x + radius) / spacing));
  const j0 = Math.max(0, Math.ceil((y - radius) / spacing));
  const j1 = Math.min(rows - 1, Math.floor((y + radius) / spacing));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const ox = i * spacing - x;
      const oy = j * spacing - y;
      const dist = Math.hypot(ox, oy);
      const w = falloff(dist, radius);
      if (w <= 0 || dist === 0) continue;
      const k = j * cols + i;
      vx[k] = vx[k]! + (ox / dist) * strength * w;
      vy[k] = vy[k]! + (oy / dist) * strength * w;
    }
  }
}

export function drag(f: Field, x: number, y: number, ax: number, ay: number, radius: number): void {
  const { cols, rows, spacing, vx, vy } = f;
  const i0 = Math.max(0, Math.ceil((x - radius) / spacing));
  const i1 = Math.min(cols - 1, Math.floor((x + radius) / spacing));
  const j0 = Math.max(0, Math.ceil((y - radius) / spacing));
  const j1 = Math.min(rows - 1, Math.floor((y + radius) / spacing));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const w = falloff(Math.hypot(i * spacing - x, j * spacing - y), radius);
      if (w <= 0) continue;
      const k = j * cols + i;
      vx[k] = vx[k]! + ax * w;
      vy[k] = vy[k]! + ay * w;
    }
  }
}

function shiftArray(a: Float32Array, scratch: Float32Array, cols: number, rows: number, di: number, dj: number) {
  scratch.set(a);
  for (let j = 0; j < rows; j++) {
    const sj = j + dj;
    for (let i = 0; i < cols; i++) {
      const si = i + di;
      a[j * cols + i] = si >= 0 && si < cols && sj >= 0 && sj < rows ? scratch[sj * cols + si]! : 0;
    }
  }
}

export function shift(f: Field, di: number, dj: number): void {
  if (di === 0 && dj === 0) return;
  shiftArray(f.dx, f.scratch, f.cols, f.rows, di, dj);
  shiftArray(f.dy, f.scratch, f.cols, f.rows, di, dj);
  shiftArray(f.vx, f.scratch, f.cols, f.rows, di, dj);
  shiftArray(f.vy, f.scratch, f.cols, f.rows, di, dj);
}

export function heat(ax: number, ay: number, bx: number, by: number, spacing: number): number {
  const len = Math.hypot(bx - ax, by - ay);
  return Math.min(1, Math.abs(len - spacing) / (spacing * 0.35));
}
