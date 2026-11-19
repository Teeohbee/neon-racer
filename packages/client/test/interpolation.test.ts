import { describe, expect, it } from "vitest";
import { lerpAngle, MAX_LINE_LEAD, SnapshotBuffer, type Snap } from "../src/net/interpolation";

const snap = (tick: number, x: number, phase: Snap["phase"] = "race", line: number | null = null): Snap => ({
  t: "snap", tick, phase, now: tick / 60, camera: { x, y: 0, scale: 1 }, line, lap: null,
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

  it("moves the danger line smoothly between snapshots", () => {
    const buf = new SnapshotBuffer();
    [0, 3, 6, 9].forEach((tick, i) => buf.push(snap(tick, 0, "race", tick * 10), 1000 + i * 50));
    const line = buf.sample(1150 + 1000 / 60 * 1.5)!.line!;
    expect(line).toBeGreaterThan(30);
    expect(line).toBeLessThan(60);
  });

  it("drops the danger line as soon as a snapshot has none", () => {
    const buf = new SnapshotBuffer();
    [100, 100, null, null].forEach((line, i) => buf.push(snap(i * 3, 0, "race", line), 1000 + i * 50));
    expect(buf.sample(1150 + 1000 / 60 * 1.5)!.line).toBeNull();
  });

  it("puts the line where the server will have it once your car's inputs in flight land", () => {
    const buf = new SnapshotBuffer();
    [0, 3, 6, 9].forEach((tick, i) => buf.push(snap(tick, 0, "race", tick * 10), 1000 + i * 50));
    expect(buf.lineAhead(6)).toBeCloseTo(90 + 6 * 10);
    expect(buf.lineAhead(0)).toBeCloseTo(90);
  });

  it("reaches no further ahead than a cap, however far behind the acks are", () => {
    const buf = new SnapshotBuffer();
    [0, 3].forEach((tick, i) => buf.push(snap(tick, 0, "race", tick * 10), 1000 + i * 50));
    expect(buf.lineAhead(10_000)).toBeCloseTo(30 + MAX_LINE_LEAD * 10);
    expect(buf.lineAhead(-5)).toBeCloseTo(30);
  });

  it("has no line ahead when there is none, and doesn't guess a speed from the last phase", () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(0, 0, "race", null), 1000);
    expect(buf.lineAhead(6)).toBeNull();
    buf.push(snap(3, 0, "countdown", 500), 1050);
    buf.push(snap(6, 0, "race", 100), 1100);
    expect(buf.lineAhead(6)).toBe(100);
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
