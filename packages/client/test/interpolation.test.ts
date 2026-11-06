import { describe, expect, it } from "vitest";
import { lerpAngle, SnapshotBuffer, type Snap } from "../src/net/interpolation";

const snap = (tick: number, x: number, phase: Snap["phase"] = "race"): Snap => ({
  t: "snap", tick, phase, now: tick / 60, camera: { x, y: 0, scale: 1 },
  cars: [{ id: "a", x, y: 0, angle: 0, vx: 0, vy: 0, alive: true, ack: 0 }], hazards: [], cooldowns: {},
});

describe("SnapshotBuffer", () => {
  it("renders 100ms in the past, interpolating between snapshots", () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(0, 0), 1000);
    buf.push(snap(3, 30), 1050);
    buf.push(snap(6, 60), 1100);
    buf.push(snap(9, 90), 1150);
    const s = buf.sample(1150 + 1000 / 60 * 1.5 + 0)!;
    expect(s.cars[0]!.x).toBeGreaterThan(30);
    expect(s.cars[0]!.x).toBeLessThan(60);
  });

  it("does not extrapolate past the newest snapshot", () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(0, 0), 1000);
    buf.push(snap(3, 30), 1050);
    expect(buf.sample(5000)!.cars[0]!.x).toBe(30);
  });

  it("does not blend across a phase change", () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(0, 0, "roundEnd"), 1000);
    buf.push(snap(6, 500, "race"), 1100);
    const x = buf.sample(1100 + 1000 / 60 * 3)!.cars[0]!.x;
    expect([0, 500]).toContain(x);
  });

  it("is robust to jittery arrival times", () => {
    const buf = new SnapshotBuffer();
    [1000, 1080, 1100, 1190, 1200].forEach((at, i) => buf.push(snap(i * 3, i * 30), at));
    const x = buf.sample(1200)!.cars[0]!.x;
    expect(x).toBeGreaterThanOrEqual(30);
    expect(x).toBeLessThanOrEqual(120);
  });
});

describe("lerpAngle", () => {
  it("takes the short way round", () => {
    expect(lerpAngle(3, -3, 0.5)).toBeCloseTo(Math.PI, 1);
  });
});
