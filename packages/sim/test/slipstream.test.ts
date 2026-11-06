import { describe, expect, it } from "vitest";
import { defaultCarParams, emptyInput, speedOf, type CarState } from "../src/car";
import { DRAFT_RAMP_IN, DRAFT_RANGE, draftTarget, inSlipstream, rampDraft, Slipstream } from "../src/slipstream";
import { stepWorldCar } from "../src/world";

const DT = 1 / 60;
const TOP = defaultCarParams.maxSpeed;
const throttle = { ...emptyInput, throttle: true };
const leader: CarState = { x: 0, y: 0, angle: 0, vx: TOP, vy: 0 };
const behind = (gap: number, side = 0, angle = 0): CarState => ({ x: -gap, y: side, angle, vx: TOP * Math.cos(angle), vy: TOP * Math.sin(angle) });

describe("inSlipstream", () => {
  it("catches a car tucked in behind", () => {
    expect(inSlipstream(behind(60), leader)).toBe(true);
    expect(inSlipstream(behind(DRAFT_RANGE - 10, 20), leader)).toBe(true);
  });

  it("misses a car too far back, alongside or ahead", () => {
    expect(inSlipstream(behind(DRAFT_RANGE + 10), leader)).toBe(false);
    expect(inSlipstream(behind(60, 80), leader)).toBe(false);
    expect(inSlipstream(behind(5, 34), leader)).toBe(false);
    expect(inSlipstream(behind(-60), leader)).toBe(false);
  });

  it("follows the heading of the car ahead", () => {
    const north = { ...leader, angle: -Math.PI / 2, vx: 0, vy: -TOP };
    expect(inSlipstream({ x: 0, y: 100, angle: -Math.PI / 2, vx: 0, vy: -TOP }, north)).toBe(true);
    expect(inSlipstream(behind(100), north)).toBe(false);
  });

  it("needs the car ahead to be moving and both pointing the same way", () => {
    expect(inSlipstream(behind(60), { ...leader, vx: 0 })).toBe(false);
    expect(inSlipstream(behind(60, 0, Math.PI), leader)).toBe(false);
  });
});

describe("rampDraft", () => {
  it("ramps in over a short time rather than snapping on", () => {
    let amount = 0;
    amount = rampDraft(amount, draftTarget(behind(60), [leader]), DT);
    expect(amount).toBeGreaterThan(0);
    expect(amount).toBeLessThan(0.1);
    for (let t = 0; t < DRAFT_RAMP_IN; t += DT) amount = rampDraft(amount, 1, DT);
    expect(amount).toBe(1);
  });

  it("does not flicker off when the draft drops out for a moment", () => {
    let amount = 1;
    for (let i = 0; i < 6; i++) amount = rampDraft(amount, 0, DT);
    expect(amount).toBeGreaterThan(0.8);
  });
});

describe("Slipstream", () => {
  it("tracks a ramped amount for each car", () => {
    const tracker = new Slipstream();
    const cars = [
      { id: "lead", car: leader },
      { id: "tuck", car: behind(80) },
    ];
    for (let i = 0; i < 60; i++) tracker.update(cars, DT);
    expect(tracker.amount("tuck")).toBe(1);
    expect(tracker.amount("lead")).toBe(0);
    expect(tracker.amount("missing")).toBe(0);
  });

  it("steps one car against the others", () => {
    const tracker = new Slipstream();
    expect(tracker.step("me", behind(80), [leader], DT)).toBeGreaterThan(0);
    expect(tracker.amount("me")).toBeGreaterThan(0);
  });
});

describe("drafting in stepWorldCar", () => {
  const ctx = { track: null, hazards: [], now: 0 };
  const settle = (draft: number, seconds = 3) => {
    let car: CarState = { x: 0, y: 0, angle: 0, vx: 0, vy: 0 };
    for (let i = 0; i < seconds * 60; i++) car = stepWorldCar(car, throttle, DT, { ...ctx, draft }).car;
    return car;
  };

  it("raises the top speed", () => {
    expect(speedOf(settle(0))).toBeLessThan(TOP + 20);
    expect(speedOf(settle(1))).toBeGreaterThan(TOP * 1.1);
  });

  it("adds some acceleration", () => {
    expect(speedOf(settle(1, 0.4))).toBeGreaterThan(speedOf(settle(0, 0.4)) + 50);
  });

  it("lets a car drafting at top speed pull alongside and past", () => {
    const tracker = new Slipstream();
    let lead = leader;
    let tuck = behind(220);
    let passedAt = Infinity;
    for (let i = 0; i < 8 * 60 && passedAt === Infinity; i++) {
      const draft = tracker.step("tuck", tuck, [lead], DT);
      lead = stepWorldCar(lead, throttle, DT, ctx).car;
      tuck = stepWorldCar(tuck, throttle, DT, { ...ctx, draft }).car;
      if (tuck.x > lead.x) passedAt = i * DT;
    }
    expect(passedAt).toBeLessThan(5);
  });

  it("leaves a car beyond the draft range no closer", () => {
    let lead = leader;
    let far = behind(DRAFT_RANGE + 100);
    const tracker = new Slipstream();
    for (let i = 0; i < 3 * 60; i++) {
      const draft = tracker.step("far", far, [lead], DT);
      lead = stepWorldCar(lead, throttle, DT, ctx).car;
      far = stepWorldCar(far, throttle, DT, { ...ctx, draft }).car;
    }
    expect(lead.x - far.x).toBeGreaterThanOrEqual(DRAFT_RANGE + 99);
  });
});
