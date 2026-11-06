import { describe, expect, it } from "vitest";
import { impactSwell, kickTarget, stepLevel, stepTarget, SWELL } from "../src/render/bloom-swell";

describe("bloom swell", () => {
  it("swells quickly towards the kick", () => {
    const target = kickTarget(0, 1);
    let level = 0;
    for (let n = 0; n < 6; n++) level = stepLevel(level, target, 1 / 60);
    expect(level).toBeGreaterThan(0.8);
  });

  it("settles back to nothing", () => {
    let target = kickTarget(0, 1);
    let level = 1;
    for (let n = 0; n < 240; n++) {
      level = stepLevel(level, target, 1 / 60);
      target = stepTarget(target, 1 / 60);
    }
    expect(target).toBe(0);
    expect(level).toBe(0);
  });

  it("halves over the release time constant", () => {
    expect(stepTarget(1, SWELL.release * Math.LN2)).toBeCloseTo(0.5);
  });

  it("keeps the biggest of overlapping kicks and ignores junk", () => {
    expect(kickTarget(0.8, 0.3)).toBe(0.8);
    expect(kickTarget(0.2, 2)).toBe(1);
    expect(kickTarget(0, Number.NaN)).toBe(0);
  });

  it("only swells for big impacts", () => {
    expect(impactSwell(0.4)).toBe(0);
    expect(impactSwell(0.9)).toBeGreaterThan(impactSwell(0.6));
    expect(impactSwell(1)).toBe(1);
  });
});
