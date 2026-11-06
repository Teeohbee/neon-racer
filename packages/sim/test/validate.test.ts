import { describe, expect, it } from "vitest";
import { ovalPoints, type Point } from "../src/track";
import { describeProblem, randomTrackPoints, validateDrawing, type TrackProblem } from "../src/validate";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function polyline(corners: Point[], step = 20): Point[] {
  const out: Point[] = [];
  corners.forEach((a, i) => {
    const b = corners[(i + 1) % corners.length]!;
    const count = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < count; k++) out.push([a[0] + ((b[0] - a[0]) * k) / count, a[1] + ((b[1] - a[1]) * k) / count]);
  });
  return out;
}

const bigOval = ovalPoints(3200, 2000, 2400, 1400);

describe("validateDrawing", () => {
  it("accepts a big oval", () => {
    expect(validateDrawing(bigOval)).toEqual([]);
  });

  it("ignores small hand wobble", () => {
    const wobbly = ovalPoints(3200, 2000, 2400, 1400, 300).map(([x, y], i) => [x + (i % 2 ? 8 : -8), y + (i % 3 ? 5 : -5)] as Point);
    expect(validateDrawing(wobbly)).toEqual([]);
  });

  it("rejects a tiny loop as too short", () => {
    expect(validateDrawing(ovalPoints(3200, 2000, 600, 400))).toEqual(["too-short"]);
  });

  it("rejects a figure eight as overlapping", () => {
    const eight = Array.from({ length: 200 }, (_, i): Point => {
      const t = (i / 200) * Math.PI * 2;
      return [3200 + Math.cos(t) * 2400, 2000 + Math.sin(2 * t) * 1200];
    });
    expect(validateDrawing(eight)).toContain("overlapping");
  });

  it("rejects two parallel straights drawn too close together", () => {
    const hairpinLoop = polyline([[800, 1900], [5600, 1900], [5600, 2000], [800, 2000]]);
    expect(validateDrawing(hairpinLoop)).toContain("overlapping");
  });

  it("rounds off the corners of a big hand-drawn rectangle", () => {
    const square = polyline([[800, 800], [4800, 800], [4800, 3200], [800, 3200]]);
    expect(validateDrawing(square)).toEqual([]);
  });

  it("rejects a zigzag as too tight", () => {
    const zigzag: Point[] = [[800, 3200]];
    for (let x = 800; x <= 5600; x += 300) zigzag.push([x, x % 600 === 200 ? 600 : 1000]);
    zigzag.push([5600, 3200]);
    expect(validateDrawing(polyline(zigzag))).toContain("too-tight");
  });

  it("rejects a road that runs off the edge of the world", () => {
    expect(validateDrawing(ovalPoints(3200, 2000, 3150, 1400))).toEqual(["out-of-bounds"]);
    expect(validateDrawing(ovalPoints(3200, 2000, 2400, 1990))).toEqual(["out-of-bounds"]);
  });

  it("rejects a drawing with too few points", () => {
    expect(validateDrawing(ovalPoints(3200, 2000, 2400, 1400, 6))).toEqual(["too-few-points"]);
    expect(validateDrawing([])).toEqual(["too-few-points"]);
  });

  it("reports every problem it finds", () => {
    const offsetEight = Array.from({ length: 100 }, (_, i): Point => {
      const t = (i / 100) * Math.PI * 2;
      return [600 + Math.cos(t) * 1000, 400 + Math.sin(2 * t) * 500];
    });
    expect(validateDrawing(offsetEight)).toEqual(expect.arrayContaining(["overlapping", "out-of-bounds"]));
  });
});

describe("describeProblem", () => {
  it("gives friendly text for every problem", () => {
    const problems: TrackProblem[] = ["too-few-points", "too-short", "too-tight", "overlapping", "out-of-bounds"];
    const texts = problems.map(describeProblem);
    expect(new Set(texts).size).toBe(problems.length);
    texts.forEach((text, i) => expect(text).not.toBe(problems[i]));
  });
});

describe("randomTrackPoints", () => {
  it("always produces a valid track", () => {
    for (let seed = 1; seed <= 50; seed++) expect(validateDrawing(randomTrackPoints(mulberry32(seed))), `seed ${seed}`).toEqual([]);
  });

  it("is deterministic for a given rng", () => {
    expect(randomTrackPoints(mulberry32(42))).toEqual(randomTrackPoints(mulberry32(42)));
  });

  it("varies between seeds", () => {
    expect(randomTrackPoints(mulberry32(1))).not.toEqual(randomTrackPoints(mulberry32(2)));
  });
});

describe("human-drawn closures", () => {
  const loop = (n: number, from: number, to: number, offset = 0): [number, number][] =>
    Array.from({ length: n }, (_, i) => {
      const t = from + ((to - from) * i) / (n - 1);
      return [3200 + Math.cos(t) * (2000 + (i === 0 ? offset : 0)), 2000 + Math.sin(t) * 1200];
    });

  it("accepts a loop drawn past its starting point", () => {
    expect(validateDrawing(loop(140, 0, Math.PI * 2.25))).toEqual([]);
  });

  it("accepts a loop whose ends don't quite meet", () => {
    expect(validateDrawing(loop(120, 0.05, Math.PI * 2 - 0.05, 120))).toEqual([]);
  });
});
