import { describe, expect, it } from "vitest";
import { BOOST_TAIL, boostLevel, chordHalfWidth, flicker, glitchDensity, hash01, HOLOGRAM_MAX, hologramAlpha, hologramProgress, rowTear, seedOf } from "../src/render/fx-math";

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

describe("hologramProgress", () => {
  it("runs from 0 when dropped to 1 when armed", () => {
    expect(hologramProgress(10, 10.6, 0.6)).toBeCloseTo(0);
    expect(hologramProgress(10.3, 10.6, 0.6)).toBeCloseTo(0.5);
    expect(hologramProgress(10.6, 10.6, 0.6)).toBe(1);
    expect(hologramProgress(11, 10.6, 0.6)).toBe(1);
    expect(hologramProgress(9, 10.6, 0.6)).toBe(0);
  });
});

describe("hologramAlpha", () => {
  const samples = (progress: number) => Array.from({ length: 600 }, (_, i) => hologramAlpha(progress, i / 60, 7));

  it("builds towards the armed look without reaching it", () => {
    expect(mean(samples(1))).toBeGreaterThan(mean(samples(0.5)));
    expect(mean(samples(0.5))).toBeGreaterThan(mean(samples(0)));
    for (const p of [0, 0.5, 1]) expect(Math.max(...samples(p))).toBeLessThanOrEqual(HOLOGRAM_MAX);
  });

  it("flickers more early on than when nearly armed", () => {
    const dropouts = (p: number) => samples(p).filter((a, _, all) => a < Math.max(...all) * 0.5).length;
    expect(dropouts(0)).toBeGreaterThan(dropouts(1));
    expect(dropouts(1)).toBeGreaterThan(0);
  });
});

describe("chordHalfWidth", () => {
  it("follows a circle", () => {
    expect(chordHalfWidth("circle", 10, 0)).toBe(10);
    expect(chordHalfWidth("circle", 10, 6)).toBeCloseTo(8);
    expect(chordHalfWidth("circle", 10, 10)).toBe(0);
  });

  it("follows the flat-topped hazard octagon", () => {
    const apothem = 10 * Math.cos(Math.PI / 8);
    expect(chordHalfWidth("octagon", 10, 0)).toBeCloseTo(apothem);
    expect(chordHalfWidth("octagon", 10, apothem)).toBeCloseTo(apothem * Math.tan(Math.PI / 8));
    expect(chordHalfWidth("octagon", 10, -apothem)).toBeCloseTo(apothem * Math.tan(Math.PI / 8));
    expect(chordHalfWidth("octagon", 10, apothem + 0.1)).toBe(0);
  });
});

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

describe("glitchDensity", () => {
  it("keeps the front of the wall dense and thins out the wake", () => {
    expect(glitchDensity(0, 10)).toBeGreaterThan(0.85);
    expect(glitchDensity(1, 10)).toBeGreaterThan(0.85);
    for (let row = 2; row < 10; row++) expect(glitchDensity(row + 1, 10)).toBeLessThan(glitchDensity(row, 10));
    expect(glitchDensity(10, 10)).toBe(0);
  });
});

describe("rowTear", () => {
  it("tears only some rows, by at most two cells either way", () => {
    const tears = Array.from({ length: 400 }, (_, i) => rowTear(i % 10, Math.floor(i / 10), 14));
    const torn = tears.filter((v) => v !== 0);
    expect(torn.length).toBeGreaterThan(40);
    expect(torn.length).toBeLessThan(160);
    for (const v of tears) expect(Math.abs(v)).toBeLessThanOrEqual(28);
  });
});
