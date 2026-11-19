import { TICK_RATE, type ServerMsg } from "@neon/sim";
import { describe, expect, it } from "vitest";
import { StepSnaps } from "../src/local/step-snaps";
import { localRig } from "./local-helpers";

const DT = 1 / TICK_RATE;
type Snap = Extract<ServerMsg, { t: "snap" }>;

function racing() {
  const r = localRig();
  r.press("pad-0", "a");
  r.match.asHost({ t: "addBot", skill: "medium" });
  r.press("pad-0", "start");
  r.tick(4, () => r.phase() === "race");
  r.tick(0.2);
  return r;
}

const snapsIn = (messages: ServerMsg[]) => messages.filter((m): m is Snap => m.t === "snap");

describe("drawing a Local race", () => {
  it("gets a snapshot from the Room every tick", () => {
    const r = racing();
    const before = snapsIn(r.messages).length;
    r.tick(0.5);
    const ticks = snapsIn(r.messages).slice(before).map((s) => s.tick);
    expect(ticks.length).toBeGreaterThanOrEqual(30);
    expect(ticks.slice(1).every((t, i) => t === ticks[i]! + 1)).toBe(true);
  });

  it.each([60, 90, 120, 144])("moves the drawn race on by the same time every frame at %i Hz, less than a tick behind the sim", (hz) => {
    const r = racing();
    const snaps = new StepSnaps();
    for (const msg of snapsIn(r.messages)) snaps.push(msg);
    const drawn: number[] = [];
    let seen = r.messages.length;
    for (let f = 0; f < hz; f++) {
      r.frame();
      r.match.step(1 / hz);
      for (const msg of snapsIn(r.messages.slice(seen))) snaps.push(msg);
      seen = r.messages.length;
      const t = r.match.blend();
      drawn.push(snaps.time(t));
      expect(snaps.latest()!.now - snaps.time(t)).toBeLessThanOrEqual(DT + 1e-9);
    }
    for (const [i, at] of drawn.entries()) if (i > 0) expect(at - drawn[i - 1]!).toBeCloseTo(1 / hz, 6);
  });

  it("draws cars and camera the same share of the way between two ticks as the clock", () => {
    const snaps = new StepSnaps();
    const snap = (tick: number, x: number): Snap =>
      ({ t: "snap", tick, phase: "race", now: tick * DT, camera: { x, y: 0, scale: 1 }, line: null, lap: 1, cars: [{ id: "a", x, y: 0, angle: 0, vx: 0, vy: 0, alive: true, ack: 0 }], hazards: [], cooldowns: {} }) as Snap;
    snaps.push(snap(1, 0));
    snaps.push(snap(2, 30));
    const drawn = snaps.sample(0.25)!;
    expect(drawn.cars[0]!.x).toBeCloseTo(7.5);
    expect(drawn.camera.x).toBeCloseTo(7.5);
    expect(snaps.time(0.25)).toBeCloseTo(1.25 * DT);
  });

  it("draws a new phase's first snapshot as it is, not blended with the last phase", () => {
    const snaps = new StepSnaps();
    const base = { t: "snap", tick: 1, now: 3, camera: { x: 0, y: 0, scale: 1 }, line: null, lap: 1, cars: [], hazards: [], cooldowns: {} };
    snaps.push({ ...base, phase: "countdown" } as Snap);
    snaps.push({ ...base, tick: 2, phase: "race", now: 0, camera: { x: 50, y: 0, scale: 1 } } as Snap);
    expect(snaps.sample(0.5)!.camera.x).toBe(50);
    expect(snaps.time(0.5)).toBe(0);
  });
});
