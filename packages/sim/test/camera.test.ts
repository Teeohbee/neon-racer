import { describe, expect, it } from "vitest";
import { isOutsideView, stepCamera, suddenDeathScale, VIEW } from "../src/camera";

describe("camera", () => {
  it("drifts toward the leader", () => {
    let cam = { x: 0, y: 0, scale: 1 };
    for (let i = 0; i < 120; i++) cam = stepCamera(cam, { x: 500, y: 0, vx: 0, vy: 0 }, 1 / 60, 1);
    expect(cam.x).toBeGreaterThan(450);
  });

  it("looks ahead in the leader's direction of travel", () => {
    let cam = { x: 0, y: 0, scale: 1 };
    for (let i = 0; i < 300; i++) cam = stepCamera(cam, { x: 0, y: 0, vx: 600, vy: 0 }, 1 / 60, 1);
    expect(cam.x).toBeGreaterThan(100);
  });

  it("knows which cars have left the shot", () => {
    const cam = { x: 0, y: 0, scale: 1 };
    expect(isOutsideView(cam, VIEW.width / 2 - 50, 0)).toBe(false);
    expect(isOutsideView(cam, VIEW.width / 2 + 50, 0)).toBe(true);
    expect(isOutsideView({ ...cam, scale: 0.5 }, VIEW.width / 4 + 50, 0)).toBe(true);
  });

  it("shrinks the view in sudden death", () => {
    expect(suddenDeathScale(30)).toBe(1);
    expect(suddenDeathScale(105)).toBeLessThan(1);
    expect(suddenDeathScale(500)).toBeCloseTo(0.5);
  });
});
