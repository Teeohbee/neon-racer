import { describe, expect, it } from "vitest";
import { defaultCarParams, emptyInput, speedOf, stepCar, type CarInput, type CarState } from "../src/car";

const DT = 1 / 60;
const at = (overrides: Partial<CarState> = {}): CarState => ({ x: 0, y: 0, angle: 0, vx: 0, vy: 0, ...overrides });
const press = (keys: Partial<CarInput>): CarInput => ({ ...emptyInput, ...keys });

function run(car: CarState, input: CarInput, seconds: number, speedFactor = 1): CarState {
  let state = car;
  for (let i = 0; i < Math.round(seconds / DT); i++) state = stepCar(state, input, DT, defaultCarParams, speedFactor);
  return state;
}

describe("stepCar", () => {
  it("accelerates along its heading under throttle", () => {
    const car = run(at({ angle: Math.PI / 2 }), press({ throttle: true }), 0.5);
    expect(car.y).toBeGreaterThan(50);
    expect(Math.abs(car.x)).toBeLessThan(1);
  });

  it("tops out at max speed", () => {
    const car = run(at(), press({ throttle: true }), 10);
    expect(speedOf(car)).toBeCloseTo(defaultCarParams.maxSpeed, -1);
  });

  it("slows down when coasting", () => {
    const moving = at({ vx: 400 });
    expect(speedOf(run(moving, emptyInput, 1))).toBeLessThan(400);
  });

  it("stops faster braking than coasting", () => {
    const moving = at({ vx: 400 });
    expect(speedOf(run(moving, press({ brake: true }), 0.25))).toBeLessThan(speedOf(run(moving, emptyInput, 0.25)));
  });

  it("reverses from rest when braking, up to reverse max", () => {
    const car = run(at(), press({ brake: true }), 5);
    expect(car.vx).toBeLessThan(0);
    expect(speedOf(car)).toBeCloseTo(defaultCarParams.reverseMaxSpeed, -1);
  });

  it("does not turn on the spot", () => {
    expect(run(at(), press({ right: true }), 1).angle).toBe(0);
  });

  it("turns right (clockwise on screen) when moving forward", () => {
    expect(run(at({ vx: 300 }), press({ right: true, throttle: true }), 0.3).angle).toBeGreaterThan(0.2);
  });

  it("inverts steering when reversing", () => {
    expect(run(at({ vx: -150 }), press({ right: true, brake: true }), 0.3).angle).toBeLessThan(0);
  });

  it("keeps more sideways slide with the handbrake on", () => {
    const sliding = at({ vy: 300 });
    const gripped = run(sliding, emptyInput, 0.2);
    const drifting = run(sliding, press({ handbrake: true }), 0.2);
    expect(Math.abs(drifting.vy)).toBeGreaterThan(Math.abs(gripped.vy) * 2);
  });

  it("is capped lower when the surface slows it", () => {
    const car = run(at(), press({ throttle: true }), 10, 0.45);
    expect(speedOf(car)).toBeCloseTo(defaultCarParams.maxSpeed * 0.45, -1);
  });
});
