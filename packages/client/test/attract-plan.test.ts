import { describe, expect, it } from "vitest";
import { ATTRACT, attractShot } from "../src/shell/attract-plan";

describe("attractShot", () => {
  it("starts on the first track following the first car", () => {
    expect(attractShot(0, 3, 10)).toEqual({ round: 0, track: 3, focus: 0 });
  });

  it("cuts to the next car every shot", () => {
    expect(attractShot(ATTRACT.shotSeconds + 0.1, 0, 10).focus).toBe(1);
    expect(attractShot(ATTRACT.shotSeconds * 2 + 0.1, 0, 10).focus).toBe(2);
  });

  it("moves to the next track after a round and wraps past the last", () => {
    expect(attractShot(ATTRACT.trackSeconds, 9, 10)).toMatchObject({ round: 1, track: 0 });
    expect(attractShot(ATTRACT.trackSeconds * 2 + 1, 9, 10)).toMatchObject({ round: 2, track: 1 });
  });

  it("opens each new track on a different car", () => {
    const first = attractShot(0, 0, 10).focus;
    const second = attractShot(ATTRACT.trackSeconds, 0, 10).focus;
    expect(second).not.toBe(first);
  });

  it("keeps the focus within the field", () => {
    for (let t = 0; t < ATTRACT.trackSeconds * 5; t += 1.7) {
      const { focus } = attractShot(t, 0, 10, 3);
      expect(focus).toBeGreaterThanOrEqual(0);
      expect(focus).toBeLessThan(3);
    }
  });

  it("treats negative time as the start", () => {
    expect(attractShot(-5, 2, 10)).toEqual({ round: 0, track: 2, focus: 0 });
  });
});
