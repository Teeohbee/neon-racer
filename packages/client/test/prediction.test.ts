import { describe, expect, it } from "vitest";
import { emptyInput, stepWorldCar } from "@neon/sim";
import { Predictor } from "../src/net/prediction";

const DT = 1 / 60;
const ctx = { track: null, hazards: [], now: 0 };
const throttle = { ...emptyInput, throttle: true };
const origin = { x: 0, y: 0, angle: 0, vx: 0, vy: 0 };

describe("Predictor", () => {
  it("moves the local car immediately", () => {
    const p = new Predictor(origin);
    p.step(throttle, DT, ctx);
    expect(p.state.vx).toBeGreaterThan(0);
  });

  it("lands on the same state when the server agrees", () => {
    const p = new Predictor(origin);
    let server = origin;
    for (let i = 0; i < 10; i++) p.step(throttle, DT, ctx);
    for (let i = 0; i < 4; i++) server = stepWorldCar(server, throttle, DT, ctx).car;
    const predicted = p.state;
    p.reconcile(server, 4, DT, ctx);
    expect(p.state.x).toBeCloseTo(predicted.x, 6);
  });

  it("adopts the server's correction and smooths it visually", () => {
    const p = new Predictor(origin);
    for (let i = 0; i < 10; i++) p.step(throttle, DT, ctx);
    const bumped = { ...origin, y: 50 };
    p.reconcile(bumped, 4, DT, ctx);
    expect(p.state.y).toBeCloseTo(50, 0);
    expect(p.rendered.y).toBeCloseTo(0, 0);
    for (let i = 0; i < 60; i++) p.step(emptyInput, DT, ctx);
    expect(p.rendered.y).toBeCloseTo(p.state.y, 0);
  });

  it("says how far each reconcile moved the car", () => {
    const p = new Predictor(origin);
    for (let i = 0; i < 10; i++) p.step(emptyInput, DT, ctx);
    expect(p.reconcile(origin, 4, DT, ctx)).toBeCloseTo(0, 6);
    expect(p.reconcile({ ...origin, x: 3, y: 4 }, 4, DT, ctx)).toBeCloseTo(5, 6);
  });
});
