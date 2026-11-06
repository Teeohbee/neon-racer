import { describe, expect, it } from "vitest";
import { BOOST_TAIL, boostLevel, flicker, hash01, seedOf } from "../src/render/fx-math";

const run = (level: number, on: boolean, seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) level = boostLevel(level, on, dt);
  return level;
};

describe("boostLevel", () => {
  it("reaches full within a tenth of a second on a pad", () => {
    expect(run(0, true, 0.1)).toBe(1);
  });

  it("holds a tail after leaving the pad, then dies out", () => {
    expect(run(1, false, BOOST_TAIL / 2)).toBeGreaterThan(0.3);
    expect(run(1, false, BOOST_TAIL + 0.05)).toBe(0);
  });

  it("stays within 0-1", () => {
    expect(boostLevel(1, true, 5)).toBe(1);
    expect(boostLevel(0, false, 5)).toBe(0);
  });
});

describe("hash01", () => {
  it("is deterministic and in [0, 1)", () => {
    for (let i = 0; i < 500; i++) {
      const v = hash01(i, i * 7, 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(hash01(i, i * 7, 3)).toBe(v);
    }
  });

  it("spreads neighbouring inputs", () => {
    const values = Array.from({ length: 1000 }, (_, i) => hash01(i, 1));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("flicker", () => {
  it("varies smoothly within [0, 1]", () => {
    const seed = seedOf("car-a");
    let prev = flicker(0, seed);
    for (let t = 0; t < 2; t += 1 / 240) {
      const v = flicker(t, seed);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(Math.abs(v - prev)).toBeLessThan(0.3);
      prev = v;
    }
  });

  it("differs between cars", () => {
    expect(flicker(0.5, seedOf("a"))).not.toBe(flicker(0.5, seedOf("b")));
  });
});
