import { TICK_RATE, type Camera, type CarSnap, type ServerMsg } from "@neon/sim";

export type Snap = Extract<ServerMsg, { t: "snap" }>;

const TICK_MS = 1000 / TICK_RATE;
const DELAY_TICKS = 6;
const KEEP = 40;
const DRIFT_PER_MS = 0.002;

export interface Sampled {
  snap: Snap;
  camera: Camera;
  line: number | null;
  cars: CarSnap[];
}

export class SnapshotBuffer {
  private snaps: Snap[] = [];
  private arrivals: number[] = [];
  private offset = Infinity;
  private lastArrival = 0;

  push(snap: Snap, arrivalMs: number): void {
    this.snaps.push(snap);
    this.arrivals.push(arrivalMs);
    if (this.snaps.length > KEEP) {
      this.snaps.shift();
      this.arrivals.shift();
    }
    const sample = arrivalMs - snap.tick * TICK_MS;
    const relaxed = this.offset === Infinity ? sample : this.offset + (arrivalMs - this.lastArrival) * DRIFT_PER_MS;
    this.offset = Math.min(relaxed, sample);
    this.lastArrival = arrivalMs;
  }

  clear(): void {
    this.snaps = [];
    this.arrivals = [];
  }

  latest(): Snap | undefined {
    return this.snaps[this.snaps.length - 1];
  }

  serverNow(nowMs: number): number {
    const latest = this.latest();
    if (!latest) return 0;
    return latest.now + (nowMs - this.arrivals[this.arrivals.length - 1]!) / 1000;
  }

  sample(nowMs: number): Sampled | null {
    const n = this.snaps.length;
    if (n === 0) return null;
    const renderTick = (nowMs - this.offset) / TICK_MS - DELAY_TICKS;
    let i = n - 1;
    while (i > 0 && this.snaps[i]!.tick > renderTick) i--;
    const a = this.snaps[i]!;
    const b = this.snaps[Math.min(i + 1, n - 1)]!;
    if (renderTick <= a.tick) return blendSnaps(a, a, 0);
    return blendSnaps(a, b, a === b ? 1 : Math.min(1, (renderTick - a.tick) / (b.tick - a.tick)));
  }
}

/** What to draw `t` (0..1) of the way from snapshot `a` to `b`; across a phase change, `b` as it is. */
export function blendSnaps(a: Snap, b: Snap, t: number): Sampled {
  if (a === b || a.phase !== b.phase) return { snap: b, camera: b.camera, line: b.line, cars: b.cars };
  const line = a.line !== null && b.line !== null ? lerp(a.line, b.line, t) : b.line;
  return { snap: b, camera: lerpCamera(a.camera, b.camera, t), line, cars: lerpCars(a.cars, b.cars, t) };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function lerpCamera(a: Camera, b: Camera, t: number): Camera {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), scale: lerp(a.scale, b.scale, t) };
}

function lerpCars(a: CarSnap[], b: CarSnap[], t: number): CarSnap[] {
  const prev = new Map(a.map((c) => [c.id, c]));
  return b.map((cb) => {
    const ca = prev.get(cb.id);
    if (!ca) return cb;
    return {
      ...cb,
      x: lerp(ca.x, cb.x, t),
      y: lerp(ca.y, cb.y, t),
      vx: lerp(ca.vx, cb.vx, t),
      vy: lerp(ca.vy, cb.vy, t),
      angle: lerpAngle(ca.angle, cb.angle, t),
    };
  });
}
