import { describe, expect, it } from "vitest";
import { calm, falloff, HIT_STOP, hit, release, settle, shake, SHAKE, shakeCamera } from "../src/render/impact";

describe("impact envelope", () => {
  it("adds trauma by strength and caps it at 1", () => {
    expect(hit(calm(), 0.3).trauma).toBeCloseTo(0.3);
    expect(hit(hit(calm(), 0.8), 0.8).trauma).toBe(1);
  });

  it("decays trauma linearly to rest", () => {
    const s = settle(hit(calm(), 0.9), 0.25);
    expect(s.trauma).toBeCloseTo(0.9 - SHAKE.decay * 0.25);
    expect(settle(s, 10).trauma).toBe(0);
  });

  it("shakes by trauma squared and never past the max", () => {
    for (let t = 0; t < 2; t += 0.013) {
      const [x, y] = shake(1, t);
      expect(Math.abs(x)).toBeLessThanOrEqual(SHAKE.max);
      expect(Math.abs(y)).toBeLessThanOrEqual(SHAKE.max);
      const [hx, hy] = shake(0.5, t);
      expect(hx).toBeCloseTo(x / 4);
      expect(hy).toBeCloseTo(y / 4);
    }
    expect(shake(0, 1).map(Math.abs)).toEqual([0, 0]);
  });

  it("only queues a hit-stop for strong hits, scaled between min and max", () => {
    expect(hit(calm(), HIT_STOP.threshold - 0.01).queued).toBe(0);
    expect(hit(calm(), HIT_STOP.threshold).queued).toBeCloseTo(HIT_STOP.min);
    expect(hit(calm(), 1).queued).toBeCloseTo(HIT_STOP.max);
  });

  it("starts the stop on release, holds trauma while stopped, then resumes decay", () => {
    const stopped = release(hit(calm(), 1));
    expect(stopped.stop).toBeCloseTo(HIT_STOP.max);
    expect(stopped.queued).toBe(0);
    const held = settle(stopped, 0.05);
    expect(held.trauma).toBe(1);
    expect(held.stop).toBeCloseTo(HIT_STOP.max - 0.05);
    const after = settle(held, 0.05);
    expect(after.stop).toBe(0);
    expect(after.trauma).toBeCloseTo(1 - SHAKE.decay * (0.05 - (HIT_STOP.max - 0.05)));
  });

  it("does not chain hit-stops inside the cooldown", () => {
    let s = settle(release(hit(calm(), 1)), HIT_STOP.max);
    s = hit(s, 1);
    expect(s.queued).toBe(0);
    s = settle(s, HIT_STOP.cooldown);
    expect(hit(s, 1).queued).toBeCloseTo(HIT_STOP.max);
  });

  it("offsets the camera by view pixels scaled to the zoom", () => {
    const cam = { x: 100, y: 200, scale: 2 };
    expect(shakeCamera(cam, 0, 1)).toBe(cam);
    const [dx, dy] = shake(0.8, 1.3);
    const moved = shakeCamera(cam, 0.8, 1.3);
    expect(moved.x).toBeCloseTo(100 + dx * 2);
    expect(moved.y).toBeCloseTo(200 + dy * 2);
    expect(moved.scale).toBe(2);
  });

  it("softens hits away from the centre of view to half", () => {
    expect(falloff(0, 0, 800)).toBe(1);
    expect(falloff(400, 0, 800)).toBeCloseTo(0.75);
    expect(falloff(5000, 0, 800)).toBe(0.5);
  });
});
