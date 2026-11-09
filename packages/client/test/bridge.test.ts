import { describe, expect, it } from "vitest";
import { buildTrack, ovalPoints } from "@neon/sim";
import { rampAlpha, runLength } from "../src/render/bridge";

describe("bridge deck", () => {
  it("fades in and out at the ends so it meets the road below", () => {
    expect(rampAlpha(0, 900)).toBe(0);
    expect(rampAlpha(450, 900)).toBe(1);
    expect(rampAlpha(900, 900)).toBe(0);
  });

  it("measures a run that wraps past the start line", () => {
    const track = buildTrack(ovalPoints(3200, 2000, 2000, 1200));
    expect(runLength(track, [track.length - 100, 300])).toBeCloseTo(400, 5);
  });
});
