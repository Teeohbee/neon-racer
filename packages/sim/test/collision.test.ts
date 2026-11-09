import { describe, expect, it } from "vitest";
import { CAR_RADIUS } from "../src/car";
import { resolveCarCollisions } from "../src/collision";

const car = (x: number, vx: number) => ({ x, y: 0, angle: 0, vx, vy: 0 });

describe("resolveCarCollisions", () => {
  it("separates overlapping cars", () => {
    const [a, b] = resolveCarCollisions([car(0, 0), car(10, 0)]);
    expect(b!.x - a!.x).toBeGreaterThanOrEqual(CAR_RADIUS * 2 - 0.001);
  });

  it("bounces cars driving into each other", () => {
    const [a, b] = resolveCarCollisions([car(0, 300), car(CAR_RADIUS * 2 - 4, -300)]);
    expect(a!.vx).toBeLessThan(0);
    expect(b!.vx).toBeGreaterThan(0);
  });

  it("leaves cars that are apart untouched", () => {
    const cars = [car(0, 100), car(500, 100)];
    expect(resolveCarCollisions(cars)).toEqual(cars);
  });

  it("lets a car on a bridge pass over a car underneath", () => {
    const cars = [car(0, 300), car(10, -300)];
    expect(resolveCarCollisions(cars, [true, false])).toEqual(cars);
  });

  it("still collides cars on the same level", () => {
    const [a, b] = resolveCarCollisions([car(0, 0), car(10, 0)], [true, true]);
    expect(b!.x - a!.x).toBeGreaterThanOrEqual(CAR_RADIUS * 2 - 0.001);
  });
});
