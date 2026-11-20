import { describe, expect, it } from "vitest";
import { lerpAngle, MAX_LEAD, SnapshotBuffer, type Snap } from "../src/net/interpolation";

const snap = (tick: number, x: number, phase: Snap["phase"] = "race", line: number | null = null): Snap => ({
  t: "snap", tick, phase, now: tick / 60, camera: { x, y: 0, scale: 1 }, line, lap: null,
  cars: [{ id: "a", x, y: 0, angle: 0, vx: 0, vy: 0, alive: true, ack: 0 }], hazards: [], cooldowns: {},
});

/** When the snapshot sent at `sentMs` arrives: 50 ms later, plus whatever the connection does. */
type Arrival = (sentMs: number) => number;
const laggier = (fromMs: number, extraMs: number): Arrival => (sent) => sent + 50 + (sent >= fromMs ? extraMs : 0);
const stalled = (atMs: number, forMs: number): Arrival => (sent) => Math.max(sent + 50, sent >= atMs && sent < atMs + forMs ? atMs + forMs + 50 : 0);

/** A car moving one unit a tick, snapshotted every 3 ticks (20 Hz) and drawn at 120 Hz for a minute. */
function drawnOver(arrival: Arrival): { ms: number; x: number }[] {
  const buf = new SnapshotBuffer();
  const drawn: { ms: number; x: number }[] = [];
  let sent = 0;
  for (let ms = 0; ms < 60_000; ms += 1000 / 120) {
    while (arrival(sent * 50) <= ms) {
      buf.push(snap(sent * 3, sent * 3), arrival(sent * 50));
      sent++;
    }
    const s = buf.sample(ms);
    if (s) drawn.push({ ms, x: s.cars[0]!.x });
  }
  return drawn;
}

/** Frames between `fromMs` and `toMs` where the car didn't move: drawing has caught up with the newest snapshot. */
const frozenFrames = (drawn: { ms: number; x: number }[], fromMs: number, toMs: number) =>
  drawn.filter((d, i) => i > 0 && d.ms >= fromMs && d.ms < toMs && d.x === drawn[i - 1]!.x).length;

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
    expect(buf.lineAhead(10_000)).toBeCloseTo(30 + MAX_LEAD * 10);
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

  it("runs the camera on with your car, at the speed it was last seen moving", () => {
    const buf = new SnapshotBuffer();
    [0, 3, 6, 9].forEach((tick, i) => buf.push(snap(tick, tick * 10, "race", 0), 1000 + i * 50));
    expect(buf.cameraAhead(6)).toEqual({ x: 90 + 6 * 10, y: 0, scale: 1 });
    expect(buf.cameraAhead(0)).toEqual({ x: 90, y: 0, scale: 1 });
    expect(buf.cameraAhead(10_000)!.x).toBeCloseTo(90 + MAX_LEAD * 10);
  });

  it("doesn't run the camera on from the last phase", () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(0, 500, "countdown"), 1000);
    buf.push(snap(3, 100, "race"), 1050);
    expect(buf.cameraAhead(6)).toEqual({ x: 100, y: 0, scale: 1 });
    expect(new SnapshotBuffer().cameraAhead(6)).toBeNull();
  });

  it("settles within a few seconds when the connection's delay goes up for good", () => {
    const drawn = drawnOver(laggier(20_000, 100));
    expect(frozenFrames(drawn, 20_000, 25_000)).toBeLessThan(400);
    expect(frozenFrames(drawn, 25_000, 60_000)).toBe(0);
  });

  it("rides out a one-off stall without changing how far behind it draws", () => {
    const drawn = drawnOver(stalled(20_000, 300));
    expect(frozenFrames(drawn, 21_000, 60_000)).toBe(0);
  });

  it("never draws time running backwards, whatever the connection does", () => {
    for (const arrival of [laggier(20_000, 100), laggier(20_000, -100), stalled(20_000, 300)]) {
      const drawn = drawnOver(arrival);
      for (let i = 1; i < drawn.length; i++) expect(drawn[i]!.x).toBeGreaterThanOrEqual(drawn[i - 1]!.x);
    }
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

  it("says how much later each snapshot came than the quickest of the last two seconds", () => {
    const buf = new SnapshotBuffer();
    expect(buf.push(snap(0, 0), 1000)).toBe(0);
    expect(buf.push(snap(3, 30), 1050)).toBe(0);
    expect(buf.push(snap(6, 60), 1130)).toBe(30);
  });

  it("says when drawing has run past the newest snapshot, with nothing left to blend towards", () => {
    const buf = new SnapshotBuffer();
    buf.push(snap(0, 0), 1000);
    buf.push(snap(3, 30), 1050);
    expect(buf.starved(1000 + 8 * (1000 / 60))).toBe(false);
    expect(buf.starved(1000 + 10 * (1000 / 60))).toBe(true);
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
