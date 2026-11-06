import { describe, expect, it } from "vitest";
import { FALL, fallPose, type FallStart } from "../src/render/falling";

const start: FallStart = { id: "a", x: 100, y: 50, angle: 0.5, color: 0xffffff, vx: 400, vy: 0 };

describe("fallPose", () => {
  it("starts as the car was", () => {
    expect(fallPose(start, 0)).toEqual({ x: 100, y: 50, angle: 0.5, scale: 1, alpha: 1, done: false });
  });

  it("shrinks, spins and fades monotonically into nothing", () => {
    let prev = fallPose(start, 0);
    for (let t = 0.05; t <= FALL.duration; t += 0.05) {
      const pose = fallPose(start, t);
      expect(pose.scale).toBeLessThan(prev.scale);
      expect(pose.alpha).toBeLessThan(prev.alpha);
      expect(pose.angle).toBeGreaterThan(prev.angle);
      prev = pose;
    }
    const end = fallPose(start, FALL.duration);
    expect(end.scale).toBe(0);
    expect(end.alpha).toBe(0);
    expect(end.angle).toBeCloseTo(0.5 + FALL.spin);
    expect(end.done).toBe(true);
  });

  it("carries a little momentum over the edge, easing out", () => {
    const half = fallPose(start, FALL.duration / 2).x - start.x;
    const full = fallPose(start, FALL.duration).x - start.x;
    expect(full).toBeCloseTo(400 * FALL.carry * FALL.duration);
    expect(half).toBeGreaterThan(full / 2);
    expect(fallPose(start, 10).x).toBeCloseTo(start.x + full);
  });
});
