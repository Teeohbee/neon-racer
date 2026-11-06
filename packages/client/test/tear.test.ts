import { describe, expect, it } from "vitest";
import { SWAP_AT, tearBands } from "../src/shell/tear";

const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

describe("tearBands", () => {
  it("keeps every band on screen without overlapping the next one", () => {
    for (const seed of [1, 7, 42, 9001]) {
      const bands = tearBands(seeded(seed));
      bands.forEach((band, i) => {
        expect(band.top).toBeGreaterThanOrEqual(0);
        expect(band.top + band.height).toBeLessThanOrEqual(100);
        if (i > 0) expect(band.top).toBeGreaterThanOrEqual(bands[i - 1]!.top + bands[i - 1]!.height);
      });
    }
  });

  it("shifts bands both ways within a small range", () => {
    const shifts = tearBands(seeded(3), 40).map((b) => b.shift);
    expect(shifts.some((s) => s < 0)).toBe(true);
    expect(shifts.some((s) => s > 0)).toBe(true);
    expect(Math.max(...shifts.map(Math.abs))).toBeLessThanOrEqual(14);
  });

  it("starts every band before the screens swap", () => {
    for (const band of tearBands(seeded(5), 20)) expect(band.delay).toBeLessThan(SWAP_AT);
  });

  it("stays in bounds at the extremes of the random source", () => {
    expect(tearBands(() => 0, 4)).toHaveLength(4);
    expect(tearBands(() => 0.999999, 4).every((b) => b.top + b.height <= 100)).toBe(true);
  });
});
