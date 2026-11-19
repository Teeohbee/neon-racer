import { describe, expect, it } from "vitest";
import { CameraLead } from "../src/net/camera-lead";

const FRAME = 1 / 120;

describe("leading the camera with your car in Online play", () => {
  it("settles on the camera ahead while moving as smoothly as the snapshots", () => {
    const lead = new CameraLead();
    let drawn = { x: 0, y: 0, scale: 1 };
    for (let f = 0; f < 120; f++) drawn = lead.frame({ x: f * 5, y: 0, scale: 1.2 }, { x: f * 5 + 100, y: 40, scale: 1.2 }, FRAME);
    expect(drawn.x).toBeCloseTo(119 * 5 + 100, 0);
    expect(drawn.y).toBeCloseTo(40, 0);
    expect(drawn.scale).toBe(1.2);
  });

  it("doesn't step the screen when the camera ahead moves a tick at a time", () => {
    const lead = new CameraLead();
    let prev: number | null = null;
    const steps: number[] = [];
    for (let f = 0; f < 240; f++) {
      const sampled = { x: f * 4, y: 0, scale: 1 };
      // Moves on every other frame, 8 at a time: a 60 Hz tick drawn at 120 Hz.
      const ahead = { x: Math.floor(f / 2) * 8 + 80, y: 0, scale: 1 };
      const x = lead.frame(sampled, ahead, FRAME).x;
      if (prev !== null && f > 120) steps.push(x - prev);
      prev = x;
    }
    for (const step of steps) expect(step).toBeCloseTo(4, 0);
  });

  it("eases back to the snapshots' camera when there's nothing to run ahead of, instead of jumping", () => {
    const lead = new CameraLead();
    for (let f = 0; f < 120; f++) lead.frame({ x: 0, y: 0, scale: 1 }, { x: 100, y: 0, scale: 1 }, FRAME);
    const first = lead.frame({ x: 0, y: 0, scale: 1 }, null, FRAME);
    expect(first.x).toBeGreaterThan(90);
    for (let f = 0; f < 120; f++) lead.frame({ x: 0, y: 0, scale: 1 }, null, FRAME);
    expect(lead.frame({ x: 0, y: 0, scale: 1 }, null, FRAME).x).toBeLessThan(1);
  });

  it("starts each race from the snapshots' camera", () => {
    const lead = new CameraLead();
    for (let f = 0; f < 120; f++) lead.frame({ x: 0, y: 0, scale: 1 }, { x: 100, y: 0, scale: 1 }, FRAME);
    lead.reset();
    expect(lead.frame({ x: 0, y: 0, scale: 1 }, { x: 100, y: 0, scale: 1 }, FRAME).x).toBeLessThan(10);
  });
});
